// Dados de demonstração (carregados sob demanda em Configurações → "Carregar dados de exemplo").
import { uid, addMonthsISO, addMonthsYM, currentYM, todayISO, daysInMonth } from './util.js';
import { expandRecurrence, invoiceItems } from './calc.js';
import { APORTE_CAT } from './meta.js';

function rng(seed) { let a = seed; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function buildSeed() {
  const R = rng(20261005);
  const today = todayISO(), curYM = currentYM();
  const D = {};
  const accItau = uid(), accNu = uid(), accBtg = uid();
  D.accounts = [
    { id: accItau, name: 'Itaú', kind: 'checking', initialBalance: 25000 },
    { id: accNu, name: 'Nubank', kind: 'checking', initialBalance: 6000 },
    { id: accBtg, name: 'BTG', kind: 'broker', initialBalance: 3750 },
  ];
  const cardNu = uid(), cardItau = uid();
  D.cards = [
    { id: cardNu, name: 'Nubank', last4: '4821', creditLimit: 12000, closeDay: 5, dueDay: 12, accountId: accItau },
    { id: cardItau, name: 'Itaú Personnalité', last4: '0937', creditLimit: 8000, closeDay: 18, dueDay: 25, accountId: accItau },
  ];

  const tx = []; const created = new Date().toISOString();
  const add = (o) => tx.push({ id: uid(), recurrence: 'none', createdAt: created, ...o });
  const pick = a => a[Math.floor(R() * a.length)];
  const day = (ym, d) => `${ym}-${String(Math.min(d, daysInMonth(ym))).padStart(2, '0')}`;

  for (let i = 9; i >= 0; i--) {
    const ym = addMonthsYM(curYM, -i);
    const isCur = i === 0;
    const sal = [12500, 12500, 13800, 12500, 12500, 12500, 12900, 12500, 12500, 12500][9 - i] || 12500;
    add({ date: day(ym, 1), description: 'Salário', category: 'Salário', kind: 'receita', amount: sal, accountId: accItau });
    add({ date: day(ym, 1), description: 'Aluguel', category: 'Moradia', kind: 'despesa', amount: -3200, accountId: accItau, recurrence: 'monthly', seriesId: 'rent' });
    add({ date: day(ym, 1), description: 'Academia', category: 'Saúde', kind: 'despesa', amount: -119, cardId: cardItau, recurrence: 'monthly', seriesId: 'gym' });
    add({ date: day(ym, 1), description: 'Netflix', category: 'Assinaturas', kind: 'despesa', amount: -55.9, cardId: cardNu, recurrence: 'monthly', seriesId: 'nflx' });
    add({ date: day(ym, 3), description: 'Spotify', category: 'Assinaturas', kind: 'despesa', amount: -21.9, cardId: cardNu, recurrence: 'monthly', seriesId: 'spt' });
    add({ date: day(ym, 3), description: 'iCloud', category: 'Assinaturas', kind: 'despesa', amount: -14.9, cardId: cardNu, recurrence: 'monthly', seriesId: 'icl' });
    add({ date: day(ym, 2), description: 'Aporte em investimentos', category: APORTE_CAT, kind: 'aporte', amount: -(isCur ? 1800 : pick([3000, 3000, 2400, 1500, 3000])), accountId: accItau });
    const n = isCur ? 3 : 14;
    for (let k = 0; k < n; k++) {
      const d = isCur ? Math.min(+today.slice(8), 1 + Math.floor(R() * 5)) : 1 + Math.floor(R() * 27);
      const type = R();
      const [desc, cat, lo, hi] = type < 0.4 ? [pick(['Pão de Açúcar', 'Carrefour', 'Padaria', 'Hortifruti']), 'Mercado', 45, 360]
        : type < 0.55 ? [pick(['iFood', 'Rappi']), 'Delivery', 35, 95]
        : type < 0.7 ? [pick(['Uber', '99', 'Posto Shell']), 'Transporte', 18, 190]
        : type < 0.82 ? [pick(['Cinema', 'Restaurante', 'Bar', 'Show']), 'Lazer', 40, 320]
        : type < 0.92 ? [pick(['Farmácia São Paulo', 'Consulta']), 'Saúde', 40, 280]
        : [pick(['Amazon', 'Mercado Livre', 'Zara']), 'Compras', 60, 520];
      add({ date: day(ym, d), description: desc, category: cat, kind: 'despesa', amount: -Math.round((lo + R() * (hi - lo)) * 100) / 100, cardId: R() < 0.7 ? cardNu : cardItau });
    }
    // maio estourou o orçamento, para exemplificar o insight
    if (i === 5) { add({ date: day(ym, 14), description: 'Viagem fim de semana', category: 'Lazer', kind: 'despesa', amount: -1850, cardId: cardNu }); add({ date: day(ym, 20), description: 'Tênis e roupas', category: 'Compras', kind: 'despesa', amount: -1090, cardId: cardNu }); }
  }
  // parcelados
  const inst = (desc, cat, total, n, start, card) => {
    const base = { description: desc, category: cat, kind: 'despesa', amount: -total, date: start, cardId: card, seriesId: uid(), recurrence: 'installment', createdAt: created };
    const rows = expandRecurrence(base, 'installment', n, Array.from({ length: n }, () => uid()));
    tx.push(...rows);
  };
  inst('Notebook Dell', 'Compras', 4200, 10, addMonthsISO(`${curYM}-28`, -4), cardNu);
  inst('Passagem aérea', 'Viagem', 1860, 6, addMonthsISO(`${curYM}-22`, -2), cardNu);
  inst('Geladeira', 'Compras', 3120, 12, addMonthsISO(`${curYM}-20`, -5), cardItau);
  inst('Celular', 'Compras', 1800, 12, addMonthsISO(`${curYM}-10`, -8), cardNu);
  D.transactions = tx;

  // contas a pagar (agenda de vencimentos; pagar gera a despesa)
  const bEner = uid(), bAgua = uid(), bNet = uid(), bIpva = uid(), bSeg = uid();
  D.bills = [
    { id: bEner, name: 'Energia', dueDay: 5, amount: 312, meta: 'débito automático · Itaú', category: 'Contas da casa', recurrence: 'monthly', startYm: addMonthsYM(curYM, -9), accountId: accItau },
    { id: bAgua, name: 'Água', dueDay: 8, amount: 96, meta: 'boleto', category: 'Contas da casa', recurrence: 'monthly', startYm: addMonthsYM(curYM, -9), accountId: accItau },
    { id: bNet, name: 'Internet', dueDay: 10, amount: 119, meta: 'boleto', category: 'Contas da casa', recurrence: 'monthly', startYm: addMonthsYM(curYM, -9), accountId: accItau },
    { id: bIpva, name: 'IPVA', dueDay: 20, amount: 820, meta: '', category: 'IPVA e seguro', recurrence: 'installment', installments: 5, startYm: addMonthsYM(curYM, -2), accountId: accItau },
    { id: bSeg, name: 'Seguro do carro', dueDay: 22, amount: 186, meta: '', category: 'IPVA e seguro', recurrence: 'installment', installments: 12, startYm: addMonthsYM(curYM, -6), accountId: accItau },
  ];
  D.billPayments = [];
  const payTx = [];
  for (const b of D.bills) {
    for (let i = 9; i >= 0; i--) {
      const ym = addMonthsYM(curYM, -i);
      if (ym < b.startYm) continue;
      if (b.recurrence === 'installment' && ym >= addMonthsYM(b.startYm, b.installments)) continue;
      const date = day(ym, b.dueDay);
      if (date > today) continue;
      const id = uid();
      payTx.push({ id, date, description: b.name, category: b.category, kind: 'despesa', amount: -b.amount, accountId: b.accountId, recurrence: 'none', createdAt: created, billKey: `${b.id}|${ym}` });
      D.billPayments.push({ id: `${b.id}|${ym}`, paidAt: date, amount: b.amount, accountId: b.accountId, txId: id });
    }
  }
  D.transactions.push(...payTx);
  // faturas de cartão já vencidas: pagas integralmente (a mais recente fica em aberto para exemplo)
  for (const card of D.cards) {
    for (let i = 10; i >= 0; i--) {
      const closeYM = addMonthsYM(curYM, -i), inv = invoiceItems(card, D.transactions, closeYM);
      if (inv.total <= 0 || inv.due > today) continue;
      const id = uid(), key = `card:${card.id}|${closeYM}`;
      D.transactions.push({ id, date: inv.due, description: `Fatura ${card.name}`, category: 'Fatura de cartão', kind: 'fatura', amount: -inv.total, accountId: card.accountId, cardId: null, recurrence: 'none', createdAt: created, billKey: key });
      D.billPayments.push({ id: key, paidAt: inv.due, amount: inv.total, accountId: card.accountId, txId: id });
    }
  }

  D.budgetPlans = [['Moradia', 3200], ['Mercado', 1500], ['Delivery', 400], ['Saúde', 500], ['Lazer', 800], ['Assinaturas', 220], ['Transporte', 600], ['Contas da casa', 530], ['IPVA e seguro', 1006], ['Compras', 600], [APORTE_CAT, 3000]].map(([c, v]) => ({ id: c, planned: v }));

  D.goals = [
    { id: uid(), name: 'Reserva de emergência', icon: 'ph ph-lifebuoy', place: 'CDB 110% CDI · liquidez diária', saved: 42000, target: 60000, monthly: 1200, deadline: addMonthsYM(curYM, 15) },
    { id: uid(), name: 'Viagem ao Japão', icon: 'ph ph-airplane-tilt', place: 'Tesouro Selic', saved: 9800, target: 25000, monthly: 600, deadline: addMonthsYM(curYM, 14) },
    { id: uid(), name: 'Trocar de carro', icon: 'ph ph-car-profile', place: 'CDB 105% CDI', saved: 4500, target: 40000, monthly: 800, deadline: addMonthsYM(curYM, 45) },
    { id: uid(), name: 'Aposentadoria', icon: 'ph ph-sun-horizon', place: 'ligada ao ambiente de Investimentos', saved: 0, target: 800000, monthly: 1800, deadline: addMonthsYM(curYM, 300), linkInvest: true },
  ];

  // ---------- investimentos ----------
  const A = [
    ['WEGE3', 'WEG ON', 'ACAO_BR', 47.33, [[-13, 200, 33.9], [-8, 60, 38.5], [-3, 40, 41.2]]],
    ['ITUB4', 'Itaú Unibanco PN', 'ACAO_BR', 34.62, [[-13, 250, 27.1], [-7, 150, 30.4]]],
    ['VALE3', 'Vale ON', 'ACAO_BR', 61.72, [[-12, 120, 56.0], [-5, 80, 61.7]]],
    ['PETR4', 'Petrobras PN', 'ACAO_BR', 36.87, [[-13, 200, 37.9], [-6, 120, 39.2]]],
    ['HGLG11', 'CSHG Logística', 'FII', 164.9, [[-12, 60, 155.0], [-4, 40, 163.0]]],
    ['MXRF11', 'Maxi Renda', 'FII', 10.12, [[-13, 1000, 9.8], [-6, 500, 9.95]]],
    ['BOVA11', 'iShares Ibovespa', 'ETF', 127.4, [[-10, 25, 115.0], [-3, 15, 124.0]]],
    ['IVVB11', 'iShares S&P 500', 'ETF', 334, [[-11, 10, 280], [-2, 5, 322]]],
    ['AAPL34', 'Apple BDR', 'EUA_BDR', 58.4, [[-9, 140, 50.5], [-3, 80, 55.0]]],
    ['BTC', 'Bitcoin', 'CRIPTO', 301000, [[-10, 0.015, 310000], [-4, 0.006, 340000]]],
  ];
  D.assets = []; D.investTx = []; D.dividends = [];
  for (const [ticker, name, assetClass, price, lots] of A) {
    const id = uid();
    D.assets.push({ id, ticker, name, assetClass, currency: 'BRL', manualPrice: price, manualPriceAt: new Date().toISOString(), priceSource: 'auto' });
    for (const [m, quantity, p] of lots) D.investTx.push({ id: uid(), assetId: id, type: 'COMPRA', date: addMonthsISO(`${curYM}-${m % 2 ? '08' : '15'}`, m), quantity, price: p, fees: assetClass === 'CRIPTO' ? 4.9 : 0, createdAt: created });
    const first = D.investTx.filter(t => t.assetId === id).map(t => t.date).sort()[0];
    const q = lots.reduce((s, l) => s + l[1], 0);
    if (assetClass === 'FII') {
      for (let i = 12; i >= 1; i--) { const d = addMonthsISO(`${curYM}-14`, -i); if (d > first && d <= today) { const ps = ticker === 'MXRF11' ? 0.1 : 1.1; D.dividends.push({ id: uid(), assetId: id, type: 'RENDIMENTO', payDate: d, perShare: ps, quantity: q, amount: Math.round(q * ps * 100) / 100 }); } }
    } else if (['ITUB4', 'WEGE3', 'VALE3', 'PETR4'].includes(ticker)) {
      for (const i of [11, 8, 5, 2]) { const d = addMonthsISO(`${curYM}-20`, -i); if (d > first && d <= today) { const jcp = ticker === 'ITUB4' || ticker === 'WEGE3'; const ps = { ITUB4: 0.42, WEGE3: 0.18, VALE3: 1.1, PETR4: 1.4 }[ticker]; const gross = q * ps; D.dividends.push({ id: uid(), assetId: id, type: jcp ? 'JCP' : 'DIVIDENDO', payDate: d, perShare: ps, quantity: q, amount: Math.round(gross * (jcp ? 0.85 : 1) * 100) / 100 }); } }
    }
  }
  const idT = uid(), idC = uid();
  D.assets.push({ id: idT, ticker: 'IPCA+ 2029', name: 'Tesouro IPCA+ 2029', assetClass: 'RENDA_FIXA', currency: 'BRL', fixedIncome: { issuer: 'Tesouro Nacional', indexer: 'IPCA', rate: 6.1, maturity: addMonthsISO(`${curYM}-15`, 30) } });
  D.assets.push({ id: idC, ticker: 'CDB 110% CDI', name: 'CDB Banco Inter · 2027', assetClass: 'RENDA_FIXA', currency: 'BRL', fixedIncome: { issuer: 'Banco Inter', indexer: 'CDI', rate: 110, maturity: addMonthsISO(`${curYM}-15`, 14) } });
  D.investTx.push({ id: uid(), assetId: idT, type: 'COMPRA', date: addMonthsISO(`${curYM}-10`, -11), quantity: 12000, price: 1, fees: 0, createdAt: created });
  D.investTx.push({ id: uid(), assetId: idT, type: 'COMPRA', date: addMonthsISO(`${curYM}-10`, -5), quantity: 6000, price: 1, fees: 0, createdAt: created });
  D.investTx.push({ id: uid(), assetId: idC, type: 'COMPRA', date: addMonthsISO(`${curYM}-05`, -8), quantity: 10000, price: 1, fees: 0, createdAt: created });

  D.targets = [['ACAO_BR', 35], ['FII', 22], ['ETF', 8], ['EUA_BDR', 12], ['RENDA_FIXA', 18], ['CRIPTO', 5]].map(([id, percent]) => ({ id, percent }));
  D.settings = [{ id: 'tolerance', value: 3 }, { id: 'demo', value: true }];
  D.snapshots = [];
  return D;
}
