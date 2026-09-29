'use strict';

/**
 * Configurações centrais da aplicação.
 * Tudo que é gravado em tempo de execução fica dentro de DATA_DIR,
 * que por padrão é a pasta "data" na raiz do projeto (não versionada no git).
 */

const path = require('path');
const fs = require('fs');

const RAIZ = path.resolve(__dirname, '..');

/**
 * Carrega o arquivo .env da raiz do projeto, se existir (para não precisar
 * exportar as variáveis na mão em toda execução). O que já estiver definido no
 * ambiente tem prioridade — é o caso das hospedagens (Render, Railway...).
 */
function carregarEnv() {
  const arquivo = path.join(RAIZ, '.env');
  if (!fs.existsSync(arquivo)) return;
  if (typeof process.loadEnvFile === 'function') {
    try {
      process.loadEnvFile(arquivo);
      return;
    } catch (_) { /* segue para a leitura manual */ }
  }
  try {
    fs.readFileSync(arquivo, 'utf8').split(/\r?\n/).forEach((linha) => {
      const texto = linha.trim();
      if (!texto || texto.startsWith('#')) return;
      const igual = texto.indexOf('=');
      if (igual < 1) return;
      const chave = texto.slice(0, igual).trim();
      let valor = texto.slice(igual + 1).trim();
      if (/^".*"$/.test(valor) || /^'.*'$/.test(valor)) valor = valor.slice(1, -1);
      if (process.env[chave] === undefined) process.env[chave] = valor;
    });
  } catch (erro) {
    console.error('[config] não consegui ler o .env:', erro.message);
  }
}

carregarEnv();
const DATA_DIR = process.env.LICITAPRO_DATA_DIR
  ? path.resolve(process.env.LICITAPRO_DATA_DIR)
  : path.join(RAIZ, 'data');

const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const CACHE_IMG_DIR = path.join(DATA_DIR, 'cache-imagens');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const NOME_ARQUIVO_MODELO = 'Modelo_Importacao_Itens_DEJ.xlsx';

/** Garante que as pastas de dados existem. */
function garantirPastas() {
  for (const dir of [DATA_DIR, UPLOADS_DIR, CACHE_IMG_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

module.exports = {
  RAIZ,
  carregarEnv,
  DATA_DIR,
  UPLOADS_DIR,
  CACHE_IMG_DIR,
  DB_FILE,
  PORT,
  HOST,
  NOME_ARQUIVO_MODELO,
  garantirPastas,
};
