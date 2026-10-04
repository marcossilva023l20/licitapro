-- ============================================================================
-- Nuvem (abrir o sistema de outro computador) — cole este arquivo INTEIRO no
-- SQL Editor do Supabase e clique em Run. É uma vez só, por projeto.
--
-- Para que serve: o sistema publicado no GitHub Pages não tem servidor, então
-- ele guarda o "cofre" das suas contas aqui, cifrado com a SENHA de cada
-- conta (AES-256-GCM no navegador). O banco só vê texto cifrado: sem a senha,
-- ninguém lê nada — nem quem tem a chave pública do projeto.
--
-- A chave pública (anon/publishable) pode ler e gravar SOMENTE esta tabela.
-- As outras tabelas (as do servidor: perfil, documentos, sequência) continuam
-- fechadas para ela — quem grava nelas é o servidor, com a chave de serviço.
--
-- Pode rodar de novo sem medo: o script não apaga dados (create if not exists
-- e as políticas são recriadas).
-- ============================================================================

create table if not exists licitapro_cofre (
  id text primary key,
  conteudo jsonb not null,
  atualizado_em timestamptz not null default now()
);

alter table licitapro_cofre enable row level security;

-- Recria as políticas do zero (se já existirem, são substituídas).
drop policy if exists licitapro_cofre_ler on licitapro_cofre;
drop policy if exists licitapro_cofre_gravar on licitapro_cofre;
drop policy if exists licitapro_cofre_atualizar on licitapro_cofre;
drop policy if exists licitapro_cofre_apagar on licitapro_cofre;

-- O site (chave pública) lê, grava, atualiza e apaga linhas do cofre. O
-- conteúdo é cifrado no navegador, por isso a chave pública pode circular.
create policy licitapro_cofre_ler on licitapro_cofre
  for select to anon using (true);

create policy licitapro_cofre_gravar on licitapro_cofre
  for insert to anon with check (true);

create policy licitapro_cofre_atualizar on licitapro_cofre
  for update to anon using (true) with check (true);

create policy licitapro_cofre_apagar on licitapro_cofre
  for delete to anon using (true);

-- Conferência: a última linha do resultado deve mostrar "tudo pronto".
-- (a conferência de gravação de verdade é o botão "Testar a conexão" no site)
select
  'tudo pronto' as resultado,
  (select count(*) from pg_policies where tablename = 'licitapro_cofre') as politicas_do_cofre;
