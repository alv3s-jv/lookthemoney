// Componentes de interface compartilhados: formatadores, KPI, gráficos SVG, modal, toast.
import { nf, esc, MONTHS_SHORT, fmtDate, ymShort, clamp } from './util.js';
import { UP, DN } from './meta.js';
export { esc } from './util.js';

export const ui = {
  hidden: (() => { try { return localStorage.getItem('ltm.hidden') === '1'; } catch { return false; } })(),
};
export function toggleHidden() {
  ui.hidden = !ui.hidden;
  try { localStorage.setItem('ltm.hidden', ui.hidden ? '1' : '0'); } catch { /* ok */ }
}

// ---------------------------------------------------------------- formatadores
export const money = (v, d = 2) => (ui.hidden ? 'R$ •••••' : (v < 0 ? '−' : '') + 'R$ ' + nf(Math.abs(v), d));
export const smoney = (v, d = 2) => (ui.hidden ? 'R$ •••••' : (v >= 0 ? '+' : '−') + 'R$ ' + nf(Math.abs(v), d));
export const num = (v, d = 2) => nf(v, d);
export const pct = (v, d = 1) => (v >= 0 ? '+' : '−') + nf(Math.abs(v * 100), d) + '%';
export const pctPlain = (v, d = 0) => nf(v * 100, d) + '%';
export const qtyFmt = v => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: Math.abs(v) < 1 ? 6 : 4 });
export const col = v => (v >= 0 ? UP : DN);
export const arrow = v => (v >= 0 ? '▲' : '▼');
/** Ganho/perda sempre com ▲/▼ além da cor. */
export const gain = (v, text) => `<span class="num" style="color:${col(v)}"><span aria-hidden="true">${arrow(v)}</span> ${text}</span>`;
export const gainPct = (v, d = 1) => gain(v, pct(v, d));
export const gainMoney = (v, d = 2) => gain(v, smoney(v, d));

// ---------------------------------------------------------------- blocos
export const icon = (cls, extra = '') => `<i class="${cls}" ${extra} aria-hidden="true"></i>`;
export const kpi = ({ label, value, sub = '', hint = '', ic = '', tone = '' }) => `<div class="kpi ${tone ? 'tone-' + tone : ''}"><div class="kpi-l">${ic ? `<i class="${ic} kpi-ic" aria-hidden="true"></i>` : ''}${label}</div><div class="kpi-v num">${value}</div>${sub ? `<div class="kpi-s num">${sub}</div>` : ''}${hint ? `<div class="kpi-h">${hint}</div>` : ''}</div>`;
export const tag = (t, cls = 'tag-neutral') => `<span class="tag ${cls}">${esc(t)}</span>`;
export const progress = (ratio, { color = 'var(--color-accent)', marker = null, h = 6 } = {}) =>
  `<div class="bar" style="height:${h}px"><div class="bar-f" style="width:${clamp(ratio, 0, 1) * 100}%;background:${color}"></div>${marker != null ? `<div class="bar-m" style="left:${clamp(marker, 0, 1) * 100}%"></div>` : ''}</div>`;
export const empty = (msg, cta = '', ic = 'ph-tray') => `<div class="empty"><span class="empty-ic"><i class="ph ${ic}" aria-hidden="true"></i></span><p>${msg}</p>${cta}</div>`;

