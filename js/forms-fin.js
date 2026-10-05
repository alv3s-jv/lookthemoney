// Formulários (modais) do módulo Finanças.
import { store } from './store.js';
import { getCtx, ensureRecurring } from './app.js';
import { openModal, field, options, formData, errBox, toast, confirmDialog, seg, money } from './ui.js';
import { EXPENSE_CATS, INCOME_CATS, APORTE_CAT, GOAL_ICONS, ACCOUNT_KINDS } from './meta.js';
import { uid, todayISO, parseNum, esc, ymOf, addMonthsYM, currentYM, nf, round2, ymLabel, addMonthsISO } from './util.js';
import { expandRecurrence, billsForMonth } from './calc.js';

const sign = k => (k === 'receita' ? 1 : -1);
const catsFor = kind => (kind === 'receita' ? Object.keys(INCOME_CATS) : kind === 'aporte' ? [APORTE_CAT] : Object.keys(EXPENSE_CATS));

/** Palpite de categoria pelo histórico (mesma descrição) ou por palavras-chave. */
const KEYWORDS = [
  [/ifood|rappi|uber ?eats|delivery/i, 'Delivery'], [/uber|99 ?(pop|taxi)?|posto|shell|ipiranga|combust/i, 'Transporte'],
  [/mercado|carrefour|p[aã]o de a[cç]|extra|assa[ií]|atacad|hortifruti|padaria|supermerc/i, 'Mercado'], [/netflix|spotify|disney|hbo|prime|icloud|youtube|assinatura/i, 'Assinaturas'],
  [/farm[aá]cia|drogaria|consulta|exame|hospital|academia|unimed/i, 'Saúde'], [/cinema|bar |restaurante|show|ingresso|steam|playstation/i, 'Lazer'],
  [/amazon|mercado ?livre|shopee|magalu|zara|renner|americanas/i, 'Compras'], [/aluguel|condom[ií]nio|iptu/i, 'Moradia'], [/energia|enel|neoenergia|cemig|[aá]gua|sabesp|internet|vivo|claro|tim /i, 'Contas da casa'],
  [/faculdade|curso|udemy|escola|mensalidade/i, 'Educação'], [/latam|gol |azul|booking|airbnb|hotel/i, 'Viagem'],
];
export function guessCategory(desc, kind = 'despesa') {
  if (!desc) return null; const d = desc.trim().toLowerCase();
  const prev = [...store.get('transactions')].reverse().find(t => t.kind === kind && t.description.replace(/\s*\(\d+\/\d+\)$/, '').toLowerCase() === d);
  if (prev) return prev.category;
  if (kind === 'despesa') for (const [re, c] of KEYWORDS) if (re.test(desc)) return c;
  if (kind === 'receita' && /sal[aá]rio|folha|pagamento/i.test(desc)) return 'Salário';
  return null;
}

function sourceOptions(cur, kind) {
  const c = getCtx();
  const acc = c.accounts.map(a => [`a:${a.id}`, a.name]);
  const cards = kind === 'despesa' ? c.cards.map(k => [`c:${k.id}`, `Cartão ${k.name}`]) : [];
  return options([...acc, ...cards], cur);
}

