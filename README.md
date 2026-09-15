# LicitaPro — gerador de propostas de licitação e orçamentos

Sistema web para montar **propostas de licitação** e **orçamentos comerciais** e gerar o
**PDF pronto para envio**, importando os itens de uma planilha (Excel/CSV) para agilizar o
preenchimento.

O PDF segue a estrutura do modelo enviado pelo usuário:

```
Cabeçalho (logo, empresa, número e data)
   ↓
Título do documento (PROPOSTA DE FORNECIMENTO / ORÇAMENTO Nº 001/2026)
   ↓
Dados do órgão (UASG, processo, pregão, objeto, prazo)  — proposta
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
Declaração de aceitação das condições do edital
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

Na primeira execução o sistema cria automaticamente o **primeiro acesso** e mostra
o e-mail e a senha no terminal:

```
=============================================================
 Primeiro acesso criado:
   E-mail: admin@licitapro.com.br
   Senha : (senha aleatória mostrada aqui)
 (troque a senha em "Minha empresa → Meu acesso" após entrar)
=============================================================
```

> Para definir você mesmo o primeiro acesso, use as variáveis de ambiente:
> ```bash
> LICITAPRO_ADMIN_EMAIL=seu@email.com LICITAPRO_ADMIN_SENHA=suasenha npm start
> ```

Depois disso, outras pessoas podem criar a própria conta pela tela de login
(aba **Criar conta**). Cada usuário vê apenas os próprios documentos.

Desenvolvimento com recarga automática: `npm run dev`.

---

## 2. Como usar (fluxo do dia a dia)

1. **Minha empresa** — preencha uma única vez os dados que aparecem em todas as propostas:
   razão social, CNPJ, inscrição estadual, SIMPLES NACIONAL, telefone, e-mail, endereço,
   banco, agência, conta, PIX, representante legal, **logo** e **assinatura digitalizada**.
   Aproveite e defina os *padrões* (validade, prazo de entrega, garantia, condições de pagamento).

2. **Baixar o modelo de planilha** — botão em *Painel*, *Importar planilha* ou no menu do usuário.
   O arquivo `Modelo_Importacao_Itens_LicitaPro.xlsx` tem as abas **Itens** (para preencher) e
   **Instruções** (legenda das colunas + exemplo).

3. **Importar planilha** — arraste o arquivo preenchido. O sistema mostra os itens encontrados,
   avisa sobre linhas com problema e permite:

   - **Criar proposta** (licitação) com os itens selecionados;
   - **Criar orçamento** (comercial);
   - **Adicionar** os itens a um documento que já existe.

   Também é possível importar de dentro do editor (aba *Itens e preços* → *Importar da planilha*).

4. **Revisar no editor** — abas:

   | Aba | O que faz |
   |---|---|
   | Identificação | tipo de documento, número (sequencial/ano/série), data, dados do órgão ou do cliente |
   | Itens e preços | itens com quantidade, unidade, preço de venda, custo, marca/modelo, foto, descrição do catálogo, link da compra, desconto, frete e resumo de lucro |
   | Condições | validade, local, prazo de entrega, garantia, pagamento, observações |
   | Dados do proponente | dados da empresa para *este* documento (logo e assinatura) |
   | Layout do PDF | catálogo, fotos, dados bancários, valor por extenso, assinatura, declaração, cor do documento |

   Recursos úteis: **margem sobre o custo** (aplica custo + X% em todos os itens),
   **duplicar item**, **reordenar**, **pré-visualização** do PDF lado a lado e salvamento automático.

5. **Gerar PDF** — botão verde em cima do editor (ou na lista de documentos).
   O arquivo sai com o nome `Proposta_001-2026_orgao.pdf` / `Orcamento_001-2026_cliente.pdf`.

6. **Histórico** — a tela *Documentos* tem busca, filtro por tipo e status
   (rascunho / enviada / ganha / perdida / cancelada), duplicação, exclusão e
   exportação dos itens de volta para planilha.

### Números automáticos

A numeração é sequencial por usuário, tipo e ano (`001/2026`, `002/2026`, ...). O campo
**Série / grupo** permite numeração separada (por exemplo `PE-17-001/2026`), útil quando
você participa de vários pregões ao mesmo tempo.

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
| `Foto_Produto` | não | link da imagem (Drive, site do fabricante) ou envie o arquivo no site |
| `Descricao_Catalogo` | não | texto comercial que aparece no catálogo |
| `Link_da_compra` | não | link onde você compra (não sai no PDF por padrão) |

Detalhes importantes:

- Valores podem ser digitados como número (`1490,00`) ou texto (`R$ 1.490,00`).
- Os títulos da linha 1 podem ter variações comuns (`Qtd`, `Valor Unitário`, `Descrição do Item`...)
  e o sistema também encontra o cabeçalho se houver linhas de título acima.
- Linhas em branco são ignoradas; linhas problemáticas geram aviso (e podem ser desmarcadas antes de criar o documento).
- Aceita `.xlsx`, `.xls`, `.csv` e `.ods` (até 15 MB).
- Se a planilha tiver abas de instruções, o sistema escolhe automaticamente a aba com mais colunas conhecidas.

Gerar o modelo sem abrir o site: `npm run modelo`.

---

## 4. Onde ficam os dados (e backup)

Tudo fica em `data/` na raiz do projeto (fora do controle de versão):

```
data/
  db.json          → usuários, empresas e documentos (propostas/orçamentos)
  sessoes.json     → sessões ativas
  secret.key       → chave de assinatura dos cookies
  uploads/         → logos, assinaturas e fotos enviadas do computador
  cache-imagens/   → imagens baixadas de links externos