/** Número que "sobe" até o valor ao aparecer (e anima de um valor para outro nas atualizações). Respeita "Ocultar valores". kind: money | smoney | pct | int */
const fmtCount = (v, kind, d) => (kind === 'smoney' ? smoney(v, d) : kind === 'pct' ? pct(v, d) : kind === 'int' ? nf(v, 0) : money(v, d));
export const countUp = (v, { kind = 'money', d = 0, key = '' } = {}) => (ui.hidden || !isFinite(v) ? fmtCount(v || 0, kind, d) : `<span data-count="${v}" data-kind="${kind}" data-d="${d}" data-ck="${esc(key)}">${fmtCount(v, kind, d)}</span>`);
const lastCount = new Map();
export function bindCounts(root) {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  root.querySelectorAll('[data-count]').forEach(el => {
    const to = +el.dataset.count, kind = el.dataset.kind, d = +el.dataset.d, k = el.dataset.ck || kind + ':' + el.closest('.kpi,.hero-card,.panel')?.querySelector('.kpi-l,h3')?.textContent;
    const from = lastCount.has(k) ? lastCount.get(k) : 0; lastCount.set(k, to);
    if (reduce || from === to) return;
    const t0 = performance.now(), dur = 900;
    const step = now => { const t = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - t, 3); el.textContent = fmtCount(from + (to - from) * e, kind, d); if (t < 1) requestAnimationFrame(step); };
    el.textContent = fmtCount(from, kind, d); requestAnimationFrame(step);
  });
}

/** Mini-gráfico de tendência com área em gradiente. values: números; tom verde se terminou acima do início, coral se abaixo. */
let spkSeq = 0;
export function sparkline(values, { w = 220, h = 64 } = {}) {
  const v = values.filter(x => isFinite(x)); if (v.length < 2) return '';
  const up = v[v.length - 1] >= v[0], c = up ? 'var(--up)' : 'var(--dn)', id = 'sp' + ++spkSeq;
  const lo = Math.min(...v), hi = Math.max(...v), pad = (hi - lo || Math.abs(hi) * 0.01 || 1) * 0.15;
  const X = i => (i / (v.length - 1)) * w, Y = x => 4 + ((hi + pad - x) / (hi - lo + 2 * pad)) * (h - 8);
  const pts = v.map((x, i) => `${X(i).toFixed(1)},${Y(x).toFixed(1)}`);
  return `<svg viewBox="0 0 ${w} ${h}" class="spark" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c}" stop-opacity=".38"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></linearGradient></defs><path d="M${pts.join(' L')} L${w},${h} L0,${h} Z" fill="url(#${id})"/><polyline points="${pts.join(' ')}" fill="none" stroke="${c}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" class="draw" pathLength="1"/><circle cx="${X(v.length - 1)}" cy="${Y(v[v.length - 1])}" r="3.2" fill="${c}" vector-effect="non-scaling-stroke" class="spark-dot"/></svg>`;
}

/** Barra de meta com marcos (25/50/75%) e rótulo. */
export function goalBar({ label, cur, target, fmt, icon: ic = 'ph-target', color = 'var(--color-accent)' }) {
  const r = target > 0 ? clamp(cur / target, 0, 1) : 0;
  return `<div class="gb"><div class="row spread" style="margin-bottom:8px"><span class="gb-t"><i class="ph ${ic}"></i> ${label}</span><span class="num muted">${fmt(cur)} <span style="opacity:.6">/ ${fmt(target)}</span></span></div><div class="gb-bar"><div class="gb-f" style="width:${(r * 100).toFixed(1)}%;background:${color}"></div>${[25, 50, 75].map(m => `<i class="gb-m ${r * 100 >= m ? 'hit' : ''}" style="left:${m}%"></i>`).join('')}</div><div class="gb-s">${r >= 1 ? '🎯 Meta batida!' : `<b class="num">${nf(r * 100, 0)}%</b> do caminho · faltam ${fmt(Math.max(0, target - cur))}`}</div></div>`;
}

