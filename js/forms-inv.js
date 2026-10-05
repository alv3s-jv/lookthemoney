// Formulários (modais) do módulo Investimentos.
import { store } from './store.js';
import { getCtx, afterInvestChange } from './app.js';
import { openModal, field, options, formData, errBox, toast, confirmDialog, seg, money, num, pct, qtyFmt } from './ui.js';
import { CLASSES, CLASS_ORDER, position, previewTx, validateTx, netDividend } from './calc.js';
import { APORTE_CAT, INDEXERS } from './meta.js';
import { CRYPTO_IDS } from './quotes.js';
import { uid, todayISO, parseNum, esc, nf, round2, fmtDate } from './util.js';

const KNOWN_ETF = ['BOVA11', 'IVVB11', 'SMAL11', 'HASH11', 'GOLD11', 'DIVO11', 'BOVV11', 'XINA11', 'NASD11', 'SPXI11', 'B5P211', 'IMAB11', 'FIXA11', 'ECOO11', 'MATB11'];
export function guessClass(t) {
  t = (t || '').toUpperCase().trim();
  if (CRYPTO_IDS[t]) return 'CRIPTO';
  if (KNOWN_ETF.includes(t)) return 'ETF';
  if (/^[A-Z]{4}11$/.test(t)) return 'FII';
  if (/^[A-Z]{4}3[345]$/.test(t)) return 'EUA_BDR';
  if (/^[A-Z]{4}[3-6]$/.test(t)) return 'ACAO_BR';
  return null;
}

const assetTxs = id => store.get('investTx').filter(t => t.assetId === id);
const adj = (a, txs) => (a?.currency === 'USD' ? txs.map(t => ({ ...t, price: t.price * (+t.fx || 1) })) : txs);

