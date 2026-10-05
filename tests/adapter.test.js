import test from 'node:test';
import assert from 'node:assert/strict';

// Mock mínimo do supabase-js: registra upserts/deletes
const calls = [];
const chain = t => ({
  upsert: (rows, opts) => { calls.push({ t, op: 'upsert', rows, opts }); return Promise.resolve({ error: null }); },
  delete: () => ({ not: () => { calls.push({ t, op: 'delete' }); return Promise.resolve({ error: null }); }, in: () => Promise.resolve({ error: null }) }),
});
globalThis.window = { supabase: { createClient: () => ({ from: chain, auth: {} }) } };
const { SupabaseAdapter, SHARED, TABLES } = await import('../js/db.js');

test('tabelas compartilhadas não enviam user_id e usam household_id no conflito', async () => {
  const ad = new SupabaseAdapter('u', 'k'); ad.userId = 'U1';
  await ad.upsertMany('assets', [{ id: 'a', ticker: 'WEGE3', assetClass: 'ACAO_BR', householdId: 'x', createdBy: 'U2' }]);
  const c = calls.pop();
  assert.equal(c.opts.onConflict, 'household_id,id');
  assert.equal('user_id' in c.rows[0], false);
  assert.equal('household_id' in c.rows[0], false);
  assert.equal(c.rows[0].created_by, 'U2'); // autoria original preservada
  assert.equal(c.rows[0].asset_class, 'ACAO_BR');
});

test('tabelas pessoais enviam user_id e usam user_id no conflito', async () => {
  const ad = new SupabaseAdapter('u', 'k'); ad.userId = 'U1';
  await ad.upsertMany('transactions', [{ id: 't', description: 'x' }]);
  const c = calls.pop();
  assert.equal(c.opts.onConflict, 'user_id,id'); assert.equal(c.rows[0].user_id, 'U1');
});

test('apagar dados pessoais preserva as tabelas compartilhadas', async () => {
  const ad = new SupabaseAdapter('u', 'k'); calls.length = 0;
  await ad.clearAll({ shared: false });
  const tables = calls.filter(c => c.op === 'delete').map(c => c.t);
  for (const k of SHARED) assert.ok(!tables.includes(TABLES[k]), k);
  assert.ok(tables.includes('transactions'));
  calls.length = 0; await ad.clearAll({ shared: true });
  assert.ok(calls.some(c => c.t === 'invest_tx'));
});
