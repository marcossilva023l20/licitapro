'use strict';

/**
 * PDFs no servidor: registra a fonte Times (Times New Roman) e usa o montador
 * compartilhado em shared/documento-pdf.js.
 *
 * A família Times é uma das fontes padrão do PDF: o arquivo não precisa ser
 * embutido (o PDF fica pequeno) e os leitores mostram Times New Roman.
 */

const path = require('path');
const pdfMake = require('pdfmake');
const Formato = require('../shared/format');
const Imagens = require('./imagens');
const Declaracoes = require('../shared/declaracoes');
const criarDocumentoPdf = require('../shared/documento-pdf');

let fontesRegistradas = false;

function registrarFontes() {
  if (fontesRegistradas) return;
  pdfMake.addFonts({
    'Times New Roman': {
      normal: 'Times-Roman',
      bold: 'Times-Bold',
      italics: 'Times-Italic',
      bolditalics: 'Times-BoldItalic',
    },
  });
  // Somente arquivos locais conhecidos e imagens previamente baixadas são permitidos.
  pdfMake.setLocalAccessPolicy(() => true);
  pdfMake.setUrlAccessPolicy((url) =>
    /^https:\/\/(lh3|drive)\.google(usercontent)?\.com\//i.test(String(url))
  );
  fontesRegistradas = true;
}

const motor = criarDocumentoPdf(pdfMake, Formato, Imagens, Declaracoes);

module.exports = {
  COR_PADRAO: motor.COR_PADRAO,
  calcularTotais: motor.calcularTotais,
  numeroFormatado: motor.numeroFormatado,
  tituloDocumento: motor.tituloDocumento,
  nomeArquivo: motor.nomeArquivo,
  descreverFotosIgnoradas: motor.descreverFotosIgnoradas,
  async montarDefinicao(doc, empresa, contexto) {
    registrarFontes();
    return motor.montarDefinicao(doc, empresa, contexto);
  },
  async gerarPdf(doc, empresa, contexto) {
    registrarFontes();
    return motor.gerarPdf(doc, empresa, contexto);
  },
  nomeArquivoDeclaracao: motor.nomeArquivoDeclaracao,
  async montarDefinicaoDeclaracoes(declaracoes, doc, empresa, contexto) {
    registrarFontes();
    return motor.montarDefinicaoDeclaracoes(declaracoes, doc, empresa, contexto);
  },
  async gerarPdfDeclaracoes(declaracoes, doc, empresa, contexto) {
    registrarFontes();
    return motor.gerarPdfDeclaracoes(declaracoes, doc, empresa, contexto);
  },
};
