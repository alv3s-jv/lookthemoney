// Estado em memória + persistência via adaptador. Todas as telas leem daqui.
import { TABLE_KEYS, SHARED } from './db.js';
// configurações compartilhadas entre os usuários (as demais são pessoais)
const SHARED_SETTINGS = new Set(['brapiToken', 'tolerance']);
import { uid } from './util.js';

class Store {
  constructor() {
    this.data = Object.fromEntries(TABLE_KEYS.map(k => [k, []]));
    this.adapter = null;
    this.listeners = new Set();
    this.queue = Promise.resolve();
    this.onError = null;
    this.quotes = { map: {}, fx: null, cdi: null, ipca: null, updatedAt: null, oldest: null, loading: false, errors: [] };
    this._idx = {};
    this.v = 0;
  }

  async load(adapter) {
    this.adapter = adapter;
    this.data = await adapter.loadAll();
    this._idx = {};
    this.emit();
  }
  replaceAll(data) { this.data = { ...Object.fromEntries(TABLE_KEYS.map(k => [k, []])), ...data }; this._idx = {}; this.emit(); }

  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { this.v++; this.listeners.forEach(f => f()); }

  get(t) { return this.data[t]; }
  find(t, id) {
    let m = this._idx[t];
    if (!m || m.n !== this.data[t].length) { m = this._idx[t] = { n: this.data[t].length, map: new Map(this.data[t].map(r => [r.id, r])) }; }
    return m.map.get(id);
  }

  _persist(fn) {
    this.queue = this.queue.then(fn).catch(e => { console.error(e); this.onError?.(e); });
    return this.queue;
  }

  // ---- escrita (otimista) ----
  put(t, row, { silent = false } = {}) { return this.putMany(t, [row], { silent }); }
  putMany(t, rows, { silent = false } = {}) {
    rows = rows.map(r => ({ ...r, id: r.id ?? uid() }));
    const arr = this.data[t]; const ix = new Map(arr.map((r, i) => [r.id, i]));
    for (const r of rows) { if (ix.has(r.id)) arr[ix.get(r.id)] = { ...arr[ix.get(r.id)], ...r }; else { arr.push(r); ix.set(r.id, arr.length - 1); } }
    this._idx[t] = null;
    if (!silent) this.emit();
    return this._persist(() => this.adapter.upsertMany(t, rows)).then(() => rows);
  }
  del(t, id) { return this.delMany(t, [id]); }
  delMany(t, ids) {
    const s = new Set(ids);
    this.data[t] = this.data[t].filter(r => !s.has(r.id)); this._idx[t] = null;
    this.emit();
    return this._persist(() => this.adapter.removeMany(t, ids));
  }

  // ---- configurações (tabela settings: id = chave) ----
  setting(key, def = null) {
    const shared = SHARED_SETTINGS.has(key);
    const r = this.find(shared ? 'sharedSettings' : 'settings', key) || (shared ? this.find('settings', key) : null); // fallback: dados locais antigos
    return r && r.value !== undefined && r.value !== null ? r.value : def;
  }
  setSetting(key, value) { return this.put(SHARED_SETTINGS.has(key) ? 'sharedSettings' : 'settings', { id: key, value }); }

  // shared=false (padrão na nuvem): apaga só os dados pessoais e preserva os investimentos compartilhados
  async wipe({ shared = true } = {}) {
    await this.adapter.clearAll({ shared });
    this.replaceAll(shared ? {} : Object.fromEntries([...SHARED].map(k => [k, this.data[k]])));
  }
  exportJSON() { return JSON.stringify({ app: 'lookthemoney', version: 1, exportedAt: new Date().toISOString(), data: this.data }, null, 1); }
  async importJSON(text, { replace = false } = {}) {
    const j = JSON.parse(text);
    if (j.app !== 'lookthemoney' || !j.data) throw new Error('Arquivo não reconhecido.');
    if (replace) await this.wipe({ shared: true });
    for (const k of TABLE_KEYS) if (j.data[k]?.length) await this.putMany(k, j.data[k], { silent: true });
    this.emit();
  }
}
export const store = new Store();
