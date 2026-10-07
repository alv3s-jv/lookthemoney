// Tela "Mercado": painel estilo homebroker com dados do dia (ao vivo), mapa de calor, rankings e análise automática.
import { app, brapiToken } from './app.js';
import { edgeOn } from './feed.js';
import { esc, qtyFmt } from './ui.js';
import { nf } from './util.js';
import { head } from './views-fin.js';
import { NAMES } from './reco.js';
import { HOUSES, CONSENSUS, RECO_DATE, RECO_STALE_DAYS, topN, staleDays } from './reco.js';
import { fmtDate } from './util.js';
import { marketState, refreshMarket, analyze, sessionStatus, rangePos } from './market.js';

const REFRESH_MS = 90 * 1000;
const mkt = { tab: 'stocks' };
let busy = false, lastC = null, timer = null, prev = new Map(), next = new Map();

const pc = (v, d = 2) => (v >= 0 ? '+' : '−') + nf(Math.abs(v), d) + '%';
const cls = v => (v > 0.005 ? 'up' : v < -0.005 ? 'dn' : '');
const arrow = v => (v > 0.005 ? '▲' : v < -0.005 ? '▼' : '•');
const hms = ts => new Date(ts).toLocaleTimeString('pt-BR');

/** Valor com "flash" verde/vermelho quando muda entre atualizações. */
function live(key, price, html) {
  next.set(key, price);
  const was = prev.get(key);
  const f = was != null && price != null && was !== price ? (price > was ? ' fl-up' : ' fl-dn') : '';
  return `<span class="lv${f}">${html}</span>`;
}

const chgPill = v => (v == null ? '<span class="muted">—</span>' : `<span class="pill ${cls(v)}">${arrow(v)} ${pc(v)}</span>`);

function card(label, key, value, chg, extra = '', sub = '') {
  return `<div class="kpi mk-card"><div class="kpi-l">${label}</div><div class="kpi-v num">${value == null ? '<span class="sk"></span>' : live(key, value.raw, value.html)}</div><div class="kpi-s">${chg == null ? '' : chgPill(chg)}${sub ? ` <span class="muted">${sub}</span>` : ''}</div>${extra}</div>`;
}
const rangeBar = (v, lo, hi) => (lo && hi ? `<div class="rng" title="Faixa do dia: ${nf(lo, 4)} – ${nf(hi, 4)}"><i style="left:${(rangePos(v, lo, hi) * 100).toFixed(1)}%"></i></div><div class="rng-l"><span>${nf(lo, hi > 100 ? 0 : 4)}</span><span>${nf(hi, hi > 100 ? 0 : 4)}</span></div>` : '');

function cards(d) {
  const fx = d?.fx || {}, m = d?.macro, ib = d?.ibov;
  const bova = (d?.lists?.funds || []).find(s => s.t === 'BOVA11');
  const out = [];
  if (ib) out.push(card('Ibovespa', 'ibov', { raw: ib.price, html: nf(ib.price, 0) }, ib.chg, rangeBar(ib.price, ib.low, ib.high), 'pontos'));
  else if (bova) out.push(card('Ibovespa · via BOVA11', 'bova', { raw: bova.price, html: 'R$ ' + nf(bova.price) }, bova.chg, '', 'ETF de referência'));
  else out.push(card('Ibovespa', 'ibov', null, null));
  out.push(card('Dólar', 'usd', fx.usd && { raw: fx.usd.price, html: 'R$ ' + nf(fx.usd.price, 4) }, fx.usd?.chg, fx.usd ? rangeBar(fx.usd.price, fx.usd.low, fx.usd.high) : ''));
  out.push(card('Euro', 'eur', fx.eur && { raw: fx.eur.price, html: 'R$ ' + nf(fx.eur.price, 4) }, fx.eur?.chg, fx.eur ? rangeBar(fx.eur.price, fx.eur.low, fx.eur.high) : ''));
  out.push(card('Bitcoin', 'btc', fx.btc && { raw: fx.btc.price, html: 'R$ ' + nf(fx.btc.price, 0) }, fx.btc?.chg, fx.btc ? rangeBar(fx.btc.price, fx.btc.low, fx.btc.high) : ''));
  out.push(card('Selic meta', 'selic', m?.selic != null ? { raw: m.selic, html: nf(m.selic) + '% a.a.' } : null, null, '', m?.cdi != null ? `CDI ${nf(m.cdi)}% a.a.` : ''));
  out.push(card('IPCA 12 meses', 'ipca', m?.ipca12 != null ? { raw: m.ipca12, html: nf(m.ipca12) + '%' } : null, null, '', m?.ipcaM != null ? `mês: ${nf(m.ipcaM)}%` : ''));
  return `<div class="grid g-kpi mk-cards">${out.join('')}</div>`;
}

