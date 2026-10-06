// Tela "Preço-teto": quanto pagar (teto), onde comprar com folga (zona de compra), onde está o fundo e qual a meta de venda.
import { app, brapiToken } from './app.js';
import { esc } from './ui.js';
import { nf } from './util.js';
import { head } from './views-fin.js';
import { edgeOn } from './feed.js';
import { topN } from './reco.js';
import { analyze, screen, loadFundamentals, YIELD_MIN, CYCLICAL } from './valuation.js';

const FREE = ['PETR4', 'VALE3', 'ITUB4', 'MGLU3']; // únicos liberados pela brapi sem token
const WL = 'ltm.val.watch', MOS = 'ltm.val.mos';
const rd = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } };
const wr = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* privado */ } };

const S = { raw: {}, errors: {}, loading: false, prog: [0, 0], mos: rd(MOS, 0.25), custom: rd(WL, []), at: 0 };
let lastC = null;

const R$ = v => (v == null ? '—' : 'R$ ' + nf(v));
const pc = (v, d = 1) => (v >= 0 ? '+' : '−') + nf(Math.abs(v * 100), d) + '%';
const heldStocks = () => (lastC?.portfolio?.active || []).filter(h => h.asset.assetClass === 'ACAO_BR').map(h => h.asset.ticker);
const universe = () => {
  const all = [...new Set([...topN().map(r => r.t), ...heldStocks(), ...S.custom])].filter(t => /^[A-Z]{4}\d{1,2}$/.test(t) && !/^XPBR/.test(t));
  return (brapiToken() || edgeOn()) ? all : all.filter(t => FREE.includes(t));
};
const rows = () => Object.values(S.raw).filter(r => universe().includes(r.t)).map(r => analyze(r, { mos: S.mos }));

const ST = {
  compra: ['Zona de compra', 'up'], justo: ['Preço justo (manter)', 'warn'], esticado: ['Esticada', 'dn'], caro: ['Acima do teto', 'dn'], 'sem-dados': ['Sem dados', ''],
};
const badge = s => `<span class="pill st-${s}">${ST[s][0]}</span>`;

function rangeBar(r) {
  const s = r.support, pts = [s.fundo52, s.topo52, r.buyZone, r.fair, r.price].filter(v => v != null);
  const lo = Math.min(...pts), hi = Math.max(...pts), pos = v => (hi > lo ? ((v - lo) / (hi - lo)) * 100 : 50).toFixed(1);
  const mk = (v, c, t) => (v == null ? '' : `<i class="mkr ${c}" style="left:${pos(v)}%" title="${t}: ${R$(v)}"></i>`);
  const z = r.buyZone != null ? `<b class="zone" style="left:${pos(Math.min(lo, r.buyZone))}%;width:${(pos(r.buyZone) - pos(Math.min(lo, r.buyZone))).toFixed(1)}%"></b>` : '';
  return `<div class="vr">${z}${mk(s.fundo52, 'lo', 'Fundo 52 semanas')}${mk(r.fair, 'fa', 'Preço justo / meta')}${mk(r.buyZone, 'bz', 'Zona de compra')}${mk(r.price, 'px', 'Preço atual')}</div>`;
}

function qbadge(q) {
  if (q.score == null) return '<span class="muted">—</span>';
  const t = q.checks.filter(c => c.ok != null).map(c => `${c.ok ? '✓' : '✗'} ${c.name}`).join('\n');
  return `<span class="qb ${q.score >= 70 ? 'g' : q.score >= 55 ? 'm' : 'b'}" title="${esc(t)}">${q.score}</span>`;
}

