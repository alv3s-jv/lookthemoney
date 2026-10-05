// Camada de dados: dois adaptadores com a mesma interface.
//  - LocalAdapter    → IndexedDB (modo sem login / demonstração)
//  - SupabaseAdapter → Postgres com RLS (modo nuvem, requer login)
// Os ids são gerados no cliente (uuid), então migrar local → nuvem é só importar o JSON.

export const TABLES = {
  accounts: 'accounts', cards: 'cards', transactions: 'transactions', bills: 'bills', billPayments: 'bill_payments',
  budgetPlans: 'budget_plans', goals: 'goals', assets: 'assets', investTx: 'invest_tx', dividends: 'dividends',
  targets: 'targets', snapshots: 'snapshots', settings: 'settings', sharedSettings: 'household_settings',
};
// Dados compartilhados entre os usuários do domicílio (no Supabase: household_id; o resto é por user_id)
export const SHARED = new Set(['assets', 'investTx', 'dividends', 'targets', 'snapshots', 'sharedSettings']);
export const TABLE_KEYS = Object.keys(TABLES);

const snake = s => s.replace(/[A-Z]/g, c => '_' + c.toLowerCase());
const camel = s => s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
const toDb = (row, userId, shared) => { const o = {}; for (const [k, v] of Object.entries(row)) if (v !== undefined) o[snake(k)] = v; if (shared) delete o.household_id; else if (userId) o.user_id = userId; return o; };
const fromDb = row => { const o = {}; for (const [k, v] of Object.entries(row)) { if (k === 'user_id' || k === 'household_id') continue; o[camel(k)] = v; } return o; };
// numeric do Postgres chega como string em alguns casos; normaliza campos numéricos conhecidos
const NUMERIC = new Set(['initialBalance', 'creditLimit', 'amount', 'planned', 'saved', 'target', 'monthly', 'manualPrice', 'quantity', 'price', 'fees', 'perShare', 'percent', 'value', 'netFlow', 'income', 'closeDay', 'dueDay', 'installmentNo', 'installmentTotal', 'installments']);
const normalize = row => { for (const k of NUMERIC) if (k in row && row[k] != null && typeof row[k] === 'string') row[k] = Number(row[k]); return row; };

