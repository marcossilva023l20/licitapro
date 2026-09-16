/**
 * Gera a planilha-modelo (.xlsx) usada para importar itens no sistema.
 *
 * O arquivo tem **uma única aba**: "Itens", com os títulos exatamente como o
 * sistema lê — sem aba de instruções, sem legenda e sem comentários: quem usa
 * o sistema já sabe preencher. Funciona no servidor (Buffer) e no navegador
 * (Uint8Array), com a biblioteca XLSX injetada em cada ambiente.
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

  /** Livro do modelo: só a aba "Itens", vazia e pronta para preencher. */
  function montarLivro() {
    const itens = XLSX.utils.aoa_to_sheet([COLUNAS.map((c) => c.titulo)]);
    itens['!cols'] = COLUNAS.map((c) => ({ wch: c.largura }));

    const livro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(livro, itens, 'Itens');
    return livro;
  }

  /** Buffer (Node) ou Uint8Array (navegador) do modelo. */
  function gerarBuffer() {
    return Importador.escreverXlsx(montarLivro());
  }

  return { gerarBuffer, montarLivro };
});
