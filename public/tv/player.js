/*
 * Player das TVs.
 *
 * Escrito de proposito em JavaScript ES5 (sem framework, sem const/let/arrow/fetch/Promise):
 * as caixinhas de TV e tablets rodando Fully Kiosk costumam ter um Android System WebView
 * antigo, que ignora <script type="module"> e a sintaxe moderna do bundle do Angular --
 * sem erro nenhum, so tela preta. Aqui nao ha nada que um WebView antigo nao entenda.
 *
 * Abra com ?debug=1 para ver na propria tela o que esta acontecendo.
 */
(function () {
  var POLL_MS = 5 * 60 * 1000;        // recarrega a programacao do servidor
  var HEARTBEAT_MS = 25 * 1000;       // avisa o painel que a tela esta viva
  var TRANSITION_MS = 700;            // crossfade entre um item e outro
  var VIDEO_LOAD_TIMEOUT_MS = 20000;  // video que nem carrega: pula pro proximo
  var VIDEO_END_SLACK_MS = 3000;      // folga caso o evento 'ended' nunca chegue
  var EMPTY_RETRY_MS = 5000;

  var stage = document.getElementById('stage');
  var msgEl = document.getElementById('msg');
  var diagEl = document.getElementById('diag');
  var debug = location.search.indexOf('debug=1') !== -1;

  var items = [];
  var frame = null;       // moldura da tela (null = sem moldura)
  var frameData = null;   // clima, dolar e acoes que vieram junto com a programacao
  var idx = 0;
  var seq = 0;
  var advanceTimer = null;
  var bootTime = new Date().getTime();
  var screenKey = detectScreen();

  // ---------- diagnostico ----------
  var diagHtml = '';
  function diag(text, isError) {
    if (!debug && !isError) return;
    diagHtml += (isError ? '<span class="err">' + text + '</span>' : text) + '<br>';
    if (debug) {
      diagEl.innerHTML = diagHtml;
      diagEl.style.display = 'block';
    }
  }
  window.onerror = function (m, src, line) {
    diag('ERRO: ' + m + ' (' + src + ':' + line + ')', true);
  };
  diag('UA: ' + navigator.userAgent);
  diag('URL: ' + location.href);

  // ---------- helpers ----------
  function detectScreen() {
    var fromPath = location.pathname.match(/^\/(\d+)\/?$/);
    if (fromPath) return fromPath[1];
    var fromQuery = location.search.match(/[?&]screen=([^&]*)/);
    return fromQuery ? decodeURIComponent(fromQuery[1]) : '';
  }

  function message(text) {
    msgEl.innerHTML = text ? '<span>' + text + '</span>' : '';
    msgEl.className = text ? 'on' : '';
  }

  function request(method, url, body, onOk, onFail) {
    var r;
    try {
      r = new XMLHttpRequest();
      r.open(method, url, true);
      if (body) r.setRequestHeader('Content-Type', 'application/json');
      r.onreadystatechange = function () {
        if (r.readyState !== 4) return;
        if (r.status >= 200 && r.status < 300) {
          if (onOk) onOk(r.responseText);
        } else if (onFail) {
          onFail(r.status);
        }
      };
      r.send(body || null);
    } catch (e) {
      diag('falha na requisicao ' + url + ': ' + e, true);
      if (onFail) onFail(0);
    }
  }

  function parse(text) {
    try { return JSON.parse(text); } catch (e) { return null; }
  }

  // ---------- programacao ----------
  function cacheKey() { return 'playlist_' + screenKey; }

  function saveCache(list) {
    try {
      localStorage.setItem(cacheKey(), JSON.stringify(list));
      localStorage.setItem('frame_' + screenKey, JSON.stringify({ frame: frame, frameData: frameData }));
    } catch (e) { /* sem storage */ }
  }

  function loadFrameCache() {
    try {
      var saved = JSON.parse(localStorage.getItem('frame_' + screenKey));
      if (saved) { frame = saved.frame; frameData = saved.frameData; }
    } catch (e) { /* sem storage */ }
  }

  function loadCache() {
    try {
      var raw = localStorage.getItem(cacheKey());
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function fetchPlaylist(done) {
    request('GET', '/api/play/' + encodeURIComponent(screenKey), null, function (text) {
      var data = parse(text);
      // Resposta 2xx valida, mesmo vazia, substitui a lista e o cache: lista esvaziada
      // no painel mostra "Sem conteudo programado". Falha de rede/servidor (onFail) ou
      // corpo invalido nao mexem em nada e a TV segue repetindo a ultima lista valida.
      if (data && Object.prototype.toString.call(data.items) === '[object Array]') {
        items = data.items;
        frame = data.frame || null;
        frameData = data.frameData || null;
        saveCache(items);
        diag('programacao: ' + items.length + ' itens');
      }
      if (done) done();
    }, function (status) {
      var cached = loadCache();
      if (cached && cached.length && !items.length) {
        items = cached;
        loadFrameCache();
        diag('offline: usando programacao salva (' + items.length + ' itens)');
      } else {
        diag('falha ao buscar programacao (HTTP ' + status + ')', !items.length);
      }
      if (done) done();
    });
  }

  function impression(item) {
    request('POST', '/api/impression', JSON.stringify({ screenId: screenKey, mediaId: item.mediaId }));
  }

  // ---------- exibicao ----------
  function buildLayer(item) {
    var layer = document.createElement('div');
    layer.className = 'layer';
    var media;
    if (item.type === 'video') {
      media = document.createElement('video');
      // Atributo E propriedade: alguns WebViews so respeitam um dos dois.
      media.setAttribute('playsinline', '');
      media.setAttribute('webkit-playsinline', '');
      media.setAttribute('muted', '');
      media.setAttribute('autoplay', '');
      media.muted = true;
      media.autoplay = true;
      media.preload = 'auto';
      media.controls = false;
    } else {
      media = document.createElement('img');
    }
    media.src = item.url;
    // A camada precisa estar na pagina para a moldura medir o tamanho: playNext chama mountFrame.
    if (!(frame && item.own && window.PontoFrame)) layer.appendChild(media);
    return { node: layer, media: media, framed: !media.parentNode };
  }

  function dropOtherLayers(keep) {
    var kids = stage.childNodes;
    for (var i = kids.length - 1; i >= 0; i--) {
      if (kids[i] !== keep) stage.removeChild(kids[i]);
    }
  }

  function playNext() {
    clearTimeout(advanceTimer);

    if (!items.length) {
      dropOtherLayers(null);
      message('Sem conte&uacute;do programado');
      advanceTimer = setTimeout(function () { fetchPlaylist(playNext); }, EMPTY_RETRY_MS);
      return;
    }
    message('');

    var item = items[idx % items.length];
    idx++;
    var mySeq = ++seq;
    impression(item);

    var layer = buildLayer(item);
    stage.appendChild(layer.node);
    if (layer.framed) window.PontoFrame.mount(layer.node, frame, frameData, layer.media);
    // proximo tick: dispara o fade-in (precisa de um reflow entre inserir e trocar a classe)
    setTimeout(function () { layer.node.className = 'layer active'; }, 30);
    // terminada a transicao, descarta as camadas antigas que ficaram por baixo
    setTimeout(function () { dropOtherLayers(layer.node); }, TRANSITION_MS + 100);

    function advance() { if (mySeq === seq) playNext(); }
    function retrySoon() {
      if (mySeq !== seq) return;
      clearTimeout(advanceTimer);
      advanceTimer = setTimeout(playNext, 500);
    }

    layer.media.onerror = function () {
      diag('falha ao exibir ' + item.url, true);
      retrySoon();
    };

    if (item.type === 'video') {
      layer.media.onended = advance;
      // Webview de kiosk costuma ignorar o atributo autoplay: so toca com play() explicito.
      var kick = function () {
        if (mySeq !== seq) return;
        layer.media.muted = true;
        try {
          var p = layer.media.play();
          if (p && p['catch']) p['catch'](function (err) { diag('play() bloqueado: ' + err, true); });
        } catch (e) {
          diag('play() falhou: ' + e, true);
        }
        var d = layer.media.duration;
        if (d && isFinite(d) && d > 0) {
          clearTimeout(advanceTimer);
          advanceTimer = setTimeout(advance, d * 1000 + VIDEO_END_SLACK_MS);
        }
      };
      layer.media.onloadedmetadata = kick;
      layer.media.oncanplay = kick;
      // Rede/codec travou: nao fica preso num frame preto pra sempre.
      advanceTimer = setTimeout(advance, VIDEO_LOAD_TIMEOUT_MS);
    } else {
      advanceTimer = setTimeout(playNext, (Number(item.duration) || 10) * 1000);
    }
  }

  // ---------- moldura: relogio, troca de acao e tamanho da tela ----------
  function refitFrames() {
    var roots = stage.querySelectorAll('.pf-root');
    for (var i = 0; i < roots.length; i++) {
      window.PontoFrame.fit(roots[i], stage.offsetWidth, stage.offsetHeight);
    }
  }
  if (window.PontoFrame) {
    setInterval(function () { window.PontoFrame.updateAll(stage, frameData); }, 1000);
    window.addEventListener('resize', refitFrames, false);
  }

  // ---------- heartbeat ----------
  function heartbeat() {
    request('POST', '/api/heartbeat/' + encodeURIComponent(screenKey), null, function (text) {
      var data = parse(text);
      // O painel pediu reload desta tela depois que este player carregou.
      if (!data || !data.reloadAt || data.reloadAt <= bootTime) return;
      // location.reload() derruba a tela cheia, e o navegador so devolve com um gesto do
      // usuario. Em tela cheia, recarrega so a programacao e recomeca do primeiro item.
      if (isFullscreen()) {
        bootTime = data.reloadAt;
        fetchPlaylist(function () { idx = 0; playNext(); });
      } else {
        location.reload();
      }
    });
  }

  function isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  }

  // ---------- tela cheia ----------
  // Nenhuma pagina consegue esconder a barra de endereco do navegador por conta propria.
  // O que da pra fazer e (1) apontar um manifest com display:fullscreen, pra quando a tela
  // for adicionada a tela inicial do Android, e (2) pedir tela cheia no primeiro toque.
  // No Fully Kiosk nada disso e necessario -- ele ja abre sem barra nenhuma.
  function useManifest() {
    var link = document.getElementById('manifest');
    if (link && /^\d+$/.test(screenKey)) link.href = '/' + screenKey + '/manifest.webmanifest';
  }

  function goFullscreen() {
    if (isFullscreen()) return;
    var el = document.documentElement;
    var req = el.requestFullscreen || el.webkitRequestFullscreen ||
              el.webkitRequestFullScreen || el.mozRequestFullScreen || el.msRequestFullscreen;
    if (!req) return;
    try {
      var r = req.call(el);
      if (r && r['catch']) r['catch'](function () { /* precisa de gesto do usuario */ });
    } catch (e) { /* navegador sem suporte */ }
    try {
      if (screen.orientation && screen.orientation.lock) {
        var q = screen.orientation.lock('landscape');
        if (q && q['catch']) q['catch'](function () {});
      }
    } catch (e) { /* TV box costuma nao permitir travar orientacao */ }
  }

  // Continua escutando depois do primeiro toque: se alguem sair da tela cheia, o proximo
  // toque coloca de volta.
  document.addEventListener('click', goFullscreen, false);
  document.addEventListener('touchend', goFullscreen, false);

  // ---------- inicio ----------
  if (!screenKey) {
    message('Abra esta tela pelo link do painel (ex: /1)');
    return;
  }
  useManifest();
  fetchPlaylist(playNext);
  setInterval(function () { fetchPlaylist(); }, POLL_MS);
  heartbeat();
  setInterval(heartbeat, HEARTBEAT_MS);
})();
