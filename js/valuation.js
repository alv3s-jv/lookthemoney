// Análise de preço-teto e fundo. Funções puras (testadas) + busca de fundamentos na brapi (precisa do token para mais de 4 ativos).
//
// Metodologias (todas públicas e clássicas):
//  • Bazin (Décio Bazin)      preço-teto = dividendos por ação ÷ 6% a.a.  → só paga o que rende ao menos 6% em proventos
//  • Graham (Benjamin Graham)  valor = √(22,5 × LPA × VPA)                 → limita P/L a 15 e P/VP a 1,5 (15 × 1,5 = 22,5)
//  • Buffett/Munger (qualidade) ROE alto, margem, endividamento baixo, lucro e caixa positivos e crescentes
//  • Margem de segurança (Graham/Klarman): só considera "zona de compra" abaixo do preço justo menos uma folga
//  • Fundo/suporte: mínima de 52 semanas, mínima de 5 anos e posição do preço nessas faixas
// Nada disso prevê preço: são regras para evitar pagar caro. Dados vêm da brapi e podem ter erros ou defasagem.

const KEY = 'ltm.val.v1';
const TTL = 12 * 3600 * 1000;

export const YIELD_MIN = 0.06;      // Bazin
export const GRAHAM_K = 22.5;       // Graham: 15 × 1,5
export const JCP_NET = 0.85;        // JCP tem 15% de IR retido na fonte
export const CYCLICAL = new Set(['PETR4', 'PETR3', 'VALE3', 'GGBR4', 'GOAU4', 'CSNA3', 'USIM5', 'SUZB3', 'KLBN11', 'CSAN3', 'BRAP4', 'PRIO3', 'CMIN3', 'EMBJ3']);
export const FINANCIAL = new Set(['ITUB4', 'ITUB3', 'BBDC4', 'BBDC3', 'BBAS3', 'BPAC11', 'SANB11', 'BBSE3', 'CXSE3', 'ITSA4', 'B3SA3', 'IRBR3']);

const yearsAgo = (today, n) => { const d = new Date(today); d.setFullYear(d.getFullYear() - n); return d; };
const kind = l => { const s = String(l || '').toUpperCase(); return s.includes('JCP') || s.includes('JUROS') ? 'jcp' : (s.includes('DIVID') || s.includes('REND')) ? 'div' : null; };

/** Proventos por ação (líquidos: JCP × 0,85) pagos com data-com já ocorrida. dpa12 = últimos 12 meses; dpa3 = média anual dos últimos 36 meses. */
export function dividendsPerShare(cash = [], today = new Date()) {
  const t = +today, d12 = +yearsAgo(today, 1), d36 = +yearsAgo(today, 3);
  let s12 = 0, s36 = 0, n12 = 0;
  for (const x of cash) {
    const k = kind(x.label); if (!k) continue;
    const ex = Date.parse(x.exDate || x.paymentDate); if (!(ex <= t) || ex <= d36) continue;
    const v = (Number(x.rate) || 0) * (k === 'jcp' ? JCP_NET : 1);
    s36 += v; if (ex > d12) { s12 += v; n12++; }
  }
  return { dpa12: s12, dpa3: s36 / 3, n12 };
}

export const bazin = ({ dpa12, dpa3 }, y = YIELD_MIN) => {
  const ref = dpa3 > 0 ? Math.min(dpa12, dpa3) : dpa12; // conservador: o menor entre 12 meses e média de 3 anos
  return ref > 0 ? ref / y : null;
};
export const graham = (eps, bv) => (eps > 0 && bv > 0 ? Math.sqrt(GRAHAM_K * eps * bv) : null);

