# DEJ Solutions & Global — gerador de propostas de licitação e orçamentos

Sistema web para montar **propostas de licitação** e **orçamentos comerciais** e gerar o
**PDF pronto para envio**, importando os itens de uma planilha (Excel/CSV) para agilizar o
preenchimento.

[![Testes](https://github.com/marcossilva023l20/licitapro/actions/workflows/testes.yml/badge.svg)](https://github.com/marcossilva023l20/licitapro/actions/workflows/testes.yml)
[![Publicar no Render](https://img.shields.io/badge/Render-publicar-0f766e?logo=render&logoColor=white)](https://render.com/deploy?repo=https://github.com/marcossilva023l20/licitapro)

> **Usar agora:** <https://marcossilva023l20.github.io/licitapro/> — o endereço do GitHub Pages
> abre o próprio sistema, rodando **no navegador (modo local)**, sem servidor. Nesse modo os
> documentos ficam salvos no navegador e há backup/restauração em arquivo. Para guardar os dados
> no servidor e abrir de qualquer computador, publique com servidor — veja
> **[6. Publicando na internet](#6-publicando-na-internet-hospedagem)** (Render, Railway, Docker ou VPS).
>
> O sistema **não tem login**: abre direto no painel, sem usuário nem senha.

O PDF usa a fonte **Times New Roman** (a família Times, uma das fontes padrão do PDF — o
arquivo não precisa embutir a fonte e abre igual em qualquer leitor). A estrutura segue o
modelo enviado pelo usuário:

```
Cabeçalho (logo, empresa, número e data)
   ↓
Título do documento (PROPOSTA DE FORNECIMENTO / ORÇAMENTO Nº 001/2026)
   ↓
Dados do órgão (UASG, modalidade, pregão, objeto, prazo)  — proposta
Identificação do cliente (CNPJ, contato, endereço)      — orçamento
   ↓
Dados do proponente (CNPJ, inscrição estadual, SIMPLES NACIONAL, telefone,
                     e-mail, endereço, dados bancários, PIX)
   ↓
TABELA DE PREÇOS (item, especificação, marca/modelo, UND, QTD, valor unitário, valor total)
   ↓
Desconto / acréscimo + TOTAL + valor total por extenso
   ↓
CONDIÇÕES (validade, pagamento, prazo de entrega, garantia, observações)
   ↓
CATÁLOGO (descrição comercial + foto de cada produto)
   ↓
Local, data e bloco de assinatura do representante legal
```

---

## 1. Como rodar

Requisitos: **Node.js 18 ou superior** (recomendado Node 20+).

```bash
npm install       # instala as dependências
npm start         # sobe o site em http://localhost:3000
```

Na primeira execução o sistema cria apenas o **perfil** (o registro dos dados da empresa)
dentro da pasta `data/` — não existe usuário nem senha para configurar. Quem abrir o
endereço já cai no painel.

> **Atenção:** sem login, qualquer pessoa que abrir o endereço usa o sistema. Se o serviço
> ficar exposto na internet, proteja o acesso na frente dele (senha no proxy/Nginx, túnel
> autenticado ou a opção de acesso restrito da plataforma de hospedagem).

Desenvolvimento com recarga automática: `npm run dev`.

---

## 2. Como usar (fluxo do dia a dia)

1. **Minha empresa** — preencha uma única vez os dados que aparecem em todas as propostas:
   razão social, CNPJ, inscrição estadual, SIMPLES NACIONAL, telefone, e-mail, endereço,
   banco, agência, conta, PIX, representante legal, **logo** e **assinatura digitalizada**.
   Aproveite e defina os *padrões* (validade, prazo de entrega, garantia, condições de pagamento).

2. **Baixar o modelo de planilha** — botão em *Painel*, *Importar planilha* ou no menu do usuário.
   O arquivo `Modelo_Importacao_Itens_DEJ.xlsx` tem **uma única aba**, **Itens**, com os títulos
   das colunas e nada mais — sem aba de instruções, sem legenda e sem comentários.

3. **Importar planilha** — arraste o arquivo preenchido. O sistema mostra os itens encontrados,
   avisa sobre linhas com problema e permite:

   - **Criar proposta** (licitação) com os itens selecionados;
   - **Criar orçamento** (comercial);
   - **Adicionar** os itens a um documento que já existe.

   Também é possível importar de dentro do editor (aba *Itens e preços* → *Importar da planilha*).

4. **Revisar no editor** — abas:

   | Aba | O que faz |
   |---|---|
   | Identificação | tipo de documento, número (sequencial/ano), data, modalidade, dados do órgão ou do cliente |
   | Itens e preços | itens com quantidade, unidade, preço de venda, custo, marca/modelo, foto, descrição do catálogo, link da compra, desconto, frete e resumo de lucro. Cada item tem **Detalhes** (descrição completa, foto e catálogo), **duplicar**, **↑** e **↓** para reordenar e **remover**; o botão **Selecionar itens** liga as caixas de marcar, para mover ou apagar vários de uma vez |
   | Condições | validade, local, prazo de entrega, garantia, pagamento, observações |
   | Dados do proponente | dados da empresa para *este* documento (logo e assinatura) |
   | Layout do PDF | catálogo, fotos, dados bancários, valor por extenso, assinatura, cor do documento |

   Recursos úteis: **margem sobre o custo** (aplica custo + X% em todos os itens),
   **duplicar item**, **reordenar**, **pré-visualização** do PDF lado a lado e salvamento automático.

   **Desconto e frete são opcionais**: ficam atrás da caixa *Usar desconto e frete / instalação*
   e, no orçamento (documento comercial), já vêm marcados. Na proposta de licitação os campos
   ficam fora do caminho — se o documento já tiver desconto ou frete preenchido, a caixa vem
   marcada para nada ficar escondido. Desmarcar tira os valores do documento (o total não fica
   com conta invisível).

   Enquanto você preenche os **Detalhes** de um item, o salvamento automático não redesenha a
   lista: o painel continua aberto e o cursor segue no campo.

   O botão **Pré-visualização**, no topo do editor, **oculta ou mostra** o quadro da prévia
   quando quiser mais espaço para o formulário (fica marcado enquanto a prévia está à vista).
   Com ela oculta o PDF nem é gerado; ao mostrar, ele é gerado na hora. A escolha fica
   guardada neste navegador (`licitapro.previa.v1`).

5. **Gerar PDF** — botão verde em cima do editor (ou na lista de documentos).
   O arquivo sai com o nome `Proposta_001-2026_orgao.pdf` / `Orcamento_001-2026_cliente.pdf`.

5b. **Planilha auxiliar (Excel)** — botão **Planilha auxiliar** no editor (e
   *Planilha (Excel)* na lista de documentos). Sai um `.xlsx` com:

   | Aba | O que traz |
   |---|---|
   | **Resumo** | tipo, número, data, status, órgão/cliente, modalidade, objeto, empresa, quantidade de itens, subtotal, desconto, acréscimo, total, custo e lucro (uso interno), condições e a assinatura digital, quando houver |
   | **Itens** | os itens do documento preenchidos nas **mesmas colunas da planilha-modelo** (`Numero_Item`, `Descricao_Edital`, `Unidade`, `Quantidade`, `Valor_Referencia`, `Preco_Custo`, `Preco_Venda`, `Marca_Modelo`, `Foto_Produto`, `Descricao_Catalogo`, `Link_da_compra`) |

   São só essas duas abas. Valem aqui as mesmas regras do modelo: **sem aba de
   instruções e sem comentários nos títulos** — quem já usa o sistema sabe preencher.

   Como as colunas são as do modelo, a planilha pode ser **editada no Excel e
   reenviada na tela "Importar planilha"** — o sistema lê de volta os mesmos
   itens (inclusive custo, venda, marca, foto, descrição do catálogo e link).

6. **Histórico** — a tela *Documentos* tem busca, filtro por tipo e status
   (rascunho / enviada / ganha / perdida / cancelada), duplicação, exclusão e
   exportação dos itens de volta para planilha.

### Números automáticos

A numeração é sequencial por tipo e ano (`001/2026`, `002/2026`, ...).

**Modalidade** é uma lista pronta (Pregão Eletrônico, Dispensa de Licitação, Concorrência,
Inexigibilidade, Credenciamento, ...). A última opção da lista — *adicionar nova modalidade* —
cria uma modalidade sua: ela passa a aparecer no seletor nos próximos documentos deste
navegador, e a escolhida vai para o cabeçalho do PDF.

---

## 3. Planilha de importação

| Coluna | Obrigatória | O que preencher |
|---|---|---|
| `Numero_Item` | não | número do item conforme o edital (1, 2, 3...) |
| `Descricao_Edital` | **sim** | descrição exata do item no edital |
| `Unidade` | não | UND, UN, CX, PCT, M, KG... |
| `Quantidade` | **sim** | quantidade solicitada |
| `Valor_Referencia` | não | valor unitário estimado no edital |
| `Preco_Custo` | não | quanto você paga no fornecedor (controle interno) |
| `Preco_Venda` | não | valor unitário ofertado (entra no PDF) |
| `Marca_Modelo` | não | marca e modelo ofertados |
| `Foto_Produto` | não | link da imagem (Drive, site do fabricante) ou envie um arquivo **.jpg/.png** no site |
| `Descricao_Catalogo` | não | texto comercial que aparece no catálogo |
| `Link_da_compra` | não | link onde você compra (não sai no PDF por padrão) |

Detalhes importantes:

- Valores podem ser digitados como número (`1490,00`) ou texto (`R$ 1.490,00`).
- Os títulos da linha 1 podem ter variações comuns (`Qtd`, `Valor Unitário`, `Descrição do Item`...)
  e o sistema também encontra o cabeçalho se houver linhas de título acima.
- Linhas em branco são ignoradas; linhas problemáticas geram aviso (e podem ser desmarcadas antes de criar o documento).
- Aceita `.xlsx`, `.xls`, `.csv` e `.ods` (até 15 MB).
- Se a planilha tiver mais de uma aba (capa, resumo, instruções antigas), o sistema escolhe
  automaticamente a aba com mais colunas conhecidas.

Gerar o modelo sem abrir o site: `npm run modelo`.

---

## 4. Onde ficam os dados (e backup)

Tudo fica em `data/` na raiz do projeto (fora do controle de versão):

```
data/
  db.json          → perfil (dados da empresa) e documentos (propostas/orçamentos)
  uploads/         → logos, assinaturas e fotos enviadas do computador
  cache-imagens/   → imagens baixadas de links externos
```

**Onde os dados estão agora?** O painel do sistema mostra uma linha embaixo do título:
*"Banco de dados conectado (Supabase/Firebase)"*, *"Banco de dados não configurado: os dados
estão sendo salvos no arquivo do servidor"* ou o motivo, quando o banco está configurado mas
não responde.
No GitHub Pages (modo local) ela diz que os dados ficam no próprio navegador — nesse endereço
**não existe servidor**, então o banco não é usado ali.

No modo local o sistema também **testa o armazenamento do navegador** ao abrir. Se o navegador
não estiver guardando (janela privada, dados de site bloqueados, cota cheia), a linha fica
vermelha avisando para baixar um backup antes de fechar, e o editor só mostra *Salvo* quando o
documento realmente ficou guardado. Duas abas abertas ao mesmo tempo não se apagam uma à outra:
ao gravar, o que a outra aba salvou é preservado (documentos entram pelo id, a numeração fica
com o maior número).

**Backup:** copie a pasta `data/` (ou apenas `db.json` + `uploads/`).
Pode ser feito com o sistema em execução; para garantir a consistência, copie primeiro `db.json`.

Para guardar os dados em outro lugar, use `LICITAPRO_DATA_DIR=/caminho/dados`.

### Banco de dados: Supabase **ou** Firebase (recomendado na hospedagem)

No plano gratuito do Render o disco é apagado a cada reinício — e aí as propostas
se perdem. Com o banco na nuvem, os dados ficam num banco de verdade e sobrevivem a
deploy, reinício e mudança de servidor.

O sistema aceita **dois bancos** e escolhe pelo que estiver configurado (se os dois
estiverem, vale o Supabase):

| | Supabase (Postgres) | Firebase (Firestore) |
|---|---|---|
| Credencial | chave `service_role` (uma linha) | arquivo JSON da conta de serviço |
| Preparo | rodar `supabase/esquema.sql` no SQL Editor | nenhum: as coleções nascem no primeiro uso |
| Plano grátis | 500 MB, o projeto pausa se ficar sem uso | 1 GiB, 50 mil leituras e 20 mil gravações por dia |
| Melhor para | quem quer tabelas/SQL e não ligar do plano grátis | quem já usa Google e prefere sem SQL |

#### Supabase (Postgres)

1. Crie o projeto em <https://supabase.com> (o plano gratuito já serve).
2. No painel do projeto, abra **SQL Editor → New query**, cole o conteúdo de
   [`supabase/esquema.sql`](supabase/esquema.sql) e clique em **Run**
   (também dá para ver o SQL no terminal: `npm run banco -- sql`).
   Isso cria as tabelas `licitapro_perfil`, `licitapro_documentos` e
   `licitapro_sequencia`, com RLS ligado — a chave pública não lê nada.
3. Copie as credenciais do projeto:
   - **Project Settings → Data API → Project URL** → `SUPABASE_URL`
     (o endereço do projeto já usado por este sistema é o padrão; pode omitir)
   - **Project Settings → API keys → service_role** (clique em *Reveal*) → `SUPABASE_SERVICE_KEY`
     — é a chave de servidor, que ignora o RLS; pode usar também a *secret key*
     (`sb_secret_...`) do formato novo
4. Informe as duas credenciais — escolha o caminho mais confortável:
   - **pela própria tela (sem terminal):** com o sistema aberto em
     `http://localhost:3000` no seu computador, o painel mostra o botão
     **“Conectar banco de dados”** embaixo da linha de situação. Cole a chave
     (o endereço do projeto já vem preenchido), clique em **Salvar e testar** e o
     sistema grava o `.env`, conecta na hora e passa a usar o banco — sem reiniciar.
     Um atalho no formulário (**“Abrir a página das chaves deste projeto no
     Supabase”**) leva direto ao lugar certo do painel, porque o nome do menu muda
     de tempo em tempo (*Settings → API Keys*, antes *API*). No lugar da chave
     *anon*/*publishable* use a **`service_role`** (clique em *Reveal*) ou a
     *secret key* (`sb_secret_...`).
     Esse botão aparece **somente** quando o sistema roda na sua máquina
     (localhost); de um endereço publicado ele não existe, por segurança.
   - **pela linha de comando:** rode
     ```bash
     npm run banco -- configurar
     ```
     Ele pergunta o endereço do projeto e a chave (a chave não aparece na tela ao
     digitar), grava o arquivo `.env` sem mexer no resto do que já está lá e, em
     seguida, já faz a conferência da conexão. Para editar à mão, use o modelo em
     `.env.example`.
   - **no Render/Railway/Docker:** cadastre `SUPABASE_URL` e `SUPABASE_SERVICE_KEY`
     nas variáveis de ambiente do serviço (o `render.yaml` já tem os campos).
5. Suba o sistema e confira: **`npm run banco`** — ele faz uma conferência passo a
   passo (arquivo `.env`, endereço, tipo de chave, conexão, tabelas, **gravação de
   verdade**, conteúdo e cópia local) e diz exatamente onde está o problema, se houver.
   No painel do sistema aparece a mesma informação em uma linha:
   *"Banco de dados conectado (Supabase)"* (ou *"(Firebase)"*), *"Banco de dados não
   configurado…"* ou *"O banco (…) não está recebendo os dados: <motivo>"*. O
   `/api/health` também responde `"armazenamento"` e o estado do banco.

> **Começando do zero (conta nova na nuvem):** siga [`COMECAR.md`](COMECAR.md) — criar o
> projeto no Supabase, rodar o SQL, apontar o site para ele e conferir etapa por etapa com o
> botão **Testar a conexão**.

#### Sem servidor: entrar numa conta e abrir o sistema de outro computador

O endereço do GitHub Pages **não tem servidor**: ali os dados ficam no navegador (com backup em
arquivo). Para abrir o sistema em **outro computador** sem hospedar nada, o próprio navegador
guarda tudo no seu projeto Supabase — cifrado com a **sua senha**:

1. No SQL Editor do projeto, rode uma vez o arquivo [`supabase/nuvem.sql`](supabase/nuvem.sql)
   (no terminal, `npm run banco -- nuvem` mostra o SQL). Ele cria a tabela `licitapro_cofre` e
   libera só ela para a chave pública.
2. O endereço do projeto e a **chave pública** (*anon*/*publishable*) ficam gravados no site, em
   [`public/js/config-nuvem.js`](public/js/config-nuvem.js) — é o que o navegador usa para falar
   com o cofre. Quem for usar **outro** projeto troca os dois valores nesse arquivo.
3. Abra o site publicado: na primeira visita aparece a tela **Entrar / Criar conta**. Escolha um
   **e-mail** (é ele que identifica a conta, ex.: `dej@empresa.com.br`) e uma **senha** (mínimo 6
   caracteres) e use **Criar conta**. Se preferir não ter conta nenhuma, clique em
   **“Continuar sem conta”** — os dados ficam só neste navegador (com a opção de backup em arquivo).
4. Em qualquer outro computador, abra o mesmo endereço, informe o mesmo e-mail e a mesma senha e
   use **Entrar**. O botão **“link para o outro computador”** (dentro de *Conta e nuvem*) copia um
   endereço que já leva o projeto quando ele não é o do site — lá só faltam o e-mail e a senha.

Como funciona: antes de sair do navegador, documentos, empresa, padrões e numeração são cifrados
com a **sua senha** (**AES-256-GCM**, chave derivada por PBKDF2 com 150 mil iterações) e só então
enviados. No banco existe apenas texto cifrado, cada conta na sua própria linha (`u:<e-mail>`) —
sem a senha, ninguém lê nada (nem quem tem a chave pública do projeto). A senha **nunca é enviada a
lugar nenhum** e **não tem recuperação**: se esquecer, os dados da nuvem não têm volta (a cópia do
navegador e os backups em arquivo continuam). E-mail sem conta não acha nada; senha errada não abre
nada. **Sair da conta** (no menu do usuário) manda o que faltar, limpa este navegador e deixa tudo
guardado na conta. Cada foto enviada vira uma linha própria e é baixada só quando o PDF precisa
dela. Enquanto a conta estiver ligada, cada alteração é enviada pouco depois de salvar, e abrir o
sistema busca o que está lá (documentos são unidos pelo id, ficando com o mais novo).

Se preferir o caminho “clássico” — servidor hospedado com o banco na nuvem e credencial só no
servidor — siga as duas seções abaixo.

#### Ou Firebase (Firestore)

1. Em <https://console.firebase.google.com>, crie um projeto (a conta Google que você
   já usa serve).
2. No menu **Firestore Database**, clique em **Create database** e escolha a região
   (uma única vez — depois disso as coleções `licitapro_perfil`,
   `licitapro_documentos` e `licitapro_sequencia` são criadas pelo próprio sistema,
   sem SQL nenhum).
3. Em **Project settings (⚙) → Service accounts → Generate new private key**, baixe o
   arquivo `.json` (é a credencial: dá acesso total ao banco).
4. Informe a credencial — qualquer um dos caminhos:
   - **pela tela (mais fácil):** com o sistema aberto em `http://localhost:3000`,
     clique em **“Conectar banco de dados”** no painel. O sistema **procura sozinho**
     nas pastas de downloads/documentos um arquivo de conta de serviço: se achar, ele
     mostra *“Encontrei o arquivo X (projeto Y)”* e basta clicar em **“Usar este
     arquivo”**. Se não achar (ou se houver mais de um), clique em **“Escolher o
     arquivo .json do Firebase”** — aponte para o arquivo baixado (ou arraste ele
     para o formulário) e o sistema conecta sozinho. Também dá para colar o
     conteúdo do JSON no campo. O arquivo é gravado em
     `data/firebase-service-account.json` (só o dono lê) e o `.env` aponta para ele;
   - **pela linha de comando:** `npm run banco -- configurar` e cole o **caminho do
     arquivo** (arrastar o arquivo para o terminal também funciona);
   - **na hospedagem:** cadastre `FIREBASE_SERVICE_ACCOUNT` (o JSON inteiro, ou o
     mesmo em base64) e `FIREBASE_PROJECT_ID` nas variáveis do serviço, ou
     `FIREBASE_SERVICE_ACCOUNT_FILE` apontando para o arquivo.

> O Firebase cobra por operação: o sistema grava **só o que mudou** (um documento
> alterado = uma gravação). O limite grátis (20 mil gravações/dia) cobre com folga o
> uso de uma empresa. Cada documento tem limite de 1 MB — o PDF e as fotos ficam
> fora do banco, então isso só apareceria em documentos gigantes.

O que acontece quando as variáveis estão definidas:

- Ao subir, o sistema **lê tudo do banco** (perfil, documentos e numeração) e
  **une** com o que estiver em `data/db.json`: documentos entram pelo id (quando
  o mesmo existe nos dois, vale a versão do banco), a numeração fica com o maior
  número de cada tipo/ano. **Nada é descartado** — nem de um lado, nem do outro.
  Se o banco estiver vazio, o conteúdo do arquivo é enviado para lá.
- Cada alteração é gravada no banco **e** numa cópia local em `data/db.json`.
- **Se o banco estiver fora do ar** (queda de rede, projeto pausado, tabela
  faltando), o site **continua no ar** com o arquivo local: os dados continuam
  salvos, o motivo aparece em `/api/health` (`supabase.erro`) e a cada alteração
  o sistema tenta o banco de novo. Quando ele volta, banco e arquivo são
  sincronizados automaticamente (e o documento criado durante a queda vai para
  o banco).
- `npm run banco` mostra a conexão, o tipo de chave, testa a gravação e o que está gravado.
- **No painel** do sistema há uma linha dizendo onde os dados estão sendo salvos — é a forma
  mais rápida de saber se está indo para o banco, para o arquivo ou (no modo local) para o
  próprio navegador.
- Para voltar ao arquivo local: `LICITAPRO_ARMAZENAMENTO=arquivo`.

> **A chave `service_role` dá acesso total ao banco: ela fica só no servidor.**
> No GitHub Pages (modo local) o sistema continua guardando os documentos no
> próprio navegador — o site publicado nunca recebe credencial do banco.

#### "Só tenho a chave anon" (chave pública)

A chave **anon** (`sb_publishable_...` no formato novo) é a chave pública do projeto:
com o RLS ligado e sem políticas, o Supabase **recusa** ler e gravar com ela. Há dois caminhos:

- **Recomendado:** pegue a chave de servidor (*service_role* → *Reveal*, ou a *secret key*)
  e informe em `SUPABASE_SERVICE_KEY`. Ela fica só no servidor e ignora o RLS.
- **Alternativa (com a chave que você já tem):** rode
  [`supabase/politicas-anon.sql`](supabase/politicas-anon.sql) no SQL Editor e informe a chave
  em `SUPABASE_ANON_KEY` (`npm run banco -- politicas` mostra o SQL).
  Isso abre as três tabelas para o papel `anon`: **quem obtiver essa chave pública
  consegue ler, alterar e apagar os documentos direto no banco**, sem passar pelo sistema.

`npm run banco` diz qual chave está configurada e o que ela permite — inclusive antes de
tentar conectar.

---

## 5. Configurações (variáveis de ambiente)

| Variável | Padrão | Para que serve |
|---|---|---|
| `PORT` | `3000` | porta do site |
| `HOST` | `0.0.0.0` | interface de rede |
| `LICITAPRO_DATA_DIR` | `./data` | pasta de dados |
| `SUPABASE_URL` | — | endereço do projeto Supabase (liga o banco; veja a seção 4) |
| `FIREBASE_SERVICE_ACCOUNT` | — | JSON da conta de serviço do Firebase (ou o mesmo em base64) |
| `FIREBASE_SERVICE_ACCOUNT_FILE` | — | caminho do arquivo `.json` da conta de serviço |
| `FIREBASE_PROJECT_ID` | — | id do projeto no Firebase (opcional: vem no JSON) |
| `SUPABASE_SERVICE_KEY` | — | chave `service_role`/`sb_secret_...` do Supabase (só no servidor) |
| `SUPABASE_ANON_KEY` | — | chave pública, para quem preferir usar as políticas abertas |
| `LICITAPRO_ARMAZENAMENTO` | automático | `arquivo` ignora o Supabase e usa só `data/db.json` |
| `LICITAPRO_SILENCIOSO` | — | `1` não imprime o cabeçalho no terminal (usado nos testes) |

---

## 6. Publicando na internet (hospedagem)

> **O site precisa de um servidor Node.** O GitHub Pages só publica arquivos estáticos, e o
> O sistema tem backend (banco, upload de arquivos e geração de PDF). Então o código
> fica no **GitHub**, mas a hospedagem roda num serviço que executa Node — Render, Railway,
> Fly.io ou uma VPS. Este repositório já vem preparado: `render.yaml`, `railway.json`,
> `Procfile` e `Dockerfile`.

### Opção A — Render (mais simples)

> Passo a passo com os valores já preenchidos (inclusive as variáveis do Supabase e a
> conferência no fim): **[`PUBLICAR.md`](PUBLICAR.md)**. Resumo:

1. Faça o **merge do pull request** para o código ficar na branch `main` (e, se quiser, troque
   a fonte do GitHub Pages para `main` em Settings → Pages).
2. Crie a conta em <https://render.com> e entre com o **GitHub**.
3. **New +** → **Web Service** → escolha o repositório `licitapro` e preencha:
   branch `main`, **Build Command** `npm install --omit=dev --no-audit --no-fund`,
   **Start Command** `node server/index.js`, **Health Check Path** `/api/health`.
   (Atalho: **New +** → **Blueprint**, que lê o `render.yaml` e já deixa tudo pronto, com
   disco em `/var/data` e plano `starter`.)
4. Em **Environment**, informe `SUPABASE_URL` e `SUPABASE_SERVICE_KEY` (seção 4) para os dados
   ficarem no Postgres — sem isso o Render usa o arquivo local, que se perde no plano gratuito.
5. Aguarde o deploy e acesse a URL gerada (`https://licitapro-xxxx.onrender.com`): o sistema
   abre direto no painel, sem login.
6. Se o endereço for público, proteja o acesso (senha no proxy, túnel autenticado ou o
   controle de acesso da própria plataforma).

> **Sobre os dados:** no plano **gratuito** o disco é apagado a cada reinício. Com o Supabase
> ligado, documentos, empresa e numeração vivem no Postgres e sobrevivem; o que fica em disco
> nesse caso são as **fotos enviadas pelo editor** (`/var/data/uploads`). Para uso real há dois caminhos:
> **Supabase** (grátis, veja a seção 4 — é o recomendado: os dados ficam num Postgres e
> sobrevivem a qualquer reinício) ou o bloco `disk` do `render.yaml` (plano pago: instância
> ~US$ 7/mês + disco 1 GB ~US$ 0,25/mês), com os dados em `/var/data`.

### Opção B — Railway

1. <https://railway.app> → **New Project** → **Deploy from GitHub repo** → `licitapro`.
2. O `railway.json` já define o comando de start e o healthcheck.
3. Em **Variables**: `LICITAPRO_DATA_DIR=/var/data` e, se for usar o Supabase,
   `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`.
4. Em **Volumes**, monte um volume em `/var/data` (sem volume os dados se perdem no deploy).
5. Em **Settings → Networking → Generate Domain** para gerar a URL pública.

### Opção C — Docker (VPS própria: Hostinger, DigitalOcean, Contabo...)

```bash
docker build -t licitapro .
docker run -d --restart unless-stopped --name licitapro -p 80:3000 \
  -v /var/lib/licitapro:/app/data \
  licitapro
```

### Opção D — sem Docker (VPS Linux)

```bash
git clone https://github.com/marcossilva023l20/licitapro.git && cd licitapro
npm install --omit=dev
PORT=3000 pm2 start server/index.js --name licitapro   # ou um serviço systemd
pm2 save && pm2 startup
```

### Depois de publicar

- **Proteja o endereço**: como não há login, use uma senha no proxy reverso (Nginx/Caddy),
  um túnel autenticado (Cloudflare Access, Tailscale) ou o controle de acesso da plataforma.
- **HTTPS**: Render e Railway já fornecem. Em VPS, use Nginx/Caddy como proxy reverso.
- **Domínio próprio**: aponte o DNS para o serviço (no Render: *Settings → Custom Domain*).
- **Backup**: copie de tempos em tempos a pasta de dados (`data/` ou `/var/data`), que contém
  o banco `db.json`, os uploads (logo, assinatura, fotos) e o cache de imagens.
- **Atualizações**: cada `git push` na branch conectada faz o deploy automático.

### Opção E — apenas demonstrar sem hospedar

Rode localmente (`npm start`) e use <https://ngrok.com> para gerar um link temporário.
Não use isso com dados reais de clientes.

### Opção F — GitHub Pages (modo local, sem servidor)

O endereço <https://marcossilva023l20.github.io/licitapro/> abre o sistema completo funcionando
**dentro do navegador**. É o mesmo sistema (mesmas telas, mesma planilha, mesmo PDF), mas sem
backend: o GitHub Pages publica apenas arquivos estáticos.

| | Modo local (GitHub Pages) | Com servidor (Render/Railway/Docker/VPS) |
|---|---|---|
| Onde ficam os documentos | No navegador usado (localStorage) | No servidor (arquivo `db.json`) |
| Fotos e logos | No navegador (IndexedDB) | Em `data/uploads` |
| Acesso | Direto, sem login | Direto, sem login (proteja o endereço) |
| Abrir de outro computador | Não — cada navegador tem os seus dados | Sim, pelo endereço do site |
| Backup | Botão *Baixar backup* / *Restaurar backup* | Cópia da pasta de dados |

Como funciona (e por que é seguro): o navegador guarda os documentos **naquele computador e
naquele navegador**. Nada é enviado para fora — os únicos downloads são as bibliotecas que geram
o PDF e leem a planilha (`public/vendor/`), servidas pelo próprio site.

Recomendações no modo local:

1. Abra o site, vá em **Minha empresa** e preencha os dados que saem no PDF (razão social, CNPJ,
   endereço, logo e assinatura).
2. Importe a planilha e gere os PDFs normalmente.
3. Clique em **Baixar backup** de tempos em tempos e guarde o arquivo `.json`. Para trocar de
   computador (ou recuperar), use **Restaurar backup**.
4. Não use janela anônima/privada nem limpe os dados do site sem antes baixar o backup.

Para gerar a página que o Pages publica na raiz (o arquivo `index.html` da raiz é gerado):

```bash
npm run paginas              # grava o index.html da raiz
npm run paginas -- --verificar   # confere se está atualizado (roda nos testes)
```

As métricas da fonte Times (usadas pelo pdfmake no navegador) são geradas uma vez e ficam em
`public/vendor/times-afm.js`:

```bash
npm run fontes               # regenera public/vendor/times-afm.js
```

A página de apresentação do projeto fica em `apresentacao.html`
(<https://marcossilva023l20.github.io/licitapro/apresentacao.html>) e o servidor a expõe em
`/apresentacao`.

---

## 7. Segurança

- **Não há autenticação**: o sistema abre direto. Proteja o endereço por fora (proxy com
  senha, túnel autenticado ou acesso restrito na hospedagem) quando ele for público.
- Cabeçalhos `X-Content-Type-Options`, `X-Frame-Options` e `Referrer-Policy` em todas as respostas.
- Uploads são validados como JPEG/PNG reais (arquivo corrompido é recusado, não derruba o PDF).
- Download de imagens externas bloqueia endereços de rede interna (proteção contra SSRF) e
  limita tamanho/tipo de arquivo.
- Não há senha de usuário: o banco guarda só o perfil da empresa e os documentos.
- No Supabase, a chave usada é a `service_role` e fica **apenas no servidor**; as tabelas
  têm RLS ligado e nenhuma política, então a chave pública do projeto não lê nem grava nada.

---

## 8. Testes

```bash
npm run testes
```

Cobre formatação brasileira (moeda, por extenso, máscaras), geração do modelo de planilha,
importação de arquivos (xlsx, csv, cabeçalhos alternativos, arquivos inválidos), cálculo de
totais, geração dos PDFs de proposta e orçamento, rotas HTTP (CRUD, PDF, planilha — inclusive
um teste que garante que o **login não voltou**: nenhuma rota de senha/sessão, nenhum campo de
senha no HTML, banco sem usuários) e testes de navegador com **jsdom** que abrem o sistema,
criam proposta, adicionam itens, conferem os cálculos, salvam e abrem a pré-visualização.

Cobre também a **identidade visual**: paleta da marca no PDF, dourado nos títulos,
respeito à cor escolhida pelo usuário e a marca d'água (opção ligada/desligada e a
transparência dentro do arquivo).

Cobre o **banco no Supabase** com um servidor de mentira que imita a API REST: o
esquema do repositório (tabelas + RLS), o envio do conteúdo local para um banco vazio,
a volta dos dados depois de um "redeploy" (memória zerada e arquivo apagado), a união
banco + arquivo sem perder documento, o banco fora do ar (o site segue no ar e
sincroniza quando ele volta), a exclusão de documento refletida no banco e o
reconhecimento do tipo de chave (anon x service_role). Dois testes de **segurança**
garantem que nenhuma chave de servidor existe no repositório e que nenhuma credencial
de banco aparece no que vai para o navegador.

Também cobre o **modo local** (GitHub Pages): a página da raiz publicada abre o sistema sem
servidor, importa uma planilha `.xlsx` de verdade, gera um PDF válido (`%PDF-`) no navegador,
salva/restaura backup, guarda as fotos dos produtos e — quando existe servidor — o modo local
fica desligado.

---

## 9. Estrutura do projeto

```
server/
  index.js              → servidor Express, middlewares e rotas
  config.js             → caminhos e portas
  store.js              → dados do sistema (perfil único) — Supabase ou arquivo JSON
  supabase.js           → cliente da API REST do Supabase (sem dependência nova)
  documento-schema.js   → validação/normalização das propostas e orçamentos
  pdf.js                → montagem do PDF (proposta, orçamento e catálogo)
  importar.js           → leitura das planilhas enviadas
  modeloImportacao.js   → geração do modelo .xlsx para download
  colunas.js            → colunas da planilha (fonte única de verdade)
  imagens.js            → links do Drive, download e cache de fotos
  routes/               → rotas de autenticação, documentos e arquivos
  routes/               → rotas de autenticação, documentos e arquivos
public/
  index.html            → interface (SPA)
  css/estilos.css
  marca/logo.png        → logo da marca (site, cabeçalho do PDF e marca d'água)
  js/api.js, ui.js, editar.js, app.js
  js/modo-estatico.js   → modo local: atende /api/* no navegador (GitHub Pages)
  js/navegador-imagens.js → fotos enviadas/enviadas do computador no navegador
  vendor/               → pdfmake, métricas da Times e xlsx usados no modo local
shared/                 → mesmo código usado no servidor e no navegador
  format.js             → formatações em pt-BR
  colunas.js            → colunas da planilha (fonte única de verdade)
  importar.js           → leitura das planilhas (Node e navegador)
  modelo-importacao.js  → modelo .xlsx para download (Node e navegador)
  documento-schema.js   → validação das propostas e orçamentos
  documento-pdf.js      → montagem do PDF (Node e navegador)
  imagens-links.js      → links do Google Drive
index.html              → gerado por `npm run paginas` (raiz publicada no Pages)
apresentacao.html       → página de apresentação do projeto
scripts/                → utilitários (gerar modelo, usuários, página do Pages)
testes/                 → suíte de testes
data/                   → dados gerados em execução (não versionado)
```

---

## 10. Problemas comuns

| Sintoma | O que fazer |
|---|---|
| "A porta 3000 já está em uso" | rode com outra porta: `PORT=3001 npm start` |
| As fotos dos produtos não aparecem | o link precisa ser público; em redes restritas, use **Enviar foto do computador** |
| A planilha não é reconhecida | use o modelo para download e mantenha os títulos da linha 1 |
| O sistema diz que não está salvando no banco | rode `npm run banco`: ele aponta o passo que falhou (`.env`, chave, tabelas ou gravação). No painel, a linha de situação mostra o mesmo motivo |
| "Banco de dados não configurado" no painel | falta `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` no `.env` ou nas variáveis do serviço. Em localhost, use o botão **“Conectar banco de dados”**; na hospedagem, cadastre as variáveis no painel do serviço — veja a seção 4 |
| Não acho onde pegar a chave do projeto | Supabase → **Project Settings → API keys**: use a *service_role* (*Reveal*) ou a *secret key* (`sb_secret_...`). A chave *anon*/*publishable* é pública e o banco a recusa com o RLS ligado |
| O botão "Conectar banco de dados" não aparece | ele só aparece quando o sistema roda na sua máquina (localhost) e o banco ainda não está ligado. No endereço publicado, informe as credenciais no painel da hospedagem |
| As tabelas não existem no banco | rode `supabase/esquema.sql` no SQL Editor do projeto (`npm run banco -- sql`) |
| A chave anon é recusada | ela é pública: use a `service_role` ou rode `supabase/politicas-anon.sql` (veja a seção 4) |
| (Firebase) "The database (default) does not exist" | o Firestore ainda não foi criado: no console do Firebase, **Firestore Database → Create database** |
| (Firebase) "O Google recusou a credencial" | gere outra chave em **Project settings → Service accounts → Generate new private key** e informe o JSON inteiro |
| (Firebase) "PERMISSION_DENIED" | dê à conta de serviço o papel *Cloud Datastore User* (ou *Firebase Admin*) no IAM do projeto |
| Quero trocar de banco | configure o outro (o Supabase tem prioridade se os dois estiverem). Para desligar o banco e voltar ao arquivo: `LICITAPRO_ARMAZENAMENTO=arquivo` |
| Quero apagar todos os dados | pare o sistema e remova a pasta `data/` (e as linhas das tabelas no banco, se estiver usando Supabase) |
| O PDF sai sem o catálogo | confira a aba **Layout do PDF** → "Incluir página de catálogo" |
| A logo não aparece no cabeçalho | envie a imagem em *Minha empresa* e marque "Usar logo no cabeçalho" |
| (GitHub Pages) os documentos sumiram | eles ficam no navegador usado; restaure pelo **Restaurar backup** |
| (GitHub Pages) quero usar em outro computador | baixe o backup em um e restaure no outro |
| "Erro ao gerar PDF: Invalid image…" | já tratado: foto em formato não aceito, link morto ou arquivo corrompido não interrompe mais o PDF (a foto sai como `—`) |
| "Envie uma imagem .jpg ou .png" | o PDF só entende JPG e PNG. No GitHub Pages (modo local) o GIF/WebP enviado é convertido automaticamente para JPG |
| "Esta imagem não pôde ser lida" | o arquivo está corrompido ou truncado; abra e salve de novo (ou exporte em .jpg) e envie outra vez |
| Uma foto do link não entrou no PDF | o link não é público, está fora do ar ou o site não libera o download; o aviso mostra o item, e você pode usar **Enviar foto do computador** |

---

## 11. Observação sobre links de imagem

Links de imagem (Google Drive, site do fabricante) são baixados no momento do uso e ficam
em cache. Em ambientes **sem acesso à internet** (por exemplo, um servidor isolado), esses
downloads falham e o PDF mostra `—` no lugar da foto — nesse caso, envie a imagem do
computador pelo próprio site (o arquivo fica salvo em `data/uploads/`).

### Formatos de imagem aceitos no PDF

O gerador de PDF só entende **JPG/JPEG e PNG** — é uma limitação da biblioteca de PDF, não
do sistema. Por isso:

- **Envio pelo servidor:** o upload aceita apenas `.jpg`, `.jpeg` e `.png` íntegros. GIF,
  WebP e arquivos corrompidos são recusados já no envio, com uma mensagem explicando o que
  fazer (o arquivo não chega a ser salvo).
- **Modo local (GitHub Pages):** o navegador aceita GIF, WebP e PNG grande, converte para
  JPG/PNG e só então guarda a foto.
- **Na hora de gerar o PDF:** qualquer foto que não possa ser usada (link fora do ar,
  formato desconhecido, arquivo corrompido, referência do navegador) é simplesmente
  ignorada e o lugar da foto sai como `—`. **O PDF nunca deixa de ser gerado por causa de
  uma foto.** Nesses casos o sistema **avisa** quais itens ficaram sem foto e o motivo
  (ex.: *Item 3 (link): não consegui baixar a imagem do link — pode não estar pública ou o site bloqueia o acesso*).
- **Foto por link:** ao gerar o PDF o sistema lê o link e baixa a imagem — no servidor quem
  baixa é o próprio sistema; no **modo local** (GitHub Pages) quem baixa é o navegador, e
  alguns sites bloqueiam esse acesso. Quando isso acontece, a foto sai como `—` e o aviso
  diz qual item foi afetado: nesse caso use **Enviar foto do computador**.

Para links do Google Drive, o arquivo precisa estar compartilhado como
"Qualquer pessoa com o link" (o sistema converte o link de visualização em link direto).

---

## 12. Identidade visual: logo, cores e marca d'água

O sistema já sai com a **paleta da marca** (azul-marinho `#0B1F33`, dourado `#C6A15B`,
fundo creme) tanto no site quanto no PDF — títulos das seções em dourado, filetes e o selo
do total em azul.

### Colocar a logo no site e no PDF

Basta salvar o arquivo em:

```
public/marca/logo.png      (o servidor também aceita logo.jpg / logo.jpeg)
```

- **Site:** a logo entra automaticamente no lugar do monograma "DEJ" na tela de entrada, no
  topo do sistema e na página de apresentação. Se o arquivo não existir, nada muda.
- **PDF:** a imagem cadastrada em **Minha empresa → Logo** tem prioridade. Sem logo
  cadastrada, o PDF usa `public/marca/logo.png` — no cabeçalho e como **marca d'água**
  (8% de opacidade, atrás do texto, em todas as páginas).
- **Desligar a marca d'água:** no editor, em *Opções do documento*, desmarque
  **"Usar a logo da empresa como marca d'água"** (a opção fica salva no documento).
- **A logo da empresa** vem de *Minha empresa → Logo* e vale para todos os documentos;
  o arquivo em `public/marca/` é o padrão do site.

Formato ideal: **PNG com fundo transparente**. JPG também funciona — fundo branco ou bem
claro é o que menos aparece no documento.
