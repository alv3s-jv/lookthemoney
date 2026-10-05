// Estado compartilhado da aplicação, contexto derivado (memoizado) e serviços de atualização.
import { store } from './store.js';
import { todayISO, currentYM, addMonthsYM, addMonthsISO, addDays, groupBy, uid } from './util.js';
import { buildPortfolio, backfillSnapshots, snapshotsWithFlows, flowList } from './portfolio.js';
import { makeCdi, CLASS_ORDER, monthsDiff } from './calc.js';
import { refreshQuotes, getCdi, getIpca, fetchHistory, hasLiveSource } from './quotes.js';
import { CONFIG } from './config.js';

export const app = {
  env: 'fin', route: 'overview', ym: currentYM(), cloud: false,
  user: null, adapter: null, period: '12M', booted: false,
};

const HIST_KEY = 'ltm.hist.v1';
const loadJ = k => { try { return JSON.parse(localStorage.getItem(k)) || null; } catch { return null; } };
const saveJ = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ok */ } };

export const brapiToken = () => store.setting('brapiToken', '') || CONFIG.brapiToken || '';

// -------------------------------------------------------------- contexto derivado (memoizado por versão do store)
let memo = { v: -1, ctx: null };
export function getCtx() {
  if (memo.v === store.v && memo.ctx && memo.ym === app.ym) return memo.ctx;
  const today = todayISO();
  const D = store.data;
  const q = store.quotes;
  const cdi = q.cdiIdx || makeCdi([]);
  const ctx = {
    today, todayYM: today.slice(0, 7), ym: app.ym,
    accounts: D.accounts, cards: D.cards, txs: D.transactions, bills: D.bills, billPayments: D.billPayments,
    plans: Object.fromEntries(D.budgetPlans.map(p => [p.id, +p.planned])),
    goals: D.goals, assets: D.assets, investTx: D.investTx, dividends: D.dividends,
    targets: Object.fromEntries(CLASS_ORDER.map(k => [k, +(D.targets.find(t => t.id === k)?.percent ?? 0)])),
    tolerance: +store.setting('tolerance', 3),
    quotes: q, cdi, ipca: q.ipca || [],
    get portfolio() { return (this._p ||= buildPortfolio({ assets: D.assets, investTx: D.investTx, dividends: D.dividends, quotes: q, cdi, ipca: q.ipca || [], today })); },
    get snaps() { return (this._s ||= snapshotsWithFlows(D.snapshots, D.assets, D.investTx, D.dividends)); },
    get flows() { return (this._f ||= flowList(D.assets, D.investTx)); },
  };
  memo = { v: store.v, ctx, ym: app.ym };
  return ctx;
}

// -------------------------------------------------------------- recorrência mensal: mantém horizonte de 12 meses
export async function ensureRecurring() {
  const today = todayISO(), horizon = addMonthsISO(today, 12);
  const series = groupBy(store.get('transactions').filter(t => t.recurrence === 'monthly' && t.seriesId), t => t.seriesId);
  const add = [];
  for (const rows of Object.values(series)) {
    rows.sort((a, b) => a.date.localeCompare(b.date));
    const first = rows[0], last = rows[rows.length - 1];
    if (rows.some(r => r.recurrenceEnded)) continue;
    const span = monthsDiff(first.date.slice(0, 7), last.date.slice(0, 7));
    for (let k = 1; k <= 36; k++) {
      const d = addMonthsISO(first.date, span + k);
      if (d > horizon) break;
      add.push({ ...last, id: uid(), date: d, createdAt: new Date().toISOString() });
    }
  }
  if (add.length) await store.putMany('transactions', add, { silent: true });
}

// -------------------------------------------------------------- atualização de cotações / CDI / snapshots
let refreshing = null;
export function refreshAll({ force = false, silent = false } = {}) {
  if (refreshing) return refreshing;
  const q = store.quotes;
  q.loading = true; q.errors = []; if (!silent) store.emit();
  refreshing = (async () => {
    try {
      const assets = store.get('assets');
      const tx = store.get('investTx');
      const first = tx.reduce((m, t) => (t.date < m ? t.date : m), todayISO());
      const from = addDays(first, -7);
      const [cdi, ipca] = await Promise.all([getCdi(from), assets.some(a => a.fixedIncome?.indexer === 'IPCA') ? getIpca(addMonthsISO(from, -2)) : Promise.resolve({ data: [] })]);
      q.cdiRaw = cdi.data; q.cdiIdx = makeCdi(cdi.data); q.ipca = ipca.data;
      if (cdi.stale) q.errors.push('CDI (BCB): usando último valor salvo');
      const r = await refreshQuotes(assets, { force, token: brapiToken() });
      q.map = r.map; q.fx = r.fx; q.updatedAt = r.updatedAt || Date.now(); q.offline = r.offline;
      q.errors.push(...r.errors);
      q.fetchedAt = Date.now();
    } catch (e) { q.errors.push(e.message); }
    q.loading = false;
    store.emit();
    try { await ensureSnapshots(); } catch (e) { console.error(e); }
    refreshing = null;
  })();
  return refreshing;
}

export async function loadHistoryFor(assets) {
  const cache = loadJ(HIST_KEY) || { day: '', h: {} };
  const today = todayISO();
  if (cache.day !== today) { cache.day = today; cache.h = {}; }
  const token = brapiToken();
  for (const a of assets.filter(hasLiveSource)) {
    if (cache.h[a.ticker]) continue;
    try { cache.h[a.ticker] = await fetchHistory(a, token); } catch { cache.h[a.ticker] = []; }
    saveJ(HIST_KEY, cache);
    await new Promise(r => setTimeout(r, 350));
  }
  return cache.h;
}

/** Garante snapshot de hoje (valor real) e preenche dias faltantes (estimados). */
export async function ensureSnapshots({ rebuildEst = false } = {}) {
  const today = todayISO();
  const assets = store.get('assets'), investTx = store.get('investTx');
  if (!investTx.length) return;
  const ctx = getCtx();
  const q = store.quotes;
  const existing = store.get('snapshots');
  const first = investTx.reduce((m, t) => (t.date < m ? t.date : m), today);
  const have = new Set(existing.map(s => s.id));
  let missing = false;
  for (let d = first; d < today; d = addDays(d, 1)) if (!have.has(d)) { missing = true; break; }
  const out = [];
  if (missing || rebuildEst) {
    const held = assets.filter(a => investTx.some(t => t.assetId === a.id));
    const history = await loadHistoryFor(held);
    out.push(...backfillSnapshots({ assets, investTx, cdi: q.cdiIdx || makeCdi([]), ipca: q.ipca || [], history }, existing, today, { rebuildEst }));
  }
  const p = ctx.portfolio;
  if (p.total > 0 && !p.withoutQuote.length) out.push({ id: today, date: today, value: p.total, est: false });
  if (out.length) await store.putMany('snapshots', out);
}

/** Após qualquer alteração em investimentos: busca cotação de ativos novos e reconstrói o histórico estimado. */
export async function afterInvestChange() {
  try { await refreshAll({ silent: true }); await ensureSnapshots({ rebuildEst: true }); } catch (e) { console.error(e); }
}
