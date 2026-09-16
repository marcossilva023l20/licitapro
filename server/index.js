'use strict';

/**
 * DEJ Solutions & Global — servidor web.
 * Serve a interface (SPA) e a API de documentos, importação e geração de PDF.
 */

const path = require('path');
const http = require('http');
const express = require('express');
const { PORT, HOST, garantirPastas, DATA_DIR } = require('./config');

garantirPastas();

const store = require('./store');
const Supabase = require('./supabase');
const credenciais = require('./credenciais');
const rotasPerfil = require('./routes/perfil');
const rotasDocumentos = require('./routes/documentos');
const rotasArquivos = require('./routes/arquivos');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);

// --------------------------------------------------------------- middlewares

app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// cabeçalhos de segurança básicos
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// -------------------------------------------------------------------- rotas

app.use('/api/perfil', rotasPerfil);
app.use('/api/documentos', rotasDocumentos);
app.use('/api', rotasArquivos);

/**
 * O pedido veio da própria máquina (localhost)? Só nesse caso a tela pode
 * gravar as credenciais do banco — assim o recurso não vira uma porta aberta
 * para trocar as credenciais de um sistema publicado na internet.
 *
 * São duas conferências:
 *   - o endereço da conexão é a própria máquina (e não o cabeçalho enviado pelo
 *     cliente: com "trust proxy" ligado, req.ip poderia ser forjado);
 *   - o endereço digitado no navegador também é local (localhost, 127.0.0.1,
 *     [::1]) — um túnel/preview público tem outro nome, mesmo que passe por aqui.
 */
function ehLocal(req) {
  const ip = String((req.socket && req.socket.remoteAddress) || '');
  const daMaquina = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  if (!daMaquina) return false;
  const host = String((req.headers && req.headers.host) || '').toLowerCase().replace(/:\d+$/, '');
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1';
}

app.get('/api/health', (req, res) => {
  const banco = store.carregar();
  const local = ehLocal(req);
  res.json({
    ok: true,
    armazenamento: store.modo(), // 'supabase' ou 'arquivo'
    // o endereço do projeto só vai para a própria máquina (é o que preenche o
    // formulário de conectar o banco); a chave nunca sai do servidor
    supabase: Object.assign(
      store.situacaoRemota(), // configurado / conectado / erro
      local ? { url: Supabase.lerConfiguracao().url || Supabase.URL_PADRAO } : {}
    ),
    ultimoErroDeGravacao: store.ultimoErroRemoto(),
    documentos: banco.documentos.length,
    dadosEm: DATA_DIR,
    // a tela pode ligar o banco aqui? (só quando o sistema roda na sua máquina)
    configuravelAqui: local,
    versao: require('../package.json').version,
  });
});

/**
 * Liga o banco pela própria tela: grava as credenciais no .env e reconecta na
 * hora, sem terminal e sem reiniciar o sistema. Só aceita pedidos feitos da
 * própria máquina (veja ehLocal).
 */