function reasons(r) {
  const out = [];
  out.push(`Preço de ${R$(r.price)} está ${nf(Math.abs(r.mos) * 100, 0)}% ${r.mos >= 0 ? 'abaixo' : 'acima'} do preço justo (${R$(r.fair)}).`);
  if (r.bazin != null) out.push(`Bazin: teto de ${R$(r.bazin)} (proventos líquidos de ${R$(Math.min(r.dpa.dpa12, r.dpa.dpa3 || r.dpa.dpa12))}/ação ÷ ${nf(YIELD_MIN * 100, 0)}%).`);
  if (r.graham != null) out.push(`Graham: ${R$(r.graham)} (LPA ${nf(r.eps)} · VPA ${nf(r.bv)}).`);
  const ok = r.quality.checks.filter(c => c.ok).map(c => c.name), bad = r.quality.checks.filter(c => c.ok === false).map(c => c.name);
  out.push(`Qualidade ${r.quality.score}/100. Passa: ${ok.join(', ') || '—'}.${bad.length ? ' Falha: ' + bad.join(', ') + '.' : ''}`);
  if (r.support.pos52 != null) out.push(`Está a ${nf(r.support.pos52 * 100, 0)}% da faixa de 52 semanas (fundo ${R$(r.support.fundo52)}, topo ${R$(r.support.topo52)})${r.support.aboveMa != null ? `; ${r.support.aboveMa ? 'acima' : 'abaixo'} da média de ~200 pregões` : ''}.`);
  return out;
}

function triage(rs) {
  const s = screen(rs);
  const b = s.buy;
  const buyCard = b
    ? `<div class="panel tri buy"><div class="panel-h"><h3><i class="ph ph-crosshair"></i> Candidata na zona de compra</h3><span class="sub">margem de segurança ${nf(S.mos * 100, 0)}%</span></div>
        <div class="tri-top"><div><div class="tk">${esc(b.t)}</div><div class="sub-s">${esc(S.raw[b.t]?.name || '')}</div></div>${badge(b.status)}</div>
        <div class="tri-g"><div><span>Preço hoje</span><b class="num">${R$(b.price)}</b></div><div><span>Zona de compra até</span><b class="num up">${R$(b.buyZone)}</b></div><div><span>Meta de venda</span><b class="num warn">${R$(b.target)}</b></div><div><span>Potencial até a meta</span><b class="num up">${pc(b.upside)}</b></div><div><span>Proventos/preço hoje</span><b class="num">${b.dyNow != null ? nf(b.dyNow * 100, 1) + '%' : '—'}</b></div><div><span>Fundo 52 sem.</span><b class="num">${R$(b.support.fundo52)}</b></div></div>
        ${rangeBar(b)}<div class="vr-l"><span>fundo 52s</span><span>zona de compra · preço justo = meta</span><span>topo 52s</span></div>
        <ul class="why">${reasons(b).map(x => `<li>${esc(x)}</li>`).join('')}</ul>
        ${b.flags.length ? `<div class="notice warn"><i class="ph ph-warning"></i><span>${b.flags.map(esc).join(' ')}</span></div>` : ''}
        ${s.buyAlt.length ? `<div class="hint">Também na zona de compra: ${s.buyAlt.map(r => `<b>${esc(r.t)}</b> (${pc(r.mos, 0)} de folga)`).join(', ')}.</div>` : ''}
        <div class="hint">Meta de venda = preço justo médio (Bazin + Graham). Reavalie a cada balanço: se o lucro ou os proventos caírem, a meta cai junto.</div></div>`
    : `<div class="panel tri"><div class="panel-h"><h3><i class="ph ph-crosshair"></i> Candidata na zona de compra</h3><span class="sub">margem de segurança ${nf(S.mos * 100, 0)}%</span></div>
        <div class="empty"><i class="ph ph-hourglass"></i><p><b style="color:var(--color-text)">Nenhuma ação da lista está hoje na zona de compra com qualidade ≥ 55.</b><br>${s.nearest ? `A mais próxima é <b>${esc(s.nearest.t)}</b>: preço ${R$(s.nearest.price)} contra zona de compra até ${R$(s.nearest.buyZone)} (precisa cair ${nf((1 - s.nearest.buyZone / s.nearest.price) * 100, 0)}%).` : 'Ainda não há dados suficientes.'}<br>Não comprar nada também é uma decisão válida: os métodos usados só acusam compra quando há folga.</p></div></div>`;
  const hold = `<div class="panel tri"><div class="panel-h"><h3><i class="ph ph-hand-palm"></i> Para manter (preço justo)</h3><span class="sub">qualidade ≥ 55 e preço entre a zona de compra e o preço justo</span></div>${s.hold.length ? `<table class="table mk-t"><thead><tr><th>Ativo</th><th class="r">Preço</th><th class="r">Meta / teto</th><th class="r">Folga</th><th class="r">Qual.</th></tr></thead><tbody>${s.hold.map(r => `<tr><td><b>${esc(r.t)}</b>${heldStocks().includes(r.t) ? ' <span class="dot-held" title="Na sua carteira"></span>' : ''}</td><td class="r num">${R$(r.price)}</td><td class="r num">${R$(r.target)}</td><td class="r num">${pc(r.mos, 0)}</td><td class="r">${qbadge(r.quality)}</td></tr>`).join('')}</tbody></table><div class="hint">Quem já tem pode manter; para novos aportes, o preço não oferece margem de segurança. Compra adicional só abaixo da zona.</div>` : '<div class="empty"><p>Nenhuma ação nesta faixa agora.</p></div>'}</div>`;
  const exp = s.expensive.length || s.lowQ.length ? `<div class="panel tri"><div class="panel-h"><h3><i class="ph ph-prohibit"></i> Fora do critério</h3></div>${s.expensive.length ? `<div class="sub-s">Acima do preço justo: ${s.expensive.map(r => `<b>${esc(r.t)}</b> (${pc(-r.mos, 0)} acima)`).join(', ')}.</div>` : ''}${s.lowQ.length ? `<div class="sub-s" style="margin-top:6px">Qualidade abaixo de 55: ${s.lowQ.map(r => `<b>${esc(r.t)}</b> (${r.quality.score})`).join(', ')}.</div>` : ''}</div>` : '';
  return `<div class="grid g-2 mk-main" style="margin-bottom:14px">${buyCard}<div class="stack">${hold}${exp}</div></div>`;
}

