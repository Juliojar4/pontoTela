/* PontoTela — site institucional
 * ---------------------------------------------------------------
 * Site voltado pro DONO DO ESTABELECIMENTO: convencer o comércio a
 * receber uma tela. Sem preço, sem inventário de telas, sem lead form.
 * Contato único: WhatsApp abaixo.
 * --------------------------------------------------------------- */
const CONFIG = {
  // Número do WhatsApp, só dígitos, com 55 + DDD.
  whatsapp: '5515996273799',

  slideDuration: 5500 // ms por peça no mockup de TV
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
      console.warn('[PontoTela] CONFIG.whatsapp inválido. Edite public/site/main.js.');
    }
  });
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
