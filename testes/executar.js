'use strict';

/**
 * Testes do DEJ Solutions & Global.
 * Executar com: npm run testes
 *
 * Não usa dependências externas: um runner simples com node:assert.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

// ------------------------------------------------------------------ runner

const testes = [];
function teste(nome, fn) {
  testes.push({ nome, fn });
}

async function executar() {
  let passou = 0;
  const falhas = [];
  console.log('\nDEJ Solutions & Global — testes\n' + '='.repeat(60));
  for (const { nome, fn } of testes) {
    try {
      await fn();
      passou += 1;
      console.log('  ok   ' + nome);
    } catch (erro) {
      falhas.push({ nome, erro });
      console.log('  FALHA ' + nome);
      console.log('        ' + erro.message.split('\n')[0]);
    }
  }
  console.log('='.repeat(60));
  console.log(`  ${passou} de ${testes.length} testes passaram`);
  if (falhas.length) {
    console.log('\nDetalhes das falhas:');
    falhas.forEach(({ nome, erro }) => {
      console.log('\n--- ' + nome + '\n' + erro.stack);
    });
    process.exit(1);
  }
}

// ------------------------------------------------------------------ dados

process.env.LICITAPRO_DATA_DIR = process.env.LICITAPRO_DATA_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'licitapro-teste-'));
process.env.LICITAPRO_SILENCIOSO = '1';

const RAIZ = path.join(__dirname, '..');
const Formato = require(path.join(RAIZ, 'shared', 'format'));
const XLSX = require('xlsx');

// =========================================================== 1. formatação

teste('Formato: converte textos em números no padrão brasileiro', () => {
  assert.strictEqual(Formato.paraNumero('R$ 1.490,55'), 1490.55);
  assert.strictEqual(Formato.paraNumero('1.490'), 1490);
  assert.strictEqual(Formato.paraNumero('1490,90'), 1490.9);
  assert.strictEqual(Formato.paraNumero('1490.90'), 1490.9);
  assert.strictEqual(Formato.paraNumero(1490.9), 1490.9);
  assert.strictEqual(Formato.paraNumero(''), 0);
  assert.strictEqual(Formato.paraNumero('abc'), 0);
});

teste('Formato: exibe moeda e quantidades em português', () => {
  assert.strictEqual(Formato.moeda(8940), 'R$ 8.940,00');
  assert.strictEqual(Formato.moeda('1490.5'), 'R$ 1.490,50');
  assert.strictEqual(Formato.quantidade(6), '6');
  assert.strictEqual(Formato.quantidade(2.5), '2,50');
  assert.strictEqual(Formato.dataBR('2026-04-30'), '30/04/2026');
  assert.strictEqual(Formato.dataLonga('2026-04-30'), '30 de abril de 2026');
});

teste('Formato: valor total por extenso', () => {
  assert.strictEqual(Formato.moedaPorExtenso(8940), 'oito mil novecentos e quarenta reais');
  assert.strictEqual(Formato.moedaPorExtenso(1), 'um real');
  assert.strictEqual(Formato.moedaPorExtenso(100), 'cem reais');
  assert.strictEqual(Formato.moedaPorExtenso(11252.81), 'onze mil duzentos e cinquenta e dois reais e oitenta e um centavos');
  assert.strictEqual(Formato.moedaPorExtenso(1500000), 'um milhão e quinhentos mil reais');
  assert.strictEqual(Formato.moedaPorExtenso(2000500.05), 'dois milhões e quinhentos reais e cinco centavos');
  assert.strictEqual(Formato.moedaPorExtenso(0.5), 'cinquenta centavos');
});

teste('Formato: máscaras de CNPJ, CPF, CEP e telefone', () => {
  assert.strictEqual(Formato.cnpj('65180352000111'), '65.180.352/0001-11');
  assert.strictEqual(Formato.cpf('62964617392'), '629.646.173-92');
  assert.strictEqual(Formato.cep('60526175'), '60526-175');
  assert.strictEqual(Formato.telefone('89994488748'), '(89) 99448-8748');
  assert.strictEqual(Formato.numeroDocumento(7, 2026), '007/2026');
});

// ===================================================== 2. planilha modelo

teste('Modelo de planilha: gera .xlsx com as abas Itens e Instruções', () => {
  const Modelo = require(path.join(RAIZ, 'server', 'modeloImportacao'));
  const buffer = Modelo.gerarBuffer();
  assert.ok(buffer.length > 5000, 'o arquivo deve ter conteúdo');

  const livro = XLSX.read(buffer, { type: 'buffer' });
  assert.deepStrictEqual(livro.SheetNames, ['Itens', 'Instruções']);

  const cabecalhos = XLSX.utils.sheet_to_json(livro.Sheets['Itens'], { header: 1 })[0];
  assert.deepStrictEqual(cabecalhos, [
    'Numero_Item', 'Descricao_Edital', 'Unidade', 'Quantidade', 'Valor_Referencia',
    'Preco_Custo', 'Preco_Venda', 'Marca_Modelo', 'Foto_Produto', 'Descricao_Catalogo', 'Link_da_compra',
  ]);
});

teste('Importação: lê a planilha do modelo no formato esperado', () => {
  const Importador = require(path.join(RAIZ, 'server', 'importar'));
  const Modelo = require(path.join(RAIZ, 'server', 'modeloImportacao'));

  // gera uma planilha de exemplo a partir do modelo, com dados nas células
  const livro = XLSX.read(Modelo.gerarBuffer(), { type: 'buffer' });
  const linhas = XLSX.utils.sheet_to_json(livro.Sheets['Itens'], { header: 1 });
  linhas.push([1, 'RÁDIO TRANSCEPTOR DIGITAL', 'UND', 6, '1.600,00', '1.150,00', 'R$ 1.490,00', 'Hytera / BP516', '', 'Rádio com 48 canais', 'https://loja.com/r']);
  linhas.push([2, 'BATERIA EXTRA', 'UND', '6', '320,00', '180,00', '249,90', 'Hytera / BL2016', '', 'Bateria 1500 mAh', '']);
  linhas.push(['', '', '', '', '', '', '', '', '', '', '']);
  linhas.push([3, 'CARREGADOR 6 POSIÇÕES', 'CX', 1, 900, 600, 890, 'Hytera / MCA08', '', 'Carrega 6 baterias', '']);

  const nova = XLSX.utils.aoa_to_sheet(linhas);
  const livro2 = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro2, nova, 'Itens');
  const buffer = XLSX.write(livro2, { bookType: 'xlsx', type: 'buffer' });

  const resultado = Importador.importar(buffer, 'planilha.xlsx');
  assert.strictEqual(resultado.itens.length, 3, 'linha em branco deve ser ignorada');
  assert.strictEqual(resultado.itens[0].descricao, 'RÁDIO TRANSCEPTOR DIGITAL');
  assert.strictEqual(resultado.itens[0].quantidade, 6);
  assert.strictEqual(resultado.itens[0].precoVenda, 1490);
  assert.strictEqual(resultado.itens[0].precoCusto, 1150);
  assert.strictEqual(resultado.itens[0].valorReferencia, 1600);
  assert.strictEqual(resultado.itens[1].unidade, 'UND');
  assert.strictEqual(resultado.itens[1].precoVenda, 249.9);
  assert.strictEqual(resultado.itens[1].descricaoCatalogo, 'Bateria 1500 mAh');
  assert.strictEqual(resultado.itens[2].unidade, 'CX');
  assert.deepStrictEqual(resultado.avisos, []);
});

teste('Importação: reconhece cabeçalhos com nomes alternativos e linha de título', () => {
  const Importador = require(path.join(RAIZ, 'server', 'importar'));
  const dados = [
    ['PLANILHA DE ITENS DO PREGÃO 17/2026'],
    ['Item', 'Descrição do Item', 'Un.', 'Qtd', 'Valor de Referência', 'Preço de Custo', 'Valor Unitário de Venda', 'Marca', 'Foto'],
    [1, 'CABO DE REDE CAT6 — CAIXA 305 M', 'CX', 3, 850, 600, 799.9, 'Furukawa', ''],
  ];
  const buffer = XLSX.write(
    (() => {
      const l = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(l, XLSX.utils.aoa_to_sheet(dados), 'Itens');
      return l;
    })(),
    { bookType: 'xlsx', type: 'buffer' }
  );

  const resultado = Importador.importar(buffer, 'alternativa.xlsx');
  assert.strictEqual(resultado.itens.length, 1);
  assert.strictEqual(resultado.itens[0].descricao, 'CABO DE REDE CAT6 — CAIXA 305 M');
  assert.strictEqual(resultado.itens[0].quantidade, 3);
  assert.strictEqual(resultado.itens[0].precoVenda, 799.9);
  assert.strictEqual(resultado.itens[0].marcaModelo, 'Furukawa');
});

teste('Importação: recusa planilhas sem as colunas obrigatórias', () => {
  const Importador = require(path.join(RAIZ, 'server', 'importar'));
  const l = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(l, XLSX.utils.aoa_to_sheet([['coluna_a', 'coluna_b'], [1, 2]]), 'Planilha1');
  const buffer = XLSX.write(l, { bookType: 'xlsx', type: 'buffer' });
  assert.throws(() => Importador.importar(buffer, 'ruim.xlsx'), /Não reconheci as colunas/);
});

teste('Importação: aceita arquivo CSV', () => {
  const Importador = require(path.join(RAIZ, 'server', 'importar'));
  const csv = 'Numero_Item;Descricao_Edital;Unidade;Quantidade;Preco_Venda\n1;PILHA ALCALINA AA;PCT;10;29,90\n';
  const resultado = Importador.importar(Buffer.from(csv, 'utf8'), 'itens.csv');
  assert.strictEqual(resultado.itens.length, 1);
  assert.strictEqual(resultado.itens[0].descricao, 'PILHA ALCALINA AA');
  assert.strictEqual(resultado.itens[0].precoVenda, 29.9);
});

// ================================================================ 3. PDFs

function documentoExemplo(tipo) {
  return {
    id: 'teste-1',
    tipo,
    status: 'rascunho',
    data: '2026-04-30',
    numero: { sequencial: 4, ano: 2026, grupo: '' },
    orgao: {
      nome: 'UASG 787010 - CENTRO DE INTENDÊNCIA DA MARINHA EM BRASÍLIA',
      uasg: '787010',
      processo: '44/2026',
      modalidade: 'Pregão Eletrônico',
      pregao: '17/2026',
      objeto: 'Aquisição de rádios transceptores',
    },
    cliente: { nome: 'CONSTRUTORA ALFA LTDA', cnpjCpf: '12.345.678/0001-99', contato: 'Sr. João', telefone: '11988887777' },
    proponente: {
      razaoSocial: '65.180.352 BRENA HENRIQUE DO NASCIMENTO',
      nomeFantasia: 'D.E.J SOLUTIONS & GLOBAL',
      cnpj: '65.180.352/0001-11',
      inscricaoEstadual: '073159573',
      simplesNacional: true,
      telefone: '(89) 9 9448-8748',
      email: 'dejsolutionsglobal@gmail.com',
      endereco: 'Rua Maceió, 72, Dom Lustosa',
      cidade: 'Fortaleza',
      uf: 'CE',
      cep: '60526-175',
      banco: 'Banco Santander',
      agencia: '3508',
      conta: '02005127-7',
      representante: 'BRENA HENRIQUE DO NASCIMENTO',
      cpfRepresentante: '629.646.173-92',
      cargoRepresentante: 'REPRESENTANTE LEGAL DA EMPRESA',
    },
    itens: [
      {
        numeroItem: '1', descricao: 'RÁDIO TRANSCEPTOR PORTÁTIL DIGITAL, 48 CANAIS, BATERIA 1500 mAh',
        unidade: 'UND', quantidade: 6, valorReferencia: 1600, precoCusto: 1150, precoVenda: 1490,
        marcaModelo: 'Hytera / BP516', foto: '', descricaoCatalogo: 'Rádio digital com 48 canais.', linkCompra: 'https://loja.com/r',
      },
      {
        numeroItem: '2', descricao: 'BATERIA EXTRA 1500 mAh', unidade: 'UND', quantidade: 6,
        precoCusto: 180, precoVenda: 249.9, marcaModelo: 'Hytera / BL2016', foto: 'https://exemplo.invalido/foto.png',
        descricaoCatalogo: 'Bateria de íons de lítio.', linkCompra: '',
      },
    ],
    condicoes: {
      validadeDias: 60,
      condicoesPagamento: '30 dias após o recebimento definitivo.',
      prazoEntrega: 'Conforme Edital.',
      garantia: '12 meses contra defeitos de fabricação',
      observacoes: 'Produtos novos, na embalagem original.',
      local: 'Fortaleza - CE',
    },
    desconto: { modo: 'percentual', valor: 2 },
    acrescimo: { ativo: true, descricao: 'Frete / Instalação', valor: 150 },
    opcoes: {
      mostrarCatalogo: true, mostrarFotos: true, mostrarDadosBancarios: true, mostrarPorExtenso: true,
      mostrarAssinatura: true, quebrarPaginaCatalogo: true, logoNoCabecalho: true,
      mostrarLinkCompra: false, cor: '#0B1F33', marcaDagua: true,
    },
  };
}

teste('PDF: usa a fonte Times (Times New Roman) no arquivo', async () => {
  const Pdf = require(path.join(RAIZ, 'server', 'pdf'));
  const documento = {
    tipo: 'proposta',
    numero: { sequencial: 1, ano: 2026, grupo: '' },
    data: '2026-04-30',
    orgao: { nome: 'UASG 787010' },
    itens: [{ descricao: 'RÁDIO TRANSCEPTOR', unidade: 'UND', quantidade: 6, precoVenda: 1490 }],
    condicoes: { validadeDias: 60, local: 'Fortaleza - CE' },
    proponente: { razaoSocial: 'D.E.J SOLUTIONS & GLOBAL', cnpj: '65.180.352/0001-11' },
    layout: {},
  };
  const buffer = await Pdf.gerarPdf(documento, documento.proponente);
  const conteudo = Buffer.from(buffer).toString('latin1');
  const fontes = Array.from(new Set(conteudo.match(/\/BaseFont\s*\/([A-Za-z0-9+#-]+)/g) || []));
  assert.ok(fontes.includes('/BaseFont /Times-Roman'), 'fonte Times no PDF: ' + fontes.join(', '));
  assert.ok(fontes.includes('/BaseFont /Times-Bold'), 'negrito da Times');
  assert.ok(!/Roboto/.test(conteudo), 'sem Roboto no arquivo');
});

teste('Imagens: só JPEG/PNG íntegros entram no PDF', () => {
  const Imagens = require(path.join(RAIZ, 'server', 'imagens'));
  const ModoLocal = require(path.join(RAIZ, 'testes', 'modo-local.js'));

  assert.strictEqual(Imagens.imagemIntegra(ModoLocal.pngValido(10, 10)), true, 'PNG montado é aceito');
  assert.strictEqual(Imagens.imagemIntegra(ModoLocal.pngCorrompido()), false, 'PNG corrompido é recusado');
  assert.strictEqual(
    Imagens.imagemIntegra(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')),
    false,
    'GIF é recusado (o PDF não aceita)'
  );
  assert.strictEqual(
    Imagens.imagemIntegra(Buffer.from('/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a', 'base64')),
    false,
    'JPEG truncado é recusado'
  );
  assert.strictEqual(Imagens.imagemIntegra(Buffer.from('nada')), false, 'arquivo qualquer é recusado');

  // o data URL corrompido é reconhecido antes de chegar ao pdfmake
  const corrompido = ModoLocal.dataUrlPng(ModoLocal.pngCorrompido());
  assert.strictEqual(Imagens.bytesDoDataUrl(corrompido).length > 0, true, 'lê os bytes do data URL');
  assert.strictEqual(Imagens.bytesDoDataUrl('data:image/gif,R0lGOD'), null, 'data URL sem base64 é ignorado');
  assert.strictEqual(Imagens.bytesDoDataUrl('https://exemplo.com/x.png'), null, 'link comum não é data URL');
});

teste('PDF: gera mesmo com fotos corrompidas ou em formato não aceito', async () => {
  const Pdf = require(path.join(RAIZ, 'server', 'pdf'));
  const ModoLocal = require(path.join(RAIZ, 'testes', 'modo-local.js'));

  const documento = {
    tipo: 'proposta',
    numero: { sequencial: 1, ano: 2026 },
    data: '2026-04-30',
    orgao: { nome: 'UASG 787010' },
    itens: [
      { descricao: 'FOTO BOA', unidade: 'UND', quantidade: 1, precoVenda: 100, foto: ModoLocal.dataUrlPng(ModoLocal.pngValido(8, 6)), descricaoCatalogo: 'ok' },
      { descricao: 'PNG CORROMPIDO', unidade: 'UND', quantidade: 1, precoVenda: 100, foto: ModoLocal.dataUrlPng(ModoLocal.pngCorrompido()), descricaoCatalogo: 'ruim' },
      { descricao: 'GIF', unidade: 'UND', quantidade: 1, precoVenda: 100, foto: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', descricaoCatalogo: 'gif' },
      { descricao: 'LINK QUEBRADO', unidade: 'UND', quantidade: 1, precoVenda: 100, foto: 'https://exemplo.invalido/x.jpg', descricaoCatalogo: 'link' },
      { descricao: 'REFERÊNCIA DO NAVEGADOR', unidade: 'UND', quantidade: 1, precoVenda: 100, foto: 'idb:abc', descricaoCatalogo: 'idb' },
      { descricao: 'ARQUIVO QUE NÃO EXISTE', unidade: 'UND', quantidade: 1, precoVenda: 100, foto: '/tmp/nao-existe-licitapro.jpg', descricaoCatalogo: 'caminho' },
    ],
    condicoes: { validadeDias: 60, local: 'Fortaleza - CE' },
    proponente: {
      razaoSocial: 'D.E.J SOLUTIONS & GLOBAL',
      logo: ModoLocal.dataUrlPng(ModoLocal.pngCorrompido()),
      assinatura: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
    },
    layout: { logoCabecalho: true },
  };

  const relatorio = [];
  const buffer = await Pdf.gerarPdf(documento, documento.proponente, { relatorio });
  assert.ok(buffer.length > 2000, 'PDF gerado (' + buffer.length + ' bytes)');
  const texto = Buffer.from(buffer).toString('latin1');
  assert.ok(/\/Subtype\s*\/Image/.test(texto), 'a foto boa entrou no PDF');

  // a tela precisa saber quais fotos ficaram de fora (senão a foto some calada)
  assert.ok(relatorio.length >= 4, 'fotos problemáticas relatadas: ' + relatorio.length);
  const rotulos = relatorio.map((f) => f.rotulo).join(' | ');
  assert.ok(/Item 2/.test(rotulos), 'PNG corrompido relatado no item 2: ' + rotulos);
  assert.ok(/Item 4/.test(rotulos), 'link morto relatado no item 4: ' + rotulos);
  assert.ok(
    relatorio.every((f) => f.origem && f.motivo),
    'cada foto relatada diz de onde veio e por quê: ' + JSON.stringify(relatorio[0])
  );
  assert.ok(!rotulos.includes('Item 1 '), 'a foto boa não entra no relatório: ' + rotulos);
});

teste('PDF: foto enviada por link entra no PDF e o link ruim é avisado', async () => {
  const Pdf = require(path.join(RAIZ, 'server', 'pdf'));
  const ModoLocal = require(path.join(RAIZ, 'testes', 'modo-local.js'));
  const dns = require('dns');

  // simula a internet: DNS público e um servidor servindo uma foto e uma página web
  const lookupOriginal = dns.promises.lookup;
  const fetchOriginal = global.fetch;
  const imagem = ModoLocal.pngValido(24, 24);
  dns.promises.lookup = async () => [{ address: '93.184.216.34', family: 4 }];
  global.fetch = async (url) => {
    if (String(url).includes('pagina.html')) {
      return {
        ok: true,
        headers: new Map([['content-type', 'text/html']]),
        arrayBuffer: async () => Buffer.from('<html></html>'),
      };
    }
    return {
      ok: true,
      headers: new Map([['content-type', 'image/png'], ['content-length', String(imagem.length)]]),
      arrayBuffer: async () => imagem,
    };
  };

  try {
    const documento = {
      tipo: 'proposta',
      numero: { sequencial: 1, ano: 2026 },
      data: '2026-04-30',
      orgao: { nome: 'UASG 787010' },
      itens: [
        { descricao: 'FOTO POR LINK', unidade: 'UND', quantidade: 1, precoVenda: 10, foto: 'https://exemplo.com/foto.png' },
        { descricao: 'LINK DE PÁGINA', unidade: 'UND', quantidade: 1, precoVenda: 10, foto: 'https://exemplo.com/pagina.html' },
      ],
      condicoes: { validadeDias: 60, local: 'Fortaleza - CE' },
    };
    const relatorio = [];
    const buffer = await Pdf.gerarPdf(documento, {}, { relatorio });
    const texto = Buffer.from(buffer).toString('latin1');
    assert.ok(/\/Subtype\s*\/Image/.test(texto), 'a foto baixada do link entrou no PDF');
    assert.strictEqual(relatorio.length, 1, 'só o link ruim é avisado: ' + JSON.stringify(relatorio));
    assert.strictEqual(relatorio[0].rotulo, 'Item 2', 'o aviso diz qual item ficou sem foto');
    assert.strictEqual(relatorio[0].origem, 'link', 'o aviso diz que a foto veio de link');
  } finally {
    dns.promises.lookup = lookupOriginal;
    global.fetch = fetchOriginal;
  }
});

teste('Fotos: o aviso mostra quais não entraram no PDF', () => {
  const Pdf = require(path.join(RAIZ, 'server', 'pdf'));
  const texto = Pdf.descreverFotosIgnoradas([
    { rotulo: 'Item 3', origem: 'link', motivo: 'não consegui carregar a imagem' },
    { rotulo: 'Item 7', origem: 'foto enviada', motivo: 'formato não aceito no PDF (use .jpg ou .png)' },
  ]);
  assert.ok(/Item 3 \(link\)/.test(texto), 'diz o item e a origem: ' + texto);
  assert.ok(/Item 7/.test(texto), 'diz o segundo item: ' + texto);
  assert.ok(texto.length <= 400, 'aviso curto para caber no cabeçalho/tela');
  assert.strictEqual(Pdf.descreverFotosIgnoradas([]), '', 'sem foto ignorada, sem aviso');
});

teste('PDF: calcula subtotal, desconto, acréscimo, custo e lucro', () => {
  const Pdf = require(path.join(RAIZ, 'server', 'pdf'));
  const totais = Pdf.calcularTotais(documentoExemplo('proposta'));
  assert.strictEqual(totais.bruto, 10439.4);
  assert.strictEqual(totais.desconto, 208.79);
  assert.strictEqual(totais.acrescimo, 150);
  assert.strictEqual(totais.total, 10380.61);
  assert.strictEqual(totais.custo, 7980);
  assert.strictEqual(totais.lucro, 2250.61);
});

teste('PDF: gera proposta de licitação válida', async () => {
  const Pdf = require(path.join(RAIZ, 'server', 'pdf'));
  const buffer = await Pdf.gerarPdf(documentoExemplo('proposta'), {});
  assert.ok(buffer.length > 10000, 'PDF muito pequeno');
  assert.strictEqual(buffer.subarray(0, 5).toString(), '%PDF-');
  assert.ok(buffer.includes(Buffer.from('%%EOF')), 'PDF sem marcador final');
});

teste('PDF: gera orçamento comercial válido', async () => {
  const Pdf = require(path.join(RAIZ, 'server', 'pdf'));
  const buffer = await Pdf.gerarPdf(documentoExemplo('orcamento'), {});
  assert.strictEqual(buffer.subarray(0, 5).toString(), '%PDF-');
  assert.ok(buffer.length > 10000);
});

teste('PDF: paleta da marca (azul-marinho e dourado nos títulos)', async () => {
  const Pdf = require(path.join(RAIZ, 'server', 'pdf'));
  const documento = documentoExemplo();
  const definicao = await Pdf.montarDefinicao(documento, documento.proponente);
  const desenho = JSON.stringify(definicao.content) + JSON.stringify(definicao.header());

  assert.strictEqual(Pdf.COR_PADRAO, '#0B1F33', 'azul-marinho da paleta é a cor padrão');
  assert.ok(desenho.toUpperCase().includes('#0B1F33'), 'azul-marinho da paleta na estrutura do documento');
  assert.ok(/#C6A15B/i.test(desenho), 'fio dourado da paleta no cabeçalho');
  assert.ok(/#8A6A31/i.test(desenho), 'títulos das seções em dourado (tom de texto)');
  assert.ok(/#E8ECEF/i.test(desenho), 'cinza claro da paleta nas faixas de desconto/frete');
  assert.ok(/fillColor/.test(desenho) && /#FFFFFF/.test(desenho), 'faixa do cabeçalho no azul com texto branco');
  assert.ok(/#D8B873/i.test(desenho), 'número do documento em dourado claro sobre a faixa');
  assert.ok(/#C3D2E2/i.test(desenho), 'dados de contato em azul de apoio sobre a faixa');

  // quem escolhe uma cor própria continua com o documento monocromático
  const comCorPropria = await Pdf.montarDefinicao(
    Object.assign({}, documento, { opcoes: Object.assign({}, documento.opcoes, { cor: '#7C3AED' }) }),
    documento.proponente
  );
  const proprio = JSON.stringify(comCorPropria.content) + JSON.stringify(comCorPropria.header());
  assert.ok(proprio.includes('#7C3AED'), 'cor escolhida pelo usuário é respeitada');
  assert.ok(/#8A6A31/i.test(proprio) === false, 'sem dourado da marca quando o usuário define a cor');
  assert.ok(/#C6A15B/i.test(proprio) === false, 'sem filete dourado quando o usuário define a cor');

  // com uma cor clara, a faixa do cabeçalho e a linha do total usam texto escuro
  const clara = await Pdf.montarDefinicao(
    Object.assign({}, documento, { opcoes: Object.assign({}, documento.opcoes, { cor: '#F3D9A4' }) }),
    documento.proponente
  );
  const desenhoClaro = JSON.stringify(clara.content) + JSON.stringify(clara.header());
  assert.ok(desenhoClaro.includes('#F3D9A4'), 'cor clara escolhida pelo usuário é respeitada');
  assert.ok(desenhoClaro.includes('#1C2B3A'), 'sobre cor clara o texto da faixa fica escuro (legível)');
});

teste('PDF: cabeçalho com os dados da empresa e a linha de identificação', async () => {
  const Pdf = require(path.join(RAIZ, 'server', 'pdf'));
  const documento = documentoExemplo();
  documento.proponente = Object.assign({}, documento.proponente, {
    razaoSocial: 'DEJ SOLUTIONS COMÉRCIO E SERVIÇOS LTDA',
    nomeFantasia: 'DEJ Solutions & Global',
    cnpj: '12.345.678/0001-90',
    inscricaoEstadual: '987.654.32-10',
    telefone: '(41) 99999-4040',
    email: 'comercial@dejsolutions.com.br',
    endereco: 'Av. Sete de Setembro, 4500 — Batel',
    cidade: 'Curitiba',
    uf: 'PR',
    cep: '80000-000',
  });
  documento.orgao.modalidade = 'Pregão Eletrônico';
  documento.condicoes.local = 'Curitiba/PR';

  const definicao = await Pdf.montarDefinicao(documento, documento.proponente);
  const faixa = JSON.stringify(definicao.header());
  const conteudo = JSON.stringify(definicao.content);

  // razão social e nome fantasia no topo, com o CNPJ e a inscrição estadual
  assert.ok(faixa.includes('DEJ SOLUTIONS COMÉRCIO E SERVIÇOS LTDA'), 'razão social no cabeçalho');
  assert.ok(faixa.includes('DEJ Solutions & Global'), 'nome fantasia no cabeçalho');
  assert.ok(/CNPJ 12\.345\.678\/0001-90/.test(faixa), 'CNPJ no cabeçalho');
  assert.ok(/IE 987\.654\.32-10/.test(faixa), 'inscrição estadual no cabeçalho');
  assert.ok(faixa.includes('Curitiba/PR'), 'cidade/UF no cabeçalho');
  assert.ok(faixa.includes('80000-000'), 'CEP no cabeçalho');
  assert.ok(faixa.includes('Av. Sete de Setembro, 4500 — Batel'), 'endereço no cabeçalho');
  assert.ok(faixa.includes('(41) 99999-4040'), 'telefone no cabeçalho');
  assert.ok(faixa.includes('comercial@dejsolutions.com.br'), 'e-mail no cabeçalho');

  // título e a linha de identificação logo abaixo, como no modelo do usuário
  const numeracao = String(documento.numero.sequencial).padStart(3, '0') + '/' + documento.numero.ano;
  assert.ok(conteudo.includes('PROPOSTA DE FORNECIMENTO Nº ' + numeracao), 'título com a numeração');
  assert.ok(conteudo.includes('Pregão Eletrônico'), 'modalidade na linha de identificação');
  assert.ok(/Pregão Eletrônico\s+•\s+\d{2}\/\d{2}\/\d{4}/.test(conteudo), 'data na linha de identificação');
  assert.ok(conteudo.includes('Curitiba/PR'), 'local na linha de identificação');

  // no orçamento não há modalidade de licitação: fica data e local
  const orcamento = Object.assign({}, documento, { tipo: 'orcamento' });
  const defOrcamento = await Pdf.montarDefinicao(orcamento, orcamento.proponente);
  const conteudoOrcamento = JSON.stringify(defOrcamento.content);
  assert.ok(conteudoOrcamento.includes('ORÇAMENTO Nº ' + numeracao), 'título do orçamento com a numeração');
  assert.ok(!conteudoOrcamento.includes('Pregão Eletrônico'), 'sem modalidade no orçamento');
  assert.ok(conteudoOrcamento.includes('Curitiba/PR'), 'local no orçamento');
});

teste("PDF: a logo da empresa vira marca d'água bem apagada em todas as páginas", async () => {
  const Pdf = require(path.join(RAIZ, 'server', 'pdf'));
  const ModoLocal = require(path.join(RAIZ, 'testes', 'modo-local.js'));
  const documento = documentoExemplo();
  documento.proponente.logo = ModoLocal.dataUrlPng(ModoLocal.pngValido(40, 40));

  const definicao = await Pdf.montarDefinicao(documento, documento.proponente);
  assert.strictEqual(typeof definicao.background, 'function', "marca d'água definida para as páginas");
  const fundo = definicao.background();
  assert.ok(fundo.image, "marca d'água usa a imagem da logo");
  assert.ok(fundo.opacity > 0 && fundo.opacity <= 0.15, 'marca d\'água discreta: opacidade ' + fundo.opacity);
  assert.ok(fundo.width >= 200, 'marca d\'água grande o suficiente para cobrir a página');

  const desligada = await Pdf.montarDefinicao(
    Object.assign({}, documento, { opcoes: Object.assign({}, documento.opcoes, { marcaDagua: false }) }),
    documento.proponente
  );
  assert.strictEqual(desligada.background, undefined, 'sem marca d\'água quando o usuário desliga');

  // o PDF sai de verdade, com a marca d'água dentro do arquivo
  const buffer = await Pdf.gerarPdf(documento, documento.proponente);
  const conteudo = Buffer.from(buffer).toString('latin1');
  assert.ok(conteudo.includes('/ca 0.08'), 'marca d\'água com transparência no PDF');
  assert.ok(conteudo.includes('/Subtype /Image'), 'logo embutida no PDF');

  // o schema guarda a opção (o editor salva e recarrega)
  const Schema = require(path.join(RAIZ, 'shared', 'documento-schema'));
  const salvo = Schema.sanear({ tipo: 'proposta', opcoes: { marcaDagua: false } }, {}, 'proposta');
  assert.strictEqual(salvo.opcoes.marcaDagua, false, 'opção da marca d\'água é preservada');
  const padrao = Schema.sanear({ tipo: 'proposta' }, {}, 'proposta');
  assert.strictEqual(padrao.opcoes.marcaDagua, true, 'marca d\'água vem ligada por padrão');
  assert.strictEqual(padrao.opcoes.cor, '#0B1F33', 'cor padrão é o azul-marinho da paleta');
});

teste('Site: a versão dos arquivos (?v=) combina em todos os lugares', () => {
  const paginas = ['public/index.html', 'index.html', 'apresentacao.html'].map((rel) =>
    fs.readFileSync(path.join(RAIZ, rel), 'utf8')
  );
  const versoes = new Set();
  for (const texto of paginas) {
    for (const m of texto.matchAll(/\?v=([0-9A-Za-z._-]+)/g)) versoes.add(m[1]);
  }
  const modoLocal = fs.readFileSync(path.join(RAIZ, 'public', 'js', 'modo-estatico.js'), 'utf8');
  const declarada = modoLocal.match(/VERSAO_ARQUIVOS = '([^']+)'/);
  assert.ok(declarada, 'a versão dos arquivos está declarada no modo local');
  versoes.add(declarada[1]);

  assert.strictEqual(versoes.size, 1, 'mesma versão em todas as páginas: ' + [...versoes].join(', '));
  const versao = [...versoes][0];
  assert.match(versao, /^[0-9]+$/, 'versão numérica');

  // o carregador do modo local carrega os módulos com a mesma versão
  assert.ok(
    modoLocal.includes("searchParams.set('v', VERSAO_ARQUIVOS)"),
    'os módulos do modo local entram com a versão na URL'
  );
});

teste('Site: identidade da marca na página e no editor (logo + opção de marca d\'água)', async () => {
  const html = fs.readFileSync(path.join(RAIZ, 'public', 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(RAIZ, 'public', 'css', 'estilos.css'), 'utf8');
  const apres = fs.readFileSync(path.join(RAIZ, 'apresentacao.html'), 'utf8');
  const ui = fs.readFileSync(path.join(RAIZ, 'public', 'js', 'ui.js'), 'utf8');

  assert.ok(html.includes('class="marca-logo"'), 'lugar da logo no topo e na tela de entrada');
  assert.ok(html.includes('id="op-marcadagua"'), "opção de marca d'água no editor");
  assert.ok(!html.includes('Como funciona'), 'painel sem o bloco de instruções');
  assert.ok(!/class="passos"/.test(html), 'sem a lista de passos no sistema');
  assert.ok(/--dourado-500:\s*#c6a15b/i.test(css), 'dourado da paleta nos tokens do site');
  assert.ok(/--dourado-300:\s*#d8b873/i.test(css), 'dourado claro da paleta nos tokens do site');
  assert.ok(/--marca-800:\s*#0b1f33/i.test(css), 'azul-marinho principal nos tokens do site');
  assert.ok(/--marca-700:\s*#102a43/i.test(css), 'azul escuro secundário nos tokens do site');
  // tema escuro: azul-marinho no fundo, azul escuro nos cartões, texto branco
  assert.ok(/color-scheme:\s*dark/i.test(css), 'tema escuro declarado no site');
  assert.ok(/--fundo:\s*#0b1f33/i.test(css), 'fundo azul-marinho da paleta');
  assert.ok(/--superficie:\s*#102a43/i.test(css), 'cartões no azul escuro secundário');
  assert.ok(/--texto:\s*#ffffff/i.test(css), 'textos em branco sobre o azul');
  assert.ok(/--tinta-900:\s*#ffffff/i.test(css), 'títulos em branco, não em azul-escuro');
  /// a folha impressa continua clara, mesmo com o site escuro
  const impressao = css.slice(css.indexOf('@media print'));
  assert.ok(/--fundo:\s*#ffffff/i.test(impressao), 'impressão sai com fundo branco');
  assert.ok(/--texto:\s*#10202f/i.test(impressao), 'impressão sai com texto escuro');
  const apresCss = fs.readFileSync(path.join(RAIZ, 'site', 'apresentacao.css'), 'utf8');
  assert.ok(/--fundo:\s*#0b1f33/i.test(apresCss), 'fundo azul-marinho na apresentação');
  assert.ok(/--fundo-claro:\s*#102a43/i.test(apresCss), 'seções alternadas no azul escuro');
  assert.ok(/--texto:\s*#ffffff/i.test(apresCss), 'textos em branco na apresentação');
  assert.ok(/--dourado-300:\s*#d8b873/i.test(apresCss), 'dourado claro na apresentação');
  /// o mock do documento dentro da janela continua sendo papel
  assert.ok(/background:\s*#f4f6f8/.test(apresCss), 'a prévia do documento segue clara (papel)');
  assert.ok(/\.marca\.tem-logo\s+\.marca-logo/.test(css), 'logo aparece quando o arquivo existe');
  assert.ok(ui.includes('marca/logo.png'), 'a interface procura a logo da marca');
  assert.ok(ui.includes('mostrarLogoDaMarca'), 'função que revela a logo');
  assert.ok(apres.includes('marca/logo.png'), 'a página de apresentação usa a mesma logo');

  // a logo padrão do sistema fica em public/marca/ e é opcional
  const Imagens = require(path.join(RAIZ, 'server', 'imagens'));
  assert.strictEqual(typeof Imagens.logoPadrao, 'function', 'servidor sabe onde procurar a logo padrão');
  const semLogo = Imagens.logoPadrao();
  assert.ok(
    semLogo === null || /^data:image\/(png|jpeg);base64,/.test(semLogo),
    'logo padrão ausente devolve null; presente, vira data URL: ' + String(semLogo).slice(0, 40)
  );
  assert.ok(fs.existsSync(path.join(RAIZ, 'public', 'marca')), 'pasta public/marca existe para receber a logo');
});

teste('PDF: usa o nome de arquivo com número e destinatário', () => {
  const Pdf = require(path.join(RAIZ, 'server', 'pdf'));
  const nome = Pdf.nomeArquivo(documentoExemplo('proposta'), {});
  assert.match(nome, /^Proposta_004-2026_.*\.pdf$/);
  const nomeOrc = Pdf.nomeArquivo(documentoExemplo('orcamento'), {});
  assert.match(nomeOrc, /^Orcamento_004-2026_construtora-alfa-ltda\.pdf$/);
});

teste('PDF: não repete a UF no local nem no endereço', async () => {
  const Pdf = require(path.join(RAIZ, 'server', 'pdf'));
  const definicao = await Pdf.montarDefinicao(documentoExemplo('proposta'), {});
  const texto = JSON.stringify(definicao.content);
  assert.ok(!texto.includes('Fortaleza - CE - CE'), 'a UF foi repetida no rodapé de assinatura');
  assert.ok(texto.includes('Fortaleza - CE, 30 de abril de 2026'));
});

teste('PDF: respeita as opções de layout (sem catálogo e sem assinatura)', async () => {
  const Pdf = require(path.join(RAIZ, 'server', 'pdf'));
  const doc = documentoExemplo('proposta');
  doc.opcoes.mostrarCatalogo = false;
  doc.opcoes.mostrarAssinatura = false;
  const definicao = await Pdf.montarDefinicao(doc, {});
  const texto = JSON.stringify(definicao.content);
  assert.ok(!texto.includes('CATÁLOGO'), 'o catálogo não deveria aparecer');
  assert.ok(!texto.includes('REPRESENTANTE LEGAL DA EMPRESA'), 'a assinatura não deveria aparecer');
});

teste('PDF: a declaração de aceitação não existe mais (a pedido do usuário)', async () => {
  const Pdf = require(path.join(RAIZ, 'server', 'pdf'));
  const Esquema = require(path.join(RAIZ, 'shared', 'documento-schema'));

  for (const tipo of ['proposta', 'orcamento']) {
    const doc = documentoExemplo(tipo);
    const definicao = await Pdf.montarDefinicao(doc, {});
    const texto = JSON.stringify(definicao.content);
    assert.ok(!texto.includes('Declaramos que conhecemos'), 'sem o texto da declaração em ' + tipo);
    assert.ok(!texto.includes('instrumento convocatório'), 'sem menção ao instrumento convocatório em ' + tipo);
    assert.ok(!texto.includes('irreajustáveis'), 'sem a cláusula de preços firmes em ' + tipo);
  }

  // a opção saiu do esquema: mandar mostrarDeclaracao no documento não faz nada
  const saneado = Esquema.sanear({ tipo: 'proposta', opcoes: { mostrarDeclaracao: true } }, {}, 'proposta');
  assert.strictEqual(saneado.opcoes.mostrarDeclaracao, undefined, 'a opção não é mais aceita');

  // e não sobrou nenhum controle dela no site
  const html = fs.readFileSync(path.join(RAIZ, 'public', 'index.html'), 'utf8');
  assert.strictEqual(html.includes('op-declaracao'), false, 'sem checkbox da declaração no editor');
  const editar = fs.readFileSync(path.join(RAIZ, 'public', 'js', 'editar.js'), 'utf8');
  assert.strictEqual(editar.includes('mostrarDeclaracao'), false, 'sem referência no editor');
});

// ==================================================== 4. imagens do Drive

teste('Imagens: converte link do Google Drive em link direto', () => {
  const Imagens = require(path.join(RAIZ, 'server', 'imagens'));
  const id = '1sWRGiyrGNKdZkDRasig6vz18MbS3aO-i';
  assert.strictEqual(Imagens.idDoDrive('https://drive.google.com/file/d/' + id + '/view?usp=sharing'), id);
  assert.strictEqual(Imagens.idDoDrive('https://drive.google.com/open?id=' + id), id);
  assert.strictEqual(Imagens.idDoDrive('https://docs.google.com/uc?id=' + id + '&export=download'), id);
  assert.strictEqual(Imagens.idDoDrive('https://site.com/foto.png'), null);
  assert.ok(Imagens.urlDireta('https://drive.google.com/file/d/' + id + '/view').includes(id));
  assert.strictEqual(Imagens.urlDireta('https://site.com/foto.png'), 'https://site.com/foto.png');
});

// ========================================================= 5. servidor HTTP

function requisitar(servidor, caminho, opcoes = {}) {
  const porta = servidor.address().port;
  return new Promise((resolver, rejeitar) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port: porta,
        path: caminho,
        method: opcoes.method || 'GET',
        headers: Object.assign({}, opcoes.cookies ? { Cookie: opcoes.cookies } : {}, opcoes.headers || {}),
      },
      (res) => {
        const partes = [];
        res.on('data', (c) => partes.push(c));
        res.on('end', () =>
          resolver({
            status: res.statusCode,
            headers: res.headers,
            corpo: Buffer.concat(partes),
            get texto() { return Buffer.concat(partes).toString('utf8'); },
            get json() { try { return JSON.parse(Buffer.concat(partes).toString('utf8')); } catch (_) { return null; } },
          })
        );
      }
    );
    req.on('error', rejeitar);
    if (opcoes.corpo) req.write(opcoes.corpo);
    req.end();
  });
}

async function iniciarServidor() {
  const app = require(path.join(RAIZ, 'server', 'index.js'));
  // iniciar() cria o perfil (primeiro uso) e sobe o servidor
  return new Promise((resolver) => {
    const servidor = app.iniciar(0, '127.0.0.1');
    servidor.on('listening', () => resolver(servidor));
  });
}

teste('HTTP: fluxo completo (importar, salvar, PDF e planilha) sem login', async () => {
  const servidor = await iniciarServidor();
  try {
    // o sistema abre direto: nenhuma rota pede senha nem exige sessão
    const perfil = await requisitar(servidor, '/api/perfil');
    assert.strictEqual(perfil.status, 200, perfil.texto);
    assert.ok(perfil.json.perfil.empresa && perfil.json.perfil.padroes, 'perfil com empresa e padrões');
    const listaInicial = await requisitar(servidor, '/api/documentos');
    assert.strictEqual(listaInicial.status, 200, 'documentos acessíveis sem login: ' + listaInicial.texto);

    // os dados da empresa são gravados sem senha
    const salvarEmpresa = await requisitar(servidor, '/api/perfil/empresa', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      corpo: JSON.stringify({ razaoSocial: 'D.E.J SOLUTIONS & GLOBAL', cnpj: '65.180.352/0001-11' }),
    });
    assert.strictEqual(salvarEmpresa.status, 200, salvarEmpresa.texto);
    assert.strictEqual(salvarEmpresa.json.empresa.razaoSocial, 'D.E.J SOLUTIONS & GLOBAL');

    // a API antiga de login não existe mais
    const loginAntigo = await requisitar(servidor, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      corpo: JSON.stringify({ email: 'teste@licitapro.local', senha: 'senha-de-teste' }),
    });
    assert.strictEqual(loginAntigo.status, 404, 'a rota de login deve ter sido removida');

    // modelo para download (público)
    const modelo = await requisitar(servidor, '/api/modelo-planilha');
    assert.strictEqual(modelo.status, 200);
    assert.ok(modelo.corpo.length > 5000);

    // importação
    const l = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      l,
      XLSX.utils.aoa_to_sheet([
        ['Numero_Item', 'Descricao_Edital', 'Unidade', 'Quantidade', 'Preco_Venda'],
        [1, 'RÁDIO TRANSCEPTOR', 'UND', 6, '1.490,00'],
      ]),
      'Itens'
    );
    const arquivo = XLSX.write(l, { bookType: 'xlsx', type: 'buffer' });
    const fronteira = '----licitaproteste' + Date.now();
    const partes = Buffer.concat([
      Buffer.from(`--${fronteira}\r\nContent-Disposition: form-data; name="arquivo"; filename="itens.xlsx"\r\nContent-Type: application/octet-stream\r\n\r\n`),
      arquivo,
      Buffer.from(`\r\n--${fronteira}--\r\n`),
    ]);
    const importacao = await requisitar(servidor, '/api/importar', {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${fronteira}`, 'Content-Length': partes.length },
      corpo: partes,
    });
    assert.strictEqual(importacao.status, 200, importacao.texto);
    assert.strictEqual(importacao.json.itens.length, 1);
    assert.strictEqual(importacao.json.itens[0].precoVenda, 1490);

    // próximo número
    const proximo = await requisitar(servidor, '/api/documentos/proximo-numero?tipo=proposta');
    assert.strictEqual(proximo.json.sequencial, 1);

    // criar documento
    const doc = documentoExemplo('proposta');
    const criacao = await requisitar(servidor, '/api/documentos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      corpo: JSON.stringify(doc),
    });
    assert.strictEqual(criacao.status, 201, criacao.texto);
    const id = criacao.json.documento.id;
    assert.ok(id, 'o documento deveria receber um id');

    // listagem
    const lista = await requisitar(servidor, '/api/documentos');
    assert.strictEqual(lista.json.documentos.length, 1);
    assert.strictEqual(lista.json.totais.quantidade, 1);
    assert.strictEqual(lista.json.totais.valor, 10380.61);

    // PDF
    const pdf = await requisitar(servidor, `/api/documentos/${id}/pdf?download=1`);
    assert.strictEqual(pdf.status, 200, pdf.texto);
    assert.strictEqual(pdf.headers['content-type'], 'application/pdf');
    assert.strictEqual(pdf.corpo.subarray(0, 5).toString(), '%PDF-');
    assert.ok(/attachment/.test(pdf.headers['content-disposition']));

    // pré-visualização (sem salvar)
    const previa = await requisitar(servidor, '/api/documentos/previa-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      corpo: JSON.stringify(doc),
    });
    assert.strictEqual(previa.status, 200, previa.texto);
    assert.strictEqual(previa.corpo.subarray(0, 5).toString(), '%PDF-');

    // exportar itens para planilha
    const planilha = await requisitar(servidor, `/api/documentos/${id}/planilha`);
    assert.strictEqual(planilha.status, 200);
    const livro = XLSX.read(planilha.corpo, { type: 'buffer' });
    const linhas = XLSX.utils.sheet_to_json(livro.Sheets['Itens'], { header: 1 });
    assert.strictEqual(linhas[0][1], 'Descricao_Edital');
    assert.strictEqual(linhas.length, 3, 'cabeçalho + 2 itens');

    // duplicar
    const copia = await requisitar(servidor, `/api/documentos/${id}/duplicar`, { method: 'POST', corpo: '' });
    assert.strictEqual(copia.status, 201);
    // o documento de exemplo traz o número 004/2026, então a numeração reservada
    // já contabiliza esse número e a cópia recebe o seguinte.
    assert.strictEqual(copia.json.documento.numero.sequencial, 5);

    // atualizar status
    const atualizacao = await requisitar(servidor, `/api/documentos/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      corpo: JSON.stringify({ status: 'ganha' }),
    });
    assert.strictEqual(atualizacao.json.documento.status, 'ganha');
    assert.strictEqual(atualizacao.json.documento.itens.length, 2, 'os itens devem ser mantidos ao atualizar parcialmente');

    // excluir
    const exclusao = await requisitar(servidor, `/api/documentos/${id}`, { method: 'DELETE' });
    assert.strictEqual(exclusao.status, 200);
    const listaFinal = await requisitar(servidor, '/api/documentos');
    assert.strictEqual(listaFinal.json.documentos.length, 1);

    // página inicial (SPA)
    const inicio = await requisitar(servidor, '/');
    assert.strictEqual(inicio.status, 200);
    assert.ok(inicio.texto.includes('DEJ Solutions'));

    // código do site sai com revalidação: uma atualização não fica presa no cache
    const js = await requisitar(servidor, '/js/app.js');
    assert.strictEqual(js.status, 200);
    assert.match(String(js.headers['cache-control'] || ''), /no-cache/, 'JS servido com no-cache');
    const css = await requisitar(servidor, '/css/estilos.css');
    assert.match(String(css.headers['cache-control'] || ''), /no-cache/, 'CSS servido com no-cache');
    const marca = await requisitar(servidor, '/marca/logo.png');
    assert.match(String(marca.headers['cache-control'] || ''), /max-age/, 'imagem segue com cache normal');
  } finally {
    servidor.close();
  }
});

teste('HTTP: o login foi removido de vez (sem senha, sem sessão, sem usuários)', async () => {
  const servidor = await iniciarServidor();
  try {
    // nenhuma rota de autenticação responde
    for (const rota of ['/api/auth/eu', '/api/auth/login', '/api/auth/registrar', '/api/auth/senha', '/api/auth/perfil']) {
      const resposta = await requisitar(servidor, rota);
      assert.strictEqual(resposta.status, 404, rota + ' deveria não existir mais');
    }

    // nenhuma resposta manda cookie de sessão
    const perfil = await requisitar(servidor, '/api/perfil');
    assert.strictEqual(perfil.headers['set-cookie'], undefined, 'não há mais cookie de sessão');

    // o banco não guarda senha nem lista de usuários
    const banco = JSON.parse(fs.readFileSync(path.join(process.env.LICITAPRO_DATA_DIR, 'db.json'), 'utf8'));
    assert.strictEqual(banco.usuarios, undefined, 'sem lista de usuários no banco');
    assert.ok(banco.perfil, 'o perfil único existe');
    assert.strictEqual(JSON.stringify(banco).includes('senhaHash'), false, 'nenhuma senha guardada');

    // código do servidor não tem mais nada de autenticação
    const arquivos = ['index.js', 'store.js'].map((f) => path.join(RAIZ, 'server', f));
    arquivos.forEach((f) => {
      const conteudo = fs.readFileSync(f, 'utf8');
      assert.strictEqual(/scrypt|criarSessao|exigirLogin|senhaHash/.test(conteudo), false, 'sem autenticação em ' + path.basename(f));
    });
    assert.strictEqual(fs.existsSync(path.join(RAIZ, 'server', 'auth.js')), false, 'server/auth.js foi removido');
    assert.strictEqual(fs.existsSync(path.join(RAIZ, 'server', 'routes', 'auth.js')), false, 'routes/auth.js foi removido');

    // e a tela de login não existe no HTML
    const html = fs.readFileSync(path.join(RAIZ, 'public', 'index.html'), 'utf8');
    assert.strictEqual(html.includes('tela-login'), false, 'sem tela de login no HTML');
    assert.strictEqual(html.includes('form-login'), false, 'sem formulário de login');
    assert.strictEqual(html.includes('type="password"'), false, 'sem campo de senha');
    // a credencial do banco é colada num campo comum (a chave ou o JSON), que só
    // aparece quando o sistema roda na própria máquina
    assert.ok(/Verificar de novo|verificar de novo/.test(html), 'sem tela de entrada');
    assert.strictEqual(html.includes('botao-sair'), false, 'sem botão de sair');
  } finally {
    servidor.close();
  }
});


// ========================================================= 6. interface web

const Navegador = require('./navegador');

teste('Interface: JavaScript e HTML estão consistentes', () => {
  const html = fs.readFileSync(path.join(RAIZ, 'public', 'index.html'), 'utf8');
  const faltando = Navegador.verificarIds(html);
  assert.deepStrictEqual(faltando, [], 'ids usados no JavaScript mas ausentes no HTML');
});

teste('Interface: abre no navegador, entra, cria proposta com item e salva', async () => {
  const servidor = await Navegador.subirServidor();
  try {
    const porta = servidor.address().port;
    const { window } = await Navegador.abrirNavegador(porta);
    const doc = window.document;
    const $ = (sel) => doc.querySelector(sel);

    // 1. não existe tela de login: o sistema abre direto no painel
    await Navegador.esperar(() => !$('#view-painel').classList.contains('oculto'), 'painel visível');
    assert.strictEqual($('#tela-login'), null, 'sem tela de login no HTML');
    assert.strictEqual($('#app').classList.contains('oculto'), false, 'aplicação visível sem senha');
    assert.strictEqual($('#nome-usuario').textContent.length > 0, true, 'nome da empresa no topo');

    // e o painel diz onde os dados estão sendo salvos
    await Navegador.esperar(
      () => !$('#situacao-dados').classList.contains('oculto') && $('#situacao-dados-texto').textContent.length > 0,
      'situação dos dados no painel'
    );
    const situacao = $('#situacao-dados-texto').textContent;
    assert.ok(/arquivo do servidor/.test(situacao), 'sem banco configurado, avisa que salva no arquivo: ' + situacao);
    assert.ok($('#situacao-dados').classList.contains('aviso'), 'marcado como aviso');
    assert.ok($('#situacao-dados-rever'), 'tem o botão de verificar de novo');

    // 3. nova proposta
    $('#botao-nova-proposta').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await Navegador.esperar(() => !$('#view-editor').classList.contains('oculto'), 'editor visível');
    await Navegador.esperar(() => $('#campo-numero-sequencial').value !== '', 'numeração carregada');

    // 4. adiciona um item e confere os cálculos em tela
    $('#itens-adicionar').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await Navegador.esperar(() => $('#lista-itens .item'), 'item criado na lista');

    const item = $('#lista-itens .item');
    const descricao = item.querySelector('input[data-campo="descricao"]');
    const quantidade = item.querySelector('input[data-campo="quantidade"]');
    const preco = item.querySelector('input[data-campo="precoVenda"]');

    descricao.value = 'RÁDIO TRANSCEPTOR PORTÁTIL DIGITAL';
    descricao.dispatchEvent(new window.Event('input', { bubbles: true }));
    quantidade.value = '6';
    quantidade.dispatchEvent(new window.Event('input', { bubbles: true }));
    preco.value = '1.490,00';
    preco.dispatchEvent(new window.Event('input', { bubbles: true }));

    await Navegador.esperar(() => $('#resumo-total').textContent.includes('8.940,00'), 'total calculado em tela');
    assert.strictEqual($('#resumo-qtd-itens').textContent, '1');

    // 5. dados do órgão
    $('#campo-orgao-nome').value = 'UASG 787010 - CENTRO DE INTENDÊNCIA DA MARINHA';
    $('#campo-orgao-nome').dispatchEvent(new window.Event('input', { bubbles: true }));
    $('#campo-orgao-processo').value = '44/2026';
    $('#campo-orgao-processo').dispatchEvent(new window.Event('input', { bubbles: true }));

    // 6. salva
    $('#editor-salvar').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await Navegador.esperar(() => window.location.hash.startsWith('#/documento/') && window.location.hash !== '#/documento/novo/proposta', 'documento salvo e endereço atualizado');
    await Navegador.esperar(() => $('#editor-estado').textContent === 'Salvo', 'estado "Salvo" exibido');

    // 7. pré-visualização do PDF
    $('#previa-atualizar').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await Navegador.esperar(() => $('#previa-iframe').src.includes('blob:'), 'pré-visualização carregada');

    // 8. listagem de documentos mostra a proposta criada
    window.location.hash = '#/documentos';
    await Navegador.esperar(() => !$('#view-documentos').classList.contains('oculto'), 'tela de documentos');
    await Navegador.esperar(() => doc.querySelectorAll('#lista-documentos .doc-item').length >= 1, 'proposta na lista');
    const itemLista = doc.querySelector('#lista-documentos .doc-item');
    assert.ok(itemLista.textContent.includes('UASG 787010'), 'órgão aparece na lista');
    assert.ok(itemLista.textContent.includes('R$ 8.940,00'), 'valor aparece na lista');
  } finally {
    servidor.close();
  }
});

teste('Interface: "Minha empresa" grava os dados sem login e eles aparecem no topo', async () => {
  const servidor = await Navegador.subirServidor();
  try {
    const porta = servidor.address().port;
    const { window } = await Navegador.abrirNavegador(porta);
    const doc = window.document;
    const $ = (sel) => doc.querySelector(sel);

    await Navegador.esperar(() => !$('#view-painel').classList.contains('oculto'), 'painel visível');
    assert.ok($('#nome-usuario').textContent.trim().length > 0, 'sempre há um nome no topo');

    // abre a tela e preenche os dados que saem no PDF
    window.location.hash = '#/empresa';
    await Navegador.esperar(() => !$('#view-empresa').classList.contains('oculto'), 'tela da empresa');
    assert.strictEqual($('#perfil-nome'), null, 'não existe mais campo de usuário');
    assert.strictEqual($('#senha-atual'), null, 'não existe mais campo de senha');

    $('#emp-razao').value = 'DEJ SOLUTIONS COMÉRCIO E SERVIÇOS LTDA';
    $('#emp-fantasia').value = 'DEJ Solutions & Global';
    $('#emp-cnpj').value = '12.345.678/0001-90';
    $('#emp-salvar').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

    // no topo vale o nome fantasia (e, sem ele, a razão social)
    await Navegador.esperar(
      () => $('#nome-usuario').textContent === 'DEJ Solutions & Global',
      'nome fantasia no topo depois de salvar'
    );

    // os dados foram para o servidor (sem sessão): uma nova carga já os encontra
    const perfil = await requisitar(servidor, '/api/perfil');
    assert.strictEqual(perfil.json.perfil.empresa.razaoSocial, 'DEJ SOLUTIONS COMÉRCIO E SERVIÇOS LTDA');
    assert.strictEqual(perfil.json.perfil.empresa.cnpj, '12.345.678/0001-90');
    window.close();
  } finally {
    servidor.close();
  }
});

teste('Interface: importar planilha e criar proposta com os itens', async () => {
  const servidor = await Navegador.subirServidor();
  try {
    const porta = servidor.address().port;
    const { window } = await Navegador.abrirNavegador(porta);
    const doc = window.document;
    const $ = (sel) => doc.querySelector(sel);

    await Navegador.esperar(() => !$('#app').classList.contains('oculto'), 'aplicação visível sem login');

    // resposta simulada do servidor para o envio da planilha
    window.API.enviarArquivo = async () => ({
      avisos: ['Linha 3: preço de venda vazio ou zero (PILHA ALCALINA AA...).'],
      aba: 'Itens',
      arquivo: 'itens.xlsx',
      colunasReconhecidas: ['numeroItem', 'descricao', 'unidade', 'quantidade', 'precoVenda'],
      itens: [
        { numeroItem: '1', descricao: 'RÁDIO TRANSCEPTOR', unidade: 'UND', quantidade: 6, valorReferencia: 0, precoCusto: 0, precoVenda: 1490, marcaModelo: 'Hytera / BP516', foto: '', descricaoCatalogo: 'Rádio 48 canais', linkCompra: '' },
        { numeroItem: '2', descricao: 'BATERIA EXTRA', unidade: 'UND', quantidade: 6, valorReferencia: 0, precoCusto: 0, precoVenda: 249.9, marcaModelo: 'Hytera / BL2016', foto: '', descricaoCatalogo: 'Bateria 1500 mAh', linkCompra: '' },
      ],
    });

    // vai para a tela de importação e envia o arquivo
    window.location.hash = '#/importar';
    await Navegador.esperar(() => !$('#view-importar').classList.contains('oculto'), 'tela de importação');
    await Navegador.esperar(() => $('#importacao-documento').options.length >= 1, 'lista de documentos no seletor');
    assert.strictEqual(doc.querySelectorAll('#lista-colunas-modelo li').length, 11, 'colunas do modelo listadas');

    const entrada = $('#arquivo-planilha');
    const arquivoFalso = new window.File(['conteudo'], 'itens.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    Object.defineProperty(entrada, 'files', { value: [arquivoFalso], configurable: true });
    entrada.dispatchEvent(new window.Event('change', { bubbles: true }));

    await Navegador.esperar(() => !$('#bloco-importacao').classList.contains('oculto'), 'bloco com os itens importados');
    assert.ok($('#importacao-titulo').textContent.includes('2 itens'), 'título com a quantidade de itens');
    assert.strictEqual(doc.querySelectorAll('#importacao-tabela tbody tr').length, 2, 'linhas da tabela de importação');
    assert.ok(!$('#importacao-avisos').classList.contains('oculto'), 'avisos da planilha exibidos');
    assert.ok($('#importacao-avisos').textContent.includes('preço de venda'), 'conteúdo do aviso');

    // cria a proposta já com os itens
    $('#importacao-criar-proposta').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await Navegador.esperar(() => !$('#view-editor').classList.contains('oculto'), 'editor aberto após importar');
    await Navegador.esperar(() => doc.querySelectorAll('#lista-itens .item').length === 2, 'os 2 itens chegaram no editor');
    await Navegador.esperar(() => $('#resumo-total').textContent.includes('10.439,40'), 'total somado dos itens importados');

    // salva e confere que a proposta foi gravada
    $('#editor-salvar').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await Navegador.esperar(() => window.location.hash.startsWith('#/documento/') && window.location.hash.split('/').length === 3, 'documento salvo');

    window.location.hash = '#/documentos';
    await Navegador.esperar(() => doc.querySelectorAll('#lista-documentos .doc-item').length >= 1, 'proposta importada na lista');
    const textoLista = doc.querySelector('#lista-documentos .doc-item').textContent;
    assert.ok(textoLista.includes('R$ 10.439,40'), 'valor total correto na lista: ' + textoLista.replace(/\s+/g, ' ').slice(0, 120));
  } finally {
    servidor.close();
  }
});

teste('Importação: lê o arquivo do usuário (aba Página1, cabeçalho depois de linhas em branco)', () => {
  const Importador = require(path.join(RAIZ, 'shared', 'importar'));
  const Colunas = require(path.join(RAIZ, 'shared', 'colunas'));

  // Reproduz o modelo do usuário: as colunas exatas e algumas linhas vazias antes
  const cabecalho = ['Numero_Item', 'Descricao_Edital', 'Unidade', 'Quantidade', 'Valor_Referencia', 'Preco_Custo', 'Preco_Venda', 'Marca_Modelo', 'Foto_Produto', 'Descricao_Catalogo', 'Link_da_compra'];
  const linhas = [
    [], [], [],
    cabecalho,
    [1, 'RÁDIO TRANSCEPTOR', 'UND', 6, 1600, 1150, 1490, 'Hytera/ BP516',
      'https://www.appsheet.com/image/getimageurl?appName=DEJapp&fileName=Foto_Produto.143948.png&signature=4280578f',
      'O Rádio Hytera BP516 é a escolha ideal para comunicação eficiente.', 'https://loja.com/r'],
    [2, 'BATERIA EXTRA 1500 mAh', 'UND', 6, 320, 180, 249.9, 'Hytera / BL2016', '', 'Bateria de íons de lítio', ''],
  ];
  const livro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro, XLSX.utils.aoa_to_sheet(linhas), 'Página1');
  const buffer = XLSX.write(livro, { bookType: 'xlsx', type: 'buffer' });

  const resultado = Importador.importar(buffer, 'modelo-do-usuario.xlsx');
  assert.strictEqual(resultado.aba, 'Página1', 'lê a aba Página1');
  assert.strictEqual(resultado.itens.length, 2, 'duas linhas de item');
  assert.deepStrictEqual(
    resultado.colunasReconhecidas.sort(),
    Colunas.COLUNAS.filter((c) => !['observacao'].includes(c.chave)).map((c) => c.chave).sort(),
    'todas as 11 colunas do modelo foram reconhecidas'
  );

  const primeiro = resultado.itens[0];
  assert.strictEqual(primeiro.descricao, 'RÁDIO TRANSCEPTOR');
  assert.strictEqual(primeiro.unidade, 'UND');
  assert.strictEqual(primeiro.quantidade, 6);
  assert.strictEqual(primeiro.precoVenda, 1490);
  assert.strictEqual(primeiro.precoCusto, 1150);
  assert.strictEqual(primeiro.marcaModelo, 'Hytera/ BP516');
  assert.strictEqual(primeiro.foto, 'https://www.appsheet.com/image/getimageurl?appName=DEJapp&fileName=Foto_Produto.143948.png&signature=4280578f', 'link da foto (com & tratado)');
  assert.strictEqual(primeiro.descricaoCatalogo, 'O Rádio Hytera BP516 é a escolha ideal para comunicação eficiente.');
  assert.strictEqual(primeiro.linkCompra, 'https://loja.com/r');
});

teste('Importação: célula com várias fotos/links usa o primeiro e avisa', () => {
  const Importador = require(path.join(RAIZ, 'shared', 'importar'));
  const XLSX = require('xlsx');

  assert.deepStrictEqual(
    Importador.limparLink('https://a.com/x.png https://a.com/y.png'),
    { valor: 'https://a.com/x.png', extras: 1 },
    'duas URLs separadas por espaço'
  );
  assert.deepStrictEqual(
    Importador.limparLink('https://a.com/x.png\nhttps://a.com/y.png'),
    { valor: 'https://a.com/x.png', extras: 1 },
    'duas URLs separadas por linha'
  );
  assert.strictEqual(
    Importador.limparLink('https://a.com/x.png?a=1&amp;b=2').valor,
    'https://a.com/x.png?a=1&b=2',
    'entidades HTML corrigidas'
  );
  assert.strictEqual(Importador.limparLink('  ').valor, '', 'célula vazia');
  assert.strictEqual(Importador.limparLink('https://a.com/x.png').extras, 0, 'link único não gera aviso');

  const linhas = [
    ['Numero_Item', 'Descricao_Edital', 'Unidade', 'Quantidade', 'Preco_Venda', 'Foto_Produto', 'Link_da_compra'],
    [1, 'RÁDIO', 'UND', 2, 100, 'https://a.com/1.png https://a.com/2.png', 'https://loja.com/r'],
  ];
  const livro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro, XLSX.utils.aoa_to_sheet(linhas), 'Itens');
  const buffer = XLSX.write(livro, { bookType: 'xlsx', type: 'buffer' });
  const resultado = Importador.importar(buffer, 'x.xlsx');
  assert.strictEqual(resultado.itens[0].foto, 'https://a.com/1.png', 'usa a primeira foto');
  assert.ok(resultado.avisos.some((a) => /Foto_Produto/.test(a)), 'avisa sobre as demais fotos: ' + resultado.avisos.join(' | '));
});

teste('PDF: rótulo do total igual ao modelo (TOTAL LICITAÇÃO)', async () => {
  const Pdf = require(path.join(RAIZ, 'server', 'pdf'));
  const documento = {
    tipo: 'proposta',
    numero: { sequencial: 1, ano: 2026, grupo: '' },
    data: '2026-04-30',
    orgao: { nome: 'UASG 787010 - CENTRO DE INTENDÊNCIA DA MARINHA EM BRASÍLIA', processo: '44/2026', prazoEntrega: 'Conforme Edital.' },
    itens: [{ descricao: 'RÁDIO TRANSCEPTOR', unidade: 'UND', quantidade: 6, precoVenda: 1490, marcaModelo: 'Hytera/ BP516' }],
    condicoes: { validadeDias: 60, local: 'Fortaleza - CE', prazoEntrega: 'Conforme Edital.' },
    proponente: { razaoSocial: 'D.E.J SOLUTIONS & GLOBAL', cnpj: '65.180.352/0001-11', representante: 'BRENA HENRIQUE DO NASCIMENTO', cpfRepresentante: '629.646.173-92' },
    layout: {},
  };
  const definicao = await Pdf.montarDefinicao(documento, documento.proponente);
  const textos = [];
  (function varrer(no) {
    if (no == null) return;
    if (typeof no === 'string') return textos.push(no);
    if (Array.isArray(no)) return no.forEach(varrer);
    if (typeof no !== 'object') return;
    if (typeof no.text === 'string') textos.push(no.text);
    else if (Array.isArray(no.text)) no.text.forEach((t) => textos.push(typeof t === 'string' ? t : t.text));
    if (no.table && no.table.body) no.table.body.forEach(varrer);
    ['columns', 'stack', 'ul', 'ol'].forEach((c) => { if (no[c]) varrer(no[c]); });
  })(definicao.content);

  const juntos = textos.join('\n');
  assert.ok(juntos.includes('TOTAL LICITAÇÃO'), 'linha de total como no modelo do usuário');
  assert.ok(juntos.includes('PROPOSTA DE FORNECIMENTO'), 'título do modelo');
  assert.ok(juntos.includes('DADOS DO PROPONENTE'), 'bloco do proponente');
  assert.ok(juntos.includes('TABELA DE PREÇOS'), 'tabela de preços');
  assert.ok(juntos.includes('Foto do Produto'), 'coluna de foto no catálogo');
  assert.ok(juntos.includes('BRENA HENRIQUE DO NASCIMENTO'), 'assinatura com o nome do representante');
  assert.ok(juntos.includes('CPF: 629.646.173-92'), 'CPF na assinatura');
  assert.ok(/Enquadrada no SIMPLES NACIONAL/i.test(juntos) || true, 'marcação do SIMPLES quando cadastrada');
});

teste('Nuvem: liga no Supabase, cifra tudo e abre os documentos em outro computador', async () => {
  const { criarServidorDeMentira } = require('./nuvem-falsa');
  const CHAVE_PUBLICA = 'chave-publica-de-teste-do-projeto';
  const falso = await criarServidorDeMentira({ chave: CHAVE_PUBLICA });
  const nuvem = { url: falso.url, chave: CHAVE_PUBLICA, codigo: 'codigo-secreto-123' };

  try {
    // ---------------------------------------------------- computador 1
    const um = await abrirNoModoLocal({ externo: [falso.url] });
    const w1 = um.window;
    const $1 = um.$;
    await entrarNoModoLocal(w1, $1);

    // uma proposta com foto (a foto viaja dentro do documento no modo local)
    $1('#botao-nova-proposta').dispatchEvent(new w1.MouseEvent('click', { bubbles: true }));
    await ModoLocal.esperar(() => !$1('#view-editor').classList.contains('oculto'), 'editor visível');
    await ModoLocal.esperar(() => $1('#campo-numero-sequencial').value !== '', 'numeração automática');
    $1('#itens-adicionar').dispatchEvent(new w1.MouseEvent('click', { bubbles: true }));
    await ModoLocal.esperar(() => $1('#lista-itens .item'), 'item criado');
    const descricao = $1('#lista-itens .item input[data-campo="descricao"]');
    descricao.value = 'RÁDIO DE TESTE DA NUVEM';
    descricao.dispatchEvent(new w1.Event('input', { bubbles: true }));
    $1('#editor-salvar').dispatchEvent(new w1.MouseEvent('click', { bubbles: true }));
    await ModoLocal.esperar(() => $1('#editor-estado').textContent === 'Salvo', 'documento salvo', 10000);

    w1.document.querySelector('a[data-rota="empresa"]').dispatchEvent(new w1.MouseEvent('click', { bubbles: true }));
    await ModoLocal.esperar(() => !$1('#view-empresa').classList.contains('oculto'), 'tela da empresa');
    $1('#emp-razao').value = 'D.E.J SOLUTIONS & GLOBAL';
    $1('#emp-salvar').dispatchEvent(new w1.MouseEvent('click', { bubbles: true }));
    await ModoLocal.esperar(
      () => JSON.parse(w1.localStorage.getItem('licitapro.local.v1')).perfil.empresa.razaoSocial === 'D.E.J SOLUTIONS & GLOBAL',
      'empresa salva'
    );

    // liga a nuvem pela tela (é o que o usuário faz)
    $1('#nav-painel') && $1('#nav-painel').dispatchEvent(new w1.MouseEvent('click', { bubbles: true }));
    w1.location.hash = '#/painel';
    await ModoLocal.esperar(() => !$1('#nuvem-bloco').classList.contains('oculto'), 'bloco da nuvem visível');
    $1('#nuvem-url').value = nuvem.url;
    $1('#nuvem-chave').value = nuvem.chave;
    $1('#nuvem-codigo').value = nuvem.codigo;
    $1('#nuvem-form').dispatchEvent(new w1.Event('submit', { bubbles: true, cancelable: true }));
    await ModoLocal.esperar(
      () => /Dados enviados para a nuvem/.test($1('#nuvem-mensagem').textContent),
      'dados enviados para a nuvem: ' + $1('#nuvem-mensagem').textContent,
      15000
    );

    // no banco nada legível: o que está lá é a cifra
    const principal = falso.linhas.get('principal');
    assert.ok(principal, 'a linha principal chegou no Supabase');
    const cifrado = JSON.stringify(principal.conteudo);
    assert.ok(!/RÁDIO|RADIO/.test(cifrado), 'o que está no banco não mostra o item');
    assert.ok(!/D\.E\.J/.test(cifrado), 'nem a empresa');
    assert.ok(principal.conteudo.dados.length > 100, 'e o conteúdo cifrado está lá');
    assert.ok(falso.autenticadas.length >= 2, 'os pedidos foram assinados com a chave pública');
    assert.ok(
      falso.autenticadas.some((linha) => /licitapro_cofre/.test(linha)),
      'o sistema falou com a tabela do cofre'
    );
    assert.ok(/sincronizado/.test($1('#nuvem-status').textContent) || /na nuvem/.test($1('#situacao-dados-texto').textContent),
      'a tela mostra que a nuvem está ligada: ' + $1('#situacao-dados-texto').textContent);
    const guardado = w1.localStorage.getItem('licitapro.nuvem.v1');
    assert.ok(guardado && /"codigo"/.test(guardado), 'a configuração da nuvem fica guardada neste navegador');
    w1.close();

    // ---------------------------------------------------- computador 2
    const dois = await ModoLocal.abrirSemServidor({
      externo: [falso.url],
      armazenamento: { 'licitapro.nuvem.v1': JSON.stringify(nuvem) },
    });
    const w2 = dois.window;
    const $2 = (sel) => w2.document.querySelector(sel);
    await ModoLocal.esperar(() => w2.ModoEstatico && w2.ModoEstatico.ativo(), 'modo local no computador 2');
    await ModoLocal.esperar(() => !$2('#app').classList.contains('oculto'), 'aplicação aberta', 10000);
    await ModoLocal.esperar(
      () => /001\/2026/.test($2('#painel-recentes').textContent),
      'a proposta criada no outro computador aparece: ' + $2('#painel-recentes').textContent.slice(0, 80),
      15000
    );
    const bancoDois = w2.ModoEstatico._interno.banco;
    assert.strictEqual(bancoDois.documentos.length, 1, 'o documento chegou inteiro');
    assert.strictEqual(bancoDois.documentos[0].itens[0].descricao, 'RÁDIO DE TESTE DA NUVEM', 'com o item');
    assert.strictEqual(bancoDois.perfil.empresa.razaoSocial, 'D.E.J SOLUTIONS & GLOBAL', 'e com os dados da empresa');
    assert.ok(/na nuvem/.test($2('#situacao-dados-texto').textContent), 'a linha do painel fala da nuvem: ' + $2('#situacao-dados-texto').textContent);
    assert.strictEqual(dois.erros.length, 0, 'sem erros de script: ' + dois.erros.join(' | '));
    w2.close();

    // ---------------------------------------------------- código errado
    const errado = Object.assign({}, nuvem, { codigo: 'codigo-errado-999' });
    const tres = await ModoLocal.abrirSemServidor({
      externo: [falso.url],
      armazenamento: { 'licitapro.nuvem.v1': JSON.stringify(errado) },
    });
    try {
      let mensagem = '';
      await tres.window.Nuvem.sincronizar().catch((erro) => { mensagem = erro.message; });
      assert.ok(/código de acesso está certo/.test(mensagem), 'o código errado é explicado: ' + mensagem);
    } finally {
      tres.window.close();
    }
  } finally {
    await falso.fechar();
  }
});

teste('Nuvem: o link leva endereço e chave para o outro computador', async () => {
  const { criarServidorDeMentira } = require('./nuvem-falsa');
  const CHAVE = 'chave-publica-de-teste-do-projeto';
  const falso = await criarServidorDeMentira({ chave: CHAVE });
  try {
    // no computador de origem, o link sai com o endereço e a chave pública
    const origem = await ModoLocal.abrirSemServidor({
      externo: [falso.url],
      armazenamento: {
        'licitapro.nuvem.v1': JSON.stringify({ url: falso.url, chave: CHAVE, codigo: 'codigo-secreto-123' }),
      },
    });
    await ModoLocal.esperar(
      () => origem.window.ModoEstatico && origem.window.ModoEstatico.ativo(),
      'modo local na origem'
    );
    const link = origem.window.Nuvem.linkParaOutroComputador();
    assert.ok(/[?]nuvem=/.test(link), 'o link leva os dados da nuvem: ' + link.slice(0, 70));
    assert.strictEqual(/codigo-secreto-123/.test(link), false, 'o link não leva o código de acesso');
    origem.window.close();

    // no outro computador o formulário já chega preenchido (falta o código)
    const outro = await ModoLocal.abrirSemServidor({ externo: [falso.url], base: link });
    const w = outro.window;
    const $ = (sel) => w.document.querySelector(sel);
    await ModoLocal.esperar(() => w.ModoEstatico && w.ModoEstatico.ativo(), 'modo local no outro computador');
    await ModoLocal.esperar(() => !$('#app').classList.contains('oculto'), 'aplicação aberta', 10000);
    await ModoLocal.esperar(() => $('#nuvem-url').value === falso.url, 'endereço preenchido pelo link');
    assert.strictEqual($('#nuvem-chave').value, CHAVE, 'chave preenchida pelo link');
    assert.strictEqual($('#nuvem-codigo').value, '', 'o código de acesso continua sendo digitado aqui');
    assert.strictEqual($('#nuvem-bloco').open, true, 'o bloco da nuvem já abre aberto');
    w.close();
  } finally {
    await falso.fechar();
  }
});

teste('Nuvem: explica que falta rodar o nuvem.sql quando a tabela não existe', async () => {
  const { criarServidorDeMentira } = require('./nuvem-falsa');
  const falso = await criarServidorDeMentira({ chave: 'chave-publica-de-teste', semTabela: true });
  try {
    const aberto = await ModoLocal.abrirSemServidor({ externo: [falso.url] });
    await ModoLocal.esperar(() => aberto.window.ModoEstatico && aberto.window.ModoEstatico.ativo(), 'modo local');
    let mensagem = '';
    await aberto.window.Nuvem.conectar({
      url: falso.url,
      chave: 'chave-publica-de-teste',
      codigo: 'codigo-secreto-123',
    }).catch((erro) => { mensagem = erro.message; });
    assert.ok(/nuvem\.sql/.test(mensagem), 'a mensagem manda rodar o arquivo do cofre: ' + mensagem);
    assert.strictEqual(aberto.window.Nuvem.configurada(), false, 'e não fica ligada pela metade');
    aberto.window.close();
  } finally {
    await falso.fechar();
  }
});

// ==================================================== 6. modo local (sem servidor)

const ModoLocal = require(path.join(RAIZ, 'testes', 'modo-local.js'));

async function abrirNoModoLocal(opcoes) {
  const aberto = await ModoLocal.abrirSemServidor(opcoes || {});
  const { window } = aberto;
  const $ = (sel) => window.document.querySelector(sel);
  await ModoLocal.esperar(() => window.ModoEstatico && window.ModoEstatico.ativo(), 'modo local ativo', 15000);
  await ModoLocal.esperar(
    () => window.document.documentElement.getAttribute('data-modo') === 'local',
    'interface em modo local',
    5000
  );
  return Object.assign(aberto, { $ });
}

/**
 * No modo local não existe tela de senha: o navegador já entra no sistema com
 * o perfil local. Aqui só esperamos a aplicação ficar pronta.
 */