function table(rs) {
  if (!rs.length) return '';
  const sorted = [...rs].sort((a, b) => (b.mos ?? -9) - (a.mos ?? -9));
  return `<div class="panel" style="margin-bottom:14px"><div class="panel-h"><h3>Todas as ações analisadas</h3><span class="sub">ordenadas por folga em relação ao preço justo</span></div><div class="tscroll"><table class="table mk-t val-t"><thead><tr><th>Ativo</th><th class="r">Preço</th><th>Fundo · zona · justo</th><th class="r">Bazin (teto)</th><th class="r">Graham</th><th class="r">Preço justo</th><th class="r">Zona de compra</th><th class="r">Folga</th><th class="r" title="Critérios Buffett/Munger, 0–100">Qual.</th><th>Status</th></tr></thead><tbody>${sorted.map(r => `<tr class="${heldStocks().includes(r.t) ? 'clk' : ''}" ${heldStocks().includes(r.t) ? `data-act="open-asset" data-t="${esc(r.t)}"` : ''}><td><b>${esc(r.t)}</b>${heldStocks().includes(r.t) ? ' <span class="dot-held"></span>' : ''}${CYCLICAL.has(r.t) ? ' <i class="ph ph-waveform" title="Setor cíclico"></i>' : ''}<div class="sub-s">${esc((S.raw[r.t]?.name || '').slice(0, 24))}</div></td><td class="r num">${R$(r.price)}</td><td style="min-width:170px">${rangeBar(r)}</td><td class="r num">${R$(r.bazin)}</td><td class="r num">${R$(r.graham)}</td><td class="r num"><b>${R$(r.fair)}</b></td><td class="r num">${R$(r.buyZone)}</td><td class="r num ${r.mos != null ? (r.mos >= 0 ? 'up' : 'dn') : ''}">${r.mos != null ? pc(r.mos, 0) : '—'}</td><td class="r">${qbadge(r.quality)}</td><td>${badge(r.status)}</td></tr>`).join('')}</tbody></table></div><div class="hint"><i class="mkr px inl"></i> preço atual · <i class="mkr bz inl"></i> zona de compra · <i class="mkr fa inl"></i> preço justo (meta) · <i class="mkr lo inl"></i> fundo 52 semanas. Passe o mouse sobre a nota de qualidade para ver os testes.</div></div>`;
}

