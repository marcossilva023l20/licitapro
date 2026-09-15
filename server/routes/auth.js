'use strict';

const express = require('express');
const Auth = require('../auth');
const { usuario: Usuario, empresaPadrao, padroesPadrao } = require('../store');

const rotas = express.Router();

// Controle simples de tentativas de login (por IP + e-mail).
const tentativas = new Map();
const LIMITE_TENTATIVAS = 10;
const JANELA_MS = 15 * 60 * 1000;

function bloqueado(chave) {
  const registro = tentativas.get(chave);
  if (!registro) return false;
  if (Date.now() - registro.primeira > JANELA_MS) {
    tentativas.delete(chave);
    return false;
  }
  return registro.contagem >= LIMITE_TENTATIVAS;
}

function registrarTentativa(chave) {
  const registro = tentativas.get(chave) || { contagem: 0, primeira: Date.now() };
  registro.contagem += 1;
  tentativas.set(chave, registro);
}

function emailValido(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email || '').trim());
}

function usuarioPublico(u) {
  const { senhaHash, ...resto } = u;
  return resto;
}

rotas.get('/eu', (req, res) => {
  const u = Auth.usuarioDaRequisicao(req);
  res.json({ autenticado: Boolean(u), usuario: u ? usuarioPublico(u) : null });
});

rotas.post('/login', (req, res) => {
  const dados = req.body || {};
  const emailLimpo = String(dados.email || '').trim().toLowerCase();
  const senha = String(dados.senha || '');
  const chave = `${req.ip}|${emailLimpo}`;

  if (!emailLimpo || !senha) {
    return res.status(400).json({ erro: 'Informe e-mail e senha.' });
  }
  if (bloqueado(chave)) {
    return res.status(429).json({ erro: 'Muitas tentativas. Aguarde 15 minutos e tente novamente.' });
  }

  const u = Usuario.porEmail(emailLimpo);
  if (!u || !Auth.conferirSenha(senha, u.senhaHash)) {
    registrarTentativa(chave);
    return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
  }

  tentativas.delete(chave);
  const cookie = Auth.criarSessao(u.id);
  Auth.definirCookieSessao(res, cookie, req);
  res.json({ usuario: usuarioPublico(u) });
});

rotas.post('/logout', (req, res) => {
  const bruto = (req.cookies && req.cookies[Auth.COOKIE_NOME]) || '';
  Auth.invalidarSessao(bruto);
  Auth.limparCookieSessao(res);
  res.json({ ok: true });
});

rotas.post('/registrar', (req, res) => {
  if (process.env.LICITAPRO_REGISTRO_ABERTO === '0') {
    return res.status(403).json({ erro: 'O cadastro de novos usuários está desativado. Fale com o administrador.' });
  }
  const dados = req.body || {};
  const nome = String(dados.nome || '').trim();
  const email = String(dados.email || '').trim().toLowerCase();
  const senha = String(dados.senha || '');

  if (nome.length < 2) return res.status(400).json({ erro: 'Informe seu nome completo.' });
  if (!emailValido(email)) return res.status(400).json({ erro: 'E-mail inválido.' });
  if (senha.length < 6) return res.status(400).json({ erro: 'A senha precisa ter pelo menos 6 caracteres.' });
  if (Usuario.porEmail(email)) return res.status(409).json({ erro: 'Este e-mail já está cadastrado. Faça login.' });

  const criado = Usuario.criar({ nome, email, senhaHash: Auth.hashSenha(senha) });
  const cookie = Auth.criarSessao(criado.id);
  Auth.definirCookieSessao(res, cookie, req);
  res.status(201).json({ usuario: usuarioPublico(criado) });
});

rotas.put('/perfil', Auth.exigirLogin, (req, res) => {
  const dados = req.body || {};
  const nome = String(dados.nome || '').trim();
  const email = String(dados.email || '').trim().toLowerCase();
  if (nome.length < 2) return res.status(400).json({ erro: 'Informe seu nome completo.' });
  if (!emailValido(email)) return res.status(400).json({ erro: 'E-mail inválido.' });

  const outro = Usuario.porEmail(email);
  if (outro && outro.id !== req.usuario.id) {
    return res.status(409).json({ erro: 'Este e-mail já está em uso por outro usuário.' });
  }
  const atualizado = Usuario.atualizar(req.usuario.id, { nome, email });
  res.json({ usuario: usuarioPublico(atualizado) });
});

rotas.put('/senha', Auth.exigirLogin, (req, res) => {
  const dados = req.body || {};
  const atual = String(dados.senhaAtual || '');
  const nova = String(dados.senhaNova || '');
  if (!Auth.conferirSenha(atual, req.usuario.senhaHash)) {
    return res.status(400).json({ erro: 'A senha atual está incorreta.' });
  }
  if (nova.length < 6) return res.status(400).json({ erro: 'A nova senha precisa ter pelo menos 6 caracteres.' });
  Usuario.atualizar(req.usuario.id, { senhaHash: Auth.hashSenha(nova) });
  res.json({ ok: true });
});

// ------------------------------------------------------- dados da empresa

const CAMPOS_TEXTO_EMPRESA = [
  'razaoSocial', 'nomeFantasia', 'cnpj', 'inscricaoEstadual', 'telefone', 'email', 'endereco',
  'cidade', 'uf', 'cep', 'banco', 'agencia', 'conta', 'chavePix', 'representante',
  'cpfRepresentante', 'cargoRepresentante', 'logo', 'assinatura',
];

rotas.put('/empresa', Auth.exigirLogin, (req, res) => {
  const enviado = req.body || {};
  const empresa = Object.assign(empresaPadrao(), req.usuario.empresa || {});
  CAMPOS_TEXTO_EMPRESA.forEach((campo) => {
    if (enviado[campo] !== undefined) empresa[campo] = String(enviado[campo] || '').trim().slice(0, 1200);
  });
  if (enviado.simplesNacional !== undefined) {
    empresa.simplesNacional = enviado.simplesNacional === true || enviado.simplesNacional === 'true';
  }
  if (empresa.uf) empresa.uf = empresa.uf.toUpperCase().slice(0, 2);
  const atualizado = Usuario.atualizar(req.usuario.id, { empresa });
  res.json({ empresa: atualizado.empresa });
});

rotas.put('/padroes', Auth.exigirLogin, (req, res) => {
  const enviado = req.body || {};
  const padroes = Object.assign(padroesPadrao(), req.usuario.padroes || {});
  ['prazoEntrega', 'condicoesPagamento', 'garantia', 'observacoes', 'cidadeUf'].forEach((campo) => {
    if (enviado[campo] !== undefined) padroes[campo] = String(enviado[campo] || '').trim().slice(0, 600);
  });
  if (enviado.validadeDias !== undefined) padroes.validadeDias = Number(enviado.validadeDias) || 0;
  const atualizado = Usuario.atualizar(req.usuario.id, { padroes });
  res.json({ padroes: atualizado.padroes });
});

module.exports = rotas;
