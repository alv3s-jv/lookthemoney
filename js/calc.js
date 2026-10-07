// Funções puras de cálculo (sem DOM, sem rede). Testadas em tests/calc.test.js.
import {
  addDays, addMonthsISO, addMonthsYM, businessDaysBetween, daysBetween, daysInMonth,
  groupBy, ymOf, sum, ymLabel, MONTHS, round2, parseISO,
} from './util.js';

export const CLASSES = {
  ACAO_BR: 'Ações BR', FII: 'FIIs', ETF: 'ETFs', EUA_BDR: 'EUA / BDR', RENDA_FIXA: 'Renda fixa', CRIPTO: 'Cripto',
};
export const CLASS_ORDER = Object.keys(CLASSES);

// =====================================================================
// INVESTIMENTOS — posição e preço médio
// =====================================================================

const txOrder = (a, b) => a.date.localeCompare(b.date) || (a.type === b.type ? 0 : a.type === 'COMPRA' ? -1 : 1) || (a.createdAt || '').localeCompare(b.createdAt || '');

/** PM = (Σ qtd×preço + Σ taxas das compras) ÷ Σ qtd. Venda não altera PM; zerou → reinicia. */
export function position(txs, upTo = null) {
  let qty = 0, cost = 0, realized = 0, bought = 0, sold = 0;
  for (const t of [...txs].sort(txOrder)) {
    if (upTo && t.date > upTo) break;
    const q = +t.quantity, p = +t.price, f = +t.fees || 0;
    if (t.type === 'COMPRA') { cost += q * p + f; qty += q; bought += q * p + f; }
    else {
      const pm = qty > 0 ? cost / qty : 0;
      const sq = Math.min(q, qty);
      realized += (p - pm) * sq - f;
      sold += p * sq - f;
      qty -= sq; cost = qty * pm;
      if (qty < 1e-9) { qty = 0; cost = 0; }
    }
  }
  return { qty, cost, pm: qty > 0 ? cost / qty : 0, realized, bought, sold };
}

/** Prévia ao vivo do formulário "Registrar compra". */
export function previewTx(txs, nt) {
  const before = position(txs);
  const after = position([...txs, { ...nt, id: '__preview__' }]);
  return { before, after };
}

/** Validação do formulário. Retorna lista de erros (vazia = ok). */
export function validateTx(txs, nt, today) {
  const e = [];
  if (!(+nt.quantity > 0)) e.push('Quantidade deve ser maior que zero.');
  if (!(+nt.price > 0)) e.push('Preço deve ser maior que zero.');
  if ((+nt.fees || 0) < 0) e.push('Taxas não podem ser negativas.');
  if (!nt.date) e.push('Informe a data.');
  else if (nt.date > today) e.push('A data não pode ser futura.');
  if (nt.type === 'VENDA' && nt.date) {
    const others = txs.filter(t => t.id !== nt.id);
    const pos = position(others, nt.date);
    // posição atual considerando vendas posteriores também (não pode zerar além do possível)
    const after = position([...others, nt]);
    if (+nt.quantity > pos.qty + 1e-9) e.push(`Venda excede a posição (${pos.qty} na data).`);
    else if (after.qty < -1e-9) e.push('Venda deixaria a posição negativa.');
  }
  return e;
}

/** Valor atual e métricas da posição. fx = câmbio p/ moedas ≠ BRL. */
export function valuePosition(pos, price, fx = 1, prevClose = null) {
  const value = pos.qty * price * fx;
  const res = value - pos.cost;
  const dayPct = prevClose && prevClose > 0 ? price / prevClose - 1 : 0;
  const dayValue = prevClose && prevClose > 0 ? pos.qty * (price - prevClose) * fx : 0;
  return { value, res, resPct: pos.cost > 0 ? res / pos.cost : 0, dayPct, dayValue };
}

// =====================================================================
// Séries de CDI / IPCA
// =====================================================================