const method = () => `<details class="panel"><summary class="panel-h" style="cursor:pointer;margin:0"><h3>Metodologia e limites</h3><span class="sub">clique para abrir</span></summary>
  <div class="meth"><p><b>Bazin</b> (Décio Bazin): teto = proventos por ação ÷ 6%. Usa o menor entre os últimos 12 meses e a média de 3 anos, com JCP líquido de 15% de IR. Só serve para pagadoras recorrentes.</p>
  <p><b>Graham</b> (Benjamin Graham): valor = √(22,5 × LPA × VPA). Equivale a aceitar P/L até 15 e P/VP até 1,5. Não se aplica com lucro negativo.</p>
  <p><b>Preço justo / meta de venda</b>: média dos métodos aplicáveis. <b>Zona de compra</b>: preço justo × (1 − margem de segurança), conceito de Graham e Seth Klarman: comprar com folga para errar nas estimativas.</p>
  <p><b>Qualidade</b> (Buffett/Munger): ROE ≥ 15%, margem líquida ≥ 10%, dívida/PL ≤ 100% (ignorada em bancos e seguradoras), lucro crescendo, caixa livre positivo, proventos recorrentes e P/L entre 0 e 20. A nota é a % dos testes aplicáveis que passam.</p>
  <p><b>Fundo</b>: mínima de 52 semanas e posição do preço na faixa; a média de 10 meses aproxima as 200 sessões. É referência de suporte, não garantia de que o preço não cai mais.</p>
  <p><b>Limites:</b> usa só dados passados (lucro e proventos dos últimos 12 meses), que em empresas cíclicas (Petrobras, Vale, siderúrgicas) estão no pico ou no fundo do ciclo e distorcem os dois métodos. Não cobre FIIs (use P/VP e rendimento), não avalia gestão, setor, risco político ou preço de commodities. Os dados vêm da brapi e podem ter atraso ou erro: confira nos RI das empresas antes de decidir. Triagem quantitativa e educativa; não é recomendação personalizada de investimento.</p></div></details>`;

function controls() {
  const all = universe();
  return `<div class="panel" style="margin-bottom:14px"><div class="row spread wrap" style="gap:12px"><div class="row wrap" style="gap:8px"><span class="muted">Margem de segurança</span><div class="chips">${[0.15, 0.25, 0.35].map(m => `<button class="chip ${S.mos === m ? 'on' : ''}" data-act="val-mos" data-v="${m}">${m * 100}%</button>`).join('')}</div></div>
    <form class="row" id="val-add" style="gap:6px"><input class="input" id="val-t" placeholder="Adicionar ticker (ex.: WEGE3)" maxlength="7" style="width:200px" autocomplete="off"><button class="btn btn-secondary btn-sm" type="submit"><i class="ph ph-plus"></i> Adicionar</button></form></div>
    <div class="hchips" style="margin-top:10px"><span class="muted" style="font-size:12px">Lista (${all.length}): Top 10 recomendadas + suas ações${S.custom.length ? ' + adicionadas:' : ''}</span>${S.custom.map(t => `<span class="hchip big">${esc(t)}<button class="x" data-act="val-del" data-t="${esc(t)}" aria-label="Remover ${esc(t)}">×</button></span>`).join('')}</div></div>`;
}

