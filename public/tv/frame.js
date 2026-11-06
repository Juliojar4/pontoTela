/*
 * Moldura informativa: catalogo (modelos e blocos) e desenho. Um arquivo so para os tres lados:
 * o player e a previa da /minhatela desenham com ele, e o servidor valida com o mesmo catalogo.
 * Em ES5 e sem flex gap/grid/inset, pelo mesmo motivo do player.js (WebView antigo de TV box).
 * Dado de usuario (cidade, url da logo) so entra por textContent/src, nunca por innerHTML.
 */
(function (root) {
  var WIDTH = 1920;
  var HEIGHT = 1080;
  var STOCK_MS = 5000;
  var TICKER_MS = 80000; // igual a animacao .pf-run do frame.css

  var BLOCKS = {
    clock: { name: 'Horário' },
    weather: { name: 'Clima' },
    dollar: { name: 'Dólar' },
    stocks: { name: 'Ações' },
    logo: { name: 'Logo' }
  };
  // Tickers que a brapi libera sem token.
  var STOCKS = ['PETR4', 'VALE3', 'ITUB4', 'MGLU3'];
  // prefer: onde cada bloco cai ao trocar de modelo. Cada zona aguenta os preferidos dela,
  // entao a troca nunca perde bloco.
  var LAYOUTS = {
    coluna: {
      name: 'Coluna',
      zones: [{ id: 'side', name: 'Coluna da direita', max: 3 }, { id: 'band', name: 'Faixa de baixo', max: 4 }, { id: 'corner', name: 'Canto', max: 1 }],
      prefer: { clock: 'side', weather: 'side', dollar: 'side', stocks: 'band', logo: 'corner' }
    },
    rodape: {
      name: 'Rodapé',
      zones: [{ id: 'bar', name: 'Rodapé', max: 5 }],
      prefer: { logo: 'bar', clock: 'bar', weather: 'bar', dollar: 'bar', stocks: 'bar' }
    },
    cantos: {
      name: 'Cantos',
      zones: [{ id: 'tl', name: 'Canto superior esquerdo', max: 2 }, { id: 'tr', name: 'Canto superior direito', max: 2 }, { id: 'bl', name: 'Canto inferior esquerdo', max: 2 }, { id: 'br', name: 'Canto inferior direito', max: 2 }],
      prefer: { logo: 'tl', clock: 'tr', stocks: 'bl', weather: 'br', dollar: 'br' }
    }
  };

  function zoneIds(layoutId) {
    var ids = [];
    for (var i = 0; i < LAYOUTS[layoutId].zones.length; i++) ids.push(LAYOUTS[layoutId].zones[i].id);
    return ids;
  }

  function emptyZones(layoutId) {
    var zones = {};
    var ids = zoneIds(layoutId);
    for (var i = 0; i < ids.length; i++) zones[ids[i]] = [];
    return zones;
  }

  function allBlocks(frame) {
    var out = [];
    var ids = zoneIds(frame.layout);
    for (var i = 0; i < ids.length; i++) out = out.concat(frame.zones[ids[i]] || []);
    return out;
  }

  function reflow(blocks, layoutId) {
    var zones = emptyZones(layoutId);
    for (var i = 0; i < blocks.length; i++) zones[LAYOUTS[layoutId].prefer[blocks[i].type]].push(blocks[i]);
    return zones;
  }

  function newBlock(type) {
    return type === 'stocks' ? { type: type, symbols: STOCKS.slice() } : { type: type };
  }

  function defaultFrame() {
    var order = ['logo', 'clock', 'weather', 'dollar', 'stocks'];
    var blocks = [];
    for (var i = 0; i < order.length; i++) blocks.push(newBlock(order[i]));
    return { enabled: false, layout: 'rodape', bg: '#0e6a3a', text: '#ffffff', zones: reflow(blocks, 'rodape') };
  }

  // ---------- formato ----------
  var WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  var MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function money(v, bare) { return (bare ? '' : 'R$ ') + v.toFixed(2).replace('.', ','); }
  // Direita da Coluna: sem espaco para o "R$"; o rotulo do bloco ja diz o que e o valor.
  function isNarrow(block) { return /pf-z-(side|corner)/.test(block.parentNode.className); }
  function change(pct) { return (pct < 0 ? '▼ −' : '▲ +') + Math.abs(pct).toFixed(2).replace('.', ',') + '%'; }

  var SKY = {
    sun: '<circle cx="32" cy="32" r="12"/><path d="M32 6v7M32 51v7M6 32h7M51 32h7M14 14l5 5M50 14l-5 5M14 50l5-5M50 50l-5-5"/>',
    partly: '<circle cx="24" cy="24" r="10"/><path d="M24 4v5M4 24h5M8 8l4 4M40 8l-4 4"/><path class="s" d="M26 54h24a10 10 0 0 0 1-20 14 14 0 0 0-27-1 10.500 10.500 0 0 0 2 21z"/>',
    cloud: '<path class="s" d="M18 50h30a12 12 0 0 0 1-24 17 17 0 0 0-33-1 12.500 12.500 0 0 0 2 25z"/>',
    rain: '<path class="s" d="M18 38h30a12 12 0 0 0 1-24 17 17 0 0 0-33-1 12.500 12.500 0 0 0 2 25z"/><path d="M22 46l-3 10M34 46l-3 10M46 46l-3 10"/>',
    storm: '<path class="s" d="M18 36h30a12 12 0 0 0 1-24 17 17 0 0 0-33-1 12.500 12.500 0 0 0 2 25z"/><path d="M35 40l-8 11h9l-6 10"/>'
  };
  function sky(code) {
    if (code <= 1) return ['sun', 'Céu limpo'];
    if (code === 2) return ['partly', 'Parcialmente nublado'];
    if (code === 3) return ['cloud', 'Nublado'];
    if (code === 45 || code === 48) return ['cloud', 'Neblina'];
    if (code >= 95) return ['storm', 'Tempestade'];
    if (code >= 71 && code <= 77 || code === 85 || code === 86) return ['cloud', 'Neve'];
    return ['rain', 'Chuva'];
  }

  // ---------- desenho ----------
  function el(cls, text) {
    var e = document.createElement('div');
    e.className = cls;
    if (text) e.textContent = text;
    return e;
  }
  function setText(e, text) { if (e && e.textContent !== text) e.textContent = text; }
  function part(block, cls) { return block.querySelector('.' + cls); }

  function buildBlock(b, frame, ticker) {
    var e = el('pf-block pf-b-' + b.type);
    e.setAttribute('data-type', b.type);
    if (b.type === 'logo') {
      if (frame.logoUrl) {
        var img = document.createElement('img');
        img.className = 'pf-logo';
        img.alt = '';
        img.src = frame.logoUrl;
        e.appendChild(img);
      } else {
        e.appendChild(el('pf-lab pf-nologo', 'Sua logo'));
      }
      return e;
    }
    if (b.type === 'stocks' && ticker) {
      e.className += ' pf-ticker';
      e.appendChild(el('pf-run'));
    } else {
      e.appendChild(el('pf-lab'));
      var line = el('pf-line');
      line.appendChild(el('pf-num'));
      if (b.type === 'weather') line.appendChild(el('pf-sky'));
      e.appendChild(line);
      if (b.type === 'dollar' || b.type === 'stocks') e.appendChild(el('pf-var'));
      if (b.type === 'weather') e.appendChild(el('pf-note'));
    }
    if (b.type === 'weather' && b.city) e.setAttribute('data-city', b.city.name);
    if (b.type === 'stocks') e.setAttribute('data-symbols', (b.symbols || []).join(','));
    return e;
  }

  function quotes(block, data) {
    var syms = (block.getAttribute('data-symbols') || '').split(',');
    var out = [];
    for (var i = 0; i < syms.length; i++) {
      var q = data && data.stocks && data.stocks[syms[i]];
      if (q) out.push({ symbol: syms[i], price: q.price, pct: q.pct });
    }
    return out;
  }

  function updateTicker(block, list) {
    var sig = '';
    for (var i = 0; i < list.length; i++) sig += list[i].symbol + list[i].price + '|';
    if (block.getAttribute('data-sig') === sig) return;
    block.setAttribute('data-sig', sig);
    var run = part(block, 'pf-run');
    run.textContent = '';
    if (!list.length) return;
    // A faixa anda metade de si mesma e emenda sem salto: cada metade precisa passar da largura da tela.
    var total = 2 * list.length * Math.ceil(12 / list.length);
    for (var c = 0; c < total; c++) {
      var q = list[c % list.length];
      var st = el('pf-st');
      st.appendChild(el('pf-lab', q.symbol));
      st.appendChild(el('pf-num', money(q.price)));
      st.appendChild(el('pf-var', change(q.pct)));
      run.appendChild(st);
    }
    // Cada imagem monta uma moldura nova: o atraso pelo relogio faz a faixa continuar de onde estava.
    var delay = -(new Date().getTime() % TICKER_MS) + 'ms';
    run.style.webkitAnimationDelay = delay;
    run.style.animationDelay = delay;
  }

  // Devolve se o bloco tem o que mostrar. Sem dado: na TV ele some; na previa aparece com travessao.
  function updateBlock(block, data, preview, now) {
    var type = block.getAttribute('data-type');
    if (type === 'logo') return preview || !!block.querySelector('img');
    if (type === 'clock') {
      setText(part(block, 'pf-lab'), WEEKDAYS[now.getDay()] + ', ' + now.getDate() + ' ' + MONTHS[now.getMonth()]);
      setText(part(block, 'pf-num'), pad(now.getHours()) + ':' + pad(now.getMinutes()));
      return true;
    }
    if (type === 'weather') {
      var city = block.getAttribute('data-city');
      var w = data && data.weather;
      var has = !!(city && w);
      setText(part(block, 'pf-lab'), city || 'Escolha a cidade');
      setText(part(block, 'pf-num'), has ? Math.round(w.temp) + '°' : '—');
      var s = has ? sky(w.code) : null;
      setText(part(block, 'pf-note'), s ? s[1] : '');
      var icon = part(block, 'pf-sky');
      var name = s ? s[0] : '';
      if (icon.getAttribute('data-sky') !== name) {
        icon.setAttribute('data-sky', name);
        icon.innerHTML = s ? '<svg viewBox="0 0 64 64" aria-hidden="true">' + SKY[name] + '</svg>' : '';
      }
      return has || preview;
    }
    if (type === 'dollar') {
      var d = data && data.dollar;
      setText(part(block, 'pf-lab'), 'Dólar');
      setText(part(block, 'pf-num'), d ? money(d.price, isNarrow(block)) : '—');
      setText(part(block, 'pf-var'), d ? change(d.pct) : '');
      return !!d || preview;
    }
    var list = quotes(block, data);
    if (part(block, 'pf-run')) {
      updateTicker(block, list);
      return list.length > 0 || preview;
    }
    // Pelo relogio, nao por contador: as camadas do crossfade mostram a mesma acao.
    var q = list.length ? list[Math.floor(now.getTime() / STOCK_MS) % list.length] : null;
    setText(part(block, 'pf-lab'), q ? q.symbol : 'Ações');
    setText(part(block, 'pf-num'), q ? money(q.price, isNarrow(block)) : '—');
    setText(part(block, 'pf-var'), q ? change(q.pct) : '');
    return !!q || preview;
  }

  function update(rootEl, data, now) {
    var preview = rootEl.getAttribute('data-preview') === '1';
    var zones = rootEl.querySelectorAll('.pf-zone');
    for (var z = 0; z < zones.length; z++) {
      var blocks = zones[z].querySelectorAll('.pf-block');
      var visible = 0;
      for (var b = 0; b < blocks.length; b++) {
        var show = updateBlock(blocks[b], data, preview, now);
        blocks[b].style.display = show ? '' : 'none';
        if (show) visible++;
      }
      // Canto sem nada para mostrar nao cobre a foto.
      zones[z].style.display = visible || zones[z].getAttribute('data-keep') ? '' : 'none';
    }
  }

  function updateAll(scope, data, now) {
    var roots = scope.querySelectorAll('.pf-root');
    for (var i = 0; i < roots.length; i++) update(roots[i], data, now || new Date());
  }

  function fit(rootEl, w, h) {
    var s = Math.min(w / WIDTH, h / HEIGHT);
    var t = 'translate(' + (w - WIDTH * s) / 2 + 'px,' + (h - HEIGHT * s) / 2 + 'px) scale(' + s + ')';
    rootEl.style.webkitTransform = t;
    rootEl.style.transform = t;
  }

  // Desenha a moldura em container, com photo (<img> ou nada) na area da foto.
  function mount(container, frame, data, photo, preview) {
    var rootEl = el('pf-root pf-' + frame.layout);
    rootEl.style.backgroundColor = frame.bg;
    rootEl.style.color = frame.text;
    if (preview) rootEl.setAttribute('data-preview', '1');
    var area = el('pf-photo');
    if (photo) { photo.className = 'pf-art'; area.appendChild(photo); }
    rootEl.appendChild(area);
    var zones = LAYOUTS[frame.layout].zones;
    for (var i = 0; i < zones.length; i++) {
      var blocks = frame.zones[zones[i].id] || [];
      var zone = el('pf-zone pf-z-' + zones[i].id);
      if (frame.layout === 'cantos') zone.style.backgroundColor = frame.bg;
      else zone.setAttribute('data-keep', '1');
      var ticker = zones[i].id === 'band' && blocks.length === 1;
      for (var j = 0; j < blocks.length; j++) zone.appendChild(buildBlock(blocks[j], frame, ticker));
      rootEl.appendChild(zone);
    }
    container.appendChild(rootEl);
    update(rootEl, data, new Date());
    fit(rootEl, container.offsetWidth, container.offsetHeight);
    return rootEl;
  }

  var api = {
    BLOCKS: BLOCKS, STOCKS: STOCKS, LAYOUTS: LAYOUTS,
    defaultFrame: defaultFrame, reflow: reflow, allBlocks: allBlocks, newBlock: newBlock, zoneIds: zoneIds,
    mount: mount, updateAll: updateAll, fit: fit
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PontoFrame = api;
})(this);