function tape(d) {
  const it = [];
  const add = (k, label, price, chg, fmt) => { if (price != null) it.push(`<span class="tp"><b>${esc(label)}</b> <span class="num">${fmt(price)}</span> <span class="${cls(chg ?? 0)}">${chg == null ? '' : arrow(chg) + ' ' + pc(chg)}</span></span>`); };
  if (d?.ibov) add('ibov', 'IBOV', d.ibov.price, d.ibov.chg, v => nf(v, 0));
  const fx = d?.fx || {};
  if (fx.usd) add('usd', 'USD/BRL', fx.usd.price, fx.usd.chg, v => nf(v, 4));
  if (fx.eur) add('eur', 'EUR/BRL', fx.eur.price, fx.eur.chg, v => nf(v, 4));
  if (fx.btc) add('btc', 'BTC', fx.btc.price, fx.btc.chg, v => nf(v, 0));
  for (const c of (d?.crypto || []).filter(c => c.sym !== 'BTC').slice(0, 3)) add(c.sym, c.sym, c.price, c.chg, v => nf(v, v >= 100 ? 0 : 2));
  for (const s of (d?.lists?.stocks || []).slice(0, 14)) add(s.t, s.t, s.price, s.chg, v => nf(v));
  if (!it.length) return '<div class="tape"><div class="tape-in"><span class="tp muted">Carregando cotações…</span></div></div>';
  const row = it.join('');
  return `<div class="tape" aria-label="Cotações em rolagem"><div class="tape-in">${row}${row}</div></div>`;
}

function heat(list) {
  const L = [...list].sort((a, b) => b.brl - a.brl).slice(0, 28);
  if (!L.length) return '<div class="empty"><p>Sem dados.</p></div>';
  return `<div class="heat">${L.map((s, i) => {
    const a = Math.min(1, Math.abs(s.chg) / 4);
    const tone = s.chg >= 0 ? 'var(--up)' : 'var(--dn)';
    return `<div class="tile ${i < 3 ? 'big' : ''} ${held(s.t) ? 'held' : ''}" style="--a:${(10 + a * 55).toFixed(0)}%;--c:${tone};--i:${i}" title="${esc(s.name || s.t)} · R$ ${nf(s.price)} · ${pc(s.chg)}" ${held(s.t) ? `data-act="open-asset" data-t="${esc(s.t)}"` : ''}><b>${esc(s.t)}</b><span class="num">${pc(s.chg, 2)}</span></div>`;
  }).join('')}</div>`;
}

const held = t => !!lastC?.portfolio?.active?.some(h => h.asset.ticker === t);

function rank(title, sub, rows, key) {
  const mx = Math.max(1, ...rows.map(r => Math.abs(r.chg)));
  return `<div class="panel"><div class="panel-h"><h3>${title}</h3><span class="sub">${sub}</span></div>${rows.length ? `<table class="table mk-t"><tbody>${rows.map(r => `<tr class="${held(r.t) ? 'clk' : ''}" ${held(r.t) ? `data-act="open-asset" data-t="${esc(r.t)}"` : ''}><td><b>${esc(r.t)}</b>${held(r.t) ? ' <span class="dot-held" title="Na sua carteira"></span>' : ''}<div class="sub-s">${esc((r.name || '').slice(0, 26))}</div></td><td class="r num">${live(key + r.t, r.price, 'R$ ' + nf(r.price))}</td><td class="r"><span class="pill ${cls(r.chg)}">${arrow(r.chg)} ${pc(r.chg)}</span><div class="mbar"><i class="${cls(r.chg)}" style="width:${Math.min(100, Math.abs(r.chg) / mx * 100).toFixed(0)}%"></i></div></td></tr>`).join('')}</tbody></table>` : '<div class="empty"><p>Sem dados no momento.</p></div>'}</div>`;
}

function rankings(d) {
  const all = mkt.tab === 'funds' ? d?.lists?.funds : d?.lists?.stocks;
  const min = mkt.tab === 'funds' ? 1e6 : 5e6;
  let U = (all || []).filter(s => s.brl >= min && s.price >= 1); if (U.length < 12) U = all || [];
  const alt = [...U].sort((a, b) => b.chg - a.chg).slice(0, 8);
  const bai = [...U].sort((a, b) => a.chg - b.chg).slice(0, 8);
  const vol = [...(all || [])].sort((a, b) => b.brl - a.brl).slice(0, 8);
  const volRows = vol.map(s => ({ ...s }));
  return `<div class="grid g-3 mk-rank">${rank('<i class="ph ph-trend-up up"></i> Maiores altas', `liquidez > R$ ${min / 1e6} mi · preço ≥ R$ 1`, alt, 'a')}${rank('<i class="ph ph-trend-down dn"></i> Maiores baixas', `liquidez > R$ ${min / 1e6} mi · preço ≥ R$ 1`, bai, 'b')}${rank('<i class="ph ph-fire"></i> Mais negociados', 'giro financeiro', volRows, 'v')}</div>`;
}

