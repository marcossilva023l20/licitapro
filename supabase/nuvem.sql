-- ============================================================================
-- Nuvem (acessar de outro computador) — cole este arquivo inteiro no
-- SQL Editor do Supabase e clique em Run. É uma vez só.
--
-- Para que serve: o sistema publicado no GitHub Pages não tem servidor, então
-- ele guarda o "cofre" dos seus dados aqui, cifrado com o código de acesso que
-- você escolher. O banco só vê texto cifrado: sem o código, ninguém lê nada.
--
-- A chave pública (anon/publishable) do projeto pode ler e gravar somente esta
-- tabela — as outras continuam fechadas para ela.
-- ============================================================================

create table if not exists licitapro_cofre (
  id text primary key,
  conteudo jsonb not null,
  atualizado_em timestamptz not null default now()
);

alter table licitapro_cofre enable row level security;

-- A tabela é reutilizada do zero: apaga as políticas antigas, se existirem.
drop policy if exists licitapro_cofre_ler on licitapro_cofre;
drop policy if exists licitapro_cofre_gravar on licitapro_cofre;
drop policy if exists licitapro_cofre_atualizar on licitapro_cofre;

-- O site (chave pública) lê e grava o cofre. O conteúdo é cifrado no navegador,
-- por isso a chave pública poder circular não abre os seus dados.
create policy licitapro_cofre_ler on licitapro_cofre
  for select to anon using (true);

create policy licitapro_cofre_gravar on licitapro_cofre
  for insert to anon with check (true);

create policy licitapro_cofre_atualizar on licitapro_cofre
  for update to anon using (true) with check (true);
