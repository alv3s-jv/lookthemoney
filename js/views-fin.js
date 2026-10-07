// Telas do módulo Finanças.
import { store } from './store.js';
import { app, memberName, getCtx } from './app.js';
import {
  money, smoney, pct, pctPlain, num, gain, gainMoney, gainPct, col, arrow, kpi, countUp, tag, progress, empty, monthNav, seg, barsIncomeExpense,
  donut, ring, toast, confirmDialog, esc, icon, options, field, openModal, formData, errBox,
} from './ui.js';
import {
  monthSummary, monthlySeries, spentByCategory, accountBalance, invoiceItems, invoiceCycle, openInvoiceYM, installmentsCommitted,
  activeInstallments, billsForMonth, goalForecast, buildInsights, monthsDiff, isExpense,
} from './calc.js';
import { EXPENSE_CATS, INCOME_CATS, APORTE_CAT, catIcon, UP, DN, WARN, KIND_LABEL } from './meta.js';
import { txForm, billForm, payBill, unpayBill, cardForm, goalForm, goalDeposit, deleteTx, accountForm } from './forms-fin.js';
import {
  ymLabel, ymShort, addMonthsYM, dayLabel, fmtDM, fmtDate, MONTHS, MONTHS_SHORT, daysInMonth, groupBy, sum, parseNum, nf, todayISO, clamp, addDays, parseISO, WEEKDAYS,
} from './util.js';
import { openImport } from './import.js';

export const head = (title, sub = '', actions = '') => `<div class="page-head"><div><h1>${title}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}</div><div class="head-actions">${actions}</div></div>`;
const eye = () => '';
const nav = to => `data-act="nav" data-to="${to}"`;
const isCur = c => c.ym === c.todayYM;
const upTo = c => (c.ym === c.todayYM ? c.today : null);

// =============================================================================================== Visão geral
function alerts(c) {
  const out = [];
  const bills = [...billsForMonth(c.bills, c.cards, c.txs, c.billPayments, addMonthsYM(c.todayYM, -1)), ...billsForMonth(c.bills, c.cards, c.txs, c.billPayments, c.todayYM)];
  const over = bills.filter(b => !b.paid && b.date < c.today);
  if (over.length) out.push({ tone: 'dn', icon: 'ph ph-warning-circle', text: `${over.length} conta${over.length > 1 ? 's' : ''} atrasada${over.length > 1 ? 's' : ''}: ${over.slice(0, 3).map(b => b.name).join(', ')} (${money(sum(over, b => b.amount), 0)})`, to: 'fin/bills' });
  const soon = bills.filter(b => !b.paid && b.date >= c.today && b.date <= addDays(c.today, 3));
  if (soon.length) out.push({ tone: 'warn', icon: 'ph ph-clock', text: `Vence em até 3 dias: ${soon.map(b => `${b.name} (${fmtDM(b.date)})`).join(', ')}`, to: 'fin/bills' });
  const spent = spentByCategory(c.txs, c.todayYM, c.today);
  for (const [cat, plan] of Object.entries(c.plans)) { if (cat === APORTE_CAT || !plan) continue; const r = (spent[cat] || 0) / plan; if (r > 1.0001) out.push({ tone: 'dn', icon: 'ph ph-chart-pie-slice', text: `${cat} estourou o teto: ${money(spent[cat], 0)} de ${money(plan, 0)}`, to: 'fin/budget' }); else if (r >= 0.85) out.push({ tone: 'warn', icon: 'ph ph-chart-pie-slice', text: `${cat} em ${Math.round(r * 100)}% do teto do mês`, to: 'fin/budget' }); }
  for (const card of c.cards) { const ym = openInvoiceYM(card, c.today), inv = invoiceItems(card, c.txs, ym); if (card.creditLimit && inv.total / card.creditLimit >= 0.8) out.push({ tone: 'warn', icon: 'ph ph-credit-card', text: `Cartão ${card.name} com ${Math.round(inv.total / card.creditLimit * 100)}% do limite usado`, to: 'fin/cards' }); }
  const plan = c.plans[APORTE_CAT];
  if (plan && c.today.slice(8) >= '20') { const ap = monthSummary(c.txs, c.todayYM, c.today).aporte; if (ap < plan * 0.7) out.push({ tone: 'warn', icon: 'ph ph-chart-line-up', text: `Aporte do mês em ${money(ap, 0)} de ${money(plan, 0)} planejados`, to: 'fin/budget' }); }
  return out;
}

