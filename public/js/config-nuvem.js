/*
 * Onde o sistema guarda as contas quando roda sem servidor (GitHub Pages).
 *
 * Estes dois valores são **públicos de propósito** — é o que o navegador usa
 * para falar com o projeto Supabase. A chave é a *anon/publishable*: ela não dá
 * acesso a dado nenhum por si só, porque o conteúdo do cofre é **cifrado no
 * navegador com a senha da conta** (veja supabase/nuvem.sql). A chave de
 * servidor (service_role / sb_secret_...) NUNCA entra aqui — nem em nenhum
 * arquivo do site: quem grava sem cifra é só o servidor, e a credencial dele
 * fica na máquina onde o servidor roda.
 *
 * Para trocar de projeto, é só editar os dois valores abaixo (ou abrir o
 * sistema por um link com ?nuvem=..., que tem prioridade sobre eles).
 */
window.NuvemPadrao = {
  url: 'https://dynebhtodtkbtydzgouo.supabase.co',
  // chave pública (anon) do projeto — a mesma que aparece em Settings → API Keys
  chave: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR5bmViaHRvZHRrYnR5ZHpnb3VvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1MTc0OTgsImV4cCI6MjEwNTA5MzQ5OH0.T217Fpknh02Uoih64rhSE-f3rgZi6FnxHMebGH41Av0',
};
