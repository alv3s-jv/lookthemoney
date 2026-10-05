// Ponto de entrada: autenticação, shell (sidebar / tab bar), roteador por hash e despacho de eventos.
import { CONFIG } from './config.js';
import { LocalAdapter, SupabaseAdapter } from './db.js';
import { store } from './store.js';
import { app, getCtx, ensureRecurring, refreshAll } from './app.js';
import { ui, toggleHidden, toast, bindCharts, openModal, esc } from './ui.js';
import { addMonthsYM, todayISO } from './util.js';
import { billsForMonth } from './calc.js';
import * as FIN from './views-fin.js';
import * as INV from './views-inv.js';
import * as CFG from './views-config.js';
import { txForm, accountForm } from './forms-fin.js';
import { buyForm } from './forms-inv.js';

const FIN_NAV = [['overview', 'Visão geral', 'ph ph-squares-four'], ['tx', 'Receitas e despesas', 'ph ph-arrows-down-up'], ['cards', 'Cartões', 'ph ph-credit-card'], ['bills', 'Contas a pagar', 'ph ph-calendar-check'], ['budget', 'Orçamento', 'ph ph-chart-pie-slice'], ['goals', 'Metas', 'ph ph-flag-pennant'], ['reports', 'Relatórios', 'ph ph-file-text']];
const INV_NAV = [['resumo', 'Resumo', 'ph ph-squares-four'], ['desempenho', 'Desempenho', 'ph ph-trend-up'], ['posicoes', 'Posições', 'ph ph-wallet'], ['proventos', 'Proventos', 'ph ph-coins'], ['alocacao', 'Alocação', 'ph ph-target']];
const VIEWS = {
  fin: { overview: FIN.overview, tx: FIN.tx, cards: FIN.cards, bills: FIN.bills, budget: FIN.budget, goals: FIN.goals, reports: FIN.reports },
  inv: { resumo: INV.resumo, desempenho: INV.desempenho, posicoes: INV.posicoes, ativo: INV.ativo, proventos: INV.proventos, alocacao: INV.alocacao },
};
const lastRoute = { fin: 'overview', inv: 'resumo' };
let param = null, view = null, moreModal = null;

// ----------------------------------------------------------------------------------- roteador
function parseHash() {
  const h = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (h[0] === 'config') { app.env = app.env || 'fin'; app.route = 'config'; param = null; return; }
  const env = h[0] === 'inv' ? 'inv' : 'fin';
  const r = h[1] && VIEWS[env][h[1]] ? h[1] : lastRoute[env];
  app.env = env; app.route = r; param = h[2] || null; lastRoute[env] = r === 'ativo' ? lastRoute[env] : r;
}
const go = to => { location.hash = '#/' + to; };

// ----------------------------------------------------------------------------------- shell
function navBadge(c) {
  const open = [...billsForMonth(c.bills, c.cards, c.txs, c.billPayments, c.todayYM)].filter(b => !b.paid && b.date <= addDaysISO(c.today, 7));
  return open.length ? String(open.length) : '';
}
const addDaysISO = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