export const overview = {
  title: 'Visão geral',
  render(c) {
    const noData = !c.txs.length && !c.accounts.length;
    if (noData) return `${head('Bem-vindo ao LookTheMoney', 'Controle financeiro e de investimentos em um só lugar')}
      <div class="panel" style="max-width:720px"><h3 style="font-size:18px">Comece em 3 passos</h3>
      <ol style="padding-left:18px;line-height:2"><li><b>Cadastre suas contas</b> (saldo inicial de cada uma)</li><li><b>Lance receitas e despesas</b> — ou importe o extrato em CSV</li><li><b>Defina tetos no Orçamento</b> e registre seus ativos em Investimentos</li></ol>
      <div class="row wrap" style="margin-top:10px"><button class="btn btn-primary" data-act="new-account"><i class="ph ph-plus"></i> Cadastrar primeira conta</button><button class="btn btn-secondary" data-act="load-demo">Explorar com dados de exemplo</button></div></div>`;
    const s = monthSummary(c.txs, c.ym, upTo(c));
    const series = monthlySeries(c.txs, c.todayYM, 12, c.today);
    const accBal = sum(c.accounts, a => accountBalance(a, c.txs, c.today));
    const inv = c.portfolio.total;
    const spent = spentByCategory(c.txs, c.todayYM, c.today);
    const budget = Object.entries(c.plans).filter(([k, v]) => v > 0 && k !== APORTE_CAT).map(([k, v]) => ({ k, used: spent[k] || 0, plan: v, r: (spent[k] || 0) / v })).sort((a, b) => b.r - a.r).slice(0, 5);
    const bills = billsForMonth(c.bills, c.cards, c.txs, c.billPayments, c.todayYM).filter(b => !b.paid).slice(0, 5);
    const al = alerts(c);
    const neg = c.accounts.map(a => ({ a, b: accountBalance(a, c.txs, c.today) })).filter(x => x.b < -1);
    if (neg.length) al.unshift({ tone: 'warn', icon: 'ph ph-bank', to: 'config', text: `${neg.map(x => `${x.a.name} está em ${money(x.b, 0)}`).join(' · ')} — provavelmente falta o saldo inicial da conta (os aportes saem dela, mas o dinheiro de origem não foi lançado). Isso reduz o patrimônio total acima. Toque para ajustar em Configurações → Contas.` });
    const name = (store.setting('userName') || memberName(app.user?.id) || (app.user?.email || '').split('@')[0] || '').replace(/^./, m => m.toUpperCase());
    return `${head(`${new Date().getHours() < 12 ? 'Bom dia' : new Date().getHours() < 18 ? 'Boa tarde' : 'Boa noite'}${name && app.user?.id !== 'local' ? ', ' + esc(name) : ''}`, new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^./, m => m.toUpperCase()), `<button class="btn btn-primary" data-act="new-tx"><i class="ph ph-plus"></i> Novo lançamento</button>`)}
    <div class="grid g-kpi">
      ${`<div class="kpi hero tone-gold"><div class="kpi-l"><i class="ph ph-vault kpi-ic"></i>Patrimônio total</div><div class="kpi-v num">${countUp(accBal + inv, { key: 'ov-pat' })}</div><div class="kpi-s">${money(accBal, 0)} em contas · ${money(inv, 0)} investidos</div></div>`}
      ${kpi({ label: 'Receitas do mês', ic: 'ph ph-arrow-circle-down', tone: 'up', value: countUp(s.income, { key: 'ov-rec' }), sub: `${s.count} lançamentos` })}
      ${kpi({ label: 'Despesas do mês', ic: 'ph ph-arrow-circle-up', tone: 'dn', value: countUp(s.expense, { key: 'ov-des' }), sub: s.income > 0 ? `${Math.round(s.expense / s.income * 100)}% da receita` : '' })}
      ${kpi({ label: 'Saldo do mês', ic: 'ph ph-scales', tone: s.balance >= 0 ? 'teal' : 'dn', value: `<span style="color:${col(s.balance)}">${countUp(s.balance, { key: 'ov-sal' })}</span>`, sub: `após aportes de ${money(s.aporte, 0)}` })}
    </div>
    ${al.length ? `<div class="stack" style="margin-bottom:14px;gap:8px">${al.slice(0, 4).map(a => `<div class="notice ${a.tone === 'dn' || a.tone === 'warn' ? 'warn' : ''}" ${nav(a.to)} style="cursor:pointer"><i class="${a.icon}" ${a.tone === 'dn' ? 'style="color:var(--dn)"' : ''}></i><span>${esc(a.text)}</span></div>`).join('')}</div>` : ''}
    <div class="grid g-2">
      <div class="panel"><div class="panel-h"><h3>Receitas e despesas · 12 meses</h3><div class="legend"><span><i class="sw" style="background:var(--color-accent)"></i>Receitas</span><span><i class="sw" style="background:var(--color-neutral-500)"></i>Despesas</span></div></div>${series.some(m => m.income > 0 || m.expense > 0) ? barsIncomeExpense(series) : empty('Seus primeiros lançamentos aparecem aqui como barras de receitas e despesas, mês a mês.', '<button class="btn btn-primary btn-sm" data-act="new-tx"><i class="ph ph-plus"></i> Lançar agora</button>', 'ph-chart-bar')}</div>
      <div class="panel"><div class="panel-h"><h3>Orçamento de ${MONTHS[+c.todayYM.slice(5) - 1].toLowerCase()}</h3><a href="#/fin/budget" class="sub">ver tudo</a></div>
        ${budget.length ? budget.map(b => `<div style="margin-bottom:12px"><div class="row spread" style="font-size:13px;margin-bottom:5px"><span>${icon(catIcon(b.k))} ${b.k}</span><span class="num muted">${money(b.used, 0)} / ${money(b.plan, 0)}</span></div>${progress(b.r, { color: b.r > 1.0001 ? 'var(--color-accent-700)' : b.r > 0.85 ? DN : 'var(--color-accent)' })}</div>`).join('') : empty('Defina tetos por categoria para acompanhar aqui.', `<a class="btn btn-secondary btn-sm" href="#/fin/budget">Abrir orçamento</a>`)}</div>
    </div>
    <div class="grid g-2e" style="margin-top:12px">
      <div class="panel"><div class="panel-h"><h3>Próximas contas</h3><a href="#/fin/bills" class="sub">ver tudo</a></div>
        ${bills.length ? `<div class="list">${bills.map(b => `<div class="li"><div class="li-ic">${icon(b.kind === 'card' ? 'ph ph-credit-card' : 'ph ph-receipt')}</div><div class="li-t"><b>${esc(b.name)}</b><span>vence ${fmtDM(b.date)}${b.date < c.today ? ' · <span class="dn">atrasada</span>' : ''}</span></div><div class="li-v num">${money(b.amount)}</div></div>`).join('')}</div>` : empty('Tudo em dia: nenhuma conta em aberto neste mês.', '<a class="btn btn-secondary btn-sm" href="#/fin/bills"><i class="ph ph-plus"></i> Cadastrar conta</a>', 'ph-confetti')}</div>
      <div class="panel"><div class="panel-h"><h3>Contas</h3><a href="#/config" class="sub">gerenciar</a></div>
        ${c.accounts.length ? `<div class="list">${c.accounts.map(a => { const b = accountBalance(a, c.txs, c.today); return `<div class="li"><div class="li-ic">${icon('ph ph-bank')}</div><div class="li-t"><b>${esc(a.name)}</b></div><div class="li-v num" style="color:${b < 0 ? DN : 'inherit'}">${money(b)}</div></div>`; }).join('')}</div>` : empty('Cadastre suas contas em Configurações.')}</div>
    </div>`;
  },
  actions: {},
};

