// Configurações e tela de login.
import { store } from './store.js';
import { app, memberName, memberAvatar, getCtx, brapiToken, refreshAll } from './app.js';
import { openModal, toast, confirmDialog, esc, money, options, field, errBox } from './ui.js';
import { head } from './views-fin.js';
import { accountForm } from './forms-fin.js';
import { accountBalance } from './calc.js';
import { ACCOUNT_KINDS } from './meta.js';
import { fetchBrapi } from './quotes.js';
import { parseNum, nf, todayISO } from './util.js';
import { buildSeed } from './seed.js';
import { TABLE_KEYS } from './db.js';

export async function loadDemo() {
  const has = store.get('transactions').length || store.get('assets').length;
  if (has && !(await confirmDialog({ title: 'Carregar dados de exemplo', message: 'Já existem dados nesta conta. Os dados de exemplo serão <b>adicionados</b> aos seus' + (app.cloud ? ' (e os investimentos de exemplo ficam visíveis para a outra pessoa do domicílio)' : '') + '. Para uma conta limpa, prefira o modo local de demonstração.', confirm: 'Adicionar mesmo assim', danger: false }))) return;
  const D = buildSeed();
  for (const k of TABLE_KEYS) if (D[k]?.length) await store.putMany(k, D[k], { silent: true });
  store.emit();
  toast('Dados de exemplo carregados', { kind: 'ok' });
  refreshAll({ force: false });
}

