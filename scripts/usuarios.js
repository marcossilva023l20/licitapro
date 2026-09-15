'use strict';

/**
 * Ferramentas de linha de comando para administrar usuários.
 *
 * Uso:
 *   npm run usuarios                              → lista os usuários cadastrados
 *   npm run usuarios -- senha email@x.com novaSenha   → troca a senha de um usuário
 *   npm run usuarios -- criar "Nome" email@x.com senha → cria um usuário
 */

const Auth = require('../server/auth');
const { usuario: Usuario } = require('../server/store');

const [acao, ...argumentos] = process.argv.slice(2);

function listar() {
  const usuarios = Usuario.listar();
  if (!usuarios.length) {
    console.log('Nenhum usuário cadastrado ainda.');
    return;
  }
  console.log('\nUsuários cadastrados:\n');
  usuarios.forEach((u) => {
    const documentos = require('../server/store').documento.listarPorUsuario(u.id).length;
    console.log(`  ${u.email}`);
    console.log(`     nome: ${u.nome}  |  criado em: ${new Date(u.criadoEm).toLocaleDateString('pt-BR')}  |  documentos: ${documentos}`);
  });
  console.log('');
}

if (!acao || acao === 'listar') {
  listar();
} else if (acao === 'senha') {
  const [email, novaSenha] = argumentos;
  if (!email || !novaSenha) {
    console.error('Informe o e-mail e a nova senha: npm run usuarios -- senha email@x.com novaSenha');
    process.exit(1);
  }
  if (novaSenha.length < 6) {
    console.error('A senha precisa ter pelo menos 6 caracteres.');
    process.exit(1);
  }
  const u = Usuario.porEmail(email);
  if (!u) {
    console.error('Usuário não encontrado:', email);
    process.exit(1);
  }
  Usuario.atualizar(u.id, { senhaHash: Auth.hashSenha(novaSenha) });
  console.log('Senha alterada para', u.email);
} else if (acao === 'criar') {
  const [nome, email, senha] = argumentos;
  if (!nome || !email || !senha) {
    console.error('Uso: npm run usuarios -- criar "Nome Completo" email@x.com senha');
    process.exit(1);
  }
  if (Usuario.porEmail(email)) {
    console.error('Já existe um usuário com este e-mail.');
    process.exit(1);
  }
  const criado = Usuario.criar({ nome, email, senhaHash: Auth.hashSenha(senha) });
  console.log('Usuário criado:', criado.email);
} else {
  console.error('Ação desconhecida:', acao);
  console.error('Ações: listar (padrão), senha, criar');
  process.exit(1);
}