/** Chuva de confete (celebração de marcos). */
export function confetti(n = 46) {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const host = document.createElement('div'); host.className = 'confetti'; const cols = ['#7c9cff', '#ff8fa3', '#4fd1c5', '#d38cff', '#f2cf66', '#6be3a8'];
  for (let i = 0; i < n; i++) { const p = document.createElement('i'); p.style.cssText = `left:${Math.random() * 100}%;background:${cols[i % cols.length]};animation-delay:${Math.random() * 0.5}s;animation-duration:${1.8 + Math.random() * 1.4}s;--dx:${(Math.random() - 0.5) * 160}px;--r:${Math.random() * 720}deg`; host.appendChild(p); }
  document.body.appendChild(host); setTimeout(() => host.remove(), 3600);
}
export const monthNav = (ym, label) => `<div class="monthnav"><button class="btn btn-secondary btn-icon" data-act="month-prev" aria-label="Mês anterior"><i class="ph ph-caret-left"></i></button><span class="monthnav-l">${label}</span><button class="btn btn-secondary btn-icon" data-act="month-next" aria-label="Próximo mês"><i class="ph ph-caret-right"></i></button></div>`;
export const seg = (name, opts, cur) => `<div class="seg" role="radiogroup">${opts.map(([v, l]) => `<label class="seg-opt"><input type="radio" name="${name}" value="${esc(v)}" ${v === cur ? 'checked' : ''}>${esc(l)}</label>`).join('')}</div>`;

// ---------------------------------------------------------------- gráficos
const niceMax = v => { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; };
const kfmt = v => (Math.abs(v) >= 1000 ? nf(v / 1000, v % 1000 === 0 ? 0 : 1) + 'k' : nf(v, 0));

/** Barras agrupadas receita × despesa. series: [{ym, income, expense}] */
export function barsIncomeExpense(series, { w = 720, h = 210 } = {}) {
  const L = 44, R = 6, T = 10, B = h - 24;
  const max = niceMax(Math.max(...series.map(s => Math.max(s.income, s.expense)), 1));
  const Y = v => T + (1 - v / max) * (B - T);
  const slot = (w - L - R) / series.length, bw = Math.min(18, slot / 2.6);
  let g = '';
  for (let i = 0; i <= 4; i++) { const v = (max / 4) * i; g += `<line x1="${L}" x2="${w - R}" y1="${Y(v)}" y2="${Y(v)}" class="gl"/><text x="${L - 6}" y="${Y(v) + 3.5}" text-anchor="end" class="ax">${kfmt(v)}</text>`; }
  series.forEach((s, i) => {
    const cx = L + slot * i + slot / 2;
    g += `<g><title>${ymShort(s.ym)} · receitas ${money(s.income, 0)} · despesas ${money(s.expense, 0)}</title>
      <rect x="${cx - bw - 1}" y="${Y(s.income)}" width="${bw}" height="${Math.max(0, B - Y(s.income))}" rx="2" fill="var(--color-accent)"/>
      <rect x="${cx + 1}" y="${Y(s.expense)}" width="${bw}" height="${Math.max(0, B - Y(s.expense))}" rx="2" fill="var(--color-neutral-500)"/></g>
      <text x="${cx}" y="${h - 7}" text-anchor="middle" class="ax">${MONTHS_SHORT[+s.ym.slice(5) - 1]}</text>`;
  });
  return `<svg viewBox="0 0 ${w} ${h}" class="chart" role="img" aria-label="Receitas e despesas por mês">${g}</svg>`;
}

/** Barras empilhadas. cols: [{label, parts:{key:value}}], colors: {key:color} */
export function stackedBars(cols, colors, { w = 720, h = 200 } = {}) {
  const L = 44, R = 6, T = 10, B = h - 24;
  const tot = c => Object.values(c.parts).reduce((a, b) => a + b, 0);
  const max = niceMax(Math.max(...cols.map(tot), 1));
  const Y = v => T + (1 - v / max) * (B - T);
  const slot = (w - L - R) / cols.length, bw = Math.min(26, slot * 0.6);
  let g = '';
  for (let i = 0; i <= 4; i++) { const v = (max / 4) * i; g += `<line x1="${L}" x2="${w - R}" y1="${Y(v)}" y2="${Y(v)}" class="gl"/><text x="${L - 6}" y="${Y(v) + 3.5}" text-anchor="end" class="ax">${kfmt(v)}</text>`; }
  cols.forEach((c, i) => {
    const cx = L + slot * i + slot / 2; let acc = 0;
    g += `<g><title>${c.label} · ${Object.entries(c.parts).filter(([, v]) => v).map(([k, v]) => `${k}: ${money(v)}`).join(' · ') || 'sem proventos'}</title>`;
    for (const [k, v] of Object.entries(c.parts)) { if (!v) continue; g += `<rect x="${cx - bw / 2}" y="${Y(acc + v)}" width="${bw}" height="${Math.max(0, Y(acc) - Y(acc + v))}" fill="${colors[k]}" rx="${acc ? 0 : 2}"/>`; acc += v; }
    g += `</g><text x="${cx}" y="${h - 7}" text-anchor="middle" class="ax">${c.label}</text>`;
  });
  return `<svg viewBox="0 0 ${w} ${h}" class="chart" role="img" aria-label="Proventos por mês">${g}</svg>`;
}

