import test from 'node:test';
import assert from 'node:assert/strict';
import { backfillSnapshots, snapshotsInconsistent } from '../js/portfolio.js';
import { twrSeries, makeCdi } from '../js/calc.js';

const assets = [{ id: 'rf', ticker: 'CDB', assetClass: 'RENDA_FIXA', currency: 'BRL', fixedIncome: { indexer: 'CDI', rate: 80 } }];
const tx = d => ({ id: d, assetId: 'rf', type: 'COMPRA', date: d, quantity: 1000, price: 1, fees: 0 });

test('snapshot antigo + aporte retroativo é detectado e curado (sem TWR < -100%)', () => {
  const txs = [tx('2026-03-01'), tx('2026-03-10')];
  // histórico gravado quando só existia o 1º aporte
  const stale = ['2026-03-01', '2026-03-02', '2026-03-10', '2026-03-11'].map(d => ({ id: d, date: d, value: 1000, est: false }));
  assert.equal(snapshotsInconsistent(stale, assets, txs), true);
  assert.ok(twrSeries(stale.map(s => ({ ...s, netFlow: s.date === '2026-03-10' ? 1000 : 0 }))).every(x => x.twr > -1));
  const cdi = makeCdi([]);
  const fixed = backfillSnapshots({ assets, investTx: txs, cdi, ipca: [], history: {} }, stale, '2026-03-12', { rebuildAll: true });
  assert.ok(fixed.find(s => s.id === '2026-03-11').value >= 1999);
  assert.equal(snapshotsInconsistent(fixed, assets, txs), false);
});