/** Qualidade estilo Buffett/Munger: % dos testes aplicáveis que passam. Para bancos/seguradoras ignora dívida/PL. */
export function quality(f, ticker = '', dpa = null) {
  const fin = FINANCIAL.has(ticker);
  const T = [
    ['ROE ≥ 15%', f.roe != null ? f.roe >= 0.15 : null, 20],
    ['Margem líquida ≥ 10%', f.pm != null ? f.pm >= 0.10 : null, 15],
    ['Dívida/PL ≤ 100%', fin ? null : (f.de != null ? f.de <= 100 : null), 15],
    ['Lucro crescendo', f.eg != null ? f.eg > 0 : null, 15],
    ['Caixa livre positivo', f.fcf != null ? f.fcf > 0 : null, 15],
    ['Paga proventos', dpa ? dpa.dpa3 > 0 && dpa.dpa12 > 0 : null, 10],
    ['P/L entre 0 e 20', f.pe != null ? f.pe > 0 && f.pe <= 20 : null, 10],
  ];
  let got = 0, max = 0; const checks = T.map(([name, ok, w]) => { if (ok != null) { max += w; if (ok) got += w; } return { name, ok, w }; });
  return { score: max ? Math.round(got / max * 100) : null, checks };
}

/** Fundo/suporte e tendência a partir da faixa de 52 semanas e do histórico mensal de fechamentos. */
export function support({ price, lo, hi, closes = [] }) {
  const pos = (a, b) => (b > a ? Math.min(1, Math.max(0, (price - a) / (b - a))) : null);
  const min5 = closes.length ? Math.min(...closes) : null, max5 = closes.length ? Math.max(...closes) : null;
  const last10 = closes.slice(-10), ma10 = last10.length >= 8 ? last10.reduce((a, b) => a + b, 0) / last10.length : null; // ≈ média de 200 pregões
  return { fundo52: lo ?? null, topo52: hi ?? null, pos52: lo != null && hi != null ? pos(lo, hi) : null, fundo5: min5, topo5: max5, pos5: min5 != null ? pos(min5, max5) : null, ma10, aboveMa: ma10 ? price > ma10 : null, drawdown: hi ? price / hi - 1 : null };
}

/** Linha de análise de um ativo. raw = { t, price, lo, hi, pe, eps, bv, roe, pm, de, fcf, eg, cash, closes }. */
export function analyze(raw, { mos = 0.25, today = new Date() } = {}) {
  const dpa = dividendsPerShare(raw.cash || [], today);
  const bz = bazin(dpa), gr = graham(raw.eps, raw.bv);
  const valid = [bz, gr].filter(v => v != null);
  const fair = valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
  const buyZone = fair != null ? fair * (1 - mos) : null;
  const q = quality(raw, raw.t, dpa), sup = support(raw);
  const flags = [];
  if (CYCLICAL.has(raw.t)) flags.push('Setor cíclico: lucro de pico infla o Graham; proventos extraordinários inflam o Bazin.');
  if (dpa.dpa3 > 0 && dpa.dpa12 > dpa.dpa3 * 1.5) flags.push('Proventos dos últimos 12 meses bem acima da média de 3 anos (possível extraordinário).');
  if (bz != null && gr != null && Math.max(bz, gr) / Math.min(bz, gr) > 1.8) flags.push('Bazin e Graham divergem muito: a faixa de preço justo é incerta.');
  if (raw.eps != null && raw.eps <= 0) flags.push('Lucro por ação negativo: Graham não se aplica.');
  if (valid.length === 1) flags.push('Só um método aplicável.');
  let status = 'sem-dados';
  if (fair != null) status = raw.price <= buyZone ? 'compra' : raw.price <= fair ? 'justo' : raw.price <= fair * 1.15 ? 'esticado' : 'caro';
  const dyEntry = buyZone && dpa.dpa12 ? dpa.dpa12 / buyZone : null;
  return { t: raw.t, price: raw.price, bazin: bz, graham: gr, fair, buyZone, target: fair, upside: fair != null ? fair / raw.price - 1 : null, mos: fair != null ? 1 - raw.price / fair : null, dpa, dyNow: dpa.dpa12 && raw.price ? dpa.dpa12 / raw.price : null, dyEntry, quality: q, support: sup, flags, status, pe: raw.pe ?? null, eps: raw.eps ?? null, bv: raw.bv ?? null };
}

