// Agenda de proventos ANUNCIADOS (não é previsão): fotografia curada manualmente a partir dos comunicados das companhias
// divulgados pela imprensa financeira. Datas e valores podem mudar; confira no RI da empresa antes de decidir algo.
// A quantidade de ações com direito é calculada pelo app: posição na DATA COM (quem comprou até essa data tem direito).
import { position } from './calc.js';

export const AGENDA_DATE = '2026-10-06';
export const AGENDA_STALE_DAYS = 45;

/** tipo: DIVIDENDO (isento) | JCP (IR 15% na fonte). ps = valor bruto por ação. */
export const AGENDA = [
  { t: 'PETR4', type: 'JCP', ps: 0.67407131, com: '2026-08-21', pay: '2026-11-23', note: '1ª parcela (100% JCP). Antecipação dos proventos de 2026, aprovada em 06/08.', url: 'https://bpmoney.com.br/mercado/petrobras-petr4-aprova-r-174-bilhoes-em-dividendos-e-jcp-veja-datas-de-pagamento/' },
  { t: 'PETR4', type: 'DIVIDENDO', ps: 0.47156696, com: '2026-08-21', pay: '2026-12-21', note: '2ª parcela (parte em dividendos).', url: 'https://bpmoney.com.br/mercado/petrobras-petr4-aprova-r-174-bilhoes-em-dividendos-e-jcp-veja-datas-de-pagamento/' },
  { t: 'PETR4', type: 'JCP', ps: 0.20250435, com: '2026-08-21', pay: '2026-12-21', note: '2ª parcela (parte em JCP).', url: 'https://bpmoney.com.br/mercado/petrobras-petr4-aprova-r-174-bilhoes-em-dividendos-e-jcp-veja-datas-de-pagamento/' },
  { t: 'ITUB4', type: 'JCP', ps: 0.01765, com: '2026-09-30', pay: '2026-11-03', note: 'JCP mensal (referente a outubro).', url: 'https://www.suno.com.br/noticias/itub4-itau-calendario-jcp-2026-go/' },
  { t: 'ITUB4', type: 'JCP', ps: 0.01765, com: '2026-10-30', pay: '2026-12-01', note: 'JCP mensal (referente a novembro).', url: 'https://www.suno.com.br/noticias/itub4-itau-calendario-jcp-2026-go/' },
  { t: 'ITUB4', type: 'JCP', ps: 0.01765, com: '2026-11-30', pay: '2027-01-04', note: 'JCP mensal (referente a dezembro).', url: 'https://www.suno.com.br/noticias/itub4-itau-calendario-jcp-2026-go/' },
  { t: 'VALE3', type: 'JCP', ps: 1.568705805, com: '2026-08-11', pay: '2026-09-02', note: 'Já pago. Aprovado em 30/07.', url: 'https://renovainvest.com.br/blog/dividendos-vale-vale3/' },
  { t: 'VALE3', type: 'DIVIDENDO', ps: 0.462016093, com: '2026-08-11', pay: '2026-09-02', note: 'Já pago. Aprovado em 30/07.', url: 'https://renovainvest.com.br/blog/dividendos-vale-vale3/' },
  { t: 'BBSE3', type: 'DIVIDENDO', ps: 1.98328466981, com: '2026-08-07', pay: '2026-09-03', note: 'Já pago. Referente ao 1º semestre de 2026.', url: 'https://www.infomoney.com.br/mercados/bb-seguridade-bbse3-pagara-r-385-bilhoes-em-dividendos-ou-r-198-por-acao/' },
  // ---- proventos JÁ PAGOS aos papéis da carteira do usuário (datas e valores conferidos no Investidor10 em 06/10/2026; ps = total bruto ÷ ações)
  { t: 'PETR4', type: 'JCP', ps: 0.313, com: '2026-04-22', pay: '2026-05-20', note: 'Já pago (JCP).', url: 'https://investidor10.com.br/wallet (carteira do usuário, conferido em 06/10/2026)' },
  { t: 'PETR4', type: 'JCP', ps: 0.016333, com: '2026-04-22', pay: '2026-05-20', note: 'Já pago (rend. tributável).', url: 'https://investidor10.com.br/wallet (carteira do usuário, conferido em 06/10/2026)' },
  { t: 'PETR4', type: 'JCP', ps: 0.313, com: '2026-04-22', pay: '2026-06-22', note: 'Já pago (JCP).', url: 'https://investidor10.com.br/wallet (carteira do usuário, conferido em 06/10/2026)' },
  { t: 'PETR4', type: 'JCP', ps: 0.020333, com: '2026-04-22', pay: '2026-06-22', note: 'Já pago (rend. tributável).', url: 'https://investidor10.com.br/wallet (carteira do usuário, conferido em 06/10/2026)' },
  { t: 'PETR4', type: 'JCP', ps: 0.350333, com: '2026-06-01', pay: '2026-08-20', note: 'Já pago (JCP).', url: 'https://investidor10.com.br/wallet (carteira do usuário, conferido em 06/10/2026)' },
  { t: 'PETR4', type: 'JCP', ps: 0.350333, com: '2026-06-01', pay: '2026-09-21', note: 'Já pago (JCP).', url: 'https://investidor10.com.br/wallet (carteira do usuário, conferido em 06/10/2026)' },
  { t: 'ITUB4', type: 'JCP', ps: 0.361667, com: '2026-06-18', pay: '2026-08-28', note: 'Já pago (JCP complementar).', url: 'https://investidor10.com.br/wallet (carteira do usuário, conferido em 06/10/2026)' },
  { t: 'ITUB4', type: 'JCP', ps: 0.01765, com: '2026-06-30', pay: '2026-08-03', note: 'Já pago (JCP mensal).', url: 'https://investidor10.com.br/wallet (carteira do usuário, conferido em 06/10/2026)' },
  { t: 'ITUB4', type: 'JCP', ps: 0.01765, com: '2026-07-31', pay: '2026-09-01', note: 'Já pago (JCP mensal).', url: 'https://investidor10.com.br/wallet (carteira do usuário, conferido em 06/10/2026)' },
  { t: 'ITUB4', type: 'JCP', ps: 0.01765, com: '2026-08-31', pay: '2026-10-01', note: 'Já pago (JCP mensal).', url: 'https://investidor10.com.br/wallet (carteira do usuário, conferido em 06/10/2026)' },
  { t: 'JEPQ', type: 'DIVIDENDO', ps: 2.89, com: '2026-09-30', pay: '2026-10-05', note: 'Já pago (ETF internacional; valor por cota já em R$). Retido na fonte nos EUA.', url: 'https://investidor10.com.br/wallet (carteira do usuário, conferido em 06/10/2026)' },
];

export const staleDays = (today = new Date()) => Math.floor((today - new Date(AGENDA_DATE + 'T12:00:00')) / 86400000);

/** Para cada item da agenda de um papel que você possui (ou possuía na data com), calcula direito, bruto e líquido. */
export function agendaFor(assets, investTx, dividends = [], today) {
  const out = [];
  for (const a of assets) {
    if (a.assetClass === 'RENDA_FIXA') continue;
    const items = AGENDA.filter(x => x.t === a.ticker.toUpperCase()); if (!items.length) continue;
    const txs = investTx.filter(t => t.assetId === a.id);
    for (const x of items) {
      const qty = position(txs, x.com).qty;
      if (!(qty > 0)) continue;
      const gross = qty * x.ps, net = x.type === 'JCP' ? gross * 0.85 : gross;
      const logged = dividends.some(d => d.assetId === a.id && Math.abs(Date.parse(d.payDate) - Date.parse(x.pay)) <= 4 * 864e5 && d.type === x.type);
      out.push({ ...x, assetId: a.id, qty, gross, net, paid: x.pay <= today, logged });
    }
  }
  return out.sort((p, q) => p.pay.localeCompare(q.pay) || p.t.localeCompare(q.t));
}