// ----------------------------------------------------------------------------- lançamento
export function txForm(tx = null, { kind = 'despesa', date = null } = {}) {
  const c = getCtx();
  if (!c.accounts.length) { toast('Cadastre uma conta em Configurações antes de lançar.', { kind: 'error' }); location.hash = '#/config'; return; }
  const edit = !!tx;
  const k0 = tx?.kind === 'fatura' ? 'despesa' : (tx?.kind || kind);
  const inSeries = edit && tx.seriesId && tx.recurrence !== 'none';
  const src0 = tx ? (tx.cardId ? `c:${tx.cardId}` : `a:${tx.accountId}`) : `a:${c.accounts[0].id}`;
  const body = `<form id="txf" class="stack" style="gap:12px" novalidate>
    <div class="row spread wrap">${seg('kind', [['despesa', 'Despesa'], ['receita', 'Receita'], ['aporte', 'Aporte']], k0)}</div>
    <div class="form-grid">
      ${field('Valor (R$)', `<input class="input num-in" name="amount" inputmode="decimal" placeholder="0,00" value="${tx ? nf(Math.abs(tx.amount)) : ''}" autocomplete="off" required>`)}
      ${field('Data', `<input class="input" type="date" name="date" value="${tx?.date || date || todayISO()}" max="2100-01-01" required>`)}
      ${field('Descrição', `<input class="input" name="description" maxlength="80" value="${esc((tx?.description || '').replace(/\s*\(\d+\/\d+\)$/, ''))}" placeholder="Ex.: Pão de Açúcar" list="descs" autocomplete="off" required>`, { cls: 'span2' })}
      ${field('Categoria', `<select class="input" name="category"></select>`)}
      ${field('Conta ou cartão', `<select class="input" name="source">${sourceOptions(src0, k0)}</select>`)}
      <div class="field span2" id="repWrap">${inSeries ? '' : `<label>Repetir</label><div class="row wrap">${seg('rep', [['none', 'Não repetir'], ['monthly', 'Todo mês'], ['installment', 'Parcelado']], 'none')}<input class="input sm" name="n" type="number" min="2" max="60" value="10" style="width:84px;display:none" aria-label="Número de parcelas"><span class="hint" id="repHint" style="margin:0"></span></div>`}</div>
      ${inSeries ? `<div class="field span2"><label>Aplicar alteração a</label>${seg('scope', [['one', 'Só este lançamento'], ['next', 'Este e os próximos']], 'one')}</div>` : ''}
    </div>
    <datalist id="descs">${[...new Set(store.get('transactions').slice(-400).map(t => t.description.replace(/\s*\(\d+\/\d+\)$/, '')))].slice(-60).map(d => `<option value="${esc(d)}">`).join('')}</datalist>
    <div id="txErr"></div></form>`;
  const m = openModal({
    title: edit ? 'Editar lançamento' : 'Novo lançamento', body,
    actions: `${edit ? '<button class="btn btn-danger btn-secondary" data-del style="margin-right:auto">Excluir</button>' : ''}<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-save>Salvar</button>`,
    onMount: api => {
      const f = api.q('#txf'), catSel = f.category; let catTouched = !!tx;
      const fillCats = (kind, cur) => { const list = catsFor(kind); catSel.innerHTML = (!tx && kind !== 'aporte' && !list.includes(cur) ? '<option value="" selected>Selecione a categoria…</option>' : '') + options(list, list.includes(cur) ? cur : (!tx && kind !== 'aporte' ? null : list[0])); catSel.disabled = kind === 'aporte'; };
      const kindNow = () => f.querySelector('[name=kind]:checked').value;
      fillCats(k0, tx?.category);
      const refreshSrc = () => { const cur = f.source.value; const kk = kindNow(); f.source.innerHTML = sourceOptions(cur, kk); if (![...f.source.options].some(o => o.value === cur)) f.source.selectedIndex = 0; };
      f.addEventListener('change', e => {
        if (e.target.name === 'kind') { fillCats(kindNow(), null); refreshSrc(); catTouched = false; }
        if (e.target.name === 'category') catTouched = true;
        if (e.target.name === 'rep') { f.n.style.display = e.target.value === 'installment' ? '' : 'none'; upd(); }
        if (e.target.name === 'n' || e.target.name === 'amount') upd();
      });
      f.description.addEventListener('change', () => { if (catTouched) return; const g = guessCategory(f.description.value, kindNow()); if (g && catsFor(kindNow()).includes(g)) catSel.value = g; });
      const upd = () => {
        const h = api.q('#repHint'); if (!h) return; const rep = f.querySelector('[name=rep]:checked')?.value, v = parseNum(f.amount.value);
        h.textContent = rep === 'installment' && v > 0 ? `${f.n.value}× de ${money(v / Math.max(1, +f.n.value))}` : rep === 'monthly' ? 'Gera lançamentos para os próximos 12 meses e renova sozinho.' : '';
      };
      f.addEventListener('submit', e => { e.preventDefault(); api.q('[data-save]').click(); });
      api.q('[data-del]')?.addEventListener('click', async () => { api.close(); await deleteTx(tx); });
      api.q('[data-save]').addEventListener('click', async () => {
        const d = formData(f), errs = [], v = parseNum(d.amount);
        const kind = d.kind;
        if (!(v > 0)) errs.push('Informe um valor maior que zero.');
        if (!d.description.trim()) errs.push('Informe uma descrição.');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) errs.push('Informe uma data válida.');
        if (d.kind !== 'aporte' && !d.category) errs.push('Escolha uma categoria.');
        const n = Math.round(+d.n || 0);
        if (d.rep === 'installment' && (n < 2 || n > 60)) errs.push('Parcelas: entre 2 e 60.');
        if (errs.length) { api.q('#txErr').innerHTML = errBox(errs); return; }
        const [t, id] = d.source.split(':');
        const base = { date: d.date, description: d.description.trim(), category: kind === 'aporte' ? APORTE_CAT : d.category, kind, amount: sign(kind) * round2(v), accountId: t === 'a' ? id : null, cardId: t === 'c' ? id : null, createdAt: new Date().toISOString() };
        if (edit) {
          const scope = d.scope || 'one';
          const patch = { ...base, createdAt: tx.createdAt };
          if (scope === 'next' && inSeries) {
            const rows = store.get('transactions').filter(r => r.seriesId === tx.seriesId && r.date >= tx.date);
            const day = +d.date.slice(8);
            await store.putMany('transactions', rows.map(r => ({ ...r, ...patch, id: r.id, date: tx.recurrence === 'monthly' ? addMonthsISO(`${r.date.slice(0, 7)}-${String(day).padStart(2, '0')}`, 0) : r.date, description: r.installmentTotal > 1 ? `${patch.description} (${r.installmentNo}/${r.installmentTotal})` : patch.description, amount: tx.recurrence === 'installment' ? r.amount : patch.amount, installmentNo: r.installmentNo, installmentTotal: r.installmentTotal })));
          } else await store.put('transactions', { ...tx, ...patch, description: tx.installmentTotal > 1 ? `${patch.description} (${tx.installmentNo}/${tx.installmentTotal})` : patch.description, amount: tx.installmentTotal > 1 ? tx.amount : patch.amount });
          toast('Lançamento atualizado', { kind: 'ok' });
        } else {
          const rep = d.rep || 'none';
          const seriesId = rep === 'none' ? undefined : uid();
          const rows = expandRecurrence({ ...base, recurrence: rep, seriesId }, rep, rep === 'installment' ? n : rep === 'monthly' ? 1 : 1, Array.from({ length: Math.max(n, 1) }, () => uid()));
          await store.putMany('transactions', rows);
          if (rep === 'monthly') await ensureRecurring().then(() => store.emit());
          toast(rep === 'installment' ? `${n} parcelas lançadas` : 'Lançamento salvo', { kind: 'ok' });
        }
        api.close();
      });
    },
  });
  return m;
}