// ----------------------------------------------------------------------------- compra / venda (com prévia do novo PM)
export function buyForm({ ticker = '', type = 'COMPRA', tx = null } = {}) {
  const c = getCtx(); const edit = !!tx;
  const assetOf = tx ? store.find('assets', tx.assetId) : null;
  if (assetOf) { ticker = assetOf.ticker; type = tx.type; }
  const lastAcc = store.setting('lastInvestAccount', c.accounts[0]?.id || '');
  const linked = tx ? store.get('transactions').find(t => t.investTxId === tx.id) : null;
  const accDefault = linked ? linked.accountId : (edit ? '' : lastAcc);
  const fxNow = c.quotes.fx?.rate || '';
  const body = `<form id="bf" class="stack" style="gap:12px" novalidate>
    <div class="row spread wrap">${seg('type', [['COMPRA', 'Compra'], ['VENDA', 'Venda']], type)}<span class="hint" id="posHint" style="margin:0"></span></div>
    <div class="form-grid">
      ${field('Ativo', `<input class="input" name="ticker" list="tickers" value="${esc(ticker)}" placeholder="Ticker (ex.: WEGE3) ou nome do título" autocomplete="off" ${edit ? 'readonly' : ''} required style="text-transform:uppercase">`, { cls: 'span2' })}
      <datalist id="tickers">${c.assets.map(a => `<option value="${esc(a.ticker)}">${esc(a.name)}</option>`).join('')}</datalist>
      <div id="newAsset" class="span2 form-grid" style="display:none;gap:12px;padding:10px;border-radius:8px;background:color-mix(in srgb,var(--color-text) 4%,transparent)">
        ${field('Classe', `<select class="input" name="assetClass">${options(Object.entries(CLASSES), 'ACAO_BR')}</select>`)}
        ${field('Nome (opcional)', `<input class="input" name="name" placeholder="Ex.: WEG ON">`)}
        <div id="fiBox" class="span2 form-grid" style="display:none;gap:12px">
          ${field('Indexador', `<select class="input" name="indexer">${options(Object.entries(INDEXERS), 'CDI')}</select>`)}
          ${field('Taxa', `<input class="input num-in" name="rate" inputmode="decimal" placeholder="110" id="rate">`, { hint: '<span id="rateHint">% do CDI</span>' })}
          ${field('Emissor', `<input class="input" name="issuer" placeholder="Ex.: Banco Inter">`)}
          ${field('Vencimento', `<input class="input" type="date" name="maturity">`)}
        </div>
      </div>
      <div class="field span2" id="byWrap" style="display:none"><label>Informar por</label>${seg('by', [['qty', 'Quantidade'], ['value', 'Valor gasto']], 'qty')}</div>
      ${field('Data', `<input class="input" type="date" name="date" value="${tx?.date || todayISO()}" max="${todayISO()}">`)}
      ${field('<span id="qtyL">Quantidade</span>', `<input class="input num-in" name="quantity" inputmode="decimal" value="${tx ? qtyFmt(tx.quantity) : ''}" placeholder="0">`)}
      ${field('<span id="priceL">Preço unitário</span>', `<input class="input num-in" name="price" inputmode="decimal" value="${tx ? nf(tx.price, 4).replace(/0{1,2}$/, '') : ''}" placeholder="0,00">`)}
      ${field('Taxas / corretagem (R$)', `<input class="input num-in" name="fees" inputmode="decimal" value="${tx ? nf(tx.fees || 0) : '0,00'}">`)}
      <div class="field" id="curWrap"><label>Moeda</label><select class="input" name="currency"><option value="BRL">R$ (BRL)</option><option value="USD">US$ (USD)</option></select></div>
      <div class="field" id="fxWrap" style="display:none"><label>Câmbio (R$ por US$)</label><input class="input num-in" name="fx" inputmode="decimal" value="${tx?.fx ? nf(tx.fx, 4) : fxNow ? nf(fxNow, 4) : ''}"></div>
      ${field('Debitar da conta', `<select class="input" name="accountId"><option value="">— não lançar nas Finanças —</option>${options(c.accounts.map(a => [a.id, a.name]), accDefault)}</select>`, { hint: 'A compra entra como saída na conta e conta como aporte do mês no orçamento.', cls: 'span2' })}
    </div>
    <div class="preview" id="pv" style="display:none"></div>
    <div id="bErr"></div></form>`;
  openModal({
    title: edit ? 'Editar operação' : 'Registrar operação', body, wide: true,
    actions: `${edit ? '<button class="btn btn-secondary btn-danger" data-del style="margin-right:auto">Excluir</button>' : ''}<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-save>Salvar</button>`,
    onMount: api => {
      const f = api.q('#bf'); let cls = assetOf?.assetClass || null, asset = assetOf;
      const typeNow = () => f.querySelector('[name=type]:checked').value;
      const cleanTicker = () => f.ticker.value.trim();
      const isRF = () => cls === 'RENDA_FIXA';
      const rfLabels = () => {
        api.q('#qtyL').textContent = isRF() ? (typeNow() === 'VENDA' ? 'Valor resgatado do principal (R$)' : 'Valor aplicado (R$)') : 'Quantidade';
        f.price.closest('.field').style.display = isRF() ? 'none' : '';
        api.q('#curWrap').style.display = isRF() ? 'none' : '';
        api.q('#byWrap').style.display = cls === 'CRIPTO' ? '' : 'none';
        api.q('#priceL').textContent = f.querySelector('[name=by]:checked')?.value === 'value' && cls === 'CRIPTO' ? 'Preço da moeda (R$)' : 'Preço unitário';
        api.q('#fiBox').style.display = isRF() && !asset ? '' : 'none';
        api.q('#fxWrap').style.display = f.currency.value === 'USD' && !isRF() ? '' : 'none';
      };
      const resolve = () => {
        const t = cleanTicker().toUpperCase(); asset = edit ? assetOf : c.assets.find(a => a.ticker.toUpperCase() === t) || null;
        api.q('#newAsset').style.display = !asset && t ? '' : 'none';
        if (asset) { cls = asset.assetClass; f.currency.value = asset.currency || 'BRL'; f.assetClass.value = cls; }
        else if (t) { const g = guessClass(t); if (g && !f.assetClass.dataset.touched) f.assetClass.value = g; cls = f.assetClass.value; }
        const pos = asset ? position(adj(asset, assetTxs(asset.id).filter(x => x.id !== tx?.id))) : null;
        api.q('#posHint').textContent = pos ? `Posição atual: ${qtyFmt(pos.qty)}${isRF() ? ' (R$ aplicados)' : ''} · PM ${isRF() ? '—' : money(pos.pm)}` : '';
        rfLabels(); preview();
      };
      const parse = () => {
        const by = f.querySelector('[name=by]:checked')?.value;
        let q = parseNum(f.quantity.value), p = isRF() ? 1 : parseNum(f.price.value);
        if (cls === 'CRIPTO' && by === 'value' && p > 0) q = q / p; // valor gasto ÷ preço
        return { quantity: q, price: p, fees: parseNum(f.fees.value) || 0, fx: f.currency.value === 'USD' && !isRF() ? parseNum(f.fx.value) || 1 : undefined };
      };
      const preview = () => {
        const pv = api.q('#pv'), v = parse();
        if (!(v.quantity > 0) || !(v.price > 0)) { pv.style.display = 'none'; return; }
        const a = asset || { currency: f.currency.value };
        const nt = { id: tx?.id || '__new__', type: typeNow(), date: f.date.value || todayISO(), ...v };
        const base = adj(a, asset ? assetTxs(asset.id).filter(x => x.id !== tx?.id) : []);
        const { before, after } = previewTx(base, adj(a, [nt])[0]);
        const cost = v.quantity * v.price * (v.fx || 1) + (nt.type === 'COMPRA' ? v.fees : -v.fees);
        pv.style.display = '';
        pv.innerHTML = `<div style="font-size:11px;letter-spacing:.07em;text-transform:uppercase;color:var(--color-neutral-400);margin-bottom:6px">Depois desta ${nt.type === 'COMPRA' ? 'compra' : 'venda'}</div><div class="pv num">
          <span>Quantidade</span><b>${qtyFmt(before.qty)} → ${qtyFmt(after.qty)}</b>
          ${isRF() ? '' : `<span>Preço médio</span><b>${before.qty ? money(before.pm) : '—'} → ${after.qty ? money(after.pm) : '—'}</b>`}
          <span>${nt.type === 'COMPRA' ? 'Custo desta compra' : 'Valor da venda'}</span><b>${money(cost)}</b>
          <span>Custo total da posição</span><b>${money(before.cost)} → ${money(after.cost)}</b>
          ${nt.type === 'VENDA' ? `<span>Resultado realizado</span><b>${money(after.realized - before.realized)}</b>` : ''}</div>`;
      };
      f.assetClass.addEventListener('change', () => { f.assetClass.dataset.touched = '1'; cls = f.assetClass.value; rfLabels(); preview(); });
      f.indexer?.addEventListener('change', () => { api.q('#rateHint').textContent = { CDI: '% do CDI (ex.: 110)', PRE: '% ao ano (ex.: 12,5)', IPCA: '% ao ano acima do IPCA (ex.: 6)' }[f.indexer.value]; });
      f.addEventListener('input', e => { if (e.target.name === 'ticker') resolve(); else preview(); });
      f.addEventListener('change', e => { if (['type', 'currency', 'by', 'date'].includes(e.target.name)) { rfLabels(); preview(); } });
      if (tx) { const a = assetOf; f.currency.value = a.currency || 'BRL'; }
      resolve();
      api.q('[data-del]')?.addEventListener('click', async () => { api.close(); await deleteInvestTx(tx); });
      f.addEventListener('submit', e => { e.preventDefault(); api.q('[data-save]').click(); });
      api.q('[data-save]').addEventListener('click', async () => {
        const d = formData(f), errs = [], t = cleanTicker().toUpperCase(), v = parse(), type = typeNow();
        if (!t) errs.push('Informe o ativo.');
        if (!asset && !cls) errs.push('Escolha a classe do ativo.');
        if (isRF() && !asset && !(parseNum(d.rate) > 0)) errs.push('Informe a taxa do título.');
        if (d.currency === 'USD' && !isRF() && !(parseNum(d.fx) > 0)) errs.push('Informe o câmbio.');
        const cand = { id: tx?.id || '__new__', type, date: d.date, ...v };
        const a = asset || { currency: d.currency };
        errs.push(...validateTx(adj(a, asset ? assetTxs(asset.id).filter(x => x.id !== tx?.id) : []), adj(a, [cand])[0], todayISO()).map(e => (isRF() ? e.replace('Quantidade', 'Valor').replace('Preço deve ser maior que zero.', '') : e)).filter(Boolean));
        if (errs.length) { api.q('#bErr').innerHTML = errBox([...new Set(errs)]); return; }
        let as = asset;
        if (!as) {
          as = { id: uid(), ticker: t, name: d.name.trim() || t, assetClass: cls, currency: isRF() ? 'BRL' : d.currency, priceSource: 'auto' };
          if (isRF()) as.fixedIncome = { indexer: d.indexer, rate: parseNum(d.rate), issuer: d.issuer.trim(), maturity: d.maturity || null };
          await store.put('assets', as);
        }
        const row = { id: tx?.id || uid(), assetId: as.id, type, date: d.date, quantity: v.quantity, price: v.price, fees: v.fees, fx: v.fx, accountId: d.accountId || null, createdAt: tx?.createdAt || new Date().toISOString() };
        await store.put('investTx', row);
        // integração com Finanças
        const total = round2(v.quantity * v.price * (v.fx || 1) + (type === 'COMPRA' ? v.fees : -v.fees));
        if (d.accountId) {
          store.setSetting('lastInvestAccount', d.accountId);
          await store.put('transactions', { id: linked?.id || uid(), date: d.date, description: `${type === 'COMPRA' ? 'Aporte' : 'Resgate'} · ${as.ticker}`, category: APORTE_CAT, kind: type === 'COMPRA' ? 'aporte' : 'resgate', amount: type === 'COMPRA' ? -total : total, accountId: d.accountId, cardId: null, recurrence: 'none', investTxId: row.id, createdAt: linked?.createdAt || new Date().toISOString() });
        } else if (linked) await store.del('transactions', linked.id);
        toast(edit ? 'Operação atualizada' : type === 'COMPRA' ? 'Compra registrada' : 'Venda registrada', { kind: 'ok' });
        api.close(); afterInvestChange();
      });
    },
  });
}

