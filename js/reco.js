// Recomendações de casas de análise (outubro/2026): dados curados MANUALMENTE a partir das publicações de cada casa.
// Não há API gratuita para isso: este arquivo é uma fotografia datada e precisa ser atualizado todo mês (ver README).
// Só registramos fatos (ticker, peso, preço-justo) e teses resumidas com palavras próprias; o consolidado é uma contagem, não uma opinião.

export const RECO_DATE = '2026-10-05';
export const RECO_STALE_DAYS = 35;

export const HOUSES = [
  {
    id: 'btg', name: 'BTG Pactual', short: 'BTG', carteira: 'Carteira 10SIM (ações)', date: '2026-10-01',
    url: 'https://renovainvest.com.br/blog/carteira-recomendada-acoes-btg/',
    note: 'Sem mudanças em relação a setembro.',
    items: [['PETR4', 15], ['ITUB4', 10], ['AXIA3', 10], ['SBSP3', 10], ['RDOR3', 10], ['EMBJ3', 10], ['ENEV3', 10], ['GGBR4', 10], ['MOTV3', 10], ['CURY3', 5]],
  },
  {
    id: 'genial', name: 'Genial Investimentos', short: 'Genial', carteira: 'Ibovespa 10+', date: '2026-10-01',
    url: 'https://analisa.genialinvestimentos.com.br/carteiras-recomendadas/renda-variavel/carteira-recomendada-de-acoes-outubro-de-2026',
    note: 'Pesos iguais. Saíram PETR4, ENEV3 e LWSA3; entraram JHSF3, EMBJ3 e MILS3.',
    items: [['FLRY3', 10], ['UGPA3', 10], ['GGBR4', 10], ['JHSF3', 10], ['EMBJ3', 10], ['CASH3', 10], ['BBSE3', 10], ['MILS3', 10], ['VBBR3', 10], ['CXSE3', 10]],
  },
  {
    id: 'bbbi', name: 'BB Investimentos (BB-BI)', short: 'BB-BI', carteira: 'Carteira 5+', date: '2026-09-30',
    url: 'https://investalk.bb.com.br/noticias/onde-investir/carteira-5-outubro-26',
    note: 'Entraram VALE3 e BPAC11. Carteira acumula +9,79% no ano, abaixo do Ibovespa.',
    items: [['ITUB4', 20], ['PETR4', 20], ['TEND3', 20], ['VALE3', 20], ['BPAC11', 20]],
  },
  {
    id: 'itau', name: 'Itaú BBA', short: 'Itaú BBA', carteira: 'Carteira recomendada (5 ações)', date: '2026-10-05',
    url: 'https://www.moneytimes.com.br/itau-bba-troca-tres-acoes-para-enfrentar-eleicoes-em-outubro-petrobras-tem-potencial-de-alta-de-30/',
    note: 'Entraram XPBR31, SBSP3 e PETR4. Preços-justos divulgados pela casa.',
    items: [['EMBJ3', 20], ['XPBR31', 20], ['ENEV3', 20], ['SBSP3', 20], ['PETR4', 20]],
  },
  {
    id: 'andbank', name: 'Andbank', short: 'Andbank', carteira: 'Dividendos (mandato diferente)', date: '2026-10-01',
    url: 'https://www.moneytimes.com.br/dividendos-de-ate-104-confira-as-acoes-recomendadas-pelo-andbank-para-outubro-jcav/',
    note: 'Carteira focada em dividendos: pesos iguais, yield estimado de 7,85% em 2026.',
    items: [['AXIA3', 10], ['BBSE3', 10], ['BBDC4', 10], ['CMIG4', 10], ['CPLE3', 10], ['CPFE3', 10], ['ISAE4', 10], ['ITUB4', 10], ['ITSA4', 10], ['VALE3', 10]],
  },
  {
    id: 'xp', name: 'XP Investimentos', short: 'XP', carteira: 'Top Ações XP', date: '2026-10-01', partial: true,
    url: 'https://conteudos.xpi.com.br/acoes/carteiras/top-acoes-xp-outubro-2026/',
    note: 'A composição completa é restrita a clientes. Contam aqui só os papéis em que a XP divulgou aumento de posição; reduziu RDOR3 e GGBR4.',
    items: [['BPAC11', null], ['IGTI11', null], ['SBSP3', null]],
  },
];