export async function deleteTx(tx) {
  const inSeries = tx.seriesId && tx.recurrence !== 'none';
  let all = false;
  if (inSeries) {
    all = await new Promise(res => {
      let r = null;
      openModal({
        title: 'Excluir lançamento recorrente', body: `<p style="margin:0">Este lançamento faz parte de uma série (${tx.recurrence === 'installment' ? 'parcelamento' : 'recorrência mensal'}).</p>`,
        actions: '<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-secondary" data-one>Só este</button><button class="btn btn-primary btn-danger" data-next>Este e os próximos</button>',
        onMount: a => { a.q('[data-one]').onclick = () => { r = false; a.close(); }; a.q('[data-next]').onclick = () => { r = true; a.close(); }; },
        onClose: () => res(r),
      });
    });
    if (all === null) return;
  } else if (!(await confirmDialog({ title: 'Excluir lançamento', message: `Excluir “${esc(tx.description)}” (${money(Math.abs(tx.amount))})?` }))) return;
  if (all) {
    const ids = store.get('transactions').filter(r => r.seriesId === tx.seriesId && r.date >= tx.date).map(r => r.id);
    if (tx.recurrence === 'monthly') { // encerra a série para não ser recriada
      const prev = store.get('transactions').filter(r => r.seriesId === tx.seriesId && r.date < tx.date).sort((a, b) => b.date.localeCompare(a.date))[0];
      if (prev) await store.put('transactions', { ...prev, recurrenceEnded: true }, { silent: true });
    }
    await store.delMany('transactions', ids);
  } else await store.del('transactions', tx.id);
  // se veio de uma conta paga, desfaz o pagamento
  if (tx.billKey) await store.del('billPayments', tx.billKey);
  toast('Lançamento excluído', { kind: 'ok' });
}