export async function deleteInvestTx(tx) {
  const a = store.find('assets', tx.assetId);
  // não permitir que excluir uma compra deixe vendas posteriores sem lastro
  const rest = store.get('investTx').filter(t => t.assetId === tx.assetId && t.id !== tx.id);
  const ok = (() => { let q = 0; for (const t of [...rest].sort((x, y) => x.date.localeCompare(y.date) || (x.type === 'COMPRA' ? -1 : 1))) { q += t.type === 'COMPRA' ? +t.quantity : -t.quantity; if (q < -1e-9) return false; } return true; })();
  if (!ok) { toast('Não é possível excluir: há vendas posteriores que dependem desta compra.', { kind: 'error', ms: 5000 }); return; }
  if (!(await confirmDialog({ title: 'Excluir operação', message: `Excluir ${tx.type === 'COMPRA' ? 'a compra' : 'a venda'} de ${qtyFmt(tx.quantity)} ${esc(a?.ticker || '')} em ${fmtDate(tx.date)}?` }))) return;
  const linked = store.get('transactions').filter(t => t.investTxId === tx.id).map(t => t.id);
  if (linked.length) await store.delMany('transactions', linked);
  await store.del('investTx', tx.id);
  toast('Operação excluída', { kind: 'ok' });
  afterInvestChange();
}

