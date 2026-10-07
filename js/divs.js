// Proventos automáticos: o app credita sozinho o que sua posição tinha direito a receber, sem lançamento manual.
//  1) Agenda curada (agenda.js): valores e datas de pagamento anunciados pelas empresas → data de pagamento exata.
//  2) Histórico do Yahoo (via Edge Function "mercado"): o que foi declarado antes e não está na agenda → data de pagamento ESTIMADA
//     (data ex + ~25 dias para ações, +10 para FIIs); marcado como "estimado".
// Direito = posição na data com (comprou até a data com). JCP entra líquido (−15%). Lançamento manual do mesmo provento (±7 dias) prevalece.
import { position, netDividend } from './calc.js';
import { addDays, daysBetween } from './util.js';
import { AGENDA } from './agenda.js';
import { edgeOn, edgeCall } from './feed.js';

const KEY = 'ltm.divhist.v1', TTL = 12 * 3600 * 1000;
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const save = v => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* quota */ } };
export const histCache = () => load();

const eligible = a => a.assetClass !== 'RENDA_FIXA' && a.assetClass !== 'CRIPTO' && (a.currency || 'BRL') === 'BRL' && /^[A-Z]{4}\d{1,2}$/.test(String(a.ticker).toUpperCase());
const r2 = v => Math.round(v * 100) / 100;

/** Busca (cache 12 h) o histórico de proventos dos papéis que você tem. Retorna true se algo mudou. */
export async function loadDivHistory(tickers) {
  if (!edgeOn() || !tickers.length) return false;
  const c = load(), due = tickers.filter(t => !c[t] || Date.now() - c[t].at > TTL);
  if (!due.length) return false;
  try {
    const j = await edgeCall({ symbols: due, detail: true });
    for (const t of due) { const r = j.data?.[t]; if (r) c[t] = { at: Date.now(), cash: (r.cash || []).map(x => ({ ex: x.exDate, rate: x.rate, label: x.label })) }; }
    save(c); return true;
  } catch { return false; }
}

/** Puro e testável. hist = { TICKER: { cash: [{ex, rate, label}] } }. */
export function autoDividends(assets, investTx, manual, hist, today) {
  const out = [];
  const near = (assetId, pay) => manual.some(d => d.assetId === assetId && Math.abs(daysBetween(d.payDate, pay)) <= 7);
  for (const a of assets) {
    const T = a.ticker.toUpperCase(), items = AGENDA.filter(x => x.t === T);
    if (!eligible(a) && !items.length) continue;       // agenda curada vale também p/ ativos fora do padrão B3 (ex.: ETF internacional, valor já em R$)
    const txs = investTx.filter(t => t.assetId === a.id); if (!txs.length) continue;
    const first = txs.reduce((m, t) => (t.date < m ? t.date : m), '9999-12-31');
    const push = (key, x, qty, est) => {
      if (!(qty > 0) || near(a.id, x.pay)) return;
      const gross = qty * x.ps;
      out.push({ id: 'auto:' + key, assetId: a.id, type: x.type, payDate: x.pay, perShare: x.ps, quantity: qty, amount: r2(netDividend(x.type, gross)), auto: true, est });
    };
    for (const x of items) push(`${T}:${x.com}:${x.type}:${x.pay}`, x, position(txs, x.com).qty, false);
    for (const e of eligible(a) ? hist[T]?.cash || [] : []) {
      if (!(e.rate > 0) || e.ex > today || e.ex < first) continue;
      if (items.some(x => Math.abs(daysBetween(x.com, e.ex)) <= 4)) continue; // já coberto pela agenda
      const type = a.assetClass === 'FII' ? 'RENDIMENTO' : e.label === 'JCP' ? 'JCP' : 'DIVIDENDO';
      const pay = addDays(e.ex, a.assetClass === 'FII' ? 10 : 25);
      push(`${T}:${e.ex}:${type}:y`, { ps: e.rate, type, pay }, position(txs, addDays(e.ex, -1)).qty, true);
    }
  }
  return out;
}
