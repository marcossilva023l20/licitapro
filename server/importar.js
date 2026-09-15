'use strict';

/**
 * Leitura das planilhas de itens (.xlsx, .xls, .csv).
 * Tolerante a nomes de colunas diferentes, linhas de título acima do cabeçalho
 * e valores digitados como texto ("R$ 1.490,00").
 */

const XLSX = require('xlsx');
const { mapearCabecalhos, normalizarCabecalho, COLUNAS } = require('./colunas');
const Formato = require('../shared/format');

const CAMPOS_NUMERICOS = ['quantidade', 'valorReferencia', 'precoCusto', 'precoVenda'];
const MAX_LINHAS = 3000;

function lerBuffer(buffer) {
  return XLSX.read(buffer, { type: 'buffer', cellDates: false, raw: false, codepage: 65001 });
}

/** Escolhe a aba com mais colunas reconhecidas (ignora a aba de instruções). */
function escolherAba(livro) {
  let melhor = null;
  for (const nome of livro.SheetNames) {
    if (/instru|exemplo|leia|orienta/i.test(nome)) continue;
    const aba = livro.Sheets[nome];
    const matriz = XLSX.utils.sheet_to_json(aba, { header: 1, blankrows: false, defval: '', raw: false });
    const recorte = matriz.slice(0, 10);
    let melhorLinha = -1;
    let melhorMapa = {};
    recorte.forEach((linha, indice) => {
      const mapa = mapearCabecalhos(linha.map((c) => normalizarCabecalho(c)));
      if (Object.keys(mapa).length > Object.keys(melhorMapa).length) {
        melhorMapa = mapa;
        melhorLinha = indice;
      }
    });
    const pontuacao = Object.keys(melhorMapa).length;
    if (pontuacao > 0 && (!melhor || pontuacao > melhor.pontuacao)) {
      melhor = { nome, matriz, linhaCabecalho: melhorLinha, mapa: melhorMapa, pontuacao };
    }
  }
  return melhor;
}

/**
 * Converte o arquivo enviado em itens.
 * @returns {{itens: Array, avisos: string[], aba: string, colunasReconhecidas: string[]}}
 */
function importar(buffer, nomeArquivo) {
  let livro;
  try {
    livro = lerBuffer(buffer);
  } catch (erro) {
    const e = new Error('Não foi possível ler o arquivo. Envie um arquivo .xlsx, .xls ou .csv válido.');
    e.detalhe = erro.message;
    throw e;
  }

  if (!livro.SheetNames || !livro.SheetNames.length) {
    throw new Error('A planilha enviada está vazia.');
  }

  const escolhida = escolherAba(livro);
  if (!escolhida) {
    const esperadas = COLUNAS.map((c) => c.titulo).join(', ');
    throw new Error(
      'Não reconheci as colunas da planilha. A primeira linha deve conter os títulos. ' +
        'Baixe o modelo de importação no site e use as colunas: ' +
        esperadas
    );
  }

  const { matriz, linhaCabecalho, mapa, nome } = escolhida;
  const avisos = [];
  const itens = [];
  const colunasUsadas = new Set(Object.values(mapa));

  if (!colunasUsadas.has('descricao')) {
    throw new Error('A coluna "Descricao_Edital" não foi encontrada na planilha.');
  }

  for (let i = linhaCabecalho + 1; i < matriz.length && itens.length < MAX_LINHAS; i += 1) {
    const linha = matriz[i] || [];
    const registro = {};
    Object.entries(mapa).forEach(([indice, chave]) => {
      registro[chave] = linha[indice];
    });

    const descricao = String(registro.descricao || '').trim();
    if (!descricao) continue; // linha vazia / em branco no meio

    const item = {
      numeroItem: String(registro.numeroItem || '').trim() || String(itens.length + 1),
      descricao,
      unidade: String(registro.unidade || '').trim().toUpperCase() || 'UND',
      quantidade: 0,
      valorReferencia: 0,
      precoCusto: 0,
      precoVenda: 0,
      marcaModelo: String(registro.marcaModelo || '').trim(),
      foto: String(registro.foto || '').trim(),
      descricaoCatalogo: String(registro.descricaoCatalogo || '').trim() || descricao,
      linkCompra: String(registro.linkCompra || '').trim(),
    };

    CAMPOS_NUMERICOS.forEach((campo) => {
      const bruto = registro[campo];
      if (bruto === undefined || bruto === null || String(bruto).trim() === '') {
        item[campo] = campo === 'quantidade' ? 0 : 0;
        return;
      }
      const numero = Formato.paraNumero(bruto);
      if (numero === 0 && !/\b0+\b/.test(String(bruto))) {
        avisos.push(`Linha ${i + 1}: não entendi o valor "${bruto}" em ${campo}. Considerei zero.`);
      }
      item[campo] = numero;
    });

    if (item.quantidade === 0) avisos.push(`Linha ${i + 1}: quantidade vazia ou zero (${descricao.slice(0, 40)}...).`);
    if (item.precoVenda === 0) avisos.push(`Linha ${i + 1}: preço de venda vazio ou zero (${descricao.slice(0, 40)}...).`);

    itens.push(item);
  }

  if (!itens.length) {
    throw new Error('Nenhum item encontrado. Verifique se a planilha tem dados a partir da linha 2.');
  }

  return {
    itens,
    avisos,
    aba: nome,
    arquivo: nomeArquivo || '',
    colunasReconhecidas: Array.from(colunasUsadas),
  };
}

module.exports = { importar, lerBuffer };