// ----------------------------------------------------------------------------- proventos
export function dividendForm(div = null, assetId = null) {
  const c = getCtx(); const edit = !!div;
  const list = c.assets.filter(a => a.assetClass !== 'RENDA_FIXA');
  if (!list.length) { toast('Registre uma compra antes de lançar proventos.', { kind: 'error' }); return; }
  const a0 = div?.assetId || assetId || list[0].id;
  const body = `<form id="df" class="stack" style="gap:12px" novalidate><div class="form-grid">
    ${field('Ativo', `<select class="input" name="assetId">${options(list.map(a => [a.id, `${a.ticker} · ${a.name}`]), a0)}</select>`, { cls: 'span2' })}
    ${field('Tipo', `<select class="input" name="type">${options([['DIVIDENDO', 'Dividendo'], ['JCP', 'JCP (IR 15%)'], ['RENDIMENTO', 'Rendimento (FII)']], div?.type || 'DIVIDENDO')}</select>`)}
    ${field('Data de pagamento', `<input class="input" type="date" name="payDate" value="${div?.payDate || todayISO()}">`)}
    ${field('Valor por cota (R$)', `<input class="input num-in" name="perShare" inputmode="decimal" value="${div ? nf(div.perShare, 4) : ''}" placeholder="0,00">`)}
    ${field('Cotas na data', `<input class="input num-in" name="quantity" inputmode="decimal" value="${div ? qtyFmt(div.quantity) : ''}">`)}
  </div><div class="preview" id="dpv"></div><div id="dErr"></div></form>`;
  openModal({
    title: edit ? 'Editar provento' : 'Lançar provento', body,
    actions: `${edit ? '<button class="btn btn-secondary btn-danger" data-del style="margin-right:auto">Excluir</button>' : ''}<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-save>Salvar</button>`,
    onMount: api => {
      const f = api.q('#df'); let qtyTouched = edit;
      const asset = () => store.find('assets', f.assetId.value);
      const autoQty = () => { if (qtyTouched) return; const a = asset(); const p = position(adj(a, assetTxs(a.id)), f.payDate.value || todayISO()); f.quantity.value = p.qty ? qtyFmt(p.qty) : ''; };
      const calc = () => { const ps = parseNum(f.perShare.value), q = parseNum(f.quantity.value), gross = ps * q; const net = netDividend(f.type.value, gross); api.q('#dpv').innerHTML = gross > 0 ? `<div class="pv num"><span>Bruto</span><b>${money(gross)}</b>${f.type.value === 'JCP' ? `<span>IR retido (15%)</span><b>−${money(gross - net)}</b>` : ''}<span>Líquido recebido</span><b>${money(net)}</b></div>` : '<span class="muted">Informe o valor por cota para ver o total.</span>'; };
      f.addEventListener('input', e => { if (e.target.name === 'quantity') qtyTouched = true; calc(); });
      f.addEventListener('change', e => { if (e.target.name === 'assetId' || e.target.name === 'payDate') { autoQty(); } if (e.target.name === 'assetId') { const a = asset(); if (!edit) f.type.value = a.assetClass === 'FII' ? 'RENDIMENTO' : f.type.value === 'RENDIMENTO' ? 'DIVIDENDO' : f.type.value; } calc(); });
      autoQty(); calc();
      api.q('[data-del]')?.addEventListener('click', async () => { api.close(); if (await confirmDialog({ title: 'Excluir provento', message: 'Excluir este provento?' })) { await store.del('dividends', div.id); afterInvestChange(); } });
      api.q('[data-save]').addEventListener('click', async () => {
        const d = formData(f), ps = parseNum(d.perShare), q = parseNum(d.quantity), errs = [];
        if (!(ps > 0)) errs.push('Informe o valor por cota.'); if (!(q > 0)) errs.push('Informe a quantidade de cotas.'); if (!d.payDate) errs.push('Informe a data.');
        if (errs.length) { api.q('#dErr').innerHTML = errBox(errs); return; }
        await store.put('dividends', { id: div?.id || uid(), assetId: d.assetId, type: d.type, payDate: d.payDate, perShare: ps, quantity: q, amount: round2(netDividend(d.type, ps * q)) });
        toast('Provento salvo', { kind: 'ok' }); api.close(); afterInvestChange();
      });
    },
  });
}