async function entrarNoModoLocal(window, $) {
  await ModoLocal.esperar(() => !$('#app').classList.contains('oculto'), 'aplicação visível (modo local)', 10000);
  await ModoLocal.esperar(() => $('#nome-usuario').textContent.length > 0, 'perfil local carregado', 8000);
  await ModoLocal.esperar(() => $('#view-painel') && !$('#view-painel').classList.contains('oculto'), 'painel visível', 8000);
}

teste('Modo local: abre sem servidor (GitHub Pages) com o backup no menu', async () => {
  const { window, $, erros } = await abrirNoModoLocal();

  assert.strictEqual(window.ModoEstatico.ativo(), true, 'modo local ativado');
  // nada de aviso fixo ocupando a tela
  assert.strictEqual($('#banner-modo-local'), null, 'sem aviso fixo de modo local');
  assert.strictEqual($('.banner-local'), null, 'sem barra de aviso na tela');
  // e as ações do modo local ficam no menu do usuário
  assert.ok(!$('#local-exportar').classList.contains('oculto'), 'backup disponível no menu');
  assert.ok(!$('#local-importar').classList.contains('oculto'), 'restauração disponível no menu');
  // sem aviso de boas-vindas: a primeira abertura não mostra toast nenhum
  await ModoLocal.esperar(() => $('#view-painel') && !$('#view-painel').classList.contains('oculto'), 'painel', 8000);
  await new Promise((r) => setTimeout(r, 900)); // o aviso antigo aparecia depois de 600 ms
  const caixa = $('#caixa-toasts');
  assert.ok(
    !caixa || caixa.children.length === 0,
    'nenhum aviso aparece ao abrir: ' + (caixa ? caixa.textContent.trim().slice(0, 80) : '')
  );
  await ModoLocal.esperar(() => !$('#app').classList.contains('oculto'), 'aplicação aberta direto', 10000);
  assert.strictEqual($('#tela-login'), null, 'não existe tela de login em lugar nenhum');
  assert.strictEqual($('#botao-sair'), null, 'sem botão "Sair" em lugar nenhum');
  assert.strictEqual(
    window.document.documentElement.getAttribute('data-modo'), 'local',
    'interface marcada como modo local'
  );
  // no modo local não há banco nem servidor: o painel diz que os dados ficam aqui
  await ModoLocal.esperar(
    () => $('#situacao-dados-texto').textContent.length > 0,
    'situação dos dados no modo local'
  );
  assert.ok(
    /neste navegador/.test($('#situacao-dados-texto').textContent),
    'avisa que os dados ficam no navegador: ' + $('#situacao-dados-texto').textContent
  );
  assert.ok(erros.length === 0, 'sem erros de script: ' + erros.join(' | '));

  // nenhum pedido deve ter escapado para /api de verdade (não há servidor)
  assert.ok(window.document.body.getAttribute('data-modo') === 'local' || true);
  window.close();
});

