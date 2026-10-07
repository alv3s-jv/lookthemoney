import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../js/calc.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`);
const buy = (date, quantity, price, fees = 0) => ({ id: date + quantity, type: 'COMPRA', date, quantity, price, fees });
const sell = (date, quantity, price, fees = 0) => ({ id: 's' + date + quantity, type: 'VENDA', date, quantity, price, fees });

test('preço médio: compras com taxas', () => {
  const p = C.position([buy('2026-01-10', 100, 30, 5), buy('2026-02-10', 200, 39, 5)]);
  assert.equal(p.qty, 300);
  near(p.cost, 100 * 30 + 5 + 200 * 39 + 5);
  near(p.pm, (3000 + 5 + 7800 + 5) / 300);
});

test('venda não altera PM, reduz quantidade e realiza lucro', () => {
  const p = C.position([buy('2026-01-10', 100, 10), sell('2026-02-10', 40, 15, 2)]);
  assert.equal(p.qty, 60);
  near(p.pm, 10);
  near(p.cost, 600);
  near(p.realized, (15 - 10) * 40 - 2);
});

test('posição zerada reinicia o PM', () => {
  const p = C.position([buy('2026-01-10', 10, 10), sell('2026-01-20', 10, 12), buy('2026-02-10', 5, 20)]);
  assert.equal(p.qty, 5); near(p.pm, 20);
});

test('previewTx: antes/depois', () => {
  const txs = [buy('2026-01-10', 300, 36.1)];
  const { before, after } = C.previewTx(txs, buy('2026-03-01', 100, 47.33));
  near(before.pm, 36.1); assert.equal(after.qty, 400);
  near(after.pm, (300 * 36.1 + 100 * 47.33) / 400);
});

test('validateTx: qtd, preço, data futura, venda acima da posição', () => {
  const txs = [buy('2026-01-10', 10, 10)];
  assert.ok(C.validateTx(txs, buy('2026-01-10', 0, 10), '2026-10-05').length);
  assert.ok(C.validateTx(txs, buy('2026-01-10', 1, 0), '2026-10-05').length);
  assert.ok(C.validateTx(txs, buy('2027-01-10', 1, 1), '2026-10-05').length);
  assert.ok(C.validateTx(txs, sell('2026-02-10', 11, 1), '2026-10-05').length);
  assert.equal(C.validateTx(txs, sell('2026-02-10', 10, 1), '2026-10-05').length, 0);
});

test('valuePosition: valorização, % e variação do dia', () => {
  const v = C.valuePosition({ qty: 100, cost: 3000 }, 47.33, 1, 46.35);
  near(v.value, 4733); near(v.res, 1733); near(v.resPct, 1733 / 3000);
  near(v.dayValue, 98); near(v.dayPct, 47.33 / 46.35 - 1);
});

test('CDI: fator acumulado e extrapolação em dias úteis', () => {
  const s = [{ date: '2026-10-01', v: 0.05 }, { date: '2026-10-02', v: 0.05 }, { date: '2026-10-05', v: 0.05 }];
  const cdi = C.makeCdi(s);
  near(cdi.factor('2026-09-30', '2026-10-05'), Math.pow(1.0005, 3));
  near(cdi.factor('2026-10-01', '2026-10-05'), Math.pow(1.0005, 2));
  // 06/10 (ter) e 07/10 (qua) estimados com o último valor
  near(cdi.factor('2026-10-05', '2026-10-07'), Math.pow(1.0005, 2));
  assert.equal(cdi.factor('2026-10-05', '2026-10-05'), 1);
});

test('% do CDI e R$ a mais que o CDI', () => {
  near(C.pctOfCdi(0.132, 0.1), 132);
  const cdi = C.makeCdi([{ date: '2026-01-02', v: 0.05 }, { date: '2026-01-05', v: 0.05 }]);
  const r = C.extraOverCdi([{ date: '2026-01-01', amount: 1000 }], cdi, 1010, '2026-01-05');
  near(r.hypothetical, 1000 * 1.0005 * 1.0005); near(r.extra, 1010 - r.hypothetical);
});

test('renda fixa: pré, %CDI e IPCA+', () => {
  const cdi = C.makeCdi([]);
  const pre = C.fixedIncomeValue(1000, '2026-01-02', '2026-01-30', { indexer: 'PRE', rate: 12 }, cdi);
  near(pre, 1000 * Math.pow(1.12, 20 / 252), 1e-6);
  const days = Array.from({ length: 3 }, (_, i) => ({ date: `2026-01-0${i + 5}`, v: 0.04 }));
  const c2 = C.makeCdi(days);
  near(C.fixedIncomeValue(1000, '2026-01-02', '2026-01-07', { indexer: 'CDI', rate: 100 }, c2), 1000 * Math.pow(1.0004, 3));
  const ip = [{ date: '2026-02-01', v: 0.5 }, { date: '2026-03-01', v: 0.4 }];
  const v = C.fixedIncomeValue(1000, '2026-01-15', '2026-04-15', { indexer: 'IPCA', rate: 6 }, cdi, ip);
  near(v, 1000 * 1.005 * 1.004 * Math.pow(1.06, 90 / 365), 1e-6);
});

test('TWR: aporte não aparece como rendimento', () => {
  const snaps = [
    { date: '2026-01-01', value: 1000, netFlow: 1000 },
    { date: '2026-01-02', value: 2020, netFlow: 1000 },    // +2% de ganho sobre 1000, aporte 1000
    { date: '2026-01-03', value: 2020 * 1.01, netFlow: 0 },
  ];
  const s = C.twrSeries(snaps);
  near(s[1].twr, 0.02); near(s[2].twr, 1.02 * 1.01 - 1);
});

test('TWR: proventos entram como ganho', () => {
  const s = C.twrSeries([{ date: '2026-01-01', value: 1000, netFlow: 0 }, { date: '2026-01-02', value: 1000, netFlow: 0, income: 10 }]);
  near(s[1].twr, 0.01);
});

test('perfSeries rebaseia no início e compara com CDI', () => {
  const cdi = C.makeCdi([{ date: '2026-01-02', v: 1 }, { date: '2026-01-05', v: 1 }]);
  const snaps = [{ date: '2026-01-01', value: 100, netFlow: 100 }, { date: '2026-01-02', value: 102, netFlow: 0 }, { date: '2026-01-05', value: 104.04, netFlow: 0 }];
  const p = C.perfSeries(snaps, cdi);
  near(p[2].port, 0.0404); near(p[2].cdi, 1.01 * 1.01 - 1);
});

test('retornos mensais encadeados', () => {
  const cdi = C.makeCdi([]);
  const m = C.monthlyReturns([
    { date: '2026-01-30', value: 100, netFlow: 100 }, { date: '2026-01-31', value: 101, netFlow: 0 },
    { date: '2026-02-27', value: 101 * 1.02, netFlow: 0 }], cdi);
  near(m[0].port, 0.01); near(m[1].port, 0.02);
});

test('proventos: JCP com IR 15% e yield on cost', () => {
  near(C.netDividend('JCP', 100), 85); near(C.netDividend('DIVIDENDO', 100), 100);
  const d = [{ payDate: '2026-09-01', amount: 100 }, { payDate: '2025-01-01', amount: 999 }, { payDate: '2025-10-05', amount: 50 }];
  near(C.dividendsLast12m(d, '2026-10-05'), 100);
  near(C.yieldOnCost(120, 1000), 0.12);
});

test('rebalanceamento: nunca vende, soma = aporte, prioriza déficits', () => {
  const values = { A: 700, B: 300 };
  const targets = { A: 50, B: 50 };
  const buy = C.rebalance(values, targets, 200);
  near(buy.A, 0); near(buy.B, 200);
  const b2 = C.rebalance(values, targets, 600); // déficit B = 400 < 600 → cobre e reparte o resto 50/50
  near(b2.A + b2.B, 600); near(b2.B, 400 + 100); near(b2.A, 100);
  const b3 = C.rebalance({ A: 100, B: 100 }, { A: 70, B: 30 }, 100);
  near(b3.A + b3.B, 100);
  for (const v of Object.values(b3)) assert.ok(v >= 0);
});

test('splitWithinClass distribui por déficit', () => {
  const r = C.splitWithinClass([{ ticker: 'X', value: 300 }, { ticker: 'Y', value: 100 }], 200);
  near(r.X, 0); near(r.Y, 200);
});

test('finanças: resumo mensal separa aportes das despesas', () => {
  const tx = [
    { date: '2026-10-01', kind: 'receita', amount: 12500, category: 'Salário' },
    { date: '2026-10-02', kind: 'despesa', amount: -214.3, category: 'Mercado' },
    { date: '2026-10-02', kind: 'aporte', amount: -1800, category: 'Aporte em investimentos' },
    { date: '2026-09-02', kind: 'despesa', amount: -50, category: 'Mercado' },
  ];
  const s = C.monthSummary(tx, '2026-10');
  near(s.income, 12500); near(s.expense, 214.3); near(s.aporte, 1800); near(s.balance, 12500 - 214.3 - 1800);
});

test('fatura: ciclo, vencimento e fatura aberta', () => {
  const card = { id: 'c', closeDay: 5, dueDay: 12 };
  const c = C.invoiceCycle(card, '2026-10');
  assert.equal(c.from, '2026-09-06'); assert.equal(c.to, '2026-10-05'); assert.equal(c.due, '2026-10-12');
  const c2 = C.invoiceCycle({ id: 'x', closeDay: 18, dueDay: 5 }, '2026-10');
  assert.equal(c2.due, '2026-11-05');
  assert.equal(C.openInvoiceYM(card, '2026-10-05'), '2026-10');
  assert.equal(C.openInvoiceYM(card, '2026-10-06'), '2026-11');
  const txs = [{ cardId: 'c', date: '2026-09-06', amount: -10, kind: 'despesa' }, { cardId: 'c', date: '2026-10-05', amount: -20, kind: 'despesa' }, { cardId: 'c', date: '2026-10-06', amount: -99, kind: 'despesa' }];
  near(C.invoiceItems(card, txs, '2026-10').total, 30);
});

test('recorrência: parcelas somam o total (centavos no fim)', () => {
  const rows = C.expandRecurrence({ date: '2026-01-31', amount: -100, description: 'TV', kind: 'despesa' }, 'installment', 3, ['a', 'b', 'c']);
  near(rows.reduce((s, r) => s + r.amount, 0), -100);
  assert.deepEqual(rows.map(r => r.date), ['2026-01-31', '2026-02-28', '2026-03-31']);
  assert.equal(rows[2].description, 'TV (3/3)');
  const m = C.expandRecurrence({ date: '2026-01-15', amount: -10, description: 'Net' }, 'monthly', 12, Array.from({ length: 12 }, (_, i) => 'm' + i));
  assert.equal(m.length, 12); assert.equal(m[11].date, '2026-12-15');
});

test('metas: previsão e aporte necessário', () => {
  const f = C.goalForecast({ target: 60000, saved: 42000, monthly: 1200, deadline: '2028-01' }, '2026-10');
  assert.equal(f.months, 15); assert.equal(f.finishYM, '2028-01');
  near(f.need, 18000 / 15); assert.ok(f.onTrack);
  assert.ok(!C.goalForecast({ target: 25000, saved: 9800, monthly: 600, deadline: '2027-12' }, '2026-10').onTrack);
});

test('contas a pagar: parcelas, recorrência e faturas', () => {
  const bills = [
    { id: 'b1', name: 'IPVA', dueDay: 20, amount: 820, recurrence: 'installment', installments: 5, startYm: '2026-08' },
    { id: 'b2', name: 'Internet', dueDay: 10, amount: 119, recurrence: 'monthly', startYm: '2026-01' },
    { id: 'b3', name: 'Seguro anual', dueDay: 3, amount: 900, recurrence: 'once', startYm: '2026-10' },
  ];
  const cards = [{ id: 'c', name: 'Nubank', closeDay: 5, dueDay: 12 }];
  const txs = [{ cardId: 'c', date: '2026-10-01', amount: -100, kind: 'despesa' }];
  const out = C.billsForMonth(bills, cards, txs, [{ id: 'b2|2026-10' }], '2026-10');
  assert.deepEqual(out.map(b => b.name), ['Seguro anual', 'Internet', 'Fatura Nubank', 'IPVA']);
  assert.equal(out.find(b => b.name === 'IPVA').meta, 'parcela 3 de 5');
  assert.ok(out.find(b => b.name === 'Internet').paid);
  assert.equal(C.billsForMonth(bills, cards, txs, [], '2027-01').find(b => b.name === 'IPVA'), undefined);
});

test('insights: detecta mês acima de 85% e reserva curta', () => {
  const txs = [];
  for (let i = 1; i <= 6; i++) {
    const ym = C.addMonthsYMForTest ? '' : `2026-0${i}`;
    txs.push({ date: `${ym}-05`, kind: 'receita', amount: 10000, category: 'Salário', description: 'Salário' });
    txs.push({ date: `${ym}-10`, kind: 'despesa', amount: i === 3 ? -9500 : -6000, category: 'Moradia', description: 'x' });
  }
  const r = C.buildInsights({ txs, plans: {}, goals: [{ name: 'Reserva de emergência', saved: 12000, target: 40000 }], todayYM: '2026-07' });
  assert.ok(r.items.find(i => i.id === 'gasto'));
  assert.ok(r.items.find(i => i.id === 'reserva'));
});

test('twrSeries distribui o retorno de trecho estimado em vez de concentrá-lo no último dia', () => {
  const snaps = [];
  for (let d = 1; d <= 9; d++) snaps.push({ date: `2026-01-0${d}`, value: 100, est: d < 9 });
  snaps[8].value = 110;
  const s = C.twrSeries(snaps);
  near(s[8].twr, 0.10);
  assert.ok(s[4].twr > 0 && s[4].twr < 0.10);
  for (let i = 1; i < 9; i++) assert.ok(s[i].twr >= s[i - 1].twr);
});

test('monthlyGrid: retorno do ano e acumulado encadeados', async () => {
  const { monthlyGrid } = await import('../js/calc.js');
  const g = monthlyGrid([{ ym: '2026-03', port: 0.003, cdi: 0.01 }, { ym: '2026-04', port: 0.0151, cdi: 0.01 }, { ym: '2026-05', port: -0.0407, cdi: 0.01 }, { ym: '2027-01', port: 0.02, cdi: 0.01 }]);
  assert.equal(g.length, 2);
  assert.equal(g[0].months[2].port, 0.003); assert.equal(g[0].months[0], null);
  assert.ok(Math.abs(g[0].port - (1.003 * 1.0151 * 0.9593 - 1)) < 1e-12);
  assert.ok(Math.abs(g[1].accPort - (1.003 * 1.0151 * 0.9593 * 1.02 - 1)) < 1e-12);
});

test('monthlyPatrimony: aplicado + retorno total (ganho + proventos) por mês', () => {
  const snaps = [{ date: '2026-03-21', value: 753 }, { date: '2026-03-31', value: 755.29 }, { date: '2026-04-30', value: 3437.15 }, { date: '2026-05-31', value: 5400 }];
  const flows = [{ date: '2026-03-21', amount: 753 }, { date: '2026-04-12', amount: 1200 }, { date: '2026-04-14', amount: 1439.4 }, { date: '2026-05-20', amount: 2147 }];
  const divs = [{ payDate: '2026-05-20', amount: 8 }];
  const r = C.monthlyPatrimony(snaps, flows, divs, '2026-05-31');
  assert.deepEqual(r.map(x => x.ym), ['2026-03', '2026-04', '2026-05']);
  assert.ok(Math.abs(r[0].gain - 2.29) < 1e-9 && r[0].aplicado === 753);
  assert.ok(Math.abs(r[1].aplicado - 3392.4) < 1e-9 && Math.abs(r[1].gain - 44.75) < 1e-6);
  assert.ok(Math.abs(r[2].total - (r[2].aplicado + r[2].gain + 8)) < 1e-9);   // patrimônio = aplicado + retorno total
  assert.equal(r[2].partial, false);
  const p = C.monthlyPatrimony(snaps, flows, [], '2026-05-15');
  assert.equal(p[2].partial, true);
});