// ----------------------------------------------------------------------------- ativo
export function assetForm(asset) {
  const fi = asset.fixedIncome || {};
  const isRF = asset.assetClass === 'RENDA_FIXA';
  const nTx = assetTxs(asset.id).length;
  openModal({
    title: `Editar ${asset.ticker}`,
    body: `<form id="af" class="stack" style="gap:12px" novalidate><div class="form-grid">
      ${field('Nome', `<input class="input" name="name" value="${esc(asset.name)}">`)}
      ${field('Classe', `<select class="input" name="assetClass">${options(Object.entries(CLASSES), asset.assetClass)}</select>`)}
      ${isRF ? `${field('Indexador', `<select class="input" name="indexer">${options(Object.entries(INDEXERS), fi.indexer || 'CDI')}</select>`)}${field('Taxa', `<input class="input num-in" name="rate" value="${fi.rate ?? ''}">`)}${field('Emissor', `<input class="input" name="issuer" value="${esc(fi.issuer || '')}">`)}${field('Vencimento', `<input class="input" type="date" name="maturity" value="${fi.maturity || ''}">`)}`
      : `${field('Preço manual (R$)', `<input class="input num-in" name="manualPrice" inputmode="decimal" value="${asset.manualPrice ? nf(asset.manualPrice, 4) : ''}">`, { hint: 'Usado quando a cotação automática falhar — ou sempre, se marcado abaixo.' })}
         ${asset.assetClass === 'CRIPTO' ? field('ID no CoinGecko', `<input class="input" name="cgId" value="${esc(asset.cgId || '')}" placeholder="bitcoin">`, { hint: 'Só se o ticker não for reconhecido.' }) : field('Moeda', `<select class="input" name="currency">${options([['BRL', 'R$ (BRL)'], ['USD', 'US$ (USD)']], asset.currency || 'BRL')}</select>`)}
         <label class="radio span2"><input type="checkbox" name="manual" ${asset.priceSource === 'manual' ? 'checked' : ''}><span class="dot"></span> Usar sempre o preço manual (fundos, títulos sem cotação pública)</label>`}
    </div><div id="aErr"></div></form>`,
    actions: `<button class="btn btn-secondary btn-danger" data-del style="margin-right:auto">Excluir ativo</button><button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-save>Salvar</button>`,
    onMount: api => {
      api.q('[data-del]').addEventListener('click', async () => {
        api.close();
        if (await confirmDialog({ title: 'Excluir ativo', message: `Excluir ${esc(asset.ticker)}${nTx ? ` junto com ${nTx} operação(ões) e seus proventos` : ''}? Isto não afeta lançamentos já feitos nas Finanças.` })) {
          await store.delMany('investTx', assetTxs(asset.id).map(t => t.id));
          await store.delMany('dividends', store.get('dividends').filter(d => d.assetId === asset.id).map(d => d.id));
          await store.del('assets', asset.id); toast('Ativo excluído', { kind: 'ok' }); location.hash = '#/inv/posicoes'; afterInvestChange();
        }
      });
      api.q('[data-save]').addEventListener('click', async () => {
        const d = formData(api.q('#af'));
        const patch = { ...asset, name: d.name.trim() || asset.ticker, assetClass: d.assetClass };
        if (isRF) patch.fixedIncome = { indexer: d.indexer, rate: parseNum(d.rate), issuer: d.issuer.trim(), maturity: d.maturity || null };
        else { patch.manualPrice = parseNum(d.manualPrice) || null; patch.manualPriceAt = patch.manualPrice ? new Date().toISOString() : null; patch.priceSource = d.manual ? 'manual' : 'auto'; if (d.cgId !== undefined) patch.cgId = d.cgId.trim() || null; if (d.currency) patch.currency = d.currency; }
        await store.put('assets', patch); toast('Ativo atualizado', { kind: 'ok' }); api.close(); afterInvestChange();
      });
    },
  });
}

