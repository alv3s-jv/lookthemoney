// Telas do módulo Investimentos.
import { store } from './store.js';
import { app, memberName, getCtx, refreshAll, ensureSnapshots } from './app.js';
import {
  money, smoney, pct, pctPlain, num, qtyFmt, gain, gainMoney, gainPct, col, arrow, kpi, tag, progress, empty, donut, perfChart, stackedBars, lotChart, icon, esc,
  openModal, toast, confirmDialog, options, field, formData, errBox, ui, countUp, sparkline, goalBar, confetti,
} from './ui.js';
import {
  CLASSES, CLASS_ORDER, position, perfSeries, perfMonthly, monthlyReturns, monthlyGrid, monthlyPatrimony, pctOfCdi, extraOverCdi, dividendsLast12m, yieldOnCost, rebalance, splitWithinClass, fixedIncomeValue, netDividend,
} from './calc.js';
import { UP, DN, WARN, INDEXERS, APORTE_CAT } from './meta.js';
import { buyForm, dividendForm, assetForm, targetsForm, deleteInvestTx } from './forms-inv.js';
import { head } from './views-fin.js';
import { agendaFor, AGENDA_DATE, AGENDA_STALE_DAYS, staleDays as agendaStale } from './agenda.js';
import {
  fmtDate, fmtDM, ymShort, MONTHS_SHORT, addMonthsISO, addMonthsYM, sum, groupBy, nf, parseNum, todayISO, uid, round2, daysBetween, addDays,
} from './util.js';

const CLS_COLOR = { ACAO_BR: 'var(--c-acao)', FII: 'var(--c-fii)', ETF: 'var(--c-etf)', EUA_BDR: 'var(--c-eua)', RENDA_FIXA: 'var(--c-rf)', CRIPTO: 'var(--c-cripto)' };
const hhmm = ts => new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** Selo "Atualizado às HH:MM ↻" — clique força refresh. */
export function stamp(c) {
  const q = c.quotes;
  if (q.loading) return `<button class="stamp" disabled><i class="ph ph-arrows-clockwise spin"></i> Atualizando cotações…</button>`;
  const when = q.updatedAt ? hhmm(q.updatedAt) : '—';
  if (q.offline) return `<button class="stamp off" data-act="refresh" title="${esc(q.errors.join(' · '))}"><i class="ph ph-cloud-slash"></i> cotação de ${when} — offline ↻</button>`;
  if (!q.fetchedAt) return `<button class="stamp" data-act="refresh"><i class="ph ph-arrows-clockwise"></i> Atualizar cotações</button>`;
  return `<button class="stamp" data-act="refresh" title="${q.errors.length ? esc(q.errors.join(' · ')) : 'Clique para atualizar agora'}"><i class="ph ph-arrows-clockwise"></i> Atualizado às ${when} ↻${q.errors.length ? ' <i class="ph ph-warning warn"></i>' : ''}</button>`;
}
const invHead = (c, title, sub = '', extra = '') => head(title, sub, `${stamp(c)}${extra}<button class="btn btn-primary" data-act="buy"><i class="ph ph-plus"></i> Registrar compra</button>`);
const sk = (c, html) => (c.quotes.loading && !c.quotes.fetchedAt ? '<span class="sk"></span>' : html);

const noAssets = (c, title) => `${invHead(c, title)}<div class="panel"><div class="empty big"><i class="ph ph-chart-line-up" aria-hidden="true"></i><p><b style="color:var(--color-text);font-size:17px">Sua carteira está vazia</b><br>Registre a primeira compra e o app calcula patrimônio, preço médio, desempenho vs CDI, proventos e rebalanceamento.${app.cloud ? ' A carteira é compartilhada: a outra pessoa vê e edita os mesmos ativos.' : ''}</p><div class="onb"><div class="st"><b><span class="n">1</span>Registre compras</b><span>Ações, FIIs, ETFs, BDR/EUA, renda fixa e cripto, com data, quantidade, preço e taxas.</span></div><div class="st"><b><span class="n">2</span>Defina a alocação-alvo</b><span>Em Alocação, informe o % por classe. O simulador diz onde aportar sem vender nada.</span></div><div class="st"><b><span class="n">3</span>Lance os proventos</b><span>Dividendos, JCP (com IR 15%) e rendimentos entram no retorno total e no yield.</span></div></div><div class="row wrap" style="justify-content:center;margin-top:14px"><button class="btn btn-primary" data-act="buy"><i class="ph ph-plus"></i> Registrar compra</button>${app.cloud ? '' : '<button class="btn btn-secondary" data-act="load-demo">Carregar dados de exemplo</button>'}</div></div></div>`;
const warnQuotes = (c) => { const p = c.portfolio; return p.withoutQuote.length ? `<div class="notice warn" style="margin-bottom:14px"><i class="ph ph-warning"></i><span>Sem cotação para <b>${p.withoutQuote.map(esc).join(', ')}</b> — valorizados pelo custo. Verifique o ticker, o token da brapi em Configurações ou informe um preço manual no ativo.</span></div>` : ''; };

// ---- período / desempenho ----
const PERIODS = { '6M': 6, '12M': 12, '24M': 24, Tudo: 0 };
function perfData(c) {
  const snaps = c.snaps; if (snaps.length < 2) return null;
  const n = PERIODS[app.period], from = n ? addMonthsYM(c.todayYM, -(n - 1)) : null;
  const pts = perfMonthly(snaps, c.cdi, from); // mensal: um ponto por fim de mês
  if (pts.length < 2) return null;
  const last = pts[pts.length - 1], d0 = pts[0].date;
  const s0 = snaps.find(s => s.date === d0);
  const flows = c.flows.filter(f => f.date > d0);
  const hyp = (s0?.value || 0) * c.cdi.factor(d0, c.today) + sum(flows, f => f.amount * c.cdi.factor(f.date, c.today));
  return { pts, port: last.port, cdi: last.cdi, pctCdi: pctOfCdi(last.port, last.cdi), extra: c.portfolio.total - hyp, d0, est: pts.some(p => p.est) };
}

