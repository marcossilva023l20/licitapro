-- DEJ Solutions & Global — tabelas do sistema no Supabase (Postgres).
--
-- Como usar:
--   1. Abra o projeto no Supabase → "SQL Editor" → "New query".
--   2. Cole tudo isto e clique em "Run". Pode rodar mais de uma vez sem problema.
--
-- Depois, no serviço que roda o sistema (Render/Railway/VPS/Docker), informe:
--   SUPABASE_URL           → Project Settings → Data API → Project URL
--   SUPABASE_SERVICE_KEY   → Project Settings → API keys → service_role (secret)
--
-- A chave service_role só pode ficar no SERVIDOR: ela dá acesso total ao banco.
-- Com o RLS ligado e sem políticas (como abaixo), a chave pública (anon) não
-- consegue ler nem gravar nada — o sistema fala com o banco pelo servidor.

create table if not exists public.licitapro_perfil (
  id             integer primary key,
  dados          jsonb not null default '{}'::jsonb,
  atualizado_em  timestamptz not null default now()
);

create table if not exists public.licitapro_documentos (
  id             uuid primary key,
  dados          jsonb not null,
  atualizado_em  timestamptz not null default now()
);

create table if not exists public.licitapro_sequencia (
  chave          text primary key,
  por_ano        jsonb not null default '{}'::jsonb,
  atualizado_em  timestamptz not null default now()
);

alter table public.licitapro_perfil     enable row level security;
alter table public.licitapro_documentos enable row level security;
alter table public.licitapro_sequencia  enable row level security;

-- Índice para listar os documentos do mais novo para o mais antigo.
create index if not exists licitapro_documentos_atualizado_em_idx
  on public.licitapro_documentos (atualizado_em desc);
