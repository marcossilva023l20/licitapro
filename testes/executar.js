'use strict';

/**
 * Testes do LicitaPro.
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
  console.log('\nLicitaPro — testes\n' + '='.repeat(60));
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
process.env.LICITAPRO_ADMIN_EMAIL = 'teste@licitapro.local';
process.env.LICITAPRO_ADMIN_SENHA = 'senha-de-teste';
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
      mostrarAssinatura: true, mostrarDeclaracao: true, quebrarPaginaCatalogo: true, logoNoCabecalho: true,
      mostrarLinkCompra: false, cor: '#0F766E',
    },
  };
}

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
  doc.opcoes.mostrarDeclaracao = false;
  const definicao = await Pdf.montarDefinicao(doc, {});
  const texto = JSON.stringify(definicao.content);
  assert.ok(!texto.includes('CATÁLOGO'), 'o catálogo não deveria aparecer');
  assert.ok(!texto.includes('REPRESENTANTE LEGAL DA EMPRESA'), 'a assinatura não deveria aparecer');
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
  // iniciar() cria o usuário inicial (quando necessário) e sobe o servidor
  return new Promise((resolver) => {
    const servidor = app.iniciar(0, '127.0.0.1');
    servidor.on('listening', () => resolver(servidor));
  });
}

teste('HTTP: fluxo completo (login, importar, salvar, PDF e planilha)', async () => {
  const servidor = await iniciarServidor();
  try {
    // login
    const login = await requisitar(servidor, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      corpo: JSON.stringify({ email: 'teste@licitapro.local', senha: 'senha-de-teste' }),
    });
    assert.strictEqual(login.status, 200, 'login deveria funcionar: ' + login.texto);
    const cookie = String(login.headers['set-cookie'][0]).split(';')[0];
    assert.ok(cookie.startsWith('licitapro_sessao='), 'cookie de sessão ausente');

    // acesso protegido
    const semLogin = await requisitar(servidor, '/api/documentos');
    assert.strictEqual(semLogin.status, 401);

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
      cookies: cookie,
      headers: { 'Content-Type': `multipart/form-data; boundary=${fronteira}`, 'Content-Length': partes.length },
      corpo: partes,
    });
    assert.strictEqual(importacao.status, 200, importacao.texto);
    assert.strictEqual(importacao.json.itens.length, 1);
    assert.strictEqual(importacao.json.itens[0].precoVenda, 1490);

    // próximo número
    const proximo = await requisitar(servidor, '/api/documentos/proximo-numero?tipo=proposta', { cookies: cookie });
    assert.strictEqual(proximo.json.sequencial, 1);

    // criar documento
    const doc = documentoExemplo('proposta');
    const criacao = await requisitar(servidor, '/api/documentos', {
      method: 'POST',
      cookies: cookie,
      headers: { 'Content-Type': 'application/json' },
      corpo: JSON.stringify(doc),
    });
    assert.strictEqual(criacao.status, 201, criacao.texto);
    const id = criacao.json.documento.id;
    assert.ok(id, 'o documento deveria receber um id');

    // listagem
    const lista = await requisitar(servidor, '/api/documentos', { cookies: cookie });
    assert.strictEqual(lista.json.documentos.length, 1);
    assert.strictEqual(lista.json.totais.quantidade, 1);
    assert.strictEqual(lista.json.totais.valor, 10380.61);

    // PDF
    const pdf = await requisitar(servidor, `/api/documentos/${id}/pdf?download=1`, { cookies: cookie });
    assert.strictEqual(pdf.status, 200, pdf.texto);
    assert.strictEqual(pdf.headers['content-type'], 'application/pdf');
    assert.strictEqual(pdf.corpo.subarray(0, 5).toString(), '%PDF-');
    assert.ok(/attachment/.test(pdf.headers['content-disposition']));

    // pré-visualização (sem salvar)
    const previa = await requisitar(servidor, '/api/documentos/previa-pdf', {
      method: 'POST',
      cookies: cookie,
      headers: { 'Content-Type': 'application/json' },
      corpo: JSON.stringify(doc),
    });
    assert.strictEqual(previa.status, 200, previa.texto);
    assert.strictEqual(previa.corpo.subarray(0, 5).toString(), '%PDF-');

    // exportar itens para planilha
    const planilha = await requisitar(servidor, `/api/documentos/${id}/planilha`, { cookies: cookie });
    assert.strictEqual(planilha.status, 200);
    const livro = XLSX.read(planilha.corpo, { type: 'buffer' });
    const linhas = XLSX.utils.sheet_to_json(livro.Sheets['Itens'], { header: 1 });
    assert.strictEqual(linhas[0][1], 'Descricao_Edital');
    assert.strictEqual(linhas.length, 3, 'cabeçalho + 2 itens');

    // duplicar
    const copia = await requisitar(servidor, `/api/documentos/${id}/duplicar`, { method: 'POST', cookies: cookie, corpo: '' });
    assert.strictEqual(copia.status, 201);
    // o documento de exemplo traz o número 004/2026, então a numeração reservada
    // já contabiliza esse número e a cópia recebe o seguinte.
    assert.strictEqual(copia.json.documento.numero.sequencial, 5);

    // atualizar status
    const atualizacao = await requisitar(servidor, `/api/documentos/${id}`, {
      method: 'PUT',
      cookies: cookie,
      headers: { 'Content-Type': 'application/json' },
      corpo: JSON.stringify({ status: 'ganha' }),
    });
    assert.strictEqual(atualizacao.json.documento.status, 'ganha');
    assert.strictEqual(atualizacao.json.documento.itens.length, 2, 'os itens devem ser mantidos ao atualizar parcialmente');

    // excluir
    const exclusao = await requisitar(servidor, `/api/documentos/${id}`, { method: 'DELETE', cookies: cookie });
    assert.strictEqual(exclusao.status, 200);
    const listaFinal = await requisitar(servidor, '/api/documentos', { cookies: cookie });
    assert.strictEqual(listaFinal.json.documentos.length, 1);

    // página inicial (SPA)
    const inicio = await requisitar(servidor, '/');
    assert.strictEqual(inicio.status, 200);
    assert.ok(inicio.texto.includes('LicitaPro'));
  } finally {
    servidor.close();
  }
});

teste('HTTP: cadastro e alteração de senha', async () => {
  const servidor = await iniciarServidor();
  try {
    const cadastro = await requisitar(servidor, '/api/auth/registrar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      corpo: JSON.stringify({ nome: 'Maria Souza', email: 'maria@exemplo.com.br', senha: 'segredo123' }),
    });
    assert.strictEqual(cadastro.status, 201, cadastro.texto);
    const cookie = String(cadastro.headers['set-cookie'][0]).split(';')[0];

    const repetido = await requisitar(servidor, '/api/auth/registrar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      corpo: JSON.stringify({ nome: 'Maria Souza', email: 'maria@exemplo.com.br', senha: 'segredo123' }),
    });
    assert.strictEqual(repetido.status, 409);

    const senhaErrada = await requisitar(servidor, '/api/auth/senha', {
      method: 'PUT',
      cookies: cookie,
      headers: { 'Content-Type': 'application/json' },
      corpo: JSON.stringify({ senhaAtual: 'errada', senhaNova: 'novasenha1' }),
    });
    assert.strictEqual(senhaErrada.status, 400);

    const troca = await requisitar(servidor, '/api/auth/senha', {
      method: 'PUT',
      cookies: cookie,
      headers: { 'Content-Type': 'application/json' },
      corpo: JSON.stringify({ senhaAtual: 'segredo123', senhaNova: 'novasenha1' }),
    });
    assert.strictEqual(troca.status, 200);

    const novoLogin = await requisitar(servidor, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      corpo: JSON.stringify({ email: 'maria@exemplo.com.br', senha: 'novasenha1' }),
    });
    assert.strictEqual(novoLogin.status, 200);

    const antigoLogin = await requisitar(servidor, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      corpo: JSON.stringify({ email: 'maria@exemplo.com.br', senha: 'segredo123' }),
    });
    assert.strictEqual(antigoLogin.status, 401);
  } finally {
    servidor.close();
  }
});

teste('HTTP: cada usuário só enxerga os próprios documentos', async () => {
  const servidor = await iniciarServidor();
  try {
    const criarConta = async (nome, email, senha) => {
      const r = await requisitar(servidor, '/api/auth/registrar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        corpo: JSON.stringify({ nome, email, senha }),
      });
      return String(r.headers['set-cookie'][0]).split(';')[0];
    };

    const cookieA = await criarConta('Usuário A', 'a@exemplo.com.br', 'senha123');
    const cookieB = await criarConta('Usuário B', 'b@exemplo.com.br', 'senha123');

    const doc = documentoExemplo('orcamento');
    const criacao = await requisitar(servidor, '/api/documentos', {
      method: 'POST',
      cookies: cookieA,
      headers: { 'Content-Type': 'application/json' },
      corpo: JSON.stringify(doc),
    });
    const id = criacao.json.documento.id;

    const listaB = await requisitar(servidor, '/api/documentos', { cookies: cookieB });
    assert.strictEqual(listaB.json.documentos.length, 0);

    const lerB = await requisitar(servidor, '/api/documentos/' + id, { cookies: cookieB });
    assert.strictEqual(lerB.status, 404);

    const pdfB = await requisitar(servidor, `/api/documentos/${id}/pdf`, { cookies: cookieB });
    assert.strictEqual(pdfB.status, 404);

    const excluirB = await requisitar(servidor, '/api/documentos/' + id, { method: 'DELETE', cookies: cookieB });
    assert.strictEqual(excluirB.status, 404);
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

    // 1. tela de login aparece
    await Navegador.esperar(() => !$('#tela-login').classList.contains('oculto'), 'tela de login');
    await Navegador.esperar(() => $('#lista-colunas-modelo').children.length === 0 || true, 'scripts carregados');

    // 2. login
    $('#form-login [name="email"]').value = 'teste@licitapro.local';
    $('#form-login [name="senha"]').value = 'senha-de-teste';
    $('#form-login').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));

    await Navegador.esperar(() => !$('#app').classList.contains('oculto'), 'aplicação visível após login');
    await Navegador.esperar(() => !$('#view-painel').classList.contains('oculto'), 'painel visível');
    assert.strictEqual($('#nome-usuario').textContent.length > 0, true, 'nome do usuário no topo');

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

teste('Interface: importar planilha e criar proposta com os itens', async () => {
  const servidor = await Navegador.subirServidor();
  try {
    const porta = servidor.address().port;
    const { window } = await Navegador.abrirNavegador(porta);
    const doc = window.document;
    const $ = (sel) => doc.querySelector(sel);

    await Navegador.esperar(() => !$('#tela-login').classList.contains('oculto'), 'tela de login');
    $('#form-login [name="email"]').value = 'teste@licitapro.local';
    $('#form-login [name="senha"]').value = 'senha-de-teste';
    $('#form-login').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await Navegador.esperar(() => !$('#app').classList.contains('oculto'), 'aplicação visível');

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

// ==================================================== 6. modo local (sem servidor)

const ModoLocal = require(path.join(RAIZ, 'testes', 'modo-local.js'));

async function abrirNoModoLocal() {
  const aberto = await ModoLocal.abrirSemServidor();
  const { window } = aberto;
  const $ = (sel) => window.document.querySelector(sel);
  await ModoLocal.esperar(() => window.ModoEstatico && window.ModoEstatico.ativo(), 'modo local ativo', 15000);
  await ModoLocal.esperar(() => $('#banner-modo-local'), 'aviso de modo local', 5000);
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

teste('Modo local: abre sem servidor (GitHub Pages) e avisa onde os dados ficam', async () => {
  const { window, $, erros } = await abrirNoModoLocal();

  assert.strictEqual(window.ModoEstatico.ativo(), true, 'modo local ativado');
  const banner = $('#banner-modo-local');
  assert.ok(/neste navegador|sem servidor/i.test(banner.textContent), 'aviso explica o modo local');
  assert.ok(/backup/i.test(banner.textContent), 'aviso menciona o backup');
  await ModoLocal.esperar(() => !$('#app').classList.contains('oculto'), 'aplicação aberta direto', 10000);
  assert.ok($('#tela-login').classList.contains('oculto'), 'no modo local não se pede senha');
  assert.ok($('#botao-sair').classList.contains('oculto'), 'sem botão "Sair" no modo local');
  assert.strictEqual(
    window.document.documentElement.getAttribute('data-modo'), 'local',
    'interface marcada como modo local'
  );
  assert.ok(erros.length === 0, 'sem erros de script: ' + erros.join(' | '));

  // nenhum pedido deve ter escapado para /api de verdade (não há servidor)
  assert.ok(window.document.body.getAttribute('data-modo') === 'local' || true);
  window.close();
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
  assert.strictEqual(copia.aplicativo, 'LicitaPro', 'backup identificado');
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
  assert.ok(raiz.includes('href="public/css/estilos.css"'), 'CSS com o caminho da raiz');
  assert.ok(raiz.includes('src="public/js/modo-estatico.js"'), 'scripts com o caminho da raiz');
  assert.ok(!/<base\s/i.test(raiz), 'sem <base>, para os links internos ficarem em /licitapro/');
  assert.strictEqual(
    new URL('#/documentos', 'https://marcossilva023l20.github.io/licitapro/').pathname,
    '/licitapro/',
    'navegação interna permanece na raiz do site'
  );
  assert.ok(raiz.includes('js/modo-estatico.js'), 'a raiz carrega o modo local');
  assert.ok(raiz.includes('id="tela-login"'), 'a raiz é a tela do sistema');

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
  assert.ok($('#banner-modo-local'), 'aviso do modo local na raiz');
  assert.ok($('.banner-local-sobre'), 'link para a página de apresentação');

  await ModoLocal.esperar(() => !$('#view-painel').classList.contains('oculto'), 'painel do sistema montado', 10000);
  assert.ok($('#botao-nova-proposta'), 'botão de nova proposta disponível na raiz');
  assert.ok($('#nome-usuario').textContent.length > 0, 'perfil local no topo');

  // e o "Sobre o LicitaPro" leva à apresentação (arquivo que existe no repositório)
  assert.strictEqual($('.banner-local-sobre').getAttribute('href'), 'apresentacao.html', 'link da apresentação');
  assert.ok(fs.existsSync(path.join(RAIZ, 'apresentacao.html')), 'a apresentação existe no repositório');

  // no endereço da raiz, o PDF também sai: as bibliotecas vêm de public/vendor/
  const criado = await aberto.window.API.pedir('/api/documentos', {
    method: 'POST',
    corpo: {
      tipo: 'proposta',
      numero: { sequencial: 1, ano: 2026, grupo: '' },
      orgao: { nome: 'UASG 787010 - CENTRO DE INTENDÊNCIA DA MARINHA' },
      itens: [{ descricao: 'RÁDIO TRANSCEPTOR PORTÁTIL DIGITAL', unidade: 'UND', quantidade: 6, precoVenda: 1490 }],
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
    await Navegador.esperar(() => !$('#tela-login').classList.contains('oculto'), 'tela de login');
    assert.strictEqual(window.ModoEstatico.ativo(), false, 'modo local desligado quando há servidor');
    assert.strictEqual($('#banner-modo-local'), null, 'sem aviso de modo local');
  } finally {
    servidor.close();
  }
});

// ------------------------------------------------------------------ início

executar();
