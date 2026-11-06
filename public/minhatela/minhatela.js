(function () {
  var $ = function (id) { return document.getElementById(id); };
  var screens = [];
  var screenId = null;
  var state = null;
  var busy = false;
  var gen = 0; // sobe a cada troca de tela: resposta de uma tela anterior e descartada

  function say(el, msg) { el.textContent = msg || ''; el.hidden = !msg; }
  function notice(msg) { say($('aviso'), msg); say($('erro'), ''); }
  function fail(msg) { say($('erro'), msg); say($('aviso'), ''); }

  // Devolve { status, body }; 401 manda para o login.
  function api(method, path, body) {
    var opts = { method: method, credentials: 'same-origin', headers: {} };
    if (body instanceof FormData) opts.body = body;
    else if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    return fetch(path, opts).then(function (r) {
      if (r.status === 401) { location.href = '/entrar'; return new Promise(function () {}); }
      return r.json().catch(function () { return {}; }).then(function (b) { return { status: r.status, body: b }; });
    });
  }

  function base() { return '/api/my/screens/' + encodeURIComponent(screenId); }

  function load() {
    var g = gen;
    return api('GET', base()).then(function (r) {
      if (g !== gen) return;
      if (r.status === 200) render(r.body);
      else fail(r.body.error || 'Não foi possível carregar.');
    });
  }

  // Escrita: mostra o estado devolvido; em erro, avisa e busca o estado do servidor.
  // reloadOn: status que significam "a lista mudou" (aviso fixo, em vez da mensagem do servidor).
  function write(method, path, body, reloadOn, focusKey) {
    if (busy) return Promise.resolve();
    busy = true;
    var g = gen;
    return api(method, path, body).then(function (r) {
      if (g !== gen) return;
      if (r.status === 200) { say($('erro'), ''); say($('aviso'), ''); render(r.body, focusKey); return; }
      if (reloadOn.indexOf(r.status) >= 0) notice('A lista mudou. Atualizamos para você.');
      else fail(r.body.error || 'Algo deu errado. Tente de novo.');
      return load();
    }).catch(function () { if (g !== gen) return; fail('Falha de conexão. Tente de novo.'); return load().catch(function () {}); })
      .then(function () { if (g !== gen) return; busy = false; $('add').disabled = !state || state.used >= state.limit; });
  }

  function thumb(it) {
    var el;
    if (it.kind === 'ad' && it.type === 'video') {
      el = document.createElement('video');
      el.src = it.url + '#t=0.1';
      el.preload = 'metadata'; el.muted = true; el.playsInline = true;
      el.setAttribute('aria-label', 'Vídeo do anúncio');
    } else {
      el = document.createElement('img');
      el.src = it.url;
      el.alt = it.kind === 'own' ? it.originalName : 'Imagem do anúncio';
      el.loading = 'lazy';
    }
    el.className = 'thumb';
    return el;
  }

  // Icones fixos do codigo (nenhum dado do usuario passa por aqui).
  var ICONS = {
    grip: '<svg viewBox="0 0 18 18" aria-hidden="true"><circle cx="6" cy="3.5" r="1.6"/><circle cx="12" cy="3.5" r="1.6"/><circle cx="6" cy="9" r="1.6"/><circle cx="12" cy="9" r="1.6"/><circle cx="6" cy="14.5" r="1.6"/><circle cx="12" cy="14.5" r="1.6"/></svg>',
    up: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
    down: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6"/></svg>',
    trash: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13M10 11v5M14 11v5"/></svg>',
    lock: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>'
  };

  function button(cls, icon, label, fn) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = cls; b.innerHTML = ICONS[icon];
    if (label) b.setAttribute('aria-label', label);
    b.addEventListener('click', fn);
    return b;
  }

  function row(it, i, n) {
    var li = document.createElement('li');
    li.className = it.kind === 'own' ? 'row' : 'row ad';
    li.dataset.id = it.itemId;
    var handle = button('handle', 'grip', 'Arrastar para reordenar', function () {});
    handle.addEventListener('pointerdown', function (e) { startDrag(e, li); });
    var info = document.createElement('div');
    info.className = 'info';
    if (it.kind === 'own') {
      var name = document.createElement('span');
      name.className = 'name';
      name.textContent = it.originalName;
      var ctrl = document.createElement('div');
      ctrl.className = 'ctrl';
      var sel = document.createElement('select');
      sel.setAttribute('aria-label', 'Tempo na tela de ' + it.originalName);
      for (var s = 3; s <= 7; s++) {
        var o = document.createElement('option');
        o.value = s; o.textContent = s + ' s';
        sel.appendChild(o);
      }
      sel.value = it.duration;
      sel.addEventListener('change', function () {
        write('PATCH', base() + '/items/' + it.itemId, { duration: Number(sel.value) }, [404]);
      });
      var del = button('del', 'trash', 'Excluir ' + it.originalName, function () {
        if (confirm('Excluir esta imagem?')) write('DELETE', base() + '/items/' + it.itemId, null, [404]);
      });
      ctrl.append(sel, del);
      info.append(name, ctrl);
    } else {
      var lock = document.createElement('span');
      lock.className = 'lock';
      lock.innerHTML = ICONS.lock + 'Anúncio';
      info.append(lock);
    }
    var tools = document.createElement('div');
    tools.className = 'tools';
    var up = button('up', 'up', 'Mover para cima', function () { move(i, i - 1, 'up'); });
    var down = button('down', 'down', 'Mover para baixo', function () { move(i, i + 1, 'down'); });
    up.disabled = i === 0; down.disabled = i === n - 1;
    tools.append(up, down);
    li.append(handle, thumb(it), info, tools);
    return li;
  }

  function render(st, focusKey) {
    state = st;
    var cur = screens.filter(function (s) { return s.id === screenId; })[0];
    $('nome').textContent = cur ? cur.name : 'Minha tela';
    $('contagem').textContent = st.used + ' de ' + st.limit + ' imagens suas';
    var vagas = $('vagas');
    vagas.textContent = '';
    vagas.hidden = false;
    for (var v = 0; v < st.limit; v++) {
      var vaga = document.createElement('i');
      if (v < st.used) vaga.className = 'on';
      vagas.appendChild(vaga);
    }
    $('semnada').hidden = st.items.length > 0;
    var ul = $('itens');
    ul.textContent = '';
    st.items.forEach(function (it, i) { ul.appendChild(row(it, i, st.items.length)); });
    $('add').disabled = st.used >= st.limit;
    if (focusKey) {
      var b = ul.querySelector('[data-id="' + focusKey.id + '"] .' + focusKey.dir);
      if (b && b.disabled) b = ul.querySelector('[data-id="' + focusKey.id + '"] .' + (focusKey.dir === 'up' ? 'down' : 'up'));
      if (b) b.focus();
    }
  }

  function sendOrder(ids, focusKey) {
    return write('PUT', base() + '/order', { version: state.version, itemIds: ids }, [409, 400, 404], focusKey);
  }

  function move(from, to, dir) {
    if (busy || to < 0 || to >= state.items.length) return;
    var ids = state.items.map(function (i) { return i.itemId; });
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    sendOrder(ids, { id: state.items[from].itemId, dir: dir });
  }

  // Arrastar pelo ☰ com Pointer Events: a linha acompanha o dedo e as outras abrem espaço;
  // a ordem so e enviada ao soltar. ponytail: a lista pode passar da tela e nao ha rolagem automatica durante o arraste; os botoes ↑↓ cobrem esse caso.
  function startDrag(e, li) {
    if (busy || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    var handle = e.currentTarget;
    var rows = Array.prototype.slice.call($('itens').children);
    var from = rows.indexOf(li);
    var rects = rows.map(function (r) { return r.getBoundingClientRect(); });
    var step = rects[from].height + 8;
    var startY = e.clientY, to = from;
    handle.setPointerCapture(e.pointerId);
    li.classList.add('dragging');
    rows.forEach(function (r) { if (r !== li) r.classList.add('shifting'); });

    function onMove(ev) {
      var dy = ev.clientY - startY;
      li.style.transform = 'translateY(' + dy + 'px)';
      var c = rects[from].top + rects[from].height / 2 + dy;
      to = 0;
      rects.forEach(function (r, j) {
        if (Math.abs(r.top + r.height / 2 - c) < Math.abs(rects[to].top + rects[to].height / 2 - c)) to = j;
      });
      rows.forEach(function (r, j) {
        if (r === li) return;
        var shift = 0;
        if (from < to && j > from && j <= to) shift = -step;
        if (from > to && j >= to && j < from) shift = step;
        r.style.transform = shift ? 'translateY(' + shift + 'px)' : '';
      });
    }
    function done(ev) {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', done);
      handle.removeEventListener('pointercancel', done);
      rows.forEach(function (r) { r.style.transform = ''; r.classList.remove('shifting', 'dragging'); });
      if (ev.type === 'pointerup' && to !== from) {
        var ids = state.items.map(function (i) { return i.itemId; });
        ids.splice(to, 0, ids.splice(from, 1)[0]);
        sendOrder(ids);
      }
    }
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', done);
    handle.addEventListener('pointercancel', done);
  }

  $('add').addEventListener('click', function () { $('arquivo').click(); });
  $('arquivo').addEventListener('change', function () {
    var f = $('arquivo').files[0];
    $('arquivo').value = '';
    if (!f) return;
    if (busy) { fail('Ainda salvando a alteração anterior. Escolha a imagem de novo em instantes.'); return; }
    var fd = new FormData();
    fd.append('file', f);
    $('add').disabled = true;
    notice('Enviando…');
    // 409 no envio e o limite de 6 (a mensagem do servidor vale), entao so recarrega.
    write('POST', base() + '/images', fd, []);
  });
  $('sair').addEventListener('click', function () {
    api('POST', '/api/logout').then(function () { location.href = '/entrar'; });
  });
  $('picker').addEventListener('change', function () {
    screenId = $('picker').value;
    gen++; busy = false;
    say($('aviso'), ''); say($('erro'), '');
    load();
  });

  api('GET', '/api/my/screens').then(function (r) {
    if (r.status !== 200) return fail(r.body.error || 'Não foi possível carregar.');
    screens = r.body;
    if (!screens.length) { $('vazio').hidden = false; $('nome').textContent = 'PontoTela'; return; }
    screenId = screens[0].id;
    if (screens.length > 1) {
      screens.forEach(function (s) {
        var o = document.createElement('option');
        o.value = s.id; o.textContent = s.name;
        $('picker').appendChild(o);
      });
      $('picker').hidden = false;
    }
    $('painel').hidden = false;
    return load();
  }).catch(function () { fail('Falha de conexão. Recarregue a página.'); });
})();