/** Índice cumulativo do CDI p/ consultas O(log n). series: [{date,v}] com v = taxa diária em %. */
export function makeCdi(series) {
  const s = [...series].sort((a, b) => a.date.localeCompare(b.date));
  const dates = s.map(x => x.date);
  const cum = []; let c = 1;
  for (const x of s) { c *= 1 + x.v / 100; cum.push(c); }
  const idx = d => { // último índice com date <= d
    let lo = 0, hi = dates.length - 1, r = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (dates[m] <= d) { r = m; lo = m + 1; } else hi = m - 1; }
    return r;
  };
  const at = d => { const i = idx(d); return i < 0 ? 1 : cum[i]; };
  const lastDate = dates.length ? dates[dates.length - 1] : null;
  const lastV = s.length ? s[s.length - 1].v : 0;
  return {
    empty: s.length === 0, lastDate, lastV,
    /** fator acumulado em (from, to]. Dias úteis após o último dado usam o último valor (estimativa). */
    factor(from, to) {
      if (!s.length || to <= from) return 1;
      const end = lastDate && to > lastDate ? lastDate : to;
      let f = end > from ? at(end) / at(from < dates[0] ? addDays(dates[0], -1) : from) : 1;
      if (lastDate && to > lastDate) {
        const start = from > lastDate ? from : lastDate;
        f *= Math.pow(1 + lastV / 100, businessDaysBetween(start, to));
      }
      return f;
    },
    acc(from, to) { return this.factor(from, to) - 1; },
  };
}

export const pctOfCdi = (rp, rc) => (rc > 0 ? (rp / rc) * 100 : null);

/** R$ a mais (ou a menos) que o CDI: valor atual − valor se cada fluxo rendesse 100% do CDI. */
export function extraOverCdi(flows, cdi, currentValue, asOf) {
  let hyp = 0;
  for (const f of flows) hyp += f.amount * cdi.factor(f.date, asOf);
  return { hypothetical: hyp, extra: currentValue - hyp };
}

// =====================================================================
// Renda fixa — valor "na curva" (estimativa; não é marcação a mercado, valor bruto)
// =====================================================================

/**
 * fi: { indexer: 'CDI' | 'PRE' | 'IPCA', rate }
 *  CDI  -> rate = % do CDI (ex.: 110)
 *  PRE  -> rate = % a.a. (ex.: 12.5), base 252 dias úteis
 *  IPCA -> rate = % a.a. real (ex.: 6), base 365 + IPCA acumulado (série mensal)
 */
export function fixedIncomeValue(principal, start, asOf, fi, cdi, ipca = []) {
  if (asOf <= start) return principal;
  const r = +fi.rate || 0;
  if (fi.indexer === 'PRE') {
    return principal * Math.pow(1 + r / 100, businessDaysBetween(start, asOf) / 252);
  }
  if (fi.indexer === 'IPCA') {
    // IPCA: meses de referência com início > mês do aporte e < mês de asOf (publicados); falta é ignorado.
    const sYM = ymOf(start), eYM = ymOf(asOf);
    let f = 1;
    for (const m of ipca) { const ym = ymOf(m.date); if (ym > sYM && ym < eYM) f *= 1 + m.v / 100; }
    return principal * f * Math.pow(1 + r / 100, daysBetween(start, asOf) / 365);
  }
  // CDI
  const dailyAdj = r / 100;
  if (dailyAdj === 1) return principal * cdi.factor(start, asOf);
  // % do CDI: aproxima Π(1 + cdi_i × pct) por (Π(1 + cdi_i))^pct (diferença desprezível para taxas diárias).
  const f = cdi.factor(start, asOf);
  return principal * Math.pow(f, dailyAdj);
}

// =====================================================================
// Rentabilidade da carteira (TWR / cotização) vs CDI
// =====================================================================