// ===================================================================
// IndexedDB
// ===================================================================
export class LocalAdapter {
  constructor(name = 'lookthemoney') { this.name = name; this.mode = 'local'; this.db = null; }
  async init() {
    this.db = await new Promise((res, rej) => {
      const r = indexedDB.open(this.name, 2);
      r.onupgradeneeded = () => { for (const t of TABLE_KEYS) if (!r.result.objectStoreNames.contains(t)) r.result.createObjectStore(t, { keyPath: 'id' }); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  _tx(tables, mode, fn) {
    return new Promise((res, rej) => {
      const t = this.db.transaction(tables, mode);
      let out;
      t.oncomplete = () => res(out);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
      out = fn(t);
    });
  }
  async loadAll() {
    const data = {};
    await Promise.all(TABLE_KEYS.map(k => new Promise((res, rej) => {
      const r = this.db.transaction(k, 'readonly').objectStore(k).getAll();
      r.onsuccess = () => { data[k] = r.result; res(); };
      r.onerror = () => rej(r.error);
    })));
    return data;
  }
  upsertMany(table, rows) { return this._tx(table, 'readwrite', t => rows.forEach(r => t.objectStore(table).put(r))); }
  removeMany(table, ids) { return this._tx(table, 'readwrite', t => ids.forEach(id => t.objectStore(table).delete(id))); }
  clearAll({ shared = true } = {}) { const ks = TABLE_KEYS.filter(k => shared || !SHARED.has(k)); return this._tx(ks, 'readwrite', t => ks.forEach(k => t.objectStore(k).clear())); }
  async user() { return { id: 'local', email: 'Modo local (este navegador)' }; }
}

// ===================================================================
// Supabase
// ===================================================================
export class SupabaseAdapter {
  constructor(url, key) {
    if (!window.supabase) throw new Error('supabase-js não carregado');
    this.mode = 'cloud';
    this.sb = window.supabase.createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    this.userId = null; this.email = null;
  }
  async init() {
    const { data } = await this.sb.auth.getSession();
    if (data.session) { this.userId = data.session.user.id; this.email = data.session.user.email; }
    this.sb.auth.onAuthStateChange((_e, s) => { this.userId = s?.user?.id || null; this.email = s?.user?.email || null; });
    return !!this.userId;
  }
  async signIn(email, password) {
    const { data, error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error) throw error; this.userId = data.user.id; this.email = data.user.email;
  }
  async signUp(email, password) {
    const { data, error } = await this.sb.auth.signUp({ email, password });
    if (error) throw error;
    if (data.session) { this.userId = data.user.id; this.email = data.user.email; return { confirmed: true }; }
    return { confirmed: false };
  }
  async magicLink(email) {
    const { error } = await this.sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
    if (error) throw error;
  }
  async resetPassword(email) {
    const { error } = await this.sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    if (error) throw error;
  }
  // ---- 2FA (TOTP) ----
  async mfaState() {
    const { data, error } = await this.sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error) throw error;
    const { data: f } = await this.sb.auth.mfa.listFactors();
    const totp = (f?.totp || []).filter(x => x.status === 'verified');
    return { needsChallenge: data.nextLevel === 'aal2' && data.currentLevel !== 'aal2', factors: totp };
  }
  async mfaEnroll() {
    const { data: f } = await this.sb.auth.mfa.listFactors();
    for (const x of f?.all || []) if (x.status === 'unverified') await this.sb.auth.mfa.unenroll({ factorId: x.id });
    const { data, error } = await this.sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'LookTheMoney ' + new Date().toISOString().slice(0, 10) });
    if (error) throw error;
    return { id: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
  }
  async mfaVerify(factorId, code) {
    const { data: ch, error: e1 } = await this.sb.auth.mfa.challenge({ factorId }); if (e1) throw e1;
    const { error } = await this.sb.auth.mfa.verify({ factorId, challengeId: ch.id, code: String(code).replace(/\s/g, '') });
    if (error) throw error;
  }
  async mfaChallenge(code) {
    const st = await this.mfaState(); if (!st.factors.length) throw new Error('Nenhum fator 2FA cadastrado.');
    await this.mfaVerify(st.factors[0].id, code);
  }
  async mfaRemove(factorId) { const { error } = await this.sb.auth.mfa.unenroll({ factorId }); if (error) throw error; }
  async signOut() { await this.sb.auth.signOut(); this.userId = null; }
  async user() { return { id: this.userId, email: this.email }; }

  async loadAll() {
    const data = {};
    await Promise.all(TABLE_KEYS.map(async k => {
      const rows = []; const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        const { data: d, error } = await this.sb.from(TABLES[k]).select('*').order('id').range(from, from + PAGE - 1);
        if (error) throw new Error(`${TABLES[k]}: ${error.message}`);
        rows.push(...d.map(r => normalize(fromDb(r))));
        if (d.length < PAGE) break;
      }
      data[k] = rows;
    }));
    return data;
  }
  async upsertMany(table, rows) {
    for (let i = 0; i < rows.length; i += 400) {
      const chunk = rows.slice(i, i + 400).map(r => toDb(r, this.userId, SHARED.has(table)));
      const { error } = await this.sb.from(TABLES[table]).upsert(chunk, { onConflict: SHARED.has(table) ? 'household_id,id' : 'user_id,id' });
      if (error) throw new Error(`${TABLES[table]}: ${error.message}`);
    }
  }
  async removeMany(table, ids) {
    for (let i = 0; i < ids.length; i += 200) {
      const { error } = await this.sb.from(TABLES[table]).delete().in('id', ids.slice(i, i + 200));
      if (error) throw new Error(`${TABLES[table]}: ${error.message}`);
    }
  }
  async clearAll({ shared = false } = {}) {
    for (const k of TABLE_KEYS) {
      if (SHARED.has(k) && !shared) continue;
      const { error } = await this.sb.from(TABLES[k]).delete().not('id', 'is', null); if (error) throw new Error(error.message);
    }
  }
  // membros do domicílio (nomes exibidos nas operações compartilhadas)
  async members() {
    const { data, error } = await this.sb.from('household_members').select('user_id, display_name, avatar');
    if (error) throw new Error(error.message);
    return data.map(r => ({ userId: r.user_id, name: r.display_name, avatar: r.avatar || '' }));
  }
  async setAvatar(dataUrl) {
    const { error } = await this.sb.from('household_members').update({ avatar: dataUrl || null }).eq('user_id', this.userId);
    if (error) throw new Error(error.message);
  }
  async renameMe(name) {
    const { error } = await this.sb.from('household_members').update({ display_name: name }).eq('user_id', this.userId);
    if (error) throw new Error(error.message);
  }
}
