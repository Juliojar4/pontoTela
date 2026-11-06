// Editor da moldura: rascunho local com previa ao vivo; a TV so muda ao salvar.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var F = window.PontoFrame;
  var screenId = null;
  var draft = null;   // moldura em edicao
  var logoUrl = null;
  var data = {};      // clima, dolar e acoes da previa
  var photoUrl = null;
  var dirty = false;
  var insertZone = null;
  var gen = 0;        // sobe a cada troca de tela: resposta de uma tela anterior e descartada
  var cityGen = 0;
  var cityResults = null; // resultado aberto da busca de cidade
  var cityQuery = '';

  var ICONS = {
    grip: '<svg viewBox="0 0 18 18" aria-hidden="true"><circle cx="6" cy="3.5" r="1.6"/><circle cx="12" cy="3.5" r="1.6"/><circle cx="6" cy="9" r="1.6"/><circle cx="12" cy="9" r="1.6"/><circle cx="6" cy="14.5" r="1.6"/><circle cx="12" cy="14.5" r="1.6"/></svg>',
    up: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
    down: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6"/></svg>',
    trash: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13M10 11v5M14 11v5"/></svg>'
  };
  // Desenhos fixos dos modelos: area clara = foto, escura = moldura.
  var SCHEMES = {
    coluna: '<rect width="32" height="18" fill="#0e6a3a"/><rect width="29.600" height="15.300" fill="#cfe6d8"/>',
    rodape: '<rect width="32" height="18" fill="#0e6a3a"/><rect width="32" height="15" fill="#cfe6d8"/>',
    cantos: '<rect width="32" height="18" fill="#cfe6d8"/><rect width="7" height="3" fill="#0e6a3a"/><rect x="25" width="7" height="3" fill="#0e6a3a"/><rect y="15" width="7" height="3" fill="#0e6a3a"/><rect x="25" y="15" width="7" height="3" fill="#0e6a3a"/>'
  };

  function say(el, msg) { el.textContent = msg || ''; el.hidden = !msg; }

  function api(method, path, body) {
    var opts = { method: method, credentials: 'same-origin', headers: {} };
    if (body instanceof FormData) opts.body = body;
    else if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    return fetch(path, opts).then(function (r) {
      if (r.status === 401) { location.href = '/entrar'; return new Promise(function () {}); }
      return r.json().catch(function () { return {}; }).then(function (b) { return { status: r.status, body: b }; });
    });
  }
  function base() { return '/api/my/screens/' + encodeURIComponent(screenId) + '/frame'; }

  function element(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }
  function iconButton(cls, icon, label, fn) {
    var b = element('button', cls);
    b.type = 'button'; b.innerHTML = ICONS[icon]; b.setAttribute('aria-label', label);
    b.addEventListener('click', fn);
    return b;
  }

  // ---------- Abas ----------
  function showTab(moldura) {
    $('painel').hidden = moldura;
    $('moldura').hidden = !moldura;
    $('aba-imagens').setAttribute('aria-selected', String(!moldura));
    $('aba-moldura').setAttribute('aria-selected', String(moldura));
    if (!moldura) return;
    renderPreview();
    loadPhoto(gen).then(renderPreview); // a imagem pode ter mudado na outra aba
  }
  $('aba-imagens').addEventListener('click', function () { showTab(false); });
  $('aba-moldura').addEventListener('click', function () { showTab(true); });

  // ---------- Carregar ----------
  function currentCity() {
    var w = F.allBlocks(draft).filter(function (b) { return b.type === 'weather'; })[0];
    return w && w.city;
  }
  function loadData() {
    var city = draft && currentCity();
    var mine = ++cityGen;
    var q = city ? '?lat=' + city.lat + '&lon=' + city.lon : '';
    return api('GET', '/api/my/frame-data' + q).then(function (r) {
      if (mine !== cityGen || r.status !== 200) return;
      data = r.body;
      renderPreview();
    }).catch(function () { /* a previa fica com travessao; salvar continua funcionando */ });
  }

  // A previa usa a primeira imagem do dono; anuncio de terceiro nao aparece no editor.
  function loadPhoto(g) {
    return api('GET', '/api/my/screens/' + encodeURIComponent(screenId)).then(function (r) {
      if (g !== gen) return;
      var own = (r.body.items || []).filter(function (i) { return i.kind === 'own'; })[0];
      photoUrl = own ? own.url : null;
    }).catch(function () { /* fica com a imagem que ja estava */ });
  }

  window.addEventListener('minhatela:tela', function (e) {
    if (e.detail.id === screenId) return; // o minhatela.js recarrega a lista a cada alteracao
    var g = ++gen;
    var discarded = dirty;
    screenId = e.detail.id;
    draft = null; dirty = false; cityResults = null;
    $('m-editor').hidden = true; // sem moldura carregada nao ha o que editar
    $('abas').hidden = false;
    say($('m-erro'), ''); say($('m-ok'), discarded ? 'As alterações não salvas da outra tela foram descartadas.' : '');
    Promise.all([api('GET', base()), loadPhoto(g)]).then(function (rs) {
      if (g !== gen) return;
      if (rs[0].status !== 200) { say($('m-erro'), rs[0].body.error || 'Não foi possível carregar a moldura.'); return; }
      applyServer(rs[0].body);
      $('m-editor').hidden = false;
      render();
      return loadData();
    }).catch(function () { if (g === gen) say($('m-erro'), 'Falha de conexão. Recarregue a página.'); });
  });

  function applyServer(body) {
    logoUrl = body.logoUrl;
    delete body.logoUrl;
    draft = body;
  }

  window.addEventListener('beforeunload', function (e) {
    if (dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  // ---------- Previa ----------
  function renderPreview() {
    var box = $('m-previa');
    if (!draft || !box.offsetWidth) return;
    box.textContent = '';
    var photo = null;
    if (photoUrl) { photo = document.createElement('img'); photo.alt = ''; photo.src = photoUrl; }
    var shown = Object.assign({}, draft, { logoUrl: logoUrl });
    var root = F.mount(box, shown, data, photo, true);
    if (!photoUrl) root.querySelector('.pf-photo').appendChild(element('div', 'm-vazia', 'Sua imagem aparece aqui'));
  }
  setInterval(function () { F.updateAll($('m-previa'), data); }, 1000);
  window.addEventListener('resize', renderPreview);

  // ---------- Editor ----------
  function changed() {
    dirty = true;
    say($('m-ok'), '');
    render();
  }

  function zoneOf(type) {
    var ids = F.zoneIds(draft.layout);
    for (var i = 0; i < ids.length; i++) {
      var list = draft.zones[ids[i]];
      for (var j = 0; j < list.length; j++) if (list[j].type === type) return { id: ids[i], at: j, list: list, zoneIx: i };
    }
    return null;
  }
  function zoneMax(id) {
    return F.LAYOUTS[draft.layout].zones.filter(function (z) { return z.id === id; })[0].max;
  }
  // Destino de ↑/↓: dentro da area ou, na ponta, a area vizinha que tenha vaga.
  function stepTarget(type, dir) {
    var pos = zoneOf(type);
    var next = pos.at + dir;
    if (next >= 0 && next < pos.list.length) return { zone: pos.id, at: next };
    var ids = F.zoneIds(draft.layout);
    for (var i = pos.zoneIx + dir; i >= 0 && i < ids.length; i += dir) {
      if (draft.zones[ids[i]].length < zoneMax(ids[i])) return { zone: ids[i], at: dir > 0 ? 0 : draft.zones[ids[i]].length };
    }
    return null;
  }
  function moveBlock(type, zone, at) {
    var pos = zoneOf(type);
    var block = pos.list.splice(pos.at, 1)[0];
    draft.zones[zone].splice(at, 0, block);
  }
  function focusAfter(selector) {
    var b = document.querySelector(selector);
    if (b && !b.disabled) b.focus();
  }

  function weatherSettings(block) {
    var box = element('div', 'm-ajuste');
    box.appendChild(element('p', 'm-dica', block.city ? 'Cidade: ' + block.city.name : 'Escolha a cidade para mostrar o clima na TV.'));
    var row = element('div', 'm-busca');
    var input = element('input');
    input.type = 'search'; input.placeholder = 'Nome da cidade'; input.value = cityQuery;
    input.setAttribute('aria-label', 'Buscar cidade');
    var go = element('button', 'm-peq', 'Buscar');
    go.type = 'button';
    function search() {
      cityQuery = input.value;
      if (cityQuery.trim().length < 2) return;
      var g = gen;
      api('GET', '/api/my/cities?q=' + encodeURIComponent(cityQuery)).then(function (r) {
        if (g !== gen) return;
        if (r.status !== 200) { say($('m-erro'), r.body.error || 'A busca de cidades falhou.'); return; }
        say($('m-erro'), '');
        cityResults = r.body;
        render();
        focusAfter('.m-achado');
      }).catch(function () { say($('m-erro'), 'Falha de conexão. Tente de novo.'); });
    }
    go.addEventListener('click', search);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); search(); } });
    row.append(input, go);
    box.appendChild(row);
    if (cityResults) {
      var list = element('div', 'm-achados');
      if (!cityResults.length) list.appendChild(element('p', 'm-dica', 'Nenhuma cidade encontrada.'));
      cityResults.forEach(function (c) {
        var b = element('button', 'm-achado', c.region ? c.name + ', ' + c.region : c.name);
        b.type = 'button';
        b.addEventListener('click', function () {
          block.city = { name: c.name, lat: c.lat, lon: c.lon };
          cityResults = null; cityQuery = '';
          changed();
          loadData();
        });
        list.appendChild(b);
      });
      box.appendChild(list);
    }
    return box;
  }

  function stocksSettings(block) {
    var box = element('div', 'm-ajuste m-marcas');
    F.STOCKS.forEach(function (sym) {
      var label = element('label');
      var c = element('input');
      c.type = 'checkbox'; c.checked = block.symbols.indexOf(sym) >= 0; c.dataset.sym = sym;
      // Ao menos uma: desmarcar a ultima deixaria o bloco sem nada.
      c.disabled = c.checked && block.symbols.length === 1;
      c.addEventListener('change', function () {
        block.symbols = F.STOCKS.filter(function (s) { return s === sym ? c.checked : block.symbols.indexOf(s) >= 0; });
        changed();
        focusAfter('input[data-sym="' + sym + '"]');
      });
      label.append(c, document.createTextNode(sym));
      box.appendChild(label);
    });
    return box;
  }

  function logoSettings() {
    var box = element('div', 'm-ajuste m-logo-linha');
    if (logoUrl) {
      var img = element('img', 'm-logo-img');
      img.src = logoUrl; img.alt = 'Sua logo';
      box.appendChild(img);
    }
    var send = element('button', 'm-peq', logoUrl ? 'Trocar logo' : 'Enviar logo');
    send.type = 'button';
    send.addEventListener('click', function () { $('m-logo').click(); });
    box.appendChild(send);
    if (logoUrl) {
      var del = element('button', 'm-peq', 'Remover logo');
      del.type = 'button';
      del.addEventListener('click', function () { logoRequest('DELETE'); });
      box.appendChild(del);
    }
    return box;
  }

  // A logo vale na hora (o arquivo nao espera o Salvar); o rascunho continua como esta.
  function logoRequest(method, form) {
    var g = gen;
    say($('m-erro'), '');
    api(method, base() + '/logo', form).then(function (r) {
      if (g !== gen) return;
      if (r.status !== 200) { say($('m-erro'), r.body.error || 'Não foi possível salvar a logo.'); return; }
      logoUrl = r.body.logoUrl;
      render();
    }).catch(function () { say($('m-erro'), 'Falha de conexão. Tente de novo.'); });
  }
  $('m-logo').addEventListener('change', function () {
    var f = $('m-logo').files[0];
    $('m-logo').value = '';
    if (!f) return;
    var form = new FormData();
    form.append('file', f);
    logoRequest('POST', form);
  });

  function blockCard(block) {
    var type = block.type;
    var name = F.BLOCKS[type].name;
    var li = element('li', 'm-bloco');
    li.dataset.type = type;
    var top = element('div', 'm-bloco-topo');
    var handle = iconButton('handle', 'grip', 'Arrastar ' + name, function () {});
    handle.addEventListener('pointerdown', function (e) { startDrag(e, li, type); });
    function step(dir, cls) {
      return function () {
        var t = stepTarget(type, dir);
        if (!t) return;
        moveBlock(type, t.zone, t.at);
        changed();
        focusAfter('[data-type="' + type + '"] .' + cls);
      };
    }
    var up = iconButton('m-bt sobe', 'up', 'Mover ' + name + ' para cima', step(-1, 'sobe'));
    var down = iconButton('m-bt desce', 'down', 'Mover ' + name + ' para baixo', step(1, 'desce'));
    up.disabled = !stepTarget(type, -1);
    down.disabled = !stepTarget(type, 1);
    var del = iconButton('m-bt tirar', 'trash', 'Tirar ' + name, function () {
      var pos = zoneOf(type);
      pos.list.splice(pos.at, 1);
      changed();
      focusAfter('[data-zone="' + pos.id + '"] .m-add');
    });
    top.append(handle, element('span', 'm-bloco-nome', name), up, down, del);
    li.appendChild(top);
    if (type === 'weather') li.appendChild(weatherSettings(block));
    if (type === 'stocks') li.appendChild(stocksSettings(block));
    if (type === 'logo') li.appendChild(logoSettings());
    return li;
  }

  function availableTypes() {
    var used = F.allBlocks(draft).map(function (b) { return b.type; });
    return Object.keys(F.BLOCKS).filter(function (t) { return used.indexOf(t) < 0; });
  }

  function renderZones() {
    var box = $('m-zonas');
    box.textContent = '';
    var free = availableTypes();
    F.LAYOUTS[draft.layout].zones.forEach(function (z) {
      var list = draft.zones[z.id];
      var zone = element('div', 'm-zona');
      zone.dataset.zone = z.id;
      var head = element('div', 'm-zona-topo');
      head.append(element('span', '', z.name), element('small', '', list.length + ' de ' + z.max));
      var ul = element('ul', 'm-blocos');
      list.forEach(function (b) { ul.appendChild(blockCard(b)); });
      var add = element('button', 'm-add', list.length >= z.max ? 'Área cheia' : free.length ? '+ Adicionar bloco' : 'Todos os blocos já estão em uso');
      add.type = 'button';
      add.disabled = list.length >= z.max || !free.length;
      add.addEventListener('click', function () { openInserter(z.id); });
      zone.append(head, ul, add);
      box.appendChild(zone);
    });
  }

  function renderModels() {
    var box = $('m-modelos');
    box.textContent = '';
    Object.keys(F.LAYOUTS).forEach(function (id) {
      var label = element('label', 'm-modelo');
      var input = element('input');
      input.type = 'radio'; input.name = 'm-modelo'; input.value = id; input.checked = draft.layout === id;
      input.addEventListener('change', function () {
        draft.zones = F.reflow(F.allBlocks(draft), id);
        draft.layout = id;
        changed();
        focusAfter('input[name="m-modelo"][value="' + id + '"]');
      });
      var pic = element('span');
      pic.innerHTML = '<svg viewBox="0 0 32 18" aria-hidden="true">' + SCHEMES[id] + '</svg>';
      label.append(input, pic, document.createTextNode(F.LAYOUTS[id].name));
      box.appendChild(label);
    });
  }

  function luminance(hex) {
    var c = [1, 3, 5].map(function (i) {
      var v = parseInt(hex.substr(i, 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contrast(a, b) {
    var x = luminance(a), y = luminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }

  function render() {
    if (!draft) return;
    $('m-liga').checked = draft.enabled;
    $('m-fundo').value = draft.bg;
    $('m-texto').value = draft.text;
    $('m-contraste').hidden = contrast(draft.bg, draft.text) >= 3;
    $('m-salvar').disabled = !dirty;
    renderModels();
    renderZones();
    renderPreview();
  }

  $('m-liga').addEventListener('change', function () { draft.enabled = $('m-liga').checked; changed(); });
  // input (nao change): a previa acompanha enquanto a cor e escolhida, sem refazer os blocos abertos.
  function colorInput(key, id) {
    $(id).addEventListener('input', function () {
      draft[key] = $(id).value;
      dirty = true;
      $('m-salvar').disabled = false;
      say($('m-ok'), '');
      $('m-contraste').hidden = contrast(draft.bg, draft.text) >= 3;
      renderPreview();
    });
  }
  colorInput('bg', 'm-fundo');
  colorInput('text', 'm-texto');

  // ---------- Inserir bloco ----------
  function openInserter(zone) {
    insertZone = zone;
    var list = $('m-inserir-lista');
    list.textContent = '';
    availableTypes().forEach(function (type) {
      var b = element('button', 'm-opcao', F.BLOCKS[type].name);
      b.type = 'button';
      b.addEventListener('click', function () {
        $('m-inserir').close();
        draft.zones[insertZone].push(F.newBlock(type));
        changed();
        focusAfter('[data-type="' + type + '"] .handle');
      });
      list.appendChild(b);
    });
    $('m-inserir').showModal();
  }
  $('m-inserir-fechar').addEventListener('click', function () { $('m-inserir').close(); });

  // ---------- Arrastar entre areas ----------
  // Pointer Events (funciona no toque). Uma linha mostra onde o bloco vai cair; o rascunho so muda ao soltar.
  // ponytail: sem rolagem automatica durante o arraste; os botoes ↑↓ cobrem listas maiores que a tela.
  function startDrag(e, li, type) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    var handle = e.currentTarget;
    var source = zoneOf(type).id;
    var line = element('li', 'm-linha-solta');
    var target = null;
    handle.setPointerCapture(e.pointerId);
    li.classList.add('dragging');

    function clearMarks() {
      document.querySelectorAll('.m-zona').forEach(function (z) { z.classList.remove('alvo', 'cheia-alvo'); });
    }
    function onMove(ev) {
      clearMarks();
      target = null;
      if (line.parentNode) line.parentNode.removeChild(line);
      var zone = null;
      document.querySelectorAll('.m-zona').forEach(function (z) {
        var r = z.getBoundingClientRect();
        if (ev.clientY >= r.top && ev.clientY <= r.bottom) zone = z;
      });
      if (!zone) return;
      var id = zone.dataset.zone;
      if (id !== source && draft.zones[id].length >= zoneMax(id)) { zone.classList.add('cheia-alvo'); return; }
      zone.classList.add('alvo');
      var cards = Array.prototype.filter.call(zone.querySelectorAll('.m-bloco'), function (c) { return c !== li; });
      var at = cards.length;
      for (var i = 0; i < cards.length; i++) {
        var r = cards[i].getBoundingClientRect();
        if (ev.clientY < r.top + r.height / 2) { at = i; break; }
      }
      zone.querySelector('.m-blocos').insertBefore(line, cards[at] || null);
      target = { zone: id, at: at };
    }
    function done(ev) {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', done);
      handle.removeEventListener('pointercancel', done);
      clearMarks();
      if (line.parentNode) line.parentNode.removeChild(line);
      li.classList.remove('dragging');
      if (ev.type !== 'pointerup' || !target) return;
      var pos = zoneOf(type);
      if (target.zone === pos.id && target.at === pos.at) return;
      moveBlock(type, target.zone, target.at);
      changed();
      focusAfter('[data-type="' + type + '"] .handle');
    }
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', done);
    handle.addEventListener('pointercancel', done);
  }

  // ---------- Salvar ----------
  $('m-salvar').addEventListener('click', function () {
    var g = gen;
    $('m-salvar').disabled = true;
    say($('m-erro'), '');
    api('PUT', base(), draft).then(function (r) {
      if (g !== gen) return;
      if (r.status !== 200) {
        say($('m-erro'), r.body.error || 'Não foi possível salvar.');
        $('m-salvar').disabled = false;
        return;
      }
      applyServer(r.body);
      dirty = false;
      say($('m-ok'), 'Moldura salva.');
      render();
    }).catch(function () {
      if (g !== gen) return;
      say($('m-erro'), 'Falha de conexão. Tente de novo.');
      $('m-salvar').disabled = false;
    });
  });
})();
