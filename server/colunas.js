'use strict';

/**
 * As colunas da planilha agora vivem em shared/colunas.js, para serem usadas
 * também pelo navegador (modo local). Este arquivo apenas reexporta.
 */

module.exports = require('../shared/colunas');