// ----------------------------------------------------------------------------- metas de alocação
export function targetsForm() {
  const c = getCtx();
  openModal({
    title: 'Metas de alocação', body: `<form id="tf" class="stack" style="gap:10px">
      ${CLASS_ORDER.map(k => `<div class="row spread"><label for="t-${k}" style="font-size:14px">${CLASSES[k]}</label><div class="row" style="gap:6px"><input class="input sm num-in" id="t-${k}" name="${k}" inputmode="decimal" value="${nf(c.targets[k], c.targets[k] % 1 ? 1 : 0)}" style="width:76px"><span class="muted">%</span></div></div>`).join('')}
      <div class="row spread" style="border-top:1px solid var(--line);padding-top:10px"><b>Total</b><b id="tsum" class="num">100%</b></div>
      <div class="row spread"><label for="tol" style="font-size:14px">Tolerância (± pontos percentuais)</label><input class="input sm num-in" id="tol" name="tol" inputmode="decimal" value="${nf(c.tolerance, 0)}" style="width:76px"></div>
      <div id="tErr"></div></form>`,
    actions: '<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-save>Salvar</button>',
    onMount: api => {
      const f = api.q('#tf'); const sum = () => CLASS_ORDER.reduce((s, k) => s + (parseNum(f[k].value) || 0), 0);
      const upd = () => { const s = sum(); const el = api.q('#tsum'); el.textContent = nf(s, s % 1 ? 1 : 0) + '%'; el.style.color = Math.abs(s - 100) < 0.01 ? 'var(--up)' : 'var(--dn)'; };
      f.addEventListener('input', upd); upd();
      api.q('[data-save]').addEventListener('click', async () => {
        if (Math.abs(sum() - 100) > 0.01) { api.q('#tErr').innerHTML = errBox(['A soma das metas deve ser 100%.']); return; }
        await store.putMany('targets', CLASS_ORDER.map(k => ({ id: k, percent: parseNum(f[k].value) || 0 })));
        await store.setSetting('tolerance', parseNum(f.tol.value) || 3);
        toast('Metas salvas', { kind: 'ok' }); api.close();
      });
    },
  });
}
