// Utilidades gerais: formatação pt-BR, datas, ids, escape HTML.

export const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
export const MONTHS_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
export const WEEKDAYS = ['domingo','segunda','terça','quarta','quinta','sexta','sábado'];

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

// ---------- números ----------
export const nf = (v, d = 2) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
export const round2 = v => Math.round((Number(v) + Number.EPSILON) * 100) / 100;

// Aceita "1.234,56", "1234.56", "R$ 12,5" e número.
export function parseNum(s) {
  if (typeof s === 'number') return s;
  if (s == null) return NaN;
  let t = String(s).trim().replace(/[R$\s]/g, '');
  if (t === '') return NaN;
  const neg = /^-|^\(|−/.test(t);
  t = t.replace(/[-−()]/g, '');
  if (t.includes(',') && t.includes('.')) t = t.replace(/\./g, '').replace(',', '.');
  else if (t.includes(',')) t = t.replace(',', '.');
  else if ((t.match(/\./g) || []).length > 1) t = t.replace(/\./g, '');
  const n = parseFloat(t);
  return neg ? -n : n;
}

// ---------- datas (sempre strings 'YYYY-MM-DD' / 'YYYY-MM', sem fuso) ----------
const p2 = n => String(n).padStart(2, '0');
export const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
export const ymOf = iso => iso.slice(0, 7);
export const currentYM = () => todayISO().slice(0, 7);
export const parseISO = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
export const toISO = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
export const addDays = (iso, n) => { const d = parseISO(iso); d.setDate(d.getDate() + n); return toISO(d); };
export const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);
export const addMonthsYM = (ym, n) => { const [y, m] = ym.split('-').map(Number); const t = y * 12 + (m - 1) + n; return `${Math.floor(t / 12)}-${p2((t % 12) + 1)}`; };
export const daysInMonth = ym => { const [y, m] = ym.split('-').map(Number); return new Date(y, m, 0).getDate(); };
// Mantém o dia, "encaixando" em meses curtos (31/jan + 1 mês = 28/fev).
export const addMonthsISO = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number);
  const ym = addMonthsYM(`${y}-${p2(m)}`, n);
  return `${ym}-${p2(Math.min(d, daysInMonth(ym)))}`;
};
export const ymLabel = ym => { const [y, m] = ym.split('-').map(Number); return `${MONTHS[m - 1]} ${y}`; };
export const ymShort = ym => { const [y, m] = ym.split('-').map(Number); return `${MONTHS_SHORT[m - 1]}/${String(y).slice(2)}`; };
export const fmtDate = iso => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
export const fmtDM = iso => { const [, m, d] = iso.split('-'); return `${d}/${m}`; };
export const dayLabel = iso => {
  const t = todayISO();
  const d = parseISO(iso);
  const base = `${WEEKDAYS[d.getDay()]}, ${d.getDate()} de ${MONTHS[d.getMonth()].toLowerCase()}`;
  if (iso === t) return 'Hoje · ' + base;
  if (iso === addDays(t, -1)) return 'Ontem · ' + base;
  return base.charAt(0).toUpperCase() + base.slice(1);
};
export const isBusinessDay = iso => { const w = parseISO(iso).getDay(); return w !== 0 && w !== 6; };
export function businessDaysBetween(a, b) { // (a, b]
  let n = 0, cur = a;
  while (cur < b) { cur = addDays(cur, 1); if (isBusinessDay(cur)) n++; }
  return n;
}

// ---------- html ----------
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const sum = (arr, f = x => x) => arr.reduce((a, x) => a + f(x), 0);
export const groupBy = (arr, f) => arr.reduce((m, x) => { (m[f(x)] ||= []).push(x); return m; }, {});
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