/** Triagem: UMA candidata na zona de compra (maior margem de segurança entre as de boa qualidade) e as que merecem "manter". */
export function screen(rows, { minQuality = 55 } = {}) {
  const ok = rows.filter(r => r.fair != null && (r.quality.score ?? 0) >= minQuality);
  const buys = ok.filter(r => r.status === 'compra').sort((a, b) => b.mos - a.mos || b.quality.score - a.quality.score);
  const hold = ok.filter(r => r.status === 'justo').sort((a, b) => b.quality.score - a.quality.score || b.mos - a.mos);
  const nearest = ok.filter(r => r.status === 'justo').sort((a, b) => a.price / a.buyZone - b.price / b.buyZone)[0] || null;
  const expensive = rows.filter(r => r.status === 'caro' || r.status === 'esticado').sort((a, b) => a.mos - b.mos);
  const lowQ = rows.filter(r => r.fair != null && (r.quality.score ?? 0) < minQuality);
  return { buy: buys[0] || null, buyAlt: buys.slice(1), hold, nearest, expensive, lowQ };
}

// ------------------------------------------------------------------------------------ dados (brapi)
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const save = v => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* quota */ } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function fetchFundamentals(ticker, token) {
  const q = token ? `&token=${encodeURIComponent(token)}` : '';
  const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await fetch(`https://brapi.dev/api/quote/${encodeURIComponent(ticker)}?modules=defaultKeyStatistics,financialData&fundamental=true&dividends=true&range=5y&interval=1mo${q}`, { signal: ctl.signal });
    if (!r.ok) { const e = new Error(r.status === 401 || r.status === 402 ? 'exige token da brapi' : 'HTTP ' + r.status); e.status = r.status; throw e; }
    const x = (await r.json()).results?.[0]; if (!x || x.regularMarketPrice == null) throw new Error('sem dados');
    const dk = x.defaultKeyStatistics || {}, fd = x.financialData || {};
    return {
      t: ticker, name: x.longName || x.shortName || ticker, price: x.regularMarketPrice, lo: x.fiftyTwoWeekLow, hi: x.fiftyTwoWeekHigh, pe: x.priceEarnings ?? dk.trailingPE ?? null,
      eps: dk.trailingEps ?? x.earningsPerShare ?? null, bv: dk.bookValue ?? null, roe: fd.returnOnEquity ?? null, pm: fd.profitMargins ?? dk.profitMargins ?? null, de: fd.debtToEquity ?? null, fcf: fd.freeCashflow ?? null, eg: fd.earningsGrowth ?? null,
      cash: (x.dividendsData?.cashDividends || []).filter(d => Date.parse(d.exDate || d.paymentDate) > Date.now() - 4 * 365 * 864e5).map(d => ({ label: d.label, rate: d.rate, exDate: d.exDate, paymentDate: d.paymentDate })),
      closes: (x.historicalDataPrice || []).map(h => h.close).filter(v => v != null), at: Date.now(),
    };
  } finally { clearTimeout(to); }
}

/** Busca (com cache de 12 h) os fundamentos de vários papéis, um por vez para respeitar o limite do plano. */
export async function loadFundamentals(tickers, { token = '', force = false, onProgress } = {}) {
  const cache = load(), out = {}, errors = {};
  let done = 0;
  for (const t of tickers) {
    const c = cache[t];
    if (!force && c && Date.now() - c.at < TTL) out[t] = c;
    else {
      try { out[t] = cache[t] = await fetchFundamentals(t, token); await sleep(350); }
      catch (e) { errors[t] = e.message; if (c) out[t] = c; }
    }
    onProgress?.(++done, tickers.length);
  }
  save(cache);
  return { data: out, errors };
}
