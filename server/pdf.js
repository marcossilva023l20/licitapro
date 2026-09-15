'use strict';

/**
 * PDFs no servidor: registra as fontes Roboto do pdfmake (a partir do disco)
 * e usa o montador compartilhado em shared/documento-pdf.js.
 */

const path = require('path');
const pdfMake = require('pdfmake');
const Formato = require('../shared/format');
const Imagens = require('./imagens');
const criarDocumentoPdf = require('../shared/documento-pdf');

const CAMINHO_FONTES = path.join(__dirname, '..', 'node_modules', 'pdfmake', 'build', 'fonts', 'Roboto');

let fontesRegistradas = false;

function registrarFontes() {
  if (fontesRegistradas) return;
  const arquivo = (nome) => path.join(CAMINHO_FONTES, nome);
  pdfMake.addFonts({
    Roboto: {
      normal: arquivo('Roboto-Regular.ttf'),
      bold: arquivo('Roboto-Medium.ttf'),
      italics: arquivo('Roboto-Italic.ttf'),
      bolditalics: arquivo('Roboto-MediumItalic.ttf'),
    },
  });
  // Somente arquivos locais conhecidos e imagens previamente baixadas são permitidos.
  pdfMake.setLocalAccessPolicy(() => true);
  pdfMake.setUrlAccessPolicy((url) =>
    /^https:\/\/(lh3|drive)\.google(usercontent)?\.com\//i.test(String(url))
  );
  fontesRegistradas = true;
}

const motor = criarDocumentoPdf(pdfMake, Formato, Imagens);

module.exports = {
  COR_PADRAO: motor.COR_PADRAO,
  calcularTotais: motor.calcularTotais,
  numeroFormatado: motor.numeroFormatado,
  tituloDocumento: motor.tituloDocumento,
  nomeArquivo: motor.nomeArquivo,
  async montarDefinicao(doc, empresa) {
    registrarFontes();
    return motor.montarDefinicao(doc, empresa);
  },
  async gerarPdf(doc, empresa) {
    registrarFontes();
    return motor.gerarPdf(doc, empresa);
  },
};
