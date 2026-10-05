// Cotações e índices — chamados direto do navegador, com cache de 15 min e fallback para o último valor salvo.
//  • brapi.dev      (B3: ações, FIIs, ETFs, BDRs)  — plano grátis: 1 ativo por requisição, 1 requisição simultânea
//  • CoinGecko      (cripto)
//  • AwesomeAPI     (USD-BRL)
//  • BCB SGS 12     (CDI diário)   • BCB SGS 433 (IPCA mensal)
import { addDays, parseISO, toISO, todayISO, daysBetween } from './util.js';

const KEY = 'ltm.quotes.v2';
const TTL = 15 * 60 * 1000;

const load = k => { try { return JSON.parse(localStorage.getItem(k)) || null; } catch { return null; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* quota/privado */ } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getJSON(url, { timeout = 12000 } = {}) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) { const e = new Error('HTTP ' + r.status); e.status = r.status; throw e; }
    return await r.json();
  } finally { clearTimeout(t); }
}

export const CRYPTO_IDS = { BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', BNB: 'binancecoin', XRP: 'ripple', ADA: 'cardano', DOGE: 'dogecoin', USDT: 'tether', USDC: 'usd-coin', LTC: 'litecoin', DOT: 'polkadot', LINK: 'chainlink', AVAX: 'avalanche-2', MATIC: 'matic-network' };

// ------------------------------------------------------------------ provedores
export async function fetchBrapi(ticker, token) {
  const q = token ? `?token=${encodeURIComponent(token)}` : '';
  const j = await getJSON(`https://brapi.dev/api/quote/${encodeURIComponent(ticker)}${q}`);
  const r = j.results?.[0];
  if (!r || r.regularMarketPrice == null) throw new Error('sem dados');
  return { price: r.regularMarketPrice, prevClose: r.regularMarketPreviousClose ?? null, ts: r.regularMarketTime ? Date.parse(r.regularMarketTime) || Date.now() : Date.now(), currency: r.currency || 'BRL' };
}

export async function fetchCrypto(assets) {
  const ids = [...new Set(assets.map(a => a.cgId || CRYPTO_IDS[a.ticker.toUpperCase()]).filter(Boolean))];
  if (!ids.length) return {};
  const j = await getJSON(`https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=brl&include_24hr_change=true`);
  const out = {};
  for (const a of assets) {
    const id = a.cgId || CRYPTO_IDS[a.ticker.toUpperCase()]; const r = j[id];
    if (r?.brl) out[a.ticker] = { price: r.brl, prevClose: r.brl_24h_change != null ? r.brl / (1 + r.brl_24h_change / 100) : null, ts: Date.now() };
  }
  return out;
}

export async function fetchFx() {
  const j = await getJSON('https://economia.awesomeapi.com.br/json/last/USD-BRL');
  const r = j.USDBRL; return { rate: +r.bid, pct: +r.pctChange, ts: Date.now() };
}

// BCB SGS: datas dd/mm/aaaa, janelas de até 10 anos para séries diárias
const brDate = iso => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
const isoFromBr = s => { const [d, m, y] = s.split('/'); return `${y}-${m}-${d}`; };
async function fetchSgs(code, from, to) {
  const out = []; let cur = from;
  while (cur <= to) {
    let end = addDays(cur, 365 * 9); if (end > to) end = to;
    const j = await getJSON(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados?formato=json&dataInicial=${brDate(cur)}&dataFinal=${brDate(end)}`, { timeout: 20000 });
    for (const x of j) out.push({ date: isoFromBr(x.data), v: parseFloat(x.valor) });
    cur = addDays(end, 1);
  }
  return out;
}

/** Série incremental persistida em localStorage. */
async function incrementalSeries(code, cacheKey, from, ttlMs) {
  const c = load(cacheKey) || { data: [], fetchedAt: 0 };
  const today = todayISO();
  const have = c.data.length ? c.data[c.data.length - 1].date : null;
  const needFrom = c.data.length && c.data[0].date <= from ? null : from; // histórico mais antigo que o cache
  if (needFrom) c.data = [];
  if (Date.now() - c.fetchedAt < ttlMs && !needFrom && c.data.length) return { data: c.data, stale: false };
  try {
    const start = c.data.length ? addDays(have, 1) : from;
    if (start <= today) {
      const add = await fetchSgs(code, start, today);
      const seen = new Set(c.data.map(x => x.date));
      for (const x of add) if (!seen.has(x.date)) c.data.push(x);
      c.data.sort((a, b) => a.date.localeCompare(b.date));
    }
    c.fetchedAt = Date.now(); save(cacheKey, c);
    return { data: c.data, stale: false };
  } catch (e) {
    return { data: c.data, stale: true, error: e };
  }
}
export const getCdi = from => incrementalSeries(12, 'ltm.cdi.v1', from, 6 * 3600e3);
export const getIpca = from => incrementalSeries(433, 'ltm.ipca.v1', from, 24 * 3600e3);

// ------------------------------------------------------------------ histórico (backfill, melhor esforço)
export async function fetchHistory(asset, token) {
  if (asset.assetClass === 'CRIPTO') {
    const id = asset.cgId || CRYPTO_IDS[asset.ticker.toUpperCase()]; if (!id) return [];
    const j = await getJSON(`https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=brl&days=90&interval=daily`);
    return (j.prices || []).map(([t, p]) => ({ date: toISO(new Date(t)), close: p }));
  }
  const q = token ? `&token=${encodeURIComponent(token)}` : '';
  const j = await getJSON(`https://brapi.dev/api/quote/${encodeURIComponent(asset.ticker)}?range=3mo&interval=1d${q}`, { timeout: 20000 });
  return (j.results?.[0]?.historicalDataPrice || []).filter(x => x.close != null).map(x => ({ date: toISO(new Date(x.date * 1000)), close: x.close }));
}

// ------------------------------------------------------------------ orquestração
export const hasLiveSource = a => a.assetClass !== 'RENDA_FIXA';

/**
 * Atualiza cotações de todos os ativos (exceto renda fixa). Respeita cache de 15 min.
 * onProgress(done,total) opcional. Retorna { map, fx, updatedAt, oldest, errors }.
 */
export async function refreshQuotes(assets, { force = false, token = '', onProgress } = {}) {
  const cache = load(KEY) || { q: {}, fx: null };
  const now = Date.now();
  const live = assets.filter(hasLiveSource);
  const errors = [];
  const fresh = t => cache.q[t] && now - cache.q[t].fetchedAt < TTL;

  // câmbio (só se houver ativo em USD)
  if (assets.some(a => a.currency === 'USD')) {
    if (force || !cache.fx || now - cache.fx.fetchedAt > TTL) {
      try { cache.fx = { ...(await fetchFx()), fetchedAt: now }; } catch (e) { errors.push('Câmbio USD-BRL: ' + e.message); }
    }
  }

  // cripto em lote
  const crypto = live.filter(a => a.assetClass === 'CRIPTO' && (force || !fresh(a.ticker)));
  if (crypto.length) {
    try { const r = await fetchCrypto(crypto); for (const [t, v] of Object.entries(r)) cache.q[t] = { ...v, fetchedAt: now, source: 'CoinGecko' }; }
    catch (e) { errors.push('CoinGecko: ' + e.message); }
  }

  // B3 em fila (plano grátis da brapi: 1 ativo por requisição, 1 simultânea)
  const b3 = live.filter(a => a.assetClass !== 'CRIPTO' && (force || !fresh(a.ticker)));
  let done = 0;
  for (const a of b3) {
    try { const r = await fetchBrapi(a.ticker, token); cache.q[a.ticker] = { ...r, fetchedAt: Date.now(), source: 'brapi' }; }
    catch (e) { errors.push(`${a.ticker}: ${e.status === 429 ? 'limite de requisições' : e.status === 401 || e.status === 403 ? 'token inválido ou ativo fora do plano' : e.message}`); }
    onProgress?.(++done, b3.length);
    if (done < b3.length) await sleep(350);
  }
  save(KEY, cache);

  // monta o mapa final, com fallbacks: cache antigo → preço manual
  const map = {}; let oldest = Infinity;
  for (const a of assets) {
    if (a.assetClass === 'RENDA_FIXA') continue;
    const c = cache.q[a.ticker];
    const manual = +a.manualPrice > 0 ? +a.manualPrice : null;
    if (a.priceSource === 'manual' && manual) { map[a.ticker] = { price: manual, prevClose: null, source: 'manual', stale: false, updatedAt: a.manualPriceAt ? Date.parse(a.manualPriceAt) : now }; continue; }
    if (c) {
      const stale = now - c.fetchedAt >= TTL && errors.length > 0 && !fresh(a.ticker);
      map[a.ticker] = { price: c.price, prevClose: c.prevClose, source: c.source, stale, updatedAt: c.fetchedAt };
      oldest = Math.min(oldest, c.fetchedAt);
    } else if (manual) {
      map[a.ticker] = { price: manual, prevClose: null, source: 'manual', stale: true, updatedAt: a.manualPriceAt ? Date.parse(a.manualPriceAt) : null };
    }
  }
  const updatedAt = oldest === Infinity ? null : oldest;
  return { map, fx: cache.fx, updatedAt, errors, offline: errors.length > 0 && b3.length + crypto.length > 0 && errors.length >= Math.max(1, b3.length + (crypto.length ? 1 : 0)) };
}

export const fxRate = (quotes, currency) => (currency === 'USD' ? quotes.fx?.rate || 5 : 1);
