'use strict';

/**
 * Autenticação: senhas com scrypt + sessões assinadas por cookie (HMAC).
 * Não há dependência externa além do próprio Node.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { usuario: Usuario } = require('./store');
const { segredo, DATA_DIR, garantirPastas } = require('./config');

const COOKIE_NOME = 'licitapro_sessao';
const DURACAO_SESSAO_MS = 1000 * 60 * 60 * 24 * 30; // 30 dias
const SESSOES_FILE = path.join(DATA_DIR, 'sessoes.json');
const PRIMEIRO_ACESSO_FILE = path.join(DATA_DIR, 'primeiro-acesso.txt');

// ------------------------------------------------------------------- senhas

function hashSenha(senha) {
  const sal = crypto.randomBytes(16).toString('hex');
  const derivada = crypto.scryptSync(String(senha), sal, 64).toString('hex');
  return `scrypt$${sal}$${derivada}`;
}

function conferirSenha(senha, hashArmazenado) {
  try {
    const [algoritmo, sal, esperado] = String(hashArmazenado || '').split('$');
    if (algoritmo !== 'scrypt' || !sal || !esperado) return false;
    const derivada = crypto.scryptSync(String(senha), sal, 64).toString('hex');
    const a = Buffer.from(derivada, 'hex');
    const b = Buffer.from(esperado, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch (_) {
    return false;
  }
}

// ------------------------------------------------------------------ sessões

let sessoes = null;

function carregarSessoes() {
  if (sessoes) return sessoes;
  garantirPastas();
  try {
    sessoes = JSON.parse(fs.readFileSync(SESSOES_FILE, 'utf8') || '{}');
  } catch (_) {
    sessoes = {};
  }
  return sessoes;
}

let timerSessoes = null;
function gravarSessoes() {
  if (timerSessoes) clearTimeout(timerSessoes);
  timerSessoes = setTimeout(() => {
    try {
      fs.writeFileSync(SESSOES_FILE, JSON.stringify(sessoes), 'utf8');
    } catch (e) {
      console.error('[auth] falha ao gravar sessões:', e.message);
    }
  }, 200);
  if (timerSessoes.unref) timerSessoes.unref();
}

function assinar(valor) {
  return crypto.createHmac('sha256', segredo()).update(valor).digest('base64url');
}

function criarSessao(usuarioId) {
  const s = carregarSessoes();
  const token = crypto.randomBytes(24).toString('base64url');
  s[token] = { usuarioId, expiraEm: Date.now() + DURACAO_SESSAO_MS };
  // limpeza de sessões expiradas
  for (const [t, dados] of Object.entries(s)) {
    if (!dados || dados.expiraEm < Date.now()) delete s[t];
  }
  gravarSessoes();
  return `${token}.${assinar(token)}`;
}

function invalidarSessao(valorCookie) {
  const s = carregarSessoes();
  const token = String(valorCookie || '').split('.')[0];
  if (token && s[token]) {
    delete s[token];
    gravarSessoes();
  }
}

function usuarioDaRequisicao(req) {
  const bruto = (req.cookies && req.cookies[COOKIE_NOME]) || '';
  const [token, assinatura] = String(bruto).split('.');
  if (!token || !assinatura) return null;
  if (assinar(token) !== assinatura) return null;
  const s = carregarSessoes();
  const dados = s[token];
  if (!dados || dados.expiraEm < Date.now()) return null;
  return Usuario.porId(dados.usuarioId);
}

/** Middleware: exige usuário logado em rotas de API. */
function exigirLogin(req, res, next) {
  const u = usuarioDaRequisicao(req);
  if (!u) return res.status(401).json({ erro: 'Sessão expirada. Entre novamente.' });
  req.usuario = u;
  next();
}

function definirCookieSessao(res, valor, req) {
  const seguro = String(req.headers['x-forwarded-proto'] || '').includes('https');
  const partes = [
    `${COOKIE_NOME}=${valor}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(DURACAO_SESSAO_MS / 1000)}`,
  ];
  if (seguro) partes.push('Secure');
  res.setHeader('Set-Cookie', partes.join('; '));
}

function limparCookieSessao(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NOME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

/** Cria o primeiro usuário (administrador) a partir de variáveis de ambiente. */
function criarUsuarioInicialSeNecessario() {
  if (Usuario.listar().length > 0) return null;
  const email = (process.env.LICITAPRO_ADMIN_EMAIL || 'admin@licitapro.com.br').toLowerCase();
  const senha = process.env.LICITAPRO_ADMIN_SENHA || 'admin123';
  const nome = process.env.LICITAPRO_ADMIN_NOME || 'Administrador';

  // Se a senha padrão estiver em uso, gera uma senha aleatória e mostra no log.
  const usandoSenhaPadrao = !process.env.LICITAPRO_ADMIN_SENHA;
  const senhaFinal = usandoSenhaPadrao ? crypto.randomBytes(6).toString('base64url') : senha;

  const criado = Usuario.criar({ nome, email, senhaHash: hashSenha(senhaFinal) });

  // guarda as credenciais num arquivo, para não se perderem caso o terminal seja fechado
  try {
    garantirPastas();
    fs.writeFileSync(
      PRIMEIRO_ACESSO_FILE,
      [
        'LicitaPro — primeiro acesso',
        'Criado em: ' + new Date().toLocaleString('pt-BR'),
        '',
        'E-mail: ' + criado.email,
        'Senha : ' + senhaFinal,
        '',
        'Entre no site, abra "Minha empresa → Meu acesso" e troque a senha.',
        'Depois de trocar a senha, este arquivo pode ser apagado.',
        '',
      ].join('\n'),
      { mode: 0o600 }
    );
  } catch (erro) {
    console.error('[auth] não foi possível gravar o arquivo de primeiro acesso:', erro.message);
  }

  console.log('\n=============================================================');
  console.log(' Primeiro acesso criado:');
  console.log('   E-mail: ' + criado.email);
  console.log('   Senha : ' + senhaFinal);
  console.log(' (as mesmas informações estão em data/primeiro-acesso.txt)');
  console.log(' (troque a senha em "Minha empresa → Meu acesso" após entrar)');
  console.log('=============================================================\n');
  return { email: criado.email, senha: senhaFinal };
}

module.exports = {
  COOKIE_NOME,
  hashSenha,
  conferirSenha,
  criarSessao,
  invalidarSessao,
  usuarioDaRequisicao,
  exigirLogin,
  definirCookieSessao,
  limparCookieSessao,
  criarUsuarioInicialSeNecessario,
};
