// Moldura informativa no servidor: valida o que o dono manda e busca clima, dolar e acoes.
const { LAYOUTS, BLOCKS, STOCKS, zoneIds } = require('../public/tv/frame.js');

const HEX = /^#[0-9a-f]{6}$/i;

function validCity(c) {
  return c && typeof c === 'object' && typeof c.name === 'string' && c.name.trim() && c.name.length <= 80
    && Number.isFinite(c.lat) && Math.abs(c.lat) <= 90 && Number.isFinite(c.lon) && Math.abs(c.lon) <= 180;
}

// Reconstroi a moldura so com campos conhecidos. Devolve { frame } ou { error }.
function validateFrame(input) {
  const x = input && typeof input === 'object' ? input : {};
  if (typeof x.enabled !== 'boolean') return { error: 'enabled deve ser verdadeiro ou falso' };
  const layout = Object.hasOwn(LAYOUTS, x.layout) ? LAYOUTS[x.layout] : null;
  if (!layout) return { error: 'modelo de moldura invalido' };
  if (!HEX.test(x.bg) || !HEX.test(x.text)) return { error: 'cor invalida' };
  if (!x.zones || typeof x.zones !== 'object') return { error: 'zones obrigatorio' };
  const seen = new Set();
  const zones = {};
  for (const name of Object.keys(x.zones)) if (!zoneIds(x.layout).includes(name)) return { error: 'zona invalida' };
  for (const zone of layout.zones) {
    const list = x.zones[zone.id] ?? [];
    if (!Array.isArray(list) || list.length > zone.max) return { error: 'blocos demais em ' + zone.name };
    zones[zone.id] = [];
    for (const b of list) {
      if (!b || !Object.hasOwn(BLOCKS, b.type)) return { error: 'bloco invalido' };
      if (seen.has(b.type)) return { error: 'bloco repetido' };
      seen.add(b.type);
      const block = { type: b.type };
      if (b.type === 'weather' && b.city != null) {
        if (!validCity(b.city)) return { error: 'cidade invalida' };
        block.city = { name: b.city.name.trim(), lat: b.city.lat, lon: b.city.lon };
      }
      if (b.type === 'stocks') {
        if (!Array.isArray(b.symbols) || !b.symbols.length || !b.symbols.every(s => STOCKS.includes(s))) return { error: 'escolha ao menos uma acao' };
        block.symbols = STOCKS.filter(s => b.symbols.includes(s));
      }
      zones[zone.id].push(block);
    }
  }
  return { frame: { enabled: x.enabled, layout: x.layout, bg: x.bg.toLowerCase(), text: x.text.toLowerCase(), zones } };
}

// ---------- Dados de fora, com cache ----------
const TTL = { weather: 15 * 60 * 1000, dollar: 5 * 60 * 1000, stocks: 5 * 60 * 1000 };
const RETRY_MS = 60 * 1000;
const cache = new Map(); // chave -> { value, at, pending }

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(url + ' respondeu ' + res.status);
  return res.json();
}
function need(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) throw new Error('resposta sem numero');
  return v;
}

async function loadWeather(lat, lon) {
  const j = await getJson(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code`);
  return { temp: need(j.current.temperature_2m), code: need(j.current.weather_code) };
}
async function loadDollar() {
  const j = await getJson('https://economia.awesomeapi.com.br/json/last/USD-BRL');
  return { price: need(j.USDBRL.bid), pct: need(j.USDBRL.pctChange) };
}
// Uma chamada so para todos os tickers: o plano gratis da brapi e por requisicao.
async function loadStocks() {
  const j = await getJson('https://brapi.dev/api/quote/' + STOCKS.join(','));
  const out = {};
  for (const r of j.results) if (STOCKS.includes(r.symbol)) out[r.symbol] = { price: need(r.regularMarketPrice), pct: need(r.regularMarketChangePercent) };
  return out;
}

// Dispara a atualizacao se venceu. Falha mantem o ultimo valor e so tenta de novo depois de RETRY_MS.
function refresh(key, ttl, load) {
  if (cache.size > 500) cache.clear(); // ponytail: limite bruto; cidades reais nao chegam perto disso
  let e = cache.get(key);
  if (!e) cache.set(key, e = { at: 0 });
  if (e.pending || Date.now() - e.at < ttl) return e;
  e.pending = load()
    .then(v => { e.value = v; e.at = Date.now(); })
    .catch(err => { console.error('moldura:', key, err.message); e.at = Date.now() - ttl + RETRY_MS; })
    .finally(() => { e.pending = null; });
  return e;
}

// needs: { weather: {lat, lon}?, dollar: bool, stocks: bool }. Sempre responde em ate waitMs:
// so espera o que nunca foi buscado; o resto atualiza em segundo plano.
async function frameData(needs, waitMs = 3000) {
  const entries = {};
  if (needs.weather) {
    const lat = Math.round(needs.weather.lat * 100) / 100;
    const lon = Math.round(needs.weather.lon * 100) / 100;
    entries.weather = refresh(`weather:${lat},${lon}`, TTL.weather, () => loadWeather(lat, lon));
  }
  if (needs.dollar) entries.dollar = refresh('dollar', TTL.dollar, loadDollar);
  if (needs.stocks) entries.stocks = refresh('stocks', TTL.stocks, loadStocks);
  const waiting = Object.values(entries).filter(e => e.value === undefined && e.pending).map(e => e.pending);
  if (waiting.length) {
    let timer;
    await Promise.race([Promise.all(waiting), new Promise(r => { timer = setTimeout(r, waitMs); })]);
    clearTimeout(timer);
  }
  const out = {};
  for (const [k, e] of Object.entries(entries)) if (e.value !== undefined) out[k] = e.value;
  return out;
}

function needsOf(frame) {
  const needs = {};
  for (const zone of Object.values(frame.zones)) for (const b of zone) {
    if (b.type === 'weather' && b.city) needs.weather = b.city;
    if (b.type === 'dollar') needs.dollar = true;
    if (b.type === 'stocks') needs.stocks = true;
  }
  return needs;
}

async function searchCities(q) {
  const url = 'https://geocoding-api.open-meteo.com/v1/search?count=5&language=pt&countryCode=BR&name=' + encodeURIComponent(q);
  const j = await getJson(url);
  return (j.results || []).map(r => ({ name: r.name, region: r.admin1 || '', lat: r.latitude, lon: r.longitude }));
}

module.exports = { validateFrame, frameData, needsOf, searchCities, clearFrameCache: () => cache.clear() };
