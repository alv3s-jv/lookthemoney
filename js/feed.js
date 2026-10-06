// Ponte para a Edge Function "mercado" do Supabase (cotações da B3 via Yahoo Finance, sem token e sem limite por ativo).
// Se a função não estiver publicada ou falhar, os chamadores caem na brapi. Registrada em main.js quando há login na nuvem.
export const edge = { call: null, deadUntil: 0 };

export const edgeOn = () => !!edge.call && Date.now() > edge.deadUntil;

/** Chama a função; em erro de rede/404/5xx suspende por 5 min para não atrasar cada atualização. */
export async function edgeCall(body) {
  if (!edgeOn()) throw new Error('função "mercado" indisponível');
  try { return await edge.call(body); }
  catch (e) { edge.deadUntil = Date.now() + 5 * 60 * 1000; throw e; }
}
