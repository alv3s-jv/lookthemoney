// Configuração pública. A chave "anon" do Supabase é feita para ficar no front-end (a segurança vem do RLS).
// NÃO coloque aqui a service_role key. Deixe vazio para usar o modo local (dados só neste navegador).
export const CONFIG = {
  supabaseUrl: '',      // ex.: 'https://xxxx.supabase.co'
  supabaseAnonKey: '',  // ex.: 'eyJhbGciOi...'
  brapiToken: '',       // opcional; prefira informar em Configurações (fica no seu banco, não no repositório)
};