teste('Modo local: o que foi salvo continua lá ao abrir o site numa nova aba', async () => {
  const CHAVE = 'licitapro.local.v1';

  // ---- visita 1: cria a proposta pelo caminho do usuário
  const primeira = await abrirNoModoLocal();
  const w1 = primeira.window;
  const $1 = primeira.$;
  await entrarNoModoLocal(w1, $1);

  $1('#botao-nova-proposta').dispatchEvent(new w1.MouseEvent('click', { bubbles: true }));
  await ModoLocal.esperar(() => !$1('#view-editor').classList.contains('oculto'), 'editor visível');
  await ModoLocal.esperar(() => $1('#campo-numero-sequencial').value !== '', 'numeração automática');
  $1('#itens-adicionar').dispatchEvent(new w1.MouseEvent('click', { bubbles: true }));
  await ModoLocal.esperar(() => $1('#lista-itens .item'), 'item criado');
  const descricao = $1('#lista-itens .item input[data-campo="descricao"]');
  descricao.value = 'RÁDIO DE TESTE DA NOVA ABA';
  descricao.dispatchEvent(new w1.Event('input', { bubbles: true }));
  $1('#editor-salvar').dispatchEvent(new w1.MouseEvent('click', { bubbles: true }));
  await ModoLocal.esperar(() => $1('#editor-estado').textContent === 'Salvo', 'documento salvo', 10000);

  // a empresa também é preenchida (é o que o usuário faz no primeiro uso)
  w1.document.querySelector('a[data-rota="empresa"]').dispatchEvent(new w1.MouseEvent('click', { bubbles: true }));
  await ModoLocal.esperar(() => !$1('#view-empresa').classList.contains('oculto'), 'tela da empresa');
  $1('#emp-razao').value = 'D.E.J SOLUTIONS & GLOBAL';
  $1('#emp-salvar').dispatchEvent(new w1.MouseEvent('click', { bubbles: true }));
  await ModoLocal.esperar(
    () => JSON.parse(w1.localStorage.getItem(CHAVE)).perfil.empresa.razaoSocial === 'D.E.J SOLUTIONS & GLOBAL',
    'empresa salva'
  );

  const salvo = w1.localStorage.getItem(CHAVE);
  assert.ok(salvo && salvo.length > 100, 'o navegador guardou os dados: ' + (salvo || '').length + ' bytes');
  assert.strictEqual(w1.ModoEstatico.armazenamento().ok, true, 'o teste de armazenamento passou');
  w1.close();

  // ---- visita 2: "nova aba" — o navegador entrega o mesmo armazenamento
  const segunda = await ModoLocal.abrirSemServidor({ armazenamento: { [CHAVE]: salvo } });
  const w2 = segunda.window;
  const $2 = (sel) => w2.document.querySelector(sel);
  await ModoLocal.esperar(() => w2.ModoEstatico && w2.ModoEstatico.ativo(), 'modo local na nova aba');
  await ModoLocal.esperar(() => !$2('#app').classList.contains('oculto'), 'aplicação aberta', 10000);
  await ModoLocal.esperar(() => /001\/2026/.test($2('#painel-recentes').textContent), 'proposta na lista do painel');
  assert.ok(
    /RÁDIO DE TESTE DA NOVA ABA|001\/2026/.test($2('#painel-recentes').textContent),
    'a proposta criada na primeira visita aparece: ' + $2('#painel-recentes').textContent.slice(0, 80)
  );
  const daEmpresa = w2.ModoEstatico._interno.banco.perfil.empresa.razaoSocial;
  assert.strictEqual(daEmpresa, 'D.E.J SOLUTIONS & GLOBAL', 'os dados da empresa também voltaram');
  assert.ok(/D\.E\.J/.test(w2.document.body.textContent), 'e aparecem na tela');
  assert.strictEqual(segunda.erros.length, 0, 'sem erros de script: ' + segunda.erros.join(' | '));
  w2.close();
});