/** snaps: [{date, value, netFlow, income}] → [{date, twr}] acumulado (decimal). */
export function twrSeries(snaps) {
  const s = [...snaps].sort((a, b) => a.date.localeCompare(b.date));
  const out = []; let cum = 1, prev = null;
  for (const x of s) {
    let r = 0;
    if (prev && prev.value > 0) r = (x.value + (x.income || 0) - (x.netFlow || 0)) / prev.value - 1;
    if (r <= -0.99) r = 0; // dado incoerente (valor menor que o aporte do dia): ignora o passo em vez de gerar retorno < −100%
    cum *= 1 + r;
    out.push({ date: x.date, twr: cum - 1, est: !!x.est });
    prev = x;
  }
  // Trechos estimados (sem histórico de preço) ficam planos e concentram o retorno no 1º ponto real.
  // Distribui esse retorno de forma geométrica ao longo do trecho (interpolação), sem alterar o ponto final.
  for (let i = 0; i < out.length; i++) {
    if (!out[i].est) continue;
    let j = i; while (j + 1 < out.length && out[j + 1].est) j++;
    const k = j + 1;
    if (k < out.length) {
      const st = Math.max(i, 1), c0 = 1 + out[st - 1].twr, n = k - st + 1, g = Math.pow((1 + out[k].twr) / c0, 1 / n);
      for (let m = st; m <= j; m++) out[m].twr = c0 * Math.pow(g, m - st + 1) - 1;
    }
    i = j;
  }
  return out;
}

/** Série comparativa rebaseada em `from`: [{date, port, cdi}]. */
export function perfSeries(snaps, cdi, from = null) {
  const tw = twrSeries(snaps);
  if (!tw.length) return [];
  const start = from ? tw.filter(x => x.date >= from) : tw;
  if (!start.length) return [];
  const base = 1 + start[0].twr, d0 = start[0].date;
  return start.map(x => ({ date: x.date, port: (1 + x.twr) / base - 1, cdi: cdi.acc(d0, x.date), est: x.est }));
}

/** Retornos mensais encadeados a partir da série diária (twr acumulado). */
export function monthlyReturns(snaps, cdi) {
  const tw = twrSeries(snaps);
  const byM = groupBy(tw, x => ymOf(x.date));
  const out = []; let prevCum = 0, prevDate = null;
  for (const ym of Object.keys(byM).sort()) {
    const last = byM[ym][byM[ym].length - 1];
    const port = (1 + last.twr) / (1 + prevCum) - 1;
    const first = byM[ym][0].date;
    const from = prevDate || addDays(first, -1);
    const c = cdi.acc(from, last.date);
    out.push({ ym, port, cdi: c, pctCdi: pctOfCdi(port, c) });
    prevCum = last.twr; prevDate = last.date;
  }
  return out;
}

/**
 * Série MENSAL acumulada (um ponto por fim de mês, como o Investidor10): encadeia os retornos mensais da carteira e do CDI.
 * `fromYM`: primeiro mês incluído (null = tudo). Ponto 0 = fechamento do mês anterior (ou 1º dia do histórico), acumulado 0%.
 * Saída: [{date, ym, port, cdi, est, partial}] — o último mês termina no último snapshot (mês em andamento).
 */
export function perfMonthly(snaps, cdi, fromYM = null) {
  const tw = twrSeries(snaps);
  if (!tw.length) return [];
  const mr = monthlyReturns(snaps, cdi);
  const lastOf = {}; for (const x of tw) lastOf[ymOf(x.date)] = x;
  const sel = fromYM ? mr.filter(m => m.ym >= fromYM) : mr;
  if (!sel.length) return [];
  const prev = mr[mr.indexOf(sel[0]) - 1];
  const startDate = prev ? lastOf[prev.ym].date : tw[0].date;
  const pts = [{ date: startDate, ym: ymOf(startDate), port: 0, cdi: 0, est: false, partial: false }];
  let p = 1, c = 1;
  sel.forEach((m, i) => {
    p *= 1 + m.port; c *= 1 + m.cdi;
    const l = lastOf[m.ym];
    pts.push({ date: l.date, ym: m.ym, port: p - 1, cdi: c - 1, est: !!l.est, partial: i === sel.length - 1 && m.ym === ymOf(tw[tw.length - 1].date) });
  });
  return pts;
}

/**
 * Quadro anual no estilo "Jan…Dez": rentabilidade de cada mês (encadeada, TWR), retorno do ano e acumulado desde o início.
 * Entrada: saída de monthlyReturns. Saída: [{ year, months:[{port,cdi}|null ×12], port, cdi, accPort, accCdi }].
 */
