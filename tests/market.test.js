import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, sessionStatus, rangePos } from '../js/market.js';

const L = (t, chg, brl = 5e7, sector = 'Finance') => ({ t, name: t, price: 10, chg, vol: 1, brl, sector });
const data = {
  lists: { stocks: [L('AAAA3', 3), L('BBBB4', 2), L('CCCC3', 1), L('DDDD3', 0.5), L('EEEE3', 1.2), L('FFFF3', -1), L('GGGG3', -4), L('HHHH3', 2.2), L('IIII3', 0.8, 5e7, 'Energy'), L('JJJJ3', 1.5, 5e7, 'Energy'), L('KKKK3', 0.3, 5e7, 'Energy')], funds: [] },
  fx: { usd: { price: 5, chg: -0.3, high: 5.1, low: 4.9 } },
  crypto: [{ sym: 'BTC', price: 400000, chg: -1.2 }],
  macro: { selic: 14, cdi: 13.9, ipca12: 4, ipcaM: 0.1, ipcaRef: '01/09/2026' },
};
test('analyze: amplitude, destaques, dólar, juro real', () => {
  const a = analyze(data);
  const am = a.find(x => x.title === 'Amplitude do pregão');
  assert.equal(am.tone, 'up'); assert.match(am.text, /9 de 11/);
  assert.match(a.find(x => x.title === 'Destaques de liquidez').text, /AAAA3.*GGGG3/);
  assert.match(a.find(x => x.title === 'Dólar').text, /meio da faixa/);
  const j = a.find(x => x.title === 'Juros e inflação').text; assert.match(j, /9,62%/); // (1,14/1,04-1)
});
test('analyze: sem dados não quebra e carteira entra', () => {
  assert.deepEqual(analyze(null), []);
  const port = { dayValue: -10, dayPct: -0.01, active: [{ asset: { ticker: 'X1' }, prevClose: 10, price: 9, dayPct: -0.1 }, { asset: { ticker: 'Y1' }, prevClose: 10, price: 11, dayPct: 0.1 }] };
  const t = analyze({}, port).find(x => x.title === 'Sua carteira hoje'); assert.equal(t.tone, 'dn'); assert.match(t.text, /Melhor: Y1.*Pior: X1/);
});
test('sessionStatus e rangePos', () => {
  assert.equal(sessionStatus(new Date('2026-10-07T15:00:00Z')).open, true);  // quarta 12h BRT
  assert.equal(sessionStatus(new Date('2026-10-07T22:00:00Z')).open, false); // 19h BRT
  assert.equal(sessionStatus(new Date('2026-10-10T15:00:00Z')).open, false); // sábado
  assert.equal(rangePos(5, 4, 6), 0.5); assert.equal(rangePos(9, 4, 6), 1);
});