/** Donut. slices: [{label, value, color}] */
export function donut(slices, { size = 160, stroke = 22, center = '' } = {}) {
  const tot = slices.reduce((a, s) => a + s.value, 0) || 1, r = (size - stroke) / 2, C = 2 * Math.PI * r;
  let off = 0, g = `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--color-neutral-800)" stroke-width="${stroke}"/>`;
  for (const s of slices) {
    if (s.value <= 0) continue;
    const len = (s.value / tot) * C;
    g += `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${s.color}" stroke-width="${stroke}" stroke-dasharray="${Math.max(0, len - 1.5)} ${C}" stroke-dashoffset="${-off}" transform="rotate(-90 ${size / 2} ${size / 2})"><title>${esc(s.label)} · ${nf((s.value / tot) * 100, 1)}%</title></circle>`;
    off += len;
  }
  return `<div class="donut" style="width:${size}px;height:${size}px"><svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="Alocação">${g}</svg><div class="donut-c">${center}</div></div>`;
}

export function ring(ratio, { size = 76, stroke = 6, label = '' } = {}) {
  const r = (size - stroke) / 2, C = 2 * Math.PI * r;
  return `<div class="donut" style="width:${size}px;height:${size}px"><svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--color-neutral-800)" stroke-width="${stroke}"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--color-accent)" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${C * clamp(ratio, 0, 1)} ${C}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg><div class="donut-c num" style="font-size:14px">${label}</div></div>`;
}