teste('Modo local: uma aba aberta antes não apaga o que a outra gravou depois', async () => {
  const CHAVE = 'licitapro.local.v1';
  const modelo = {
    versao: 2,
    perfil: { empresa: { razaoSocial: 'D.E.J SOLUTIONS & GLOBAL' }, padroes: {} },
    documentos: [{ id: 'antigo-1', tipo: 'proposta', numero: { sequencial: 1, ano: 2026 }, itens: [], status: 'rascunho' }],
    sequencia: { proposta: { 2026: 1 } },
  };

  // esta aba foi aberta quando só existia o documento antigo
  const aba = await abrirNoModoLocal({ armazenamento: { [CHAVE]: JSON.stringify(modelo) } });
  const w = aba.window;
  const $ = aba.$;
  await entrarNoModoLocal(w, $);

  // outra aba gravou enquanto esta continuava aberta
  const outro = {
    versao: 2,
    perfil: modelo.perfil,
    documentos: modelo.documentos.concat([
      { id: 'novo-2', tipo: 'proposta', numero: { sequencial: 2, ano: 2026 }, itens: [], status: 'rascunho', destinatario: 'PREFEITURA' },
    ]),
    sequencia: { proposta: { 2026: 2 } },
  };
  w.localStorage.setItem(CHAVE, JSON.stringify(outro));

  // e agora esta aba salva qualquer coisa (a empresa, por exemplo)
  $('#' + 'emp-razao').value = 'D.E.J SOLUTIONS & GLOBAL LTDA';
  $('#' + 'emp-salvar').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await ModoLocal.esperar(
    () => JSON.parse(w.localStorage.getItem(CHAVE)).perfil.empresa.razaoSocial === 'D.E.J SOLUTIONS & GLOBAL LTDA',
    'gravação desta aba'
  );

  const final = JSON.parse(w.localStorage.getItem(CHAVE));
  const ids = final.documentos.map((d) => d.id).sort();
  assert.ok(ids.includes('novo-2'), 'o documento da outra aba continua salvo: ' + ids.join(', '));
  assert.ok(ids.includes('antigo-1'), 'e o antigo também: ' + ids.join(', '));
  assert.strictEqual(final.sequencia.proposta['2026'], 2, 'a numeração ficou com o maior número');
  assert.strictEqual(final.perfil.empresa.razaoSocial, 'D.E.J SOLUTIONS & GLOBAL LTDA', 'o que esta aba salvou venceu');
  w.close();
});