export function monthlyGrid(mr) {
  const years = {};
  for (const m of mr) { const y = m.ym.slice(0, 4), i = +m.ym.slice(5, 7) - 1; (years[y] ||= Array(12).fill(null))[i] = { port: m.port, cdi: m.cdi }; }
  const out = []; let accP = 1, accC = 1;
  for (const y of Object.keys(years).sort()) {
    const ms = years[y]; let p = 1, c = 1;
    for (const m of ms) if (m) { p *= 1 + m.port; c *= 1 + m.cdi; }
    accP *= p; accC *= c;
    out.push({ year: +y, months: ms, port: p - 1, cdi: c - 1, accPort: accP - 1, accCdi: accC - 1 });
  }
  return out;
}

/**
 * Patrimônio mês a mês = valor aplicado + retorno total.
 *  aplicado = aportes líquidos acumulados (compras − vendas) até o fim do mês
 *  ganho    = valor de mercado da carteira (último snapshot do mês) − aplicado
 *  prov     = proventos recebidos (data de pagamento) acumulados até o fim do mês
 *  ret      = ganho + prov (retorno total)      total = aplicado + ret
 * snaps: [{date,value,est}], flows: [{date,amount}], divs: [{payDate,amount}], today: ISO. Mês corrente termina em `today`.
 */
export function monthlyPatrimony(snaps, flows, divs, today) {
  if (!flows.length) return [];
  const S = [...snaps].sort((a, b) => a.date.localeCompare(b.date)), F = [...flows].sort((a, b) => a.date.localeCompare(b.date));
  const first = F[0].date.slice(0, 7), cur = today.slice(0, 7), out = [];
  for (let ym = first; ym <= cur; ym = nextYM(ym)) {
    const [y, m] = ym.split('-').map(Number), last = `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
    const end = last > today ? today : last;
    const aplicado = F.filter(f => f.date <= end).reduce((s, f) => s + f.amount, 0);
    let snap = null; for (const s of S) { if (s.date <= end) snap = s; else break; }
    const value = snap ? snap.value : aplicado;
    const prov = divs.filter(d => d.payDate <= end).reduce((s, d) => s + +d.amount, 0);
    const gain = value - aplicado, ret = gain + prov;
    out.push({ ym, end, aplicado, value, gain, prov, ret, total: aplicado + ret, est: !!snap?.est, partial: end === today && last > today });
  }
  return out;
}
const nextYM = ym => { const [y, m] = ym.split('-').map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`; };

// =====================================================================
// Proventos
// =====================================================================

export const JCP_IR = 0.15;
export const netDividend = (type, gross) => (type === 'JCP' ? gross * (1 - JCP_IR) : gross);

export function dividendsLast12m(divs, today) {
  const from = addMonthsISO(today, -12);
  return sum(divs.filter(d => d.payDate > from && d.payDate <= today), d => +d.amount);
}
export const yieldOnCost = (div12m, cost) => (cost > 0 ? div12m / cost : 0);

// =====================================================================
// Rebalanceamento por aporte (sem vender)
// =====================================================================

/**
 * values: {classe: valorAtual}; targets: {classe: percentual (0-100)}; aporte: R$
 * Retorna {classe: valorAComprar}.
 */
export function rebalance(values, targets, aporte) {
  const classes = Object.keys(targets).filter(k => targets[k] > 0);
  const total = sum(Object.values(values));
  const tsum = sum(classes, k => targets[k]) || 1;
  const goal = {}; const deficit = {};
  for (const k of classes) {
    goal[k] = (targets[k] / tsum) * (total + aporte);
    deficit[k] = Math.max(0, goal[k] - (values[k] || 0));
  }
  const dsum = sum(classes, k => deficit[k]);
  const buy = {};
  if (aporte <= 0) { classes.forEach(k => buy[k] = 0); return buy; }
  if (dsum >= aporte) {
    for (const k of classes) buy[k] = dsum > 0 ? (aporte * deficit[k]) / dsum : 0;
  } else {
    const rest = aporte - dsum;
    for (const k of classes) buy[k] = deficit[k] + (rest * targets[k]) / tsum;
  }
  return buy;
}

/** Distribui o valor de uma classe entre seus ativos, aproximando pesos iguais. assets: [{ticker,value}] */
export function splitWithinClass(assets, amount) {
  if (!assets.length || amount <= 0) return {};
  const total = sum(assets, a => a.value);
  const goal = (total + amount) / assets.length;
  const def = assets.map(a => ({ t: a.ticker, d: Math.max(0, goal - a.value) }));
  const dsum = sum(def, x => x.d);
  const out = {};
  for (const x of def) out[x.t] = dsum >= amount ? (amount * x.d) / dsum : x.d + (amount - dsum) / assets.length;
  return out;
}

// =====================================================================
// FINANÇAS
// =====================================================================

export const isExpense = t => t.kind === 'despesa';
export const isIncome = t => t.kind === 'receita';
export const isAporte = t => t.kind === 'aporte';
export const abs = v => Math.abs(+v);

export function monthSummary(txs, ym, upTo = null) {
  const m = txs.filter(t => ymOf(t.date) === ym && (!upTo || t.date <= upTo));
  const income = sum(m.filter(isIncome), t => abs(t.amount));
  const expense = sum(m.filter(isExpense), t => abs(t.amount));
  const aporte = sum(m.filter(isAporte), t => abs(t.amount));
  return { income, expense, aporte, balance: income - expense - aporte, count: m.length };
}

export function monthlySeries(txs, endYM, n = 12, upTo = null) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) { const ym = addMonthsYM(endYM, -i); out.push({ ym, ...monthSummary(txs, ym, upTo) }); }
  return out;
}