// ----------------------------------------------------------------------------- conta a pagar
export function billForm(bill = null) {
  const c = getCtx(); const edit = !!bill;
  const body = `<form id="bf" class="stack" style="gap:12px" novalidate><div class="form-grid">
    ${field('Nome', `<input class="input" name="name" value="${esc(bill?.name || '')}" placeholder="Ex.: Energia" required>`, { cls: 'span2' })}
    ${field('Valor (R$)', `<input class="input num-in" name="amount" inputmode="decimal" value="${bill ? nf(bill.amount) : ''}" placeholder="0,00" required>`)}
    ${field('Dia do vencimento', `<input class="input" type="number" min="1" max="31" name="dueDay" value="${bill?.dueDay || ''}" required>`)}
    ${field('Categoria', `<select class="input" name="category">${options(Object.keys(EXPENSE_CATS), bill?.category || 'Contas da casa')}</select>`)}
    ${field('Pagar com (padrão)', `<select class="input" name="accountId">${options(c.accounts.map(a => [a.id, a.name]), bill?.accountId)}</select>`)}
    ${field('Observação', `<input class="input" name="meta" value="${esc(bill?.meta || '')}" placeholder="boleto, débito automático…">`, { cls: 'span2' })}
    <div class="field span2"><label>Frequência</label><div class="row wrap">${seg('recurrence', [['monthly', 'Todo mês'], ['installment', 'Parcelas'], ['once', 'Uma vez']], bill?.recurrence || 'monthly')}<input class="input sm" type="number" name="installments" min="2" max="60" value="${bill?.installments || 6}" style="width:84px;display:${bill?.recurrence === 'installment' ? '' : 'none'}" aria-label="Número de parcelas"></div></div>
    ${field('A partir de', `<input class="input" type="month" name="startYm" value="${bill?.startYm || currentYM()}">`)}
  </div><div id="bErr"></div></form>`;
  openModal({
    title: edit ? 'Editar conta' : 'Nova conta a pagar', body,
    actions: `${edit ? '<button class="btn btn-secondary btn-danger" data-del style="margin-right:auto">Excluir</button>' : ''}<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-save>Salvar</button>`,
    onMount: api => {
      const f = api.q('#bf');
      f.addEventListener('change', e => { if (e.target.name === 'recurrence') f.installments.style.display = e.target.value === 'installment' ? '' : 'none'; });
      api.q('[data-del]')?.addEventListener('click', async () => { api.close(); if (await confirmDialog({ title: 'Excluir conta', message: `Excluir “${esc(bill.name)}” e seu histórico de pagamentos? Os lançamentos já gerados permanecem.` })) { await store.delMany('billPayments', store.get('billPayments').filter(p => p.id.startsWith(bill.id + '|')).map(p => p.id)); await store.del('bills', bill.id); } });
      api.q('[data-save]').addEventListener('click', async () => {
        const d = formData(f), errs = [], v = parseNum(d.amount);
        if (!d.name.trim()) errs.push('Informe o nome.'); if (!(v > 0)) errs.push('Informe o valor.');
        if (!(+d.dueDay >= 1 && +d.dueDay <= 31)) errs.push('Dia do vencimento entre 1 e 31.');
        if (errs.length) { api.q('#bErr').innerHTML = errBox(errs); return; }
        await store.put('bills', { ...(bill || {}), id: bill?.id || uid(), name: d.name.trim(), amount: round2(v), dueDay: +d.dueDay, category: d.category, accountId: d.accountId, meta: d.meta.trim(), recurrence: d.recurrence, installments: d.recurrence === 'installment' ? +d.installments : null, startYm: d.startYm || currentYM() });
        toast('Conta salva', { kind: 'ok' }); api.close();
      });
    },
  });
}