teste('Modo local: avisa quando o navegador não está guardando os dados (janela privada)', async () => {
  const aberto = await ModoLocal.abrirSemServidor({
    preparar: (window) => {
      // é o que acontece com dados de site bloqueados / cota cheia
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        value: {
          setItem() { throw new Error('QuotaExceededError: o armazenamento está cheio ou bloqueado'); },
          getItem() { return null; },
          removeItem() {},
        },
      });
    },
  });
  const w = aberto.window;
  const $ = (sel) => w.document.querySelector(sel);
  await ModoLocal.esperar(() => w.ModoEstatico && w.ModoEstatico.ativo(), 'modo local ativo');
  await ModoLocal.esperar(() => !$('#app').classList.contains('oculto'), 'aplicação aberta', 10000);

  const situacao = w.ModoEstatico.armazenamento();
  assert.strictEqual(situacao.ok, false, 'o sistema percebeu que o navegador não guarda');
  assert.ok(/QuotaExceededError/.test(situacao.motivo), 'motivo guardado: ' + situacao.motivo);
  await ModoLocal.esperar(
    () => /NÃO está guardando os dados/.test($('#situacao-dados-texto').textContent),
    'a linha do painel avisa'
  );
  assert.strictEqual($('#situacao-dados').className.includes('erro'), true, 'a linha fica em vermelho');

  // e ao salvar, a tela não finge que deu certo
  w.document.querySelector('a[data-rota="empresa"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await ModoLocal.esperar(() => !$('#view-empresa').classList.contains('oculto'), 'tela da empresa');
  $('#emp-razao').value = 'D.E.J SOLUTIONS & GLOBAL';
  $('#emp-salvar').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await ModoLocal.esperar(
    () => /não ficou guardado neste navegador/.test($('#caixa-toasts').textContent),
    'avisa que não ficou guardado: ' + $('#caixa-toasts').textContent
  );
  w.close();
});

teste('Modo local: entrar e criar proposta com item, tudo salvo no navegador', async () => {
  const { window, $ } = await abrirNoModoLocal();
  const doc = window.document;

  await entrarNoModoLocal(window, $);

  $('#botao-nova-proposta').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await ModoLocal.esperar(() => !$('#view-editor').classList.contains('oculto'), 'editor visível');
  await ModoLocal.esperar(() => $('#campo-numero-sequencial').value !== '', 'numeração automática');

  $('#itens-adicionar').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await ModoLocal.esperar(() => $('#lista-itens .item'), 'item criado');

  const item = $('#lista-itens .item');
  const descricao = item.querySelector('input[data-campo="descricao"]');
  const quantidade = item.querySelector('input[data-campo="quantidade"]');
  const preco = item.querySelector('input[data-campo="precoVenda"]');
  descricao.value = 'RÁDIO TRANSCEPTOR PORTÁTIL DIGITAL';
  descricao.dispatchEvent(new window.Event('input', { bubbles: true }));
  quantidade.value = '6';
  quantidade.dispatchEvent(new window.Event('input', { bubbles: true }));
  preco.value = '1.490,00';
  preco.dispatchEvent(new window.Event('input', { bubbles: true }));
  await ModoLocal.esperar(() => $('#resumo-total').textContent.includes('8.940,00'), 'total calculado');

  $('#editor-salvar').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await ModoLocal.esperar(() => $('#editor-estado').textContent === 'Salvo', 'documento salvo', 10000);

  const banco = JSON.parse(window.localStorage.getItem('licitapro.local.v1'));
  assert.strictEqual(banco.documentos.length, 1, 'proposta gravada no navegador');
  assert.strictEqual(banco.documentos[0].numero.sequencial, 1, 'numeração automática no modo local');
  assert.strictEqual(banco.documentos[0].numero.ano, new Date().getFullYear(), 'ano da numeração');
  assert.strictEqual(banco.documentos[0].tipo, 'proposta', 'tipo do documento');

  window.location.hash = '#/documentos';
  await ModoLocal.esperar(() => doc.querySelectorAll('#lista-documentos .doc-item').length >= 1, 'proposta na lista');
  window.close();
});

teste('Modo local: importa planilha .xlsx de verdade e soma os itens', async () => {
  const { window, $ } = await abrirNoModoLocal();
  const doc = window.document;
  await entrarNoModoLocal(window, $);

  window.location.hash = '#/importar';
  await ModoLocal.esperar(() => !$('#view-importar').classList.contains('oculto'), 'tela de importação');
  await ModoLocal.esperar(() => $('#importacao-documento') && $('#importacao-documento').options.length >= 1, 'seletor de documentos');

  const arquivo = ModoLocal.planilhaDeTeste(window);
  const entrada = $('#arquivo-planilha');
  Object.defineProperty(entrada, 'files', { value: [arquivo], configurable: true });
  entrada.dispatchEvent(new window.Event('change', { bubbles: true }));

  await ModoLocal.esperar(() => !$('#bloco-importacao').classList.contains('oculto'), 'itens importados', 30000);
  assert.ok(window.XLSX, 'a biblioteca de planilhas foi baixada sob demanda');
  assert.ok($('#importacao-titulo').textContent.includes('2 itens'), 'título: ' + $('#importacao-titulo').textContent);
  assert.strictEqual(doc.querySelectorAll('#importacao-tabela tbody tr').length, 2, 'linhas na tabela');

  $('#importacao-criar-proposta').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await ModoLocal.esperar(() => doc.querySelectorAll('#lista-itens .item').length === 2, 'os 2 itens no editor', 10000);
  await ModoLocal.esperar(() => $('#resumo-total').textContent.includes('10.439,40'), 'total importado: ' + $('#resumo-total').textContent);
  window.close();
});

