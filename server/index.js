'use strict';

/**
 * DEJ Solutions & Global — servidor web.
 * Serve a interface (SPA) e a API de documentos, importação e geração de PDF.
 */

const path = require('path');
const express = require('express');
const { PORT, HOST, garantirPastas, DATA_DIR } = require('./config');

garantirPastas();

const store = require('./store');
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

app.get('/api/health', (req, res) => {
  const banco = store.carregar();
  res.json({
    ok: true,
    documentos: banco.documentos.length,
    dadosEm: DATA_DIR,
    versao: require('../package.json').version,
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

/** Sobe o servidor (o sistema não tem login: abre direto no painel). */
function iniciar(porta, host) {
  store.perfil.obter(); // cria o perfil no primeiro uso
  const silencioso = Boolean(process.env.LICITAPRO_SILENCIOSO);
  // atenção: porta 0 é válida (porta aleatória livre), por isso não se usa "||"
  const portaFinal = porta === undefined || porta === null || porta === '' ? PORT : Number(porta);
  const servidor = app.listen(portaFinal, host || HOST, () => {
    if (silencioso) return;
    console.log('');
    console.log('  DEJ Solutions & Global — gerador de propostas e orçamentos');
    console.log('  ---------------------------------------------------------');
    console.log(`  Endereço:  http://localhost:${servidor.address().port}`);
    console.log(`  Dados em:  ${DATA_DIR}`);
    console.log('');
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

  function encerrar() {
    store.salvarAgora();
    servidor.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000);
  }

  process.on('SIGINT', encerrar);
  process.on('SIGTERM', encerrar);
  return servidor;
}

process.on('unhandledRejection', (motivo) => console.error('[promessa não tratada]', motivo));

// Sobe o servidor automaticamente quando o arquivo é executado direto (npm start).
if (require.main === module) iniciar();

module.exports = app;
module.exports.iniciar = iniciar;