export function spentByCategory(txs, ym, upTo = null) {
  const out = {};
  for (const t of txs) {
    if (ymOf(t.date) !== ym || (upTo && t.date > upTo)) continue;
    if (isExpense(t) || isAporte(t)) out[t.category] = (out[t.category] || 0) + abs(t.amount);
  }
  return out;
}

const NEUTRAL_CATS = ['Invest Fácil', 'Rendimentos'];
/** Saldo atual de uma conta = inicial + movimentos (cartão não mexe no saldo; fatura paga mexe). */
export function accountBalance(account, txs, upTo = null) {
  let b = +account.initialBalance || 0;
  for (const t of txs) {
    if (t.accountId !== account.id || t.cardId) continue;
    if (NEUTRAL_CATS.includes(t.category)) continue; // movimentos internos (ex.: Invest Fácil) não alteram o saldo total do banco
    if (upTo && t.date > upTo) continue;
    b += +t.amount;
  }
  return b;
}

// ---- Cartões ----
const clampDay = (ym, d) => `${ym}-${String(Math.min(d, daysInMonth(ym))).padStart(2, '0')}`;

/** Ciclo da fatura que FECHA no mês `ym`. */
export function invoiceCycle(card, ym) {
  const close = clampDay(ym, +card.closeDay);
  const prevClose = clampDay(addMonthsYM(ym, -1), +card.closeDay);
  const dueYM = +card.dueDay > +card.closeDay ? ym : addMonthsYM(ym, 1);
  return { ym, close, from: addDays(prevClose, 1), to: close, due: clampDay(dueYM, +card.dueDay) };
}

/** Mês da fatura aberta hoje (a primeira cujo fechamento ainda não passou). */
export function openInvoiceYM(card, today) {
  const ym = ymOf(today);
  return invoiceCycle(card, ym).close >= today ? ym : addMonthsYM(ym, 1);
}

export function invoiceItems(card, txs, ym) {
  const c = invoiceCycle(card, ym);
  const items = txs.filter(t => t.cardId === card.id && t.date >= c.from && t.date <= c.to && t.kind === 'despesa');
  return { ...c, items, total: sum(items, t => abs(t.amount)) };
}

/** Parcelas futuras comprometidas por mês (a partir de fromYM). */
export function installmentsCommitted(txs, fromYM, n = 6) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const ym = addMonthsYM(fromYM, i);
    out.push({ ym, total: sum(txs.filter(t => t.installmentTotal > 1 && ymOf(t.date) === ym && t.kind === 'despesa'), t => abs(t.amount)) });
  }
  return out;
}

