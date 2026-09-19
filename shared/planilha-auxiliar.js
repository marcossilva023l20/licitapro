/**
 * Planilha AUXILIAR do documento: um .xlsx com os itens da proposta/orçamento
 * preenchidos **no mesmo formato da planilha-modelo de importação** (mesmas
 * colunas e mesmos títulos). Serve para:
 *
 *   • conferir e trabalhar os itens no Excel (custo, margem, valores);
 *   • guardar uma cópia legível junto do PDF;
 *   • reenviar a planilha na tela "Importar planilha" — ela volta igual,
 *     porque as colunas são exatamente as do modelo.
 *
 * São só duas abas: **Itens** (o formato do modelo) e **Resumo** (a
 * identificação do documento, o destinatário, os totais e as condições).
 * Sem aba de instruções/comentários: quem usa o sistema já sabe preencher.
 *
 * Roda no servidor (Buffer) e no navegador (Uint8Array), com as bibliotecas
 * injetadas por quem chama.
 */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) {
    module.exports = fabrica(require('xlsx'), require('./colunas'), require('./importar'), require('./format'));
  } else {
    raiz.PlanilhaAuxiliar = fabrica(raiz.XLSX, raiz.Colunas, raiz.Importador, raiz.Formato);
  }
})(typeof self !== 'undefined' ? self : this, function (XLSX, Colunas, Importador, Formato) {
  'use strict';

  const COLUNAS = Colunas.COLUNAS;

  function numero(valor) {
    const n = Formato.paraNumero(valor);
    return Number.isFinite(n) ? n : 0;
  }

  /** Total dos itens em tela (mesma conta do PDF, sem o desconto/acréscimo). */
  function subtotal(doc) {
    return Formato.arredondar(
      (doc.itens || []).reduce((soma, item) => soma + numero(item.quantidade) * numero(item.precoVenda), 0),
      2
    );
  }

  function calcularTotais(doc) {
    const bruto = subtotal(doc);
    const desconto = doc.desconto || {};
    let valorDesconto = 0;
    if (desconto.modo === 'percentual') {
      valorDesconto = Formato.arredondar((bruto * numero(desconto.valor)) / 100, 2);
    } else if (desconto.modo === 'valor') {
      valorDesconto = Formato.arredondar(numero(desconto.valor), 2);
    }
    const acrescimo = doc.acrescimo && doc.acrescimo.ativo ? Formato.arredondar(numero(doc.acrescimo.valor), 2) : 0;
    const custo = Formato.arredondar(
      (doc.itens || []).reduce((soma, item) => soma + numero(item.quantidade) * numero(item.precoCusto), 0),
      2
    );
    const total = Formato.arredondar(Math.max(0, bruto - valorDesconto) + acrescimo, 2);
    const lucro = Formato.arredondar(total - custo, 2);
    return {
      bruto,
      valorDesconto,
      acrescimo,
      custo,
      total,
      lucro,
      // lucro sobre o total (margem) e sobre o custo (markup)
      percentualLucro: total > 0 ? Formato.arredondar((lucro / total) * 100, 1) : 0,
      percentualSobreCusto: custo > 0 ? Formato.arredondar((lucro / custo) * 100, 1) : 0,
    };
  }

  function dataBR(iso) {
    try {
      const texto = Formato.dataBR(iso);
      return texto || '';
    } catch (_) {
      return '';
    }
  }

  function rotuloTipo(doc) {
    return doc.tipo === 'orcamento' ? 'ORÇAMENTO' : 'PROPOSTA DE FORNECIMENTO';
  }

  /** Aba com os itens: mesmos títulos e larguras do modelo, sem explicações. */
  function abaItens(doc) {
    const linhas = (doc.itens || []).map((item) =>
      COLUNAS.map((coluna) => {
        const valor = item[coluna.chave];
        return valor === undefined || valor === null ? '' : valor;
      })
    );
    const aba = XLSX.utils.aoa_to_sheet([COLUNAS.map((c) => c.titulo), ...linhas]);
    aba['!cols'] = COLUNAS.map((c) => ({ wch: c.largura }));
    return aba;
  }

  /** Aba com a identificação do documento, o destinatário, os totais e as condições. */
  function abaResumo(doc, empresa) {
    const totais = calcularTotais(doc);
    const orcamento = doc.tipo === 'orcamento';
    const nomeDestinatario = orcamento
      ? (doc.cliente && doc.cliente.nome) || ''
      : (doc.orgao && doc.orgao.nome) || '';
    const condicoes = doc.condicoes || {};
    const desconto = doc.desconto || {};
    const linhas = [
      ['PLANILHA AUXILIAR DO DOCUMENTO'],
      [''],
      ['DOCUMENTO'],
      ['Tipo', rotuloTipo(doc)],
      ['Número', doc.numeroFormatado || ''],
      ['Data', dataBR(doc.data)],
      ['Status', doc.status || ''],
      ['Atualizado em', doc.atualizadoEm ? new Date(doc.atualizadoEm).toLocaleString('pt-BR') : ''],
      [''],
      [orcamento ? 'CLIENTE' : 'ÓRGÃO'],
      [orcamento ? 'Cliente / empresa' : 'Órgão / UASG', nomeDestinatario],
    ];
    if (orcamento) {
      linhas.push(
        ['CNPJ / CPF', (doc.cliente && doc.cliente.cnpjCpf) || ''],
        ['Contato', (doc.cliente && doc.cliente.contato) || ''],
        ['Telefone', (doc.cliente && doc.cliente.telefone) || ''],
        ['E-mail', (doc.cliente && doc.cliente.email) || '']
      );
    } else {
      linhas.push(
        ['UASG', (doc.orgao && doc.orgao.uasg) || ''],
        ['Modalidade', (doc.orgao && doc.orgao.modalidade) || ''],
        ['Edital / Pregão', (doc.orgao && doc.orgao.pregao) || ''],
        ['Processo nº', (doc.orgao && doc.orgao.processo) || ''],
        ['Objeto', (doc.orgao && doc.orgao.objeto) || '']
      );
    }
    linhas.push(
      [''],
      ['EMPRESA (proponente)'],
      ['Razão social', (empresa && empresa.razaoSocial) || (doc.proponente && doc.proponente.razaoSocial) || ''],
      ['Nome fantasia', (empresa && empresa.nomeFantasia) || (doc.proponente && doc.proponente.nomeFantasia) || ''],
      ['CNPJ', (empresa && empresa.cnpj) || (doc.proponente && doc.proponente.cnpj) || ''],
      ['Inscrição estadual', (empresa && empresa.inscricaoEstadual) || (doc.proponente && doc.proponente.inscricaoEstadual) || ''],
      ['Inscrição municipal', (empresa && empresa.inscricaoMunicipal) || (doc.proponente && doc.proponente.inscricaoMunicipal) || ''],
      [''],
      ['ITENS E VALORES'],
      ['Quantidade de itens', (doc.itens || []).length],
      ['Subtotal (itens)', totais.bruto],
      ['Desconto' + (desconto.modo === 'percentual' ? ' (' + numero(desconto.valor) + '%)' : ''), totais.valorDesconto],
      ['Acréscimo' + (doc.acrescimo && doc.acrescimo.descricao ? ' (' + doc.acrescimo.descricao + ')' : ''), totais.acrescimo],
      ['TOTAL', totais.total],
      ['Custo dos itens (uso interno)', totais.custo],
      ['Lucro estimado (uso interno)', totais.lucro],
      ['Lucro (% sobre o total)', totais.percentualLucro],
      ['Lucro (% sobre o custo)', totais.percentualSobreCusto],
      [''],
      ['CONDIÇÕES'],
      ['Validade (dias)', numero(condicoes.validadeDias)],
      ['Local', condicoes.local || ''],
      ['Prazo de entrega', condicoes.prazoEntrega || (doc.orgao && doc.orgao.prazoEntrega) || ''],
      ['Garantia', condicoes.garantia || ''],
      ['Condições de pagamento', condicoes.condicoesPagamento || ''],
      ['Observações', condicoes.observacoes || '']
    );
    if (doc.assinatura && doc.assinatura.em) {
      linhas.push(
        [''],
        ['ASSINATURA DIGITAL'],
        ['Assinado por', doc.assinatura.titular || ''],
        ['Documento do certificado', doc.assinatura.documento || ''],
        ['Emissor', doc.assinatura.emissor || ''],
        ['Assinado em', new Date(doc.assinatura.em).toLocaleString('pt-BR')]
      );
    }

    const aba = XLSX.utils.aoa_to_sheet(linhas);
    aba['!cols'] = [{ wch: 30 }, { wch: 70 }];
    return aba;
  }

  /** Livro completo: só o Resumo e os Itens (sem aba de instruções). */
  function montarLivro(doc, empresa) {
    const livro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(livro, abaResumo(doc, empresa), 'Resumo');
    XLSX.utils.book_append_sheet(livro, abaItens(doc), 'Itens');
    return livro;
  }

  /** Buffer (Node) ou Uint8Array (navegador) do arquivo. */
  function gerarBuffer(doc, empresa) {
    return Importador.escreverXlsx(montarLivro(doc, empresa));
  }

  /** Nome do arquivo, no mesmo padrão dos outros (_planilha.xlsx). */
  function nomeArquivo(doc) {
    const tipo = doc.tipo === 'orcamento' ? 'Orcamento' : 'Proposta';
    const numero = String(doc.numeroFormatado || '').replace(/\W+/g, '-');
    return tipo + '_' + numero + '_planilha.xlsx';
  }

  return { montarLivro, gerarBuffer, nomeArquivo, calcularTotais, abaItens, abaResumo };
});
