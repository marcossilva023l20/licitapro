# Colocar o sistema no ar — passo a passo

Este guia é para quem **não quer mexer com terminal**: só cliques, com os valores já certos
para este projeto. No fim você terá:

- o sistema rodando num endereço próprio (Render), e
- os documentos guardados no **seu** projeto Supabase (não somem quando o serviço reinicia).

São três partes e cerca de 15 minutos. Também dá para ficar só no GitHub Pages — veja a
última seção (é grátis e já está pronto).

---

## Parte 0 — Juntar o código na branch principal (uma vez)

O Render publica a partir da branch **`main`**, então ela precisa ter o sistema atualizado.

1. Abra <https://github.com/marcossilva023l20/licitapro/pull/1>
2. Clique no botão verde **Merge pull request** e depois em **Confirm merge**.

Opcional (recomendado): deixar o GitHub Pages publicando a partir da `main` também —
<https://github.com/marcossilva023l20/licitapro/settings/pages> → **Source** → Branch
`main` + pasta `/ (root)` → **Save**. Sem isso o site publicado continua vindo da branch
atual, que é temporária.

---

## Parte 1 — Supabase (o banco)

O banco é onde as propostas, a empresa e a numeração ficam guardadas.

### 1.1 Criar as tabelas do servidor

1. Abra o SQL Editor do seu projeto:
   <https://supabase.com/dashboard/project/dynebhtodtkbtydzgouo/sql/new>
2. Abra o arquivo [`supabase/esquema.sql`](supabase/esquema.sql) deste repositório, copie
   **tudo** e cole na janela do SQL Editor.
3. Clique em **Run**. Deve aparecer *Success. No rows returned*.

> A tabela `licitapro_cofre` (do `nuvem.sql`) já está lá e continua sendo usada pela
> **conta** do site publicado — o `esquema.sql` cuida das outras três tabelas
> (`licitapro_perfil`, `licitapro_documentos`, `licitapro_sequencia`), que são as do
> servidor hospedado.

### 1.2 Copiar a chave de servidor

1. Abra <https://supabase.com/dashboard/project/dynebhtodtkbtydzgouo/settings/api-keys>
2. Na lista **Project API keys**, ache a linha `service_role` (em projeto novo: **secret
   key**, começa com `sb_secret_`), clique em **Reveal** e em **Copy**.

⚠️ **Essa chave dá acesso total ao banco.** Ela vai ficar **só** dentro do Render (passo 2.4)
e no seu computador, se você usar o sistema local. Nunca cole no site, no repositório ou em
conversas. Se desconfiar que ela vazou, clique em **Revoke** e gere outra.

---

## Parte 2 — Render (o servidor)

### 2.1 Criar a conta

1. Abra <https://render.com> e clique em **Get Started**.
2. Entre com **GitHub** (é o mesmo login do repositório — isso deixa o Render achar o
   repositório e publicar as atualizações sozinho).

### 2.2 Criar o serviço

1. No painel do Render: **New +** → **Web Service**.
2. Escolha o repositório **`marcossilva023l20/licitapro`** (se não aparecer, clique em
   **Configure account** e libere o acesso ao repositório `licitapro`; ela é pública, então
   também funciona por **Public Git repository** colando
   `https://github.com/marcossilva023l20/licitapro`).
3. Preencha assim:

   | Campo | Valor |
   |---|---|
   | **Name** | `licitapro` (o endereço fica `licitapro-xxxx.onrender.com`) |
   | **Branch** | `main` |
   | **Language / Runtime** | `Node` |
   | **Build Command** | `npm install --omit=dev --no-audit --no-fund` |
   | **Start Command** | `node server/index.js` |
   | **Health Check Path** | `/api/health` |
   | **Instance Type** | `Free` para conhecer · `Starter` para uso de verdade |

### 2.3 (Opcional) Disco para as fotos

As **fotos enviadas pelo editor** ficam em arquivo, não no banco. No plano `Free` o disco é
apagado a cada reinício (os documentos continuam no Supabase; as fotos, não).

