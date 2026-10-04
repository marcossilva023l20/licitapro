/**
 * Leitura das planilhas de itens (.xlsx, .xls, .csv, .ods).
 * Tolerante a nomes de colunas diferentes, linhas de título acima do cabeçalho
 * e valores digitados como texto ("R$ 1.490,00").
 *
 * Roda no servidor (com o Buffer do Node) e no navegador (com ArrayBuffer),
 * usando a mesma biblioteca XLSX injetada em cada ambiente.
 */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) {
    module.exports = fabrica(
      require('xlsx'),
      require('./format'),
      require('./colunas')
    );
  } else {
    raiz.Importador = fabrica(raiz.XLSX, raiz.Formato, raiz.Colunas);
  }
})(typeof self !== 'undefined' ? self : this, function (XLSX, Formato, Colunas) {
  'use strict';

  const CAMPOS_NUMERICOS = ['quantidade', 'precoCusto', 'precoVenda'];
  // Nomes antigos da coluna de preço. O modelo de hoje tem só Valor_Referencia;
  // planilhas feitas no modelo anterior (com Preco_Venda) continuam entrando.
  const ALIASES_PRECO_ANTIGO = [
    'preco_venda', 'preco de venda', 'preco venda', 'valor de venda', 'valor venda',
    'valor unitario', 'valor unitario de venda', 'preco unitario',
  ];
  // Mesmo teto do documento (shared/documento-schema.js): a planilha pode ter
  // mais linhas, mas o que não couber é avisado na tela — nada some calado.
  const MAX_LINHAS = 2000;

  const MAX_FOTOS = (Colunas && Colunas.MAX_FOTOS) || 4;

  const temBuffer = () => typeof Buffer !== 'undefined' && typeof Buffer.isBuffer === 'function';

  /** Descobre o tipo de entrada que a XLSX espera em cada ambiente. */
  function opcoesLeitura(dados) {
    if (temBuffer() && Buffer.isBuffer(dados)) return { type: 'buffer' };
    if (dados instanceof ArrayBuffer) return { type: 'array' };
    if (ArrayBuffer.isView(dados)) return { type: 'array' };
    if (typeof dados === 'string') return { type: 'binary' };
    return { type: 'array' };
  }

  function lerBuffer(dados) {
    return XLSX.read(dados, Object.assign({ cellDates: false, raw: false, codepage: 65001 }, opcoesLeitura(dados)));
  }

  /** Escolhe a aba com mais colunas reconhecidas (ignora capa/resumo/instruções antigas). */
  function escolherAba(livro) {
    let melhor = null;
    for (const nome of livro.SheetNames) {
      if (/instru|exemplo|leia|orienta|resumo|capa/i.test(nome)) continue;
      const aba = livro.Sheets[nome];
      const matriz = XLSX.utils.sheet_to_json(aba, { header: 1, blankrows: false, defval: '', raw: false });
      const recorte = matriz.slice(0, 10);
      let melhorLinha = -1;
      let melhorMapa = {};
      recorte.forEach((linha, indice) => {
        const mapa = Colunas.mapearCabecalhos(linha.map((c) => Colunas.normalizarCabecalho(c)));
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
  /**
   * Limpa um link digitado na planilha: corrige entidades (&amp;), tira aspas e,
   * quando a célula tem mais de um link, devolve o primeiro.
   * @returns {{valor: string, extras: number}}
   */
  function textoLimpo(bruto) {
    return String(bruto == null ? '' : bruto)
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&#3[49];/g, "'")
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .trim()
      .replace(/^["'<>]+|["'>]+$/g, '')
      .trim();

    return texto;
  }

  /**
   * Todos os links de imagem de uma célula: o catálogo aceita várias fotos por
   * item, separadas por espaço, vírgula, ponto-e-vírgula ou linha nova.
   */
  function linksDaCelula(bruto) {
    const partes = textoLimpo(bruto).split(/[\s,;]+/).filter(Boolean);
    return partes.filter((parte) => /^(https?:\/\/|data:image\/)/i.test(parte));
  }

  /** Primeiro link da célula e quantos vieram a mais (usado no Link_da_compra). */
  function limparLink(bruto) {
    const texto = textoLimpo(bruto);
    const urls = linksDaCelula(bruto);
    if (urls.length > 1) return { valor: urls[0], extras: urls.length - 1 };
    return { valor: texto, extras: 0 };
  }

  function importar(dados, nomeArquivo) {
    let livro;
    try {
      livro = lerBuffer(dados);
    } catch (erro) {
      const e = new Error('Não foi possível ler o arquivo. Envie um arquivo .xlsx, .xls, .csv ou .ods válido.');
      e.detalhe = erro.message;
      throw e;
    }

    if (!livro.SheetNames || !livro.SheetNames.length) {
      throw new Error('A planilha enviada está vazia.');
    }

    const escolhida = escolherAba(livro);
    if (!escolhida) {
      const esperadas = Colunas.COLUNAS.map((c) => c.titulo).join(', ');
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

    // Se a planilha tem as duas colunas de preço (modelo antigo), a que sobrou
    // serve de reserva: entra quando o Valor_Referencia vem vazio.
    const mapeados = new Set(Object.keys(mapa).map(Number));
    const indicePrecoAntigo = (matriz[linhaCabecalho] || []).findIndex(
      (texto, indice) => !mapeados.has(indice) && ALIASES_PRECO_ANTIGO.includes(Colunas.normalizarCabecalho(texto))
    );
    let precoCompletado = 0;   // Valor_Referencia vazio: o valor veio do Preco_Venda
    let precoSubstituido = 0;  // os dois preenchidos e diferentes: valeu o Preco_Venda

    if (!colunasUsadas.has('descricao')) {
      throw new Error('A coluna "Descricao_Edital" não foi encontrada na planilha.');
    }

    let linhasComDescricao = 0;
    for (let i = linhaCabecalho + 1; i < matriz.length; i += 1) {
      const linha = matriz[i] || [];
      const registro = {};
      Object.entries(mapa).forEach(([indice, chave]) => {
        registro[chave] = linha[indice];
      });

      const descricao = String(registro.descricao || '').trim();
      if (!descricao) continue; // linha vazia / em branco no meio
      linhasComDescricao += 1;
      // da linha que passa do teto em diante só contamos, para avisar depois
      if (itens.length >= MAX_LINHAS) continue;

      const item = {
        numeroItem: String(registro.numeroItem || '').trim() || String(itens.length + 1),
        descricao,
        unidade: String(registro.unidade || '').trim().toUpperCase() || 'UND',
        quantidade: 0,
        precoCusto: 0,
        precoVenda: 0,
        marcaModelo: String(registro.marcaModelo || '').trim(),
        fotos: [],
        foto: '',
        descricaoCatalogo: String(registro.descricaoCatalogo || '').trim() || descricao,
        linkCompra: '',
        observacao: '',
      };

      // várias fotos na mesma célula: todas entram no catálogo (até MAX_FOTOS)
      const fotos = linksDaCelula(registro.foto);
      const textoFoto = textoLimpo(registro.foto);
      item.fotos = (fotos.length ? fotos : (textoFoto ? [textoFoto] : [])).slice(0, MAX_FOTOS);
      item.foto = item.fotos[0] || '';
      if (fotos.length > MAX_FOTOS) {
        avisos.push(`Linha ${i + 1}: a célula Foto_Produto tem ${fotos.length} imagens e o catálogo guarda até ${MAX_FOTOS} por item: entraram as ${MAX_FOTOS} primeiras.`);
      }

      const compra = limparLink(registro.linkCompra);
      item.linkCompra = compra.valor;
      if (compra.extras) {
        avisos.push(`Linha ${i + 1}: a célula Link_da_compra tem ${compra.extras + 1} links; usei o primeiro.`);
      }

      CAMPOS_NUMERICOS.forEach((campo) => {
        const bruto = registro[campo];
        if (bruto === undefined || bruto === null || String(bruto).trim() === '') {
          item[campo] = 0;
          return;
        }
        const numero = Formato.paraNumero(bruto);
        if (numero === 0 && !/\b0+\b/.test(String(bruto))) {
          avisos.push(`Linha ${i + 1}: não entendi o valor "${bruto}" em ${campo}. Considerei zero.`);
        }
        item[campo] = numero;
      });

      // Planilha antiga com as duas colunas de preço: o Preco_Venda é o valor que
      // já saía no PDF, então é ele que vira o "Valor de referência" do item.
      if (indicePrecoAntigo >= 0) {
        const antigo = Formato.paraNumero(linha[indicePrecoAntigo]);
        if (antigo > 0 && antigo !== item.precoVenda) {
          if (item.precoVenda > 0) precoSubstituido += 1;
          else precoCompletado += 1;
          item.precoVenda = antigo;
        }
      }

      if (item.quantidade === 0) avisos.push(`Linha ${i + 1}: quantidade vazia ou zero (${descricao.slice(0, 40)}...).`);
      if (item.precoVenda === 0) avisos.push(`Linha ${i + 1}: valor de referência vazio ou zero (${descricao.slice(0, 40)}...).`);

      itens.push(item);
    }

    if (!itens.length) {
      throw new Error('Nenhum item encontrado. Verifique se a planilha tem dados a partir da linha 2.');
    }

    if (precoSubstituido) {
      avisos.unshift(
        `A planilha tem as colunas Valor_Referencia e Preco_Venda, mas hoje o preço é um campo só ` +
          `(Valor de referência). Em ${precoSubstituido} linha(s) os dois valores eram diferentes: ` +
          `usei o Preco_Venda, que é o valor que já saía no PDF.`
      );
    }
    if (precoCompletado) {
      avisos.unshift(
        `A planilha está no modelo antigo: em ${precoCompletado} linha(s) a coluna Valor_Referencia estava vazia ` +
          `e o valor veio da coluna Preco_Venda.`
      );
    }

    if (linhasComDescricao > MAX_LINHAS) {
      avisos.unshift(
        `A planilha tem ${linhasComDescricao} itens e o sistema guarda até ${MAX_LINHAS} por documento: ` +
          `entraram os primeiros ${MAX_LINHAS}. ` +
          `Para levar os ${linhasComDescricao - MAX_LINHAS} restantes, crie uma segunda proposta com eles.`
      );
    }

    return {
      itens,
      avisos,
      aba: nome,
      arquivo: nomeArquivo || '',
      colunasReconhecidas: Array.from(colunasUsadas),
    };
  }

  /** Converte a lista de itens numa planilha (mesmas colunas do modelo). */
  function itensParaPlanilha(itens) {
    const cabecalho = Colunas.COLUNAS.map((c) => c.titulo);
    const linhas = (itens || []).map((item) => Colunas.COLUNAS.map((c) => Colunas.celulaDoItem(item, c)));
    const aba = XLSX.utils.aoa_to_sheet([cabecalho, ...linhas]);
    aba['!cols'] = Colunas.COLUNAS.map((c) => ({ wch: c.largura }));
    const livro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(livro, aba, 'Itens');
    return livro;
  }

  /** Gera o arquivo .xlsx como Buffer (Node) ou Uint8Array (navegador). */
  function escreverXlsx(livro) {
    return XLSX.write(livro, { bookType: 'xlsx', type: temBuffer() ? 'buffer' : 'array', compression: true });
  }

  return { importar, lerBuffer, itensParaPlanilha, escreverXlsx, limparLink, linksDaCelula, textoLimpo, MAX_FOTOS };
});