function shell(c) {
  const env = app.env, nav = env === 'inv' ? INV_NAV : FIN_NAV, cur = app.route === 'ativo' ? 'posicoes' : app.route;
  const badge = navBadge(c);
  const initials = ((app.user?.email || 'LM').replace(/[^a-z]/gi, '').slice(0, 2) || 'LM').toUpperCase();
  const envSw = `<div class="envsw" role="tablist">${[['fin', 'Finanças', 'ph ph-wallet'], ['inv', 'Investimentos', 'ph ph-chart-line-up']].map(([k, l, i]) => `<button role="tab" aria-selected="${k === env}" class="${k === env ? 'on' : ''}" data-act="env" data-env="${k}"><i class="${i}"></i>${l}</button>`).join('')}</div>`;
  document.getElementById('side').innerHTML = `<div class="brand"><div class="brand-mark"><i class="ph ph-eye"></i></div>LookTheMoney</div>${envSw}
    <nav class="navlist" aria-label="Navegação"><span class="navlist-t">${env === 'inv' ? 'Investimentos' : 'Controle financeiro'}</span>${nav.map(([k, l, i]) => `<a class="navitem ${k === cur && app.route !== 'config' ? 'on' : ''}" href="#/${env}/${k}" ${k === cur && app.route !== 'config' ? 'aria-current="page"' : ''}><i class="${i}"></i><span>${l}</span>${env === 'fin' && k === 'bills' && badge ? `<span class="badge">${badge}</span>` : ''}</a>`).join('')}</nav>
    <div class="side-foot"><button class="navitem" data-act="toggle-hidden" title="${ui.hidden ? 'Mostrar valores' : 'Ocultar valores'}"><i class="ph ph-eye${ui.hidden ? '-slash' : ''}"></i><span>${ui.hidden ? 'Mostrar valores' : 'Ocultar valores'}</span></button>
      <a class="navitem ${app.route === 'config' ? 'on' : ''}" href="#/config"><i class="ph ph-gear"></i><span>Configurações</span></a>
      <div class="me"><div class="avatar">${initials}</div><div class="me-t"><span>${app.cloud ? 'Minha conta' : 'Modo local'}</span><span>${esc(app.cloud ? app.user?.email || '' : 'dados neste navegador')}</span></div></div></div>`;
  document.getElementById('mtop').innerHTML = `${envSw}<button class="iconbtn" data-act="toggle-hidden" aria-label="${ui.hidden ? 'Mostrar valores' : 'Ocultar valores'}"><i class="ph ph-eye${ui.hidden ? '-slash' : ''}" style="font-size:20px"></i></button>`;
  const tabs = env === 'inv'
    ? [['resumo', 'Resumo', 'ph ph-squares-four'], ['posicoes', 'Posições', 'ph ph-wallet'], ['__buy', 'Comprar', 'ph ph-plus', 1], ['proventos', 'Proventos', 'ph ph-coins'], ['__more', 'Mais', 'ph ph-dots-three-outline']]
    : [['overview', 'Início', 'ph ph-squares-four'], ['tx', 'Lançamentos', 'ph ph-arrows-down-up'], ['__tx', 'Lançar', 'ph ph-plus', 1], ['bills', 'Contas', 'ph ph-calendar-check'], ['__more', 'Mais', 'ph ph-dots-three-outline']];
  document.getElementById('tabbar').innerHTML = tabs.map(([k, l, i, fab]) => `<button class="${k === cur && app.route !== 'config' ? 'on' : ''} ${fab ? 'fab' : ''}" data-act="${k === '__buy' ? 'buy' : k === '__tx' ? 'new-tx' : k === '__more' ? 'more' : 'nav'}" data-to="${env}/${k}" aria-label="${l}"><i class="${i}"></i>${fab ? '' : l}</button>`).join('');
  document.title = `${app.route === 'config' ? 'Configurações' : (view?.title || 'Início')} · LookTheMoney`;
}

// ----------------------------------------------------------------------------------- render
let raf = 0;
export function scheduleRender() { cancelAnimationFrame(raf); raf = requestAnimationFrame(render); }
function render() {
  const c = getCtx();
  parseHash();
  view = app.route === 'config' ? CFG.config : VIEWS[app.env][app.route];
  const el = document.getElementById('view');
  const ae = document.activeElement, keep = ae?.dataset?.keep, selS = ae?.selectionStart, selE = ae?.selectionEnd;
  const y = window.scrollY;
  try { el.innerHTML = view.render(c, param); }
  catch (e) { console.error(e); el.innerHTML = `<div class="panel"><div class="empty"><i class="ph ph-bug"></i><p>Algo deu errado ao montar esta tela.</p><pre class="muted" style="white-space:pre-wrap;font-size:12px">${esc(e.message)}</pre></div></div>`; }
  shell(c);
  if (keep) { const n = el.querySelector(`[data-keep="${keep}"]`); if (n) { n.focus(); try { n.setSelectionRange(selS, selE); } catch { /* ok */ } } }
  window.scrollTo(0, routeChanged ? 0 : y); routeChanged = false;
  bindCharts(el);
  view.onMount?.(el, c);
}
let routeChanged = false;

// ----------------------------------------------------------------------------------- eventos
const GLOBAL = {
  nav: el => go(el.dataset.to),
  env: el => go(`${el.dataset.env}/${lastRoute[el.dataset.env]}`),
  'month-prev': () => { app.ym = addMonthsYM(app.ym, -1); return true; },
  'month-next': () => { app.ym = addMonthsYM(app.ym, 1); return true; },
  'new-tx': () => txForm(),
  'new-account': () => accountForm(),
  'load-demo': () => CFG.loadDemo(),
  refresh: () => refreshAll({ force: true }),
  period: el => { app.period = el.dataset.v; return true; },
  buy: () => buyForm(),
  'open-asset': el => go('inv/ativo/' + encodeURIComponent(el.dataset.t)),
  'toggle-hidden': () => { toggleHidden(); return true; },
  logout: async () => { await app.adapter.signOut(); location.reload(); },
  more: () => {
    const nav = app.env === 'inv' ? INV_NAV : FIN_NAV, other = app.env === 'inv' ? 'fin' : 'inv';
    moreModal = openModal({ title: 'Menu', body: `<div class="navlist">${nav.map(([k, l, i]) => `<button class="navitem" data-m="${app.env}/${k}"><i class="${i}"></i>${l}</button>`).join('')}<button class="navitem" data-m="${other}/${lastRoute[other]}"><i class="ph ph-swap"></i>Ir para ${other === 'inv' ? 'Investimentos' : 'Finanças'}</button><button class="navitem" data-m="config"><i class="ph ph-gear"></i>Configurações</button></div>`, onMount: a => a.el.addEventListener('click', e => { const b = e.target.closest('[data-m]'); if (b) { a.close(); go(b.dataset.m); } }) });
  },
};