```

**Backup:** copie a pasta `data/` (ou apenas `db.json` + `uploads/`).
Pode ser feito com o sistema em execução; para garantir a consistência, copie primeiro `db.json`.

Para guardar os dados em outro lugar, use `LICITAPRO_DATA_DIR=/caminho/dados`.

---

## 5. Configurações (variáveis de ambiente)

| Variável | Padrão | Para que serve |
|---|---|---|
| `PORT` | `3000` | porta do site |
| `HOST` | `0.0.0.0` | interface de rede |
| `LICITAPRO_DATA_DIR` | `./data` | pasta de dados |
| `LICITAPRO_ADMIN_EMAIL` | `admin@licitapro.com.br` | e-mail do primeiro usuário criado |
| `LICITAPRO_ADMIN_SENHA` | senha aleatória | senha do primeiro usuário |
| `LICITAPRO_ADMIN_NOME` | `Administrador` | nome do primeiro usuário |
| `LICITAPRO_SECRET` | gerado em `data/secret.key` | chave de assinatura das sessões |
| `LICITAPRO_REGISTRO_ABERTO` | `1` | `0` desativa "Criar conta" (uso interno) |
| `LICITAPRO_SILENCIOSO` | — | `1` não imprime o cabeçalho no terminal (usado nos testes) |

---

## 6. Publicando em um servidor

**Docker (recomendado):**

```bash
docker build -t licitapro .
docker run -d --name licitapro -p 3000:3000 \
  -v /var/lib/licitapro:/app/data \
  -e LICITAPRO_ADMIN_EMAIL=seu@email.com \
  -e LICITAPRO_ADMIN_SENHA=umaSenhaForte \
  licitapro
```

**Sem Docker (VPS Linux):**

```bash
git clone <repositório> licitapro && cd licitapro
npm install --omit=dev
PORT=3000 pm2 start server/index.js --name licitapro   # ou um serviço systemd
```

Coloque um proxy reverso (Nginx/Caddy) com **HTTPS** na frente. O sistema detecta o
cabeçalho `X-Forwarded-Proto` e marca o cookie de sessão como `Secure` automaticamente;
para Nginx, envie `proxy_set_header X-Forwarded-Proto $scheme;`.

---

## 7. Segurança

- Senhas guardadas com **scrypt** (sal por usuário) — nunca em texto puro.
- Sessões por cookie `HttpOnly` + `SameSite=Lax` assinado com HMAC; expiram em 30 dias.
- Bloqueio temporário após 10 tentativas de login erradas por IP/e-mail.
- Todo documento é isolado por usuário: consultas, PDF, planilha e exclusão verificam o dono.
- Download de imagens externas bloqueia endereços de rede interna (proteção contra SSRF) e
  limita tamanho/tipo de arquivo.
- Perdeu a senha? No servidor: `npm run usuarios -- senha email@x.com novaSenha`.

---

## 8. Testes

```bash
npm run testes
```

Cobre formatação brasileira (moeda, por extenso, máscaras), geração do modelo de planilha,
importação de arquivos (xlsx, csv, cabeçalhos alternativos, arquivos inválidos), cálculo de
totais, geração dos PDFs de proposta e orçamento, rotas HTTP (autenticação, CRUD, PDF,
planilha, isolamento entre usuários) e um teste de navegador com **jsdom** que faz login,
cria uma proposta, adiciona item, confere os cálculos, salva e abre a pré-visualização.

---

## 9. Estrutura do projeto

```
server/
  index.js              → servidor Express, middlewares e rotas
  config.js             → caminhos, portas e segredo das sessões
  store.js              → banco de dados em JSON (gravação atômica)
  auth.js               → senhas (scrypt), sessões e cookie assinado
  documento-schema.js   → validação/normalização das propostas e orçamentos
  pdf.js                → montagem do PDF (proposta, orçamento e catálogo)
  importar.js           → leitura das planilhas enviadas
  modeloImportacao.js   → geração do modelo .xlsx para download
  colunas.js            → colunas da planilha (fonte única de verdade)
  imagens.js            → links do Drive, download e cache de fotos
  routes/               → rotas de autenticação, documentos e arquivos
public/
  index.html            → interface (SPA)
  css/estilos.css
  js/api.js, ui.js, editar.js, app.js
shared/format.js        → formatações em pt-BR (usado no servidor e no navegador)
scripts/                → utilitários (gerar modelo, administrar usuários)
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
| Esqueci a senha | `npm run usuarios -- senha email@x.com novaSenha` |
| Quero apagar todos os dados | pare o sistema e remova a pasta `data/` |
| O PDF sai sem o catálogo | confira a aba **Layout do PDF** → "Incluir página de catálogo" |
| A logo não aparece no cabeçalho | envie a imagem em *Minha empresa* e marque "Usar logo no cabeçalho" |

---

## 11. Observação sobre links de imagem

Links de imagem (Google Drive, site do fabricante) são baixados no momento do uso e ficam
em cache. Em ambientes **sem acesso à internet** (por exemplo, um servidor isolado), esses
downloads falham e o PDF mostra `—` no lugar da foto — nesse caso, envie a imagem do
computador pelo próprio site (o arquivo fica salvo em `data/uploads/`).

Para links do Google Drive, o arquivo precisa estar compartilhado como
"Qualquer pessoa com o link" (o sistema converte o link de visualização em link direto).
