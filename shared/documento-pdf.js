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
})(typeof self !== 'undefined' ? self : this, function (pdfMake, Formato, Imagens, Declaracoes) {
  'use strict';

  // Paleta da marca (logo DEJ Solutions & Global): azul, dourado e prata.
  // Paleta da marca (DEJ Solutions & Global): azul-marinho #0B1F33, dourado
  // #C6A15B, dourado claro #D8B873, branco #FFFFFF e cinza claro #E8ECEF.
  const COR_PADRAO = '#0B1F33'; // azul-marinho principal — estrutura do documento
  const COR_DOURADA = '#8A6A31'; // dourado da marca em tom de texto (contraste no branco)
  const COR_FILETE = '#C6A15B'; // dourado da marca — filetes e detalhes
  const COR_CINZA = '#E8ECEF'; // cinza claro da marca — fundos de linha e faixas
  const COR_DOURADA_CLARA = '#D8B873'; // dourado claro da marca — leitura sobre o azul
  const COR_APOIO_ESCURO = '#C3D2E2'; // texto de apoio sobre a faixa azul-marinho

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

/** Luminância relativa (0 = preto, 1 = branco) — decide o texto sobre a faixa. */
function luminancia(hex) {
  const limpo = String(hex || '').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(limpo)) return 0;
  const canais = [0, 2, 4].map((i) => {
    const v = parseInt(limpo.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * canais[0] + 0.7152 * canais[1] + 0.0722 * canais[2];
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

/**
 * Qual imagem representa a empresa no documento: a logo cadastrada em "Minha
 * empresa" e, quando não houver, a logo padrão do sistema
 * (public/marca/logo.png — opcional). A mesma imagem vira cabeçalho e marca
 * d'água, para o documento combinar com a identidade visual do site.
 */
function referenciaLogo(proponente) {
  const logo = String((proponente && proponente.logo) || '').trim();
  if (logo) return { referencia: logo, padrao: false };
  let padrao = '';
  try {
    padrao = (Imagens && typeof Imagens.logoPadrao === 'function' && Imagens.logoPadrao()) || '';
  } catch (_) {
    padrao = '';
  }
  return { referencia: padrao, padrao: true };
}

async function carregarImagem(urlOuArquivo, rotulo, relatorio, silencioso) {
  if (!urlOuArquivo) return null;
  const avisar = (motivo) => {
    if (silencioso) return; // logo padrão do sistema: ausência não é problema do usuário
    anotarFotoIgnorada(relatorio, rotulo, urlOuArquivo, motivo);
  };
  try {
    const preparada = await Imagens.prepararParaPdf(urlOuArquivo);
    if (!preparada || !preparada.imagem) {
      avisar(motivoDeFalha(urlOuArquivo));
      return null;
    }
    if (!imagemAceita(preparada.imagem)) {
      avisar('formato não aceito no PDF (use .jpg ou .png)');
      console.warn('[pdf] imagem ignorada (formato não aceito no PDF):', String(urlOuArquivo).slice(0, 120));
      return null;
    }
    return preparada.imagem;
  } catch (erro) {
    avisar(erro.message);
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
function caixa(titulo, larguras, linhas, corTitulo) { // 4º parâmetro: cor do título da seção
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
    { text: titulo, style: 'tituloSecao', color: corTitulo },
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
  // sobre uma cor clara escolhida pelo usuário, o texto da faixa fica escuro
  const tinta = luminancia(corBase) > 0.55 ? '#1C2B3A' : '#FFFFFF';
  return colunas.map((c) => ({
    text: c.titulo,
    bold: true,
    color: tinta,
    fontSize: 9.5,
    alignment: c.alinhamento || 'left',
    fillColor: corBase,
  }));
}

// ------------------------------------------------------------------ cláusulas

/**
 * Timbre do papel: a faixa azul-marinho com a logo da empresa em um selo branco
 * — a mesma identidade do site. Vale para o documento inteiro e para as folhas
 * de declaração, que saem no mesmo padrão da proposta.
 *
 * @param {object} proponente dados da empresa (razão social, CNPJ, endereço...)
 * @param {string} corBase cor da faixa (a escolhida no documento ou a da marca)
 * @param {string} corFilete cor do filete dourado abaixo da faixa
 * @param {object|null} logo imagem da logo já carregada (ou null)
 */
function montarTimbre(proponente, corBase, corFilete, logo) {
  const nomeEmpresa = proponente.razaoSocial || proponente.nomeFantasia || '';
  const fantasiaEmpresa = proponente.nomeFantasia && proponente.nomeFantasia !== nomeEmpresa
    ? proponente.nomeFantasia
    : '';
  const documentoEmpresa = proponente.cnpj ? 'CNPJ ' + Formato.cnpj(proponente.cnpj) : '';

  // Linhas da empresa no cabeçalho, no formato de papel timbrado:
  //   DEJ SOLUTIONS COMÉRCIO E SERVIÇOS LTDA
  //   CNPJ 12.345.678/0001-90 • IE 987.654.32-10
  //   Av. Sete de Setembro, 4500 — Batel — Curitiba/PR — 80000-000
  //   (41) 99999-4040 • comercial@dejsolutions.com.br
  const registroEmpresa = [
    documentoEmpresa,
    proponente.inscricaoEstadual ? 'IE ' + proponente.inscricaoEstadual : '',
  ].filter(Boolean).join('  •  ');

  const localEmpresa = [proponente.cidade, proponente.uf].filter(Boolean).join('/');
  const enderecoEmpresa = [
    proponente.endereco,
    localEmpresa,
    proponente.cep ? Formato.cep(proponente.cep) : '',
  ].filter(Boolean).join(' — ');

  const contatoEmpresa = [
    proponente.telefone ? Formato.telefone(proponente.telefone) : '',
    proponente.email,
  ].filter(Boolean).join('  •  ');

  // Quando o usuário escolhe uma cor muito clara, a faixa recebe texto escuro
  // para continuar legível (o dourado da marca só vale sobre fundo escuro).
  const faixaClara = luminancia(corBase) > 0.55;
  const tintaFaixa = faixaClara ? '#1C2B3A' : '#FFFFFF';
  const apoioFaixa = faixaClara ? '#4A5A6B' : COR_APOIO_ESCURO;
  const douradoFaixa = faixaClara ? COR_DOURADA : COR_DOURADA_CLARA;

  const largurasCabecalho = [];
  const celulasCabecalho = [];
  if (logo) {
    largurasCabecalho.push(84);
    celulasCabecalho.push({
      image: logo,
      fit: [62, 44],
      alignment: 'center',
      fillColor: '#FFFFFF',
      margin: [10, 10, 10, 10],
    });
  }
  largurasCabecalho.push('*');
  const linhasEmpresa = [];
  if (nomeEmpresa) {
    linhasEmpresa.push({ text: nomeEmpresa, bold: true, fontSize: 13.2, color: tintaFaixa });
  }
  if (fantasiaEmpresa) {
    linhasEmpresa.push({ text: fantasiaEmpresa, fontSize: 9.2, color: douradoFaixa, margin: [0, 2, 0, 0] });
  }
  const linhaDocumento = [registroEmpresa, localEmpresa].filter(Boolean).join('  •  ');
  if (linhaDocumento) {
    linhasEmpresa.push({
      text: linhaDocumento,
      fontSize: 8.6,
      color: apoioFaixa,
      margin: [0, linhasEmpresa.length ? 3 : 0, 0, 0],
    });
  }
  if (enderecoEmpresa) {
    linhasEmpresa.push({ text: enderecoEmpresa, fontSize: 8.6, color: apoioFaixa, margin: [0, 2, 0, 0] });
  }
  if (contatoEmpresa) {
    linhasEmpresa.push({ text: contatoEmpresa, fontSize: 8.6, color: apoioFaixa, margin: [0, 2, 0, 0] });
  }
  celulasCabecalho.push({
    fillColor: corBase,
    margin: [logo ? 14 : 16, 11, 16, 11],
    stack: linhasEmpresa,
  });

  const cabecalho = {
    margin: [42, 22, 42, 0],
    stack: [
      { table: { widths: largurasCabecalho, body: [celulasCabecalho] }, layout: 'noBorders' },
      {
        canvas: [{ type: 'line', x1: 0, y1: 0, x2: 190, y2: 0, lineWidth: 2.6, lineColor: corFilete }],
        margin: [0, 4, 0, 0],
      },
    ],
  };
  return { cabecalho, nomeEmpresa, documentoEmpresa, localEmpresa, tintaFaixa };
}

/**
 * Rodapé do papel: empresa/CNPJ à esquerda e a identificação (documento ou
 * declaração) com a numeração das páginas à direita.
 */
function rodapeDoDocumento(opcoes) {
  const dados = opcoes || {};
  const nomeEmpresa = dados.nomeEmpresa || '';
  const documentoEmpresa = dados.documentoEmpresa || '';
  const identificacao = dados.identificacao || '';
  return (paginaAtual, totalPaginas) => ({
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
            text: [identificacao, `Página ${paginaAtual} de ${totalPaginas}`].filter(Boolean).join('  •  '),
            fontSize: 8.3,
            color: '#7A848D',
            alignment: 'right',
          },
        ],
        margin: [0, 3, 0, 0],
      },
    ],
  });
}

// -------------------------------------------------------------- PDF principal

/**
 * Monta a definição do documento pdfmake.
 * @param {object} doc dados do documento (proposta/orçamento)
 * @param {object} empresa dados cadastrais do usuário (usado quando o documento não traz os dados)
 */
async function montarDefinicao(doc, empresa, contexto) {
  const relatorio = contexto && Array.isArray(contexto.relatorio) ? contexto.relatorio : [];
  // Quando o usuário escolhe uma cor própria, o documento fica monocromático
  // nela; sem escolha, vale a paleta da marca (azul + dourado da logo).
  const corInformada = String((doc.opcoes && doc.opcoes.cor) || '').trim();
  const corPropria = /^#[0-9a-fA-F]{6}$/.test(corInformada) && corInformada.toUpperCase() !== COR_PADRAO;
  const corBase = cor(corInformada || COR_PADRAO);
  const corTitulo = corPropria ? corBase : COR_DOURADA;
  const corFilete = corPropria ? corBase : COR_FILETE;
  const proponente = Object.assign({}, empresa || {}, doc.proponente || {});
  const opcoes = Object.assign(
    {
      mostrarCatalogo: true,
      mostrarFotos: true,
      mostrarDadosBancarios: true,
      mostrarPorExtenso: true,
      mostrarAssinatura: true,
      quebrarPaginaCatalogo: true,
      logoNoCabecalho: true,
      mostrarLinkCompra: false,
      marcaDagua: true,
    },
    doc.opcoes || {}
  );
  const itens = (doc.itens || []).filter((i) => String(i.descricao || '').trim());
  const totais = calcularTotais(Object.assign({}, doc, { itens }));
  const numero = numeroFormatado(doc);
  const titulo = tituloDocumento(doc);
  const dataDoc = Formato.dataISO(doc.data) || Formato.dataISO(new Date());
  // Logo da empresa (a do cadastro ou a logo padrão do sistema, em public/marca)
  const referencia = referenciaLogo(proponente);
  const logo = opcoes.logoNoCabecalho && referencia.referencia
    ? await carregarImagem(referencia.referencia, 'Logo da empresa', relatorio, referencia.padrao)
    : null;

  // Marca d'água: a mesma imagem, bem apagada, atrás do conteúdo de todas as
  // páginas. Se ela não puder ser usada, o PDF sai sem marca d'água (nunca falha).
  const marcaDagua = opcoes.marcaDagua && referencia.referencia
    ? await carregarImagem(referencia.referencia, "Marca d'água", relatorio, referencia.padrao)
    : null;

  // ------------------------------------------------------------- cabeçalho
  const timbre = montarTimbre(proponente, corBase, corFilete, logo);
  const cabecalho = timbre.cabecalho;
  const nomeEmpresa = timbre.nomeEmpresa;
  const documentoEmpresa = timbre.documentoEmpresa;

  const rodape = rodapeDoDocumento({
    nomeEmpresa,
    documentoEmpresa,
    identificacao: `${titulo} nº ${numero}`,
  });

  const localEmpresa = timbre.localEmpresa;
  const tintaFaixa = timbre.tintaFaixa;

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

  // Linha de identificação do documento, como no modelo do usuário:
  //   Pregão Eletrônico • 15/09/2026 • Curitiba/PR
  // No orçamento não há modalidade de licitação: entram data e local.
  const localDocumento = (doc.condicoes && doc.condicoes.local) || localEmpresa || '';
  const linhaIdentificacao = [
    doc.tipo === 'orcamento' ? '' : ((doc.orgao && doc.orgao.modalidade) || ''),
    Formato.dataBR(dataDoc),
    localDocumento.replace(/\s*-\s*/, '/'),
  ].filter(Boolean).join('  •  ');

  conteudo.push({
    table: {
      widths: ['*'],
      body: [
        [
          {
            stack: [
              { text: titulo + ' Nº ' + numero, style: 'tituloPrincipal', color: corBase },
              {
                text: linhaIdentificacao,
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
    ...caixa(doc.tipo === 'orcamento' ? 'IDENTIFICAÇÃO' : 'DADOS DO ÓRGÃO', [118, '*'], identificacao, corTitulo)
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
  conteudo.push(...caixa('DADOS DO PROPONENTE', [150, '*'], dadosProponente, corTitulo));

  // 3. Tabela de preços
  conteudo.push({ text: 'TABELA DE PREÇOS', style: 'tituloSecao', color: corTitulo });

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
      { text: 'Desconto', colSpan: 6, alignment: 'right', bold: true, fillColor: COR_CINZA },
      {}, {}, {}, {}, {},
      { text: '- ' + Formato.moeda(totais.desconto), alignment: 'right', bold: true, fillColor: COR_CINZA, noWrap: true },
    ]);
  }
  if (totais.acrescimo > 0) {
    corpoPrecos.push([
      { text: (doc.acrescimo && doc.acrescimo.descricao) || 'Acréscimo', colSpan: 6, alignment: 'right', bold: true, fillColor: COR_CINZA },
      {}, {}, {}, {}, {},
      { text: Formato.moeda(totais.acrescimo), alignment: 'right', bold: true, fillColor: COR_CINZA, noWrap: true },
    ]);
  }
  corpoPrecos.push([
    { text: rotuloTotal, colSpan: 6, alignment: 'right', bold: true, color: tintaFaixa, fillColor: corBase, fontSize: 11.0 },
    {}, {}, {}, {}, {},
    { text: Formato.moeda(totais.total), alignment: 'right', bold: true, color: tintaFaixa, fillColor: corBase, fontSize: 11.0, noWrap: true },
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
        { text: 'CONDIÇÕES', style: 'tituloSecao', color: corTitulo, margin: [0, 12, 0, 0] },
        ...caixa('', [172, '*'], linhasCondicoes, corTitulo),
      ],
    });
  }

  // 5. Catálogo
  if (opcoes.mostrarCatalogo && itens.length) {
    if (opcoes.quebrarPaginaCatalogo) conteudo.push({ text: '', pageBreak: 'before' });
    conteudo.push({ text: 'CATÁLOGO', style: 'tituloSecao', color: corTitulo, margin: [0, 14, 0, 6] });
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

  // Local do documento (usado nas declarações e no bloco final)
  const localInformado = (condicoes.local || proponente.cidade || '').trim();
  const uf = (proponente.uf || '').trim().toUpperCase();
  let local = localInformado;
  if (localInformado && uf) {
    const jaTemUf = new RegExp(`[-/\\s]${uf}$`, 'i').test(localInformado);
    if (!jaTemUf) local = `${localInformado} - ${uf}`;
  }

  // 6. Local, data e assinatura
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
    // topo: espaço para a faixa da empresa (o timbre ocupa ~87 pt a partir de
    // 22 pt do topo; a margem reserva isso e ainda deixa um respiro antes do
    // conteúdo — se a faixa crescer, esta margem precisa acompanhar)
    pageMargins: [42, 124, 42, 52],
    ...(marcaDagua
      ? {
          background: () => ({
            image: marcaDagua,
            width: 330,
            opacity: 0.08,
            alignment: 'center',
            margin: [0, 285, 0, 0],
          }),
        }
      : {}),
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
      author: nomeEmpresa || 'DEJ Solutions & Global',
      subject: doc.tipo === 'orcamento' ? 'Orçamento' : 'Proposta de fornecimento',
      creator: 'DEJ Solutions & Global — gerador de propostas e orçamentos',
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

/**
 * Folha de declaração: uma declaração (ou várias, uma por página) impressa no
 * mesmo padrão da proposta — timbre com a logomarca, Times New Roman, texto
 * justificado, local/data e linha de assinatura. Serve para levar a declaração
 * assinada ao certame sem imprimir a proposta inteira.
 *
 * @param {object|object[]} declaracoes uma declaração ou a lista delas
 * @param {object} doc documento em tela (dá o contexto dos campos {ORGAO} etc.)
 * @param {object} empresa dados cadastrais do usuário
 */
async function montarDefinicaoDeclaracoes(declaracoes, doc, empresa, contexto) {
  const relatorio = contexto && Array.isArray(contexto.relatorio) ? contexto.relatorio : [];
  const documento = doc || {};
  const lista = (Array.isArray(declaracoes) ? declaracoes : [declaracoes])
    .filter((d) => d && String(d.texto || '').trim());
  const proponente = Object.assign({}, empresa || {}, documento.proponente || {});
  const opcoes = Object.assign(
    { logoNoCabecalho: true, marcaDagua: false, mostrarAssinatura: true },
    documento.opcoes || {},
    contexto && contexto.opcoes ? contexto.opcoes : {}
  );

  const corInformada = String((documento.opcoes && documento.opcoes.cor) || '').trim();
  const corPropria = /^#[0-9a-fA-F]{6}$/.test(corInformada) && corInformada.toUpperCase() !== COR_PADRAO;
  const corBase = cor(corInformada || COR_PADRAO);
  const corTitulo = corPropria ? corBase : COR_DOURADA;
  const corFilete = corPropria ? corBase : COR_FILETE;

  const referencia = referenciaLogo(proponente);
  const logo = opcoes.logoNoCabecalho && referencia.referencia
    ? await carregarImagem(referencia.referencia, 'Logo da empresa', relatorio, referencia.padrao)
    : null;
  const marcaDagua = opcoes.marcaDagua && referencia.referencia
    ? await carregarImagem(referencia.referencia, "Marca d'água", relatorio, referencia.padrao)
    : null;

  const timbre = montarTimbre(proponente, corBase, corFilete, logo);

  const dataDoc = Formato.dataISO(documento.data) || Formato.dataISO(new Date());
  const uf = String(proponente.uf || '').trim().toUpperCase();
  const localInformado = (documento.condicoes && documento.condicoes.local) || proponente.cidade || '';
  let local = String(localInformado).trim();
  if (local && uf && !new RegExp(`[-/\\s]${uf}$`, 'i').test(local)) local = `${local} - ${uf}`;

  const assinatura = opcoes.mostrarAssinatura
    ? await carregarImagem(proponente.assinatura, 'Assinatura', relatorio)
    : null;

  const conteudo = [];
  lista.forEach((declaracao, indice) => {
    if (indice) conteudo.push({ text: '', pageBreak: 'before' });
    const texto = Declaracoes
      ? Declaracoes.substituirTokens(declaracao.texto, documento, proponente)
      : String(declaracao.texto || '');

    const folha = [
      {
        text: String(declaracao.titulo || 'DECLARAÇÃO').trim().toUpperCase(),
        alignment: 'center',
        bold: true,
        fontSize: 15.5,
        color: corTitulo,
        characterSpacing: 0.3,
        margin: [0, 2, 0, 16],
      },
      { text: texto, alignment: 'justify', fontSize: 12.2, lineHeight: 1.25 },
    ];

    if (opcoes.mostrarAssinatura) {
      folha.push({
        text: `${local ? '(' + local + ') ' : ''}${Formato.dataLonga(dataDoc)}.`,
        alignment: 'right',
        fontSize: 11.4,
        margin: [0, 22, 0, 0],
      });
      folha.push({
        columns: [
          { width: '*', text: '' },
          {
            width: 280,
            stack: [
              assinatura
                ? { image: assinatura, fit: [200, 52], alignment: 'center', margin: [0, 8, 0, 0] }
                : { text: '', margin: [0, 46, 0, 0] },
              {
                canvas: [{ type: 'line', x1: 0, y1: 0, x2: 280, y2: 0, lineWidth: 0.7, lineColor: '#5B6670' }],
                margin: [0, 2, 0, 5],
              },
              {
                text: proponente.representante || timbre.nomeEmpresa || '',
                alignment: 'center',
                bold: true,
                fontSize: 11,
              },
              proponente.cpfRepresentante
                ? { text: 'CPF: ' + Formato.cpf(proponente.cpfRepresentante), alignment: 'center', fontSize: 9.6 }
                : null,
              {
                text: '(Representante Legal da empresa)',
                alignment: 'center',
                fontSize: 9.2,
                color: '#5B6670',
              },
            ].filter(Boolean),
          },
          { width: '*', text: '' },
        ],
        margin: [0, 6, 0, 0],
      });
    }

    conteudo.push({ unbreakable: true, stack: folha });
  });

  const identificacao = [
    'Declaração',
    documento.tipo ? `${tituloDocumento(documento)} nº ${numeroFormatado(documento)}` : '',
  ].filter(Boolean).join('  •  ');

  return {
    pageSize: 'A4',
    pageMargins: [42, 124, 42, 52],
    ...(marcaDagua
      ? {
          background: () => ({
            image: marcaDagua,
            width: 330,
            opacity: 0.08,
            alignment: 'center',
            margin: [0, 285, 0, 0],
          }),
        }
      : {}),
    header: () => timbre.cabecalho,
    footer: rodapeDoDocumento({
      nomeEmpresa: timbre.nomeEmpresa,
      documentoEmpresa: timbre.documentoEmpresa,
      identificacao,
    }),
    content: conteudo.length ? conteudo : [{ text: 'Nenhuma declaração para imprimir.', color: '#7A848D' }],
    info: {
      title: (lista[0] && lista[0].titulo) || 'Declaração',
      author: timbre.nomeEmpresa || 'DEJ Solutions & Global',
      subject: 'Declaração',
    },
    defaultStyle: { font: 'Times New Roman', fontSize: 12.4, color: '#26303A', lineHeight: 1.2 },
  };
}

/** Nome do arquivo da declaração, ex.: Declaracao_Declaracao-Unificada.pdf */
function nomeArquivoDeclaracao(declaracoes) {
  const primeira = (Array.isArray(declaracoes) ? declaracoes[0] : declaracoes) || {};
  const quantas = Array.isArray(declaracoes) ? declaracoes.length : 1;
  const titulo = String(primeira.titulo || '').trim();
  // "Declaração Unificada" já diz o que é: não repete a palavra no nome do arquivo
  const base = /^declara/i.test(titulo) ? titulo : 'Declaração ' + (titulo || 'sem título');
  const nome = Formato.slug(base).slice(0, 60) || 'declaracao';
  return `${nome}${quantas > 1 ? '_e_outras' : ''}.pdf`;
}

/** Gera o PDF das declarações e devolve um Buffer. */
async function gerarPdfDeclaracoes(declaracoes, doc, empresa, contexto) {
  const definicao = await montarDefinicaoDeclaracoes(declaracoes, doc, empresa, contexto);
  const pdf = pdfMake.createPdf(definicao);
  return pdf.getBuffer();
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
    montarDefinicaoDeclaracoes,
    gerarPdfDeclaracoes,
    nomeArquivoDeclaracao,
    descreverFotosIgnoradas,
    calcularTotais,
    nomeArquivo,
    numeroFormatado,
    tituloDocumento,
    COR_PADRAO,
  };
});
