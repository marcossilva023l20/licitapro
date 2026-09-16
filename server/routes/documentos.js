'use strict';

const express = require('express');
const XLSX = require('xlsx');
const { documento: Documento, perfil: Perfil } = require('../store');
const Esquema = require('../documento-schema');
const Pdf = require('../pdf');
const Formato = require('../../shared/format');
const { COLUNAS } = require('../colunas');
const PlanilhaAuxiliar = require('../../shared/planilha-auxiliar');

const rotas = express.Router();

const LIMITE_TEXTO = 200;

/** Resumo (sem os itens) usado na listagem. */
function resumo(doc) {
  const totais = Pdf.calcularTotais(doc);
  return {
    id: doc.id,
    tipo: doc.tipo,
    numero: doc.numero,
    numeroFormatado: Pdf.numeroFormatado(doc),
    status: doc.status,
    data: doc.data,
    titulo: doc.tipo === 'orcamento' ? 'Orçamento' : 'Proposta de Fornecimento',
    destinatario: doc.tipo === 'orcamento' ? (doc.cliente && doc.cliente.nome) || '' : (doc.orgao && doc.orgao.nome) || '',
    processo: (doc.orgao && doc.orgao.processo) || '',
    quantidadeItens: (doc.itens || []).length,
    total: totais.total,
    atualizadoEm: doc.atualizadoEm,
    criadoEm: doc.criadoEm,
  };
}

// ------------------------------------------------------------------ listagem

rotas.get('/', (req, res) => {
  const { tipo, status, busca, ano } = req.query;
  let lista = Documento.listar().map(resumo);

  if (tipo) lista = lista.filter((d) => d.tipo === tipo);
  if (status) lista = lista.filter((d) => d.status === status);
  if (ano) lista = lista.filter((d) => String(d.numero.ano) === String(ano));
  if (busca) {
    const alvo = String(busca).toLowerCase();
    lista = lista.filter((d) =>
      [d.destinatario, d.numeroFormatado, d.processo, d.titulo].join(' ').toLowerCase().includes(alvo)
    );
  }

  const totais = lista.reduce(
    (acc, d) => {
      acc.quantidade += 1;
      acc.valor += d.total;
      if (d.status === 'ganha') { acc.ganhas += 1; acc.valorGanho += d.total; }
      if (d.status === 'enviada') acc.enviadas += 1;
      return acc;
    },
    { quantidade: 0, valor: 0, valorGanho: 0, ganhas: 0, enviadas: 0 }
  );
  totais.valor = Formato.arredondar(totais.valor, 2);
  totais.valorGanho = Formato.arredondar(totais.valorGanho, 2);

  res.json({ documentos: lista, totais });
});

// --------------------------------------------------------- número sequencial

rotas.get('/proximo-numero', (req, res) => {
  const tipo = req.query.tipo === 'orcamento' ? 'orcamento' : 'proposta';
  const ano = Number(req.query.ano) || new Date().getFullYear();
  const grupo = String(req.query.grupo || '').slice(0, 30);
  const sequencial = Documento.proximoNumero(tipo, ano, grupo);
  res.json({ sequencial, ano, grupo, numeroFormatado: Formato.numeroDocumento(sequencial, ano) });
});

// ------------------------------------------------------------------- CRUD

rotas.get('/:id', (req, res) => {
  const doc = Documento.porId(req.params.id);
  if (!doc) return res.status(404).json({ erro: 'Documento não encontrado.' });
  res.json({ documento: doc, totais: Pdf.calcularTotais(doc) });
});

rotas.post('/', (req, res) => {
  const dados = req.body || {};
  const tipo = Esquema.TIPOS.includes(dados.tipo) ? dados.tipo : 'proposta';
  const numeroEnviado = dados.numero || {};
  const ano = Number(numeroEnviado.ano) || new Date().getFullYear();
  const grupo = String(numeroEnviado.grupo || '').slice(0, 30);

  let sequencial = Number(numeroEnviado.sequencial) || 0;
  if (!sequencial) sequencial = Documento.proximoNumero(tipo, ano, grupo);

  const saneado = Esquema.sanear(Object.assign({}, dados, { numero: { sequencial, ano, grupo } }), Perfil.obter(), tipo);
  const criado = Documento.criar(saneado);
  Documento.reservarNumero(tipo, ano, grupo, sequencial);
  res.status(201).json({ documento: criado });
});

rotas.put('/:id', (req, res) => {
  const atual = Documento.porId(req.params.id);
  if (!atual) return res.status(404).json({ erro: 'Documento não encontrado.' });

  const saneado = Esquema.sanear(req.body || {}, Perfil.obter(), atual.tipo, atual);
  const salvo = Documento.substituir(req.params.id, saneado);
  if (saneado.numero) {
    Documento.reservarNumero(saneado.tipo, saneado.numero.ano, saneado.numero.grupo, saneado.numero.sequencial);
  }
  res.json({ documento: salvo, totais: Pdf.calcularTotais(salvo) });
});

