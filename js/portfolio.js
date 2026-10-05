// Monta a carteira (posições, valores, alocação) e os snapshots diários a partir de transações + cotações.
// Convenções:
//  • Renda fixa: quantidade = valor aplicado (R$) e preço = 1,00. Resgate = venda com quantidade = principal resgatado.
//  • Ativos em USD: cada transação guarda `fx` (câmbio da compra); o custo é sempre em R$.
import { position, valuePosition, fixedIncomeValue, makeCdi, CLASS_ORDER, CLASSES } from './calc.js';
import { addDays, daysBetween, groupBy, sum } from './util.js';

const adjTx = (a, txs) => (a.currency === 'USD' ? txs.map(t => ({ ...t, price: t.price * (+t.fx || 1) })) : txs);

export function buildPortfolio({ assets, investTx, dividends, quotes, cdi, ipca, today }) {
  const txByAsset = groupBy(investTx, t => t.assetId);
  const divByAsset = groupBy(dividends, d => d.assetId);
  const holdings = [];
  for (const asset of assets) {
    const raw = txByAsset[asset.id] || [];
    const txs = adjTx(asset, raw);
    const pos = position(txs);
    const prov = sum((divByAsset[asset.id] || []).filter(d => d.payDate <= today), d => +d.amount);
    const fx = asset.currency === 'USD' ? quotes.fx?.rate || 0 : 1;
    let price = null, prevClose = null, source = null, stale = false, v;
    if (asset.assetClass === 'RENDA_FIXA') {
      const bought = sum(txs.filter(t => t.type === 'COMPRA'), t => +t.quantity);
      const frac = bought > 0 ? pos.qty / bought : 0;
      const val = sum(txs.filter(t => t.type === 'COMPRA'), t => fixedIncomeValue(+t.quantity * +t.price, t.date, today, asset.fixedIncome || { indexer: 'CDI', rate: 100 }, cdi, ipca)) * frac;
      v = { value: val, res: val - pos.cost, resPct: pos.cost > 0 ? (val - pos.cost) / pos.cost : 0, dayPct: 0, dayValue: 0 };
      source = 'curva';
    } else {
      const q = quotes.map[asset.ticker];
      price = q ? q.price : null; prevClose = q?.prevClose ?? null; source = q?.source || null; stale = !!q?.stale;
      if (price == null) v = { value: pos.cost, res: 0, resPct: 0, dayPct: 0, dayValue: 0, noQuote: true };
      else if (asset.currency === 'USD' && !fx) v = { value: pos.cost, res: 0, resPct: 0, dayPct: 0, dayValue: 0, noQuote: true };
      else v = valuePosition(pos, price, fx, prevClose);
    }
    holdings.push({ asset, txs: raw, pos, cost: pos.cost, price, prevClose, fx, source, stale, prov, ...v, retTotal: v.res + prov });
  }
  const open = holdings.filter(h => h.pos.qty > 0 || h.prov > 0);
  const active = holdings.filter(h => h.pos.qty > 0);
  const total = sum(active, h => h.value), cost = sum(active, h => h.cost), prov = sum(holdings, h => h.prov);
  const dayValue = sum(active, h => h.dayValue);
  for (const h of active) h.weight = total > 0 ? h.value / total : 0;
  const byClass = {};
  for (const k of CLASS_ORDER) {
    const items = active.filter(h => h.asset.assetClass === k);
    const value = sum(items, h => h.value), c = sum(items, h => h.cost);
    byClass[k] = { cls: k, label: CLASSES[k], items, value, cost: c, res: value - c, resPct: c > 0 ? (value - c) / c : 0, weight: total > 0 ? value / total : 0, prov: sum(items, h => h.prov) };
  }
  const withoutQuote = active.filter(h => h.noQuote).map(h => h.asset.ticker);
  return { holdings, active, open, total, cost, valorizacao: total - cost, prov, dayValue, dayPct: total - dayValue > 0 ? dayValue / (total - dayValue) : 0, byClass, withoutQuote };
}

