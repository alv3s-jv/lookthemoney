// Importação de extrato / fatura em CSV (com pré-visualização, categorização automática e detecção de duplicados).
import { store } from './store.js';
import { getCtx } from './app.js';
import { openModal, field, options, formData, errBox, toast, money, esc } from './ui.js';
import { guessCategory } from './forms-fin.js';
import { uid, parseNum, round2, todayISO } from './util.js';

export function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const first = text.split(/\r?\n/).find(l => l.trim()) || '';
  const counts = { ';': (first.match(/;/g) || []).length, ',': (first.match(/,/g) || []).length, '\t': (first.match(/\t/g) || []).length };
  const delim = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cur); cur = ''; }
    else if (ch === '\n') { row.push(cur.replace(/\r$/, '')); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur || row.length) { row.push(cur.replace(/\r$/, '')); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim() !== ''));
}

export function parseDate(s) {
  s = String(s || '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);
  if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  return null;
}

const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const guessCol = (header, names) => header.findIndex(h => names.some(n => norm(h).includes(n)));

export function openImport() {
  const c = getCtx();
  if (!c.accounts.length) { toast('Cadastre uma conta antes de importar.', { kind: 'error' }); return; }
  let rows = [], header = [], parsed = [];
  const body = `<div class="stack" style="gap:12px">
    <div class="notice"><i class="ph ph-info"></i><span>Exporte o extrato/fatura do seu banco em <b>CSV</b>. Colunas reconhecidas: data, descrição/título/histórico e valor. Nada é enviado a terceiros — o arquivo é lido no seu navegador.</span></div>
    <div class="field"><label>Arquivo CSV</label><input class="input" type="file" id="file" accept=".csv,.txt,text/csv"></div>
    <div id="map" style="display:none" class="stack"><div class="form-grid">
      ${field('Destino', `<select class="input" name="dest">${options([...c.accounts.map(a => [`a:${a.id}`, a.name]), ...c.cards.map(k => [`c:${k.id}`, 'Cartão ' + k.name])])}</select>`)}
      ${field('Os valores positivos são…', `<select class="input" name="sign"><option value="neg">Receitas (negativos = despesas)</option><option value="pos">Despesas (positivos = despesas)</option></select>`)}
      ${field('Coluna da data', `<select class="input" name="cDate"></select>`)}${field('Coluna da descrição', `<select class="input" name="cDesc"></select>`)}${field('Coluna do valor', `<select class="input" name="cAmt"></select>`)}
      ${field('Categoria do valor (opcional)', `<select class="input" name="cCat"><option value="-1">— nenhuma —</option></select>`)}</div>
    <div id="pv"></div></div><div id="iErr"></div></div>`;
  openModal({
    title: 'Importar extrato', body, wide: true,
    actions: '<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok disabled>Importar</button>',
    onMount: api => {
      const map = api.q('#map'), ok = api.q('[data-ok]');
      const selects = () => ({ d: +api.q('[name=cDate]').value, s: +api.q('[name=cDesc]').value, a: +api.q('[name=cAmt]').value, k: +api.q('[name=cCat]').value });
      const build = () => {
        const { d, s, a, k } = selects(); const dest = api.q('[name=dest]').value, sign = api.q('[name=sign]').value;
        const [t, id] = dest.split(':');
        const ex = new Set(store.get('transactions').map(x => `${x.date}|${Math.abs(round2(x.amount))}|${norm(x.description)}`));
        parsed = []; let bad = 0;
        for (const r of rows) {
          const date = parseDate(r[d]), v = parseNum(r[a]), desc = (r[s] || '').trim();
          if (!date || isNaN(v) || v === 0 || !desc) { bad++; continue; }
          const isExp = sign === 'neg' ? v < 0 : v > 0;
          const kind = isExp ? 'despesa' : 'receita';
          const dup = ex.has(`${date}|${Math.abs(round2(v))}|${norm(desc)}`);
          parsed.push({ date, desc, v: Math.abs(round2(v)), kind, dup, category: guessCategory(desc, kind) || (kind === 'receita' ? 'Outras receitas' : 'Outros'), src: { t, id } });
        }
        const news = parsed.filter(p => !p.dup);
        api.q('#pv').innerHTML = `<div class="row spread wrap" style="margin-bottom:6px"><b>${news.length} novos</b><span class="muted">${parsed.length - news.length} já existentes (ignorados)${bad ? ` · ${bad} linhas inválidas` : ''}</span></div>
          <div class="tw" style="max-height:260px;overflow:auto"><table class="table"><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th class="r">Valor</th></tr></thead><tbody>${parsed.slice(0, 12).map(p => `<tr style="${p.dup ? 'opacity:.4' : ''}"><td>${p.date.split('-').reverse().join('/')}</td><td>${esc(p.desc.slice(0, 40))}</td><td>${esc(p.category)}</td><td class="r num" style="color:${p.kind === 'receita' ? 'var(--up)' : 'inherit'}">${p.kind === 'receita' ? '+' : '−'}${money(p.v).replace('−', '')}</td></tr>`).join('')}</tbody></table></div>${parsed.length > 12 ? `<div class="hint">…e mais ${parsed.length - 12} linhas</div>` : ''}`;
        ok.disabled = news.length === 0; ok.textContent = news.length ? `Importar ${news.length} lançamentos` : 'Nada a importar';
      };
      api.q('#file').addEventListener('change', async e => {
        const file = e.target.files[0]; if (!file) return;
        let text = await file.text();
        if (/�/.test(text)) { try { text = new TextDecoder('windows-1252').decode(await file.arrayBuffer()); } catch { /* ok */ } }
        const all = parseCSV(text);
        if (all.length < 2) { api.q('#iErr').innerHTML = errBox(['Arquivo vazio ou formato não reconhecido.']); return; }
        // procura a linha de cabeçalho (primeira com texto em ≥2 colunas conhecidas)
        let hi = all.findIndex(r => guessCol(r, ['data', 'date']) >= 0 && guessCol(r, ['valor', 'amount', 'quantia']) >= 0);
        if (hi < 0) hi = 0;
        header = all[hi]; rows = all.slice(hi + 1);
        const opts = header.map((h, i) => `<option value="${i}">${esc(h || 'Coluna ' + (i + 1))}</option>`).join('');
        ['cDate', 'cDesc', 'cAmt'].forEach(n => (api.q(`[name=${n}]`).innerHTML = opts));
        api.q('[name=cCat]').innerHTML = '<option value="-1">— nenhuma —</option>' + opts;
        const di = guessCol(header, ['data', 'date']), si = guessCol(header, ['descri', 'titulo', 'title', 'historico', 'lancamento', 'estabelecimento', 'memo']), ai = guessCol(header, ['valor', 'amount', 'quantia']);
        api.q('[name=cDate]').value = di >= 0 ? di : 0; api.q('[name=cDesc]').value = si >= 0 ? si : Math.min(1, header.length - 1); api.q('[name=cAmt]').value = ai >= 0 ? ai : header.length - 1;
        const isCard = api.q('[name=dest]').value.startsWith('c:'); api.q('[name=sign]').value = isCard ? 'pos' : 'neg';
        map.style.display = ''; api.q('#iErr').innerHTML = ''; build();
      });
      map.addEventListener('change', e => { if (e.target.name === 'dest') api.q('[name=sign]').value = e.target.value.startsWith('c:') ? 'pos' : 'neg'; build(); });
      ok.addEventListener('click', async () => {
        const news = parsed.filter(p => !p.dup); if (!news.length) return;
        const now = new Date().toISOString();
        await store.putMany('transactions', news.map(p => ({ id: uid(), date: p.date, description: p.desc, category: p.category, kind: p.kind, amount: p.kind === 'receita' ? p.v : -p.v, accountId: p.src.t === 'a' ? p.src.id : null, cardId: p.src.t === 'c' ? p.src.id : null, recurrence: 'none', imported: true, createdAt: now })));
        toast(`${news.length} lançamentos importados`, { kind: 'ok' }); api.close();
      });
    },
  });
}
