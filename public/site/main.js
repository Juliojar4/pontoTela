/* PontoTela — site institucional
 * ---------------------------------------------------------------
 * TUDO QUE PRECISA SER PREENCHIDO ESTÁ NESTE BLOCO CONFIG.
 * Os [[PREENCHER: ...]] que aparecem no index.html são texto puro —
 * procure por "PREENCHER" no HTML pra achar todos.
 * --------------------------------------------------------------- */
const CONFIG = {
  // Número do WhatsApp comercial, só dígitos, com 55 + DDD. Ex.: '5515999998888'
  whatsapp: '55XXXXXXXXXXX',

  // Números reais da rede. Deixe null enquanto não tiver o dado confirmado —
  // o site mostra um marcador de "preencher" em vez de inventar número.
  stats: {
    telas:  null,   // ex.: 3
    pontos: null,   // ex.: 3
    horas:  null    // ex.: 300  (horas de tela por semana somando todos os pontos)
  },

  // Números do relatório de EXEMPLO da seção "prova de entrega".
  // São ilustrativos e estão rotulados como tal na página.
  reportDemo: { rep1: 4751, rep2: 3, rep3: 31 },

  slideDuration: 5500 // ms por anúncio no mockup de TV
};

/* ---------------- WhatsApp ---------------- */
(function whatsapp() {
  const raw = CONFIG.whatsapp || '';
  const configured = /^\d{12,13}$/.test(raw);

  document.querySelectorAll('[data-wa]').forEach(el => {
    const msg = el.getAttribute('data-wa') || '';
    if (configured) {
      el.setAttribute('href', `https://wa.me/${raw}?text=${encodeURIComponent(msg)}`);
      el.setAttribute('target', '_blank');
      el.setAttribute('rel', 'noopener');
    } else {
      el.setAttribute('href', '#contato');
      el.setAttribute('title', 'Número de WhatsApp ainda não configurado (CONFIG.whatsapp em main.js)');
    }
  });

  if (!configured) {
    const warn = document.getElementById('setup-warning');
    if (warn) warn.hidden = false;
    console.warn('[PontoTela] CONFIG.whatsapp ainda está com o placeholder. Edite public/site/main.js.');
  }
})();

/* ---------------- Mockup de TV ---------------- */
(function tvLoop() {
  const slides = Array.from(document.querySelectorAll('[data-slide]'));
  const bar = document.getElementById('tv-progress');
  if (slides.length < 2) return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let i = 0;

  function show(next) {
    slides[i].classList.remove('is-active');
    i = next;
    slides[i].classList.add('is-active');
    if (bar && !reduced) {
      bar.style.transition = 'none';
      bar.style.width = '0';
      // força reflow pra reiniciar a barra a cada slide
      void bar.offsetWidth;
      bar.style.transition = `width ${CONFIG.slideDuration}ms linear`;
      bar.style.width = '100%';
    }
  }

  show(0);
  let timer = setInterval(() => show((i + 1) % slides.length), CONFIG.slideDuration);

  // não gasta ciclo com a aba em segundo plano
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearInterval(timer);
    } else {
      timer = setInterval(() => show((i + 1) % slides.length), CONFIG.slideDuration);
    }
  });

  const clock = document.getElementById('tv-clock');
  if (clock) {
    const tick = () => {
      const d = new Date();
      clock.textContent = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    };
    tick();
    setInterval(tick, 30000);
  }
})();

/* ---------------- Scroll reveal ---------------- */
(function reveal() {
  const items = document.querySelectorAll('[data-reveal]');
  if (!('IntersectionObserver' in window)) {
    items.forEach(el => el.classList.add('is-in'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry, n) => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      setTimeout(() => el.classList.add('is-in'), n * 70);
      io.unobserve(el);
    });
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });
  items.forEach(el => io.observe(el));

  // Rede de segurança: se por qualquer motivo o observer não disparar,
  // o conteúdo aparece mesmo assim. Site institucional não pode ficar invisível.
  setTimeout(() => items.forEach(el => el.classList.add('is-in')), 4000);

  // barras do gráfico do relatório
  const report = document.querySelector('.report');
  if (report) {
    const io2 = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { report.classList.add('is-in'); io2.disconnect(); }
    }, { threshold: 0.35 });
    io2.observe(report);
  }
})();

/* ---------------- Contadores ---------------- */
(function counters() {
  const values = Object.assign({}, CONFIG.stats, CONFIG.reportDemo);
  const nodes = document.querySelectorAll('[data-count]');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const labels = {
    telas: 'telas ativas', pontos: 'pontos', horas: 'horas/semana'
  };

  function animate(el, target) {
    if (reduced) { el.textContent = target.toLocaleString('pt-BR'); return; }
    const dur = 1100, t0 = performance.now();
    function frame(now) {
      const p = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased).toLocaleString('pt-BR');
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  nodes.forEach(el => {
    const key = el.getAttribute('data-count');
    const val = values[key];

    // Sem dado confirmado: marcador explícito, nunca um número inventado.
    if (typeof val !== 'number') {
      el.innerHTML = `<span class="fill">[[PREENCHER: ${labels[key] || key}]]</span>`;
      return;
    }

    if (!('IntersectionObserver' in window)) { el.textContent = val.toLocaleString('pt-BR'); return; }
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { animate(el, val); io.disconnect(); }
    }, { threshold: 0.6 });
    io.observe(el);
  });
})();

/* ---------------- Topbar + botão flutuante ---------------- */
(function chrome() {
  const bar = document.getElementById('topbar');
  const float = document.querySelector('.wa-float');
  const hero = document.querySelector('.hero');

  const onScroll = () => {
    const y = window.scrollY;
    if (bar) bar.classList.toggle('is-stuck', y > 12);
    if (float && hero) float.classList.toggle('is-on', y > hero.offsetHeight * 0.7);
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
})();

/* ---------------- FAQ: só um aberto por vez ---------------- */
document.querySelectorAll('.faq-item').forEach(item => {
  item.addEventListener('toggle', () => {
    if (!item.open) return;
    document.querySelectorAll('.faq-item[open]').forEach(other => {
      if (other !== item) other.open = false;
    });
  });
});

/* ---------------- Ano no rodapé ---------------- */
const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = String(new Date().getFullYear());