/** Fluxos líquidos diários (compras − vendas, em R$; taxas incluídas) e proventos por dia. */
export function dailyFlows(assets, investTx, dividends) {
  const A = Object.fromEntries(assets.map(a => [a.id, a]));
  const flow = {}, income = {};
  for (const t of investTx) {
    const a = A[t.assetId]; if (!a) continue;
    const fx = a.currency === 'USD' ? +t.fx || 1 : 1;
    const v = (t.type === 'COMPRA' ? 1 : -1) * ((+t.quantity * +t.price * fx) + (t.type === 'COMPRA' ? (+t.fees || 0) : -(+t.fees || 0)));
    flow[t.date] = (flow[t.date] || 0) + v;
  }
  for (const d of dividends) income[d.payDate] = (income[d.payDate] || 0) + +d.amount;
  return { flow, income };
}

/** Lista de fluxos para "R$ a mais que o CDI". */
export function flowList(assets, investTx) {
  const { flow } = dailyFlows(assets, investTx, []);
  return Object.entries(flow).map(([date, amount]) => ({ date, amount })).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Valor da carteira em uma data passada (estimativa): renda fixa na curva; demais pelo fechamento histórico
 * (último ≤ data) quando houver, senão pelo custo.
 */
export function valueAt(date, { assets, investTx, cdi, ipca, history }) {
  const txByAsset = groupBy(investTx, t => t.assetId);
  let total = 0, est = false;
  for (const a of assets) {
    const all = txByAsset[a.id] || [];
    const txs = adjTx(a, all.filter(t => t.date <= date));
    if (!txs.length) continue;
    const pos = position(txs);
    if (pos.qty <= 0) continue;
    if (a.assetClass === 'RENDA_FIXA') {
      const bought = sum(txs.filter(t => t.type === 'COMPRA'), t => +t.quantity);
      total += sum(txs.filter(t => t.type === 'COMPRA'), t => fixedIncomeValue(+t.quantity * +t.price, t.date, date, a.fixedIncome || { indexer: 'CDI', rate: 100 }, cdi, ipca)) * (bought > 0 ? pos.qty / bought : 0);
      continue;
    }
    const h = history?.[a.ticker];
    let close = null;
    if (h?.length) { for (let i = h.length - 1; i >= 0; i--) if (h[i].date <= date) { close = h[i].close; break; } }
    if (close != null) total += pos.qty * close * (a.currency === 'USD' ? (all.find(t => t.fx)?.fx || 1) : 1);
    else { total += pos.cost; est = true; }
  }
  return { value: total, est };
}

/**
 * Gera snapshots faltantes desde a 1ª transação até ontem. Retorna só os novos.
 * Sem histórico de preço (ex.: fora dos 3 meses do plano grátis), carrega o valor do dia anterior + fluxo do dia
 * (retorno 0 nesses dias) em vez de cair para o custo — evita "buracos" artificiais no gráfico.
 */
export function backfillSnapshots(ctx, existing, today, { rebuildEst = false } = {}) {
  if (!ctx.investTx.length) return [];
  const first = ctx.investTx.reduce((m, t) => (t.date < m ? t.date : m), '9999-12-31');
  const have = new Map(existing.map(s => [s.id, s]));
  const { flow } = dailyFlows(ctx.assets, ctx.investTx, []);
  const out = []; let prev = null;
  for (let d = first; d < today; d = addDays(d, 1)) {
    const cur = have.get(d);
    if (cur && !(rebuildEst && cur.est)) { prev = cur; continue; }
    const r = valueAt(d, ctx);
    let value = r.value;
    if (r.est && prev && prev.value > 0) value = prev.value + (flow[d] || 0);
    const snap = { id: d, date: d, value, est: r.est };
    out.push(snap); prev = snap;
  }
  return out;
}

/** Junta snapshots armazenados com fluxos/proventos derivados das transações (sempre consistentes). */
export function snapshotsWithFlows(snaps, assets, investTx, dividends) {
  const { flow, income } = dailyFlows(assets, investTx, dividends);
  return [...snaps].sort((a, b) => a.date.localeCompare(b.date)).map(s => ({ ...s, netFlow: flow[s.date] || 0, income: income[s.date] || 0 }));
}