// =============================================================================================== Lançamentos
const TX = { type: 'Todos', q: '', cat: '', src: '', limit: 120 };
const srcLabel = (c, t) => (t.cardId ? 'Cartão ' + (store.find('cards', t.cardId)?.name || '?') : store.find('accounts', t.accountId)?.name || '—');
export const tx = {
  title: 'Receitas e despesas',
  render(c) {
    const s = monthSummary(c.txs, c.ym, upTo(c));
    const month = c.txs.filter(t => t.date.slice(0, 7) === c.ym);
    const q = TX.q.trim().toLowerCase();
    const f = month.filter(t => (TX.type === 'Todos' || (TX.type === 'Receitas' ? t.kind === 'receita' : TX.type === 'Despesas' ? t.kind === 'despesa' : TX.type === 'Aportes' ? t.kind === 'aporte' : false)) && (!TX.cat || t.category === TX.cat) && (!TX.src || (TX.src.startsWith('c:') ? t.cardId === TX.src.slice(2) : t.accountId === TX.src.slice(2) && !t.cardId)) && (!q || t.description.toLowerCase().includes(q) || t.category.toLowerCase().includes(q))).sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''));
    const shown = f.slice(0, TX.limit);
    const days = groupBy(shown, t => t.date);
    const cats = [...new Set(c.txs.map(t => t.category))].sort();
    const rowHtml = t => {
      const future = t.date > c.today, inc = t.kind === 'receita', ap = t.kind === 'aporte', neutral = t.kind === 'fatura' || t.kind === 'resgate';
      const extra = [t.recurrence === 'monthly' ? 'recorrente' : '', t.installmentTotal > 1 ? `parcela ${t.installmentNo}/${t.installmentTotal}` : '', future ? 'agendado' : ''].filter(Boolean).join(' · ');
      return `<div class="li" data-id="${t.id}"><div class="li-ic ${inc ? 'in' : ap ? 'ap' : ''}">${icon(neutral ? 'ph ph-arrows-left-right' : catIcon(t.category))}</div>
        <div class="li-t"><b>${esc(t.description)}</b><span>${esc(t.category)} · ${esc(srcLabel(c, t))}${extra ? ' · ' + extra : ''}</span></div>
        <div class="li-v num" style="color:${inc ? UP : 'inherit'};${future ? 'opacity:.6' : ''}">${t.amount > 0 ? '+' : '−'}${money(Math.abs(t.amount)).replace('−', '')}</div>
        <div class="acts"><button class="iconbtn" data-act="edit-tx" data-id="${t.id}" aria-label="Editar"><i class="ph ph-pencil-simple"></i></button><button class="iconbtn del" data-act="del-tx" data-id="${t.id}" aria-label="Excluir"><i class="ph ph-trash"></i></button></div></div>`;
    };
    return `${head('Receitas e despesas', 'Todos os lançamentos das suas contas e cartões', `${monthNav(c.ym, ymLabel(c.ym))}<button class="btn btn-secondary" data-act="import"><i class="ph ph-upload-simple"></i> Importar extrato</button><button class="btn btn-primary" data-act="new-tx"><i class="ph ph-plus"></i> Novo lançamento</button>`)}
    <div class="grid g-kpi">${kpi({ label: 'Receitas', value: money(s.income) })}${kpi({ label: 'Despesas', value: money(s.expense) })}${kpi({ label: 'Aportes', value: money(s.aporte) })}${kpi({ label: 'Saldo do mês', value: `<span style="color:${col(s.balance)}">${money(s.balance)}</span>` })}</div>
    <div class="toolbar"><div class="search"><i class="ph ph-magnifying-glass"></i><input class="input" data-keep="q" data-f="q" placeholder="Buscar descrição ou categoria" value="${esc(TX.q)}" aria-label="Buscar"></div>
      ${seg('ftype', [['Todos', 'Todos'], ['Receitas', 'Receitas'], ['Despesas', 'Despesas'], ['Aportes', 'Aportes']], TX.type)}
      <select class="input" data-f="cat" style="width:auto" aria-label="Categoria"><option value="">Todas as categorias</option>${options(cats, TX.cat)}</select>
      <select class="input" data-f="src" style="width:auto" aria-label="Conta ou cartão"><option value="">Todas as contas</option>${options([...c.accounts.map(a => [`a:${a.id}`, a.name]), ...c.cards.map(k => [`c:${k.id}`, 'Cartão ' + k.name])], TX.src)}</select></div>
    <div class="panel">${shown.length ? Object.keys(days).sort().reverse().map(d => `<div class="day-h"><span>${dayLabel(d)}</span><span class="num">${(() => { const v = sum(days[d].filter(t => t.kind === 'receita' || t.kind === 'despesa'), t => t.amount); return v ? (v >= 0 ? '+' : '−') + money(Math.abs(v)).replace('−', '') : ''; })()}</span></div><div class="list">${days[d].map(rowHtml).join('')}</div>`).join('') + (f.length > shown.length ? `<div style="text-align:center;padding-top:12px"><button class="btn btn-secondary" data-act="more-tx">Mostrar mais (${f.length - shown.length})</button></div>` : '') : empty(month.length ? 'Nenhum lançamento com esses filtros.' : 'Nenhum lançamento neste mês.', `<button class="btn btn-primary btn-sm" data-act="new-tx"><i class="ph ph-plus"></i> Novo lançamento</button>`)}</div>`;
  },
  onInput(e) { if (e.target.dataset.f === 'q') { TX.q = e.target.value; TX.limit = 120; return true; } },
  onChange(e) { const k = e.target.dataset.f; if (k) { TX[k] = e.target.value; TX.limit = 120; return true; } if (e.target.name === 'ftype') { TX.type = e.target.value; TX.limit = 120; return true; } },
  actions: {
    'more-tx': () => { TX.limit += 200; return true; },
    'edit-tx': (el) => { txForm(store.find('transactions', el.dataset.id)); },
    'del-tx': async (el) => { await deleteTx(store.find('transactions', el.dataset.id)); },
    import: () => openImport(),
  },
};