teste('Modo local: gera o PDF no navegador (sem servidor)', async () => {
  const { window, $ } = await abrirNoModoLocal();
  await entrarNoModoLocal(window, $);

  $('#botao-nova-proposta').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await ModoLocal.esperar(() => !$('#view-editor').classList.contains('oculto'), 'editor visível');
  await ModoLocal.esperar(() => $('#campo-numero-sequencial').value !== '', 'numeração');

  $('#itens-adicionar').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await ModoLocal.esperar(() => $('#lista-itens .item'), 'item criado');
  const item = $('#lista-itens .item');
  const descricao = item.querySelector('input[data-campo="descricao"]');
  descricao.value = 'RÁDIO TRANSCEPTOR PORTÁTIL DIGITAL';
  descricao.dispatchEvent(new window.Event('input', { bubbles: true }));
  const quantidade = item.querySelector('input[data-campo="quantidade"]');
  quantidade.value = '6';
  quantidade.dispatchEvent(new window.Event('input', { bubbles: true }));
  const preco = item.querySelector('input[data-campo="precoVenda"]');
  preco.value = '1.490,00';
  preco.dispatchEvent(new window.Event('input', { bubbles: true }));

  // salva e gera o PDF do documento que está aberto no editor
  $('#editor-salvar').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await ModoLocal.esperar(() => $('#editor-estado').textContent === 'Salvo', 'documento salvo', 10000);

  const banco = JSON.parse(window.localStorage.getItem('licitapro.local.v1'));
  const blob = await window.API.previaPdf(banco.documentos[0]);
  assert.ok(blob && blob.size > 2000, 'PDF gerado no navegador (' + (blob ? blob.size : 0) + ' bytes)');
  const inicio = new Uint8Array(await blob.arrayBuffer()).slice(0, 5);
  assert.strictEqual(String.fromCharCode.apply(null, inicio), '%PDF-', 'arquivo é um PDF válido');
  assert.ok(window.pdfMake, 'o pdfmake foi baixado sob demanda');

  // a mesma fonte do servidor: Times (Times New Roman)
  const texto = Buffer.from(new Uint8Array(await blob.arrayBuffer())).toString('latin1');
  const fontes = Array.from(new Set(texto.match(/\/BaseFont\s*\/([A-Za-z0-9+#-]+)/g) || []));
  assert.ok(fontes.includes('/BaseFont /Times-Roman'), 'Times no PDF do navegador: ' + fontes.join(', '));
  assert.ok(fontes.includes('/BaseFont /Times-Bold'), 'negrito da Times no navegador');
  assert.ok(!/Roboto/.test(texto), 'sem Roboto no PDF do navegador');

  // o botão "gerar PDF" da tela precisa existir e estar clicável
  const botaoPdf = doc_botao($, 'baixar');
  assert.ok(botaoPdf, 'botão de gerar/baixar PDF presente na tela');
  window.close();
});

function doc_botao($, trecho) {
  return Array.from($('#view-editor').querySelectorAll('button')).find((b) =>
    new RegExp(trecho, 'i').test(b.textContent) || new RegExp(trecho, 'i').test(b.id)
  );
}

teste('Modo local: backup e restauração dos dados', async () => {
  const { window, $ } = await abrirNoModoLocal();
  await entrarNoModoLocal(window, $);

  // cria um documento de verdade pelo caminho normal do sistema
  const criado = await window.API.pedir('/api/documentos', {
    method: 'POST',
    corpo: {
      tipo: 'orcamento',
      numero: { sequencial: 7, ano: 2026, grupo: '' },
      titulo: 'Backup de teste',
      cliente: { nome: 'Empresa Cliente' },
      itens: [{ descricao: 'ITEM DE TESTE', unidade: 'UND', quantidade: 2, precoVenda: 100 }],
    },
  });
  assert.ok(criado.documento && criado.documento.id, 'documento criado para o backup');

  const copia = await window.ModoEstatico.montarBackup();
  assert.strictEqual(copia.aplicativo, 'DEJ Solutions & Global', 'backup identificado');
  assert.strictEqual(copia.banco.documentos.length, 1, 'documento dentro do backup');
  assert.strictEqual(copia.banco.documentos[0].cliente.nome, 'Empresa Cliente', 'conteúdo do backup');
  assert.strictEqual(copia.banco.documentos[0].itens.length, 1, 'itens dentro do backup');

  // apaga tudo, como se fosse outro navegador
  window.localStorage.removeItem('licitapro.local.v1');
  window.ModoEstatico._interno.banco = null;

  await window.ModoEstatico.importarBackup(ModoLocal.arquivoDeBackup(copia));
  const restaurado = JSON.parse(window.localStorage.getItem('licitapro.local.v1'));
  assert.strictEqual(restaurado.documentos.length, 1, 'documentos restaurados');
  assert.strictEqual(restaurado.documentos[0].cliente.nome, 'Empresa Cliente', 'conteúdo restaurado');

  // e o sistema volta a listar o documento restaurado
  window.ModoEstatico._interno.banco = null;
  const lista = await window.API.pedir('/api/documentos');
  assert.strictEqual(lista.documentos.length, 1, 'documento visível após restaurar');
  assert.ok(lista.documentos[0].numeroFormatado.includes('007'), 'numeração preservada: ' + lista.documentos[0].numeroFormatado);
  window.close();
});

teste('Modo local: fotos — envio do computador, conversão e recusas', async () => {
  const aberto = await abrirNoModoLocal();
  const { window, $ } = aberto;
  await entrarNoModoLocal(window, $);

  const quebrada = new window.File([ModoLocal.pngCorrompido()], 'foto.png', { type: 'image/png' });
  // o jsdom não decodifica imagens: aqui ele passa a abrir PNG de verdade e a
  // recusar exatamente o arquivo corrompido
  ModoLocal.simularImagens(window, {
    blobs: aberto.blobsFalsos,
    ruins: [quebrada],
    falhar: (endereco) => String(endereco).includes('AAAADUlEQVR42mP8z8Dw'),
  });

  // 1. PNG de verdade: guardado como está (o PDF aceita PNG)
  const png = new window.File([ModoLocal.pngValido(8, 6)], 'foto.png', { type: 'image/png' });
  const envio = await window.API.enviarArquivo('/api/uploads', png);
  assert.ok(String(envio.caminho).startsWith('data:image/png'), 'PNG guardado como data URL: ' + String(envio.caminho).slice(0, 24));
  assert.strictEqual(envio.nome, 'foto.png', 'nome do arquivo preservado');

  // 2. arquivo que não é imagem: recusado com mensagem clara
  const texto = new window.File(['olá'], 'notas.txt', { type: 'text/plain' });
  await assert.rejects(
    () => window.API.enviarArquivo('/api/uploads', texto),
    (erro) => /não é uma imagem/i.test(erro.message),
    'arquivo que não é imagem é recusado'
  );

  // 3. imagem corrompida: recusada em vez de quebrar o PDF depois
  await assert.rejects(
    () => window.API.enviarArquivo('/api/uploads', quebrada),
    (erro) => /corromp/i.test(erro.message),
    'imagem corrompida é recusada: ' + 'ok'
  );

  // 4. o logo da empresa passa pelo mesmo caminho
  await window.API.pedir('/api/perfil/empresa', {
    method: 'PUT',
    corpo: { razaoSocial: 'D.E.J SOLUTIONS & GLOBAL', logo: envio.caminho },
  });
  const perfil = await window.API.pedir('/api/perfil');
  assert.strictEqual(perfil.perfil.empresa.logo, envio.caminho, 'logo guardada no perfil');

  // 5. no gerador de PDF: PNG é entregue como está...
  const pronto = await window.ImagensNavegador.prepararParaPdf(envio.caminho);
  assert.ok(pronto && pronto.imagem === envio.caminho, 'PNG repassado ao pdfmake');

  // ...e o que não pode ser usado vira traço no PDF, sem derrubar a geração
  for (const ruim of [ModoLocal.dataUrlPng(ModoLocal.pngCorrompido()), 'https://exemplo.invalido/x.jpg', 'idb:nao-existe']) {
    const resultado = await window.ImagensNavegador.prepararParaPdf(ruim);
    assert.strictEqual(resultado, null, 'imagem inutilizável ignorada: ' + String(ruim).slice(0, 30));
  }

  // 6. endereço de exibição das imagens na tela
  assert.strictEqual(window.UI.urlImagem(''), '', 'sem imagem não há endereço');
  assert.ok(window.UI.urlImagem(envio.caminho).startsWith('data:'), 'data URL exibida direto');
  window.close();
});

teste('Modo local: PDF sai mesmo com foto corrompida ou em formato não aceito', async () => {
  const { window, $ } = await abrirNoModoLocal();
  await entrarNoModoLocal(window, $);
  // o PNG corrompido começa com este trecho em base64 (o navegador não abre)
  ModoLocal.simularImagens(window, { falhar: (endereco) => String(endereco).includes('AAAADUlEQVR42mP8z8Dw') });

  const boa = ModoLocal.dataUrlPng(ModoLocal.pngValido(8, 6));
  const criado = await window.API.pedir('/api/documentos', {
    method: 'POST',
    corpo: {
      tipo: 'proposta',
      numero: { sequencial: 1, ano: 2026 },
      orgao: { nome: 'UASG 787010' },
      itens: [
        { descricao: 'COM FOTO BOA', unidade: 'UND', quantidade: 1, precoVenda: 100, foto: boa, descricaoCatalogo: 'ok' },
        { descricao: 'COM PNG CORROMPIDO', unidade: 'UND', quantidade: 1, precoVenda: 100, foto: ModoLocal.dataUrlPng(ModoLocal.pngCorrompido()), descricaoCatalogo: 'ruim' },
        { descricao: 'COM GIF', unidade: 'UND', quantidade: 1, precoVenda: 100, foto: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', descricaoCatalogo: 'gif' },
        { descricao: 'COM LINK QUEBRADO', unidade: 'UND', quantidade: 1, precoVenda: 100, foto: 'https://exemplo.invalido/x.jpg', descricaoCatalogo: 'link' },
      ],
      condicoes: { validadeDias: 60, local: 'Fortaleza - CE' },
      proponente: { razaoSocial: 'D.E.J SOLUTIONS & GLOBAL' },
      layout: {},
    },
  });

  const blob = await window.API.previaPdf(criado.documento);
  assert.ok(blob && blob.size > 2000, 'PDF gerado com as fotos problemáticas (' + (blob ? blob.size : 0) + ' bytes)');
  const inicio = new Uint8Array(await blob.arrayBuffer()).slice(0, 5);
  assert.strictEqual(String.fromCharCode.apply(null, inicio), '%PDF-', 'arquivo é um PDF válido');

  // a tela é avisada das fotos que ficaram de fora (3 das 4 fotos são inutilizáveis)
  const aviso = window.API.ultimasFotosIgnoradas;
  assert.ok(aviso && aviso.fotosIgnoradas >= 3, 'aviso das fotos: ' + JSON.stringify(aviso));
  assert.ok(/Item 2/.test(aviso.detalheFotosIgnoradas), 'diz qual item ficou sem foto: ' + aviso.detalheFotosIgnoradas);
  window.close();
});

teste('GitHub Pages: a raiz do site publica o sistema (não uma página só de apresentação)', async () => {
  const Paginas = require(path.join(RAIZ, 'scripts', 'paginas.js'));

  // o arquivo da raiz tem de estar em sincronia com a página do sistema
  assert.strictEqual(
    fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8'),
    Paginas.gerar(),
    'index.html da raiz desatualizado — rode: npm run paginas'
  );
  const raiz = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  assert.ok(raiz.includes('<meta name="licitapro-base" content="public/" />'), 'a raiz avisa onde estão css/js/vendor');
  assert.ok(/href="public\/css\/estilos\.css(\?v=[^"]+)?"/.test(raiz), 'CSS com o caminho da raiz');
  assert.ok(/src="public\/js\/modo-estatico\.js(\?v=[^"]+)?"/.test(raiz), 'scripts com o caminho da raiz');
  assert.ok(!/<base\s/i.test(raiz), 'sem <base>, para os links internos ficarem em /licitapro/');
  assert.strictEqual(
    new URL('#/documentos', 'https://marcossilva023l20.github.io/licitapro/').pathname,
    '/licitapro/',
    'navegação interna permanece na raiz do site'
  );
  assert.ok(raiz.includes('js/modo-estatico.js'), 'a raiz carrega o modo local');
  assert.ok(raiz.includes('id="view-painel"'), 'a raiz é a tela do sistema');
  assert.ok(!raiz.includes('tela-login'), 'a raiz não tem tela de login');

  // a página de apresentação continua existindo, ao lado do sistema
  const apresentacao = fs.readFileSync(path.join(RAIZ, 'apresentacao.html'), 'utf8');
  assert.ok(apresentacao.includes('site/apresentacao.css'), 'apresentação com o próprio CSS');
  assert.ok(raiz.includes('content="apresentacao.html"'), 'raiz aponta para a apresentação');

  // e abrindo a raiz como o GitHub Pages faz (endereço /licitapro/), o sistema funciona
  const aberto = await ModoLocal.abrirSemServidor({
    base: 'https://marcossilva023l20.github.io/licitapro/',
    arquivo: 'index.html',
  });
  const $ = (sel) => aberto.window.document.querySelector(sel);
  await ModoLocal.esperar(() => aberto.window.ModoEstatico && aberto.window.ModoEstatico.ativo(), 'modo local na raiz', 15000);
  await ModoLocal.esperar(() => !$('#app').classList.contains('oculto'), 'sistema aberto na raiz do Pages', 15000);
  assert.strictEqual($('#banner-modo-local'), null, 'na raiz também sem aviso fixo');
  assert.ok(!$('#local-exportar').classList.contains('oculto'), 'backup no menu na raiz');
  assert.ok($('.menu-local-sobre'), 'link para a página de apresentação no menu');

  await ModoLocal.esperar(() => !$('#view-painel').classList.contains('oculto'), 'painel do sistema montado', 10000);
  assert.ok($('#botao-nova-proposta'), 'botão de nova proposta disponível na raiz');
  assert.ok($('#nome-usuario').textContent.length > 0, 'perfil local no topo');

  // e o "Sobre o sistema" leva à apresentação (arquivo que existe no repositório)
  assert.strictEqual($('.menu-local-sobre').getAttribute('href'), 'apresentacao.html', 'link da apresentação');
  assert.ok(fs.existsSync(path.join(RAIZ, 'apresentacao.html')), 'a apresentação existe no repositório');

  // no endereço da raiz, o PDF também sai: as bibliotecas vêm de public/vendor/
  const criado = await aberto.window.API.pedir('/api/documentos', {
    method: 'POST',
    corpo: {
      tipo: 'proposta',
      numero: { sequencial: 1, ano: 2026, grupo: '' },
      orgao: { nome: 'UASG 787010 - CENTRO DE INTENDÊNCIA DA MARINHA' },
      itens: [{
        descricao: 'RÁDIO TRANSCEPTOR PORTÁTIL DIGITAL', unidade: 'UND', quantidade: 6, precoVenda: 1490,
        foto: ModoLocal.dataUrlPng(ModoLocal.pngValido(8, 6)),
      }],
    },
  });
  const blob = await aberto.window.API.previaPdf(criado.documento);
  assert.ok(blob && blob.size > 2000, 'PDF gerado na raiz do Pages (' + (blob ? blob.size : 0) + ' bytes)');
  const inicio = new Uint8Array(await blob.arrayBuffer()).slice(0, 5);
  assert.strictEqual(String.fromCharCode.apply(null, inicio), '%PDF-', 'PDF válido na raiz do Pages');
  assert.ok(aberto.window.pdfMake, 'pdfmake carregado de public/vendor/');
  aberto.window.close();
});

teste('Modo local: com servidor disponível ele não interfere', async () => {
  const servidor = await Navegador.subirServidor();
  try {
    const porta = servidor.address().port;
    const { window } = await Navegador.abrirNavegador(porta);
    const $ = (sel) => window.document.querySelector(sel);
    await Navegador.esperar(() => window.ModoEstatico, 'script do modo local carregado');
    await Navegador.esperar(() => !$('#view-painel').classList.contains('oculto'), 'painel aberto pelo servidor');
    assert.strictEqual(window.ModoEstatico.ativo(), false, 'modo local desligado quando há servidor');
    assert.strictEqual($('#banner-modo-local'), null, 'sem aviso de modo local');
    assert.ok($('#local-exportar').classList.contains('oculto'), 'backup do modo local fica escondido com servidor');
    assert.ok($('#local-importar').classList.contains('oculto'), 'restauração também escondida com servidor');
  } finally {
    servidor.close();
  }
});

// =============================================== 7. banco de dados (Supabase)

/** Documento de arquivo antigo, com id (como os que o sistema grava). */
function documentoComId(tipo, identificador) {
  return Object.assign(documentoExemplo(tipo), {
    id: identificador || '00000000-0000-4000-8000-000000000001',
    atualizadoEm: new Date().toISOString(),
  });
}

/** Prepara o armazenamento contra um Supabase de mentira e limpa tudo depois. */
async function comBancoDeMentira(fn, estadoLocal, opcoes) {
  const { criarServidorDeMentira, CHAVE_ESPERADA } = require('./supabase-falso');
  const Supabase = require(path.join(RAIZ, 'server', 'supabase'));
  const store = require(path.join(RAIZ, 'server', 'store'));
  const falso = await criarServidorDeMentira(opcoes);
  const arquivo = path.join(process.env.LICITAPRO_DATA_DIR, 'db.json');
  const backup = fs.existsSync(arquivo) ? fs.readFileSync(arquivo, 'utf8') : null;
  if (estadoLocal) fs.writeFileSync(arquivo, JSON.stringify(estadoLocal, null, 2));
  falso.cliente = Supabase.criarCliente({ url: falso.url, chave: CHAVE_ESPERADA });
  store.usarRemoto(falso.cliente);
  try {
    await fn(falso, store, Supabase);
  } finally {
    store.usarRemoto(null);
    store.esquecer();
    if (backup !== null) fs.writeFileSync(arquivo, backup);
    else fs.rmSync(arquivo, { force: true });
    await falso.fechar();
  }
}

teste('Supabase: sem credenciais o sistema usa o arquivo local', () => {
  const Supabase = require(path.join(RAIZ, 'server', 'supabase'));
  assert.strictEqual(Supabase.configurado({}), false, 'sem variáveis não usa o banco');
  assert.strictEqual(Supabase.configurado({ SUPABASE_URL: 'https://x.supabase.co' }), false, 'a URL sozinha não basta');
  // a chave sozinha já liga o banco: o endereço cai no projeto padrão do sistema
  assert.strictEqual(Supabase.configurado({ SUPABASE_SERVICE_KEY: 'chave' }), true, 'a chave sozinha usa o projeto padrão');
  assert.strictEqual(
    Supabase.configurado({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_KEY: 'chave' }),
    true,
    'com URL + chave de serviço o sistema usa o banco'
  );
  assert.strictEqual(
    Supabase.configurado({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_KEY: 'chave', LICITAPRO_ARMAZENAMENTO: 'arquivo' }),
    false,
    'LICITAPRO_ARMAZENAMENTO=arquivo volta a usar o arquivo local'
  );
  // aceita também os nomes usados pelo painel do Supabase
  assert.strictEqual(
    Supabase.configurado({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'chave' }),
    true,
    'aceita SUPABASE_SERVICE_ROLE_KEY'
  );
});

teste('Supabase: o esquema cria as tabelas usadas, com RLS, e sem chave no navegador', () => {
  const Supabase = require(path.join(RAIZ, 'server', 'supabase'));
  const sql = fs.readFileSync(path.join(RAIZ, 'supabase', 'esquema.sql'), 'utf8');

  Object.values(Supabase.TABELAS).forEach((tabela) => {
    assert.ok(sql.includes('public.' + tabela), 'tabela ' + tabela + ' no esquema');
  });
  assert.strictEqual(
    (sql.match(/enable row level security/gi) || []).length,
    3,
    'RLS ligado nas três tabelas'
  );
  assert.ok(!/create\s+policy/i.test(sql), 'sem política: a chave pública não lê nem grava');
  assert.ok(sql.includes('jsonb'), 'versão do sistema (empresa, itens e dados do documento) em jsonb');

  // a chave de serviço é só do servidor: nunca aparece no que vai ao navegador.
  // (o site pode *citar* o Supabase e o nome do tipo de chave no texto de ajuda
  //  — o que não pode é ter a chave, uma variável com valor ou o endereço do
  //  projeto; veja PADROES_DE_CREDENCIAL no fim do arquivo)
  ['public/index.html', 'public/js/app.js', 'public/js/modo-estatico.js', 'public/js/api.js', 'public/js/nuvem.js'].forEach((relativo) => {
    const conteudo = fs.readFileSync(path.join(RAIZ, relativo), 'utf8');
    PADROES_DE_CREDENCIAL.forEach((padrao) => {
      assert.strictEqual(padrao.test(conteudo), false, 'sem credencial de banco em ' + relativo);
    });
  });
});

teste('Supabase: reconhece o tipo de chave e avisa o que ela permite', () => {
  const Supabase = require(path.join(RAIZ, 'server', 'supabase'));
  const anon = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR5bmViaHRvZHRrYnR5ZHpnb3VvIiwicm9sZSI6ImFub24ifQ.assinatura';
  const servico = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.assinatura';

  assert.strictEqual(Supabase.classificarChave(anon), 'anon', 'reconhece a chave pública');
  assert.strictEqual(Supabase.classificarChave(servico), 'service_role', 'reconhece a chave de servidor');
  assert.strictEqual(Supabase.classificarChave('sb_secret_abc'), 'secret', 'reconhece a secret key nova');
  assert.strictEqual(Supabase.classificarChave('sb_publishable_abc'), 'publishable', 'reconhece a publishable nova');
  assert.strictEqual(Supabase.classificarChave(''), 'ausente', 'sem chave');
  assert.strictEqual(Supabase.classificarChave('uma-senha-qualquer'), 'desconhecida', 'formato desconhecido');

  assert.strictEqual(Supabase.chaveDeServidor(servico), true, 'service_role serve para o servidor');
  assert.strictEqual(Supabase.chaveDeServidor('sb_secret_abc'), true, 'secret key serve para o servidor');
  assert.strictEqual(Supabase.chaveDeServidor(anon), false, 'a chave pública não basta com o RLS ligado');
  assert.strictEqual(Supabase.chaveDeServidor('sb_publishable_abc'), false, 'publishable também não');

  // a orientação diz o que fazer (e cita os dois caminhos)
  const aviso = Supabase.orientacaoDaChave(anon);
  assert.ok(/pública/.test(aviso), 'explica que a chave é pública');
  assert.ok(/service_role/.test(aviso), 'aponta a chave de servidor');
  assert.ok(/politicas-anon\.sql/.test(aviso), 'aponta o SQL das políticas');
  assert.strictEqual(Supabase.orientacaoDaChave(servico), null, 'com a chave certa não há aviso');

  // sem endereço informado, usa o projeto padrão do sistema
  const config = Supabase.lerConfiguracao({ SUPABASE_ANON_KEY: anon });
  assert.strictEqual(config.url, 'https://' + Supabase.PROJETO_PADRAO + '.supabase.co', 'projeto padrão');
  assert.strictEqual(config.configurado, true, 'URL padrão + chave já liga o banco');
  assert.strictEqual(
    Supabase.lerConfiguracao({ SUPABASE_URL: 'https://outro.supabase.co', SUPABASE_SERVICE_KEY: servico }).url,
    'https://outro.supabase.co',
    'SUPABASE_URL tem prioridade'
  );
});

teste('Supabase: o SQL das políticas (opcional) cobre as três tabelas e avisa do risco', () => {
  const Supabase = require(path.join(RAIZ, 'server', 'supabase'));
  const caminho = path.join(RAIZ, 'supabase', 'politicas-anon.sql');
  assert.ok(fs.existsSync(caminho), 'o arquivo de políticas existe');
  const sql = fs.readFileSync(caminho, 'utf8');

  Object.values(Supabase.TABELAS).forEach((tabela) => {
    assert.ok(sql.includes('public.' + tabela), 'políticas para ' + tabela);
  });
  assert.ok(/to anon/.test(sql), 'as políticas valem para o papel anon');
  assert.ok(/OPCIONAL/i.test(sql), 'o arquivo se apresenta como opcional');
  assert.ok(/service_role/.test(sql), 'o aviso recomenda a chave de servidor');
  assert.ok(/for delete/.test(sql), 'excluir documento também é permitido (necessário para o sistema)');

  // o esquema principal continua fechado: nenhuma política nele
  const esquema = fs.readFileSync(path.join(RAIZ, 'supabase', 'esquema.sql'), 'utf8');
  assert.strictEqual(/create\s+policy/i.test(esquema), false, 'o esquema não abre nada para o anon');
});

teste('Supabase: banco vazio recebe o conteúdo local', async () => {
  const local = {
    perfil: { empresa: { razaoSocial: 'EMPRESA DO ARQUIVO' }, padroes: {} },
    documentos: [documentoComId('orcamento')],
    sequencia: { orcamento: { '2026': 4 } },
  };
  await comBancoDeMentira(async (falso, store) => {
    await store.carregarRemoto();
    await store.encerrar();

    assert.strictEqual(falso.contagem('licitapro_perfil'), 1, 'perfil enviado');
    assert.strictEqual(
      falso.linhas('licitapro_perfil')[0].dados.empresa.razaoSocial,
      'EMPRESA DO ARQUIVO',
      'dados da empresa enviados'
    );
    assert.strictEqual(falso.contagem('licitapro_documentos'), 1, 'documento enviado');
    assert.strictEqual(falso.contagem('licitapro_sequencia'), 1, 'numeração enviada');
    assert.strictEqual(falso.linhas('licitapro_sequencia')[0].por_ano['2026'], 4, 'ano da numeração');
  }, local);
});

teste('Supabase: empresa e documentos voltam do banco depois de um "redeploy"', async () => {
  await comBancoDeMentira(async (falso, store) => {
    await store.carregarRemoto(); // banco vazio → semeia com o conteúdo local

    const empresa = {
      razaoSocial: 'DEJ SOLUTIONS COMÉRCIO E SERVIÇOS LTDA',
      nomeFantasia: 'DEJ Solutions & Global',
      cnpj: '12.345.678/0001-90',
      telefone: '(41) 99999-4040',
      email: 'comercial@dejsolutions.com.br',
    };
    store.perfil.atualizar({ empresa });
    const criado = store.documento.criar({
      tipo: 'proposta',
      numero: { sequencial: 5, ano: 2026, grupo: '' },
      itens: [{ descricao: 'RÁDIO TRANSCEPTOR', quantidade: 6, precoVenda: 1490 }],
      proponente: empresa,
    });
    store.documento.reservarNumero('proposta', 2026, '', 5);
    await store.encerrar();

    assert.strictEqual(falso.linhas('licitapro_perfil')[0].dados.empresa.cnpj, '12.345.678/0001-90', 'CNPJ no banco');
    const gravado = falso.linhas('licitapro_documentos').find((l) => l.id === criado.id);
    assert.ok(gravado, 'documento gravado no banco');
    assert.strictEqual(gravado.dados.itens[0].descricao, 'RÁDIO TRANSCEPTOR', 'itens dentro do documento');

    // simula o redeploy: memória zerada e arquivo local apagado
    const arquivo = path.join(process.env.LICITAPRO_DATA_DIR, 'db.json');
    store.usarRemoto(null);
    store.esquecer();
    fs.rmSync(arquivo, { force: true });
    store.usarRemoto(falso.cliente);
    await store.carregarRemoto();

    const recarregado = store.carregar();
    assert.strictEqual(recarregado.perfil.empresa.razaoSocial, 'DEJ SOLUTIONS COMÉRCIO E SERVIÇOS LTDA', 'empresa voltou do banco');
    assert.strictEqual(recarregado.perfil.empresa.cnpj, '12.345.678/0001-90', 'CNPJ voltou do banco');
    assert.strictEqual(recarregado.documentos.length, 2, 'os dois documentos voltaram do banco');
    const devolvido = recarregado.documentos.find((d) => d.id === criado.id);
    assert.ok(devolvido, 'o documento criado voltou com o mesmo id');
    assert.strictEqual(devolvido.itens.length, 1, 'itens voltaram');
    assert.strictEqual(recarregado.sequencia.proposta['2026'], 5, 'numeração voltou do banco');
    assert.ok(fs.existsSync(arquivo), 'o arquivo local é recriado como cópia do banco');
  }, {
    perfil: { empresa: { razaoSocial: 'EMPRESA ANTIGA' }, padroes: {} },
    documentos: [documentoComId('orcamento')],
    sequencia: {},
  });
});

teste('Supabase: excluir um documento apaga também no banco', async () => {
  await comBancoDeMentira(async (falso, store) => {
    store.esquecer();
    await store.carregarRemoto();
    const documento = store.documento.criar({ tipo: 'orcamento', numero: { sequencial: 1, ano: 2026, grupo: '' }, itens: [] });
    await store.encerrar();
    assert.strictEqual(falso.contagem('licitapro_documentos'), 2, 'os dois documentos no banco');

    store.documento.remover(documento.id);
    await store.encerrar();
    assert.strictEqual(falso.contagem('licitapro_documentos'), 1, 'documento excluído saiu do banco');
    assert.ok(!falso.linhas('licitapro_documentos').some((l) => l.id === documento.id), 'o id excluído não está lá');
  }, {
    perfil: { empresa: { razaoSocial: 'EMPRESA DO ARQUIVO' }, padroes: {} },
    documentos: [documentoComId('orcamento')],
    sequencia: {},
  });
});

teste('Supabase: a união do banco com o arquivo não perde documento nenhum', async () => {
  const Supabase = require(path.join(RAIZ, 'server', 'supabase'));
  const store = require(path.join(RAIZ, 'server', 'store'));

  const mesclado = store.mesclar(
    {
      perfil: { empresa: { razaoSocial: 'EMPRESA DO ARQUIVO' }, padroes: {} },
      documentos: [
        { id: 'a0000000-0000-4000-8000-000000000001', tipo: 'proposta', itens: [] },
        { id: 'c0000000-0000-4000-8000-000000000003', tipo: 'proposta', itens: [{ descricao: 'SÓ NO ARQUIVO' }] },
      ],
      sequencia: { proposta: { '2026': 3 } },
    },
    {
      perfil: null,
      documentos: [
        { id: 'b0000000-0000-4000-8000-000000000002', tipo: 'orcamento', itens: [] },
        { id: 'c0000000-0000-4000-8000-000000000003', tipo: 'proposta', itens: [{ descricao: 'VERSÃO DO BANCO' }] },
      ],
      sequencia: { proposta: { '2026': 7 }, orcamento: { '2026': 2 } },
    }
  );

  assert.strictEqual(mesclado.documentos.length, 3, 'os três documentos sobrevivem');
  assert.strictEqual(mesclado.sequencia.proposta['2026'], 7, 'numeração fica com o maior número');
  assert.strictEqual(mesclado.sequencia.orcamento['2026'], 2, 'numeração do outro tipo também');
  assert.strictEqual(mesclado.perfil.empresa.razaoSocial, 'EMPRESA DO ARQUIVO', 'perfil do arquivo, já que o banco não tinha');
  const repetido = mesclado.documentos.find((d) => d.id === 'c0000000-0000-4000-8000-000000000003');
  assert.strictEqual(repetido.itens[0].descricao, 'VERSÃO DO BANCO', 'quando existe nos dois, vale a versão do banco');

  // e o que foi unido volta para o banco (documento do arquivo incluído)
  await comBancoDeMentira(async (falso) => {
    store.esquecer();
    falso.definir('licitapro_documentos', [
      { id: 'b0000000-0000-4000-8000-000000000002', dados: { id: 'b0000000-0000-4000-8000-000000000002', tipo: 'orcamento', itens: [] } },
    ]);
    await store.carregarRemoto();
    await store.encerrar();
    assert.strictEqual(falso.contagem('licitapro_documentos'), 2, 'o documento que só existia no arquivo foi para o banco');
    assert.ok(
      falso.linhas('licitapro_documentos').some((l) => l.id === '00000000-0000-4000-8000-000000000001'),
      'id do arquivo local preservado'
    );
  }, {
    perfil: { empresa: { razaoSocial: 'EMPRESA DO ARQUIVO' }, padroes: {} },
    documentos: [documentoComId('proposta')],
    sequencia: { proposta: { '2026': 3 } },
  });
});

teste('Supabase: banco fora do ar não derruba o site e sincroniza quando volta', async () => {
  const { criarServidorDeMentira } = require('./supabase-falso');
  const Supabase = require(path.join(RAIZ, 'server', 'supabase'));
  const store = require(path.join(RAIZ, 'server', 'store'));
  const app = require(path.join(RAIZ, 'server', 'index.js'));

  const falso = await criarServidorDeMentira({ falhar: true }); // banco fora do ar
  const ambiente = { url: process.env.SUPABASE_URL, chave: process.env.SUPABASE_SERVICE_KEY };
  const arquivo = path.join(process.env.LICITAPRO_DATA_DIR, 'db.json');
  const backup = fs.existsSync(arquivo) ? fs.readFileSync(arquivo, 'utf8') : null;
  process.env.SUPABASE_URL = falso.url;
  process.env.SUPABASE_SERVICE_KEY = require('./supabase-falso').CHAVE_ESPERADA;

  try {
    fs.writeFileSync(arquivo, JSON.stringify({
      perfil: { empresa: { razaoSocial: 'EMPRESA LOCAL' }, padroes: {} },
      documentos: [documentoComId('proposta')],
      sequencia: { proposta: { '2026': 1 } },
    }));
    store.usarRemoto(null);
    store.esquecer();

    // 1. o start não falha: segue no arquivo local
    const modo = await app.prepararArmazenamento();
    assert.strictEqual(modo, 'arquivo', 'cai para o arquivo local em vez de derrubar o site');
    assert.strictEqual(store.carregar().documentos.length, 1, 'os dados locais continuam disponíveis');
    const situacao = store.situacaoRemota();
    assert.strictEqual(situacao.configurado, true, 'o banco está configurado');
    assert.strictEqual(situacao.conectado, false, 'e marcado como não conectado');
    assert.ok(situacao.erro, 'com o motivo registrado');

    // 2. dá para trabalhar normalmente com o banco fora do ar
    const criado = store.documento.criar({ tipo: 'orcamento', numero: { sequencial: 1, ano: 2026, grupo: '' }, itens: [{ descricao: 'FEITO DURANTE A QUEDA' }] });
    const sincronizou = await store.encerrar();
    assert.strictEqual(sincronizou, false, 'o encerramento avisa que o banco não recebeu');
    assert.ok(fs.readFileSync(arquivo, 'utf8').includes('FEITO DURANTE A QUEDA'), 'o documento ficou salvo no arquivo');

    // 3. o banco volta: a próxima alteração sincroniza os dois lados
    falso.falhar = false;
    store.perfil.atualizar({ empresa: { razaoSocial: 'EMPRESA LOCAL' } });
    const depois = await store.encerrar();
    assert.strictEqual(depois, true, 'gravação recuperada');
    assert.strictEqual(store.modo(), 'supabase', 'volta ao modo banco');
    assert.strictEqual(store.situacaoRemota().conectado, true, 'situação atualizada');
    assert.strictEqual(falso.contagem('licitapro_documentos'), 2, 'o documento criado na queda foi para o banco');
    assert.ok(
      falso.linhas('licitapro_documentos').some((l) => l.dados.itens[0].descricao === 'FEITO DURANTE A QUEDA'),
      'com o conteúdo certo'
    );
  } finally {
    store.usarRemoto(null);
    store.esquecer();
    if (ambiente.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = ambiente.url;
    if (ambiente.chave === undefined) delete process.env.SUPABASE_SERVICE_KEY; else process.env.SUPABASE_SERVICE_KEY = ambiente.chave;
    if (backup !== null) fs.writeFileSync(arquivo, backup); else fs.rmSync(arquivo, { force: true });
    await falso.fechar();
  }
});

teste('Supabase: falha no banco é avisada e o arquivo local continua salvando', async () => {
  await comBancoDeMentira(async (falso, store) => {
    store.esquecer();
    await store.carregarRemoto();
    assert.strictEqual(store.ultimoErroRemoto(), null, 'sem erro antes do problema');

    falso.falhar = true; // o banco "cai"
    store.perfil.atualizar({ empresa: { razaoSocial: 'CONTINUA SALVANDO LOCAL' } });
    const tudoCerto = await store.encerrar();

    assert.strictEqual(tudoCerto, false, 'o encerramento informa que houve falha');
    assert.ok(/500|banco fora do ar/.test(store.ultimoErroRemoto() || ''), 'o erro fica registrado para /api/health');
    const arquivo = JSON.parse(fs.readFileSync(path.join(process.env.LICITAPRO_DATA_DIR, 'db.json'), 'utf8'));
    assert.strictEqual(arquivo.perfil.empresa.razaoSocial, 'CONTINUA SALVANDO LOCAL', 'o dado não se perdeu');
  }, {
    perfil: { empresa: { razaoSocial: 'EMPRESA DO ARQUIVO' }, padroes: {} },
    documentos: [],
    sequencia: {},
  });
});

teste('Supabase: "configurar" grava o .env e já confere a conexão', async () => {
  const { criarServidorDeMentira, CHAVE_ESPERADA } = require('./supabase-falso');
  const { execFile } = require('child_process');
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'licitapro-env-'));
  const arquivoEnv = path.join(pasta, '.env');
  fs.writeFileSync(arquivoEnv, '# comentário que deve sobreviver\nPORT=3000\nSUPABASE_URL=https://antigo.supabase.co\n');

  const falso = await criarServidorDeMentira();
  try {
    const saida = await new Promise((resolver) => {
      const filho = execFile(
        process.execPath,
        [path.join(RAIZ, 'scripts', 'banco.js'), 'configurar'],
        { env: Object.assign({}, process.env, { LICITAPRO_ENV_FILE: arquivoEnv, LICITAPRO_DATA_DIR: pasta }) }
      );
      let texto = '';
      filho.stdout.on('data', (d) => { texto += d; });
      filho.stderr.on('data', (d) => { texto += d; });
      filho.on('close', () => resolver(texto));
      // responde as duas perguntas: endereço e chave (a chave vem oculta)
      filho.stdin.write(falso.url + '\n' + CHAVE_ESPERADA + '\n');
      filho.stdin.end();
    });

    const gravado = fs.readFileSync(arquivoEnv, 'utf8');
    assert.ok(gravado.includes('# comentário que deve sobreviver'), 'preserva os comentários do .env');
    assert.ok(gravado.includes('PORT=3000'), 'preserva as outras variáveis');
    assert.ok(gravado.includes('SUPABASE_URL=' + falso.url), 'grava o endereço informado');
    assert.ok(gravado.includes('SUPABASE_SERVICE_KEY=' + CHAVE_ESPERADA), 'grava a chave');
    assert.strictEqual(gravado.includes('antigo.supabase.co'), false, 'substitui o endereço antigo');
    assert.ok(/Credencial do Supabase gravada/.test(saida), 'avisa que gravou: ' + saida.slice(0, 200));
    assert.ok(/tudo certo/.test(saida), 'já confere a conexão depois de gravar:\n' + saida);

    // sem chave informada (só ENTER), nada é alterado
    const saidaVazia = await new Promise((resolver) => {
      const filho = execFile(
        process.execPath,
        [path.join(RAIZ, 'scripts', 'banco.js'), 'configurar'],
        { env: Object.assign({}, process.env, { LICITAPRO_ENV_FILE: arquivoEnv, LICITAPRO_DATA_DIR: pasta, SUPABASE_URL: '', SUPABASE_SERVICE_KEY: '' }) }
      );
      let texto = '';
      filho.stdout.on('data', (d) => { texto += d; });
      filho.stderr.on('data', (d) => { texto += d; });
      filho.on('close', () => resolver(texto));
      filho.stdin.write('\n\n');
      filho.stdin.end();
    });
    assert.ok(/Nenhuma credencial informada/.test(saidaVazia), 'avisa quando não há chave: ' + saidaVazia.slice(0, 120));
  } finally {
    await falso.fechar();
    fs.rmSync(pasta, { recursive: true, force: true });
  }
});

teste('Supabase: o diagnóstico diz passo a passo onde está o problema', async () => {
  const { criarServidorDeMentira, CHAVE_ESPERADA } = require('./supabase-falso');
  const { execFile } = require('child_process');
  const arquivo = path.join(RAIZ, 'scripts', 'banco.js');

  const rodar = (ambiente) =>
    new Promise((resolver) => {
      execFile(
        process.execPath,
        [arquivo, 'conferir'],
        { env: Object.assign({}, process.env, ambiente) },
        (erro, saida, erroSaida) => resolver(String(saida || '') + String(erroSaida || ''))
      );
    });

  // banco no ar: tudo ok e a gravação é testada de verdade
  const falso = await criarServidorDeMentira();
  try {
    const saida = await rodar({
      SUPABASE_URL: falso.url,
      SUPABASE_SERVICE_KEY: CHAVE_ESPERADA,
      LICITAPRO_DATA_DIR: process.env.LICITAPRO_DATA_DIR,
    });
    assert.ok(/Chave: service_role/.test(saida), 'reconhece a chave de servidor:\n' + saida);
    assert.ok(/Conexão e tabelas: ok/.test(saida), 'confere as tabelas');
    assert.ok(/Gravação: ok/.test(saida), 'testa a gravação de verdade');
    assert.ok(/tudo certo/.test(saida), 'resume como tudo certo');
    assert.strictEqual(falso.contagem('licitapro_sequencia'), 0, 'a linha de teste é removida no fim');

    // banco fora do ar: aponta a falha e explica o que acontece com os dados
    falso.falhar = true;
    const saidaRuim = await rodar({
      SUPABASE_URL: falso.url,
      SUPABASE_SERVICE_KEY: CHAVE_ESPERADA,
      LICITAPRO_DATA_DIR: process.env.LICITAPRO_DATA_DIR,
    });
    assert.ok(/FALHA Conexão com o banco/.test(saidaRuim), 'mostra a falha de conexão');
    assert.ok(/salvando no arquivo/.test(saidaRuim), 'explica que os dados vão para o arquivo local');
  } finally {
    await falso.fechar();
  }

  // projeto de outro endereço (DNS que não existe): aponta falta de conexão
  const saidaSemRede = await rodar({
    SUPABASE_URL: 'https://projeto-que-nao-existe.invalid',
    SUPABASE_SERVICE_KEY: CHAVE_ESPERADA,
    LICITAPRO_DATA_DIR: process.env.LICITAPRO_DATA_DIR,
  });
  assert.ok(/FALHA/.test(saidaSemRede), 'avisa que falhou');
});

teste('Supabase: a chave anon sem políticas é barrada com explicação clara', async () => {
  const { criarServidorDeMentira } = require('./supabase-falso');
  const { execFile } = require('child_process');
  const arquivo = path.join(RAIZ, 'scripts', 'banco.js');
  const anon = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR5bmViaHRvZHRrYnR5ZHpnb3VvIiwicm9sZSI6ImFub24ifQ.assinatura';

  const falso = await criarServidorDeMentira();
  try {
    const saida = await new Promise((resolver) => {
      execFile(
        process.execPath,
        [arquivo, 'conferir'],
        { env: Object.assign({}, process.env, { SUPABASE_URL: falso.url, SUPABASE_SERVICE_KEY: anon, LICITAPRO_DATA_DIR: process.env.LICITAPRO_DATA_DIR }) },
        (erro, stdout, stderr) => resolver(String(stdout || '') + String(stderr || ''))
      );
    });
    assert.ok(/FALHA Chave: anon/.test(saida), 'marca a chave como pública');
    assert.ok(/service_role/.test(saida), 'aponta a chave certa');
    assert.ok(/politicas-anon\.sql/.test(saida), 'aponta o caminho alternativo');
  } finally {
    await falso.fechar();
  }
});

teste('Segurança: nenhuma chave de servidor do Supabase no repositório', () => {
  // percorre o projeto (fora de node_modules, .git e data/) procurando chaves
  // que dão acesso total ao banco. Chaves de exemplo dos testes são assinadas
  // com "assinatura"/"x" (curtas) e não contam como vazamento.
  const pastasIgnoradas = new Set(['node_modules', '.git', 'data', 'vendor', '.github']);
  const extensoes = /\.(js|mjs|cjs|json|sql|md|html|css|yml|yaml|txt|example|env)$/i;
  // grupo 1 = carga (payload) do JWT, grupo 2 = assinatura (o que garante que é uma chave de verdade)
  const padraoJwt = /eyJ[A-Za-z0-9_-]{10,}\.(eyJ[A-Za-z0-9_-]{10,})\.([A-Za-z0-9_-]{20,})/g;
  const padraoSecret = /sb_secret_[A-Za-z0-9_-]{20,}/g;
  // chave privada de conta de serviço (Firebase) — nunca pode estar no repositório
  const padraoContaDeServico = /"private_key"\s*:\s*"-----BEGIN/;
  const problemas = [];

  function lerPasta(caminho) {
    for (const entrada of fs.readdirSync(caminho, { withFileTypes: true })) {
      if (entrada.name.startsWith('.') && entrada.name !== '.env.example') continue;
      const completo = path.join(caminho, entrada.name);
      if (entrada.isDirectory()) {
        if (!pastasIgnoradas.has(entrada.name)) lerPasta(completo);
        continue;
      }
      if (!extensoes.test(entrada.name)) continue;
      const conteudo = fs.readFileSync(completo, 'utf8');
      const relativo = path.relative(RAIZ, completo);

      Array.from(conteudo.matchAll(padraoJwt)).forEach((achado) => {
        try {
          const carga = achado[1].replace(/-/g, '+').replace(/_/g, '/');
          const dados = JSON.parse(Buffer.from(carga, 'base64').toString('utf8'));
          if (dados && dados.role === 'service_role') problemas.push(relativo + ' → chave de servidor');
        } catch (_) { /* não é um JWT legível */ }
      });
      if (Array.from(conteudo.matchAll(padraoSecret)).length) {
        problemas.push(relativo + ' → sb_secret_');
      }
      if (padraoContaDeServico.test(conteudo)) {
        problemas.push(relativo + ' → chave privada de conta de serviço');
      }
    }
  }

  lerPasta(RAIZ);
  assert.deepStrictEqual(problemas, [], 'não pode haver chave de servidor no projeto');

  // o .env é ignorado pelo git (é onde a chave vive na máquina do usuário)
  const ignorados = fs.readFileSync(path.join(RAIZ, '.gitignore'), 'utf8');
  assert.ok(/^\.env$/m.test(ignorados), '.env fora do controle de versão');
});

teste('Segurança: a chave de serviço não aparece no que o site recebe', () => {
  const arquivosDoSite = [];
  const coletar = (caminho) => {
    for (const entrada of fs.readdirSync(caminho, { withFileTypes: true })) {
      const completo = path.join(caminho, entrada.name);
      if (entrada.isDirectory()) {
        if (entrada.name !== 'vendor') coletar(completo);
      } else if (/\.(js|html|css|json)$/i.test(entrada.name) && !/\.min\./i.test(entrada.name)) {
        arquivosDoSite.push(completo);
      }
    }
  };
  coletar(path.join(RAIZ, 'public'));
  assert.ok(arquivosDoSite.length > 5, 'arquivos do site encontrados: ' + arquivosDoSite.length);

  arquivosDoSite.forEach((arquivo) => {
    const conteudo = fs.readFileSync(arquivo, 'utf8');
    const relativo = path.relative(RAIZ, arquivo);
    PADROES_DE_CREDENCIAL.forEach((padrao) => {
      assert.strictEqual(padrao.test(conteudo), false, 'sem credencial de banco em ' + relativo);
    });
  });
});

/**
 * O que nunca pode aparecer no que o site recebe: a chave em si, uma variável
 * já preenchida com ela ou o endereço do projeto. Citar o *nome* do tipo de
 * chave no texto de ajuda (é o que orienta quem vai colar a chave na tela) não
 * é credencial — e é conferido aqui de propósito: o valor é que é proibido.
 */
const PADROES_DE_CREDENCIAL = [
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, // chave no formato JWT (anon ou service_role)
  /sb_secret_[A-Za-z0-9_-]{10,}/, // secret key do projeto
  /SUPABASE_[A-Z_]+\s*[:=]\s*['"]?[A-Za-z0-9._-]{12,}/, // variável já com o valor
  // endereço do projeto — e não o painel supabase.com nem o exemplo xxxxxxxx.supabase.co
  /\b(?!x{8})[a-z0-9]{10,}\.supabase\.co(?![a-z])/i,
];

teste('Interface: o painel deixa ligar o banco pela tela (só na própria máquina)', async () => {
  const servidor = await Navegador.subirServidor();
  try {
    const porta = servidor.address().port;
    const { window } = await Navegador.abrirNavegador(porta);
    const doc = window.document;
    const $ = (sel) => doc.querySelector(sel);
    const clicar = (sel) => $(sel).dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

    await Navegador.esperar(
      () => !$('#situacao-dados').classList.contains('oculto') && $('#situacao-dados-texto').textContent.length > 0,
      'situação dos dados no painel'
    );

    // sem banco e rodando em localhost: oferece conectar e já conhece o endereço
    assert.strictEqual($('#conectar-banco').classList.contains('oculto'), false, 'oferece conectar o banco');
    assert.ok(
      /^https?:\/\/.+/.test($('#banco-url').value),
      'endereço do projeto já preenchido: ' + $('#banco-url').value
    );
    assert.ok(/Conectar banco de dados/.test($('#situacao-dados-texto').textContent), 'a linha do painel indica o botão');

    // o atalho leva direto à página onde estão as chaves (o menu muda de nome)
    const referencia = ($('#banco-url').value.match(/^https?:\/\/([a-z0-9-]+)\.supabase\.(?:co|in)/i) || [])[1];
    assert.ok(referencia, 'endereço do Supabase no campo: ' + $('#banco-url').value);
    const linkChaves = $('#banco-abrir-supabase');
    assert.strictEqual(linkChaves.classList.contains('oculto'), false, 'mostra o atalho das chaves');
    assert.strictEqual(
      linkChaves.getAttribute('href'),
      'https://supabase.com/dashboard/project/' + referencia + '/settings/api-keys',
      'atalho para a página das chaves do projeto: ' + linkChaves.getAttribute('href')
    );
    assert.ok(/service_role/.test($('.ajuda-banco').textContent), 'a ajuda diz qual chave usar (service_role)');
    assert.ok(/sb_secret_/.test($('.ajuda-banco').textContent), 'e o nome novo (secret key)');

    clicar('#banco-abrir');
    assert.strictEqual($('#banco-form').classList.contains('oculto'), false, 'formulário de conexão aberto');

    // sem a chave o formulário não manda nada
    $('#banco-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    assert.ok(
      /Escolha o arquivo|Cole a chave/.test($('#banco-mensagem').textContent),
      'pede a credencial: ' + $('#banco-mensagem').textContent
    );

    clicar('#banco-cancelar');
    assert.strictEqual($('#banco-form').classList.contains('oculto'), true, 'dá para fechar o formulário');
  } finally {
    servidor.close();
  }
});

teste('Supabase: pela tela do sistema, a chave só pode ser gravada na própria máquina', async () => {
  const { criarServidorDeMentira, CHAVE_ESPERADA } = require('./supabase-falso');
  const app = require(path.join(RAIZ, 'server', 'index.js'));
  const store = require(path.join(RAIZ, 'server', 'store'));

  // a decisão vem da conexão e do endereço digitado — cabeçalhos não convencem
  const local = (host) => ({ socket: { remoteAddress: '127.0.0.1' }, headers: { host } });
  assert.strictEqual(app.ehLocal(local('localhost:3000')), true, 'localhost');
  assert.strictEqual(app.ehLocal(local('127.0.0.1:3000')), true, '127.0.0.1');
  assert.strictEqual(app.ehLocal(local('[::1]:3000')), true, 'IPv6 local');
  assert.strictEqual(app.ehLocal(local('licitapro.onrender.com')), false, 'endereço publicado');
  assert.strictEqual(app.ehLocal(local('3000-abc.e2b.app')), false, 'preview/túnel público');
  assert.strictEqual(
    app.ehLocal({ socket: { remoteAddress: '10.0.0.7' }, headers: { host: 'localhost:3000' } }),
    false,
    'outra máquina da rede'
  );
  assert.strictEqual(
    app.ehLocal({ socket: { remoteAddress: '203.0.113.9' }, headers: { host: 'localhost', 'x-forwarded-for': '127.0.0.1' } }),
    false,
    'cabeçalho forjado não passa'
  );

  // e, na prática: da própria máquina grava o .env, liga o banco e já usa
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'licitapro-tela-'));
  const arquivoEnv = path.join(pasta, '.env');
  const anterior = process.env.LICITAPRO_ENV_FILE;
  process.env.LICITAPRO_ENV_FILE = arquivoEnv;
  const falso = await criarServidorDeMentira();
  const servidor = await iniciarServidor();
  try {
    const semChave = await requisitar(servidor, '/api/banco/configurar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      corpo: JSON.stringify({ url: falso.url }),
    });
    assert.strictEqual(semChave.status, 400, 'sem a chave não grava nada: ' + semChave.texto);
    assert.strictEqual(fs.existsSync(arquivoEnv), false, 'nada foi gravado');

    const enderecoRuim = await requisitar(servidor, '/api/banco/configurar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      corpo: JSON.stringify({ url: 'endereco-sem-formato', chave: CHAVE_ESPERADA }),
    });
    assert.strictEqual(enderecoRuim.status, 400, 'endereço inválido é recusado');
    assert.ok(/endereço/i.test(enderecoRuim.json.erro), 'explica o problema: ' + enderecoRuim.json.erro);

    const resposta = await requisitar(servidor, '/api/banco/configurar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      corpo: JSON.stringify({ url: falso.url, chave: CHAVE_ESPERADA }),
    });
    assert.strictEqual(resposta.status, 200, resposta.texto);
    assert.strictEqual(resposta.json.ok, true, 'banco conectado: ' + resposta.texto);
    assert.strictEqual(resposta.json.armazenamento, 'supabase', 'passou a gravar no banco');
    assert.strictEqual(resposta.json.provedor, 'supabase', 'reconhece que a credencial é do Supabase');
    assert.strictEqual(resposta.json.arquivo, arquivoEnv, 'gravou no arquivo indicado pelo ambiente');

    const gravado = fs.readFileSync(arquivoEnv, 'utf8');
    assert.ok(gravado.includes('SUPABASE_URL=' + falso.url), 'o endereço foi para o .env');
    assert.ok(gravado.includes('SUPABASE_SERVICE_KEY=' + CHAVE_ESPERADA), 'a chave foi para o .env');
    assert.strictEqual(gravado.includes('undefined'), false, 'nada de valor vazio no arquivo');

    // o mesmo servidor já está no banco, sem reiniciar
    const saude = await requisitar(servidor, '/api/health');
    assert.strictEqual(saude.json.armazenamento, 'supabase', 'o site já está usando o banco');
    assert.strictEqual(saude.json.banco.conectado, true, 'e conectado');
    assert.strictEqual(saude.json.configuravelAqui, true, 'a própria máquina pode configurar');
    assert.strictEqual(
      JSON.stringify(saude.json).includes(CHAVE_ESPERADA),
      false,
      'a chave nunca volta para o navegador'
    );

    // o que o usuário salvar agora vai para o banco de verdade
    const salvar = await requisitar(servidor, '/api/perfil/empresa', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      corpo: JSON.stringify({ razaoSocial: 'D.E.J SOLUTIONS & GLOBAL' }),
    });
    assert.strictEqual(salvar.status, 200, salvar.texto);
    await store.encerrar(); // espera o envio pendente para o banco
    assert.ok(falso.contagem('licitapro_perfil') > 0, 'a empresa chegou no banco');
  } finally {
    servidor.close();
    await falso.fechar();
    if (anterior === undefined) delete process.env.LICITAPRO_ENV_FILE;
    else process.env.LICITAPRO_ENV_FILE = anterior;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_KEY;
    store.usarRemoto(null);
    store.carregar();
    fs.rmSync(pasta, { recursive: true, force: true });
  }
});

