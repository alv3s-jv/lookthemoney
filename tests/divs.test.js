import test from 'node:test';
import assert from 'node:assert/strict';
import { autoDividends } from '../js/divs.js';

const assets = [{ id: 'p', ticker: 'PETR4', assetClass: 'ACAO_BR', currency: 'BRL' }, { id: 'b', ticker: 'BBSE3', assetClass: 'ACAO_BR', currency: 'BRL' }, { id: 'rf', ticker: 'CDB', assetClass: 'RENDA_FIXA', currency: 'BRL' }];
const tx = (assetId, date, quantity) => ({ id: assetId + date, assetId, date, quantity, price: 10, type: 'COMPRA', fees: 0 });
const T = '2026-10-06';

test('agenda curada credita por posição na data com; futuro fica com payDate futuro', () => {
  const r = autoDividends(assets, [tx('p', '2026-03-01', 100), tx('rf', '2026-03-01', 1000)], [], {}, T);
  const j = r.filter(x => x.assetId === 'p' && x.payDate > T);
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

test('carteira real (Investidor10): proventos recebidos ≈ R$ 45,26 e a receber PETR4/ITUB4', () => {
  const A = [{ id: 'p', ticker: 'PETR4', assetClass: 'ACAO_BR', currency: 'BRL' }, { id: 'i', ticker: 'ITUB4', assetClass: 'ACAO_BR', currency: 'BRL' }, { id: 'v', ticker: 'VALE3', assetClass: 'ACAO_BR', currency: 'BRL' },
    { id: 'b', ticker: 'BBSE3', assetClass: 'ACAO_BR', currency: 'BRL' }, { id: 'j', ticker: 'JEPQ', assetClass: 'ETF_INTL', currency: 'USD' }];
  const txs = [tx('p', '2026-04-14', 30), tx('i', '2026-06-15', 12), tx('b', '2026-08-20', 10), tx('v', '2026-09-25', 20), tx('j', '2026-09-24', 3.67467844)];
  const r = autoDividends(A, txs, [], {}, T);
  const got = r.filter(x => x.payDate <= T).reduce((s, x) => s + x.amount, 0);
  assert.ok(Math.abs(got - 45.26) < 2, 'recebido ' + got);
  assert.ok(!r.some(x => x.assetId === 'v' || x.assetId === 'b'));            // compradas depois da data com: sem direito
  const fut = r.filter(x => x.payDate > T).reduce((s, x) => s + x.amount, 0);
  assert.ok(Math.abs(fut - (16.68 + 14.15 + 5.01 + 0.18 + 0.18 + 0.18)) < 1.2, 'a receber ' + fut);
});

test('EUA: dividendo do Yahoo em US$ vira R$ (câmbio) líquido de 30%, pago ≈ ex+5; agenda não duplica', () => {
  const A = [{ id: 'j', ticker: 'JEPQ', assetClass: 'EUA_BDR', currency: 'USD' }];
  const txs = [tx('j', '2026-09-24', 3.676)];
  const hist = { JEPQ: { cash: [{ ex: '2026-09-30', rate: 0.58, label: 'DIVIDENDO' }, { ex: '2026-11-03', rate: 0.5, label: 'DIVIDENDO' }, { ex: '2026-08-01', rate: 0.5, label: 'DIVIDENDO' }] } };
  const r = autoDividends(A, txs, [], hist, '2026-11-10', 5);
  assert.equal(r.length, 2);                                   // set (agenda) + nov (Yahoo); ago é anterior à compra
  const nov = r.find(x => x.payDate === '2026-11-08');
  assert.ok(nov && nov.est);
  assert.ok(Math.abs(nov.amount - 3.676 * 0.5 * 5 * 0.7) < 0.02, String(nov.amount));
  assert.equal(autoDividends(A, txs, [], hist, '2026-11-10', 0).filter(x => x.est).length, 0); // sem câmbio nem fx da compra: não inventa
});