// =============================================================================================== Cartões
const CARD = { sel: null, ym: null };
export const cards = {
  title: 'Cartões',
  render(c) {
    if (!c.cards.length) return `${head('Cartões', 'Faturas, limites e parcelamentos', `<button class="btn btn-primary" data-act="new-card"><i class="ph ph-plus"></i> Adicionar cartão</button>`)}<div class="panel">${empty('Nenhum cartão cadastrado. Cadastre para acompanhar faturas, limite e parcelamentos.', `<button class="btn btn-primary btn-sm" data-act="new-card">Adicionar cartão</button>`)}</div>`;
    const card = c.cards.find(k => k.id === CARD.sel) || c.cards[0]; CARD.sel = card.id;
    const openYM = openInvoiceYM(card, c.today);
    const ym = CARD.ym && CARD.sel === card.id ? CARD.ym : openYM;
    const inv = invoiceItems(card, c.txs, ym);
    const key = `card:${card.id}|${ym}`, pay = c.billPayments.find(p => p.id === key);
    const status = pay ? 'Paga' : ym === openYM ? 'Aberta' : ym < openYM ? 'Fechada' : 'Futura';
    const unpaid = sum(c.cards.filter(k => k.id === card.id), k => { let t = 0; for (let i = -3; i <= 0; i++) { const y = addMonthsYM(openYM, i); if (!c.billPayments.find(p => p.id === `card:${k.id}|${y}`)) t += invoiceItems(k, c.txs, y).total; } return t; });
    const avail = Math.max(0, card.creditLimit - unpaid);
    const fut = installmentsCommitted(c.txs, c.todayYM, 6), maxF = Math.max(...fut.map(f => f.total), 1);
    const inst = activeInstallments(c.txs, c.today);
    const byDay = groupBy(inv.items.sort((a, b) => b.date.localeCompare(a.date)), t => t.date);
    return `${head('Cartões', 'Faturas, limites e parcelamentos', `<button class="btn btn-secondary" data-act="edit-card" data-id="${card.id}"><i class="ph ph-pencil-simple"></i> Editar</button><button class="btn btn-primary" data-act="new-card"><i class="ph ph-plus"></i> Adicionar cartão</button>`)}
    <div class="grid g-3" style="margin-bottom:14px">${c.cards.map(k => { const y = openInvoiceYM(k, c.today), t = invoiceItems(k, c.txs, y).total; return `<button class="cc ${k.id === card.id ? 'on' : ''}" data-act="sel-card" data-id="${k.id}"><div class="row spread"><b style="font-family:var(--font-heading);font-weight:500;font-size:16px">${esc(k.name)}</b><span class="muted num">•••• ${esc(k.last4 || '')}</span></div><div><div class="kpi-l">Fatura atual</div><div class="kpi-v num">${money(t)}</div></div><div>${progress(t / k.creditLimit)}<div class="sub-s num" style="margin-top:6px">${money(Math.max(0, k.creditLimit - t), 0)} disponível</div></div></button>`; }).join('')}</div>
    <div class="grid g-2">
      <div class="panel"><div class="panel-h"><div class="row"><button class="iconbtn" data-act="inv-prev" aria-label="Fatura anterior"><i class="ph ph-caret-left"></i></button><div><h3>Fatura ${ymLabel(ym).split(' ')[0].toLowerCase()} · ${esc(card.name)} ${tag(status, status === 'Paga' ? 'tag-neutral' : status === 'Aberta' ? 'tag-accent' : 'tag-outline')}</h3><div class="sub">compras de ${fmtDM(inv.from)} a ${fmtDM(inv.to)} · fecha ${fmtDM(inv.close)} · vence ${fmtDM(inv.due)}</div></div><button class="iconbtn" data-act="inv-next" aria-label="Próxima fatura"><i class="ph ph-caret-right"></i></button></div><div class="row"><b class="num" style="font-size:20px">${money(inv.total)}</b>${!pay && inv.total > 0 ? `<button class="btn btn-primary btn-sm" data-act="pay-inv" data-ym="${ym}">Pagar fatura</button>` : pay ? `<button class="btn btn-secondary btn-sm" data-act="unpay-inv" data-key="${key}">Desfazer</button>` : ''}</div></div>
        ${inv.items.length ? Object.keys(byDay).sort().reverse().map(d => `<div class="list">${byDay[d].map(t => `<div class="li" data-id="${t.id}"><div class="li-ic">${icon(catIcon(t.category))}</div><div class="li-t"><b>${esc(t.description)}</b><span>${fmtDM(t.date)} · ${esc(t.category)}${t.installmentTotal > 1 ? ` · parcela ${t.installmentNo}/${t.installmentTotal}` : ''}${t.recurrence === 'monthly' ? ' · recorrente' : ''}</span></div><div class="li-v num">${money(Math.abs(t.amount))}</div><div class="acts"><button class="iconbtn" data-act="edit-tx" data-id="${t.id}" aria-label="Editar"><i class="ph ph-pencil-simple"></i></button></div></div>`).join('')}</div>`).join('') : empty('Sem compras nesta fatura.')}
        <div class="row spread" style="border-top:1px solid var(--line);margin-top:8px;padding-top:12px"><span class="muted">Total da fatura</span><b class="num">${money(inv.total)}</b></div></div>
      <div class="stack"><div class="panel"><div class="panel-h"><h3>Limite</h3></div>${progress(unpaid / card.creditLimit)}<div class="row spread num" style="margin-top:8px;font-size:13px"><span class="muted">Usado ${money(unpaid, 0)}</span><span>${money(avail, 0)} disponível</span></div><div class="hint">Limite total ${money(card.creditLimit, 0)} · soma faturas abertas e fechadas ainda não pagas.</div></div>
        <div class="panel"><div class="panel-h"><h3>Parcelas já comprometidas</h3><span class="sub">todos os cartões · próximos 6 meses</span></div>
          <div class="row" style="align-items:flex-end;height:110px;gap:8px">${fut.map(f => `<div class="grow" style="display:flex;flex-direction:column;align-items:center;gap:4px;justify-content:flex-end;height:100%"><span class="sub-s num">${f.total ? (f.total / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + 'k' : '—'}</span><div style="width:100%;max-width:34px;height:${Math.max(2, f.total / maxF * 70)}px;background:var(--color-accent);border-radius:4px 4px 0 0;opacity:${f.total ? 1 : .25}"></div><span class="sub-s">${MONTHS_SHORT[+f.ym.slice(5) - 1]}</span></div>`).join('')}</div>
          ${inst.length ? `<div class="list" style="margin-top:12px">${inst.map(i => `<div class="li"><div class="li-t"><b>${esc(i.desc)}</b><span>parcela ${i.no} de ${i.total}</span></div><div class="li-v num">${money(i.v)}/mês</div></div>`).join('')}</div>` : ''}</div></div></div>`;
  },
  actions: {
    'new-card': () => cardForm(),
    'edit-card': el => cardForm(store.find('cards', el.dataset.id)),
    'sel-card': el => { CARD.sel = el.dataset.id; CARD.ym = null; return true; },
    'inv-prev': () => { const c = getCtx(), card = c.cards.find(k => k.id === CARD.sel); CARD.ym = addMonthsYM(CARD.ym || openInvoiceYM(card, c.today), -1); return true; },
    'inv-next': () => { const c = getCtx(), card = c.cards.find(k => k.id === CARD.sel); CARD.ym = addMonthsYM(CARD.ym || openInvoiceYM(card, c.today), 1); return true; },
    'edit-tx': el => txForm(store.find('transactions', el.dataset.id)),
    'pay-inv': el => { const c = getCtx(), card = c.cards.find(k => k.id === CARD.sel); const ym = el.dataset.ym; const inv = invoiceItems(card, c.txs, ym); payBill({ key: `card:${card.id}|${ym}`, id: card.id, kind: 'card', name: `Fatura ${card.name}`, amount: inv.total }); },
    'unpay-inv': el => unpayBill({ key: el.dataset.key }),
  },
};

// =============================================================================================== Contas a pagar
export const bills = {
  title: 'Contas a pagar',
  render(c) {
    const prevYM = addMonthsYM(c.ym, -1);
    const carried = c.ym === c.todayYM ? billsForMonth(c.bills, c.cards, c.txs, c.billPayments, prevYM).filter(b => !b.paid && b.date < c.today).map(b => ({ ...b, meta: (b.meta ? b.meta + ' · ' : '') + 'mês anterior' })) : [];
    const list = [...carried, ...billsForMonth(c.bills, c.cards, c.txs, c.billPayments, c.ym)];
    const open = list.filter(b => !b.paid), paid = list.filter(b => b.paid);
    const over = open.filter(b => b.date < c.today), wk = open.filter(b => b.date >= c.today && b.date <= addDays(c.today, 7)), later = open.filter(b => b.date > addDays(c.today, 7) || (c.ym !== c.todayYM && b.date >= c.today));
    const rest = open.filter(b => !over.includes(b) && !wk.includes(b) && !later.includes(b));
    const groups = [['Atrasadas', over, true], ['Próximos 7 dias', wk], [c.ym === c.todayYM ? 'Ainda este mês' : 'No mês', [...later, ...rest]], ['Pagas', paid]].filter(g => g[1].length);
    const row = b => `<div class="li" style="${b.paid ? 'opacity:.55' : ''}"><button class="check ${b.paid ? 'on' : ''}" data-act="toggle-bill" data-key="${b.key}" aria-label="${b.paid ? 'Desfazer pagamento' : 'Marcar como paga'}" title="${b.paid ? 'Desmarcar' : 'Marcar como paga'}"><i class="ph ph-check"></i></button>
      <div class="num muted" style="width:26px;text-align:center">${String(b.day).padStart(2, '0')}</div><div class="li-t"><b style="${b.paid ? 'text-decoration:line-through' : ''}">${esc(b.name)}</b><span>${esc(b.meta || '')}${b.paid && b.payment ? ` · pago em ${fmtDM(b.payment.paidAt)}` : ''}</span></div><div class="li-v num">${money(b.amount)}</div>${b.kind === 'bill' ? `<div class="acts"><button class="iconbtn" data-act="edit-bill" data-id="${b.id}" aria-label="Editar"><i class="ph ph-pencil-simple"></i></button></div>` : ''}</div>`;
    const dim = daysInMonth(c.ym), first = parseISO(c.ym + '-01').getDay();
    const cal = Array.from({ length: first }, () => '<div class="cal-d blank"></div>').join('') + Array.from({ length: dim }, (_, i) => { const d = i + 1, date = `${c.ym}-${String(d).padStart(2, '0')}`, bs = list.filter(b => b.date === date); const all = bs.length && bs.every(b => b.paid), od = bs.some(b => !b.paid && date < c.today); return `<div class="cal-d ${date === c.today ? 'today' : ''} ${bs.length ? 'has' : ''} ${od ? 'over' : ''} ${all ? 'done' : ''}" title="${esc(bs.map(b => `${b.name} ${money(b.amount)}`).join(' · '))}">${d}</div>`; }).join('');
    return `${head('Contas a pagar', 'Agenda de vencimentos do mês', `${monthNav(c.ym, ymLabel(c.ym))}<button class="btn btn-primary" data-act="new-bill"><i class="ph ph-plus"></i> Nova conta</button>`)}
    <div class="grid g-kpi">${kpi({ label: 'Falta pagar no mês', value: money(sum(open, b => b.amount)), sub: `${open.length} conta${open.length === 1 ? '' : 's'}` })}${kpi({ label: 'Já pago', value: money(sum(paid, b => b.payment?.amount ?? b.amount)), sub: `${paid.length} conta${paid.length === 1 ? '' : 's'}` })}${kpi({ label: 'Vence em 7 dias', value: money(sum(wk, b => b.amount)) })}${kpi({ label: 'Atrasadas', value: over.length ? `<span class="dn">${money(sum(over, b => b.amount))}</span>` : 'Nenhuma', sub: over.length ? `${over.length} conta${over.length > 1 ? 's' : ''}` : '' })}</div>
    <div class="grid g-2"><div class="panel">${groups.length ? groups.map(([l, a, bad]) => `<div class="day-h" style="${bad ? 'color:var(--dn)' : ''}"><span>${l}</span><span class="num">${money(sum(a, b => b.amount))}</span></div><div class="list">${a.map(row).join('')}</div>`).join('') : empty('Nenhuma conta neste mês. Cadastre contas fixas (energia, internet, aluguel…) para não esquecer vencimentos.', `<button class="btn btn-primary btn-sm" data-act="new-bill">Nova conta</button>`)}</div>
      <div class="panel"><div class="panel-h"><h3>Calendário de vencimentos</h3></div><div class="cal">${['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map(d => `<div class="cal-h">${d}</div>`).join('')}${cal}</div><div class="legend" style="margin-top:12px"><span><i class="sw" style="background:var(--color-accent)"></i>vence</span><span><i class="sw" style="background:var(--dn)"></i>atrasada</span><span><i class="sw" style="background:var(--color-neutral-600)"></i>paga</span></div></div></div>`;
  },
  actions: {
    'new-bill': () => billForm(),
    'edit-bill': el => billForm(store.find('bills', el.dataset.id)),
    'toggle-bill': el => {
      const c = getCtx(); const occ = billsForMonth(c.bills, c.cards, c.txs, c.billPayments, c.ym).find(b => b.key === el.dataset.key) || billsForMonth(c.bills, c.cards, c.txs, c.billPayments, addMonthsYM(c.ym, -1)).find(b => b.key === el.dataset.key);
      if (!occ) return;
      if (occ.paid) unpayBill(occ); else payBill(occ);
    },
  },
};

// =============================================================================================== Orçamento
const BUD = { edit: false };
export const budget = {
  title: 'Orçamento',
  render(c) {
    const cur = isCur(c), spent = spentByCategory(c.txs, c.ym, upTo(c));
    const cats = [...new Set([...Object.keys(c.plans), ...Object.keys(spent)])].filter(k => k !== APORTE_CAT);
    const rows = cats.map(k => ({ k, kind: EXPENSE_CATS[k]?.kind || '—', used: spent[k] || 0, plan: c.plans[k] || 0 })).sort((a, b) => b.plan - a.plan || b.used - a.used);
    const plan = sum(rows, r => r.plan), used = sum(rows, r => r.used);
    const closed = monthlySeries(c.txs, addMonthsYM(c.todayYM, -1), 3, null).filter(m => m.income > 0);
    const incPlan = +store.setting('plannedIncome', 0) || (closed.length ? sum(closed, m => m.income) / closed.length : 0) || monthSummary(c.txs, c.ym).income;
    const aporte = c.plans[APORTE_CAT] || 0, aporteUsed = spent[APORTE_CAT] || 0;
    const fixed = sum(rows.filter(r => /^fixo|parcelado/.test(r.kind)), r => r.plan), vari = plan - fixed, free = Math.max(0, incPlan - plan - aporte);
    const dim = daysInMonth(c.ym), dayN = cur ? +c.today.slice(8) : c.ym < c.todayYM ? dim : 0, left = plan - used;
    const split = [['Gastos fixos', fixed, 'var(--color-accent-700)'], ['Gastos variáveis', vari, 'var(--color-accent)'], ['Investimentos', aporte, 'var(--color-accent-300)'], ['Sem destino', free, 'var(--color-neutral-700)']];
    const rest = Math.max(incPlan, 1);
    return `${head('Orçamento', `${ymLabel(c.ym)}${cur ? ` · dia ${dayN} de ${dim}` : ''}`, `${monthNav(c.ym, ymLabel(c.ym))}<button class="btn ${BUD.edit ? 'btn-primary' : 'btn-secondary'}" data-act="toggle-edit">${BUD.edit ? 'Concluir' : 'Editar planejamento'}</button>`)}
    <div class="grid g-kpi">
      <div class="kpi hero"><div class="kpi-l">Disponível para gastar no mês</div><div class="kpi-v num" style="color:${left < 0 ? DN : 'inherit'}">${money(left)}</div><div class="kpi-s">de ${money(plan)} planejados</div>${progress(used / (plan || 1), { color: used > plan ? DN : 'var(--color-accent)', marker: cur ? dayN / dim : null })}${cur ? `<div class="kpi-h">traço = ritmo esperado para o dia ${dayN}</div>` : ''}</div>
      ${kpi({ label: 'Gasto até agora', value: money(used), sub: plan ? `${Math.round(used / plan * 100)}% do planejado` : '' })}
      ${kpi({ label: cur ? 'Por dia, até o fim do mês' : 'Média por dia', value: cur ? money(Math.max(0, left) / Math.max(1, dim - dayN + 1)) : money(used / dim), hint: cur ? 'para ficar dentro do planejado' : '' })}
      <div class="kpi"><div class="kpi-l">Receita prevista</div><div class="kpi-v num">${BUD.edit ? `<input class="input num-in" data-f="income" value="${nf(incPlan)}" style="font-size:16px" aria-label="Receita prevista">` : money(incPlan)}</div><div class="kpi-h">${+store.setting('plannedIncome', 0) ? 'definida por você' : 'média dos últimos meses'}</div></div></div>
    <div class="panel" style="margin-bottom:12px"><div class="panel-h"><h3>Como a receita está dividida</h3><span class="sub">${incPlan ? '' : 'informe a receita prevista'}</span></div>
      <div style="display:flex;height:14px;border-radius:99px;overflow:hidden;background:var(--color-neutral-800)">${split.map(([, v, col2]) => `<div style="width:${v / rest * 100}%;background:${col2}"></div>`).join('')}</div>
      <div class="legend" style="margin-top:10px">${split.map(([l, v, col2]) => `<span><i class="sw" style="background:${col2}"></i>${l} <b class="num">${money(v, 0)}</b> <span class="muted">${Math.round(v / rest * 100)}%</span></span>`).join('')}</div></div>
    <div class="panel"><div class="tw"><table class="table"><thead><tr><th>Categoria</th><th>Tipo</th><th class="r">Gasto</th><th class="r">Planejado</th><th class="r">Restante</th><th style="width:20%">Uso</th></tr></thead><tbody>
      ${rows.map(r => { const ratio = r.plan ? r.used / r.plan : (r.used ? 1 : 0), rem = r.plan - r.used; return `<tr><td>${icon(catIcon(r.k))} ${esc(r.k)}</td><td class="muted">${r.kind}</td><td class="r num">${money(r.used)}</td><td class="r num">${BUD.edit ? `<input class="input sm num-in" style="width:104px" data-plan="${esc(r.k)}" value="${r.plan ? nf(r.plan) : ''}" inputmode="decimal" aria-label="Teto de ${esc(r.k)}">` : r.plan ? money(r.plan) : '<span class="muted">sem teto</span>'}</td><td class="r num" style="color:${rem < 0 ? DN : 'inherit'}">${r.plan ? (rem < 0 ? '▼ ' : '') + money(rem) : '—'}</td><td>${r.plan ? progress(ratio, { color: ratio >= 1 ? DN : ratio > 0.85 ? WARN : 'var(--color-accent)' }) : ''}</td></tr>`; }).join('')}
      <tr><td>${icon('ph ph-chart-line-up')} Aporte em investimentos</td><td class="muted">meta mensal</td><td class="r num">${money(aporteUsed)}</td><td class="r num">${BUD.edit ? `<input class="input sm num-in" style="width:104px" data-plan="${esc(APORTE_CAT)}" value="${aporte ? nf(aporte) : ''}" inputmode="decimal" aria-label="Meta de aporte">` : aporte ? money(aporte) : '<span class="muted">sem meta</span>'}</td><td class="r num">${aporte ? money(aporte - aporteUsed) : '—'}</td><td>${aporte ? progress(aporteUsed / aporte) : ''}</td></tr>
      ${BUD.edit ? `<tr><td colspan="6"><div class="row"><select class="input sm" id="newcat" style="width:auto">${options(Object.keys(EXPENSE_CATS).filter(k => !cats.includes(k)))}</select><button class="btn btn-secondary btn-sm" data-act="add-cat">+ Incluir categoria</button></div></td></tr>` : ''}
      </tbody></table></div>${BUD.edit ? '<div class="hint" style="margin-top:8px">Os tetos valem para todos os meses. Deixe vazio para remover o teto.</div>' : ''}</div>`;
  },
  onChange(e) {
    if (e.target.dataset.plan !== undefined) { const v = parseNum(e.target.value); const k = e.target.dataset.plan; if (v > 0) store.put('budgetPlans', { id: k, planned: v }, { silent: true }); else if (store.find('budgetPlans', k)) store.del('budgetPlans', k); return false; }
    if (e.target.dataset.f === 'income') { const v = parseNum(e.target.value); store.setSetting('plannedIncome', v > 0 ? v : 0); return false; }
  },
  actions: {
    'toggle-edit': () => { BUD.edit = !BUD.edit; return true; },
    'add-cat': el => { const sel = document.getElementById('newcat'); if (sel?.value) { store.put('budgetPlans', { id: sel.value, planned: 100 }); } },
  },
};

// =============================================================================================== Metas
export const goals = {
  title: 'Metas',
  render(c) {
    const G = c.goals.map(g => ({ ...g, saved: g.linkInvest ? c.portfolio.total : g.saved }));
    return `${head('Metas', `${G.length} meta${G.length === 1 ? '' : 's'} · ${money(sum(G, g => g.monthly), 0)} por mês direcionados`, `<button class="btn btn-primary" data-act="new-goal"><i class="ph ph-plus"></i> Nova meta</button>`)}
    ${G.length ? `<div class="grid g-2e">${G.map(g => { const f = goalForecast(g, c.todayYM); return `<div class="panel"><div class="goal">${ring(f.ratio, { label: Math.round(f.ratio * 100) + '%' })}<div class="goal-i"><div class="row spread"><b style="font-family:var(--font-heading);font-weight:500;font-size:16px">${icon(g.icon || 'ph ph-flag-pennant')} ${esc(g.name)}</b>${tag(f.left === 0 ? 'Concluída' : f.onTrack ? 'No ritmo' : 'Atrasada', f.onTrack ? 'tag-neutral' : 'tag-accent')}</div><div class="sub-s">${esc(g.place || '')}${g.linkInvest ? ' · valor vindo de Investimentos' : ''}</div>
        <div class="row wrap num" style="gap:18px;margin:10px 0 6px;font-size:13px"><span><span class="muted">Guardado</span><br><b>${money(g.saved, 0)}</b></span><span><span class="muted">Objetivo</span><br><b>${money(g.target, 0)}</b></span><span><span class="muted">Por mês</span><br><b>${money(g.monthly, 0)}</b></span></div>
        <div class="sub-s">${f.left === 0 ? 'Meta atingida.' : f.finishYM ? `No ritmo atual, conclui em ${ymLabel(f.finishYM).toLowerCase()}${g.deadline ? `. Prazo: ${ymLabel(g.deadline).toLowerCase()}` : ''}.` : 'Defina um aporte mensal para estimar a conclusão.'} ${f.left > 0 && !f.onTrack && f.need ? `Para cumprir o prazo, aumente para <b>${money(f.need, 0)}/mês</b>.` : ''}</div></div></div>
        <div class="row" style="margin-top:12px;justify-content:flex-end">${g.linkInvest ? '' : `<button class="btn btn-secondary btn-sm" data-act="goal-dep" data-id="${g.id}"><i class="ph ph-piggy-bank"></i> Guardar</button>`}<button class="btn btn-secondary btn-sm" data-act="edit-goal" data-id="${g.id}"><i class="ph ph-pencil-simple"></i> Editar</button></div></div>`; }).join('')}</div>` : `<div class="panel">${empty('Crie metas (reserva de emergência, viagem, carro…) e acompanhe o ritmo.', `<button class="btn btn-primary btn-sm" data-act="new-goal">Nova meta</button>`)}</div>`}`;
  },
  actions: { 'new-goal': () => goalForm(), 'edit-goal': el => goalForm(store.find('goals', el.dataset.id)), 'goal-dep': el => goalDeposit(store.find('goals', el.dataset.id)) },
};

// =============================================================================================== Relatórios
const REP = { cat: 'Todos', per: 'Ano' };
export const reports = {
  title: 'Relatórios',
  render(c) {
    const done = store.setting('doneInsights', {});
    const R = buildInsights({ txs: c.txs, plans: c.plans, goals: c.goals.map(g => g.linkInvest ? { ...g, saved: c.portfolio.total } : g), todayYM: c.todayYM, today: c.today });
    const open = R.items.filter(i => !done[i.id]);
    const saveY = sum(open, i => i.save), rateAfter = R.incAvg > 0 ? R.rateNow + saveY / 12 / R.incAvg : R.rateNow;
    const tabs = ['Todos', 'Hábitos', 'Economia', 'Dívidas', 'Reserva'];
    const items = R.items.filter(i => REP.cat === 'Todos' || i.cat === REP.cat);
    const impColor = { alto: DN, médio: 'var(--color-accent-300)', baixo: 'var(--color-neutral-400)' };
    const months = { Mês: 1, Trimestre: 3, Ano: 12 }[REP.per];
    const per = (n0) => { const o = {}; for (let i = n0; i < n0 + months; i++) { const ym = addMonthsYM(c.todayYM, -i); const sp = spentByCategory(c.txs, ym, c.today); for (const [k, v] of Object.entries(sp)) if (k !== APORTE_CAT) o[k] = (o[k] || 0) + v; } return o; };
    const cur = per(0), prv = per(months);
    const cats = Object.entries(cur).map(([k, v]) => ({ k, v, p: prv[k] || 0 })).sort((a, b) => b.v - a.v);
    const maxC = Math.max(...cats.map(x => x.v), 1);
    const enough = c.txs.length >= 10;
    return `${head('Relatórios', 'Pontos de atenção calculados dos seus lançamentos', `<div class="seg">${['Mês', 'Trimestre', 'Ano'].map(p => `<label class="seg-opt"><input type="radio" name="rper" value="${p}" ${REP.per === p ? 'checked' : ''}>${p}</label>`).join('')}</div>`)}
    ${!enough ? `<div class="panel">${empty('Ainda há poucos lançamentos para gerar análises. Lance ou importe pelo menos 2–3 meses de movimentações.')}</div>` : `
    <div class="grid g-kpi">${kpi({ label: 'Economia possível por ano', value: money(saveY, 0), sub: `${money(saveY / 12, 0)} por mês`, hint: 'estimativa a partir dos pontos em aberto' })}${kpi({ label: 'Taxa de poupança hoje', value: pctPlain(R.rateNow), sub: 'receita − despesas, meses fechados' })}${kpi({ label: 'Se tratar os pontos', value: pctPlain(rateAfter), sub: progress(rateAfter / 0.4) })}${kpi({ label: 'Pontos em aberto', value: String(open.length), sub: `${R.items.length - open.length} tratados` })}</div>
    <div class="grid g-2"><div class="panel"><div class="panel-h"><h3>Pontos de atenção</h3><div class="chips">${tabs.map(t => `<button class="chip ${REP.cat === t ? 'on' : ''}" data-act="rep-cat" data-v="${t}">${t}</button>`).join('')}</div></div>
      ${items.length ? items.map(r => `<div class="ins ${done[r.id] ? 'done' : ''}"><div class="li-ic">${icon(r.icon)}</div><div class="grow"><div class="row spread wrap"><span class="ins-t">${esc(r.title)}</span><span class="row" style="gap:8px">${tag('impacto ' + r.imp, 'tag-neutral')}</span></div><p style="margin:4px 0 8px;color:var(--color-neutral-300)">${esc(r.desc)}</p><div class="row wrap spread"><div style="font-size:13px"><b>Ação:</b> ${esc(r.action)}${r.save ? ` · <span class="up">potencial ≈ ${money(r.save, 0)}/ano</span>` : ''}</div><button class="btn btn-secondary btn-sm" data-act="rep-done" data-id="${esc(r.id)}"><i class="ph ${done[r.id] ? 'ph-arrow-counter-clockwise' : 'ph-check'}"></i> ${done[r.id] ? 'Reabrir' : 'Marcar como feito'}</button></div></div></div>`).join('') : empty(R.items.length ? 'Nenhum ponto nesta categoria.' : 'Nada a apontar. Continue lançando — novos pontos aparecem conforme seus dados.')}</div>
      <div class="stack"><div class="panel"><div class="panel-h"><h3>O que vai bem</h3></div>${R.good.length ? R.good.map(g => `<div class="row" style="align-items:flex-start;margin-bottom:10px"><i class="ph ph-check-circle up" style="margin-top:2px"></i><div><b>${esc(g.t)}</b> <span class="muted">${esc(g.d)}</span></div></div>`).join('') : '<span class="muted">Sem destaques positivos ainda.</span>'}</div>
      <div class="panel"><div class="panel-h"><h3>Despesas por categoria</h3><span class="sub">vs. período anterior</span></div>${cats.map(x => { const d = x.p > 0 ? x.v / x.p - 1 : null; return `<div style="margin-bottom:10px"><div class="row spread" style="font-size:13px;margin-bottom:4px"><span>${icon(catIcon(x.k))} ${esc(x.k)}</span><span class="num">${money(x.v, 0)} <span style="color:${d == null || Math.abs(d) < 0.01 ? 'var(--color-neutral-400)' : d > 0.1 ? DN : d < 0 ? UP : 'var(--color-neutral-400)'}">${d == null ? '' : Math.abs(d) < 0.01 ? '=' : `${d > 0 ? '▲' : '▼'} ${Math.round(Math.abs(d) * 100)}%`}</span></span></div>${progress(x.v / maxC)}</div>`; }).join('') || '<span class="muted">Sem despesas no período.</span>'}</div></div></div>`}`;
  },
  onChange(e) { if (e.target.name === 'rper') { REP.per = e.target.value; return true; } },
  actions: {
    'rep-cat': el => { REP.cat = el.dataset.v; return true; },
    'rep-done': el => { const d = { ...store.setting('doneInsights', {}) }; d[el.dataset.id] = !d[el.dataset.id]; store.setSetting('doneInsights', d); },
  },
};
