/**
 * Montagem dos PDFs de PROPOSTA e ORÇAMENTO.
 *
 * Este módulo é compartilhado: roda no servidor (Node + pdfmake) e no navegador
 * (pdfmake do navegador + arquivos locais), recebendo as dependências do ambiente.
 * A estrutura segue o modelo do usuário:
 *   cabeçalho → identificação (órgão/processo/prazo) → dados do proponente →
 *   tabela de preços → total → catálogo com fotos → local/data → assinatura.
 */
(function (raiz, fabrica) {
  // Exporta a fábrica: cada ambiente injeta as suas dependências
  // (servidor: pdfmake do Node e imagens do disco; navegador: pdfmake do navegador).
  if (typeof module === 'object' && module.exports) {
    module.exports = fabrica;
  } else {
    raiz.criarDocumentoPdf = fabrica;
  }
})(typeof self !== 'undefined' ? self : this, function (pdfMake, Formato, Imagens) {
  'use strict';

  const COR_PADRAO = '#0F766E';

function cor(hex, padrao) {
  const texto = String(hex || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(texto) ? texto : padrao || COR_PADRAO;
}

/** Clareia uma cor hexadecimal (0 a 1). */
function clarear(hex, fator) {
  const c = cor(hex).replace('#', '');
  const partes = [0, 2, 4].map((i) => parseInt(c.substr(i, 2), 16));
  const novas = partes.map((v) => Math.round(v + (255 - v) * fator));
  return '#' + novas.map((v) => v.toString(16).padStart(2, '0')).join('');
}

function escuro(hex, fator) {
  const c = cor(hex).replace('#', '');
  const partes = [0, 2, 4].map((i) => parseInt(c.substr(i, 2), 16));
  const novas = partes.map((v) => Math.max(0, Math.round(v * (1 - fator))));
  return '#' + novas.map((v) => v.toString(16).padStart(2, '0')).join('');
}

function totalDosItens(itens) {
  return (itens || []).reduce((soma, item) => soma + Formato.paraNumero(item.quantidade) * Formato.paraNumero(item.precoVenda), 0);
}

function calcularTotais(doc) {
  const bruto = Formato.arredondar(totalDosItens(doc.itens), 2);
  const desconto = doc.desconto || {};
  let valorDesconto = 0;
  if (desconto.modo === 'percentual') {
    valorDesconto = Formato.arredondar((bruto * Formato.paraNumero(desconto.valor)) / 100, 2);
  } else if (desconto.modo === 'valor') {
    valorDesconto = Formato.arredondar(desconto.valor, 2);
  }
  const acrescimo = doc.acrescimo && doc.acrescimo.ativo ? Formato.arredondar(doc.acrescimo.valor, 2) : 0;
  const total = Formato.arredondar(Math.max(0, bruto - valorDesconto) + acrescimo, 2);
  const custo = (doc.itens || []).reduce(
    (soma, item) => soma + Formato.paraNumero(item.quantidade) * Formato.paraNumero(item.precoCusto),
    0
  );
  return {
    bruto,
    desconto: valorDesconto,
    acrescimo,
    total,
    custo: Formato.arredondar(custo, 2),
    lucro: Formato.arredondar(total - custo - acrescimo, 2),
  };
}

function numeroFormatado(doc) {
  const numero = doc.numero || {};
  const base = Formato.numeroDocumento(numero.sequencial || 1, numero.ano || new Date().getFullYear());
  return numero.grupo ? `${numero.grupo}-${base}` : base;
}

function tituloDocumento(doc) {
  return doc.tipo === 'orcamento' ? 'ORÇAMENTO' : 'PROPOSTA DE FORNECIMENTO';
}

// ------------------------------------------------------------------- imagens

/**
 * O pdfmake só aceita data URL de PNG/JPEG (navegador) ou caminho de arquivo
 * (Node). Qualquer outra coisa — link http, blob:, GIF, WebP, HEIC — faz a
 * geração do PDF falhar inteira ("Unknown image format"). Aqui a imagem é
 * conferida antes de entrar no documento: quando não serve, o PDF sai com um
 * traço no lugar da foto em vez de dar erro.
 */
function ehAmbienteNode() {
  return (
    typeof process !== 'undefined' &&
    Boolean(process.versions && process.versions.node) &&
    typeof require === 'function'
  );
}

function imagemAceita(valor) {
  // No servidor a imagem pode vir como Buffer (bytes de uma foto baixada ou de
  // um arquivo enviado): o pdfmake do Node aceita buffer, e é assim que as
  // fotos por link entram no PDF.
  if (valor && typeof valor === 'object') {
    if (typeof Buffer === 'undefined' || !Buffer.isBuffer(valor)) return false;
    if (valor.length < 8) return false;
    const png = valor[0] === 0x89 && valor[1] === 0x50 && valor[2] === 0x4e && valor[3] === 0x47;
    const jpeg = valor[0] === 0xff && valor[1] === 0xd8 && valor[2] === 0xff;
    return png || jpeg;
  }
  const texto = String(valor || '').trim();
  if (!texto) return false;
  if (/^data:image\/(png|jpe?g);/i.test(texto)) return true;
  if (/^data:/i.test(texto)) return false; // gif, webp, heic, pdf...
  if (/^(https?:|blob:|idb:|\/\/)/i.test(texto)) return false; // precisa virar data URL antes
  if (ehAmbienteNode()) {
    try {
      return require('fs').existsSync(texto); // caminho de arquivo local
    } catch (_) {
      return false;
    }
  }
  return false;
}

function origemDaFoto(referencia) {
  const texto = String(referencia || '');
  if (/^https?:/i.test(texto)) return 'link';
  if (/^data:/i.test(texto)) return 'imagem embutida';
  if (/^idb:/i.test(texto)) return 'foto enviada';
  if (/^\/api\/uploads\//i.test(texto)) return 'foto enviada';
  return 'arquivo';
}

/**
 * Guarda quais fotos não entraram no PDF.
 * O relatório é do documento que está sendo gerado (cada chamada tem o seu),
 * para que a tela possa avisar o usuário em vez de deixar a foto sumir calada.
 */
function anotarFotoIgnorada(relatorio, rotulo, referencia, motivo) {
  if (!relatorio || typeof relatorio.push !== 'function') return;
  relatorio.push({
    rotulo: String(rotulo || 'Foto'),
    origem: origemDaFoto(referencia),
    referencia: String(referencia || '').slice(0, 200),
    motivo: String(motivo || 'não foi possível usar esta imagem'),
  });
}

/** Motivo da falha em português — com a dica certa quando a foto veio de um link. */
function motivoDeFalha(referencia) {
  if (/^https?:/i.test(String(referencia || ''))) {
    return 'não consegui baixar a imagem do link (pode não estar pública ou o site bloqueia o acesso)';
  }
  return 'não consegui carregar a imagem';
}

/** Texto curto (cabeçalho HTTP / aviso na tela) com as fotos que ficaram de fora. */
function descreverFotosIgnoradas(relatorio) {
  const lista = Array.isArray(relatorio) ? relatorio : [];
  if (!lista.length) return '';
  const partes = lista.slice(0, 4).map((falha) => `${falha.rotulo} (${falha.origem}): ${falha.motivo}`);
  if (lista.length > 4) partes.push(`e mais ${lista.length - 4} foto(s)`);
  return partes.join(' | ').slice(0, 400);
}

async function carregarImagem(urlOuArquivo, rotulo, relatorio) {
  if (!urlOuArquivo) return null;
  try {
    const preparada = await Imagens.prepararParaPdf(urlOuArquivo);
    if (!preparada || !preparada.imagem) {
      anotarFotoIgnorada(relatorio, rotulo, urlOuArquivo, motivoDeFalha(urlOuArquivo));
      return null;
    }
    if (!imagemAceita(preparada.imagem)) {
      anotarFotoIgnorada(relatorio, rotulo, urlOuArquivo, 'formato não aceito no PDF (use .jpg ou .png)');
      console.warn('[pdf] imagem ignorada (formato não aceito no PDF):', String(urlOuArquivo).slice(0, 120));
      return null;
    }
    return preparada.imagem;
  } catch (erro) {
    anotarFotoIgnorada(relatorio, rotulo, urlOuArquivo, erro.message);
    console.warn('[pdf] imagem ignorada:', erro.message);
    return null;
  }
}

/** Converte a foto do item em nó de imagem do pdfmake. */
async function noFoto(foto, largura, rotulo, relatorio) {
  const imagem = await carregarImagem(foto, rotulo, relatorio);
  if (!imagem) return { text: '—', alignment: 'center', color: '#9AA5B1', fontSize: 8.5 };
  try {
    return { image: imagem, fit: [largura || 105, 85], alignment: 'center' };
  } catch (_) {
    return { text: '—', alignment: 'center', color: '#9AA5B1', fontSize: 8.5 };
  }
}

// --------------------------------------------------------------- componentes

function linhaRotulo(valor) {
  return { text: String(valor === undefined || valor === null ? '' : valor), bold: true };
}

/**
 * Bloco "caixa" com título e linhas rótulo/valor.
 * linhas: [[rotulo, valor, larguraRotulo?], ...]
 */
function caixa(titulo, larguras, linhas, corBase) {
  const corpo = linhas
    .filter(Boolean)
    .map((linha) => {
      if (linha.unica) {
        return [
          { text: linha.unica, colSpan: 2, fontSize: 10.0, alignment: 'justify' },
          {},
        ];
      }
      return [linhaRotulo(linha[0]), { text: linha[1] === '' || linha[1] === undefined ? '—' : String(linha[1]) }];
    });

  return [
    { text: titulo, style: 'tituloSecao', color: corBase },
    {
      table: { widths: larguras || ['auto', '*'], body: corpo },
      layout: {
        hLineWidth: () => 0,
        vLineWidth: () => 0,
        paddingTop: () => 2,
        paddingBottom: () => 2,
        paddingLeft: () => 0,
        paddingRight: () => 6,
      },
      margin: [0, 2, 0, 8],
    },
  ];
}

function layoutTabela(corBase) {
  return {
    hLineWidth: (i) => (i === 0 || i === 1 ? 0.8 : 0.4),
    vLineWidth: () => 0.4,
    hLineColor: (i) => (i <= 1 ? corBase : '#C9D2DA'),
    vLineColor: () => '#C9D2DA',
    paddingTop: () => 4,
    paddingBottom: () => 4,
    paddingLeft: () => 4,
    paddingRight: () => 4,
  };
}

function cabecalhoTabela(corBase, colunas) {
  return colunas.map((c) => ({
    text: c.titulo,
    bold: true,
    color: '#FFFFFF',
    fontSize: 9.5,
    alignment: c.alinhamento || 'left',
    fillColor: corBase,
  }));
}

// ------------------------------------------------------------------ cláusulas

function textoDeclaracao(doc) {
  if (doc.tipo === 'orcamento') {
    return (
      'Este orçamento foi elaborado com base nas informações fornecidas, estando os valores e prazos sujeitos ' +
      'à confirmação de disponibilidade de estoque junto aos fabricantes. A aceitação se dá por meio de ' +
      'aprovação por escrito (e-mail ou assinatura) e emissão do pedido de compra.'
    );
  }
  return (
    'Declaramos que conhecemos e aceitamos integralmente as condições do instrumento convocatório, que os ' +
    'preços acima ofertados são firmes e irreajustáveis, que estão incluídos todos os custos, tributos, frete ' +
    'e despesas necessárias ao cumprimento do objeto e que atenderemos aos prazos e às especificações exigidas ' +
    'no Termo de Referência.'
  );
}

// -------------------------------------------------------------- PDF principal

/**
 * Monta a definição do documento pdfmake.
 * @param {object} doc dados do documento (proposta/orçamento)
 * @param {object} empresa dados cadastrais do usuário (usado quando o documento não traz os dados)
 */
async function montarDefinicao(doc, empresa, contexto) {
  const relatorio = contexto && Array.isArray(contexto.relatorio) ? contexto.relatorio : [];
  const corBase = cor((doc.opcoes && doc.opcoes.cor) || COR_PADRAO);
  const proponente = Object.assign({}, empresa || {}, doc.proponente || {});
  const opcoes = Object.assign(
    {
      mostrarCatalogo: true,
      mostrarFotos: true,
      mostrarDadosBancarios: true,
      mostrarPorExtenso: true,
      mostrarAssinatura: true,
      mostrarDeclaracao: true,
      quebrarPaginaCatalogo: true,
      logoNoCabecalho: true,
      mostrarLinkCompra: false,
    },
    doc.opcoes || {}
  );
  const itens = (doc.itens || []).filter((i) => String(i.descricao || '').trim());
  const totais = calcularTotais(Object.assign({}, doc, { itens }));
  const numero = numeroFormatado(doc);
  const titulo = tituloDocumento(doc);
  const dataDoc = Formato.dataISO(doc.data) || Formato.dataISO(new Date());
  const logo = opcoes.logoNoCabecalho ? await carregarImagem(proponente.logo, 'Logo da empresa', relatorio) : null;

  // ------------------------------------------------------------- cabeçalho
  const nomeEmpresa = proponente.nomeFantasia || proponente.razaoSocial || '';
  const documentoEmpresa = proponente.cnpj ? 'CNPJ: ' + Formato.cnpj(proponente.cnpj) : '';
  const telefoneEmpresa = proponente.telefone ? Formato.telefone(proponente.telefone) : '';

  const colunasCabecalho = [];
  if (logo) {
    colunasCabecalho.push({ width: 74, stack: [{ image: logo, fit: [66, 46], alignment: 'left' }] });
  }
  colunasCabecalho.push({
    width: '*',
    stack: [
      { text: nomeEmpresa || titulo, bold: true, fontSize: 13.4, color: corBase },
      { text: [documentoEmpresa, telefoneEmpresa, proponente.email].filter(Boolean).join('  •  '), fontSize: 9.0, color: '#5B6670' },
    ],
  });
  colunasCabecalho.push({
    width: 'auto',
    stack: [
      { text: titulo, bold: true, fontSize: 11.0, alignment: 'right' },
      { text: 'Nº ' + numero, fontSize: 9.8, alignment: 'right', color: corBase, bold: true },
      { text: Formato.dataBR(dataDoc), fontSize: 9.0, alignment: 'right', color: '#5B6670' },
    ],
  });

  const cabecalho = {
    margin: [42, 22, 42, 0],
    stack: [
      { columns: colunasCabecalho, columnGap: 10 },
      {
        canvas: [{ type: 'line', x1: 0, y1: 0, x2: 511, y2: 0, lineWidth: 1.2, lineColor: corBase }],
        margin: [0, 6, 0, 0],
      },
    ],
  };

  const rodape = (paginaAtual, totalPaginas) => ({
    margin: [42, 6, 42, 0],
    stack: [
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 511, y2: 0, lineWidth: 0.6, lineColor: '#C9D2DA' }] },
      {
        columns: [
          {
            width: '*',
            text: [nomeEmpresa, documentoEmpresa].filter(Boolean).join('  •  '),
            fontSize: 8.3,
            color: '#7A848D',
          },
          {
            width: 'auto',
            text: `${titulo} nº ${numero}  •  Página ${paginaAtual} de ${totalPaginas}`,
            fontSize: 8.3,
            color: '#7A848D',
            alignment: 'right',
          },
        ],
        margin: [0, 3, 0, 0],
      },
    ],
  });

  // -------------------------------------------------------------- conteúdo
  const conteudo = [];

  // 1. Identificação
  const identificacao = [];
  if (doc.tipo === 'orcamento') {
    const cliente = doc.cliente || {};
    identificacao.push(['Cliente', cliente.nome || '—']);
    if (cliente.cnpjCpf) identificacao.push(['CNPJ / CPF', Formato.documento(cliente.cnpjCpf)]);
    if (cliente.contato) identificacao.push(['Contato', cliente.contato]);
    if (cliente.telefone) identificacao.push(['Telefone', Formato.telefone(cliente.telefone)]);
    if (cliente.email) identificacao.push(['E-mail', cliente.email]);
    if (cliente.endereco) identificacao.push(['Endereço', cliente.endereco]);
    if (doc.obra || doc.referencia) identificacao.push(['Referência', doc.obra || doc.referencia]);
  } else {
    const orgao = doc.orgao || {};
    identificacao.push(['Órgão', orgao.nome || '—']);
    if (orgao.uasg) identificacao.push(['UASG', orgao.uasg]);
    if (orgao.processo) identificacao.push(['Processo Nº', orgao.processo]);
    if (orgao.pregao) identificacao.push([orgao.modalidade || 'Edital / Pregão', orgao.pregao]);
    if (orgao.objeto) identificacao.push(['Objeto', orgao.objeto]);
    identificacao.push([
      'Prazo de Entrega',
      (doc.condicoes && doc.condicoes.prazoEntrega) || orgao.prazoEntrega || 'Conforme Edital.',
    ]);
  }
  identificacao.push(['Data de Emissão', Formato.dataBR(dataDoc)]);

  conteudo.push({
    table: {
      widths: ['*'],
      body: [
        [
          {
            stack: [
              { text: titulo + ' Nº ' + numero, style: 'tituloPrincipal', color: corBase },
              {
                text:
                  doc.tipo === 'orcamento'
                    ? 'Proposta comercial de fornecimento de materiais e/ou serviços'
                    : 'Resposta ao instrumento convocatório — ' + (doc.orgao && doc.orgao.processo ? 'Processo nº ' + doc.orgao.processo : 'conforme edital'),
                fontSize: 9.8,
                color: '#5B6670',
                margin: [0, 2, 0, 0],
              },
            ],
            fillColor: clarear(corBase, 0.9),
            border: [false, false, false, false],
            margin: [10, 8, 10, 8],
          },
        ],
      ],
    },
    margin: [0, 0, 0, 10],
  });

  conteudo.push(
    ...caixa(doc.tipo === 'orcamento' ? 'IDENTIFICAÇÃO' : 'DADOS DO ÓRGÃO', [118, '*'], identificacao, corBase)
  );

  // 2. Dados do proponente
  const dadosProponente = [];
  dadosProponente.push(['Proponente', proponente.razaoSocial || nomeEmpresa || '—']);
  if (proponente.nomeFantasia) dadosProponente.push(['Nome Fantasia', proponente.nomeFantasia]);
  dadosProponente.push(['CNPJ', proponente.cnpj ? Formato.cnpj(proponente.cnpj) : '—']);
  if (proponente.inscricaoEstadual) {
    dadosProponente.push([
      'Inscrição Estadual',
      Formato.somenteDigitos(proponente.inscricaoEstadual) +
        (proponente.simplesNacional ? '  —  Enquadrada no SIMPLES NACIONAL' : ''),
    ]);
  }
  if (proponente.telefone) dadosProponente.push(['Telefone', Formato.telefone(proponente.telefone)]);
  if (proponente.email) dadosProponente.push(['E-mail', proponente.email]);
  const enderecoCompleto = montarEndereco(proponente);
  if (enderecoCompleto) dadosProponente.push(['Endereço', enderecoCompleto]);
  if (opcoes.mostrarDadosBancarios && (proponente.banco || proponente.agencia || proponente.conta || proponente.chavePix)) {
    if (proponente.banco) dadosProponente.push(['Dados Bancários', proponente.banco]);
    if (proponente.agencia) dadosProponente.push(['Agência', proponente.agencia]);
    if (proponente.conta) dadosProponente.push(['Conta Corrente', proponente.conta]);
    if (proponente.chavePix) dadosProponente.push(['Chave PIX', proponente.chavePix]);
  }
  conteudo.push(...caixa('DADOS DO PROPONENTE', [150, '*'], dadosProponente, corBase));

  // 3. Tabela de preços
  conteudo.push({ text: 'TABELA DE PREÇOS', style: 'tituloSecao', color: corBase });

  const colunasPrecos = [
    { titulo: 'Item', largura: 26, alinhamento: 'center' },
    { titulo: 'Especificação', largura: '*' },
    { titulo: 'Marca / Modelo', largura: 74, alinhamento: 'center' },
    { titulo: 'UND', largura: 28, alinhamento: 'center' },
    { titulo: 'QTD', largura: 34, alinhamento: 'center' },
    { titulo: 'Valor Unitário', largura: 62, alinhamento: 'right' },
    { titulo: 'Valor Total', largura: 68, alinhamento: 'right' },
  ];

  const corpoPrecos = [cabecalhoTabela(corBase, colunasPrecos)];
  itens.forEach((item, indice) => {
    const quantidade = Formato.paraNumero(item.quantidade);
    const unitario = Formato.paraNumero(item.precoVenda);
    corpoPrecos.push([
      { text: String(item.numeroItem || indice + 1), alignment: 'center' },
      { text: String(item.descricao || '').trim(), alignment: 'justify' },
      { text: item.marcaModelo || '—', alignment: 'center', fontSize: 9.0 },
      { text: item.unidade || 'UND', alignment: 'center' },
      { text: Formato.quantidade(quantidade), alignment: 'center' },
      { text: Formato.moeda(unitario), alignment: 'right', noWrap: true },
      { text: Formato.moeda(quantidade * unitario), alignment: 'right', noWrap: true },
    ]);
  });

  const rotuloTotal = doc.tipo === 'orcamento' ? 'TOTAL DO ORÇAMENTO' : 'TOTAL LICITAÇÃO';
  const largurasPrecos = colunasPrecos.map((c) => c.largura);

  if (totais.desconto > 0) {
    corpoPrecos.push([
      { text: 'Desconto', colSpan: 6, alignment: 'right', bold: true, fillColor: '#F1F5F7' },
      {}, {}, {}, {}, {},
      { text: '- ' + Formato.moeda(totais.desconto), alignment: 'right', bold: true, fillColor: '#F1F5F7', noWrap: true },
    ]);
  }
  if (totais.acrescimo > 0) {
    corpoPrecos.push([
      { text: (doc.acrescimo && doc.acrescimo.descricao) || 'Acréscimo', colSpan: 6, alignment: 'right', bold: true, fillColor: '#F1F5F7' },
      {}, {}, {}, {}, {},
      { text: Formato.moeda(totais.acrescimo), alignment: 'right', bold: true, fillColor: '#F1F5F7', noWrap: true },
    ]);
  }
  corpoPrecos.push([
    { text: rotuloTotal, colSpan: 6, alignment: 'right', bold: true, color: '#FFFFFF', fillColor: corBase, fontSize: 11.0 },
    {}, {}, {}, {}, {},
    { text: Formato.moeda(totais.total), alignment: 'right', bold: true, color: '#FFFFFF', fillColor: corBase, fontSize: 11.0, noWrap: true },
  ]);

  conteudo.push({
    table: { headerRows: 1, widths: largurasPrecos, body: corpoPrecos, dontBreakRows: true },
    layout: layoutTabela(corBase),
  });

  if (opcoes.mostrarPorExtenso && totais.total > 0) {
    conteudo.push({
      text: [
        { text: 'Valor total em letras: ', bold: true },
        Formato.moedaPorExtenso(totais.total) + '.',
      ],
      fontSize: 9.8,
      margin: [0, 6, 0, 0],
    });
  }

  // 4. Condições
  const condicoes = doc.condicoes || {};
  const linhasCondicoes = [];
  if (condicoes.validadeDias) linhasCondicoes.push(['Validade da Proposta', `${Formato.paraNumero(condicoes.validadeDias)} dias`]);
  if (condicoes.condicoesPagamento) linhasCondicoes.push(['Condições de Pagamento', condicoes.condicoesPagamento]);
  linhasCondicoes.push([
    'Prazo de Entrega',
    condicoes.prazoEntrega || (doc.orgao && doc.orgao.prazoEntrega) || 'Conforme Edital.',
  ]);
  if (condicoes.garantia) linhasCondicoes.push(['Garantia', condicoes.garantia]);
  if (condicoes.observacoes) linhasCondicoes.push({ unica: condicoes.observacoes });

  if (linhasCondicoes.length) {
    conteudo.push({
      unbreakable: true,
      stack: [
        { text: 'CONDIÇÕES', style: 'tituloSecao', color: corBase, margin: [0, 12, 0, 0] },
        ...caixa('', [172, '*'], linhasCondicoes, corBase),
      ],
    });
  }

  if (opcoes.mostrarDeclaracao) {
    conteudo.push({
      text: textoDeclaracao(doc),
      fontSize: 9.5,
      alignment: 'justify',
      color: '#3C4650',
      margin: [0, 4, 0, 0],
    });
  }

  // 5. Catálogo
  if (opcoes.mostrarCatalogo && itens.length) {
    if (opcoes.quebrarPaginaCatalogo) conteudo.push({ text: '', pageBreak: 'before' });
    conteudo.push({ text: 'CATÁLOGO', style: 'tituloSecao', color: corBase, margin: [0, 14, 0, 6] });
    conteudo.push({
      text: 'Especificações e imagens dos produtos ofertados.',
      fontSize: 9.3,
      color: '#5B6670',
      margin: [0, 0, 0, 6],
    });

    const corpoCatalogo = [
      cabecalhoTabela(corBase, [
        { titulo: 'Item', alinhamento: 'center' },
        { titulo: 'Descrição' },
        ...(opcoes.mostrarFotos ? [{ titulo: 'Foto do Produto', alinhamento: 'center' }] : []),
      ]),
    ];

    for (let i = 0; i < itens.length; i += 1) {
      const item = itens[i];
      const texto = String(item.descricaoCatalogo || item.descricao || '').trim();
      const linha = [
        { text: String(item.numeroItem || i + 1), alignment: 'center', bold: true },
        {
          stack: [
            item.marcaModelo ? { text: item.marcaModelo, bold: true, fontSize: 9.8, margin: [0, 0, 0, 2] } : null,
            { text: texto, alignment: 'justify', fontSize: 9.8 },
            opcoes.mostrarLinkCompra && item.linkCompra
              ? { text: 'Referência: ' + item.linkCompra, fontSize: 8.1, color: '#7A848D', margin: [0, 3, 0, 0] }
              : null,
          ].filter(Boolean),
        },
      ];
      if (opcoes.mostrarFotos) linha.push(await noFoto(item.foto, 105, `Item ${item.numeroItem || i + 1}`, relatorio));
      corpoCatalogo.push(linha);
    }

    conteudo.push({
      table: {
        headerRows: 1,
        widths: opcoes.mostrarFotos ? [28, '*', 115] : [28, '*'],
        body: corpoCatalogo,
        dontBreakRows: true,
      },
      layout: layoutTabela(corBase),
    });
  }

  // 6. Local, data e assinatura
  const localInformado = (condicoes.local || proponente.cidade || '').trim();
  const uf = (proponente.uf || '').trim().toUpperCase();
  let local = localInformado;
  if (localInformado && uf) {
    const jaTemUf = new RegExp(`[-/\\s]${uf}$`, 'i').test(localInformado);
    if (!jaTemUf) local = `${localInformado} - ${uf}`;
  }

  const blocoFinal = [
    {
      text: `${local ? local + ', ' : ''}${Formato.dataLonga(dataDoc)}`,
      alignment: 'right',
      fontSize: 11.0,
      margin: [0, 22, 0, 0],
    },
  ];

  if (opcoes.mostrarAssinatura) {
    const assinatura = await carregarImagem(proponente.assinatura, 'Assinatura', relatorio);
    blocoFinal.push({
      columns: [
        { width: '*', text: '' },
        {
          width: 260,
          stack: [
            assinatura
              ? { image: assinatura, fit: [190, 55], alignment: 'center', margin: [0, 16, 0, 0] }
              : { text: '', margin: [0, 60, 0, 0] },
            {
              canvas: [{ type: 'line', x1: 0, y1: 0, x2: 260, y2: 0, lineWidth: 0.7, lineColor: '#5B6670' }],
              margin: [0, 2, 0, 4],
            },
            { text: proponente.representante || proponente.razaoSocial || '', alignment: 'center', bold: true, fontSize: 10.5 },
            proponente.cpfRepresentante
              ? { text: 'CPF: ' + Formato.cpf(proponente.cpfRepresentante), alignment: 'center', fontSize: 9.5 }
              : null,
            {
              text: '(' + (proponente.cargoRepresentante || 'REPRESENTANTE LEGAL DA EMPRESA').replace(/^\(|\)$/g, '') + ')',
              alignment: 'center', fontSize: 9.0, color: '#5B6670',
            },
          ].filter(Boolean),
        },
        { width: '*', text: '' },
      ],
      margin: [0, 4, 0, 0],
    });
  }

  conteudo.push(...blocoFinal);

  return {
    pageSize: 'A4',
    pageMargins: [42, 88, 42, 52],
    header: () => cabecalho,
    footer: (paginaAtual, totalPaginas) => rodape(paginaAtual, totalPaginas),
    defaultStyle: { font: 'Times New Roman', fontSize: 12.4, color: '#26303A', lineHeight: 1.2 },
    styles: {
      tituloPrincipal: { fontSize: 16.5, bold: true, characterSpacing: 0.3 },
      tituloSecao: { fontSize: 11.0, bold: true, characterSpacing: 0.6, margin: [0, 4, 0, 2] },
    },
    content: conteudo,
    info: {
      title: `${titulo} ${numero} - ${nomeEmpresa || ''}`.trim(),
      author: nomeEmpresa || 'LicitaPro',
      subject: doc.tipo === 'orcamento' ? 'Orçamento' : 'Proposta de fornecimento',
      creator: 'LicitaPro — gerador de propostas e orçamentos',
    },
  };
}

function montarEndereco(proponente) {
  const partes = [];
  const endereco = String(proponente.endereco || '').trim();
  const cidade = String(proponente.cidade || '').trim();
  const uf = String(proponente.uf || '').trim().toUpperCase();
  if (endereco) partes.push(endereco);

  const normalizar = (t) =>
    String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  const cidadeJaNoEndereco = cidade && normalizar(endereco).includes(normalizar(cidade));
  const ufJaNoEndereco = uf && new RegExp(`(\\b|[-/,\\s])${uf}(\\b|$)`, 'i').test(endereco);

  if (cidade && !cidadeJaNoEndereco) {
    partes.push([cidade, uf].filter(Boolean).join(' - '));
  } else if (cidade && uf && !ufJaNoEndereco && normalizar(endereco).includes(normalizar(cidade))) {
    partes.push(uf);
  }
  if (proponente.cep) partes.push('CEP: ' + Formato.cep(proponente.cep));
  return partes.join(', ');
}

/** Gera o PDF e devolve um Buffer. */
async function gerarPdf(doc, empresa, contexto) {
  const definicao = await montarDefinicao(doc, empresa, contexto);
  const pdf = pdfMake.createPdf(definicao);
  return pdf.getBuffer();
}

/** Nome sugerido do arquivo, ex.: Proposta_001-2026_Marinha.pdf */
function nomeArquivo(doc, proponente) {
  const numero = numeroFormatado(doc).replace(/[^\w-]/g, '-');
  const titulo = doc.tipo === 'orcamento' ? 'Orcamento' : 'Proposta';
  const destinatario = doc.tipo === 'orcamento'
    ? (doc.cliente && doc.cliente.nome) || 'cliente'
    : (doc.orgao && doc.orgao.nome) || 'orgao';
  return `${titulo}_${numero}_${Formato.slug(destinatario).slice(0, 40) || 'documento'}.pdf`;
}

  return {
    gerarPdf,
    montarDefinicao,
    descreverFotosIgnoradas,
    calcularTotais,
    nomeArquivo,
    numeroFormatado,
    tituloDocumento,
    COR_PADRAO,
  };
});