/** Parcelamentos ativos agrupados por série. */
export function activeInstallments(txs, today) {
  const bySeries = groupBy(txs.filter(t => t.installmentTotal > 1 && t.seriesId), t => t.seriesId);
  const out = [];
  for (const rows of Object.values(bySeries)) {
    rows.sort((a, b) => a.date.localeCompare(b.date));
    const paid = rows.filter(r => r.date <= today);
    const cur = paid[paid.length - 1] || rows[0];
    if (rows.every(r => r.date <= today) && cur.installmentNo >= cur.installmentTotal) continue; // quitado
    out.push({ desc: cur.description.replace(/\s*\(\d+\/\d+\)$/, ''), no: cur.installmentNo, total: cur.installmentTotal, v: abs(cur.amount), cardId: cur.cardId });
  }
  return out;
}

// ---- Contas a pagar ----
/**
 * Gera as ocorrências de contas de um mês: contas cadastradas + faturas dos cartões.
 * bills: [{id,name,dueDay,amount,meta,recurrence,startYm,installments,...}], payments: [{id: 'billId|YYYY-MM', paid, ...}]
 */
export function billsForMonth(bills, cards, txs, payments, ym) {
  const pay = Object.fromEntries(payments.map(p => [p.id, p]));
  const out = [];
  for (const b of bills) {
    if (b.startYm && ym < b.startYm) continue;
    let label = b.meta || '';
    if (b.recurrence === 'installment') {
      const k = monthsDiff(b.startYm, ym) + 1;
      if (k < 1 || k > b.installments) continue;
      label = `parcela ${k} de ${b.installments}`;
    } else if (b.recurrence === 'once') {
      if (ym !== b.startYm) continue;
    }
    const key = `${b.id}|${ym}`;
    out.push({ key, id: b.id, kind: 'bill', name: b.name, meta: label, day: Math.min(+b.dueDay, daysInMonth(ym)), date: clampDay(ym, +b.dueDay), amount: +b.amount, paid: !!pay[key], payment: pay[key] || null });
  }
  for (const c of cards) {
    // fatura que vence neste mês
    for (const closeYM of [addMonthsYM(ym, -1), ym]) {
      const inv = invoiceItems(c, txs, closeYM);
      if (ymOf(inv.due) !== ym || inv.total <= 0) continue;
      const key = `card:${c.id}|${closeYM}`;
      out.push({ key, id: c.id, kind: 'card', name: `Fatura ${c.name}`, meta: 'cartão de crédito', day: +inv.due.slice(8), date: inv.due, amount: inv.total, paid: !!pay[key], payment: pay[key] || null, closeYM });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}
export const monthsDiff = (a, b) => { const [y1, m1] = a.split('-').map(Number); const [y2, m2] = b.split('-').map(Number); return (y2 - y1) * 12 + (m2 - m1); };

// ---- Metas ----
export function goalForecast(g, todayYM) {
  const left = Math.max(0, g.target - g.saved);
  const months = g.monthly > 0 ? Math.ceil(left / g.monthly) : Infinity;
  const finishYM = isFinite(months) ? addMonthsYM(todayYM, months) : null;
  const need = g.deadline && g.deadline > todayYM ? left / Math.max(1, monthsDiff(todayYM, g.deadline)) : null;
  const onTrack = left === 0 || (need == null ? g.monthly > 0 : g.monthly >= need - 0.5);
  return { left, months, finishYM, need, onTrack, ratio: g.target > 0 ? Math.min(1, g.saved / g.target) : 0 };
}

// ---- Insights (Relatórios) ----
export function buildInsights({ txs, plans = {}, goals = [], todayYM, today = null }) {
  const series = monthlySeries(txs, todayYM, 12, today).filter(m => m.ym < todayYM || m.income + m.expense > 0);
  const closed = series.filter(m => m.ym < todayYM);
  const items = [], good = [];
  const incAvg = closed.length ? sum(closed, m => m.income) / closed.length : 0;
  const expAvg = closed.length ? sum(closed, m => m.expense) / closed.length : 0;
  const rate = incAvg > 0 ? 1 - expAvg / incAvg : null;

  // 1) mês acima de 85% da receita
  const over = closed.filter(m => m.income > 0 && m.expense / m.income > 0.85);
  if (over.length) {
    const worst = over.reduce((a, b) => (b.expense / b.income > a.expense / a.income ? b : a));
    const cap = Math.round((incAvg * 0.8) / 100) * 100;
    items.push({ id: 'gasto', cat: 'Hábitos', icon: 'ph ph-chart-bar', imp: 'alto',
      title: `${MONTHS[+worst.ym.slice(5) - 1]} passou de 85% da receita`,
      desc: `Em ${MONTHS[+worst.ym.slice(5) - 1].toLowerCase()} os gastos chegaram a ${Math.round((worst.expense / worst.income) * 100)}% da receita. ${over.length} dos últimos ${closed.length} meses ficaram acima de 85%.`,
      action: `Definir teto mensal de despesas de R$ ${cap.toLocaleString('pt-BR')} no Orçamento, com alerta em 80%`,
      save: Math.round(sum(over, m => m.expense - 0.85 * m.income)) });
  }

  // 2) categorias que cresceram (3 últimos meses fechados vs 3 anteriores)
  const rec = [1, 2, 3].map(i => addMonthsYM(todayYM, -i)), prv = [4, 5, 6].map(i => addMonthsYM(todayYM, -i));
  const cats = new Set(txs.filter(isExpense).map(t => t.category));
  const growth = [];
  for (const c of cats) {
    const r = sum(rec, ym => spentByCategory(txs, ym)[c] || 0) / 3, p = sum(prv, ym => spentByCategory(txs, ym)[c] || 0) / 3;
    if (p > 50 && r > 150 && r / p - 1 > 0.25) growth.push({ c, r, p, g: r / p - 1 });
  }
  growth.sort((a, b) => b.r - b.p - (a.r - a.p)).slice(0, 2).forEach((x, i) => items.push({
    id: 'cresc-' + x.c, cat: 'Hábitos', icon: 'ph ph-trend-up', imp: i === 0 ? 'alto' : 'médio',
    title: `${x.c} cresceu ${Math.round(x.g * 100)}% no trimestre`,
    desc: `Média de R$ ${Math.round(x.r).toLocaleString('pt-BR')}/mês nos últimos 3 meses, contra R$ ${Math.round(x.p).toLocaleString('pt-BR')} nos 3 anteriores.`,
    action: `Criar teto para ${x.c} de R$ ${Math.round(x.p * 1.1 / 10) * 10} no Orçamento`,
    save: Math.round((x.r - x.p * 1.1) * 12) }));

  // 3) assinaturas recorrentes
  const subs = txs.filter(t => isExpense(t) && t.category === 'Assinaturas' && ymOf(t.date) === addMonthsYM(todayYM, 0));
  const subsTotal = sum(subs, t => abs(t.amount));
  if (subs.length >= 3 && subsTotal > 0) items.push({ id: 'assin', cat: 'Economia', icon: 'ph ph-repeat', imp: 'médio',
    title: `R$ ${Math.round(subsTotal).toLocaleString('pt-BR')}/mês em ${subs.length} assinaturas`,
    desc: `Itens: ${subs.map(t => t.description).join(', ')}.`,
    action: 'Revisar assinaturas e cancelar as que não usa', save: Math.round(subsTotal * 12 * 0.25) });

  // 4) parcelamentos comprometidos
  const inst = installmentsCommitted(txs, addMonthsYM(todayYM, 1), 1)[0];
  if (inst.total > 0 && incAvg > 0 && inst.total / incAvg >= 0.05) items.push({ id: 'parcel', cat: 'Dívidas', icon: 'ph ph-credit-card', imp: inst.total / incAvg > 0.15 ? 'alto' : 'médio',
    title: `Parcelamentos comprometem R$ ${Math.round(inst.total).toLocaleString('pt-BR')}/mês`,
    desc: `Equivale a ${Math.round((inst.total / incAvg) * 100)}% da receita média. Novas parcelas reduzem a margem para aportes.`,
    action: 'Evitar novos parcelamentos até quitar os atuais e acompanhar em Cartões', save: 0 });

  // 5) reserva de emergência
  const res = goals.find(g => /reserva/i.test(g.name));
  if (res && expAvg > 0) {
    const months = res.saved / expAvg, target6 = expAvg * 6;
    if (months < 6) items.push({ id: 'reserva', cat: 'Reserva', icon: 'ph ph-lifebuoy', imp: months < 3 ? 'alto' : 'baixo',
      title: `Reserva cobre ${months.toFixed(1).replace('.', ',')} meses de despesas`,
      desc: `A recomendação é de 6 meses (R$ ${Math.round(target6).toLocaleString('pt-BR')} com seu gasto médio de R$ ${Math.round(expAvg).toLocaleString('pt-BR')}). Faltam R$ ${Math.round(target6 - res.saved).toLocaleString('pt-BR')}.`,
      action: `Direcionar o aporte mensal da meta "${res.name}" até completar`, save: 0 });
    else good.push({ t: 'Reserva completa.', d: `Cobre ${months.toFixed(1).replace('.', ',')} meses de despesas.` });
  }

  // 6) aportes abaixo do planejado
  const plan = +plans['Aporte em investimentos'] || 0;
  if (plan > 0) {
    const last6 = closed.slice(-6), low = last6.filter(m => m.aporte < plan * 0.7);
    if (low.length >= 2) items.push({ id: 'aporte', cat: 'Reserva', icon: 'ph ph-chart-line-up', imp: 'baixo',
      title: `Aportes abaixo do planejado em ${low.length} dos últimos ${last6.length} meses`,
      desc: `O orçamento prevê R$ ${Math.round(plan).toLocaleString('pt-BR')}/mês; em ${low.map(m => MONTHS[+m.ym.slice(5) - 1].slice(0, 3).toLowerCase()).join(', ')} você aportou menos de 70% disso.`,
      action: 'Agendar transferência no dia do salário', save: 0 });
    else if (last6.length >= 3) good.push({ t: 'Aportes consistentes.', d: 'Acima de 70% do planejado na maioria dos meses.' });
  }

  if (rate != null && rate >= 0.2) good.push({ t: `Taxa de poupança de ${Math.round(rate * 100)}%.`, d: 'Receita menos despesas nos meses fechados.' });
  const unpaidInterest = txs.some(t => /juros|multa|mora/i.test(t.description) && isExpense(t) && ymOf(t.date) >= addMonthsYM(todayYM, -12));
  if (!unpaidInterest && closed.length >= 3) good.push({ t: 'Sem juros ou multas', d: 'Nenhum lançamento de juros/multa nos últimos 12 meses.' });

  const saveYear = sum(items, i => i.save);
  const rateNow = incAvg > 0 ? 1 - expAvg / incAvg : 0;
  return { items, good, saveYear, rateNow, rateAfter: incAvg > 0 ? rateNow + saveYear / 12 / incAvg : rateNow, incAvg, expAvg };
}

// ---- Recorrência / parcelas ----
/** Gera as ocorrências de um lançamento. mode: 'none' | 'monthly' | 'installment' */
export function expandRecurrence(base, mode, n, ids) {
  if (mode === 'installment' && n > 1) {
    const total = round2(abs(base.amount)); const each = Math.floor((total * 100) / n) / 100; const sign = Math.sign(base.amount) || -1;
    return Array.from({ length: n }, (_, i) => {
      const last = i === n - 1; const v = last ? round2(total - each * (n - 1)) : each;
      return { ...base, id: ids[i], date: addMonthsISO(base.date, i), amount: sign * v, installmentNo: i + 1, installmentTotal: n, description: `${base.description} (${i + 1}/${n})` };
    });
  }
  if (mode === 'monthly') return Array.from({ length: n }, (_, i) => ({ ...base, id: ids[i], date: addMonthsISO(base.date, i), recurrence: 'monthly' }));
  return [{ ...base, id: ids[0] }];
}
