// Dados de mercado do dia (ao vivo) e análise automática. Tudo vem de APIs públicas chamadas do navegador.
//  • brapi.dev     /quote/list (ações, FIIs, ETFs — sem token) e /quote/^BVSP (Ibovespa — exige token)
//  • AwesomeAPI    dólar, euro, bitcoin (com máxima/mínima do dia)
//  • CoinGecko     top criptos em BRL
//  • BCB SGS       Selic meta (432), CDI anualizado (4389), IPCA 12 meses (13522)
// A "análise do dia" é gerada por regras a partir desses números: descreve o que aconteceu, não prevê nem recomenda.
import { nf } from './util.js';

const KEY = 'ltm.mkt.v1';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } };
const save = v => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* quota/privado */ } };

async function getJSON(url, timeout = 12000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) { const e = new Error('HTTP ' + r.status); e.status = r.status; throw e; }
    return await r.json();
  } finally { clearTimeout(t); }
}

const TICKER = /^[A-Z]{4}\d{1,2}$/;
const normList = j => (j?.stocks || []).filter(s => TICKER.test(s.stock) && s.close != null && s.change != null)
  .map(s => ({ t: s.stock, name: s.name, price: +s.close, chg: +s.change, vol: +s.volume || 0, brl: (+s.close) * (+s.volume || 0), cap: s.market_cap ?? null, sector: s.sector || '', sub: s.subType || s.type || '' }));

async function fetchLists(token) {
  const q = token ? `&token=${encodeURIComponent(token)}` : '';
  const base = 'https://brapi.dev/api/quote/list?sortBy=volume&sortOrder=desc&limit=100';
  const [st, fu] = await Promise.all([getJSON(`${base}&type=stock${q}`), getJSON(`${base}&type=fund${q}`)]);
  return { stocks: normList(st).filter(s => s.brl >= 1e6), funds: normList(fu).filter(s => s.brl >= 3e5) };
}

async function fetchIbov(token) {
  if (!token) return null;
  const j = await getJSON(`https://brapi.dev/api/quote/${encodeURIComponent('^BVSP')}?token=${encodeURIComponent(token)}`);
  const r = j.results?.[0]; if (!r || r.regularMarketPrice == null) return null;
  return { price: r.regularMarketPrice, chg: r.regularMarketChangePercent ?? null, high: r.regularMarketDayHigh ?? null, low: r.regularMarketDayLow ?? null };
}

async function fetchFxAll() {
  const j = await getJSON('https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL,BTC-BRL');
  const o = {};
  for (const [k, id] of [['usd', 'USDBRL'], ['eur', 'EURBRL'], ['btc', 'BTCBRL']]) {
    const r = j[id]; if (!r) continue;
    o[k] = { price: +r.bid, chg: +r.pctChange, high: +r.high, low: +r.low, at: (+r.timestamp || 0) * 1000 };
  }
  return o;
}

async function fetchCrypto() {
  const j = await getJSON('https://api.coingecko.com/api/v3/coins/markets?vs_currency=brl&order=market_cap_desc&per_page=10&page=1&price_change_percentage=24h');
  return j.map(c => ({ id: c.id, sym: String(c.symbol || '').toUpperCase(), name: c.name, price: c.current_price, chg: c.price_change_percentage_24h, cap: c.market_cap, vol: c.total_volume }));
}