export function payBill(occ) {
  const c = getCtx();
  const bill = occ.kind === 'bill' ? store.find('bills', occ.id) : null, card = occ.kind === 'card' ? store.find('cards', occ.id) : null;
  const acc0 = bill?.accountId || card?.accountId || c.accounts[0]?.id;
  openModal({
    title: `Pagar ${occ.name}`,
    body: `<form id="pf" class="stack" style="gap:12px"><div class="form-grid">
      ${field('Valor pago (R$)', `<input class="input num-in" name="amount" value="${nf(occ.amount)}" inputmode="decimal">`)}
      ${field('Data do pagamento', `<input class="input" type="date" name="date" value="${todayISO()}">`)}
      ${field('Sair da conta', `<select class="input" name="accountId">${options(c.accounts.map(a => [a.id, a.name]), acc0)}</select>`, { cls: 'span2' })}</div>
      <div class="hint">${occ.kind === 'card' ? 'O pagamento da fatura sai do saldo da conta, mas não conta como despesa (as compras já foram lançadas).' : 'Gera uma despesa em Receitas e despesas na categoria da conta.'}</div></form>`,
    actions: '<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>Confirmar pagamento</button>',
    onMount: api => api.q('[data-ok]').addEventListener('click', async () => {
      const d = formData(api.q('#pf')), v = parseNum(d.amount);
      if (!(v > 0)) { toast('Informe o valor pago.', { kind: 'error' }); return; }
      const txId = uid();
      await store.put('transactions', { id: txId, date: d.date, description: occ.name, category: occ.kind === 'card' ? 'Fatura de cartão' : bill?.category || 'Outros', kind: occ.kind === 'card' ? 'fatura' : 'despesa', amount: -round2(v), accountId: d.accountId, cardId: null, recurrence: 'none', billKey: occ.key, createdAt: new Date().toISOString() });
      await store.put('billPayments', { id: occ.key, paidAt: d.date, amount: round2(v), accountId: d.accountId, txId });
      toast('Pagamento registrado', { kind: 'ok' }); api.close();
    }),
  });
}

export async function unpayBill(occ) {
  const p = store.find('billPayments', occ.key);
  if (p?.txId) await store.del('transactions', p.txId);
  else await store.delMany('transactions', store.get('transactions').filter(t => t.billKey === occ.key).map(t => t.id));
  await store.del('billPayments', occ.key);
  toast('Pagamento desfeito', { kind: 'ok' });
}