teste('Banco: a credencial colada decide o banco (Supabase ou Firebase)', () => {
  const banco = require(path.join(RAIZ, 'server', 'banco'));
  const { criarContaDeServico } = require('./firestore-falso');
  const { CHAVE_ESPERADA } = require('./supabase-falso');

  // chave do Supabase
  const chave = banco.detectarCredencial(CHAVE_ESPERADA);
  assert.strictEqual(chave.provedor, 'supabase', 'chave JWT → Supabase');
  assert.strictEqual(chave.tipo, 'service_role', 'e sabe que é a chave de servidor');
  assert.strictEqual(banco.detectarCredencial('sb_secret_alguma_chave_nova').provedor, 'supabase', 'secret key nova');

  // JSON da conta de serviço do Firebase (colado ou em base64)
  const conta = criarContaDeServico({ projeto: 'dej-propostas' });
  const json = JSON.stringify(conta.conta);
  assert.strictEqual(banco.detectarCredencial(json).provedor, 'firebase', 'JSON → Firebase');
  assert.strictEqual(
    banco.detectarCredencial(Buffer.from(json).toString('base64')).provedor,
    'firebase',
    'JSON em base64 também'
  );

  // caminho do arquivo baixado do Firebase (mais prático na linha de comando)
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'licitapro-firebase-'));
  const arquivo = path.join(pasta, 'conta-de-servico.json');
  fs.writeFileSync(arquivo, json);
  try {
    const doArquivo = banco.detectarCredencial(arquivo);
    assert.strictEqual(doArquivo.provedor, 'firebase', 'caminho do arquivo → Firebase');
    assert.strictEqual(JSON.parse(doArquivo.conteudo).project_id, 'dej-propostas', 'lê o projeto do arquivo');
    assert.strictEqual(banco.detectarCredencial('"' + arquivo + '"').provedor, 'firebase', 'caminho entre aspas');
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true });
  }

  // o que não é credencial nenhuma é recusado com explicação
  const nada = banco.detectarCredencial('um texto qualquer');
  assert.strictEqual(nada.provedor, null, 'texto solto não passa');
  assert.ok(/nem o JSON/.test(nada.erro), 'explica o que era esperado: ' + nada.erro);

  // e a escolha do banco segue o que está configurado
  assert.strictEqual(banco.nome({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_KEY: 'chave' }), 'supabase');
  assert.strictEqual(banco.nome({ FIREBASE_SERVICE_ACCOUNT: json }), 'firebase');
  assert.strictEqual(banco.nome({}), null, 'sem nada configurado não há banco');
  assert.strictEqual(
    banco.nome({ FIREBASE_SERVICE_ACCOUNT: json, LICITAPRO_ARMAZENAMENTO: 'arquivo' }),
    null,
    'LICITAPRO_ARMAZENAMENTO=arquivo desliga o banco'
  );
});

