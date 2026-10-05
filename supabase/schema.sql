-- LookTheMoney — esquema do banco (Supabase / Postgres) — modelo de 2 usuários (finanças privadas, investimentos compartilhados)
-- Execute no SQL Editor do Supabase (uma vez). É idempotente: pode rodar de novo com segurança.
-- Segurança: RLS ligado em todas as tabelas; cada linha pertence a auth.uid() e só o dono lê/escreve.

create table if not exists public.accounts (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  name text not null,
  kind text not null default 'checking',
  initial_balance numeric not null default 0,
  primary key (user_id, id)
);

create table if not exists public.cards (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  name text not null,
  last4 text,
  credit_limit numeric not null default 0,
  close_day int not null check (close_day between 1 and 31),
  due_day int not null check (due_day between 1 and 31),
  account_id text,
  primary key (user_id, id)
);

create table if not exists public.transactions (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  date date not null,
  description text not null,
  category text not null,
  kind text not null check (kind in ('despesa','receita','aporte','fatura','resgate')),
  amount numeric not null,                 -- com sinal: despesa/aporte negativos, receita positiva
  account_id text,
  card_id text,
  recurrence text not null default 'none', -- none | monthly | installment
  series_id text,
  installment_no int,
  installment_total int,
  invest_tx_id text,                       -- vínculo com operação de investimento
  bill_key text,                           -- vínculo com pagamento de conta
  recurrence_ended boolean,
  imported boolean,
  created_at timestamptz default now(),
  primary key (user_id, id)
);
create index if not exists transactions_user_date on public.transactions (user_id, date);

create table if not exists public.bills (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  name text not null,
  due_day int not null check (due_day between 1 and 31),
  amount numeric not null,
  meta text,
  category text,
  recurrence text not null default 'monthly', -- monthly | installment | once
  installments int,
  start_ym text,
  account_id text,
  primary key (user_id, id)
);

create table if not exists public.bill_payments (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,                         -- 'billId|YYYY-MM' ou 'card:cardId|YYYY-MM'
  paid_at date,
  amount numeric,
  account_id text,
  tx_id text,
  primary key (user_id, id)
);

create table if not exists public.budget_plans (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,                         -- categoria
  planned numeric not null default 0,
  primary key (user_id, id)
);

create table if not exists public.goals (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  name text not null,
  icon text,
  place text,
  saved numeric not null default 0,
  target numeric not null default 0,
  monthly numeric not null default 0,
  deadline text,
  link_invest boolean,
  primary key (user_id, id)
);

create table if not exists public.settings (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  value jsonb,
  primary key (user_id, id)
);

-- =====================================================================================
-- DOMICÍLIO (2 usuários): finanças são privadas (user_id); investimentos são compartilhados (household_id)
-- =====================================================================================

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text not null default 'Usuário',
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

-- domicílio do usuário logado (SECURITY DEFINER evita recursão de RLS)
alter table public.household_members add column if not exists avatar text
  check (avatar is null or (length(avatar) < 60000 and avatar like 'data:image/jpeg;base64,%'));

create or replace function public.my_household() returns uuid
language sql stable security definer set search_path = public as $$
  select household_id from public.household_members where user_id = auth.uid() limit 1;
$$;
revoke all on function public.my_household() from public, anon;
grant execute on function public.my_household() to authenticated;

-- Migração: se as tabelas de investimento existirem no formato antigo (por usuário) e estiverem VAZIAS, recria-as;
-- se tiverem dados, aborta para você decidir (nada é apagado com dados).
do $$
declare t text; n bigint;
begin
  foreach t in array array['assets','invest_tx','dividends','targets','snapshots'] loop
    if exists (select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name='user_id') then
      execute format('select count(*) from public.%I', t) into n;
      if n > 0 then raise exception 'Tabela % tem % linhas no formato antigo; migre os dados manualmente antes.', t, n; end if;
      execute format('drop table public.%I', t);
    end if;
  end loop;
end $$;

create table if not exists public.assets (
  household_id uuid not null default public.my_household() references public.households(id) on delete cascade,
  created_by uuid default auth.uid(),
  id text not null,
  ticker text not null,
  name text,
  asset_class text not null check (asset_class in ('ACAO_BR','FII','ETF','EUA_BDR','RENDA_FIXA','CRIPTO')),
  currency text not null default 'BRL',
  fixed_income jsonb,                       -- {indexer, rate, issuer, maturity}
  manual_price numeric,
  manual_price_at timestamptz,
  price_source text default 'auto',
  cg_id text,
  primary key (household_id, id),
  unique (household_id, ticker)
);

create table if not exists public.invest_tx (
  household_id uuid not null default public.my_household() references public.households(id) on delete cascade,
  created_by uuid default auth.uid(),       -- quem registrou (account_id só faz sentido para ele)
  id text not null,
  asset_id text not null,
  type text not null check (type in ('COMPRA','VENDA')),
  date date not null,
  quantity numeric not null check (quantity > 0),
  price numeric not null check (price > 0),
  fees numeric not null default 0,
  fx numeric,
  account_id text,
  created_at timestamptz default now(),
  primary key (household_id, id)
);
create index if not exists invest_tx_hh_asset on public.invest_tx (household_id, asset_id, date);

