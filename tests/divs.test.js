import test from 'node:test';
import assert from 'node:assert/strict';
import { autoDividends } from '../js/divs.js';

const assets = [{ id: 'p', ticker: 'PETR4', assetClass: 'ACAO_BR', currency: 'BRL' }, { id: 'b', ticker: 'BBSE3', assetClass: 'ACAO_BR', currency: 'BRL' }, { id: 'rf', ticker: 'CDB', assetClass: 'RENDA_FIXA', currency: 'BRL' }];
const tx = (assetId, date, quantity) => ({ id: assetId + date, assetId, date, quantity, price: 10, type: 'COMPRA', fees: 0 });
const T = '2026-10-06';

test('agenda curada credita por posição na data com; futuro fica com payDate futuro', () => {
  const r = autoDividends(assets, [tx('p', '2026-03-01', 100), tx('rf', '2026-03-01', 1000)], [], {}, T);
  const j = r.filter(x => x.assetId === 'p');
  assert.equal(j.length, 3);
  assert.ok(j.every(x => x.auto && !x.est && x.payDate > T));
  assert.equal(j.find(x => x.payDate === '2026-11-23').amount, Math.round(100 * 0.67407131 * 0.85 * 100) / 100); // JCP líquido
  assert.ok(!r.some(x => x.assetId === 'rf'));
});

test('histórico Yahoo entra como estimado; não duplica a agenda; manual prevalece', () => {
  const hist = { BBSE3: { cash: [{ ex: '2026-08-08', rate: 1.98, label: 'DIVIDENDO' }, { ex: '2026-04-01', rate: 0.5, label: 'DIVIDENDO' }, { ex: '2026-02-01', rate: 9, label: 'DIVIDENDO' }] } };
  const txs = [tx('b', '2026-03-10', 200)];
  const r = autoDividends(assets, txs, [], hist, T).filter(x => x.assetId === 'b');
  assert.equal(r.filter(x => x.payDate === '2026-09-03').length, 1);          // agenda (BBSE3 pago 03/09), sem duplicar o ex 08/08
  const est = r.filter(x => x.est);
  assert.equal(est.length, 1);                                                // só 01/04 (02/02 é anterior à 1ª compra)
  assert.equal(est[0].payDate, '2026-04-26');
  const manual = [{ assetId: 'b', payDate: '2026-04-27', type: 'DIVIDENDO' }];
  assert.equal(autoDividends(assets, txs, manual, hist, T).filter(x => x.est).length, 0);
});