/** Pesquisa de consenso do InfoMoney (02/10/2026): nº de casas, entre 10 consultadas, que recomendam o papel. */
export const CONSENSUS = {
  total: 10, date: '2026-10-02',
  url: 'https://www.infomoney.com.br/onde-investir/as-7-acoes-mais-recomendadas-outubro-2026/',
  houses: 'Ágora, Andbank, BB Investimentos, BTG Pactual, Genial, Itaú BBA, Planner, Santander, Terra e XP',
  votes: { PETR4: 7, SBSP3: 7, EMBJ3: 7, ITUB4: 7, VALE3: 6, RDOR3: 5, GGBR4: 5 },
};

/** Preço-justo divulgado pelo Itaú BBA (R$). */
export const FAIR = { EMBJ3: 124, ENEV3: 32.7, SBSP3: 33.1, PETR4: 64 };

export const NAMES = {
  PETR4: 'Petrobras', ITUB4: 'Itaú Unibanco', AXIA3: 'Axia Energia', SBSP3: 'Sabesp', RDOR3: "Rede D'Or", EMBJ3: 'Embraer', ENEV3: 'Eneva', GGBR4: 'Gerdau', MOTV3: 'Motiva',
  CURY3: 'Cury', VALE3: 'Vale', BPAC11: 'BTG Pactual (units)', BBSE3: 'BB Seguridade', TEND3: 'Tenda', IGTI11: 'Iguatemi', FLRY3: 'Fleury', UGPA3: 'Ultrapar', JHSF3: 'JHSF',
  CASH3: 'Méliuz', MILS3: 'Mills', VBBR3: 'Vibra', CXSE3: 'Caixa Seguridade', XPBR31: 'XP Inc (BDR)', BBDC4: 'Bradesco', CMIG4: 'Cemig', CPLE3: 'Copel', CPFE3: 'CPFL', ISAE4: 'ISA Energia', ITSA4: 'Itaúsa',
};

// Teses em palavras próprias, resumindo o que as casas apontam (não são citações).
export const THESIS = {
  PETR4: 'Forte geração de caixa e dividendos, com receita atrelada ao dólar.',
  SBSP3: 'Crescimento previsível por contrato, investimentos até 2029 e beneficiada por juros longos em queda.',
  EMBJ3: 'Receita em dólar, carteira de pedidos robusta e margens em melhora.',
  ITUB4: 'Rentabilidade acima dos pares e resultados consistentes; "porto seguro" em cenário eleitoral.',
  VALE3: 'Caixa forte, maior volume de minério e dividendos.',
  GGBR4: 'Proteção cambial: grande parte do resultado vem dos EUA.',
  AXIA3: 'Geração de caixa em energia, recompra de ações aprovada.',
  ENEV3: 'Migração para fluxo estável com contratos de longo prazo.',
  BPAC11: 'Banco de investimentos favorecido por mercado de capitais e juros em queda.',
  BBSE3: 'Altos dividendos e rentabilidade elevada em seguros.',
  RDOR3: 'Margens em expansão e sinistralidade em queda; desconto frente à média histórica.',
};

/**
 * Consolida as carteiras: conta em quantas casas cada papel aparece.
 * Ordem: nº de casas ↓, votos no consenso do InfoMoney ↓, peso médio conhecido ↓, ticker.
 */
export function topN(houses = HOUSES, consensus = CONSENSUS, n = 10) {
  const map = new Map();
  for (const h of houses) for (const [t, w] of h.items) {
    if (!map.has(t)) map.set(t, { t, houses: [], ws: [] });
    const r = map.get(t); r.houses.push({ id: h.id, short: h.short, w, partial: !!h.partial }); if (w != null) r.ws.push(w);
  }
  const rows = [...map.values()].map(r => ({ t: r.t, name: NAMES[r.t] || '', houses: r.houses, n: r.houses.length, cons: consensus.votes[r.t] || 0, avgW: r.ws.length ? r.ws.reduce((a, b) => a + b, 0) / r.ws.length : 0, fair: FAIR[r.t] ?? null, thesis: THESIS[r.t] || '' }));
  rows.sort((a, b) => b.n - a.n || b.cons - a.cons || b.avgW - a.avgW || a.t.localeCompare(b.t));
  return rows.slice(0, n).map((r, i) => ({ ...r, rank: i + 1 }));
}

export const staleDays = (today = new Date()) => Math.floor((today - new Date(RECO_DATE + 'T12:00:00')) / 86400000);
