import test from 'node:test';
import assert from 'node:assert/strict';
import { agendaFor } from '../js/agenda.js';

const assets = [{ id: 'p', ticker: 'PETR4', assetClass: 'ACAO_BR' }, { id: 'i', ticker: 'ITUB4', assetClass: 'ACAO_BR' }];
const tx = (assetId, date, quantity, type = 'COMPRA') => ({ id: assetId + date, assetId, date, quantity, price: 10, type, fees: 0 });

test('direito pela posição na data com; JCP líquido de 15%', () => {
  const txs = [tx('p', '2026-08-21', 100), tx('i', '2026-10-15', 100)]; // PETR4 comprada na data com (tem direito); ITUB4 só depois da 1ª data com
  const r = agendaFor(assets, txs, [], '2026-10-06');
  const p1 = r.find(x => x.t === 'PETR4' && x.pay === '2026-11-23');
  assert.equal(p1.qty, 100);
  assert.ok(Math.abs(p1.gross - 67.407131) < 1e-6 && Math.abs(p1.net - 67.407131 * 0.85) < 1e-6);
  assert.ok(!r.some(x => x.t === 'ITUB4' && x.com === '2026-09-30'));
  assert.ok(r.some(x => x.t === 'ITUB4' && x.com === '2026-10-30'));
  const d = r.find(x => x.t === 'PETR4' && x.pay === '2026-12-21' && x.type === 'DIVIDENDO');
  assert.equal(d.net, d.gross);
});
