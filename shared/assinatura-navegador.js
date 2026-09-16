/**
 * Entrada do pacote do navegador: junta as bibliotecas de assinatura e publica
 * a API em `window.AssinaturaDigital` (gerado por scripts/vendor-assinatura.js).
 */
'use strict';

const { Buffer } = require('buffer');

if (typeof globalThis !== 'undefined' && !globalThis.Buffer) {
  globalThis.Buffer = Buffer;
}

const api = require('./assinatura-deps.js');

if (typeof globalThis !== 'undefined') {
  globalThis.AssinaturaDigital = api;
}
