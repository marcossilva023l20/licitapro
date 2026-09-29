# Começar do zero: conta na nuvem em 10 minutos

Este é o caminho mais curto para o sistema **guardar de verdade** (e abrir em qualquer
computador). São 6 passos, todos de clique. No fim de cada um você sabe se deu certo.

> **Antes de tudo:** o sistema salva no navegador o tempo todo — o que vamos montar aqui é
> a **conta**, o lugar de onde os dados abrem em qualquer máquina. Se alguma etapa falhar,
> o que você já digitou não se perde.

---

## Por que Supabase (e não Firebase)

| | Supabase (escolhido) | Firebase |
|---|---|---|
| O que o site precisa | **1 tabela + 1 arquivo de SQL** colado no navegador | Console do Firebase + habilitar Firestore + regras escritas à mão |
| Chave que vai no site | Pública (*anon*/*publishable*) — serve só para o cofre cifrado | Config do app web (também pública) |
| Guardar o que o sistema manda | Linha de tabela comum, dá para ver no painel | Documentos no Firestore (consulta por índice) |
| Plano grátis | Generoso e sem cartão | Sem cartão também, mas com limites diferentes |
| Já testado neste projeto | Sim: tabela criada, leitura conferida pela chave pública | Ficou pronto no código, mas nunca foi ligado de verdade |

Ou seja: o código dos dois existe, mas o **Supabase já está provado** aqui — e é o que tem
menos passos manuais até funcionar. Se um dia você quiser migrar, o sistema aceita os dois
(e o Supabase tem prioridade quando os dois estão configurados).

---

## Passo 1 — Criar a conta no Supabase

1. Abra <https://supabase.com/dashboard/sign-up>
2. Entre com **GitHub** (o mesmo login do repositório) ou crie com e-mail e senha.
3. Confirme o e-mail, se ele pedir.

## Passo 2 — Criar o projeto

1. Em <https://supabase.com/dashboard>, clique em **New project**.
2. Preencha:
   - **Name:** `licitapro` (ou o nome que você quiser)
   - **Database Password:** clique em **Generate a password** e **guarde essa senha** num
     lugar seguro (ela é do banco; o sistema não usa, mas o Supabase pode pedir depois)
   - **Region:** `South America (São Paulo)` — é a mais rápida para você
3. Clique em **Create new project** e espere ~2 minutos (aparece "Setting up project").

## Passo 3 — Criar a tabela do cofre (SQL)

1. No menu da esquerda, clique em **SQL Editor** (ícone de `>_`) e depois em **New query**.
   Atalho: `https://supabase.com/dashboard/project/_/sql/new`
2. Abra o arquivo [`supabase/nuvem.sql`](supabase/nuvem.sql) deste repositório, copie
   **tudo** e cole na janela.
3. Clique em **Run** (ou `Ctrl+Enter`).
4. Embaixo deve aparecer uma tabela com **`tudo pronto`**. Se aparecer, esta etapa está feita.

> Pode rodar esse arquivo quantas vezes quiser: ele não apaga nada.

## Passo 4 — Copiar o endereço e a chave pública

1. Abra **Project Settings** (engrenagem) → **API Keys**.
   Atalho: `https://supabase.com/dashboard/project/_/settings/api-keys`
2. Copie duas coisas:
   - **Project URL** — assim: `https://xxxxxxxxxxxx.supabase.co`
   - **Project API keys → `anon`** (em projeto novo: **publishable key**, começa com
     `sb_publishable_`) — clique em **Copy**.

> Essas duas são **públicas de propósito**: é o que o navegador usa para falar com o seu
> cofre, e o conteúdo vai cifrado com a sua senha. Podem circular à vontade.
> **Nunca** copie a `service_role` / `secret key` para o site nem para conversa: essa é a
> chave de servidor.

## Passo 5 — Apontar o site para o projeto novo

> **Se o site já aponta para o seu projeto, pule para o item 5.** Abra
> <https://marcossilva023l20.github.io/licitapro>, aperte `Ctrl+Shift+R` (recarregar sem cache) e veja,
> em *"Usar outro projeto / testar a conexão"*, a linha **Projeto em uso:** — se o endereço for o
> seu (por exemplo `https://yrqhxljwdxsacaopbllq.supabase.co`), o site já está ligado nele e os
> itens 1 a 4 abaixo só servem para um dia trocar de projeto. Se aparecer outro endereço, clique em
> **voltar ao projeto do site**.

1. Abra <https://marcossilva023l20.github.io/licitapro>
2. Na tela **Entrar / Criar conta**, abra **“Usar outro projeto / testar a conexão”**.
3. Cole o **Project URL** e a **chave pública** e clique em **Testar a conexão**.
   Deve aparecer a lista de etapas com ✓:
   - Endereço do projeto e chave pública
   - O projeto respondeu
   - O cofre aceita gravação
   - O que foi gravado volta na leitura
   - Limpeza da linha de teste
   - *Tudo certo: o banco está respondendo…*
4. Clique em **usar este projeto** (o teste roda de novo e o projeto fica escolhido neste
   navegador).
5. Volte ao formulário, escolha um **e-mail** (ex.: `dej@empresa.com.br`) e uma **senha**
   (mínimo 6 caracteres — **anote**, não tem recuperação), abra a aba **Criar conta** e
   confirme.
6. O sistema abre no painel. No rodapé, a linha deve dizer
   *"Dados salvos neste navegador e na conta "seu@email""*.

## Passo 6 — Abrir no outro computador

1. No computador novo, abra o mesmo endereço.
2. Se você escolheu outro projeto (não o que já vem no site), clique em **“link para o outro
   computador”** dentro de *Conta e nuvem* e abra esse link na outra máquina — ele já leva o
   endereço e a chave.
3. Digite o **mesmo e-mail** e a **mesma senha** e clique em **Entrar**.

Pronto: documentos, empresa, numeração, padrões e fotos chegam cifrados e abrem lá.

---

## Salvou e saiu do site na mesma hora?

O sistema **não espera você lembrar de sincronizar**: ao clicar em **Salvar** (empresa, padrões,
documento) ele já manda para a conta, e ao fechar a aba ele termina o envio que estiver pendente.
Mesmo assim, o aviso mais confiável é a própria tela:

- *"Dados da empresa salvos na sua conta."* → já está no banco.
- *"Dados salvos neste navegador e na conta "seu@email" — última sincronização …"* → idem.
- *"Alterações salvas neste navegador — enviando para a conta…"* → ainda está subindo (segundos).

Se a conexão cair no meio, o painel mostra *"Nuvem: <motivo> — os dados continuam salvos neste
navegador"*: nada se perde, e a próxima abertura do site envia de novo.

## E o Google Drive?

O Drive guarda **arquivos**, não um banco de dados: o sistema não consegue escrever direto na sua
conta Google (isso precisaria de um aplicativo autorizado por você, com verificação do Google — e
não serviria para abrir os dados em outro computador sem passar por ele). O que funciona, e já está
no menu do usuário, é a **cópia em arquivo**:

1. Menu do usuário → **Baixar backup** → sai um `licitapro-backup-AAAA-MM-DD.json`.
2. Arraste esse arquivo para uma pasta no Drive (ex.: *LicitaPro*).
3. Para voltar: baixe o arquivo do Drive e use **Restaurar backup**.

Quem faz o papel de "abrir em qualquer computador" é a **conta** (Supabase), não o Drive — e o menu
explica isso em **Guardar uma cópia no Drive**.

## Trabalhar os itens no Excel

No editor do documento, o botão **Planilha auxiliar** gera um `.xlsx` com os itens
preenchidos **no mesmo formato da planilha-modelo** (as mesmas colunas), mais uma aba
**Resumo** (número, órgão/cliente, totais, condições). Serve para conferir contas no
Excel e para reenviar depois na tela **Importar planilha** — o sistema lê de volta os
mesmos itens. Na lista de documentos, o botão **Planilha (Excel)** faz o mesmo.

## Se alguma etapa falhar

O próprio **Testar a conexão** diz onde parou. Traduzindo:

| A etapa que falhou | O que significa | O que fazer |
|---|---|---|
| **Endereço do projeto e chave pública** | falta um dos dois, ou o endereço não é uma URL | confira se copiou o **Project URL** inteiro (`https://…supabase.co`) e a chave `anon`/`publishable` |
| **O projeto respondeu** (código 404 / *does not exist*) | a tabela do cofre ainda não existe nesse projeto | rode o `supabase/nuvem.sql` (Passo 3) **nesse** projeto |
| **O projeto respondeu** (código 401/403) | a chave é de outro projeto, ou é a `service_role`, ou o RLS recusou | confira a chave (Project Settings → API Keys) e rode o `nuvem.sql` de novo |
| **O cofre aceita gravação** (401/403) | as políticas do `nuvem.sql` não estão no projeto | rode o `nuvem.sql` inteiro (ele recria as políticas) |
| **A senha cifra e decifra** | senha com menos de 6 caracteres | use uma senha maior |
| Nada falha, mas **não salvou** | a conta está em outro projeto, ou a sincronização falhou depois | veja a linha do painel: *"Nuvem: …"* diz o motivo; e no Table Editor procure a tabela `licitapro_cofre` — cada conta tem uma linha `u:seu@email` |

**Para ver com os próprios olhos:** no painel do Supabase, abra **Table Editor** →
`licitapro_cofre`. Depois de criar a conta aparece uma linha `u:seu@email.com` com um texto
ilegível (é o conteúdo cifrado). Se a linha aparece, **está salvando**.

---

## E o sistema no seu próprio endereço (Render)?

O guia [`PUBLICAR.md`](PUBLICAR.md) continua valendo. Com o projeto novo, só muda uma coisa:
no **Passo 1.2** de lá, a chave a copiar é a **`service_role`** (ou *secret key*) **do projeto
novo** — ela vai na variável `SUPABASE_SERVICE_KEY` do Render, onde serve para gravar sem
cifra (é o servidor; o site nunca vê essa chave). E o **Passo 1.1** é rodar o
[`supabase/esquema.sql`](supabase/esquema.sql) no projeto novo.

Quer que eu deixe o site publicado já apontando para o projeto novo (sem precisar do bloco
"Usar outro projeto" em cada computador)? Me mande o **Project URL** e a **chave pública**
(essas duas podem ir pelo chat — são públicas) e eu gravo no `config-nuvem.js`.
**A `service_role` não** — essa fica só no Render e no seu computador.