rotas.delete('/:id', (req, res) => {
  const removeu = Documento.remover(req.params.id);
  if (!removeu) return res.status(404).json({ erro: 'Documento não encontrado.' });
  res.json({ ok: true });
});

rotas.post('/:id/duplicar', (req, res) => {
  const origem = Documento.porId(req.params.id);
  if (!origem) return res.status(404).json({ erro: 'Documento não encontrado.' });

  const ano = new Date().getFullYear();
  const grupo = (origem.numero && origem.numero.grupo) || '';
  const sequencial = Documento.proximoNumero(origem.tipo, ano, grupo);

  const copia = Esquema.sanear(
    Object.assign({}, origem, {
      numero: { sequencial, ano, grupo },
      status: 'rascunho',
      id: undefined,
      itens: (origem.itens || []).map((i) => Object.assign({}, i, { id: undefined })),
    }),
    Perfil.obter(),
    origem.tipo
  );
  delete copia.id;
  const criado = Documento.criar(copia);
  Documento.reservarNumero(origem.tipo, ano, grupo, sequencial);
  res.status(201).json({ documento: criado });
});

// ---------------------------------------------------------------------- PDF

function nomeArquivoSeguro(nome) {
  const simples = Formato.slug(nome.replace(/\.pdf$/i, '')).slice(0, 80) || 'documento';
  return { simples: simples + '.pdf', completo: nome };
}

async function responderPdf(res, doc, paraDownload) {
  const empresa = Perfil.obter().empresa || {};
  // Relatório das fotos que não entraram no PDF: a tela usa para avisar o usuário.
  const fotosIgnoradas = [];
  const buffer = await Pdf.gerarPdf(doc, empresa, { relatorio: fotosIgnoradas });
  const nome = Pdf.nomeArquivo(doc, empresa);
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
  res.end(buffer);
}

rotas.get('/:id/pdf', async (req, res) => {
  const doc = Documento.porId(req.params.id);
  if (!doc) return res.status(404).json({ erro: 'Documento não encontrado.' });
  const paraDownload = req.query.download === '1' || req.query.download === 'true';
  const docParaPdf = req.query.status ? doc : doc;
  try {
    await responderPdf(res, docParaPdf, paraDownload);
  } catch (erro) {
    console.error('[pdf] erro ao gerar:', erro);
    res.status(500).json({ erro: 'Não foi possível gerar o PDF: ' + erro.message });
  }
});

/** Pré-visualização: gera o PDF a partir dos dados em tela, sem salvar. */
rotas.post('/previa-pdf', async (req, res) => {
  const payload = req.body || {};
  const saneado = Esquema.sanear(payload, Perfil.obter(), payload.tipo);
  try {
    await responderPdf(res, saneado, false);
  } catch (erro) {
    console.error('[pdf] erro na pré-visualização:', erro);
    res.status(500).json({ erro: 'Não foi possível gerar o PDF: ' + erro.message });
  }
});

// --------------------------------------------------------- exportar planilha

rotas.get('/:id/planilha', (req, res) => {
  const doc = Documento.porId(req.params.id);
  if (!doc) return res.status(404).json({ erro: 'Documento não encontrado.' });

  const cabecalho = COLUNAS.map((c) => c.titulo);
  const linhas = (doc.itens || []).map((item) => COLUNAS.map((c) => {
    const valor = item[c.chave];
    return valor === undefined || valor === null ? '' : valor;
  }));

  const aba = XLSX.utils.aoa_to_sheet([cabecalho, ...linhas]);
  aba['!cols'] = COLUNAS.map((c) => ({ wch: c.largura }));
  const livro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro, aba, 'Itens');
  const buffer = XLSX.write(livro, { bookType: 'xlsx', type: 'buffer' });

  const nome = `${doc.tipo === 'orcamento' ? 'Orcamento' : 'Proposta'}_${Pdf.numeroFormatado(doc).replace(/\W+/g, '-')}_itens.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${Formato.nomeArquivoSeguro(nome)}"; filename*=UTF-8''${encodeURIComponent(nome)}`);
  res.end(buffer);
});

// ------------------------------------------------ planilha auxiliar (Excel)

/**
 * A planilha auxiliar: os itens do documento no MESMO formato da
 * planilha-modelo de importação (mesmas colunas e títulos), mais uma aba
 * "Resumo" com identificação, totais e condições. Serve para trabalhar os
 * itens no Excel e para reenviar pelo próprio sistema.
 */
rotas.get('/:id/planilha-auxiliar', (req, res) => {
  const doc = Documento.porId(req.params.id);
  if (!doc) return res.status(404).json({ erro: 'Documento não encontrado.' });

  const empresa = Perfil.obter().empresa || {};
  const buffer = PlanilhaAuxiliar.gerarBuffer(doc, empresa);
  const nome = PlanilhaAuxiliar.nomeArquivo(doc);

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${Formato.nomeArquivoSeguro(nome)}"; filename*=UTF-8''${encodeURIComponent(nome)}`);
  res.end(buffer);
});

module.exports = rotas;