// ---- desempenho vs CDI (interativo) ----
const perfReg = new Map();
let perfSeq = 0;
export function perfChart(pts, { w = 720, h = 250 } = {}) {
  if (pts.length < 2) return empty('Ainda não há histórico suficiente. O gráfico se completa conforme o app registra a carteira dia a dia.');
  const L = 46, R = 8, T = 12, B = h - 26;
  // reduz a no máx. ~240 pontos para o SVG
  const stride = Math.max(1, Math.ceil(pts.length / 240));
  const P = pts.filter((_, i) => i % stride === 0 || i === pts.length - 1);
  const all = P.flatMap(p => [p.port, p.cdi]);
  let max = Math.max(0.01, ...all) * 1.12, min = Math.min(0, ...all) * 1.12;
  const X = i => L + (i / (P.length - 1)) * (w - L - R), Y = v => T + ((max - v) / (max - min)) * (B - T);
  const stepC = [0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.25, 0.5, 1];
  const step = stepC.find(s => (max - min) / s <= 6) || 1;
  let g = '';
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) g += `<line x1="${L}" x2="${w - R}" y1="${Y(v)}" y2="${Y(v)}" class="gl"/><text x="${L - 6}" y="${Y(v) + 3.5}" text-anchor="end" class="ax">${nf(Math.abs(v) < 1e-9 ? 0 : v * 100, step < 0.01 ? 1 : 0)}%</text>`;
  // área onde carteira > CDI
  let run = [];
  const flush = () => { if (run.length > 1) g += `<path d="M${run.map(p => `${p.x},${p.yp}`).join(' L')} L${[...run].reverse().map(p => `${p.x},${p.yc}`).join(' L')} Z" fill="color-mix(in srgb, var(--color-accent) 16%, transparent)"/>`; run = []; };
  P.forEach((p, i) => {
    const x = X(i), above = p.port >= p.cdi;
    if (above) {
      if (!run.length && i > 0) { const q = P[i - 1], t = (q.cdi - q.port) / ((p.port - p.cdi) - (q.port - q.cdi) || 1); const xc = X(i - 1) + (x - X(i - 1)) * clamp(t, 0, 1), vc = q.port + (p.port - q.port) * clamp(t, 0, 1); run.push({ x: xc, yp: Y(vc), yc: Y(vc) }); }
      run.push({ x, yp: Y(p.port), yc: Y(p.cdi) });
    } else if (run.length) { const q = P[i - 1], t = (q.port - q.cdi) / ((q.port - q.cdi) - (p.port - p.cdi) || 1); const xc = X(i - 1) + (x - X(i - 1)) * clamp(t, 0, 1), vc = q.port + (p.port - q.port) * clamp(t, 0, 1); run.push({ x: xc, yp: Y(vc), yc: Y(vc) }); flush(); }
  });
  flush();
  const line = k => P.map((p, i) => `${X(i).toFixed(1)},${Y(p[k]).toFixed(1)}`).join(' ');
  g += `<polyline points="${line('cdi')}" fill="none" stroke="var(--color-neutral-400)" stroke-width="1.6" stroke-dasharray="5 4"/>`;
  const gid = 'pg' + (perfSeq + 1), y0 = Y(Math.max(min, Math.min(0, max)));
  g = `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--color-accent)" stop-opacity=".34"/><stop offset="1" stop-color="var(--color-accent)" stop-opacity="0"/></linearGradient></defs>` + g;
  g += `<path d="M${P.map((p, i) => `${X(i).toFixed(1)},${Y(p.port).toFixed(1)}`).join(' L')} L${X(P.length - 1).toFixed(1)},${y0} L${X(0).toFixed(1)},${y0} Z" fill="url(#${gid})" class="fade-in"/>`;
  g += `<polyline points="${line('port')}" fill="none" stroke="var(--color-accent)" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" pathLength="1" class="draw glow-line"/>`;
  if (P.length <= 40) g += P.map((p, i) => `<circle cx="${X(i).toFixed(1)}" cy="${Y(p.port).toFixed(1)}" r="3" fill="var(--color-accent)"/>`).join('');
  const monthly = P.length <= 13, nT = monthly ? P.length : Math.min(6, P.length), xl = [];
  for (let k = 0; k < nT; k++) { const i = monthly ? k : Math.round((k / (nT - 1)) * (P.length - 1)); const [y, m] = (P[i].ym || P[i].date).split('-'); xl.push(`<text x="${X(i)}" y="${h - 8}" text-anchor="${k === 0 ? 'start' : k === nT - 1 ? 'end' : 'middle'}" class="ax">${MONTHS_SHORT[+m - 1]}/${y.slice(2)}</text>`); }
  g += xl.join('');
  const id = 'pf' + ++perfSeq;
  perfReg.set(id, { P, X, Y, w, h, L, R, T, B });
  return `<div class="perf" data-perf="${id}"><svg viewBox="0 0 ${w} ${h}" class="chart" role="img" aria-label="Desempenho da carteira versus CDI">${g}<line class="xh" x1="0" x2="0" y1="${T}" y2="${B}" style="display:none"/><circle class="dp" r="4" fill="var(--color-accent)" style="display:none"/><circle class="dc" r="3.5" fill="var(--color-neutral-300)" style="display:none"/></svg><div class="tip" style="display:none"></div></div>`;
}