// ----------------------------------------------------------------------------- cartão / conta
export function cardForm(card = null) {
  const c = getCtx(); const edit = !!card;
  openModal({
    title: edit ? 'Editar cartão' : 'Adicionar cartão',
    body: `<form id="cf" class="stack" style="gap:12px"><div class="form-grid">
      ${field('Nome', `<input class="input" name="name" value="${esc(card?.name || '')}" placeholder="Ex.: Nubank" required>`)}
      ${field('Final (4 dígitos)', `<input class="input" name="last4" maxlength="4" inputmode="numeric" value="${esc(card?.last4 || '')}">`)}
      ${field('Limite (R$)', `<input class="input num-in" name="creditLimit" inputmode="decimal" value="${card ? nf(card.creditLimit) : ''}">`)}
      ${field('Conta que paga a fatura', `<select class="input" name="accountId">${options(c.accounts.map(a => [a.id, a.name]), card?.accountId)}</select>`)}
      ${field('Dia de fechamento', `<input class="input" type="number" min="1" max="31" name="closeDay" value="${card?.closeDay || ''}">`)}
      ${field('Dia de vencimento', `<input class="input" type="number" min="1" max="31" name="dueDay" value="${card?.dueDay || ''}">`)}</div><div id="cErr"></div></form>`,
    actions: `${edit ? '<button class="btn btn-secondary btn-danger" data-del style="margin-right:auto">Excluir</button>' : ''}<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-save>Salvar</button>`,
    onMount: api => {
      api.q('[data-del]')?.addEventListener('click', async () => { api.close(); if (await confirmDialog({ title: 'Excluir cartão', message: 'Os lançamentos feitos neste cartão serão mantidos, mas ficarão sem cartão.' })) { await store.putMany('transactions', store.get('transactions').filter(t => t.cardId === card.id).map(t => ({ ...t, cardId: null, accountId: card.accountId }))); await store.del('cards', card.id); } });
      api.q('[data-save]').addEventListener('click', async () => {
        const d = formData(api.q('#cf')), errs = [];
        if (!d.name.trim()) errs.push('Informe o nome.');
        if (!(+d.closeDay >= 1 && +d.closeDay <= 31) || !(+d.dueDay >= 1 && +d.dueDay <= 31)) errs.push('Fechamento e vencimento entre 1 e 31.');
        if (!(parseNum(d.creditLimit) > 0)) errs.push('Informe o limite.');
        if (errs.length) { api.q('#cErr').innerHTML = errBox(errs); return; }
        await store.put('cards', { ...(card || {}), id: card?.id || uid(), name: d.name.trim(), last4: d.last4, creditLimit: parseNum(d.creditLimit), closeDay: +d.closeDay, dueDay: +d.dueDay, accountId: d.accountId });
        toast('Cartão salvo', { kind: 'ok' }); api.close();
      });
    },
  });
}

export function accountForm(acc = null) {
  const edit = !!acc;
  openModal({
    title: edit ? 'Editar conta' : 'Nova conta',
    body: `<form id="af" class="stack" style="gap:12px"><div class="form-grid">
      ${field('Nome', `<input class="input" name="name" value="${esc(acc?.name || '')}" placeholder="Ex.: Nubank" required>`)}
      ${field('Tipo', `<select class="input" name="kind">${options(Object.entries(ACCOUNT_KINDS), acc?.kind || 'checking')}</select>`)}
      ${field('Saldo inicial (R$)', `<input class="input num-in" name="initialBalance" inputmode="decimal" value="${acc ? nf(acc.initialBalance) : '0,00'}">`, { hint: 'Saldo da conta antes do primeiro lançamento registrado aqui.', cls: 'span2' })}</div><div id="aErr"></div></form>`,
    actions: `${edit ? '<button class="btn btn-secondary btn-danger" data-del style="margin-right:auto">Excluir</button>' : ''}<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-save>Salvar</button>`,
    onMount: api => {
      api.q('[data-del]')?.addEventListener('click', async () => { const used = store.get('transactions').some(t => t.accountId === acc.id) || store.get('cards').some(k => k.accountId === acc.id); if (used) { toast('Esta conta tem lançamentos ou cartões vinculados. Mova-os antes de excluir.', { kind: 'error', ms: 5000 }); return; } api.close(); if (await confirmDialog({ title: 'Excluir conta', message: `Excluir “${esc(acc.name)}”?` })) await store.del('accounts', acc.id); });
      api.q('[data-save]').addEventListener('click', async () => {
        const d = formData(api.q('#af'));
        if (!d.name.trim()) { api.q('#aErr').innerHTML = errBox(['Informe o nome.']); return; }
        await store.put('accounts', { ...(acc || {}), id: acc?.id || uid(), name: d.name.trim(), kind: d.kind, initialBalance: parseNum(d.initialBalance) || 0 });
        toast('Conta salva', { kind: 'ok' }); api.close();
      });
    },
  });
}

