(function () {
  var $ = function (id) { return document.getElementById(id); };
  var ERROS = {
    'nao-cadastrado': 'Este Google não tem acesso. Fale com o administrador.',
    'google': 'Não foi possível entrar com o Google. Tente de novo.'
  };

  function mostrarErro(msg) { $('erro').textContent = msg; $('erro').hidden = !msg; }

  var erro = new URLSearchParams(location.search).get('erro');
  if (erro) mostrarErro(ERROS[erro] || ERROS.google);

  fetch('/api/auth/state', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (st) {
    if (st.step === 'done') { location.href = st.redirect; return; }
    $(st.step).hidden = false;
    if (st.step === 'enroll') { $('qr').src = st.qr; $('secret').textContent = st.secret; }
    if (st.step !== 'google') { $('form').hidden = false; $('codigo').focus(); }
  }).catch(function () { mostrarErro('Não foi possível carregar. Tente de novo.'); });

  $('form').addEventListener('submit', function (e) {
    e.preventDefault();
    mostrarErro('');
    fetch('/api/auth/verify', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: $('codigo').value })
    }).then(function (r) {
      return r.json().then(function (b) { return { status: r.status, body: b }; });
    }).then(function (r) {
      if (r.status === 200) { location.href = r.body.redirect; return; }
      mostrarErro(r.status === 429 ? 'Muitas tentativas. Espere alguns minutos e tente de novo.' : 'Código inválido. Confira o app e tente de novo.');
      $('codigo').value = '';
      $('codigo').focus();
    }).catch(function () { mostrarErro('Falha de conexão. Tente de novo.'); });
  });
})();
