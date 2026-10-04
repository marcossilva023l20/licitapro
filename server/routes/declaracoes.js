'use strict';

/**
 * Impressão das declarações: a folha timbrada (mesmo padrão da proposta, com a
 * logomarca no cabeçalho) que vai assinada ao certame — sem precisar imprimir a
 * proposta inteira.
 *
 * A declaração vem do que está na tela (pode estar sem salvar) e o contexto dos
 * campos entre chaves (`{ORGAO}`, `{EDITAL}`...) vem do documento enviado junto.
 * Sem documento, valem os dados da empresa: dá para imprimir um modelo guardado
 * direto da seção «Declarações».
 */

const express = require('express');
const Formato = require('../../shared/format');
const Declaracoes = require('../../shared/declaracoes');
const { perfil: Perfil } = require('../store');
const Pdf = require('../pdf');

const rotas = express.Router();

function nomeArquivoSeguro(nome) {
  const simples = Formato.slug(nome.replace(/\.pdf$/i, '')).slice(0, 80) || 'declaracao';
  return { simples: simples + '.pdf', completo: nome };
}

rotas.post('/pdf', async (req, res) => {
  const corpo = req.body || {};
  const lista = (Array.isArray(corpo.declaracoes) ? corpo.declaracoes : [corpo.declaracao])
    .filter((d) => d && (String(d.titulo || '').trim() || String(d.texto || '').trim()))
    .map((d) => Declaracoes.criar(d));

  if (!lista.length) {
    return res.status(400).json({ erro: 'Escolha pelo menos uma declaração para imprimir.' });
  }

  const documento = corpo.documento && typeof corpo.documento === 'object' ? corpo.documento : {};
  const empresa = Object.assign({}, Perfil.obter().empresa || {}, documento.proponente || {});
  const paraDownload = req.query.download === '1' || req.query.download === 'true';

  // campos entre chaves que ficaram sem valor: a tela avisa quais são
  const vazios = [];
  lista.forEach((declaracao) => {
    Declaracoes.tokensVazios(declaracao.texto, documento, empresa).forEach((chave) => {
      if (vazios.indexOf(chave) < 0) vazios.push(chave);
    });
  });

  const fotosIgnoradas = [];
  try {
    const buffer = await Pdf.gerarPdfDeclaracoes(lista, documento, empresa, { relatorio: fotosIgnoradas });
    const nome = Pdf.nomeArquivoDeclaracao(lista);
    const { simples, completo } = nomeArquivoSeguro(nome);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', buffer.length);
    res.setHeader(
      'Content-Disposition',
      `${paraDownload ? 'attachment' : 'inline'}; filename="${simples}"; filename*=UTF-8''${encodeURIComponent(completo)}`
    );
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Fotos-Ignoradas', String(fotosIgnoradas.length));
    if (fotosIgnoradas.length) {
      res.setHeader('X-Fotos-Ignoradas-Detalhe', encodeURIComponent(Pdf.descreverFotosIgnoradas(fotosIgnoradas)));
    }
    if (vazios.length) res.setHeader('X-Campos-Vazios', encodeURIComponent(vazios.join(',')));
    res.end(buffer);
  } catch (erro) {
    console.error('[declaracoes] erro ao gerar o PDF:', erro);
    res.status(500).json({ erro: 'Não foi possível gerar a declaração: ' + erro.message });
  }
});

module.exports = rotas;