app.post('/api/banco/configurar', async (req, res) => {
  if (!ehLocal(req)) {
    return res.status(403).json({
      erro: 'Por segurança, as credenciais do banco só podem ser gravadas pela tela quando o ' +
        'sistema está rodando na sua própria máquina (endereço localhost).',
      ajuda: 'Neste endereço, informe as credenciais no painel da hospedagem (variáveis de ' +
        'ambiente do serviço) ou rode "npm run supabase -- configurar" no servidor.',
    });
  }

  const url = credenciais.limparEndereco(req.body && req.body.url);
  const chave = String((req.body && req.body.chave) || '').trim();

  if (chave.length < 20) {
    return res.status(400).json({
      erro: 'Cole a chave completa do projeto (a que dá acesso total). Ela é bem comprida — ' +
        'confira se a cópia veio inteira.',
    });
  }
  if (url && !credenciais.enderecoValido(url)) {
    return res.status(400).json({
      erro: 'O endereço do projeto não parece válido.',
      ajuda: 'Ele é assim: https://xxxxxxxx.supabase.co (Project Settings → Data API).',
    });
  }
  if (String(process.env.LICITAPRO_ARMAZENAMENTO || '').trim().toLowerCase() === 'arquivo') {
    return res.status(409).json({
      erro: 'O sistema está configurado para usar o arquivo local (LICITAPRO_ARMAZENAMENTO=arquivo).',
      ajuda: 'Remova essa variável de ambiente (ou o .env) para que o banco passe a ser usado.',
    });
  }

  const endereco = url || Supabase.lerConfiguracao().url || Supabase.URL_PADRAO;
  let gravado;
  try {
    gravado = credenciais.gravarCredenciais({ url: endereco, chave });
  } catch (erro) {
    return res.status(500).json({ erro: 'Não consegui gravar o arquivo de credenciais: ' + erro.message });
  }

  // vale já nesta execução: o sistema reconecta sem precisar reiniciar
  credenciais.aplicarNoAmbiente({ url: endereco, chave });
  const modo = await prepararArmazenamento();
  const situacao = store.situacaoRemota();
  const conectado = modo === 'supabase' && situacao.conectado;
  const tipoChave = Supabase.classificarChave(chave);

  res.json({
    ok: conectado,
    arquivo: gravado.caminho,
    armazenamento: modo,
    supabase: situacao,
    tipoChave,
    aviso: Supabase.orientacaoDaChave(chave),
    dica: conectado ? null : Supabase.dicaParaErro(situacao.erro),
  });
});

// arquivos estáticos da interface
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const RAIZ_PROJETO = path.join(__dirname, '..');

// página de apresentação (a mesma usada pelo GitHub Pages), útil para enviar a clientes
app.use('/site', express.static(path.join(RAIZ_PROJETO, 'site'), { maxAge: '1d', setHeaders: semCacheParaCodigo }));
app.get('/apresentacao', (req, res) => res.sendFile(path.join(RAIZ_PROJETO, 'apresentacao.html')));
app.get('/apresentacao.html', (req, res) => res.redirect('/apresentacao'));

/**
 * Código do site (HTML, JS, CSS) é servido com revalidação: o navegador
 * reusa a versão em cache só depois de perguntar ao servidor. Sem isso uma
 * atualização do sistema (por exemplo, o layout do PDF) pode demorar uma
 * hora para aparecer. Imagens e fontes continuam em cache normal.
 */
function semCacheParaCodigo(res, caminho) {
  if (/\.(html|js|css)$/i.test(caminho)) res.setHeader('Cache-Control', 'no-cache');
}

app.use('/shared', express.static(path.join(__dirname, '..', 'shared'), { setHeaders: semCacheParaCodigo }));
app.use(
  express.static(PUBLIC_DIR, {
    index: 'index.html',
    maxAge: '1h',
    setHeaders: (res, caminho) => {
      res.setHeader('Cache-Control', 'no-cache');
      if (caminho.endsWith('index.html')) return;
      // imagens, fontes e afins podem ficar em cache por mais tempo
      if (/\.(png|jpe?g|svg|ico|woff2?|ttf)$/i.test(caminho)) res.setHeader('Cache-Control', 'public, max-age=86400');
    },
  })
);

// qualquer outra rota devolve a SPA (menos /api)
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.use('/api', (req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));

// ------------------------------------------------------------ erros e start

app.use((erro, req, res, next) => {
  console.error('[erro]', erro);
  if (res.headersSent) return next(erro);
  res.status(500).json({ erro: 'Erro interno: ' + (erro.message || 'desconhecido') });
});

/**
 * Prepara o armazenamento antes de abrir o servidor: com o Supabase
 * configurado, os dados são lidos do banco (e o banco vazio recebe o conteúdo
 * de data/db.json, se houver). Sem Supabase, usa o arquivo local.
 */
