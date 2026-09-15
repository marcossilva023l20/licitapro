'use strict';

/**
 * Gera o arquivo de modelo de importação (.xlsx) na pasta atual.
 * Uso: npm run modelo
 */

const fs = require('fs');
const path = require('path');
const Modelo = require('../server/modeloImportacao');

const destino = path.resolve(process.argv[2] || 'Modelo_Importacao_Itens_LicitaPro.xlsx');
fs.writeFileSync(destino, Modelo.gerarBuffer());
console.log('Modelo gerado em:', destino);
console.log('Abra no Excel ou no Google Planilhas, preencha a aba "Itens" e envie no site.');