// ----------------------------------------------------------------------------- metas
export function goalForm(g = null) {
  const edit = !!g;
  openModal({
    title: edit ? 'Editar meta' : 'Nova meta',
    body: `<form id="gf" class="stack" style="gap:12px"><div class="form-grid">
      ${field('Nome', `<input class="input" name="name" value="${esc(g?.name || '')}" placeholder="Ex.: Viagem ao Japão" required>`, { cls: 'span2' })}
      ${field('Objetivo (R$)', `<input class="input num-in" name="target" inputmode="decimal" value="${g ? nf(g.target) : ''}">`)}
      ${field('Já guardado (R$)', `<input class="input num-in" name="saved" inputmode="decimal" value="${g ? nf(g.saved) : '0,00'}">`)}
      ${field('Aporte mensal (R$)', `<input class="input num-in" name="monthly" inputmode="decimal" value="${g ? nf(g.monthly) : ''}">`)}
      ${field('Prazo', `<input class="input" type="month" name="deadline" value="${g?.deadline || ''}">`)}
      ${field('Onde está guardado', `<input class="input" name="place" value="${esc(g?.place || '')}" placeholder="Ex.: CDB 110% CDI · liquidez diária">`, { cls: 'span2' })}
      <div class="field span2"><label>Ícone</label><div class="chips" id="icons">${GOAL_ICONS.map(i => `<label class="chip ${i === (g?.icon || GOAL_ICONS[0]) ? 'on' : ''}" style="padding:6px 10px"><input type="radio" name="icon" value="${i}" ${i === (g?.icon || GOAL_ICONS[0]) ? 'checked' : ''} style="position:absolute;opacity:0"><i class="${i}" style="font-size:18px"></i></label>`).join('')}</div></div>
      <label class="radio span2"><input type="checkbox" name="linkInvest" ${g?.linkInvest ? 'checked' : ''}><span class="dot"></span> Usar o patrimônio de Investimentos como valor guardado</label></div><div id="gErr"></div></form>`,
    actions: `${edit ? '<button class="btn btn-secondary btn-danger" data-del style="margin-right:auto">Excluir</button>' : ''}<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-save>Salvar</button>`,
    onMount: api => {
      api.q('#icons').addEventListener('change', () => api.qa('#icons .chip').forEach(ch => ch.classList.toggle('on', ch.querySelector('input').checked)));
      api.q('[data-del]')?.addEventListener('click', async () => { api.close(); if (await confirmDialog({ title: 'Excluir meta', message: `Excluir “${esc(g.name)}”?` })) await store.del('goals', g.id); });
      api.q('[data-save]').addEventListener('click', async () => {
        const d = formData(api.q('#gf')), errs = [];
        if (!d.name.trim()) errs.push('Informe o nome.'); if (!(parseNum(d.target) > 0)) errs.push('Informe o objetivo.');
        if (errs.length) { api.q('#gErr').innerHTML = errBox(errs); return; }
        await store.put('goals', { ...(g || {}), id: g?.id || uid(), name: d.name.trim(), icon: d.icon, place: d.place.trim(), target: parseNum(d.target), saved: parseNum(d.saved) || 0, monthly: parseNum(d.monthly) || 0, deadline: d.deadline || null, linkInvest: !!d.linkInvest });
        toast('Meta salva', { kind: 'ok' }); api.close();
      });
    },
  });
}

export function goalDeposit(g) {
  openModal({
    title: `Guardar em “${g.name}”`,
    body: `<form id="df" class="stack" style="gap:12px">${field('Valor (R$)', `<input class="input num-in" name="v" inputmode="decimal" placeholder="0,00" autofocus>`, { hint: 'Use valor negativo para retirar.' })}</form>`,
    actions: '<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>Confirmar</button>',
    onMount: api => { const go = async () => { const v = parseNum(api.q('[name=v]').value); if (!v) return; await store.put('goals', { ...g, saved: Math.max(0, round2(g.saved + v)) }); toast('Meta atualizada', { kind: 'ok' }); api.close(); }; api.q('[data-ok]').onclick = go; api.q('#df').onsubmit = e => { e.preventDefault(); go(); }; },
  });
}
