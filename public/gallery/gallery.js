// Galeria publica da tela: o QR do ponto abre /g/<codigo> e quem escaneia navega
// pelas midias no proprio ritmo (setas, swipe ou teclado). Sem avanco automatico.
(function () {
  var stage = document.getElementById('stage');
  var nameEl = document.getElementById('screen-name');
  var counterEl = document.getElementById('counter');
  var advertiserEl = document.getElementById('advertiser');
  var prevBtn = document.getElementById('prev');
  var nextBtn = document.getElementById('next');

  var items = [];
  var index = 0;

  var code = (location.pathname.match(/\/g\/(\d+)/) || [])[1];

  function message(text) {
    stage.innerHTML = '';
    var div = document.createElement('div');
    div.className = 'msg';
    div.textContent = text;
    stage.appendChild(div);
    counterEl.textContent = '';
    advertiserEl.textContent = '';
    prevBtn.disabled = true;
    nextBtn.disabled = true;
  }

  function render() {
    var item = items[index];
    stage.innerHTML = '';

    var el;
    if (item.type === 'video') {
      el = document.createElement('video');
      el.src = item.url;
      el.controls = true;
      el.playsInline = true;
      el.setAttribute('playsinline', '');
      el.preload = 'metadata';
    } else {
      el = document.createElement('img');
      el.src = item.url;
      el.alt = item.advertiser || 'Mídia ' + (index + 1);
    }
    stage.appendChild(el);

    counterEl.textContent = index + 1 + '/' + items.length;
    advertiserEl.textContent = item.advertiser || '';
    prevBtn.disabled = index === 0;
    nextBtn.disabled = index === items.length - 1;
    document.title = (item.advertiser || 'Mídia ' + (index + 1)) + ' — galeria';
  }

  function go(delta) {
    var next = index + delta;
    if (next < 0 || next >= items.length) return;
    index = next;
    render();
  }

  prevBtn.addEventListener('click', function () { go(-1); });
  nextBtn.addEventListener('click', function () { go(1); });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft') go(-1);
    if (e.key === 'ArrowRight') go(1);
  });

  // Swipe lateral. Ignora gestos verticais pra nao brigar com o scroll/controles do video.
  var startX = 0, startY = 0, tracking = false;
  stage.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1) { tracking = false; return; }
    tracking = true;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });
  stage.addEventListener('touchend', function (e) {
    if (!tracking) return;
    tracking = false;
    var touch = e.changedTouches[0];
    var dx = touch.clientX - startX;
    var dy = touch.clientY - startY;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;
    go(dx < 0 ? 1 : -1);
  }, { passive: true });

  if (!code) {
    nameEl.textContent = 'Galeria';
    message('Link inválido. Escaneie o QR code da tela novamente.');
    return;
  }

  fetch('/api/gallery/' + code)
    .then(function (r) {
      if (!r.ok) throw new Error('tela nao encontrada');
      return r.json();
    })
    .then(function (data) {
      nameEl.textContent = data.name + (data.location ? ' · ' + data.location : '');
      items = data.items || [];
      if (!items.length) {
        message('Esta tela ainda não tem mídias no ar.');
        return;
      }
      render();
    })
    .catch(function () {
      nameEl.textContent = 'Galeria';
      message('Não encontramos esta tela.');
    });
})();