export function bindCharts(root) {
  bindCounts(root);
  root.querySelectorAll('[data-perf]').forEach(el => {
    const d = perfReg.get(el.dataset.perf); if (!d) return;
    const svg = el.querySelector('svg'), tip = el.querySelector('.tip'), xh = el.querySelector('.xh'), dp = el.querySelector('.dp'), dc = el.querySelector('.dc');
    const move = e => {
      const rc = svg.getBoundingClientRect(); const cx = (e.touches ? e.touches[0].clientX : e.clientX);
      const vx = ((cx - rc.left) / rc.width) * d.w;
      const i = clamp(Math.round(((vx - d.L) / (d.w - d.L - d.R)) * (d.P.length - 1)), 0, d.P.length - 1), p = d.P[i];
      const x = d.X(i);
      xh.setAttribute('x1', x); xh.setAttribute('x2', x); dp.setAttribute('cx', x); dp.setAttribute('cy', d.Y(p.port)); dc.setAttribute('cx', x); dc.setAttribute('cy', d.Y(p.cdi));
      [xh, dp, dc].forEach(n => (n.style.display = ''));
      const diff = p.port - p.cdi;
      tip.innerHTML = `<b>${p.ym ? (i === 0 ? 'Início · ' + fmtDate(p.date) : ymShort(p.ym) + (p.partial ? ' (em andamento)' : '')) : fmtDate(p.date)}</b>${p.est ? ' <span class="muted">(estimado)</span>' : ''}<br>Carteira <b class="num">${nf(p.port * 100, 2)}%</b><br>CDI <b class="num">${nf(p.cdi * 100, 2)}%</b><br><span style="color:${col(diff)}">${arrow(diff)} ${nf(Math.abs(diff) * 100, 2)} p.p.</span>`;
      tip.style.display = '';
      const px = (x / d.w) * rc.width; tip.style.left = clamp(px + 12, 0, rc.width - 140) + 'px'; tip.style.top = '8px';
    };
    const leave = () => { [xh, dp, dc, tip].forEach(n => (n.style.display = 'none')); };
    svg.addEventListener('mousemove', move); svg.addEventListener('touchmove', move, { passive: true }); svg.addEventListener('mouseleave', leave); svg.addEventListener('touchend', leave);
  });
}

/** Lotes de um ativo: pontos (data × preço), linha tracejada do PM e linha do preço atual. */
export function lotChart(lots, pm, price, { w = 720, h = 220 } = {}) {
  if (!lots.length) return '';
  const L = 52, R = 56, T = 16, B = h - 26;
  const ys = [...lots.map(l => l.price), pm, ...(price ? [price] : [])];
  let lo = Math.min(...ys), hi = Math.max(...ys); const pad = (hi - lo || hi * 0.1) * 0.25; lo -= pad; hi += pad;
  const t0 = new Date(lots[0].date).getTime(), t1 = Math.max(new Date(lots[lots.length - 1].date).getTime(), Date.now());
  const X = d => L + ((new Date(d).getTime() - t0) / (t1 - t0 || 1)) * (w - L - R), Y = v => T + ((hi - v) / (hi - lo)) * (B - T);
  let g = '';
  for (let i = 0; i <= 3; i++) { const v = lo + ((hi - lo) / 3) * i; g += `<line x1="${L}" x2="${w - R}" y1="${Y(v)}" y2="${Y(v)}" class="gl"/><text x="${L - 6}" y="${Y(v) + 3.5}" text-anchor="end" class="ax">${nf(v, v > 1000 ? 0 : 2)}</text>`; }
  g += `<line x1="${L}" x2="${w - R}" y1="${Y(pm)}" y2="${Y(pm)}" stroke="var(--color-accent)" stroke-dasharray="6 4" stroke-width="1.5"/><text x="${w - R + 4}" y="${Y(pm) + 3.5}" class="ax" fill="var(--color-accent-300)">PM</text>`;
  if (price) g += `<line x1="${L}" x2="${w - R}" y1="${Y(price)}" y2="${Y(price)}" stroke="var(--color-neutral-300)" stroke-width="1.2"/><text x="${w - R + 4}" y="${Y(price) + 3.5}" class="ax">Atual</text>`;
  lots.forEach((l, i) => { g += `<g><title>L${i + 1} · ${fmtDate(l.date)} · ${nf(l.price)} × ${l.qty}</title><circle cx="${X(l.date)}" cy="${Y(l.price)}" r="5.5" fill="var(--color-bg)" stroke="var(--color-accent)" stroke-width="2"/><text x="${X(l.date)}" y="${Y(l.price) - 10}" text-anchor="middle" class="ax" fill="var(--color-accent-300)">L${i + 1}</text></g>`; });
  return `<svg viewBox="0 0 ${w} ${h}" class="chart" role="img" aria-label="Lotes de compra versus preço médio">${g}</svg>`;
}

