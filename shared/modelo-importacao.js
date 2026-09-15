/**
 * Gera a planilha-modelo (.xlsx) usada para importar itens no sistema.
 * Funciona no servidor (Buffer) e no navegador (Uint8Array), com a
 * biblioteca XLSX injetada em cada ambiente.
 */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) {
    module.exports = fabrica(require('xlsx'), require('./colunas'), require('./importar'));
  } else {
    raiz.ModeloImportacao = fabrica(raiz.XLSX, raiz.Colunas, raiz.Importador);
  }
})(typeof self !== 'undefined' ? self : this, function (XLSX, Colunas, Importador) {
  'use strict';

  const COLUNAS = Colunas.COLUNAS;

  const EXEMPLOS = [
    {
      numeroItem: 1,
      descricao: 'RÁDIO TRANSCEPTOR PORTÁTIL DIGITAL, 48 CANAIS, BATERIA 1500 mAh',
      unidade: 'UND',
      quantidade: 6,
      valorReferencia: 1600,
      precoCusto: 1150,
      precoVenda: 1490,
      marcaModelo: 'Hytera / BP516',
      foto: 'https://drive.google.com/file/d/1sWRGiyrGNKdZkDRasig6vz18MbS3aO-i/view',
      descricaoCatalogo:
        'O Rádio Hytera BP516 é a escolha ideal para comunicação eficiente e confiável em ambientes variados. ' +
        'Com bateria de 1500 mAh, garante longas horas de operação. Possui 48 canais, alcance de até 5 km e função mãos livres.',
      linkCompra: 'https://www.lojaexemplo.com.br/radio-hytera-bp516',
    },
    {
      numeroItem: 2,
      descricao: 'BATERIA EXTRA PARA RÁDIO TRANSCEPTOR, 1500 mAh',
      unidade: 'UND',
      quantidade: 6,
      valorReferencia: 320,
      precoCusto: 180,
      precoVenda: 249.9,
      marcaModelo: 'Hytera / BL2016',
      foto: '',
      descricaoCatalogo:
        'Bateria de íons de lítio de 1500 mAh, própria para os rádios da linha BP. Alta autonomia e recarga rápida.',
      linkCompra: 'https://www.lojaexemplo.com.br/bateria-bl2016',
    },
  ];

  /** Monta o arquivo .xlsx (aba "Itens" para preencher + aba "Instruções"). */
  function montarLivro() {
    const vazia = XLSX.utils.aoa_to_sheet([COLUNAS.map((c) => c.titulo)]);
    vazia['!cols'] = COLUNAS.map((c) => ({ wch: c.largura }));

    // Comentários explicativos em cada cabeçalho
    COLUNAS.forEach((coluna, indice) => {
      const endereco = XLSX.utils.encode_cell({ r: 0, c: indice });
      if (vazia[endereco]) {
        vazia[endereco].c = [{ t: `${coluna.rotulo}\n\n${coluna.dica}` }];
      }
    });

    const linhasInstrucoes = [
      ['COMO PREENCHER ESTA PLANILHA — LICITAPRO'],
      [''],
      ['1) Preencha somente a aba "Itens", a partir da linha 2 (não altere os títulos da linha 1).'],
      ['2) As colunas "Descricao_Edital" e "Quantidade" são obrigatórias.'],
      ['3) Valores podem ser digitados como número (1490,00) ou texto (R$ 1.490,00).'],
      ['4) Cole o link da foto do produto na coluna "Foto_Produto". Também é possível enviar arquivos pelo site.'],
      ['5) Salve o arquivo em .xlsx e faça o envio na tela "Importar planilha" do site.'],
      [''],
      ['LEGENDA DAS COLUNAS'],
      ['Coluna', 'O que preencher', 'Observação'],
      ...COLUNAS.map((c) => [
        c.titulo,
        c.dica,
        c.chave === 'descricao' || c.chave === 'quantidade' ? 'OBRIGATÓRIO' : 'opcional',
      ]),
      [''],
      ['EXEMPLO DE PREENCHIMENTO'],
      COLUNAS.map((c) => c.rotulo),
      ...EXEMPLOS.map((ex) => COLUNAS.map((c) => (ex[c.chave] === undefined ? '' : ex[c.chave]))),
    ];

    const instrucoes = XLSX.utils.aoa_to_sheet(linhasInstrucoes);
    instrucoes['!cols'] = [{ wch: 22 }, { wch: 70 }, { wch: 14 }];

    const livro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(livro, vazia, 'Itens');
    XLSX.utils.book_append_sheet(livro, instrucoes, 'Instruções');
    return livro;
  }

  /** Buffer (Node) ou Uint8Array (navegador) do modelo. */
  function gerarBuffer() {
    return Importador.escreverXlsx(montarLivro());
  }

  return { gerarBuffer, montarLivro, EXEMPLOS };
});
