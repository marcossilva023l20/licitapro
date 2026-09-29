-- ============================================================================
--  OPCIONAL — abrir as tabelas para a chave PÚBLICA (anon)
-- ============================================================================
--
--  Use este arquivo SOMENTE se você não quiser usar a chave de servidor
--  (service_role / sb_secret_...) e preferir continuar com a chave anon /
--  sb_publishable_ que já tem.
--
--  O que ele faz: o RLS continua ligado, mas passa a permitir que o papel
--  `anon` leia e grave nas três tabelas do sistema.
--
--  ⚠️ Consequência: a chave anon é feita para ser pública (é a que roda no
--  navegador do visitante). Quem tiver essa chave consegue ler, alterar e
--  apagar os seus documentos direto no banco, sem passar pelo sistema.
--
--  O caminho recomendado é o outro: informe a chave service_role (ou a secret
--  key) em SUPABASE_SERVICE_KEY — ela fica só no servidor, ignora o RLS e
--  ninguém mais tem acesso ao banco.
-- ============================================================================

create policy "sistema le o perfil"    on public.licitapro_perfil     for select to anon using (true);
create policy "sistema grava o perfil" on public.licitapro_perfil     for insert to anon with check (true);
create policy "sistema atualiza o perfil" on public.licitapro_perfil  for update to anon using (true) with check (true);

create policy "sistema le documentos"    on public.licitapro_documentos for select to anon using (true);
create policy "sistema grava documentos" on public.licitapro_documentos for insert to anon with check (true);
create policy "sistema atualiza documentos" on public.licitapro_documentos for update to anon using (true) with check (true);
create policy "sistema apaga documentos" on public.licitapro_documentos for delete to anon using (true);

create policy "sistema le numeracao"    on public.licitapro_sequencia for select to anon using (true);
create policy "sistema grava numeracao" on public.licitapro_sequencia for insert to anon with check (true);
create policy "sistema atualiza numeracao" on public.licitapro_sequencia for update to anon using (true) with check (true);