// ---------------------------------------------------------------- modal / toast / confirm
let modalStack = [];
export function openModal({ title, body, actions = '', wide = false, onMount, onClose }) {
  const bd = document.createElement('div');
  bd.className = 'dialog-backdrop modal';
  bd.innerHTML = `<div class="dialog ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="dialog-head"><div class="dialog-title">${esc(title)}</div><button class="btn btn-ghost btn-icon" data-close aria-label="Fechar"><i class="ph ph-x"></i></button></div><div class="dialog-body">${body}</div>${actions ? `<div class="dialog-actions">${actions}</div>` : ''}</div>`;
  const prevFocus = document.activeElement;
  const close = () => { bd.remove(); modalStack = modalStack.filter(m => m !== api); onClose?.(); try { prevFocus?.focus?.(); } catch { /* ok */ } document.body.classList.toggle('noscroll', modalStack.length > 0); };
  const api = { el: bd, close, q: s => bd.querySelector(s), qa: s => [...bd.querySelectorAll(s)] };
  bd.addEventListener('mousedown', e => { if (e.target === bd) close(); });
  bd.addEventListener('click', e => { if (e.target.closest('[data-close]')) close(); });
  document.body.appendChild(bd); document.body.classList.add('noscroll');
  modalStack.push(api);
  onMount?.(api);
  const f = bd.querySelector('[autofocus], input:not([type=hidden]), select, textarea') || bd.querySelector('button'); f?.focus();
  return api;
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && modalStack.length) modalStack[modalStack.length - 1].close(); });

export function confirmDialog({ title, message, confirm = 'Excluir', danger = true }) {
  return new Promise(res => {
    let done = false;
    const m = openModal({
      title, body: `<p style="margin:0">${message}</p>`,
      actions: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary ${danger ? 'btn-danger' : ''}" data-ok>${confirm}</button>`,
      onMount: api => api.q('[data-ok]').addEventListener('click', () => { done = true; api.close(); res(true); }),
      onClose: () => { if (!done) res(false); },
    });
  });
}

export function toast(msg, { kind = 'info', ms = 3200 } = {}) {
  let host = document.getElementById('toasts');
  if (!host) { host = document.createElement('div'); host.id = 'toasts'; host.setAttribute('aria-live', 'polite'); document.body.appendChild(host); }
  const t = document.createElement('div'); t.className = 'toast ' + kind; t.innerHTML = `<i class="ph ${kind === 'error' ? 'ph-warning' : kind === 'ok' ? 'ph-check-circle' : 'ph-info'}"></i><span>${esc(msg)}</span>`;
  host.appendChild(t); setTimeout(() => t.classList.add('out'), ms - 250); setTimeout(() => t.remove(), ms);
}

// ---------------------------------------------------------------- formulários
export const field = (label, control, { hint = '', cls = '' } = {}) => `<div class="field ${cls}"><label>${label}</label>${control}${hint ? `<div class="hint">${hint}</div>` : ''}</div>`;
export const options = (list, cur) => list.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`; }).join('');
export const formData = root => { const o = {}; root.querySelectorAll('[name]').forEach(el => { if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; } else if (el.type === 'checkbox') o[el.name] = el.checked; else o[el.name] = el.value; }); return o; };
export const errBox = list => `<div class="errs" role="alert">${list.map(e => `<div><i class="ph ph-warning"></i> ${esc(e)}</div>`).join('')}</div>`;