function onClick(e) {
  if (e.target.closest('.modal')) return;
  const el = e.target.closest('[data-act]'); if (!el) return;
  const act = el.dataset.act; const c = getCtx();
  const fn = (view?.actions && view.actions[act]) || GLOBAL[act];
  if (!fn) return;
  if (el.tagName === 'A') e.preventDefault();
  const r = fn(el, e, c);
  Promise.resolve(r).then(v => { if (v === true) scheduleRender(); });
}
function onInput(e) { if (e.target.closest('.modal')) return; const r = view?.onInput?.(e, getCtx()); if (r === true) scheduleRender(); }
function onChange(e) { if (e.target.closest('.modal')) return; const r = view?.onChange?.(e, getCtx()); if (r === true) scheduleRender(); }
function onKey(e) {
  const t = e.target, typing = t.matches?.('input, textarea, select, [contenteditable]') || document.querySelector('.modal');
  if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'n') { e.preventDefault(); app.env === 'inv' ? buyForm() : txForm(); }
  if (e.key === '/') { const s = document.querySelector('[data-keep]'); if (s) { e.preventDefault(); s.focus(); } }
}

// ----------------------------------------------------------------------------------- boot
async function startApp(adapter) {
  app.adapter = adapter; app.cloud = adapter.mode === 'cloud'; app.user = await adapter.user();
  const root = document.getElementById('root');
  root.innerHTML = '<div class="app"><aside class="side" id="side"></aside><div class="main"><div class="mtop" id="mtop"></div><main class="page" id="view" tabindex="-1" aria-live="polite"></main></div></div><nav class="tabbar" id="tabbar" aria-label="Navegação"></nav>';
  store.onError = e => toast('Não foi possível salvar: ' + e.message, { kind: 'error', ms: 6000 });
  await store.load(adapter);
  await ensureRecurring();
  store.subscribe(scheduleRender);
  document.addEventListener('click', onClick); document.addEventListener('input', onInput); document.addEventListener('change', onChange); document.addEventListener('keydown', onKey);
  window.addEventListener('hashchange', () => { routeChanged = true; scheduleRender(); });
  if (!location.hash) location.hash = '#/fin/overview';
  routeChanged = true;
  render();
  if (store.get('assets').length) refreshAll();
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => { if (document.hidden) hiddenAt = Date.now(); else if (hiddenAt && Date.now() - hiddenAt > 15 * 60 * 1000 && store.get('assets').length) refreshAll(); });
  if ('serviceWorker' in navigator && location.protocol.startsWith('http') && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') navigator.serviceWorker.register('sw.js').catch(() => {});
}

const LOCALHOST = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
// Exige o 2º fator quando a conta o tem; só então inicia o app (os dados também ficam bloqueados no banco, via RLS).
async function gate(ad) {
  const st = await ad.mfaState().catch(() => ({ needsChallenge: false }));
  if (st.needsChallenge) CFG.renderMfa(ad, () => startApp(ad)); else await startApp(ad);
}
async function boot() {
  const root = document.getElementById('root');
  try {
    const forceLocal = LOCALHOST && new URLSearchParams(location.search).has('local');
    const configured = CONFIG.supabaseUrl && CONFIG.supabaseAnonKey;
    if (configured && !forceLocal) {
      const ad = new SupabaseAdapter(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey);
      const logged = await ad.init();
      if (logged) await gate(ad); else CFG.renderAuth(ad, () => gate(ad));
    } else if (!LOCALHOST) {
      // Publicado sem Supabase: nunca cair em modo local (dados ficariam só neste navegador, sem proteção).
      throw new Error('Supabase não configurado neste deploy. Defina as variáveis SUPABASE_URL e SUPABASE_ANON_KEY no GitHub (ver README).');
    } else {
      const ad = new LocalAdapter(forceLocal ? 'lookthemoney-local' : 'lookthemoney'); await ad.init(); await startApp(ad);
    }
  } catch (e) {
    console.error(e);
    root.innerHTML = `<div class="boot"><div style="max-width:460px;padding:20px"><h3>Não foi possível iniciar</h3><p class="muted">${esc(e.message)}</p>${LOCALHOST ? '<p class="muted">Se estiver abrindo o arquivo direto do disco (file://), rode um servidor local: <code>iniciar.bat</code> ou <code>npm start</code>.</p>' : ''}</div></div>`;
  }
}
boot();