Se quiser que as fotos também sobrevivam: em **Advanced → Disks** adicione um disco com
**Mount Path** `/var/data` (plano pago) — e informe a variável do passo seguinte.

### 2.4 Variáveis de ambiente

Ainda na tela de criação (ou depois, em **Environment**), adicione uma por uma em
**Add Environment Variable**:

| Nome | Valor |
|---|---|
| `NODE_VERSION` | `22` |
| `SUPABASE_URL` | `https://dynebhtodtkbtydzgouo.supabase.co` |
| `SUPABASE_SERVICE_KEY` | a chave copiada no passo 1.2 |
| `LICITAPRO_DATA_DIR` | `/var/data` — só se você criou o disco do passo 2.3 |

### 2.5 Publicar

Clique em **Create Web Service** (ou **Deploy**) e acompanhe o log. Quando aparecer
**Live**, clique no endereço `https://licitapro-xxxx.onrender.com`.

> No plano gratuito o serviço "dorme" depois de um tempo sem uso: a primeira abertura do dia
> pode levar cerca de um minuto; depois fica normal.

---

## Parte 3 — Conferir que está guardando no banco

1. Abra o endereço do Render e, no painel do sistema, veja a linha de situação dos dados:
   deve dizer **"Banco de dados conectado (Supabase): empresa e documentos salvos no banco."**
2. Abra `https://SEU-ENDERECO.onrender.com/api/health` — procure por
   `"armazenamento":"supabase"` e `"conectado":true`.
3. No sistema: **+ Nova proposta** → preencha um item → **Salvar**.
4. No Supabase: **Table Editor** → tabela `licitapro_documentos` → a linha aparece na hora.

---

## Se algo não der certo

| O que você vê | O que provavelmente é | O que fazer |
|---|---|---|
| `/api/health` mostra `"armazenamento":"arquivo"` | as variáveis não chegaram | confira os nomes exatos (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`) e clique em **Manual Deploy → Deploy latest commit** |
| Painel do sistema: *"O banco (Supabase) não está recebendo os dados: …"* | chave errada (a *anon* não grava) ou falta rodar o SQL | use a chave `service_role`/`secret` do passo 1.2 e rode o `esquema.sql` do passo 1.1 |
| `relation "…" does not exist` | as tabelas ainda não existem | rode o `esquema.sql` (passo 1.1) |
| Site abriu mas os dados antigos não estão lá | os documentos estavam só no navegador de antes | no sistema antigo use **Baixar backup** no menu e **Restaurar backup** no novo endereço |
| Deploy falhou no Render | build sem as dependências | confira se o Build Command é o do passo 2.2 |

**Atenção:** o sistema não tem login próprio. Quem tiver o endereço abre e mexe. Para uso
real, proteja o acesso (senha no serviço, *Access Control* do Render ou um proxy na frente).

---

## Alternativa: sem hospedagem nenhuma (GitHub Pages)

Se preferir não pagar nada nem manter servidor, o site publicado
<https://marcossilva023l20.github.io/licitapro> já faz o serviço:

1. Abra o site e, na tela **Entrar / Criar conta**, escolha um **e-mail** e uma **senha**
   (mínimo 6 caracteres) e clique em **Criar conta**. O endereço do projeto e a chave pública
   já vêm gravados no site (`public/js/config-nuvem.js`).
2. Em qualquer outro computador, abra o mesmo endereço, informe o mesmo e-mail e a mesma senha
   e clique em **Entrar**. Use o botão **"link para o outro computador"** (dentro de
   *Conta e nuvem*) quando o projeto não for o do site — ele leva o endereço e a chave.

Aí tudo (documentos, empresa, numeração e fotos) viaja cifrado com a **sua senha**: no banco
só existe texto ilegível, e a senha nunca é enviada. A diferença para o Render é o que roda
onde: no Pages tudo acontece no navegador; no Render existe um servidor (mais rápido para
planilhas grandes e fotos, e o endereço é só seu).