function cryptoPanel(d) {
  const L = d?.crypto || [];
  return `<div class="panel"><div class="panel-h"><h3>Criptomoedas</h3><span class="sub">top 10 por valor de mercado · 24 h</span></div>${L.length ? `<table class="table mk-t"><thead><tr><th>Ativo</th><th class="r">Preço</th><th class="r">24 h</th><th class="r">Valor de mercado</th></tr></thead><tbody>${L.map(c => `<tr><td><b>${esc(c.sym)}</b> <span class="muted">${esc(c.name)}</span></td><td class="r num">${live('c' + c.sym, c.price, 'R$ ' + nf(c.price, c.price >= 100 ? 0 : 2))}</td><td class="r"><span class="pill ${cls(c.chg ?? 0)}">${arrow(c.chg ?? 0)} ${pc(c.chg ?? 0)}</span></td><td class="r num muted">R$ ${nf((c.cap || 0) / 1e9, 0)} bi</td></tr>`).join('')}</tbody></table>` : '<div class="empty"><p>Sem dados no momento.</p></div>'}</div>`;
}

function analysisPanel(d) {
  const items = analyze(d, lastC?.portfolio);
  return `<div class="panel mk-an"><div class="panel-h"><h3>Análise do dia</h3><span class="sub">gerada automaticamente a partir dos dados acima</span></div>${items.length ? `<div class="an-list">${items.map((x, i) => `<div class="an ${x.tone}" style="--i:${i}"><i class="ph ${x.icon}"></i><div><b>${esc(x.title)}</b><p>${esc(x.text)}</p></div></div>`).join('')}</div>` : '<div class="empty"><p>Carregando dados do dia…</p></div>'}<div class="hint">Resumo descritivo de dados públicos, com atraso possível. Não é recomendação de investimento nem projeção.</div></div>`;
}

function myDay(c) {
  const P = c.portfolio;
  const all = (P?.active || []).filter(h => h.asset.assetClass === 'ACAO_BR').sort((a, b) => b.value - a.value);
  if (!all.length) return `<div class="panel"><div class="panel-h"><h3>Minha carteira hoje</h3></div><div class="empty"><p>${c.assets?.length ? 'Nenhuma ação BR na carteira.' : 'Registre uma compra para acompanhar aqui.'}</p></div></div>`;
  const tot = all.reduce((s, h) => s + h.value, 0), day = all.reduce((s, h) => s + (h.dayValue || 0), 0), cost = all.reduce((s, h) => s + h.cost, 0);
  const dp = tot - day > 0 ? day / (tot - day) : 0;
  const miss = all.filter(h => h.noQuote).length;
  const row = h => `<tr class="clk" data-act="open-asset" data-t="${esc(h.asset.ticker)}"><td><b>${esc(h.asset.ticker)}</b><div class="sub-s">${esc(h.asset.name && h.asset.name !== h.asset.ticker ? h.asset.name : '')} · ${qtyFmt(h.pos.qty)} un.</div></td><td class="r num">${h.price != null ? live('h' + h.asset.ticker, h.price, nf(h.price)) : '<span class="muted">sem cotação</span>'}<div class="sub-s">R$ ${nf(h.value)}</div></td><td class="r">${h.prevClose && h.price != null ? `<span class="pill ${cls(h.dayPct)}">${arrow(h.dayPct)} ${pc(h.dayPct * 100)}</span>` : '<span class="muted">—</span>'}<div class="sub-s ${h.res >= 0 ? 'up' : 'dn'}">${h.noQuote ? '' : pc(h.resPct * 100) + ' total'}</div></td></tr>`;
  return `<div class="panel"><div class="panel-h"><h3>Minhas ações BR (${all.length})</h3><span class="sub">Hoje ${day >= 0 ? '+' : '−'}R$ ${nf(Math.abs(day))} · ${pc(dp * 100)}</span></div>${miss ? `<div class="notice warn" style="margin:0 0 8px"><i class="ph ph-warning"></i><span>${miss} sem cotação: valorizadas pelo custo até a fonte de cotações responder.</span></div>` : ''}<table class="table mk-t"><tbody>${all.map(row).join('')}</tbody></table><div class="hint" style="margin-top:8px">Total: R$ ${nf(tot)} · resultado ${pc((cost > 0 ? (tot - cost) / cost : 0) * 100)}</div></div>`;
}