async function prepararArmazenamento() {
  if (!Supabase.configurado()) {
    store.carregar();
    return 'arquivo';
  }
  const config = Supabase.lerConfiguracao();
  const aviso = Supabase.orientacaoDaChave(config.chave);
  if (aviso && !avisouSobreAChave) {
    avisouSobreAChave = true; // uma vez por execução, em vez de a cada leitura
    console.warn(formataAviso('supabase', aviso));
  }
  store.usarRemoto(Supabase.criarCliente());
  try {
    await store.carregarRemoto();
    store.perfil.obter(); // garante o perfil no banco no primeiro uso
    return 'supabase';
  } catch (erro) {
    // O site não pode ficar fora do ar porque o banco (ou a internet) caiu:
    // segue com o arquivo local e cada alteração tenta o banco de novo.
    store.marcarRemotoIndisponivel(erro);
    store.carregar();
    console.warn(formataAviso('supabase', [
      'Não consegui usar o banco agora: ' + erro.message,
      'O site está no ar com o arquivo local (' + DATA_DIR + ').',
      'As alterações continuam sendo salvas aí e vão para o banco assim que ele responder.',
      'Confira o SUPABASE_URL, a chave e se supabase/esquema.sql já foi executado.',
    ].join('\n')));
    return 'arquivo';
  }
}

let avisouSobreAChave = false;

/** Deixa o aviso bem visível no terminal. */
function formataAviso(origem, texto) {
  return '\n  [' + origem + '] ' + texto.split('\n').join('\n  [' + origem + '] ') + '\n';
}

/** Sobe o servidor (o sistema não tem login: abre direto no painel). */
function iniciar(porta, host) {
  const silencioso = Boolean(process.env.LICITAPRO_SILENCIOSO);
  // atenção: porta 0 é válida (porta aleatória livre), por isso não se usa "||"
  const portaFinal = porta === undefined || porta === null || porta === '' ? PORT : Number(porta);
  const servidor = http.createServer(app);

  function encerrar() {
    store.salvarAgora();
    // espera os envios pendentes para o banco antes de sair
    store.encerrar()
      .catch((erro) => console.error('[supabase] falha ao encerrar:', erro.message))
      .finally(() => {
        servidor.close(() => process.exit(0));
        setTimeout(() => process.exit(0), 2000);
      });
  }

  process.on('SIGINT', encerrar);
  process.on('SIGTERM', encerrar);

  prepararArmazenamento()
    .then(() => {
      servidor.listen(portaFinal, host || HOST, () => {
        if (silencioso) return;
        console.log('');
        console.log('  DEJ Solutions & Global — gerador de propostas e orçamentos');
        console.log('  ---------------------------------------------------------');
        console.log(`  Endereço:  http://localhost:${servidor.address().port}`);
        const banco = store.situacaoRemota();
        if (store.modo() === 'supabase') {
          console.log(`  Dados em:  Supabase (${Supabase.lerConfiguracao().url})`);
          console.log(`  Cópia local: ${DATA_DIR}`);
        } else if (banco.configurado) {
          console.log(`  Dados em:  arquivo local — Supabase indisponível`);
          console.log(`             ${banco.erro || ''}`);
        } else {
          console.log(`  Dados em:  ${DATA_DIR}`);
        }
        console.log('');
      });
    })
    .catch((erro) => {
      // falha inesperada ao preparar o armazenamento (ex.: arquivo local inválido)
      console.error('');
      console.error('  Não consegui preparar o armazenamento: ' + erro.message);
      console.error('  Para começar sem o banco: LICITAPRO_ARMAZENAMENTO=arquivo npm start');
      console.error('');
      process.exit(1);
    });

  servidor.on('error', (erro) => {
    if (erro.code === 'EADDRINUSE') {
      console.error(`\n  A porta ${portaFinal} já está em uso.`);
      console.error('  Feche o outro programa ou inicie com outra porta, por exemplo:');
      console.error('     PORT=3001 npm start\n');
      process.exit(1);
    }
    throw erro;
  });

  return servidor;
}

process.on('unhandledRejection', (motivo) => console.error('[promessa não tratada]', motivo));

// Sobe o servidor automaticamente quando o arquivo é executado direto (npm start).
if (require.main === module) iniciar();

module.exports = app;
module.exports.iniciar = iniciar;
module.exports.prepararArmazenamento = prepararArmazenamento;
module.exports.ehLocal = ehLocal;
