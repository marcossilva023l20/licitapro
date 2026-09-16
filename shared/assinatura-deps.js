/**
 * Junta as bibliotecas (pdf-lib, node-forge e @signpdf) com o módulo de
 * assinatura do sistema. Serve para:
 *   - o navegador, pelo pacote gerado por scripts/vendor-assinatura.js
 *     (public/vendor/assinatura.min.js);
 *   - o Node (testes e linha de comando), importando este arquivo direto.
 */
'use strict';

const criarAssinatura = require('./assinatura.js');
const forge = require('node-forge');
const PDFLib = require('pdf-lib');
const { pdflibAddPlaceholder } = require('@signpdf/placeholder-pdf-lib');
const { SignPdf } = require('@signpdf/signpdf');
const { Signer } = require('@signpdf/utils');
const Formato = require('./format.js');

module.exports = criarAssinatura({
  forge,
  pdfLib: PDFLib,
  addPlaceholder: pdflibAddPlaceholder,
  SignPdf,
  Signer,
  Buffer,
  Formato,
});
