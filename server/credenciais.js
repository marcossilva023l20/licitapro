'use strict';

/**
 * Credenciais do banco (Supabase) gravadas no arquivo .env.
 *
 * Ficam neste módulo porque dois caminhos precisam escrever exatamente o mesmo
 * arquivo, preservando o que já existe lá:
 *   - a linha de comando: npm run supabase -- configurar;
 *   - a própria tela do sistema (POST /api/banco/configurar), quando ele está
 *     rodando na máquina do usuário — assim dá para ligar o banco sem abrir o
 *     terminal nem editar arquivo nenhum.
 *
 * A chave é gravada no servidor e usada só por ele: nunca é enviada ao
 * navegador (veja o teste de segurança da suíte).
 */

const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const CABECALHO = '# Banco de dados (Supabase) — veja o README, seção 4';

/** Onde ficam as credenciais (LICITAPRO_ENV_FILE permite outro arquivo: testes). */
function caminhoEnv() {
  return process.env.LICITAPRO_ENV_FILE || path.join(RAIZ, '.env');
}

/** Tira os espaços e a barra do fim do endereço digitado. */
function limparEndereco(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

/** O endereço parece o de um projeto (https://xxxx.supabase.co, localhost…)? */
function enderecoValido(url) {
  return /^https?:\/\/[^\s/]+\.[^\s/]+$/i.test(limparEndereco(url));
}

/**
 * Grava (ou atualiza) as credenciais no arquivo .env, preservando o resto do
 * arquivo e os comentários. Só as chaves informadas são tocadas.
 */
function atualizarEnv(valores, caminho) {
  const arquivo = caminho || caminhoEnv();
  const existentes = fs.existsSync(arquivo)
    ? fs.readFileSync(arquivo, 'utf8').split(/\r?\n/)
    : [];
  const pendentes = Object.assign({}, valores);
  const saida = [];

  existentes.forEach((linha) => {
    const texto = linha.trim();
    const igual = texto.indexOf('=');
    const chave = igual > 0 ? texto.slice(0, igual).trim() : '';
    const comentada = texto.startsWith('#');
    if (!comentada && chave && Object.prototype.hasOwnProperty.call(pendentes, chave)) {
      saida.push(chave + '=' + pendentes[chave]);
      delete pendentes[chave];
      return;
    }
    saida.push(linha);
  });

  const restantes = Object.keys(pendentes);
  if (restantes.length) {
    while (saida.length && saida[saida.length - 1].trim() === '') saida.pop();
    if (saida.length) saida.push('');
    saida.push(CABECALHO);
    restantes.forEach((chave) => saida.push(chave + '=' + pendentes[chave]));
  }

  const conteudo = saida.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  fs.writeFileSync(arquivo, conteudo, { mode: 0o600 }); // só o dono lê
  return conteudo;
}

/**
 * Grava as credenciais informadas no .env e devolve onde ficaram.
 * O endereço pode vir vazio (aí vale o que já estiver configurado/padrão).
 */
function gravarCredenciais(informado) {
  const dados = informado || {};
  const valores = {};
  const url = limparEndereco(dados.url);
  const chave = String(dados.chave || '').trim();
  if (url) valores.SUPABASE_URL = url;
  if (chave) valores.SUPABASE_SERVICE_KEY = chave;

  const arquivo = dados.caminho || caminhoEnv();
  return { caminho: arquivo, conteudo: atualizarEnv(valores, arquivo), url, chave };
}

/**
 * Faz as credenciais valerem nesta execução, sem precisar reiniciar o sistema
 * (depois de gravar pela tela o servidor já reconecta na hora).
 */
function aplicarNoAmbiente(informado) {
  const dados = informado || {};
  const url = limparEndereco(dados.url);
  const chave = String(dados.chave || '').trim();
  if (url) process.env.SUPABASE_URL = url;
  if (chave) process.env.SUPABASE_SERVICE_KEY = chave;
  return { url, chave };
}

module.exports = {
  RAIZ,
  CABECALHO,
  caminhoEnv,
  limparEndereco,
  enderecoValido,
  atualizarEnv,
  gravarCredenciais,
  aplicarNoAmbiente,
};
