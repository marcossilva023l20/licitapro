'use strict';

/**
 * Configurações centrais da aplicação.
 * Tudo que é gravado em tempo de execução fica dentro de DATA_DIR,
 * que por padrão é a pasta "data" na raiz do projeto (não versionada no git).
 */

const path = require('path');
const fs = require('fs');

const RAIZ = path.resolve(__dirname, '..');
const DATA_DIR = process.env.LICITAPRO_DATA_DIR
  ? path.resolve(process.env.LICITAPRO_DATA_DIR)
  : path.join(RAIZ, 'data');

const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const CACHE_IMG_DIR = path.join(DATA_DIR, 'cache-imagens');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const SECRET_FILE = path.join(DATA_DIR, 'secret.key');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const NOME_ARQUIVO_MODELO = 'Modelo_Importacao_Itens_LicitaPro.xlsx';

/** Garante que as pastas de dados existem. */
function garantirPastas() {
  for (const dir of [DATA_DIR, UPLOADS_DIR, CACHE_IMG_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

/** Segredo usado para assinar os cookies de sessão (gerado uma única vez). */
function segredo() {
  garantirPastas();
  if (process.env.LICITAPRO_SECRET) return process.env.LICITAPRO_SECRET;
  if (!fs.existsSync(SECRET_FILE)) {
    const crypto = require('crypto');
    fs.writeFileSync(SECRET_FILE, crypto.randomBytes(48).toString('hex'), { mode: 0o600 });
  }
  return fs.readFileSync(SECRET_FILE, 'utf8').trim();
}

module.exports = {
  RAIZ,
  DATA_DIR,
  UPLOADS_DIR,
  CACHE_IMG_DIR,
  DB_FILE,
  PORT,
  HOST,
  NOME_ARQUIVO_MODELO,
  garantirPastas,
  segredo,
};