async function lastSgs(code, n = 1) {
  const j = await getJSON(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados/ultimos/${n}?formato=json`);
  return j.map(x => ({ date: x.data, v: parseFloat(x.valor) }));
}
async function fetchMacro() {
  const [selic, cdi, ipca12, ipcaM] = await Promise.all([lastSgs(432), lastSgs(4389), lastSgs(13522), lastSgs(433)]);
  return { selic: selic[0]?.v ?? null, cdi: cdi[0]?.v ?? null, ipca12: ipca12[0]?.v ?? null, ipcaM: ipcaM[0]?.v ?? null, ipcaRef: ipcaM[0]?.date || '' };
}

// ------------------------------------------------------------------------------------ orquestração
const state = { data: load(), loading: false, errors: [], listsAt: 0, macroAt: 0 };
export const marketState = state;

/** Atualiza o que estiver vencido. fx/cripto a cada chamada; listas B3 a cada 5 min; macro a cada 6 h. */
export async function refreshMarket({ token = '', force = false } = {}) {
  if (state.loading) return state.data;
  state.loading = true; state.errors = [];
  const d = { ...(state.data || {}) }; const now = Date.now();
  const jobs = [];
  jobs.push(fetchFxAll().then(v => { d.fx = v; }).catch(e => state.errors.push('Câmbio: ' + e.message)));
  jobs.push(fetchCrypto().then(v => { d.crypto = v; }).catch(e => state.errors.push('Cripto: ' + e.message)));
  if (force || now - state.listsAt > 5 * 60 * 1000 || !d.lists) {
    jobs.push(fetchLists(token).then(v => { d.lists = v; state.listsAt = now; }).catch(e => state.errors.push('B3: ' + e.message)));
    jobs.push(fetchIbov(token).then(v => { d.ibov = v; }).catch(e => state.errors.push('Ibovespa: ' + e.message)));
  }
  if (force || now - state.macroAt > 6 * 3600 * 1000 || !d.macro) {
    jobs.push(fetchMacro().then(v => { d.macro = v; state.macroAt = now; }).catch(e => state.errors.push('BCB: ' + e.message)));
  }
  await Promise.all(jobs);
  d.ts = now; state.data = d; state.loading = false; save(d);
  return d;
}

// ------------------------------------------------------------------------------------ pregão
/** Pregão regular B3 (aprox.): seg–sex, 10h–18h em Brasília. Não considera feriados. */
export function sessionStatus(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(now).map(x => [x.type, x.value]));
  const wd = p.weekday, mins = (+p.hour % 24) * 60 + +p.minute;
  const biz = !['Sat', 'Sun'].includes(wd);
  if (biz && mins >= 600 && mins < 1080) return { open: true, label: 'Pregão aberto' };
  if (biz && mins >= 570 && mins < 600) return { open: false, label: 'Pré-abertura' };
  return { open: false, label: 'Pregão fechado' };
}

// ------------------------------------------------------------------------------------ análise automática
const p2 = (v, d = 2) => (v >= 0 ? '+' : '−') + nf(Math.abs(v), d) + '%';
const brl = v => 'R$ ' + nf(v, v >= 1000 ? 0 : 2);
export const rangePos = (v, lo, hi) => (hi > lo ? Math.min(1, Math.max(0, (v - lo) / (hi - lo))) : 0.5);

/**
 * Gera os destaques do dia. `port` = carteira (opcional). Retorna [{ icon, tone: 'up'|'dn'|'flat', title, text }].
 * Só descreve fatos dos dados; nenhuma projeção ou recomendação.
 */
export function analyze(d, port = null) {
  const out = []; if (!d) return out;
  const L = d.lists?.stocks || [];
  if (L.length >= 10) {
    const up = L.filter(s => s.chg > 0.05).length, dn = L.filter(s => s.chg < -0.05).length, n = L.length;
    const share = up / n;
    const tone = share >= 0.6 ? 'up' : share <= 0.4 ? 'dn' : 'flat';
    const read = tone === 'up' ? 'viés comprador' : tone === 'dn' ? 'viés vendedor' : 'mercado dividido';
    const avg = L.reduce((a, s) => a + s.chg, 0) / n;
    out.push({ icon: 'ph-chart-bar', tone, title: 'Amplitude do pregão', text: `${up} de ${n} ações mais líquidas sobem e ${dn} caem (${read}). Variação média: ${p2(avg)}.` });
  }
  if (d.ibov?.chg != null) out.push({ icon: 'ph-chart-line-up', tone: d.ibov.chg >= 0 ? 'up' : 'dn', title: 'Ibovespa', text: `${nf(d.ibov.price, 0)} pontos (${p2(d.ibov.chg)}).${d.ibov.high && d.ibov.low ? ` Faixa do dia: ${nf(d.ibov.low, 0)} a ${nf(d.ibov.high, 0)}.` : ''}` });
  else {
    const b = (d.lists?.funds || []).find(s => s.t === 'BOVA11');
    if (b) out.push({ icon: 'ph-chart-line-up', tone: b.chg >= 0 ? 'up' : 'dn', title: 'Ibovespa (via BOVA11)', text: `O ETF BOVA11 está em ${brl(b.price)} (${p2(b.chg)}), referência do índice. Informe o token da brapi em Configurações para ver os pontos do Ibovespa.` });
  }
  if (L.length >= 10) {
    const hi = [...L].filter(s => s.brl >= 2e7).sort((a, b) => b.chg - a.chg), up = hi[0], dn = hi[hi.length - 1];
    if (up && dn && up !== dn) out.push({ icon: 'ph-arrows-down-up', tone: 'flat', title: 'Destaques de liquidez', text: `Entre as ações com mais de R$ 20 mi negociados, a maior alta é ${up.t} (${p2(up.chg)}, ${brl(up.price)}) e a maior queda é ${dn.t} (${p2(dn.chg)}, ${brl(dn.price)}).` });
    const top = [...L].sort((a, b) => b.brl - a.brl)[0];
    if (top) out.push({ icon: 'ph-fire', tone: top.chg >= 0 ? 'up' : 'dn', title: 'Mais negociada', text: `${top.t} lidera o giro financeiro (≈ R$ ${nf(top.brl / 1e6, 0)} mi) e ${top.chg >= 0 ? 'sobe' : 'cai'} ${nf(Math.abs(top.chg))}%.` });
    const sect = {}; for (const s of L) if (s.sector) (sect[s.sector] ||= []).push(s.chg);
    const ss = Object.entries(sect).filter(([, a]) => a.length >= 3).map(([k, a]) => [k, a.reduce((x, y) => x + y, 0) / a.length, a.length]).sort((a, b) => b[1] - a[1]);
    if (ss.length >= 2) out.push({ icon: 'ph-stack', tone: 'flat', title: 'Setores', text: `Melhor setor: ${ss[0][0]} (${p2(ss[0][1])}, ${ss[0][2]} papéis). Pior: ${ss[ss.length - 1][0]} (${p2(ss[ss.length - 1][1])}, ${ss[ss.length - 1][2]} papéis).` });
  }
  const F = d.lists?.funds || [];
  if (F.length >= 8) { const up = F.filter(s => s.chg > 0.05).length, avg = F.reduce((a, s) => a + s.chg, 0) / F.length; out.push({ icon: 'ph-buildings', tone: avg >= 0 ? 'up' : 'dn', title: 'FIIs e ETFs', text: `${up} de ${F.length} fundos listados mais líquidos sobem; variação média ${p2(avg)}.` }); }
  const u = d.fx?.usd;
  if (u) {
    const pos = rangePos(u.price, u.low, u.high); const where = pos > 0.66 ? 'perto da máxima' : pos < 0.34 ? 'perto da mínima' : 'no meio da faixa';
    out.push({ icon: 'ph-currency-dollar', tone: u.chg >= 0 ? 'dn' : 'up', title: 'Dólar', text: `R$ ${nf(u.price, 4)} (${p2(u.chg)}), ${where} do dia (${nf(u.low, 4)} – ${nf(u.high, 4)}).${d.fx.eur ? ` Euro em R$ ${nf(d.fx.eur.price, 4)} (${p2(d.fx.eur.chg)}).` : ''}` });
  }
  const btc = (d.crypto || []).find(c => c.sym === 'BTC'), eth = (d.crypto || []).find(c => c.sym === 'ETH');
  if (btc) out.push({ icon: 'ph-currency-btc', tone: (btc.chg ?? 0) >= 0 ? 'up' : 'dn', title: 'Cripto', text: `Bitcoin em ${brl(btc.price)} (${p2(btc.chg ?? 0)} em 24 h)${eth ? `; Ethereum em ${brl(eth.price)} (${p2(eth.chg ?? 0)})` : ''}. Cripto negocia 24 h, sem pregão.` });
  const m = d.macro;
  if (m?.selic != null) {
    const real = m.ipca12 != null ? ((1 + m.selic / 100) / (1 + m.ipca12 / 100) - 1) * 100 : null;
    out.push({ icon: 'ph-bank', tone: 'flat', title: 'Juros e inflação', text: `Selic meta ${nf(m.selic)}% a.a.${m.cdi != null ? `, CDI ${nf(m.cdi)}% a.a.` : ''}${m.ipca12 != null ? `; IPCA em 12 meses ${nf(m.ipca12)}%` : ''}${real != null ? `, o que dá juro real ex-post ≈ ${nf(real)}% a.a.` : '.'}${m.ipcaM != null ? ` Último IPCA mensal (${m.ipcaRef.slice(3)}): ${nf(m.ipcaM)}%.` : ''}` });
  }
  if (port?.active?.length) {
    const hs = port.active.filter(h => h.prevClose && h.price != null);
    if (hs.length) {
      const best = [...hs].sort((a, b) => b.dayPct - a.dayPct)[0], worst = [...hs].sort((a, b) => a.dayPct - b.dayPct)[0];
      out.push({ icon: 'ph-wallet', tone: port.dayValue >= 0 ? 'up' : 'dn', title: 'Sua carteira hoje', text: `Variação do dia ${p2(port.dayPct * 100)} (${port.dayValue >= 0 ? '+' : '−'}R$ ${nf(Math.abs(port.dayValue))}).${best !== worst ? ` Melhor: ${best.asset.ticker} (${p2(best.dayPct * 100)}). Pior: ${worst.asset.ticker} (${p2(worst.dayPct * 100)}).` : ''}` });
    }
  }
  return out;
}
