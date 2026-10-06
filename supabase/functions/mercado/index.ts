// Edge Function "mercado": busca cotações da B3 no Yahoo Finance (servidor → servidor, sem CORS, sem token, sem limite por ativo).
// Só responde a usuários logados (verificação de JWT ligada). Cache em memória: cotações 60 s, detalhes (fundamentos/histórico) 6 h.
// Corpo (POST JSON):
//   { symbols: ["PETR4", ...] }                       → cotações atuais
//   { symbols: [...], detail: true }                  → + fundamentos, histórico mensal de 5 anos e proventos
//   { universe: true }                                → ~100 ações/FIIs líquidos + Ibovespa (para a página Mercado)
//   { history: "PETR4" }                              → fechamentos diários de 3 meses
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

const STOCKS: Record<string, string> = {
  PETR4: 'Petróleo e Gás', PRIO3: 'Petróleo e Gás', VBBR3: 'Petróleo e Gás', UGPA3: 'Petróleo e Gás', RAIZ4: 'Petróleo e Gás', CSAN3: 'Petróleo e Gás',
  VALE3: 'Mineração', CSNA3: 'Siderurgia', GGBR4: 'Siderurgia', USIM5: 'Siderurgia', GOAU4: 'Siderurgia', CMIN3: 'Mineração', BRAP4: 'Mineração',
  SUZB3: 'Papel e Celulose', KLBN11: 'Papel e Celulose',
  ITUB4: 'Bancos', BBDC4: 'Bancos', BBAS3: 'Bancos', SANB11: 'Bancos', BPAC11: 'Bancos', ITSA4: 'Bancos', B3SA3: 'Serviços Financeiros', BBSE3: 'Seguros', CXSE3: 'Seguros', PSSA3: 'Seguros', IRBR3: 'Seguros',
  WEGE3: 'Bens de Capital', EMBJ3: 'Bens de Capital', RENT3: 'Serviços', RAIL3: 'Logística', ECOR3: 'Logística', CCRO3: 'Logística', MOTV3: 'Logística',
  ELET3: 'Energia Elétrica', ELET6: 'Energia Elétrica', AXIA3: 'Energia Elétrica', EQTL3: 'Energia Elétrica', CMIG4: 'Energia Elétrica', CPLE3: 'Energia Elétrica', CPFE3: 'Energia Elétrica', ISAE4: 'Energia Elétrica', TAEE11: 'Energia Elétrica', ENEV3: 'Energia Elétrica', ENGI11: 'Energia Elétrica', NEOE3: 'Energia Elétrica',
  SBSP3: 'Saneamento', SAPR11: 'Saneamento', CSMG3: 'Saneamento',
  ABEV3: 'Bebidas', JBSS3: 'Alimentos', BRFS3: 'Alimentos', MRFG3: 'Alimentos', BEEF3: 'Alimentos', SMTO3: 'Alimentos', AGRO3: 'Agro',
  LREN3: 'Varejo', MGLU3: 'Varejo', ARZZ3: 'Varejo', AZZA3: 'Varejo', CRFB3: 'Varejo', ASAI3: 'Varejo', PCAR3: 'Varejo', VIVA3: 'Varejo', CASH3: 'Tecnologia',
  RDOR3: 'Saúde', HAPV3: 'Saúde', RADL3: 'Saúde', FLRY3: 'Saúde', HYPE3: 'Saúde', QUAL3: 'Saúde',
  MRVE3: 'Construção', CYRE3: 'Construção', CURY3: 'Construção', TEND3: 'Construção', DIRR3: 'Construção', EZTC3: 'Construção', MILS3: 'Construção',
  MULT3: 'Shoppings', IGTI11: 'Shoppings', JHSF3: 'Imobiliário', ALOS3: 'Shoppings',
  VIVT3: 'Telecom', TIMS3: 'Telecom', TOTS3: 'Tecnologia', LWSA3: 'Tecnologia',
  RAPT4: 'Bens de Capital', AZUL4: 'Aéreo', GOLL4: 'Aéreo', COGN3: 'Educação', YDUQ3: 'Educação', SLCE3: 'Agro', KEPL3: 'Bens de Capital',
};
const FUNDS: string[] = [
  'BOVA11', 'IVVB11', 'SMAL11', 'HASH11', 'GOLD11', 'DIVO11',
  'HGLG11', 'XPLG11', 'BTLG11', 'VISC11', 'XPML11', 'KNRI11', 'MXRF11', 'KNCR11', 'KNIP11', 'CPTS11', 'HGRU11', 'VGHF11', 'RZTR11', 'TRXF11', 'BCFF11', 'RBRR11', 'PVBI11', 'IRDM11', 'VILG11', 'HGBS11', 'HSML11', 'BRCO11', 'LVBI11', 'GGRC11', 'TGAR11', 'RECR11', 'JSRE11', 'ALZR11',
];
const FIN = new Set(['ITUB4', 'BBDC4', 'BBAS3', 'SANB11', 'BPAC11', 'ITSA4', 'BBSE3', 'CXSE3', 'B3SA3', 'PSSA3', 'IRBR3']);