function bodyHtml() {
  const rs = rows(), errs = Object.entries(S.errors);
  const noTok = !brapiToken() && !edgeOn();
  return `${noTok ? '<div class="notice" style="margin-bottom:14px"><i class="ph ph-info"></i><span>A função de cotações (Supabase) não está ativa: sem ela e sem token da brapi só dá para analisar PETR4, VALE3, ITUB4 e MGLU3. Veja o passo a passo no README (Edge Function "mercado").</span></div>' : ''}
  ${S.loading ? `<div class="notice" style="margin-bottom:14px"><i class="ph ph-arrows-clockwise spin"></i><span>Buscando fundamentos… ${S.prog[0]} de ${S.prog[1]}</span></div>` : ''}
  ${errs.length ? `<div class="notice warn" style="margin-bottom:14px"><i class="ph ph-warning"></i><span>Sem dados para: ${errs.map(([t, e]) => `${esc(t)} (${esc(e)})`).join(', ')}.</span></div>` : ''}
  ${rs.length ? triage(rs) + table(rs) : (S.loading ? '' : '<div class="panel"><div class="empty"><p>Sem dados ainda. Clique em atualizar.</p></div></div>')}${method()}
  <div class="hint" style="margin-top:10px">Triagem quantitativa com dados públicos (Yahoo Finance/brapi). Não considera seu perfil, objetivo ou tributação e não é recomendação de investimento.</div>`;
}

function paint() {
  const el = document.getElementById('val-body'); if (!el) return;
  el.innerHTML = bodyHtml();
  const c = document.getElementById('val-ctl'); if (c) c.innerHTML = controls();
}

async function run(force = false) {
  if (S.loading) return;
  S.loading = true; S.errors = {}; paint();
  try {
    const { data, errors } = await loadFundamentals(universe(), { token: brapiToken(), force, onProgress: (a, b) => { S.prog = [a, b]; const m = document.querySelector('#val-body .notice .ph-arrows-clockwise')?.nextElementSibling; if (m) m.textContent = `Buscando fundamentos… ${a} de ${b}`; } });
    S.raw = { ...S.raw, ...data }; S.errors = errors; S.at = Date.now();
  } finally { S.loading = false; paint(); const st = document.getElementById('val-stamp'); if (st) st.textContent = 'Atualizado às ' + new Date(S.at).toLocaleTimeString('pt-BR'); }
}

export const teto = {
  title: 'Preço-teto',
  render(c) {
    lastC = c;
    return `${head('Preço-teto e fundo', 'Bazin · Graham · qualidade · margem de segurança', `<button class="stamp" data-act="val-refresh"><i class="ph ph-arrows-clockwise"></i> <span id="val-stamp">${S.at ? 'Atualizado às ' + new Date(S.at).toLocaleTimeString('pt-BR') : 'Analisar'}</span></button>`)}<div id="val-ctl">${controls()}</div><div id="val-body">${bodyHtml()}</div>`;
  },
  onMount(el, c) {
    lastC = c;
    el.querySelector('#val-ctl')?.addEventListener('submit', e => {
      e.preventDefault(); const t = (e.target.querySelector('#val-t')?.value || '').trim().toUpperCase();
      if (!/^[A-Z]{4}\d{1,2}$/.test(t)) return;
      if (!S.custom.includes(t)) { S.custom = [...S.custom, t].slice(-20); wr(WL, S.custom); }
      run(false);
    });
    if (!S.at && !S.loading) run(false); else if (S.at && Date.now() - S.at > 12 * 3600 * 1000 && !S.loading) run(false);
  },
  actions: {
    'val-mos': el => { S.mos = +el.dataset.v; wr(MOS, S.mos); paint(); },
    'val-refresh': () => { run(true); },
    'val-del': el => { S.custom = S.custom.filter(t => t !== el.dataset.t); wr(WL, S.custom); paint(); },
  },
};