export const config = {
  title: 'Configurações',
  render(c) {
    const cloud = app.cloud, tok = brapiToken();
    return `${head('Configurações', cloud ? 'Seus dados ficam na sua conta (nuvem, com acesso restrito a você)' : 'Modo local: os dados ficam apenas neste navegador')}
    ${cloud ? '' : `<div class="notice warn" style="margin-bottom:14px"><i class="ph ph-warning"></i><span><b>Modo local.</b> Os dados ficam só neste navegador e se perdem ao limpar o cache. Faça backups em “Exportar dados” ou configure o Supabase (ver README) para sincronizar entre dispositivos.</span></div>`}
    <div class="grid g-2e">
      <div class="panel"><div class="panel-h"><h3>Contas financeiras</h3><button class="btn btn-secondary btn-sm" data-act="new-account"><i class="ph ph-plus"></i> Nova conta</button></div>
        ${c.accounts.length ? `<div class="list">${c.accounts.map(a => `<div class="li"><div class="li-ic"><i class="ph ph-bank"></i></div><div class="li-t"><b>${esc(a.name)}</b><span>${ACCOUNT_KINDS[a.kind] || ''} · saldo inicial ${money(a.initialBalance, 0)}</span></div><div class="li-v num">${money(accountBalance(a, c.txs, c.today))}</div><button class="iconbtn" data-act="edit-account" data-id="${a.id}" aria-label="Editar"><i class="ph ph-pencil-simple"></i></button></div>`).join('')}</div>` : '<div class="muted">Nenhuma conta ainda.</div>'}
        <div class="hint" style="margin-top:8px">O saldo atual = saldo inicial + lançamentos até hoje. Compras no cartão só afetam o saldo quando a fatura é paga.</div></div>
      <div class="panel"><div class="panel-h"><h3>Investimentos</h3></div>
        <div class="stack" style="gap:12px">
          ${field('Token da brapi.dev', `<div class="row"><input class="input grow" id="tok" type="password" autocomplete="off" placeholder="cole seu token (gratuito em brapi.dev)" value="${esc(store.setting('brapiToken', ''))}"><button class="btn btn-secondary" data-act="save-token">Salvar</button><button class="btn btn-secondary" data-act="test-token">Testar</button></div>`, { hint: 'Sem token só PETR4, VALE3, ITUB4 e MGLU3 respondem. O plano gratuito permite 1 ativo por requisição (o app consulta em fila) e 15 mil requisições/mês. O token fica no seu banco de dados, não no código do site.' })}
          ${field('Tolerância de rebalanceamento (± p.p.)', `<input class="input num-in" id="tol" value="${nf(c.tolerance, 0)}" style="width:100px"> <button class="btn btn-secondary btn-sm" data-act="save-tol" style="margin-left:8px">Salvar</button>`)}
          <div class="row wrap"><button class="btn btn-secondary btn-sm" data-act="refresh"><i class="ph ph-arrows-clockwise"></i> Forçar atualização de cotações</button></div>
        </div></div></div>
    <div class="panel" style="margin-top:12px"><div class="panel-h"><h3>Seus dados</h3></div>
      <div class="row wrap"><button class="btn btn-secondary" data-act="export"><i class="ph ph-download-simple"></i> Exportar dados (JSON)</button><label class="btn btn-secondary" style="cursor:pointer"><i class="ph ph-upload-simple"></i> Importar backup<input type="file" id="impjson" accept="application/json,.json" hidden></label><button class="btn btn-secondary" data-act="load-demo">Carregar dados de exemplo</button><button class="btn btn-secondary btn-danger" data-act="wipe"><i class="ph ph-trash"></i> Apagar todos os dados</button></div>
      <div class="hint" style="margin-top:8px">O backup contém tudo (finanças e investimentos). Guarde em local seguro: não é criptografado.</div></div>
    ${cloud ? `<div class="panel" style="margin-top:12px"><div class="panel-h"><h3>Autenticação em duas etapas (2FA)</h3></div><div id="mfa" class="muted">Carregando…</div></div>` : ''}
    ${cloud ? `<div class="panel" style="margin-top:12px"><div class="panel-h"><h3>Conta</h3></div><div class="row" style="gap:14px;margin-bottom:12px"><div class="avatar avatar-lg">${memberAvatar(app.user?.id) ? `<img src="${memberAvatar(app.user?.id)}" alt="Sua foto">` : esc(((memberName(app.user?.id) || app.user?.email || 'LM').replace(/[^a-z]/gi, '').slice(0, 2) || 'LM').toUpperCase())}</div><span class="row" style="gap:6px;flex-wrap:wrap"><label class="btn btn-secondary btn-sm" style="cursor:pointer"><i class="ph ph-image"></i> Alterar foto<input type="file" id="avatarfile" accept="image/png,image/jpeg,image/webp" hidden></label>${memberAvatar(app.user?.id) ? '<button class="btn btn-secondary btn-sm" data-act="rm-avatar">Remover foto</button>' : ''}</span></div><div class="row spread wrap"><span>${esc(app.user?.email || '')}</span><span class="row" style="gap:6px"><input class="input" id="myname" style="width:160px" value="${esc(memberName(app.user?.id))}" aria-label="Seu nome" placeholder="Seu nome"><button class="btn btn-secondary btn-sm" data-act="save-name">Salvar nome</button></span><button class="btn btn-secondary" data-act="logout"><i class="ph ph-sign-out"></i> Sair</button></div></div>` : ''}`;
  },
  actions: {
    'edit-account': el => accountForm(store.find('accounts', el.dataset.id)),
    'save-token': () => { store.setSetting('brapiToken', document.getElementById('tok').value.trim()); toast('Token salvo', { kind: 'ok' }); },
    'test-token': async () => { const t = document.getElementById('tok').value.trim(); try { const r = await fetchBrapi('PETR4', t); toast(`Token ok — PETR4 R$ ${nf(r.price)}`, { kind: 'ok' }); } catch (e) { toast('Falhou: ' + (e.status === 401 || e.status === 403 ? 'token inválido' : e.message), { kind: 'error' }); } },
    'save-tol': () => { store.setSetting('tolerance', parseNum(document.getElementById('tol').value) || 3); toast('Tolerância salva', { kind: 'ok' }); },
    export: () => { const b = new Blob([store.exportJSON()], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `lookthemoney-backup-${todayISO()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); },
    wipe: async () => {
      let shared = !app.cloud;
      const ok = await new Promise(res => { let done = false; openModal({ title: 'Apagar dados', body: `<p style="margin:0">Isto apaga <b>suas finanças</b> ${app.cloud ? 'da nuvem' : 'deste navegador'} e não pode ser desfeito. Exporte um backup antes.</p>${app.cloud ? `<label class="row" style="margin-top:12px;align-items:flex-start;gap:8px"><input type="checkbox" id="wsh"><span>Apagar <b>também os investimentos</b> (carteira, operações, proventos, metas de alocação, histórico). <b>São compartilhados: somem para a outra pessoa também.</b></span></label>` : ''}<div class="field"><label>Digite APAGAR para confirmar</label><input class="input" id="cf" autocomplete="off"></div>`, actions: '<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary btn-danger" data-ok>Apagar</button>', onMount: a => { a.q('[data-ok]').onclick = () => { if (a.q('#cf').value.trim().toUpperCase() === 'APAGAR') { shared = app.cloud ? !!a.q('#wsh')?.checked : true; done = true; a.close(); res(true); } else toast('Digite APAGAR para confirmar.', { kind: 'error' }); }; }, onClose: () => { if (!done) res(false); } }); });
      if (ok) { await store.wipe({ shared }); toast('Dados apagados', { kind: 'ok' }); }
    },
    'rm-avatar': async () => {
      try { await app.adapter.setAvatar(''); app.members = await app.adapter.members(); store.emit(); toast('Foto removida', { kind: 'ok' }); } catch (e) { toast(e.message, { kind: 'error' }); }
    },
    'save-name': async () => {
      const v = document.getElementById('myname').value.trim(); if (!v) return toast('Informe um nome.', { kind: 'error' });
      try { await app.adapter.renameMe(v); app.members = await app.adapter.members(); store.emit(); toast('Nome salvo', { kind: 'ok' }); } catch (e) { toast(e.message, { kind: 'error' }); }
    },
  },
  onMount(root) {
    mfaPanel(root);
    root.querySelector('#avatarfile')?.addEventListener('change', async e => {
      const f = e.target.files[0]; e.target.value = ''; if (!f) return;
      if (f.size > 8e6) return toast('Imagem grande demais (máx. 8 MB).', { kind: 'error' });
      try {
        const url = URL.createObjectURL(f);
        const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('Não foi possível ler a imagem.')); i.src = url; });
        const S = 192, side = Math.min(img.width, img.height), cv = document.createElement('canvas'); cv.width = cv.height = S;
        const cx = cv.getContext('2d'); cx.fillStyle = '#000'; cx.fillRect(0, 0, S, S);
        cx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, S, S); URL.revokeObjectURL(url);
        await app.adapter.setAvatar(cv.toDataURL('image/jpeg', 0.85));
        app.members = await app.adapter.members(); store.emit(); toast('Foto atualizada', { kind: 'ok' });
      } catch (err) { toast(err.message, { kind: 'error' }); }
    });
    root.querySelector('#impjson')?.addEventListener('change', async e => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const replace = await confirmDialog({ title: 'Importar backup', message: 'Substituir todos os dados atuais pelo backup, ou mesclar com os existentes?', confirm: 'Substituir', danger: true }).then(r => r);
        await store.importJSON(await f.text(), { replace }); toast('Backup importado', { kind: 'ok' }); refreshAll();
      } catch (err) { toast('Falha ao importar: ' + err.message, { kind: 'error', ms: 5000 }); }
      e.target.value = '';
    });
  },
};

// ------------------------------------------------------------------------------------------------ login
export function renderAuth(adapter, onDone) {
  const root = document.getElementById('root');
  let mode = 'in';
  const draw = (msg = '', err = '') => {
    root.innerHTML = `<div class="auth"><form class="auth-card" id="authf" novalidate>
      <div class="brand" style="padding:0"><div class="brand-mark"><i class="ph ph-eye"></i></div>LookTheMoney</div>
      <h2>${mode === 'in' ? 'Entrar' : mode === 'up' ? 'Criar conta' : 'Recuperar senha'}</h2>
      <div class="field"><label for="em">E-mail</label><input class="input" id="em" type="email" autocomplete="email" required autofocus></div>
      ${mode === 'reset' ? '' : `<div class="field"><label for="pw">Senha</label><input class="input" id="pw" type="password" autocomplete="${mode === 'in' ? 'current-password' : 'new-password'}" minlength="8" required></div>`}
      ${err ? `<div class="errs" role="alert">${esc(err)}</div>` : ''}${msg ? `<div class="notice"><i class="ph ph-info"></i><span>${esc(msg)}</span></div>` : ''}
      <button class="btn btn-primary btn-block" type="submit" id="go">${mode === 'in' ? 'Entrar' : mode === 'up' ? 'Criar conta' : 'Enviar link de recuperação'}</button>
      ${mode === 'in' ? '<button class="btn btn-secondary btn-block" type="button" id="magic">Entrar com link por e-mail</button>' : ''}
      <div class="row spread" style="font-size:13px">${mode === 'in' ? '<a href="#" id="toUp">Criar conta</a><a href="#" id="toReset">Esqueci a senha</a>' : '<a href="#" id="toIn">← Voltar para entrar</a>'}</div>
      <div class="hint">Seus dados financeiros ficam protegidos por login e regras de acesso por usuário (RLS) no banco.</div></form></div>`;
    const $ = s => root.querySelector(s);
    $('#toUp')?.addEventListener('click', e => { e.preventDefault(); mode = 'up'; draw(); });
    $('#toReset')?.addEventListener('click', e => { e.preventDefault(); mode = 'reset'; draw(); });
    $('#toIn')?.addEventListener('click', e => { e.preventDefault(); mode = 'in'; draw(); });
    $('#magic')?.addEventListener('click', async () => { const em = $('#em').value.trim(); if (!em) return draw('', 'Informe o e-mail.'); try { await adapter.magicLink(em); draw('Link enviado. Abra o e-mail neste dispositivo.'); } catch (e) { draw('', e.message); } });
    $('#authf').addEventListener('submit', async e => {
      e.preventDefault(); const em = $('#em').value.trim(), pw = $('#pw')?.value || ''; $('#go').disabled = true;
      try {
        if (mode === 'in') { await adapter.signIn(em, pw); onDone(); }
        else if (mode === 'up') { if (pw.length < 8) throw new Error('A senha precisa de pelo menos 8 caracteres.'); const r = await adapter.signUp(em, pw); if (r.confirmed) onDone(); else { mode = 'in'; draw('Conta criada. Confirme o e-mail enviado e depois entre.'); } }
        else { await adapter.resetPassword(em); mode = 'in'; draw('Se o e-mail existir, enviamos um link de recuperação.'); }
      } catch (er) { draw('', /Invalid login/i.test(er.message) ? 'E-mail ou senha incorretos.' : er.message); }
    });
  };
  draw();
}

export function renderMfa(adapter, onDone) {
  const root = document.getElementById('root');
  root.innerHTML = `<div class="auth"><form class="auth-card" id="mf" novalidate>
    <div class="brand" style="padding:0"><div class="brand-mark"><i class="ph ph-eye"></i></div>LookTheMoney</div>
    <h2>Verificação em duas etapas</h2>
    <div class="field"><label for="cd">Código do app autenticador (6 dígitos)</label><input class="input" id="cd" inputmode="numeric" autocomplete="one-time-code" maxlength="7" autofocus></div>
    <div id="er"></div>
    <button class="btn btn-primary btn-block" type="submit" id="go">Verificar</button>
    <button class="btn btn-secondary btn-block" type="button" id="out">Sair</button></form></div>`;
  root.querySelector('#out').onclick = async () => { await adapter.signOut(); location.reload(); };
  root.querySelector('#mf').addEventListener('submit', async e => {
    e.preventDefault(); const go = root.querySelector('#go'); go.disabled = true;
    try { await adapter.mfaChallenge(root.querySelector('#cd').value); onDone(); }
    catch (er) { root.querySelector('#er').innerHTML = `<div class="errs" role="alert">${esc(/invalid|expired/i.test(er.message) ? 'Código inválido ou expirado.' : er.message)}</div>`; go.disabled = false; }
  });
}

// 2FA nas Configurações
export async function mfaPanel(root) {
  const box = root.querySelector('#mfa'); if (!box || !app.cloud) return;
  const draw = async () => {
    let st; try { st = await app.adapter.mfaState(); } catch (e) { box.innerHTML = `<span class="muted">${esc(e.message)}</span>`; return; }
    if (st.factors.length) {
      box.innerHTML = `<div class="row spread wrap"><span><i class="ph ph-shield-check" style="color:var(--up)"></i> Ativo — o banco só libera seus dados após o código.</span><button class="btn btn-secondary btn-danger btn-sm" id="mfaOff">Desativar</button></div>`;
      box.querySelector('#mfaOff').onclick = async () => { if (await confirmDialog({ title: 'Desativar 2FA', message: 'Sua conta voltará a depender só da senha.', confirm: 'Desativar' })) { try { await app.adapter.mfaRemove(st.factors[0].id); toast('2FA desativado', { kind: 'ok' }); draw(); } catch (e) { toast(e.message, { kind: 'error' }); } } };
    } else {
      box.innerHTML = `<div class="row spread wrap"><span class="muted">Desativado. Recomendado: use Google Authenticator, Microsoft Authenticator ou similar.</span><button class="btn btn-primary btn-sm" id="mfaOn">Ativar 2FA</button></div>`;
      box.querySelector('#mfaOn').onclick = async () => {
        try {
          const en = await app.adapter.mfaEnroll();
          box.innerHTML = `<div class="stack" style="gap:10px"><div class="row wrap" style="gap:16px;align-items:flex-start"><img src="${esc(en.qr)}" alt="QR code do 2FA" width="148" height="148" style="background:#fff;border-radius:8px;padding:6px"><div class="stack" style="gap:8px;min-width:220px"><span class="muted">1. Escaneie o QR no app autenticador (ou digite a chave).</span><code style="word-break:break-all">${esc(en.secret)}</code><span class="muted">2. Informe o código de 6 dígitos:</span><div class="row"><input class="input num-in" id="mc" inputmode="numeric" maxlength="7" style="width:120px"><button class="btn btn-primary" id="mv">Confirmar</button></div></div></div><div id="me"></div></div>`;
          box.querySelector('#mv').onclick = async () => { try { await app.adapter.mfaVerify(en.id, box.querySelector('#mc').value); toast('2FA ativado', { kind: 'ok' }); draw(); } catch (e) { box.querySelector('#me').innerHTML = `<div class="errs">${esc('Código inválido ou expirado.')}</div>`; } };
        } catch (e) { toast(e.message, { kind: 'error' }); }
      };
    }
  };
  draw();
}