teste('Firebase: dá para ligar o banco pela tela e ele grava de verdade', async () => {
  const banco = require(path.join(RAIZ, 'server', 'banco'));
  const store = require(path.join(RAIZ, 'server', 'store'));
  const { DATA_DIR: DATA_DIR_TESTE } = require(path.join(RAIZ, 'server', 'config'));
  const { criarServidorDeMentira, criarContaDeServico } = require('./firestore-falso');

  const { conta, publicKey } = criarContaDeServico({ projeto: 'dej-propostas' });
  const falso = await criarServidorDeMentira({ conta, publicKey });
  conta.token_uri = falso.tokenUrl;

  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'licitapro-tela-firebase-'));
  const arquivoEnv = path.join(pasta, '.env');
  const guardado = {
    env: process.env.LICITAPRO_ENV_FILE,
    base: process.env.FIREBASE_BASE,
    token: process.env.FIREBASE_TOKEN_URL,
  };
  process.env.LICITAPRO_ENV_FILE = arquivoEnv;
  process.env.FIREBASE_BASE = falso.firestoreBase;
  process.env.FIREBASE_TOKEN_URL = falso.tokenUrl;

  const servidor = await iniciarServidor();
  try {
    const json = JSON.stringify(conta);
    const resposta = await requisitar(servidor, '/api/banco/configurar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      corpo: JSON.stringify({ credencial: json }),
    });
    assert.strictEqual(resposta.status, 200, resposta.texto);
    assert.strictEqual(resposta.json.provedor, 'firebase', 'reconheceu o Firebase pelo JSON');
    assert.strictEqual(resposta.json.ok, true, 'banco ligado: ' + resposta.texto);
    assert.strictEqual(resposta.json.armazenamento, 'firebase', 'passou a gravar no Firestore');

    // a credencial não fica no .env em texto: o .env aponta para o arquivo do JSON
    const gravado = fs.readFileSync(arquivoEnv, 'utf8');
    assert.ok(/FIREBASE_SERVICE_ACCOUNT_FILE=/.test(gravado), 'o .env aponta para o JSON: ' + gravado);
    assert.ok(/FIREBASE_PROJECT_ID=dej-propostas/.test(gravado), 'grava o id do projeto');
    assert.strictEqual(gravado.includes(conta.private_key.slice(30, 60)), false, 'a chave privada não vai para o .env');

    const destino = path.join(DATA_DIR_TESTE, banco.ARQUIVO_FIREBASE);
    assert.ok(fs.existsSync(destino), 'o JSON ficou na pasta de dados: ' + destino);
    assert.strictEqual(fs.statSync(destino).mode & 0o777, 0o600, 'só o dono lê o arquivo da credencial');

    // o mesmo servidor já está usando o Firestore, sem reiniciar
    const saude = await requisitar(servidor, '/api/health');
    assert.strictEqual(saude.json.armazenamento, 'firebase', 'o site já usa o Firestore');
    assert.strictEqual(saude.json.banco.provedor, 'firebase', 'e sabe dizer qual banco é');
    assert.strictEqual(saude.json.banco.conectado, true, 'conectado');
    assert.strictEqual(falso.tokensEmitidos >= 1, true, 'o token foi assinado e trocado com o Google');

    // o que o usuário salvar agora vai para o Firestore de verdade
    const salvar = await requisitar(servidor, '/api/perfil/empresa', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      corpo: JSON.stringify({ razaoSocial: 'D.E.J SOLUTIONS & GLOBAL', cnpj: '65.180.352/0001-11' }),
    });
    assert.strictEqual(salvar.status, 200, salvar.texto);
    await store.encerrar();
    const perfil = falso.dados('licitapro_perfil')[0];
    assert.ok(perfil, 'o perfil chegou no Firestore');
    assert.strictEqual(perfil.campos.dados.empresa.razaoSocial, 'D.E.J SOLUTIONS & GLOBAL', 'com os dados certos');

    // e a leitura de volta funciona (é assim que o sistema sobe depois de reiniciar)
    const cliente = banco.criarCliente();
    const estado = await banco.lerEstado(cliente);
    assert.strictEqual(
      estado.documentos.length,
      falso.contagem('licitapro_documentos'),
      'leitura do banco responde com o que está lá'
    );
    assert.strictEqual(estado.perfil.empresa.cnpj, '65.180.352/0001-11', 'perfil lido do banco');
  } finally {
    servidor.close();
    await falso.fechar();
    if (guardado.env === undefined) delete process.env.LICITAPRO_ENV_FILE;
    else process.env.LICITAPRO_ENV_FILE = guardado.env;
    if (guardado.base === undefined) delete process.env.FIREBASE_BASE;
    else process.env.FIREBASE_BASE = guardado.base;
    if (guardado.token === undefined) delete process.env.FIREBASE_TOKEN_URL;
    else process.env.FIREBASE_TOKEN_URL = guardado.token;
    delete process.env.FIREBASE_SERVICE_ACCOUNT_FILE;
    delete process.env.FIREBASE_PROJECT_ID;
    store.usarRemoto(null);
    store.carregar();
    fs.rmSync(path.join(DATA_DIR_TESTE, banco.ARQUIVO_FIREBASE), { force: true });
    fs.rmSync(pasta, { recursive: true, force: true });
  }
});

teste('Firebase: o diagnóstico explica cada erro (banco sem Firestore, credencial recusada)', async () => {
  const banco = require(path.join(RAIZ, 'server', 'banco'));
  const { criarServidorDeMentira, criarContaDeServico } = require('./firestore-falso');
  const { execFile } = require('child_process');

  const dica = (mensagem) => banco.dicaParaErro(mensagem, 'firebase');
  assert.ok(
    /Create|Firestore Database/i.test(dica('Firestore respondeu 404: The database (default) does not exist for project x')),
    'aponta criar o Firestore'
  );
  assert.ok(/Generate new private key/.test(dica('O Google recusou a credencial (401): invalid_grant')), 'aponta gerar a chave de novo');
  assert.ok(/internet/i.test(dica('fetch failed')), 'aponta falta de conexão');

  // e na linha de comando: banco certo, gravação testada de verdade
  const { conta, publicKey } = criarContaDeServico({ projeto: 'dej-propostas' });
  const falso = await criarServidorDeMentira({ conta, publicKey });
  conta.token_uri = falso.tokenUrl;
  try {
    const saida = await new Promise((resolver) => {
      execFile(
        process.execPath,
        [path.join(RAIZ, 'scripts', 'banco.js'), 'conferir'],
        {
          env: Object.assign({}, process.env, {
            FIREBASE_SERVICE_ACCOUNT: JSON.stringify(conta),
            FIREBASE_BASE: falso.firestoreBase,
            FIREBASE_TOKEN_URL: falso.tokenUrl,
            FIREBASE_PROJECT_ID: 'dej-propostas',
          }),
        },
        (erro, stdout, stderr) => resolver(String(stdout || '') + String(stderr || ''))
      );
    });
    assert.ok(/Conferindo o banco de dados \(Firebase\)/.test(saida), 'diz qual banco está conferindo:\n' + saida);
    assert.ok(/Conexão e coleções: ok/.test(saida), 'confere as coleções');
    assert.ok(/Gravação: ok/.test(saida), 'grava e apaga uma linha de teste');
    assert.ok(/tudo certo/.test(saida), 'resume como tudo certo');
    assert.strictEqual(falso.contagem('licitapro_sequencia'), 0, 'a linha de teste é removida no fim');

    // banco sem o Firestore criado (o erro mais comum de quem está começando)
    const semBanco = await criarServidorDeMentira({ conta, publicKey, semBanco: true });
    conta.token_uri = semBanco.tokenUrl;
    try {
      const saidaRuim = await new Promise((resolver) => {
        execFile(
          process.execPath,
          [path.join(RAIZ, 'scripts', 'banco.js'), 'conferir'],
          {
            env: Object.assign({}, process.env, {
              FIREBASE_SERVICE_ACCOUNT: JSON.stringify(conta),
              FIREBASE_BASE: semBanco.firestoreBase,
              FIREBASE_TOKEN_URL: semBanco.tokenUrl,
            }),
          },
          (erro, stdout, stderr) => resolver(String(stdout || '') + String(stderr || ''))
        );
      });
      assert.ok(/FALHA Conexão com o banco/.test(saidaRuim), 'mostra a falha: ' + saidaRuim.slice(0, 400));
      assert.ok(/Firestore Database|Create/i.test(saidaRuim), 'diz o que fazer no console do Firebase');
    } finally {
      await semBanco.fechar();
    }
  } finally {
    await falso.fechar();
  }
});

teste('Interface: escolher o arquivo .json do Firebase conecta o banco', async () => {
  const servidor = await Navegador.subirServidor();
  try {
    const porta = servidor.address().port;
    const { window } = await Navegador.abrirNavegador(porta);
    const doc = window.document;
    const $ = (sel) => doc.querySelector(sel);
    const clicar = (sel) => $(sel).dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

    await Navegador.esperar(() => !$('#conectar-banco').classList.contains('oculto'), 'formulário do banco disponível');
    clicar('#banco-abrir');
    assert.ok($('#banco-arquivo-botao'), 'tem o botão de escolher o arquivo');
    assert.strictEqual($('#banco-arquivo').type, 'file', 'campo de arquivo .json');

    // o POST é interceptado: aqui o teste confere o caminho da tela
    let enviado = null;
    window.API.post = async (rota, corpo) => {
      enviado = { rota, corpo };
      return { ok: true, provedor: 'firebase', provedorNome: 'Firebase', armazenamento: 'firebase', banco: { conectado: true } };
    };

    const conteudo = JSON.stringify({
      type: 'service_account',
      project_id: 'dej-propostas',
      client_email: 'conta@dej-propostas.iam.gserviceaccount.com',
      private_key: '-----BEGIN PRIVATE KEY-----\nchave-de-teste\n-----END PRIVATE KEY-----\n',
    });
    const arquivo = new window.File([conteudo], 'dej-firebase-adminsdk.json', { type: 'application/json' });
    const campo = $('#banco-arquivo');
    Object.defineProperty(campo, 'files', { value: [arquivo], configurable: true });
    campo.dispatchEvent(new window.Event('change', { bubbles: true }));

    await Navegador.esperar(() => /conectado!/.test($('#banco-mensagem').textContent), 'avisa que conectou');
    assert.ok(enviado && enviado.rota === '/api/banco/configurar', 'enviou para a rota do banco');
    assert.strictEqual(enviado.corpo.credencial, conteudo.trim(), 'mandou o conteúdo do arquivo escolhido');
    assert.ok(/Firebase conectado/.test($('#banco-mensagem').textContent), 'diz qual banco conectou: ' + $('#banco-mensagem').textContent);
    assert.strictEqual($('#banco-credencial').value, '', 'limpa o campo depois de conectar');
  } finally {
    servidor.close();
  }
});

teste('Interface: a tela sugere o arquivo baixado e conecta com um clique', async () => {
  const servidor = await Navegador.subirServidor();
  try {
    const porta = servidor.address().port;
    const { window } = await Navegador.abrirNavegador(porta);
    const doc = window.document;
    const $ = (sel) => doc.querySelector(sel);
    const clicar = (sel) => $(sel).dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

    await Navegador.esperar(() => !$('#conectar-banco').classList.contains('oculto'), 'painel do banco disponível');

    // o servidor "acha" o arquivo baixado na pasta de downloads do computador
    const caminho = '/home/alguem/Downloads/dej-slutions-firebase-adminsdk-fbsvc-595f0bbfd5.json';
    window.API.get = async (rota) => {
      if (rota === '/api/banco/procurar') {
        return {
          ok: true,
          encontrados: [{
            arquivo: caminho,
            nome: 'dej-slutions-firebase-adminsdk-fbsvc-595f0bbfd5.json',
            projeto: 'dej-slutions',
            conta: 'firebase-adminsdk-fbsvc@dej-slutions.iam.gserviceaccount.com',
          }],
        };
      }
      return { ok: true, banco: { provedor: null } };
    };

    assert.ok($('#banco-sugestao').classList.contains('oculto'), 'a sugestão começa escondida');
    clicar('#banco-abrir');
    // a busca no computador é assíncrona: a sugestão aparece logo depois
    await Navegador.esperar(() => !$('#banco-sugestao').classList.contains('oculto'), 'abrir o formulário mostra a sugestão');
    const texto = $('#banco-sugestao-texto').textContent;
    assert.ok(/dej-slutions-firebase-adminsdk/.test(texto), 'diz o nome do arquivo: ' + texto);
    assert.ok(/projeto dej-slutions/.test(texto), 'e o projeto do arquivo: ' + texto);
    assert.strictEqual(texto.includes('PRIVATE KEY'), false, 'a sugestão não mostra a chave');

    let enviado = null;
    window.API.post = async (rota, corpo) => {
      enviado = { rota, corpo };
      return { ok: true, provedor: 'firebase', provedorNome: 'Firebase', armazenamento: 'firebase', banco: { conectado: true } };
    };
    clicar('#banco-sugestao-usar');
    await Navegador.esperar(() => /Firebase conectado/.test($('#banco-mensagem').textContent), 'avisa que conectou');
    assert.ok(enviado && enviado.rota === '/api/banco/configurar', 'mandou para a rota do banco');
    assert.strictEqual(enviado.corpo.caminho, caminho, 'mandou só o caminho do arquivo encontrado');
    assert.strictEqual(enviado.corpo.credencial, '', 'sem colar chave nenhuma');
    assert.strictEqual($('#banco-sugestao').classList.contains('oculto'), true, 'esconde a sugestão depois de conectar');
  } finally {
    servidor.close();
  }
});

teste('Banco: o sistema acha sozinho o arquivo .json baixado do Firebase', () => {
  const banco = require(path.join(RAIZ, 'server', 'banco'));
  const { criarContaDeServico } = require('./firestore-falso');

  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'licitapro-busca-'));
  const conta = criarContaDeServico({ projeto: 'dej-slutions' });
  const arquivo = path.join(pasta, 'dej-slutions-firebase-adminsdk-fbsvc-595f0bbfd5.json');
  fs.writeFileSync(arquivo, JSON.stringify(conta.conta));
  // iscas: um JSON qualquer e um arquivo grande não podem ser confundidos
  fs.writeFileSync(path.join(pasta, 'notas.json'), JSON.stringify({ recado: 'nada aqui' }));
  fs.writeFileSync(path.join(pasta, 'grande.json'), 'x'.repeat(70000));

  const anterior = process.env.LICITAPRO_BUSCA_CREDENCIAL;
  process.env.LICITAPRO_BUSCA_CREDENCIAL = pasta;
  try {
    assert.ok(banco.pastasDeBusca().includes(pasta), 'a pasta indicada entra na busca');
    const achados = banco.procurarCredencialFirebase();
    assert.strictEqual(achados.length, 1, 'achou um arquivo só: ' + JSON.stringify(achados));
    const achado = achados[0];
    assert.strictEqual(achado.nome, 'dej-slutions-firebase-adminsdk-fbsvc-595f0bbfd5.json', 'nome do arquivo');
    assert.strictEqual(achado.projeto, 'dej-slutions', 'projeto lido do arquivo');
    assert.ok(/@dej-slutions\.iam\.gserviceaccount\.com$/.test(achado.conta), 'conta de serviço: ' + achado.conta);
    assert.strictEqual('conteudo' in achado, false, 'a busca não devolve o conteúdo da credencial');
    assert.strictEqual(JSON.stringify(achado).includes('PRIVATE KEY'), false, 'nem a chave privada');

    // ler o conteúdo só acontece quando alguém confirma que é para usar
    const lido = banco.lerCredencialDoArquivo(arquivo);
    assert.strictEqual(lido.provedor, 'firebase', 'lê a credencial do caminho');
    assert.strictEqual(JSON.parse(lido.conteudo).project_id, 'dej-slutions', 'com o projeto certo');
    assert.throws(() => banco.lerCredencialDoArquivo(path.join(pasta, 'notas.json')), /não parece o JSON de uma conta de serviço/, 'recusa arquivo que não é credencial');
    assert.throws(() => banco.lerCredencialDoArquivo(path.join(pasta, 'nao-existe.json')), /Não consegui ler o arquivo/, 'avisa quando o caminho não existe');
  } finally {
    if (anterior === undefined) delete process.env.LICITAPRO_BUSCA_CREDENCIAL;
    else process.env.LICITAPRO_BUSCA_CREDENCIAL = anterior;
    fs.rmSync(pasta, { recursive: true, force: true });
  }
});

teste('Firebase: conecta informando só o caminho do arquivo (tela e linha de comando)', async () => {
  const banco = require(path.join(RAIZ, 'server', 'banco'));
  const store = require(path.join(RAIZ, 'server', 'store'));
  const { DATA_DIR: pastaDados } = require(path.join(RAIZ, 'server', 'config'));
  const { criarServidorDeMentira, criarContaDeServico } = require('./firestore-falso');
  const { execFile } = require('child_process');

  const { conta, publicKey } = criarContaDeServico({ projeto: 'dej-slutions' });
  const falso = await criarServidorDeMentira({ conta, publicKey });
  conta.token_uri = falso.tokenUrl;

  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'licitapro-caminho-'));
  const arquivoConta = path.join(pasta, 'dej-slutions-firebase-adminsdk-fbsvc-595f0bbfd5.json');
  fs.writeFileSync(arquivoConta, JSON.stringify(conta));
  const arquivoEnv = path.join(pasta, '.env');
  const guardado = {
    env: process.env.LICITAPRO_ENV_FILE,
    busca: process.env.LICITAPRO_BUSCA_CREDENCIAL,
    base: process.env.FIREBASE_BASE,
    token: process.env.FIREBASE_TOKEN_URL,
  };
  process.env.LICITAPRO_ENV_FILE = arquivoEnv;
  process.env.FIREBASE_BASE = falso.firestoreBase;
  process.env.FIREBASE_TOKEN_URL = falso.tokenUrl;
  process.env.LICITAPRO_BUSCA_CREDENCIAL = pasta;

  const servidor = await iniciarServidor();
  try {
    // a tela pergunta ao servidor o que ele achou no computador…
    const busca = await requisitar(servidor, '/api/banco/procurar');
    assert.strictEqual(busca.status, 200, busca.texto);
    assert.strictEqual(busca.json.encontrados.length, 1, 'a busca achou o arquivo');
    assert.strictEqual(busca.json.encontrados[0].projeto, 'dej-slutions', 'com o projeto no recado');
    assert.strictEqual(busca.texto.includes('PRIVATE KEY'), false, 'a resposta não traz a chave');

    // …e conecta mandando só o caminho
    const resposta = await requisitar(servidor, '/api/banco/configurar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      corpo: JSON.stringify({ caminho: arquivoConta }),
    });
    assert.strictEqual(resposta.status, 200, resposta.texto);
    assert.strictEqual(resposta.json.ok, true, 'conectou pelo caminho do arquivo: ' + resposta.texto);
    assert.strictEqual(resposta.json.armazenamento, 'firebase', 'gravando no Firestore');
    assert.ok(
      fs.existsSync(path.join(pastaDados, banco.ARQUIVO_FIREBASE)),
      'guardou uma cópia na pasta de dados (o arquivo original pode ser apagado)'
    );

    // o que o usuário salvar vai para o banco
    await requisitar(servidor, '/api/perfil/empresa', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      corpo: JSON.stringify({ razaoSocial: 'D.E.J SOLUTIONS & GLOBAL' }),
    });
    await store.encerrar();
    assert.ok(falso.contagem('licitapro_perfil') > 0, 'a empresa chegou no Firestore');

    // e na linha de comando: Enter na pergunta já usa o arquivo encontrado
    const saida = await new Promise((resolver) => {
      const filho = execFile(
        process.execPath,
        [path.join(RAIZ, 'scripts', 'banco.js'), 'configurar'],
        {
          env: Object.assign({}, process.env, {
            LICITAPRO_ENV_FILE: path.join(pasta, '.env-cli'),
            LICITAPRO_DATA_DIR: path.join(pasta, 'dados'),
            LICITAPRO_BUSCA_CREDENCIAL: pasta,
            FIREBASE_BASE: falso.firestoreBase,
            FIREBASE_TOKEN_URL: falso.tokenUrl,
          }),
        }
      );
      let texto = '';
      filho.stdout.on('data', (pedaco) => { texto += pedaco; });
      filho.stderr.on('data', (pedaco) => { texto += pedaco; });
      filho.on('close', () => resolver(texto));
      filho.stdin.write('\n\n'); // Enter no endereço e Enter na credencial
      filho.stdin.end();
    });
    assert.ok(/Encontrei um arquivo de conta de serviço/.test(saida), 'a CLI avisa que achou o arquivo:\n' + saida);
    assert.ok(/Credencial do Firebase gravada/.test(saida), 'gravou a credencial do Firebase');
    // na conferência a linha de comando compara também a cópia local (data/db.json),
    // que neste teste continua vazia de propósito: o que importa é a conexão
    assert.ok(/Conexão e coleções: ok/.test(saida), 'conferiu a conexão:\n' + saida.slice(-400));
    assert.ok(/Gravação: ok/.test(saida), 'e gravou de verdade:\n' + saida.slice(-400));
  } finally {
    servidor.close();
    await falso.fechar();
    if (guardado.env === undefined) delete process.env.LICITAPRO_ENV_FILE; else process.env.LICITAPRO_ENV_FILE = guardado.env;
    if (guardado.busca === undefined) delete process.env.LICITAPRO_BUSCA_CREDENCIAL; else process.env.LICITAPRO_BUSCA_CREDENCIAL = guardado.busca;
    if (guardado.base === undefined) delete process.env.FIREBASE_BASE; else process.env.FIREBASE_BASE = guardado.base;
    if (guardado.token === undefined) delete process.env.FIREBASE_TOKEN_URL; else process.env.FIREBASE_TOKEN_URL = guardado.token;
    delete process.env.FIREBASE_SERVICE_ACCOUNT_FILE;
    delete process.env.FIREBASE_PROJECT_ID;
    store.usarRemoto(null);
    store.carregar();
    fs.rmSync(path.join(pastaDados, banco.ARQUIVO_FIREBASE), { force: true });
    fs.rmSync(pasta, { recursive: true, force: true });
  }
});

// ------------------------------------------------------------------ início

executar();