const houseChip = h => `<span class="hchip ${h.partial ? 'part' : ''}" title="${esc(h.short)}${h.w != null ? ' · ' + h.w + '%' : h.partial ? ' · aumento de posição (composição restrita)' : ''}">${esc(h.short)}</span>`;
const lookup = (d, t) => (d?.lists?.stocks || []).find(s => s.t === t) || (d?.lists?.funds || []).find(s => s.t === t) || null;

function recoSection(d) {
  const rows = topN();
  const old = staleDays() > RECO_STALE_DAYS;
  const maxN = Math.max(...rows.map(r => r.n));
  const tbl = rows.map(r => {
    const q = lookup(d, r.t), up = r.fair && q ? r.fair / q.price - 1 : null;
    return `<tr class="${held(r.t) ? 'clk' : ''}" ${held(r.t) ? `data-act="open-asset" data-t="${esc(r.t)}"` : ''}>
      <td class="rk">${r.rank}</td>
      <td><b>${esc(r.t)}</b>${held(r.t) ? ' <span class="dot-held" title="Na sua carteira"></span>' : ''}<div class="sub-s">${esc(r.name)}</div></td>
      <td><div class="hchips">${r.houses.map(houseChip).join('')}</div></td>
      <td class="r"><b class="num">${r.n}</b><span class="muted"> / ${HOUSES.length}</span><div class="mbar" style="width:70px"><i class="up" style="width:${(r.n / maxN * 100).toFixed(0)}%;background:var(--color-accent)"></i></div></td>
      <td class="r num">${r.cons ? `${r.cons}<span class="muted"> / ${CONSENSUS.total}</span>` : '<span class="muted">—</span>'}</td>
      <td class="r num">${q ? live('r' + r.t, q.price, 'R$ ' + nf(q.price)) : '<span class="muted">—</span>'}</td>
      <td class="r">${q ? `<span class="pill ${cls(q.chg)}">${arrow(q.chg)} ${pc(q.chg)}</span>` : '<span class="muted">—</span>'}</td>
      <td class="r num">${r.fair ? `R$ ${nf(r.fair)}${up != null ? `<div class="sub-s ${cls(up)}">${pc(up * 100, 1)} vs. hoje</div>` : ''}` : '<span class="muted">—</span>'}</td>
      <td class="thesis">${esc(r.thesis)}</td></tr>`;
  }).join('');
  const cards = HOUSES.map(h => `<div class="panel house"><div class="panel-h"><h3>${esc(h.name)}</h3><span class="sub">${fmtDate(h.date)}</span></div><div class="sub-s" style="margin:-6px 0 8px">${esc(h.carteira)}${h.partial ? ' · parcial' : ''}</div><div class="hchips">${h.items.map(([t, w]) => `<span class="hchip big ${held(t) ? 'held' : ''}" title="${esc(NAMES_OF(t))}"><b>${esc(t)}</b>${w != null ? `<i>${w}%</i>` : ''}</span>`).join('')}</div><p class="hnote">${esc(h.note)}</p><a class="src" href="${esc(h.url)}" target="_blank" rel="noopener noreferrer"><i class="ph ph-arrow-square-out"></i> Fonte</a></div>`).join('');
  return `<div class="panel reco" style="margin-bottom:14px"><div class="panel-h"><h3><i class="ph ph-medal"></i> Top 10 ações mais recomendadas</h3><span class="sub">consolidado de ${HOUSES.length} carteiras de casas de análise · outubro/2026 · atualizado em ${fmtDate(RECO_DATE)}</span></div>
    ${old ? `<div class="notice warn" style="margin-bottom:12px"><i class="ph ph-warning"></i><span>Estes dados têm ${staleDays()} dias. As carteiras mudam todo mês: confira as fontes antes de usar.</span></div>` : ''}
    <div class="tscroll"><table class="table mk-t reco-t"><thead><tr><th>#</th><th>Ativo</th><th>Casas que recomendam</th><th class="r">Casas</th><th class="r" title="${esc(CONSENSUS.houses)}">Consenso InfoMoney</th><th class="r">Preço</th><th class="r">Dia</th><th class="r">Preço-justo Itaú BBA</th><th>Tese</th></tr></thead><tbody>${tbl}</tbody></table></div>
    <div class="hint">Ordem: nº de carteiras em que o papel aparece; desempate pelo consenso de 10 casas do InfoMoney (${fmtDate(CONSENSUS.date)}) e depois pelo peso médio. Preço e variação do dia são ao vivo. Compare sempre com a data de cada carteira abaixo.</div></div>
  <div class="mk-h2">Carteiras por casa</div><div class="grid mk-houses">${cards}</div>
  <div class="notice" style="margin:14px 0"><i class="ph ph-info"></i><span><b>Suno e Investidor10:</b> as carteiras próprias da Suno são pagas e não entram aqui; o consenso do InfoMoney e a lista de casas acima cobrem o mesmo universo. O Investidor10 não publica carteira recomendada: ele ordena ações por indicadores, veja o <a href="https://investidor10.com.br/acoes/rankings/buy-and-hold/" target="_blank" rel="noopener noreferrer">ranking Buy and Hold</a>. Recomendações de terceiros, informativas, sem considerar seu perfil, e não constituem recomendação personalizada de investimento.</span></div>`;
}
const NAMES_OF = t => NAMES[t] || '';

