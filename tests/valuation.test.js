import test from 'node:test';
import assert from 'node:assert/strict';
import { dividendsPerShare, bazin, graham, quality, support, analyze, screen } from '../js/valuation.js';

const today = new Date('2026-10-06T12:00:00Z');
const cash = [
  { label: 'DIVIDENDO', rate: 2, exDate: '2026-03-01' }, { label: 'JCP', rate: 1, exDate: '2026-06-01' },     // 12m: 2 + 0,85 = 2,85
  { label: 'DIVIDENDO', rate: 3, exDate: '2025-02-01' },                                                         // 3a, fora de 12m
  { label: 'DIVIDENDO', rate: 9, exDate: '2027-01-01' },                                                         // futuro: ignorado
  { label: 'BONIFICACAO', rate: 50, exDate: '2026-01-01' },                                                      // não é provento em dinheiro
  { label: 'DIVIDENDO', rate: 100, exDate: '2020-01-01' },                                                       // antigo demais
];
test('dividendsPerShare: JCP líquido, ignora futuro/antigo/bonificação', () => {
  const d = dividendsPerShare(cash, today);
  assert.ok(Math.abs(d.dpa12 - 2.85) < 1e-9); assert.ok(Math.abs(d.dpa3 - (2.85 + 3) / 3) < 1e-9); assert.equal(d.n12, 2);
});
test('bazin usa o menor entre 12m e média 3a; graham = √(22,5·LPA·VPA)', () => {
  const d = dividendsPerShare(cash, today); // dpa3 = 1,95 < dpa12 = 2,85
  assert.ok(Math.abs(bazin(d) - 1.95 / 0.06) < 1e-9);
  assert.equal(bazin({ dpa12: 0, dpa3: 0 }), null);
  assert.ok(Math.abs(graham(5, 20) - Math.sqrt(2250)) < 1e-9);
  assert.equal(graham(-1, 10), null); assert.equal(graham(2, 0), null);
});
test('quality: bancos ignoram dívida/PL; null não conta', () => {
  const f = { roe: 0.2, pm: 0.12, de: 500, eg: 0.1, fcf: 1, pe: 10 };
  const bank = quality(f, 'ITUB4', { dpa12: 1, dpa3: 1 }), ind = quality(f, 'WEGE3', { dpa12: 1, dpa3: 1 });
  assert.equal(bank.score, 100); assert.equal(ind.score, Math.round(85 / 100 * 100));
  assert.equal(quality({}, 'X', null).score, null);
});
test('support: posição na faixa 52s e média de 10 meses', () => {
  const s = support({ price: 15, lo: 10, hi: 20, closes: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19] });
  assert.equal(s.pos52, 0.5); assert.equal(s.fundo5, 8); assert.equal(s.aboveMa, true); assert.ok(Math.abs(s.drawdown + 0.25) < 1e-9);
});
const base = { eps: 5, bv: 20, roe: 0.2, pm: 0.15, de: 40, eg: 0.1, fcf: 1, pe: 8, lo: 20, hi: 60, closes: [30, 35, 40, 45, 50, 45, 42, 40, 38, 36],
  cash: [{ label: 'DIVIDENDO', rate: 3, exDate: '2026-04-01' }, { label: 'DIVIDENDO', rate: 3, exDate: '2025-04-01' }, { label: 'DIVIDENDO', rate: 3, exDate: '2024-04-01' }] };
test('analyze: status por preço vs. justo e zona de compra', () => {
  const mk = price => analyze({ ...base, t: 'AAAA3', price }, { mos: 0.25, today });
  const a = mk(30), fair = a.fair; // bazin = 3/0,06 = 50 ; graham = 47,43 → justo 48,72
  assert.ok(Math.abs(fair - (50 + Math.sqrt(2250)) / 2) < 1e-9);
  assert.equal(a.status, 'compra'); assert.equal(mk(fair * 0.9).status, 'justo'); assert.equal(mk(fair * 1.1).status, 'esticado'); assert.equal(mk(fair * 1.3).status, 'caro');
  assert.equal(analyze({ t: 'X', price: 10, cash: [] }, { today }).status, 'sem-dados');
});
test('screen: uma candidata de boa qualidade; sem candidata não força escolha', () => {
  const mk = (t, price, extra = {}) => analyze({ ...base, ...extra, t, price }, { mos: 0.25, today });
  const rows = [mk('AAAA3', 30), mk('BBBB3', 25), mk('CCCC3', 45), mk('DDDD3', 80), mk('EEEE3', 20, { roe: 0.01, pm: 0.01, eg: -1, fcf: -1, pe: 40 })];
  const s = screen(rows);
  assert.equal(s.buy.t, 'BBBB3'); assert.deepEqual(s.buyAlt.map(r => r.t), ['AAAA3']); assert.deepEqual(s.hold.map(r => r.t), ['CCCC3']);
  assert.deepEqual(s.expensive.map(r => r.t), ['DDDD3']); assert.deepEqual(s.lowQ.map(r => r.t), ['EEEE3']);
  const none = screen([mk('DDDD3', 80), mk('CCCC3', 45)]); assert.equal(none.buy, null); assert.equal(none.nearest.t, 'CCCC3');
});