/** Quadro mensal (Jan–Dez) no estilo do Investidor10: carteira e CDI por mês, retorno do ano e acumulado. */
function gridPanel(c, mr, todayYM) {
  const G = monthlyGrid(mr);
  if (!G.length) return '';
  const cell = (m, cur) => (m ? `<td class="r num ${m.port > 0.00005 ? 'up' : m.port < -0.00005 ? 'dn' : ''}" ${cur ? 'title="mês em andamento"' : ''}>${nf(m.port * 100, 2)}%${cur ? '*' : ''}</td>` : '<td class="r muted">-</td>');
  const cdiCell = m => (m ? `<td class="r num muted">${nf(m.cdi * 100, 2)}%</td>` : '<td class="r muted">-</td>');
  const head = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const rows = G.map(g => `<tr><td><b>${g.year}</b><div class="sub-s">Carteira</div></td>${g.months.map((m, i) => cell(m, `${g.year}-${String(i + 1).padStart(2, '0')}` === todayYM)).join('')}<td class="r num ${g.port >= 0 ? 'up' : 'dn'}"><b>${nf(g.port * 100, 2)}%</b></td><td class="r num ${g.accPort >= 0 ? 'up' : 'dn'}"><b>${nf(g.accPort * 100, 2)}%</b></td></tr>
    <tr><td><div class="sub-s">CDI</div></td>${g.months.map(cdiCell).join('')}<td class="r num muted">${nf(g.cdi * 100, 2)}%</td><td class="r num muted">${nf(g.accCdi * 100, 2)}%</td></tr>`).join('');
  return `<div class="panel" style="margin-bottom:12px"><div class="panel-h"><h3>Rentabilidade por mês</h3><span class="sub">TWR: aportes e resgates não contam como rendimento · * mês em andamento</span></div><div class="tw"><table class="table"><thead><tr><th>Ano</th>${head.map(h => `<th class="r">${h}</th>`).join('')}<th class="r">Retorno anual</th><th class="r">Acumulado</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}

/** Conferência em R$ (independe do histórico diário): se divergir do TWR em sinal, o histórico estimado está distorcido. */
function confer(c, pd) {
  const P = c.portfolio, inv = sum(c.flows, f => f.amount), gain = P.total - inv, ret = gain + P.prov;
  const bad = (gain > 1 && pd.port < -0.02) || (gain < -1 && pd.port > 0.02) || pd.port < -0.95;
  return `<div class="panel" style="margin-bottom:12px"><div class="panel-h"><h3>Quanto você realmente ganhou</h3><span class="sub">em reais, direto dos seus aportes e do valor de hoje</span></div>
    <div class="grid g-kpi">${kpi({ label: 'Aportado (líquido)', value: money(inv, 0) })}${kpi({ label: 'Patrimônio hoje', value: money(P.total, 0) })}${kpi({ label: 'Ganho de capital', value: gainMoney(gain, 0), hint: inv > 0 ? pct(gain / inv, 2) + ' sobre o aportado' : '' })}${kpi({ label: 'Proventos recebidos', value: money(P.prov, 0), hint: `retorno total ${gainMoney(ret, 0)}` })}</div>
    ${bad ? '<div class="notice warn" style="margin-top:10px"><i class="ph ph-warning"></i><span>O gráfico (TWR) contradiz o ganho em R$ acima — o histórico diário está distorcido. Clique em <b>Recalcular histórico</b>; se persistir, me avise.</span></div>' : ''}
    <details class="how"><summary>Como é calculado</summary><div class="hint" style="margin-top:6px">O ganho em reais soma tudo o que você colocou e o que vale hoje. A rentabilidade (cotização, ou TWR) remove o efeito dos aportes para comparar com o CDI — por isso um aporte grande recente não "melhora" nem "piora" o percentual.</div></details></div>`;
}

const periodChips = () => `<div class="chips">${Object.keys(PERIODS).map(p => `<button class="chip ${app.period === p ? 'on' : ''}" data-act="period" data-v="${p}">${p}</button>`).join('')}</div>`;


// =============================================================================================== Resumo: herói, insights e metas
const MILESTONES = [10000, 15000, 20000, 25000, 30000, 40000, 50000, 75000, 100000, 150000, 200000, 500000, 1000000];
const goalOf = (k, d) => +store.setting(k, d) || d;

function heroCard(c, pd) {
  const P = c.portfolio, ret = P.valorizacao + P.prov, trend = perfSeries(c.snaps, c.cdi, addDays(c.today, -30)).map(x => 1 + x.port), upDay = P.dayValue >= 0;
  const periodTxt = app.period === 'Tudo' ? 'desde o início' : `em ${app.period}`;
  const msg = pd
    ? `Sua carteira rende <b>${pd.pctCdi == null ? '—' : nf(pd.pctCdi, 0) + '% do CDI'}</b> ${periodTxt} (${pct(pd.port, 1)} contra ${pct(pd.cdi, 1)}). ${ret >= 0 ? `Até agora você ganhou <b>${money(ret, 0)}</b> somando valorização e proventos.` : `Hoje o saldo está <b>${money(Math.abs(ret), 0)}</b> abaixo do investido, contando proventos.`}`
    : 'O histórico se forma a partir do primeiro aporte e se completa a cada dia em que o app é aberto.';
  const stat = (label, v, sub) => `<div class="hero-stat"><span>${label}</span><b class="num">${v}</b>${sub ? `<small class="num">${sub}</small>` : ''}</div>`;
  return `<div class="hero-card">
    <div><div class="hero-l"><i class="ph ph-sparkle"></i> Patrimônio investido</div>
      <div class="hero-v num">${sk(c, countUp(P.total, { d: 2, key: 'hero-total' }))}</div>
      <div class="hero-day ${upDay ? 'up' : 'dn'}">${sk(c, `${gainMoney(P.dayValue)} · ${pct(P.dayPct, 2)} hoje`)}</div>
      <div class="hero-msg">${msg}</div></div>
    <div class="hero-r">${trend.length > 2 && !ui.hidden ? sparkline(trend) : ''}${trend.length > 2 && !ui.hidden ? `<div class="hero-cap"><span>rentabilidade dos últimos 30 dias (sem aportes)</span><span>${pct(trend[trend.length - 1] / (trend[0] || 1) - 1, 1)}</span></div>` : ''}</div>
    <div class="hero-stats">
      ${stat('Total investido', money(P.cost), '')}
      ${stat('Valorização', sk(c, gainMoney(P.valorizacao, 0)), sk(c, gainPct(P.cost ? P.valorizacao / P.cost : 0)))}
      ${stat('Proventos recebidos', money(P.prov, 0), `${pct(P.cost ? P.prov / P.cost : 0, 1).replace('+', '')} sobre o custo`)}
      ${stat('Retorno total', sk(c, gainMoney(ret, 0)), sk(c, gainPct(P.cost ? ret / P.cost : 0)))}
    </div></div>`;
}

/** Avisos acionáveis: o app avisa em vez de só mostrar. */
function insights(c, pd) {
  const P = c.portfolio, today = c.today, out = [], tick = id => c.assets.find(a => a.id === id)?.ticker || '';
  for (const d of c.dividends) {
    const dd = daysBetween(today, d.payDate);
    if (dd >= 0 && dd <= 7) out.push({ p: 1, tone: 'up', ic: 'ph-coins', to: 'inv/proventos', text: `<b>${esc(tick(d.assetId))}</b> paga <b>${money(d.amount)}</b> ${dd === 0 ? 'hoje' : dd === 1 ? 'amanhã' : `em ${dd} dias (${fmtDM(d.payDate)})`}` });
    else if (dd < 0 && dd >= -5) out.push({ p: 2, tone: 'up', ic: 'ph-check-circle', to: 'inv/proventos', text: `Provento creditado: <b>${money(d.amount)}</b> de <b>${esc(tick(d.assetId))}</b> (${fmtDM(d.payDate)})` });
  }
  const tsum = sum(Object.values(c.targets));
  if (tsum > 0 && P.total > 0) {
    const diffs = CLASS_ORDER.map(k => ({ k, d: (P.byClass[k].weight - (c.targets[k] || 0) / 100) * 100 })).filter(x => Math.abs(x.d) > c.tolerance).sort((a, b) => a.d - b.d);
    const under = diffs[0], over = diffs[diffs.length - 1];
    if (under && under.d < 0) out.push({ p: 3, tone: 'warn', ic: 'ph-scales', to: 'inv/alocacao', text: `<b>${CLASSES[under.k]}</b> está ${nf(Math.abs(under.d), 1)} p.p. abaixo da meta — bom lugar para o próximo aporte` });
    if (over && over.d > 0 && over !== under) out.push({ p: 4, tone: 'info', ic: 'ph-scales', to: 'inv/alocacao', text: `<b>${CLASSES[over.k]}</b> passou ${nf(over.d, 1)} p.p. da meta` });
  }
  const mv = [...P.active].filter(h => h.dayPct != null && isFinite(h.dayPct)).sort((a, b) => Math.abs(b.dayPct) - Math.abs(a.dayPct))[0];
  if (mv && Math.abs(mv.dayPct) >= 0.02) out.push({ p: 5, tone: mv.dayPct > 0 ? 'up' : 'dn', ic: mv.dayPct > 0 ? 'ph-trend-up' : 'ph-trend-down', to: 'inv/posicoes', text: `<b>${esc(mv.asset.ticker)}</b> ${mv.dayPct > 0 ? 'sobe' : 'cai'} ${nf(Math.abs(mv.dayPct) * 100, 1)}% hoje` });
  if (pd && pd.pctCdi != null) out.push(pd.pctCdi >= 100 ? { p: 6, tone: 'up', ic: 'ph-trophy', to: 'inv/desempenho', text: `Você está <b>acima do CDI</b> (${nf(pd.pctCdi, 0)}%)` } : { p: 6, tone: 'warn', ic: 'ph-flag', to: 'inv/desempenho', text: `Rendendo <b>${nf(pd.pctCdi, 0)}% do CDI</b> — veja o que puxa o resultado` });
  const next = MILESTONES.find(m => m > P.total);
  if (next && P.total > 0) out.push({ p: 7, tone: 'info', ic: 'ph-flag-banner', to: 'inv/resumo', text: `Próximo marco: <b>${money(next, 0)}</b> — faltam ${money(next - P.total, 0)}` });
  out.sort((a, b) => a.p - b.p);
  return out.length ? `<div class="insights" role="list">${out.slice(0, 6).map(i => `<button class="insight ${i.tone}" role="listitem" data-act="nav" data-to="${i.to}"><i class="ph ${i.ic}"></i><span>${i.text}</span></button>`).join('')}</div>` : '';
}

function goalsPanel(c) {
  const P = c.portfolio, gP = goalOf('goalPatrimonio', 50000), gD = goalOf('goalProv', 500);
  const first = c.investTx.reduce((m, t) => (t.date < m ? t.date : m), c.today);
  const months = Math.max(1, Math.min(12, (+c.today.slice(0, 4) - +first.slice(0, 4)) * 12 + (+c.today.slice(5, 7) - +first.slice(5, 7)) + 1));
  const rec = sum(c.dividends.filter(d => d.payDate <= c.today && d.payDate >= addMonthsISO(c.today, -12)), d => +d.amount);
  const avg = rec / months;
  return `<div class="panel" style="margin-bottom:12px"><div class="panel-h"><h3>Suas metas</h3><button class="btn btn-secondary btn-sm" data-act="edit-goals"><i class="ph ph-pencil-simple"></i> Ajustar</button></div>
    ${goalBar({ label: 'Patrimônio investido', cur: P.total, target: gP, fmt: v => money(v, 0), icon: 'ph-mountains', color: 'linear-gradient(90deg, var(--color-accent-600), var(--c-eua))' })}
    ${goalBar({ label: 'Proventos por mês (média)', cur: avg, target: gD, fmt: v => money(v, 0), icon: 'ph-coins', color: 'linear-gradient(90deg, var(--c-etf), var(--up))' })}
    <div class="hint" style="margin-top:10px">A média de proventos divide o recebido nos últimos 12 meses pelos meses desde o primeiro aporte (no máximo 12).</div></div>`;
}

function editGoals() {
  openModal({
    title: 'Ajustar metas', body: `<div class="form-grid">${field('Patrimônio investido (R$)', `<input class="input num-in" name="gp" inputmode="decimal" value="${nf(goalOf('goalPatrimonio', 50000), 0)}">`)}${field('Proventos por mês (R$)', `<input class="input num-in" name="gd" inputmode="decimal" value="${nf(goalOf('goalProv', 500), 0)}">`)}</div>`,
    actions: '<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>Salvar</button>',
    onMount: api => api.q('[data-ok]').addEventListener('click', async () => {
      const d = formData(api.el), gp = parseNum(d.gp), gd = parseNum(d.gd);
      if (!(gp > 0) || !(gd > 0)) return toast('Use valores maiores que zero', { kind: 'error' });
      await store.setSetting('goalPatrimonio', gp); await store.setSetting('goalProv', gd); api.close(); toast('Metas atualizadas', { kind: 'ok' });
    }),
  });
}

/** Comemora cada novo marco de patrimônio uma única vez. */
function celebrate(c) {
  const P = c.portfolio; if (!(P.total > 0) || c.quotes.loading || !c.quotes.fetchedAt || P.withoutQuote.length) return;
  const reached = [...MILESTONES].reverse().find(m => m <= P.total); if (!reached) return;
  let saved = 0; try { saved = +localStorage.getItem('ltm.milestone') || 0; } catch { /* ok */ }
  if (reached <= saved) return;
  try { localStorage.setItem('ltm.milestone', String(reached)); } catch { /* ok */ }
  confetti(); toast(`Novo marco: ${money(reached, 0)} investidos!`, { kind: 'ok', ms: 5000 });
}

// =============================================================================================== Resumo
export const resumo = {
  title: 'Resumo',
  render(c) {
    const P = c.portfolio; if (!c.assets.length) return noAssets(c, 'Minha carteira');
    const pd = perfData(c);
    const slices = CLASS_ORDER.map(k => ({ label: CLASSES[k], value: P.byClass[k].value, color: CLS_COLOR[k], k })).filter(s => s.value > 0);
    const movers = [...P.active].filter(h => h.dayValue).sort((a, b) => Math.abs(b.dayValue) - Math.abs(a.dayValue)).slice(0, 4);
    const ret = P.valorizacao + P.prov;
    return `${invHead(c, 'Minha carteira', `${P.active.length} ativos · ${c.assets.filter(a => a.assetClass === 'RENDA_FIXA').length ? 'renda fixa na curva' : ''}`)}
    ${warnQuotes(c)}
    ${insights(c, pd)}
    ${heroCard(c, pd)}
    <div class="panel" style="margin-bottom:12px"><div class="panel-h"><div><h3>Desempenho vs CDI</h3><div class="sub">Seu retorno frente ao CDI, mês a mês — aportes não contam como ganho</div></div>${periodChips()}</div>
      ${pd ? `<div class="row wrap" style="gap:28px;margin-bottom:10px"><div><div class="kpi-l">Carteira</div><div class="kpi-v num" style="font-size:20px;color:var(--color-accent-300)">${pct(pd.port, 1)}</div></div><div><div class="kpi-l">CDI</div><div class="kpi-v num" style="font-size:20px">${pct(pd.cdi, 1)}</div></div><div><div class="kpi-l">% do CDI</div><div class="kpi-v num" style="font-size:20px">${pd.pctCdi == null ? '—' : nf(pd.pctCdi, 0) + '%'}</div></div><div><div class="kpi-l">R$ a mais que o CDI</div><div class="kpi-v num" style="font-size:20px">${gainMoney(pd.extra, 0)}</div></div></div>${perfChart(pd.pts)}<div class="legend" style="margin-top:8px"><span><i class="sw" style="background:var(--color-accent)"></i>Carteira</span><span><i class="sw" style="background:var(--color-neutral-400)"></i>CDI (tracejado)</span>${pd.est ? '<span class="muted">· parte do histórico é estimada</span>' : ''}</div>` : empty(c.cdi.empty ? 'Sem dados do CDI (BCB). Verifique a conexão e clique em atualizar.' : 'O histórico se forma a partir do primeiro aporte e se completa a cada dia em que o app é aberto.')}</div>
    ${goalsPanel(c)}
    <div class="grid g-2e"><div class="panel"><div class="panel-h"><h3>Alocação por classe</h3><a href="#/inv/alocacao" class="sub">metas</a></div><div class="row wrap" style="gap:20px">${donut(slices, { center: `<span class="kpi-l">Total</span><b class="num" style="font-size:15px">${money(P.total, 0)}</b>` })}<div class="grow" style="min-width:180px">${slices.map(s => `<div class="row spread" style="font-size:13px;padding:4px 0"><span><i class="hi-dot" style="background:${s.color}"></i>${s.label}</span><span class="num">${pctPlain(s.value / P.total, 1)} <span class="muted">${money(s.value, 0)}</span></span></div>`).join('')}</div></div></div>
      <div class="panel"><div class="panel-h"><h3>Maiores movimentos hoje</h3></div>${movers.length ? `<div class="list">${movers.map(h => `<div class="li clk" data-act="open-asset" data-t="${esc(h.asset.ticker)}" style="cursor:pointer"><div class="li-t"><b class="tick">${esc(h.asset.ticker)}</b><span>${esc(h.asset.name)}</span></div><div class="li-v num">${gainPct(h.dayPct, 2)}<br><span class="sub-s">${gainMoney(h.dayValue, 0)}</span></div></div>`).join('')}</div>` : empty('Sem variação para mostrar (mercado fechado ou sem cotações). Mostra o último pregão quando disponível.', '', 'ph-moon-stars')}</div></div>`;
  },
  actions: { 'edit-goals': () => editGoals() },
  onMount(el, c) { celebrate(c); },
};

// =============================================================================================== Desempenho
export const desempenho = {
  title: 'Desempenho',
  render(c) {
    if (!c.assets.length) return noAssets(c, 'Desempenho');
    const pd = perfData(c);
    const mr = monthlyReturns(c.snaps, c.cdi).slice(-24).reverse();
    const maxAbs = Math.max(0.01, ...mr.flatMap(m => [Math.abs(m.port), Math.abs(m.cdi)]));
    const estN = c.snaps.filter(s => s.est).length;
    return `${invHead(c, 'Desempenho', 'Quanto sua carteira rende frente ao CDI — aportes e resgates não contam como rendimento', `<button class="btn btn-secondary" data-act="rebuild"><i class="ph ph-clock-counter-clockwise"></i> Recalcular histórico</button>`)}
    ${pd ? `<div class="grid g-kpi">${kpi({ label: 'Carteira', value: pct(pd.port, 2), hint: `desde ${fmtDate(pd.d0)}` })}${kpi({ label: 'CDI', value: pct(pd.cdi, 2) })}${kpi({ label: '% do CDI', value: pd.pctCdi == null ? '—' : nf(pd.pctCdi, 0) + '%', sub: pd.pctCdi == null ? '' : pd.pctCdi >= 100 ? gain(1, 'acima do CDI') : gain(-1, 'abaixo do CDI') })}${kpi({ label: 'R$ a mais que o CDI', value: gainMoney(pd.extra, 0), hint: pd.est ? 'ponderado por dinheiro · histórico estimado' : 'vs. cada aporte rendendo 100% do CDI' })}</div>` : ''}
    ${pd ? confer(c, pd) : ''}
    ${gridPanel(c, monthlyReturns(c.snaps, c.cdi), c.todayYM)}
    <div class="panel" style="margin-bottom:12px"><div class="panel-h"><h3>Rentabilidade acumulada</h3>${periodChips()}</div>${pd ? perfChart(pd.pts) : empty('Ainda não há histórico suficiente.')}${estN ? `<div class="hint" style="margin-top:8px">${estN} dia(s) do histórico são estimados (sem cotação histórica disponível, o valor é carregado do dia anterior). Eles se corrigem sozinhos conforme o app é aberto diariamente.</div>` : ''}</div>
    <div class="panel"><div class="panel-h"><h3>Rentabilidade mês a mês</h3><span class="sub">a barra mostra a carteira; o traço claro, o CDI do mesmo mês</span></div>
      ${mr.length ? `<div class="tw"><table class="table"><thead><tr><th>Mês</th><th class="r">Carteira</th><th class="r">CDI</th><th class="r">% do CDI</th><th style="width:34%">Carteira vs CDI</th></tr></thead><tbody>${mr.map(m => `<tr><td>${ymShort(m.ym)}</td><td class="r num">${gainPct(m.port, 2)}</td><td class="r num">${pct(m.cdi, 2)}</td><td class="r num">${m.pctCdi == null ? '—' : nf(m.pctCdi, 0) + '%'}</td><td><div style="position:relative;height:10px;background:var(--color-neutral-800);border-radius:99px"><div style="position:absolute;left:0;top:0;bottom:0;width:${Math.max(1, Math.abs(m.port) / maxAbs * 100)}%;background:${m.port >= 0 ? 'var(--color-accent)' : DN};border-radius:99px"></div><div style="position:absolute;top:-3px;bottom:-3px;left:${Math.abs(m.cdi) / maxAbs * 100}%;width:2px;background:var(--color-text)"></div></div></td></tr>`).join('')}</tbody></table></div>` : empty('Sem meses fechados ainda.')}</div>`;
  },
  actions: { rebuild: async () => { await ensureSnapshots({ rebuildEst: true, rebuildAll: true }); toast('Histórico recalculado', { kind: 'ok' }); } },
};

// =============================================================================================== Posições
const POS = { q: '', cls: 'Todos', sort: 'class', dir: 1, collapsed: {}, metric: 'valor' };
const sortKey = { ativo: h => h.asset.ticker, qtd: h => h.pos.qty, pm: h => h.pos.pm, cot: h => h.price ?? 0, hoje: h => h.dayPct, val: h => h.res, valp: h => h.resPct, prov: h => h.prov, saldo: h => h.value, peso: h => h.weight };
export const posicoes = {
  title: 'Posições',
  render(c) {
    if (!c.assets.length) return noAssets(c, 'Posições');
    const P = c.portfolio, q = POS.q.trim().toLowerCase();
    let list = P.active.filter(h => (POS.cls === 'Todos' || h.asset.assetClass === POS.cls) && (!q || h.asset.ticker.toLowerCase().includes(q) || h.asset.name.toLowerCase().includes(q)));
    const th = (k, l, r = true) => `<th class="sortable ${r ? 'r' : ''}" data-act="sort" data-k="${k}">${l}${POS.sort === k ? `<span class="car">${POS.dir > 0 ? '▲' : '▼'}</span>` : ''}</th>`;
    const row = h => {
      const rf = h.asset.assetClass === 'RENDA_FIXA';
      return `<tr class="clk" data-act="open-asset" data-t="${esc(h.asset.ticker)}"><td><span class="tick">${esc(h.asset.ticker)}</span><div class="sub-s">${esc(h.asset.name)}</div></td><td class="r num">${rf ? '—' : qtyFmt(h.pos.qty)}</td><td class="r num">${rf ? '—' : money(h.pos.pm)}</td><td class="r num">${rf ? '<span class="muted">na curva</span>' : h.price == null ? '<span class="muted">sem cotação</span>' : (h.asset.currency === 'USD' ? 'US$ ' + nf(h.price) : money(h.price)) + (h.stale ? ' <i class="ph ph-clock-countdown warn" title="cotação desatualizada"></i>' : '') + (h.source === 'manual' ? ' <i class="ph ph-hand-pointing muted" title="preço manual"></i>' : '')}</td><td class="r num">${rf || h.price == null ? '—' : gainPct(h.dayPct, 2)}</td><td class="r num">${gainMoney(h.res, 0)}<div class="sub-s">${pct(h.resPct, 1)}</div></td><td class="r num">${money(h.prov, 0)}</td><td class="r num"><b>${money(h.value)}</b></td><td class="r num">${pctPlain(h.weight, 1)}</td></tr>`;
    };
    let body = '';
    if (POS.sort === 'class') {
      for (const k of CLASS_ORDER) {
        const items = list.filter(h => h.asset.assetClass === k); if (!items.length) continue;
        const v = sum(items, h => h.value), cst = sum(items, h => h.cost), col2 = POS.collapsed[k];
        body += `<tr class="grp" data-act="toggle-grp" data-k="${k}"><td colspan="5"><i class="ph ph-caret-${col2 ? 'right' : 'down'}"></i> ${CLASSES[k]} <span class="muted">· ${items.length}</span></td><td class="r num">${gainMoney(v - cst, 0)}</td><td class="r num">${money(sum(items, h => h.prov), 0)}</td><td class="r num">${money(v)}</td><td class="r num">${pctPlain(v / P.total, 1)}</td></tr>`;
        if (!col2) body += items.sort((a, b) => b.value - a.value).map(row).join('');
      }
    } else { const f = sortKey[POS.sort]; list = [...list].sort((a, b) => { const x = f(a), y = f(b); return (typeof x === 'string' ? x.localeCompare(y) : x - y) * POS.dir; }); body = list.map(row).join(''); }
    const metric = h => POS.metric === 'valor' ? money(h.value, 0) : POS.metric === 'peso' ? pctPlain(h.weight, 1) : (h.asset.assetClass === 'RENDA_FIXA' ? '—' : gainPct(h.dayPct, 2));
    return `${invHead(c, 'Posições', `${P.active.length} ativos · ${money(P.total, 0)}`)}
    ${warnQuotes(c)}
    <div class="toolbar"><div class="search"><i class="ph ph-magnifying-glass"></i><input class="input" data-keep="pq" data-f="q" placeholder="Buscar ticker ou nome" value="${esc(POS.q)}" aria-label="Buscar ativo"></div><div class="chips">${['Todos', ...CLASS_ORDER].map(k => `<button class="chip ${POS.cls === k ? 'on' : ''}" data-act="cls" data-k="${k}">${k === 'Todos' ? 'Todos' : CLASSES[k]}</button>`).join('')}</div></div>
    <div class="panel only-d"><div class="tw"><table class="table"><thead><tr>${th('ativo', 'Ativo', false)}${th('qtd', 'Qtd')}${th('pm', 'Preço médio')}${th('cot', 'Cotação')}${th('hoje', 'Hoje')}${th('val', 'Valorização')}${th('prov', 'Proventos')}${th('saldo', 'Saldo')}${th('peso', 'Peso')}</tr></thead><tbody>${body || '<tr><td colspan="9">' + empty('Nenhum ativo com esses filtros.') + '</td></tr>'}</tbody></table></div><div class="hint" style="margin-top:8px">Clique em uma linha para ver lotes e detalhes. <i class="ph ph-hand-pointing"></i> = preço manual · <i class="ph ph-clock-countdown"></i> = cotação desatualizada.</div></div>
    <div class="only-m"><div class="chips" style="margin-bottom:10px">${[['valor', 'Valor'], ['peso', '% total'], ['hoje', 'Hoje']].map(([k, l]) => `<button class="chip ${POS.metric === k ? 'on' : ''}" data-act="metric" data-k="${k}">${l}</button>`).join('')}</div><div class="panel"><div class="list">${list.length ? [...list].sort((a, b) => b.value - a.value).map(h => `<div class="li clk" data-act="open-asset" data-t="${esc(h.asset.ticker)}" style="cursor:pointer;min-height:48px"><div class="li-t"><b class="tick">${esc(h.asset.ticker)}</b><span class="num">${h.asset.assetClass === 'RENDA_FIXA' ? 'na curva' : `${qtyFmt(h.pos.qty)} · PM ${money(h.pos.pm)}`}</span></div><div class="li-v num"><b>${metric(h)}</b><div class="sub-s">${gainPct(h.resPct, 1)}</div></div></div>`).join('') : empty('Nenhum ativo com esses filtros.')}</div></div></div>`;
  },
  onInput(e) { if (e.target.dataset.f === 'q') { POS.q = e.target.value; return true; } },
  actions: {
    cls: el => { POS.cls = el.dataset.k; return true; },
    sort: el => { const k = el.dataset.k; if (POS.sort === k) { if (POS.dir > 0) POS.dir = -1; else { POS.sort = 'class'; POS.dir = 1; } } else { POS.sort = k; POS.dir = k === 'ativo' ? 1 : -1; } return true; },
    'toggle-grp': el => { POS.collapsed[el.dataset.k] = !POS.collapsed[el.dataset.k]; return true; },
    metric: el => { POS.metric = el.dataset.k; return true; },
  },
};

// =============================================================================================== Detalhe do ativo
export const ativo = {
  title: 'Ativo',
  render(c, ticker) {
    const h = c.portfolio.holdings.find(x => x.asset.ticker.toLowerCase() === decodeURIComponent(ticker || '').toLowerCase());
    if (!h) return `${invHead(c, 'Ativo não encontrado')}<div class="panel">${empty('Este ativo não existe mais.', '<a class="btn btn-secondary btn-sm" href="#/inv/posicoes">Voltar às posições</a>')}</div>`;
    const a = h.asset, rf = a.assetClass === 'RENDA_FIXA', usd = a.currency === 'USD';
    const txs = [...h.txs].sort((x, y) => x.date.localeCompare(y.date) || (x.type === 'COMPRA' ? -1 : 1));
    const lots = txs.filter(t => t.type === 'COMPRA').map(t => ({ date: t.date, price: +t.price * (usd ? +t.fx || 1 : 1), qty: +t.quantity }));
    const divs = c.dividends.filter(d => d.assetId === a.id).sort((x, y) => y.payDate.localeCompare(x.payDate));
    const pmAt = id => { const i = txs.findIndex(t => t.id === id); return position(txs.slice(0, i).map(t => usd ? { ...t, price: t.price * (+t.fx || 1) } : t)).pm; };
    let n = 0;
    const lotRows = [...txs].reverse().map(t => {
      const idx = t.type === 'COMPRA' ? txs.filter(x => x.type === 'COMPRA').indexOf(t) + 1 : null;
      const fx = usd ? +t.fx || 1 : 1;
      let res = null;
      if (t.type === 'COMPRA') {
        if (rf) res = fixedIncomeValue(+t.quantity * +t.price, t.date, c.today, a.fixedIncome || { indexer: 'CDI', rate: 100 }, c.cdi, c.ipca) - +t.quantity * +t.price - (+t.fees || 0);
        else if (h.price != null) res = +t.quantity * (h.price * h.fx - +t.price * fx) - (+t.fees || 0);
      } else res = (+t.price * fx - pmAt(t.id)) * +t.quantity - (+t.fees || 0);
      return `<tr><td>${fmtDate(t.date)}</td><td>${t.type === 'COMPRA' ? `<span class="tag tag-accent">L${idx}</span> compra` : '<span class="tag tag-neutral">venda</span>'}${t.createdBy && app.cloud && t.createdBy !== app.user?.id && memberName(t.createdBy) ? `<div class="sub-s">por ${esc(memberName(t.createdBy))}</div>` : ''}</td><td class="r num">${qtyFmt(t.quantity)}${rf ? '' : ''}</td><td class="r num">${rf ? '—' : (usd ? 'US$ ' + nf(t.price) : money(t.price))}</td><td class="r num">${money(t.fees || 0)}</td><td class="r num">${res == null ? '—' : gainMoney(res, 2)}</td><td class="r"><button class="iconbtn" data-act="edit-lot" data-id="${t.id}" aria-label="Editar"><i class="ph ph-pencil-simple"></i></button><button class="iconbtn del" data-act="del-lot" data-id="${t.id}" aria-label="Excluir"><i class="ph ph-trash"></i></button></td></tr>`;
    }).join('');
    const fi = a.fixedIncome;
    return `${invHead(c, `<a href="#/inv/posicoes" class="iconbtn" style="vertical-align:middle;margin-right:4px" aria-label="Voltar"><i class="ph ph-arrow-left"></i></a>${esc(a.ticker)}`, `${esc(a.name)} · ${CLASSES[a.assetClass]}${fi ? ` · ${INDEXERS[fi.indexer]} ${nf(fi.rate, 1)}${fi.maturity ? ' · vence ' + fmtDate(fi.maturity) : ''}` : ''}`, `<button class="btn btn-secondary" data-act="edit-asset" data-id="${a.id}"><i class="ph ph-pencil-simple"></i> Editar ativo</button><button class="btn btn-secondary" data-act="sell" data-t="${esc(a.ticker)}">Vender</button>`)}
    ${rf ? '' : `<div class="row wrap" style="margin-bottom:14px;gap:16px"><b class="num" style="font-size:22px">${h.price == null ? 'sem cotação' : usd ? 'US$ ' + nf(h.price) : money(h.price)}</b>${h.price == null ? '' : gainPct(h.dayPct, 2)}<span class="muted">${h.source === 'manual' ? 'preço manual' : h.source || ''}${h.stale ? ' · desatualizada' : ''}</span></div>`}
    <div class="grid g-kpi">${kpi({ label: rf ? 'Principal aplicado' : 'Quantidade', value: rf ? money(h.pos.qty) : qtyFmt(h.pos.qty) })}${rf ? '' : kpi({ label: 'Preço médio', value: money(h.pos.pm) })}${kpi({ label: 'Custo', value: money(h.pos.cost) })}${kpi({ label: rf ? 'Valor na curva' : 'Valor atual', value: money(h.value), sub: gainPct(h.resPct, 1) })}</div>
    <div class="grid g-2">
      <div class="stack">${rf ? '' : `<div class="panel"><div class="panel-h"><h3>Compras vs preço médio</h3><span class="sub">linha tracejada = PM · linha sólida = preço atual</span></div>${lotChart(lots, h.pos.pm, h.price == null ? null : h.price * h.fx)}</div>`}
        <div class="panel"><div class="panel-h"><h3>Lotes e operações</h3><button class="btn btn-secondary btn-sm" data-act="buy-asset" data-t="${esc(a.ticker)}"><i class="ph ph-plus"></i> ${rf ? 'Novo aporte' : 'Comprar mais'}</button></div><div class="tw"><table class="table"><thead><tr><th>Data</th><th>Operação</th><th class="r">${rf ? 'Valor (R$)' : 'Qtd'}</th><th class="r">Preço</th><th class="r">Taxas</th><th class="r">Resultado</th><th></th></tr></thead><tbody>${lotRows}</tbody></table></div>${txs.some(t => t.type === 'VENDA') ? '<div class="hint">Resultado das compras = valor atual do lote − custo (não considera vendas parciais). Resultado das vendas = realizado sobre o PM da época.</div>' : ''}</div></div>
      <div class="stack"><div class="panel"><div class="panel-h"><h3>Resultado</h3></div><div class="list">
        <div class="li"><div class="li-t"><b>Valorização</b></div><div class="li-v num">${gainMoney(h.res)}</div></div>
        <div class="li"><div class="li-t"><b>Proventos recebidos</b></div><div class="li-v num">${gainMoney(h.prov)}</div></div>
        ${h.pos.realized ? `<div class="li"><div class="li-t"><b>Resultado realizado (vendas)</b></div><div class="li-v num">${gainMoney(h.pos.realized)}</div></div>` : ''}
        <div class="li"><div class="li-t"><b>Retorno total</b><span>valorização + proventos${h.pos.realized ? ' + realizado' : ''}</span></div><div class="li-v num"><b>${gainMoney(h.res + h.prov + h.pos.realized)}</b></div></div></div></div>
        ${rf ? '' : `<div class="panel"><div class="panel-h"><h3>Proventos do ativo</h3><button class="btn btn-secondary btn-sm" data-act="new-div" data-id="${a.id}"><i class="ph ph-plus"></i> Provento</button></div>${divs.length ? `<div class="list">${divs.slice(0, 8).map(d => `<div class="li" ${d.auto ? '' : `data-act="edit-div" data-id="${d.id}" style="cursor:pointer"`}><div class="li-t"><b>${fmtDate(d.payDate)}${d.payDate > c.today ? ' <span class="tag tag-outline">a receber</span>' : ''}${d.auto ? ' <span class="tag tag-neutral">auto</span>' : ''}</b><span>${{ DIVIDENDO: 'Dividendo', JCP: 'JCP (líquido)', RENDIMENTO: 'Rendimento' }[d.type]} · ${nf(d.perShare, 4)} × ${qtyFmt(d.quantity)}</span></div><div class="li-v num">${money(d.amount)}</div></div>`).join('')}</div>` : empty('Nenhum provento lançado.')}</div>`}</div></div>`;
  },
  actions: {
    'edit-lot': el => buyForm({ tx: store.find('investTx', el.dataset.id) }),
    'del-lot': el => deleteInvestTx(store.find('investTx', el.dataset.id)),
    'edit-asset': el => assetForm(store.find('assets', el.dataset.id)),
    'buy-asset': el => buyForm({ ticker: el.dataset.t }),
    sell: el => buyForm({ ticker: el.dataset.t, type: 'VENDA' }),
    'new-div': el => dividendForm(null, el.dataset.id),
    'edit-div': el => { const d = store.find('dividends', el.dataset.id); if (d) dividendForm(d); },
  },
};

// =============================================================================================== Proventos
const PV = { asset: '' };
let AG = [];
function agendaPanel(c) {
  AG = agendaFor(c.assets, c.investTx || store.get('investTx'), c.dividends, c.today);
  const held = new Set(c.assets.filter(a => a.assetClass !== 'RENDA_FIXA').map(a => a.ticker.toUpperCase()));
  const noInfo = [...(c.portfolio?.active || [])].filter(h => h.asset.assetClass !== 'RENDA_FIXA' && !AG.some(x => x.t === h.asset.ticker.toUpperCase())).map(h => h.asset.ticker);
  const up = AG.filter(x => !x.paid), paid = AG.filter(x => x.paid);
  const sumNet = l => l.reduce((s, x) => s + x.net, 0);
  const row = (x, i) => `<tr><td><b>${esc(x.t)}</b><div class="sub-s">${esc(x.note)}</div></td><td>${x.type === 'JCP' ? 'JCP' : 'Dividendo'}</td><td class="r num">${nf(x.ps, 4)}</td><td class="r num">${qtyFmt(x.qty)}</td><td class="r num">${money(x.gross)}</td><td class="r num"><b>${money(x.net)}</b></td><td class="r">${fmtDate(x.com)}</td><td class="r"><b>${fmtDate(x.pay)}</b></td><td class="r"><span class="pill ${x.paid ? 'up' : ''}">${x.paid ? 'creditado' : 'a receber'}</span></td></tr>`;
  const tbl = (l) => `<div class="tw"><table class="table"><thead><tr><th>Ativo</th><th>Tipo</th><th class="r">R$/ação (bruto)</th><th class="r">Ações na data com</th><th class="r">Bruto</th><th class="r">Líquido</th><th class="r">Data com</th><th class="r">Pagamento</th><th></th></tr></thead><tbody>${l.map(x => row(x, AG.indexOf(x))).join('')}</tbody></table></div>`;
  const old = agendaStale() > AGENDA_STALE_DAYS;
  return `<div class="panel" style="margin-bottom:12px"><div class="panel-h"><h3>Calendário de proventos anunciados</h3><span class="sub">${up.length ? `${money(sumNet(up), 2)} líquidos a receber` : 'nada anunciado para suas ações'}</span></div>
    ${old ? `<div class="notice warn" style="margin-bottom:10px"><i class="ph ph-warning"></i><span>Agenda de ${fmtDate(AGENDA_DATE)} — pode estar desatualizada; novos anúncios saem com os resultados trimestrais.</span></div>` : ''}
    ${up.length ? tbl(up) : '<div class="empty"><p>Nenhum provento anunciado e ainda não pago para os papéis que você tem.</p></div>'}
    ${paid.length ? `<div class="hint" style="margin:12px 0 6px"><b>Já pagos e creditados automaticamente</b> (${money(sumNet(paid), 2)} líquidos):</div>${tbl(paid)}` : ''}
    ${noInfo.length ? `<div class="hint" style="margin-top:10px">Sem anúncio vigente na agenda para: <b>${noInfo.map(esc).join(', ')}</b>. Isso não significa que não pagarão: ações costumam declarar após os balanços trimestrais (fim de outubro/novembro e fevereiro/março), e FIIs pagam rendimento mensal.</div>` : ''}
    <div class="hint" style="margin-top:8px">Valores anunciados pelas empresas (fontes: imprensa financeira); a quantidade usa sua posição na data com (comprou até a data com = tem direito). Líquido desconta 15% de IR sobre JCP. Datas podem mudar.</div></div>`;
}

// =============================================================================================== Patrimônio
/** Barras mensais: base = valor aplicado; retorno total (ganho de capital + proventos) sobe em verde ou, se negativo, aparece em vermelho. */
function patrChart(rows) {
  const H = 230, max = Math.max(1, ...rows.map(r => Math.max(r.aplicado, r.total)));
  const px = v => Math.max(0, v / max * H);
  const cols = rows.map(r => {
    const base = Math.min(r.aplicado, r.total), up = Math.max(0, r.total - r.aplicado), dn = Math.max(0, r.aplicado - r.total);
    const tip = `${ymShort(r.ym)}${r.partial ? ' (parcial)' : ''} · aplicado ${money(r.aplicado, 0)} · ganho de capital ${money(r.gain, 0)} · proventos ${money(r.prov, 0)} · patrimônio ${money(r.total, 0)}`;
    return `<div class="pt-col" title="${esc(tip)}"><div class="pt-val num">${nf(r.total / 1000, 1)}k</div><div class="pt-bar" style="height:${H}px"><i class="pt-seg" style="height:${px(base)}px;background:var(--color-accent)"></i>${up ? `<i class="pt-seg" style="height:${px(up)}px;background:var(--up)"></i>` : ''}${dn ? `<i class="pt-seg" style="height:${px(dn)}px;background:var(--dn);opacity:.85"></i>` : ''}</div><div class="pt-lbl">${ymShort(r.ym)}${r.partial ? '*' : ''}</div></div>`;
  }).join('');
  return `<div class="pt-wrap"><div class="pt-chart">${cols}</div><div class="legend" style="margin-top:8px"><span><i class="sw" style="background:var(--color-accent)"></i>Valor aplicado</span><span><i class="sw" style="background:var(--up)"></i>Retorno total (ganho + proventos)</span><span><i class="sw" style="background:var(--dn)"></i>Retorno negativo</span></div></div>`;
}

export const patrimonio = {
  title: 'Patrimônio',
  render(c) {
    if (!c.assets.length) return noAssets(c, 'Patrimônio');
    const rows = monthlyPatrimony(c.snaps, c.flows, c.dividends.filter(d => d.payDate <= c.today), c.today);
    if (!rows.length) return `${invHead(c, 'Patrimônio')}<div class="panel">${empty('Sem histórico ainda.')}</div>`;
    const L = rows[rows.length - 1], P = c.portfolio, ret = L.ret, pctRet = L.aplicado > 0 ? ret / L.aplicado : 0;
    const tbl = [...rows].reverse().map((r, i, a) => { const prev = a[i + 1]; const d = prev ? r.total - prev.total - (r.aplicado - prev.aplicado) : r.ret; return `<tr><td>${ymShort(r.ym)}${r.partial ? ' <span class="tag tag-outline">parcial</span>' : ''}${r.est ? ' <span class="tag tag-neutral" title="valor do mês parcialmente estimado">est.</span>' : ''}</td><td class="r num">${money(r.aplicado, 0)}</td><td class="r num">${gainMoney(r.gain, 0)}</td><td class="r num">${money(r.prov, 2)}</td><td class="r num">${gainMoney(r.ret, 0)}</td><td class="r num"><b>${money(r.total, 0)}</b></td><td class="r num">${gainMoney(d, 0)}</td></tr>`; }).join('');
    return `${invHead(c, 'Patrimônio', 'Valor aplicado + retorno total (ganho de capital + proventos), mês a mês')}
    <div class="grid g-kpi">${kpi({ label: 'Patrimônio total', value: money(L.total, 0), hint: 'aplicado + retorno total' })}${kpi({ label: 'Valor aplicado', value: money(L.aplicado, 0) })}${kpi({ label: 'Retorno total', value: gainMoney(ret, 0), sub: pct(pctRet, 2), hint: `ganho de capital ${gainMoney(L.gain, 0)} · proventos ${money(L.prov, 2)}` })}${kpi({ label: 'Hoje no mercado', value: money(P.total, 0), hint: 'só ativos, sem proventos' })}</div>
    <div class="panel" style="margin-bottom:12px"><div class="panel-h"><h3>Evolução do patrimônio</h3><span class="sub">fim de cada mês · * mês em andamento</span></div>${patrChart(rows)}</div>
    <div class="panel"><div class="panel-h"><h3>Mês a mês</h3></div><div class="tw"><table class="table"><thead><tr><th>Período</th><th class="r">Valor aplicado</th><th class="r">Ganho de capital</th><th class="r">Proventos</th><th class="r">Retorno total</th><th class="r">Patrimônio</th><th class="r">Resultado do mês</th></tr></thead><tbody>${tbl}</tbody></table></div>
    <div class="hint" style="margin-top:8px">Valor aplicado = aportes líquidos (compras − vendas). Ganho de capital = valor de mercado no fim do mês − valor aplicado. Proventos = recebidos até o fim do mês (automáticos + lançados). Resultado do mês = variação do patrimônio sem contar os aportes do mês.</div></div>`;
  },
};

export const proventos = {
  title: 'Proventos',
  render(c) {
    if (!c.assets.length) return noAssets(c, 'Proventos');
    const A = Object.fromEntries(c.assets.map(a => [a.id, a]));
    const all = c.dividends.filter(d => A[d.assetId]).sort((x, y) => y.payDate.localeCompare(x.payDate));
    const rec = all.filter(d => d.payDate <= c.today), fut = all.filter(d => d.payDate > c.today);
    const v12 = dividendsLast12m(rec, c.today), yoc = yieldOnCost(v12, c.portfolio.cost);
    const months = Array.from({ length: 12 }, (_, i) => addMonthsYM(c.todayYM, i - 11));
    const typeName = { DIVIDENDO: 'Dividendo', JCP: 'JCP', RENDIMENTO: 'Rendimento FII' };
    const cols = months.map(ym => ({ label: MONTHS_SHORT[+ym.slice(5) - 1], parts: Object.fromEntries(Object.keys(typeName).map(t => [typeName[t], sum(rec.filter(d => d.payDate.slice(0, 7) === ym && d.type === t), d => +d.amount)])) }));
    const colors = { Dividendo: 'var(--color-accent-300)', JCP: 'var(--color-accent-600)', 'Rendimento FII': 'var(--color-accent)' };
    const list = rec.filter(d => !PV.asset || d.assetId === PV.asset);
    return `${invHead(c, 'Proventos', 'Dividendos, JCP e rendimentos de FIIs', `<button class="btn btn-secondary" data-act="new-div"><i class="ph ph-plus"></i> Lançar provento</button>`)}
    ${agendaPanel(c)}
    <div class="grid g-kpi">${kpi({ label: 'Últimos 12 meses', value: money(v12, 0) })}${kpi({ label: 'Média mensal', value: money(v12 / 12, 0) })}${kpi({ label: 'Yield on cost', value: pctPlain(yoc, 1), hint: '12 meses ÷ custo atual da carteira' })}${kpi({ label: 'A receber', value: money(sum(fut, d => +d.amount), 0), sub: `${fut.length} lançamento${fut.length === 1 ? '' : 's'}` })}</div>
    <div class="panel" style="margin-bottom:12px"><div class="panel-h"><h3>Proventos por mês</h3><div class="legend">${Object.entries(colors).map(([k, v]) => `<span><i class="sw" style="background:${v}"></i>${k}</span>`).join('')}</div></div>${stackedBars(cols, colors)}</div>
    <div class="panel"><div class="panel-h"><h3>Extrato de proventos</h3><select class="input sm" data-f="passet" style="width:auto" aria-label="Filtrar ativo"><option value="">Todos os ativos</option>${options(c.assets.filter(a => a.assetClass !== 'RENDA_FIXA').map(a => [a.id, a.ticker]), PV.asset)}</select></div>
      ${list.length || fut.length ? `<div class="tw"><table class="table"><thead><tr><th>Pagamento</th><th>Ativo</th><th>Tipo</th><th class="r">Por cota</th><th class="r">Cotas</th><th class="r">Recebido</th><th></th></tr></thead><tbody>${[...fut.filter(d => !PV.asset || d.assetId === PV.asset).reverse(), ...list].map(d => `<tr class="clk" data-act="edit-div" data-id="${d.id}"><td>${fmtDate(d.payDate)}${d.payDate > c.today ? ' <span class="tag tag-outline">a receber</span>' : ''}${d.auto ? ` <span class="tag tag-neutral" title="Creditado automaticamente pela sua posição na data com">${d.est ? 'auto · data estimada' : 'automático'}</span>` : ''}</td><td><span class="tick">${esc(A[d.assetId].ticker)}</span></td><td>${typeName[d.type]}</td><td class="r num">${nf(d.perShare, 4)}</td><td class="r num">${qtyFmt(d.quantity)}</td><td class="r num">${money(d.amount)}</td><td class="r">${d.auto ? '' : `<button class="iconbtn" data-act="edit-div" data-id="${d.id}" aria-label="Editar"><i class="ph ph-pencil-simple"></i></button>`}</td></tr>`).join('')}</tbody></table></div><div class="hint" style="margin-top:8px">Proventos são creditados automaticamente pela sua posição na data com (comprou até a data com = tem direito); entram no patrimônio e no desempenho na data de pagamento. JCP aparece líquido (IR 15%). “Data estimada” = pagamento ainda não confirmado na agenda. Para corrigir um automático, lance o real manualmente (o manual prevalece).</div>` : empty('Nenhum provento lançado ainda.', `<button class="btn btn-primary btn-sm" data-act="new-div">Lançar provento</button>`)}</div>`;
  },
  onChange(e) { if (e.target.dataset.f === 'passet') { PV.asset = e.target.value; return true; } },
  actions: { 'edit-div': el => { const d = store.find('dividends', el.dataset.id); if (d) dividendForm(d); } },
};

// =============================================================================================== Alocação
const AL = { aporte: null };
export const alocacao = {
  title: 'Alocação',
  render(c) {
    if (!c.assets.length) return noAssets(c, 'Alocação');
    const P = c.portfolio, tol = c.tolerance, tsum = sum(Object.values(c.targets));
    const planned = c.plans[APORTE_CAT] || 0;
    const done = sum(c.txs.filter(t => t.kind === 'aporte' && t.date.slice(0, 7) === c.todayYM && t.date <= c.today), t => Math.abs(t.amount));
    const def = Math.max(0, planned - done) || 1000;
    const aporte = AL.aporte ?? def;
    const rows = CLASS_ORDER.map(k => { const cur = P.byClass[k].weight, tgt = (c.targets[k] || 0) / 100, d = cur - tgt; return { k, value: P.byClass[k].value, cur, tgt, d, to: tgt * P.total - P.byClass[k].value }; });
    const sugg = tsum > 0 ? rebalance(Object.fromEntries(CLASS_ORDER.map(k => [k, P.byClass[k].value])), c.targets, aporte) : {};
    const lines = [];
    for (const k of CLASS_ORDER) {
      const amt = sugg[k] || 0; if (amt < 0.5) continue;
      const items = P.byClass[k].items.filter(h => h.pos.qty > 0);
      const split = items.length ? splitWithinClass(items.map(h => ({ ticker: h.asset.ticker, value: h.value })), amt) : {};
      if (!items.length) lines.push({ k, ticker: null, amt, qty: null });
      for (const h of items) { const a = split[h.asset.ticker] || 0; if (a < 0.5) continue; const rf = k === 'RENDA_FIXA'; const price = h.price ? h.price * h.fx : null; const qty = rf ? a : price ? (k === 'CRIPTO' ? Math.floor(a / price * 1e6) / 1e6 : Math.floor(a / price)) : null; if (qty === 0) continue; lines.push({ k, ticker: h.asset.ticker, amt: qty != null && !rf ? qty * price : a, qty, rf, price, assetId: h.asset.id }); }
    }
    const status = r => (Math.abs(r.d) * 100 <= tol ? ['Na meta', 'tag-neutral'] : r.d > 0 ? ['Acima', 'tag-outline'] : ['Abaixo', 'tag-accent']);
    return `${invHead(c, 'Alocação vs meta', `tolerância de ±${nf(tol, 0)} p.p.`, `<button class="btn btn-secondary" data-act="targets"><i class="ph ph-sliders"></i> Editar metas</button>`)}
    ${Math.abs(tsum - 100) > 0.01 ? `<div class="notice warn" style="margin-bottom:14px"><i class="ph ph-warning"></i><span>${tsum === 0 ? 'Defina suas metas de alocação para ver desvios e sugestões de aporte.' : `As metas somam ${nf(tsum, 1)}% — ajuste para 100%.`} <button class="btn btn-ghost btn-sm" data-act="targets">Definir metas</button></span></div>` : ''}
    <div class="grid g-2"><div class="panel"><div class="panel-h"><h3>Atual vs meta por classe</h3><span class="sub">barra = atual · traço = meta</span></div>
      ${rows.map(r => { const sc = 0.5; const [st, sc2] = status(r); return `<div style="margin-bottom:14px"><div class="row spread" style="font-size:13px;margin-bottom:6px"><span>${CLASSES[r.k]}</span><span class="num"><b>${pctPlain(r.cur, 0)}</b> <span class="muted">/ ${pctPlain(r.tgt, 0)}</span></span></div><div class="bullet"><div class="f" style="width:${Math.min(100, r.cur / sc * 100)}%;background:${Math.abs(r.d) * 100 <= tol ? 'var(--color-accent-500)' : r.d > 0 ? 'var(--color-accent-700)' : 'var(--color-accent)'}"></div><div class="t" style="left:${Math.min(100, r.tgt / sc * 100)}%"></div></div></div>`; }).join('')}</div>
      <div class="panel"><div class="panel-h"><h3>Simulador de aporte</h3></div>
        <div class="field"><label for="ap">Vou aportar (R$)</label><input class="input num-in" id="ap" data-f="aporte" data-keep="ap" inputmode="decimal" value="${nf(aporte)}"></div>
        <div class="hint" style="margin:6px 0 12px">${planned ? `Orçamento do mês: ${money(planned, 0)} · aportado ${money(done, 0)} · falta ${money(Math.max(0, planned - done), 0)}.` : 'Defina a meta de aporte mensal no Orçamento.'} A sugestão corrige o desvio sem vender nada.</div>
        ${lines.length ? `<div class="list">${lines.map(l => `<div class="li"><div class="li-t"><b>${l.ticker ? `<span class="tick">${esc(l.ticker)}</span>` : CLASSES[l.k]}</b><span>${l.ticker ? CLASSES[l.k] : 'sem ativo na classe — registre uma compra'}${l.qty != null && !l.rf ? ` · ${qtyFmt(l.qty)} × ${money(l.price)}` : ''}</span></div><div class="li-v num"><b>${money(l.amt)}</b></div></div>`).join('')}</div><div class="row spread" style="margin-top:10px"><span class="muted">Total sugerido</span><b class="num">${money(sum(lines, l => l.amt))}</b></div><button class="btn btn-primary btn-block" data-act="apply-sugg"><i class="ph ph-check"></i> Registrar como compras</button><div class="hint" style="margin-top:6px">Usa a cotação atual; cotas inteiras (cripto e renda fixa em valor). Você revisa antes de salvar.</div>` : '<div class="muted">Informe um valor e defina metas para ver a sugestão.</div>'}</div></div>
    <div class="panel" style="margin-top:12px"><div class="panel-h"><h3>Distância da meta por classe</h3><span class="sub">tolerância de ±${nf(tol, 0)} p.p.</span></div><div class="tw"><table class="table"><thead><tr><th>Classe</th><th class="r">Valor</th><th class="r">Atual</th><th class="r">Meta</th><th class="r">Desvio</th><th class="r">Para chegar na meta</th><th>Situação</th></tr></thead><tbody>${rows.map(r => { const [st, sc2] = status(r); return `<tr><td>${CLASSES[r.k]}</td><td class="r num">${money(r.value, 0)}</td><td class="r num">${pctPlain(r.cur, 1)}</td><td class="r num">${pctPlain(r.tgt, 1)}</td><td class="r num" style="color:${Math.abs(r.d) * 100 <= tol ? 'inherit' : r.d > 0 ? DN : WARN}">${r.d >= 0 ? '▲' : '▼'} ${nf(Math.abs(r.d) * 100, 1)} p.p.</td><td class="r num">${Math.abs(r.d) * 100 <= tol ? '—' : (r.to > 0 ? 'comprar ' : 'reduzir ') + money(Math.abs(r.to), 0)}</td><td>${tag(st, sc2)}</td></tr>`; }).join('')}</tbody></table></div></div>`;
  },
  onInput(e) { if (e.target.dataset.f === 'aporte') { AL.aporte = Math.max(0, parseNum(e.target.value) || 0); return true; } },
  actions: {
    targets: () => targetsForm(),
    'apply-sugg': () => applySuggestions(),
  },
};

function applySuggestions() {
  const c = getCtx(), P = c.portfolio, tsum = sum(Object.values(c.targets));
  const aporte = AL.aporte ?? 0;
  const sugg = rebalance(Object.fromEntries(CLASS_ORDER.map(k => [k, P.byClass[k].value])), c.targets, aporte);
  const buys = [];
  for (const k of CLASS_ORDER) {
    const amt = sugg[k] || 0; if (amt < 0.5) continue;
    const items = P.byClass[k].items.filter(h => h.pos.qty > 0); if (!items.length) continue;
    const split = splitWithinClass(items.map(h => ({ ticker: h.asset.ticker, value: h.value })), amt);
    for (const h of items) {
      const a = split[h.asset.ticker] || 0; if (a < 0.5) continue;
      if (k === 'RENDA_FIXA') buys.push({ asset: h.asset, quantity: round2(a), price: 1, total: round2(a) });
      else if (h.price) { const price = h.price, q = k === 'CRIPTO' ? Math.floor(a / price * 1e6) / 1e6 : Math.floor(a / price); if (q > 0) buys.push({ asset: h.asset, quantity: q, price, total: round2(q * price * h.fx), fx: h.asset.currency === 'USD' ? h.fx : undefined }); }
    }
  }
  if (!buys.length) { toast('Nada a registrar com este valor (cotas inteiras não cabem no aporte).', { kind: 'error' }); return; }
  const lastAcc = store.setting('lastInvestAccount', c.accounts[0]?.id || '');
  openModal({
    title: 'Registrar compras sugeridas',
    body: `<div class="list">${buys.map(b => `<div class="li"><div class="li-t"><b class="tick">${esc(b.asset.ticker)}</b><span>${b.asset.assetClass === 'RENDA_FIXA' ? 'aporte' : `${qtyFmt(b.quantity)} × ${money(b.price)}`}</span></div><div class="li-v num">${money(b.total)}</div></div>`).join('')}</div>
      <div class="row spread"><b>Total</b><b class="num">${money(sum(buys, b => b.total))}</b></div>
      ${field('Debitar da conta', `<select class="input" name="acc"><option value="">— não lançar nas Finanças —</option>${options(c.accounts.map(a => [a.id, a.name]), lastAcc)}</select>`)}
      ${field('Data', `<input class="input" type="date" name="date" value="${todayISO()}" max="${todayISO()}">`)}
      <div class="hint">Os preços usados são as cotações atuais; ajuste depois nas operações se o preço executado for diferente.</div>`,
    actions: '<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>Confirmar</button>',
    onMount: api => api.q('[data-ok]').addEventListener('click', async () => {
      const d = formData(api.el); const now = new Date().toISOString();
      for (const b of buys) {
        const id = uid();
        await store.put('investTx', { id, assetId: b.asset.id, type: 'COMPRA', date: d.date, quantity: b.quantity, price: b.price, fees: 0, fx: b.fx, accountId: d.acc || null, createdAt: now });
        if (d.acc) await store.put('transactions', { id: uid(), date: d.date, description: `Aporte · ${b.asset.ticker}`, category: APORTE_CAT, kind: 'aporte', amount: -b.total, accountId: d.acc, cardId: null, recurrence: 'none', investTxId: id, createdAt: now });
      }
      if (d.acc) store.setSetting('lastInvestAccount', d.acc);
      toast(`${buys.length} compras registradas`, { kind: 'ok' }); api.close(); AL.aporte = null;
      ensureSnapshots({ rebuildEst: true, rebuildAll: true }).catch(() => {});
    }),
  });
}