function body(c) {
  const d = marketState.data;
  next = new Map();
  const noTok = !brapiToken() && !edgeOn();
  const html = `${cards(d)}
    ${noTok ? '<div class="notice" style="margin-bottom:14px"><i class="ph ph-info"></i><span>A função de cotações do Supabase não está ativa e não há token da brapi: o Ibovespa aparece via ETF BOVA11 e as listas usam o plano aberto. Veja no README como publicar a função "mercado".</span></div>' : ''}
    ${recoSection(d)}
    <div class="grid g-2 mk-main">${analysisPanel(d)}<div class="stack">${myDay(c)}${cryptoPanel(d)}</div></div>
    <div class="panel" style="margin-bottom:14px"><div class="panel-h"><h3>Mapa de calor</h3><span class="sub">tamanho ≈ giro financeiro · cor = variação do dia · ${mkt.tab === 'funds' ? 'FIIs e ETFs' : 'ações'}</span></div>${heat(mkt.tab === 'funds' ? d?.lists?.funds || [] : d?.lists?.stocks || [])}</div>
    <div class="mk-sec"><div class="chips" style="margin:6px 0 12px"><button class="chip ${mkt.tab === 'stocks' ? 'on' : ''}" data-act="mkt-tab" data-v="stocks">Ações</button><button class="chip ${mkt.tab === 'funds' ? 'on' : ''}" data-act="mkt-tab" data-v="funds">FIIs e ETFs</button></div>${rankings(d)}</div>`;
  prev = next;
  return html;
}

const status = () => {
  const s = sessionStatus(), st = marketState;
  return `<span class="live ${s.open ? 'on' : ''}"><i></i>${s.label}</span><button class="stamp" data-act="mkt-refresh"><i class="ph ph-arrows-clockwise ${busy ? 'spin' : ''}"></i> ${st.data?.ts ? 'Atualizado às ' + hms(st.data.ts) : 'Atualizar'}${st.errors.length ? ' <i class="ph ph-warning warn" title="' + esc(st.errors.join(' · ')) + '"></i>' : ''}</button>`;
};

function paint() {
  const root = document.getElementById('mkt'); if (!root) { clearInterval(timer); timer = null; return; }
  root.querySelector('#mkt-tape').innerHTML = tape(marketState.data);
  root.querySelector('#mkt-body').innerHTML = body(lastC);
  const st = document.getElementById('mkt-status'); if (st) st.innerHTML = status();
}

async function kick(force = false) {
  if (document.hidden && !force) return;
  busy = true; const st = document.getElementById('mkt-status'); if (st) st.innerHTML = status();
  try { await refreshMarket({ token: brapiToken(), force }); } finally { busy = false; }
  paint();
}

export const mercado = {
  title: 'Mercado',
  render(c) {
    lastC = c;
    const d = marketState.data;
    return `<div id="mkt">${head('Mercado', 'Cotações e análise do dia · atualização automática a cada 90 s', `<div id="mkt-status" class="row" style="gap:10px">${status()}</div>`)}<div id="mkt-tape">${tape(d)}</div><div id="mkt-body">${body(c)}</div></div>`;
  },
  onMount(el, c) {
    lastC = c;
    if (!timer) timer = setInterval(() => kick(false), REFRESH_MS);
    const age = marketState.data?.ts ? Date.now() - marketState.data.ts : Infinity;
    if (age > 45 * 1000 && !busy) kick(false);
  },
  actions: {
    'mkt-tab': el => { mkt.tab = el.dataset.v; return true; },
    'mkt-refresh': () => { kick(true); },
  },
};