create table if not exists public.dividends (
  household_id uuid not null default public.my_household() references public.households(id) on delete cascade,
  created_by uuid default auth.uid(),
  id text not null,
  asset_id text not null,
  type text not null check (type in ('DIVIDENDO','JCP','RENDIMENTO')),
  pay_date date not null,
  per_share numeric not null,
  quantity numeric not null,
  amount numeric not null,                  -- líquido (JCP já com IR 15% descontado)
  primary key (household_id, id)
);

create table if not exists public.targets (
  household_id uuid not null default public.my_household() references public.households(id) on delete cascade,
  id text not null,                         -- classe
  percent numeric not null default 0,
  primary key (household_id, id)
);

create table if not exists public.snapshots (
  household_id uuid not null default public.my_household() references public.households(id) on delete cascade,
  id text not null,                         -- 'YYYY-MM-DD'
  date date not null,
  value numeric not null,
  est boolean default false,                -- dia estimado (sem cotação histórica)
  primary key (household_id, id)
);

-- configurações compartilhadas (token da brapi, tolerância de rebalanceamento)
create table if not exists public.household_settings (
  household_id uuid not null default public.my_household() references public.households(id) on delete cascade,
  id text not null,
  value jsonb,
  primary key (household_id, id)
);

-- =====================================================================================
-- SEGURANÇA
-- =====================================================================================

-- 1) 2FA: se o usuário cadastrou um fator TOTP verificado, o banco só libera os dados em sessões AAL2
--    (ou seja, após digitar o código). Quem não cadastrou continua só com senha.
create or replace function public.mfa_ok() returns boolean
language sql stable security definer set search_path = public, auth as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified');
$$;
revoke all on function public.mfa_ok() from public, anon;
grant execute on function public.mfa_ok() to authenticated;

-- 2) RLS. Privado: user_id = auth.uid(). Compartilhado: household_id = meu domicílio. Em ambos, exige 2FA quando ativo.
do $$
declare t text;
begin
  foreach t in array array['accounts','cards','transactions','bills','bill_payments','budget_plans','goals','settings']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('create policy "own rows" on public.%I for all to authenticated using (user_id = auth.uid() and (select public.mfa_ok())) with check (user_id = auth.uid() and (select public.mfa_ok()))', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
  foreach t in array array['assets','invest_tx','dividends','targets','snapshots','household_settings']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('drop policy if exists "household rows" on public.%I', t);
    execute format('create policy "household rows" on public.%I for all to authenticated using (household_id = (select public.my_household()) and (select public.mfa_ok())) with check (household_id = (select public.my_household()) and (select public.mfa_ok()))', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- domicílio e membros: cada um lê os membros do próprio domicílio e só edita o próprio nome de exibição
alter table public.households enable row level security;
alter table public.households force row level security;
revoke all on public.households from anon, authenticated;
alter table public.household_members enable row level security;
alter table public.household_members force row level security;
drop policy if exists "members read" on public.household_members;
create policy "members read" on public.household_members for select to authenticated using (household_id = (select public.my_household()));
drop policy if exists "member edits self" on public.household_members;
create policy "member edits self" on public.household_members for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.household_members from anon, authenticated;
grant select on public.household_members to authenticated;
grant update (display_name, avatar) on public.household_members to authenticated;

-- 3) Cadastro fechado: só e-mails da lista conseguem criar conta (senha, link mágico ou qualquer outro método).
--    A lista não é acessível pela API. Autorize o seu e-mail ANTES de criar a conta (ver README):
--      insert into public.allowed_emails(email) values ('voce@exemplo.com');
create table if not exists public.allowed_emails (email text primary key check (email = lower(email)));
alter table public.allowed_emails enable row level security;
alter table public.allowed_emails force row level security;
revoke all on public.allowed_emails from anon, authenticated;

create or replace function public.block_unlisted_signups() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.allowed_emails a where a.email = lower(new.email)) then
    raise exception 'Cadastro não autorizado' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.block_unlisted_signups() from public, anon, authenticated;

drop trigger if exists ltm_block_signups on auth.users;
create trigger ltm_block_signups before insert on auth.users for each row execute function public.block_unlisted_signups();

-- 4) Entrada no domicílio: o 1º cadastro cria o domicílio; o 2º entra nele. Limite de 2 membros.
create or replace function public.join_household() returns trigger
language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  select id into hid from public.households order by created_at limit 1;
  if hid is null then insert into public.households default values returning id into hid; end if;
  if (select count(*) from public.household_members where household_id = hid) >= 2 then
    raise exception 'Domicílio completo (limite de 2 usuários)' using errcode = 'P0001';
  end if;
  insert into public.household_members(household_id, user_id, display_name)
  values (hid, new.id, initcap(split_part(new.email, '@', 1)));
  return new;
end $$;
revoke all on function public.join_household() from public, anon, authenticated;

drop trigger if exists ltm_join_household on auth.users;
create trigger ltm_join_household after insert on auth.users for each row execute function public.join_household();
