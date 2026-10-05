# LookTheMoney

Controle de **finanças pessoais** e **investimentos** em um só lugar. Site estático (HTML + JS puro, sem build), design Nocturne, dados em Supabase (com login e RLS) ou, sem configurar nada, só no seu navegador.

## O que tem

**Finanças:** visão geral, receitas e despesas (parcelamento e recorrência), cartões com fechamento/vencimento da fatura, contas a pagar com calendário, orçamento por categoria, metas com previsão, relatórios e insights automáticos, importação de extrato CSV.

**Investimentos:** carteira (ações, FIIs, ETFs, BDR/EUA, renda fixa, cripto), preço médio, proventos (JCP com IR 15%), desempenho vs CDI (TWR), alocação com metas e simulador de aporte por rebalanceamento (sem vender), cotações reais com cache de 15 min e preço manual como fallback.

## Rodar no Windows (modo local, sem conta)

1. Instale o [Node.js LTS](https://nodejs.org).
2. Dê dois cliques em `iniciar.bat` (abre http://localhost:8080).
3. Na primeira tela, use **Carregar dados de exemplo** para explorar, ou comece do zero.

Modo local = dados só neste navegador (IndexedDB). Limpar o cache apaga tudo: use **Configurações → Exportar dados** com frequência.

Testes: `npm test` (cálculos: PM, TWR, CDI, rebalanceamento, fatura, parcelas).

## Colocar 100% online (GitHub Pages + Supabase)

Arquitetura: o **código** fica no GitHub (público ou privado, sem nenhum dado); os **dados** ficam só no Supabase, protegidos por login, 2FA e RLS. O GitHub Actions testa e publica o site a cada `git push`.

### 1. Supabase (uma vez)

1. Crie um projeto em supabase.com (anote a senha do banco num gerenciador de senhas).
2. **SQL Editor** → cole `supabase/schema.sql` → Run. (Idempotente: pode rodar de novo ao atualizar.)
3. **Autorize o seu e-mail** (o cadastro é fechado; sem isso ninguém, nem você, consegue criar conta):
   ```sql
   insert into public.allowed_emails(email) values ('seu-email@exemplo.com');
   ```
   Use o e-mail em minúsculas. Para uma segunda pessoa (ex.: cônjuge), repita o comando com o e-mail dela; cada uma enxerga só os próprios dados.
4. **Authentication → Sign In / Providers → Email**: mantenha *Confirm email* ligado. Em **Password**, exija senha forte (mín. 12) e ligue *Leaked password protection* (se disponível no seu plano).
5. **Authentication → URL Configuration**: *Site URL* = `https://SEU-USUARIO.github.io/NOME-DO-REPO/` e a mesma URL em *Redirect URLs*.
6. **Project Settings → API**: copie *Project URL* e a chave **anon / publishable**. Nunca a `service_role`.

### 2. GitHub (Windows, PowerShell, na pasta do projeto)

Antes do primeiro commit, mova o workflow para o lugar que o GitHub exige:

```powershell
mkdir .github\workflows
move deploy-github-pages.yml .github\workflows\deploy.yml
```

```powershell
git init -b main
git add .
git commit -m "LookTheMoney"
git remote add origin https://github.com/SEU-USUARIO/NOME-DO-REPO.git
git push -u origin main
```

No GitHub, no repositório:

1. **Settings → Secrets and variables → Actions → aba Variables → New repository variable**: crie `SUPABASE_URL` e `SUPABASE_ANON_KEY` (a URL e a chave anon do passo 6 acima). A anon key é pública por desenho; o que protege os dados é o RLS. Ela fica nas variáveis (e não no código) só para o repositório não carregar credencial nenhuma.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. **Actions → Deploy → Run workflow** (ou qualquer novo `push`). Em ~1 min o site estará em `https://SEU-USUARIO.github.io/NOME-DO-REPO/`.
4. Abra o site, **Criar conta** com o e-mail autorizado, confirme o e-mail e entre.
5. **Configurações → Autenticação em duas etapas → Ativar 2FA** (Google/Microsoft Authenticator). A partir daí o próprio banco só libera seus dados em sessões com o código.

Se o deploy falhar, a mensagem no Actions diz o motivo (variável ausente, chave com role errada, teste quebrado). O site publicado **nunca** cai em modo local: sem Supabase configurado ele mostra erro em vez de gravar dados soltos no navegador.

### Como os dados são protegidos

| Camada | O que faz |
|---|---|
| RLS + `force` | Cada linha tem `user_id = auth.uid()`; ninguém lê/escreve dado alheio. Privilégios mínimos (sem TRUNCATE; `anon` sem acesso). |
| Cadastro fechado | Gatilho em `auth.users` só aceita e-mails da tabela `allowed_emails` (inacessível pela API). |
| 2FA (TOTP) | Com fator ativo, a política de RLS exige sessão `aal2`: mesmo senha vazada + token roubado em aal1 não leem nada. |
| Sem segredos no repo | Chave anon injetada no deploy; `service_role` nunca no front-end (o deploy recusa). |
| CSP no `index.html` | Só carrega scripts/fontes do próprio site; só conecta ao Supabase e às 4 APIs de cotação. Fonte Inter hospedada localmente. |
| Sem terceiros | Sem CDN, analytics ou fontes externas. |

Limites honestos: quem controla sua conta do GitHub controla o código publicado (ative 2FA no GitHub e *branch protection*); o token da brapi fica na tabela `settings` (protegida por RLS) mas vai ao navegador; o Supabase gratuito **não** oferece backup restaurável por você, então baixe **Configurações → Exportar dados** periodicamente (ex.: 1x por mês) e guarde fora do computador. Pausa por inatividade: projetos gratuitos pausam após 7 dias sem uso; abra o site ao menos 1x por semana.

## Cotações (APIs gratuitas, chamadas do navegador)

| Fonte | Uso | Observações |
|---|---|---|
| brapi.dev | ações, FIIs, ETFs, BDRs | Sem token só PETR4, VALE3, ITUB4, MGLU3. Plano grátis: 1 ativo por requisição, 15 mil req/mês, histórico de 3 meses. Cole o token em **Configurações** (fica no seu banco, não no código). |
| CoinGecko | cripto | informe o `cgId` no cadastro do ativo |
| AwesomeAPI | dólar | usado em ativos em USD |
| BCB SGS 12 / 433 | CDI / IPCA | base do desempenho vs CDI e da renda fixa |

Se uma API falhar, o app usa o último valor em cache (marcado como desatualizado) ou o **preço manual**.

## Convenções e limites (leia antes de confiar nos números)

- **Preço médio:** (Σ qtd × preço + taxas) / Σ qtd. Venda não altera o PM; zerar a posição reinicia o PM.
- **Renda fixa:** quantidade = valor aplicado (preço 1), valorizada **na curva** (CDI / PRÉ / IPCA+), **bruta** de IR e **sem marcação a mercado**. Resgate antecipado pode render menos.
- **Desempenho (TWR):** depende de snapshots diários. Dias sem cotação histórica (o plano grátis só traz 3 meses) são **estimados** (valor do dia anterior + fluxo) e o retorno é distribuído até o primeiro ponto real. Abra o app com frequência: cada dia aberto vira um ponto real. O gráfico avisa quando há trecho estimado.
- **"R$ a mais que o CDI"** é ponderado por dinheiro (cada aporte vs 100% do CDI) e pode divergir do "% do CDI" (ponderado por tempo) quando grandes aportes antecedem períodos fracos.
- **Saldo das contas:** compras no cartão só reduzem o saldo quando você **paga a fatura** (Contas a pagar → marcar paga).
- **Contas a pagar × lançamentos recorrentes:** use um dos dois para a mesma despesa, senão ela conta em dobro no orçamento.
- **Sem:** importação OFX, categorias personalizadas, cálculo de IR de ações (isenção R$ 20 mil/mês, DARF), marcação a mercado de renda fixa.

## Segurança

- Backup JSON **não é criptografado**; guarde com cuidado (veja a tabela de proteção acima).
- O token da brapi trafega do navegador para a brapi (é inevitável sem um proxy). Para ocultá-lo de vez, crie uma Supabase Edge Function que faça a chamada e guarde o token como secret.
- `sw.js` só faz cache do shell do app; dados e APIs nunca passam pelo cache do service worker.

## Estrutura

```
index.html, app.css, ds/        shell e design system Nocturne
js/calc.js                      cálculos puros (testados)
js/portfolio.js, quotes.js      carteira, snapshots, cotações
js/db.js, store.js              Local (IndexedDB) e Supabase
js/views-*.js, forms-*.js       telas e formulários
supabase/schema.sql             tabelas + RLS
tests/calc.test.js              testes unitários
```