const TTL_Q = 60_000, TTL_D = 6 * 3600_000;
const cache = new Map<string, { at: number; v: unknown }>();
const cached = async <T>(k: string, ttl: number, f: () => Promise<T>): Promise<T> => {
  const c = cache.get(k); if (c && Date.now() - c.at < ttl) return c.v as T;
  const v = await f(); cache.set(k, { at: Date.now(), v }); return v;
};

const ysym = (t: string) => (t.startsWith('^') ? t : `${t}.SA`);
async function yget(url: string, headers: Record<string, string> = {}) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json,*/*', ...headers }, signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error('Yahoo HTTP ' + r.status);
  return r;
}
const chart = async (t: string, range: string, interval: string, events = '') => {
  const r = await yget(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ysym(t))}?range=${range}&interval=${interval}${events ? '&events=' + events : ''}`);
  const x = (await r.json())?.chart?.result?.[0]; if (!x?.meta) throw new Error('sem dados');
  return x;
};
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

async function quote(t: string) {
  return cached(`q:${t}`, TTL_Q, async () => {
    const m = (await chart(t, '1d', '1d')).meta;
    const price = num(m.regularMarketPrice), prev = num(m.chartPreviousClose) ?? num(m.previousClose);
    if (price == null) throw new Error('sem preço');
    const vol = num(m.regularMarketVolume) ?? 0;
    return { t, name: m.longName || m.shortName || t, price, prev, chg: prev ? (price / prev - 1) * 100 : null, vol, brl: price * vol, high: num(m.regularMarketDayHigh), low: num(m.regularMarketDayLow), hi52: num(m.fiftyTwoWeekHigh), lo52: num(m.fiftyTwoWeekLow), ts: (num(m.regularMarketTime) ?? 0) * 1000 };
  });
}

// ---- fundamentos (quoteSummary exige cookie + crumb; se falhar, só omitimos — Graham/qualidade ficam "sem dados")
let crumb: { c: string; cookie: string; at: number } | null = null;
async function getCrumb() {
  if (crumb && Date.now() - crumb.at < 3600_000) return crumb;
  const r0 = await fetch('https://fc.yahoo.com', { headers: { 'User-Agent': UA }, redirect: 'manual', signal: AbortSignal.timeout(10000) });
  const cookie = (r0.headers.get('set-cookie') || '').split(/,(?=\s*[A-Za-z0-9_]+=)/).map((s) => s.split(';')[0].trim()).filter(Boolean).join('; ');
  if (!cookie) throw new Error('sem cookie');
  const c = await (await yget('https://query1.finance.yahoo.com/v1/test/getcrumb', { Cookie: cookie })).text();
  if (!c || c.length > 40) throw new Error('sem crumb');
  return (crumb = { c, cookie, at: Date.now() });
}
async function fundamentals(t: string) {
  const k = await getCrumb();
  const r = await yget(`https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ysym(t))}?modules=defaultKeyStatistics,financialData,summaryDetail&crumb=${encodeURIComponent(k.c)}`, { Cookie: k.cookie });
  const x = (await r.json())?.quoteSummary?.result?.[0] || {};
  const raw = (o: any, f: string) => num(o?.[f]?.raw ?? o?.[f]);
  const ks = x.defaultKeyStatistics, fd = x.financialData, sd = x.summaryDetail;
  return { eps: raw(ks, 'trailingEps'), bv: raw(ks, 'bookValue'), pe: raw(sd, 'trailingPE'), roe: raw(fd, 'returnOnEquity'), pm: raw(fd, 'profitMargins') ?? raw(ks, 'profitMargins'), de: raw(fd, 'debtToEquity'), fcf: raw(fd, 'freeCashflow'), eg: raw(fd, 'earningsGrowth') };
}

async function detail(t: string) {
  return cached(`d:${t}`, TTL_D, async () => {
    const q = await quote(t);
    const [h, f] = await Promise.all([chart(t, '5y', '1mo', 'div'), fundamentals(t).catch(() => null)]);
    const closes = (h.indicators?.quote?.[0]?.close || []).filter((v: unknown) => num(v) != null);
    const label = FIN.has(t) ? 'JCP' : 'DIVIDENDO'; // Yahoo não separa JCP de dividendo: bancos/seguradoras tratados como JCP (−15%)
    const cash = Object.values(h.events?.dividends || {}).map((d: any) => ({ label, rate: d.amount, exDate: new Date(d.date * 1000).toISOString().slice(0, 10), paymentDate: null }));
    return { ...q, pe: f?.pe ?? null, eps: f?.eps ?? null, bv: f?.bv ?? null, roe: f?.roe ?? null, pm: f?.pm ?? null, de: f?.de ?? null, fcf: f?.fcf ?? null, eg: f?.eg ?? null, hasFundamentals: !!f, cash, closes, lo: q.lo52, hi: q.hi52 };
  });
}

// concorrência limitada
async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>) {
  const out: PromiseSettledResult<R>[] = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const j = i++; try { out[j] = { status: 'fulfilled', value: await fn(items[j]) }; } catch (e) { out[j] = { status: 'rejected', reason: e }; } }
  }));
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'use POST' }, 405);
  try {
    const b = await req.json().catch(() => ({}));
    const valid = (s: unknown) => typeof s === 'string' && /^(\^[A-Z]{3,6}|[A-Z]{4}\d{1,2})$/.test(s);

    if (b.history) {
      if (!valid(b.history)) return json({ error: 'ticker inválido' }, 400);
      const h = await cached(`h:${b.history}`, 3600_000, () => chart(b.history, '3mo', '1d'));
      const ts: number[] = h.timestamp || [], cl: (number | null)[] = h.indicators?.quote?.[0]?.close || [];
      return json({ series: ts.map((t, i) => ({ date: new Date(t * 1000).toISOString().slice(0, 10), close: cl[i] })).filter((x) => x.close != null) });
    }

    if (b.universe) {
      const syms = [...Object.keys(STOCKS), ...FUNDS];
      const res = await pool(syms, 10, (t) => quote(t));
      const rows = res.flatMap((r, i) => (r.status === 'fulfilled' && r.value.chg != null ? [{ ...r.value, sector: STOCKS[syms[i]] || '', sub: STOCKS[syms[i]] ? 'stock' : 'fund' }] : []));
      const ib = await quote('^BVSP').catch(() => null);
      return json({
        stocks: rows.filter((r) => r.sub === 'stock' && r.brl >= 1e6),
        funds: rows.filter((r) => r.sub === 'fund' && r.brl >= 3e5),
        ibov: ib ? { price: ib.price, chg: ib.chg, high: ib.high, low: ib.low } : null,
        asked: syms.length, got: rows.length, at: Date.now(),
      });
    }

    const syms: string[] = Array.isArray(b.symbols) ? [...new Set<string>(b.symbols.map((s: string) => String(s).toUpperCase()))].filter(valid).slice(0, 120) : [];
    if (!syms.length) return json({ error: 'informe symbols' }, 400);
    const res = await pool(syms, b.detail ? 4 : 10, (t) => (b.detail ? detail(t) : quote(t)));
    const data: Record<string, unknown> = {}, errors: Record<string, string> = {};
    res.forEach((r, i) => { if (r.status === 'fulfilled') data[syms[i]] = r.value; else errors[syms[i]] = String((r.reason as Error)?.message || r.reason); });
    return json({ data, errors, at: Date.now() });
  } catch (e) { return json({ error: String((e as Error)?.message || e) }, 500); }
});
