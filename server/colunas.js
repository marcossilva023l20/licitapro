'use strict';

/**
 * Definição das colunas da planilha de importação.
 * É a única fonte de verdade: usada tanto para gerar o modelo para download
 * quanto para ler as planilhas enviadas pelo usuário.
 */

const COLUNAS = [
  {
    chave: 'numeroItem',
    titulo: 'Numero_Item',
    rotulo: 'Nº do Item',
    dica: 'Número do item conforme o edital. Ex.: 1, 2, 3...',
    largura: 10,
    apelidos: ['numero_item', 'numeroitem', 'nº do item', 'no do item', 'item', 'num', 'numero', 'n do item'],
  },
  {
    chave: 'descricao',
    titulo: 'Descricao_Edital',
    rotulo: 'Descrição do Item (conforme edital)',
    dica: 'Descrição exata do item, copiada do edital. Esta é a coluna principal.',
    largura: 58,
    apelidos: ['descricao_edital', 'descricao', 'descricao do item', 'especificacao', 'especificacao do item', 'objeto', 'descricao do objeto'],
  },
  {
    chave: 'unidade',
    titulo: 'Unidade',
    rotulo: 'Unidade',
    dica: 'Unidade de medida: UND, UN, CX, PCT, M, KG, L...',
    largura: 12,
    apelidos: ['unidade', 'un', 'und', 'unid', 'unidade de medida', 'um', 'medida'],
  },
  {
    chave: 'quantidade',
    titulo: 'Quantidade',
    rotulo: 'Quantidade',
    dica: 'Quantidade solicitada pelo edital. Use apenas números. Ex.: 6',
    largura: 12,
    apelidos: ['quantidade', 'qtd', 'qtde', 'quant', 'qde'],
  },
  {
    chave: 'valorReferencia',
    titulo: 'Valor_Referencia',
    rotulo: 'Valor de Referência',
    dica: 'Valor unitário estimado no edital (opcional). Ex.: 1.600,00',
    largura: 16,
    apelidos: ['valor_referencia', 'valor de referencia', 'valor referencia', 'valor estimado', 'preco de referencia', 'valor de referencia unitario'],
  },
  {
    chave: 'precoCusto',
    titulo: 'Preco_Custo',
    rotulo: 'Preço de Custo',
    dica: 'Quanto você paga no fornecedor (opcional, não sai no PDF do cliente).',
    largura: 15,
    apelidos: ['preco_custo', 'custo', 'valor de custo', 'preco de custo', 'valor custo', 'preco custo'],
  },
  {
    chave: 'precoVenda',
    titulo: 'Preco_Venda',
    rotulo: 'Preço de Venda',
    dica: 'Valor unitário que será ofertado na proposta. Ex.: 1.490,00',
    largura: 15,
    apelidos: ['preco_venda', 'preco de venda', 'valor de venda', 'valor venda', 'preco venda', 'valor unitario', 'valor unitario de venda', 'preco unitario'],
  },
  {
    chave: 'marcaModelo',
    titulo: 'Marca_Modelo',
    rotulo: 'Marca / Modelo',
    dica: 'Marca e modelo do produto ofertado. Ex.: Hytera / BP516',
    largura: 22,
    apelidos: ['marca_modelo', 'marca modelo', 'marca', 'modelo', 'marca e modelo', 'marca/modelo'],
  },
  {
    chave: 'foto',
    titulo: 'Foto_Produto',
    rotulo: 'Foto do Produto',
    dica: 'Cole o link da imagem (Drive, site do fabricante) ou envie o arquivo no site.',
    largura: 34,
    apelidos: ['foto_produto', 'foto do produto', 'foto', 'imagem', 'url da foto', 'link da foto', 'imagem do produto'],
  },
  {
    chave: 'descricaoCatalogo',
    titulo: 'Descricao_Catalogo',
    rotulo: 'Descrição do Catálogo',
    dica: 'Texto comercial que aparece no CATÁLOGO da proposta (pode ser igual à descrição).',
    largura: 58,
    apelidos: ['descricao_catalogo', 'descricao catalogo', 'descricao do catalogo', 'catalogo', 'texto do catalogo', 'descricao comercial'],
  },
  {
    chave: 'linkCompra',
    titulo: 'Link_da_compra',
    rotulo: 'Link da Compra',
    dica: 'Link do fornecedor/loja onde você compra o item (controle interno).',
    largura: 34,
    apelidos: ['link_da_compra', 'link da compra', 'link', 'url', 'link de compra', 'link fornecedor'],
  },
];

/** Normaliza texto de cabeçalho para comparação (sem acentos, minúsculo). */
function normalizarCabecalho(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Descobre, para cada coluna da planilha, qual campo do sistema ela representa. */
function mapearCabecalhos(cabecalhos) {
  const mapa = {}; // indiceDaColuna -> chave
  const usados = new Set();

  cabecalhos.forEach((texto, indice) => {
    const normalizado = normalizarCabecalho(texto);
    if (!normalizado) return;
    // 1ª tentativa: nome exato do título
    let encontrada = COLUNAS.find(
      (c) => !usados.has(c.chave) && (normalizarCabecalho(c.titulo) === normalizado || c.apelidos.includes(normalizado))
    );
    // 2ª tentativa: aproximação (contém)
    if (!encontrada) {
      encontrada = COLUNAS.find((c) => {
        if (usados.has(c.chave)) return false;
        const titulo = normalizarCabecalho(c.titulo);
        return normalizado.includes(titulo) || titulo.includes(normalizado);
      });
    }
    if (encontrada) {
      mapa[indice] = encontrada.chave;
      usados.add(encontrada.chave);
    }
  });

  return mapa;
}

module.exports = { COLUNAS, normalizarCabecalho, mapearCabecalhos };
