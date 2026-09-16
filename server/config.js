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
  DATA_DIR,
  UPLOADS_DIR,
  CACHE_IMG_DIR,
  DB_FILE,
  PORT,
  HOST,
  NOME_ARQUIVO_MODELO,
  garantirPastas,
};
