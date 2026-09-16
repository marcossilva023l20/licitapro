/**
 * Modo local (sem servidor).
 *
 * Quando o site é aberto sem o backend — por exemplo no GitHub Pages ou direto
 * do arquivo (file://) — este script assume o papel do servidor:
 *   • guarda os documentos no próprio navegador (localStorage);
 *   • guarda as fotos enviadas no IndexedDB;
 *   • lê e gera planilhas (.xlsx) com a mesma lógica do servidor;
 *   • gera os PDFs no navegador com o mesmo montador usado no servidor.
 *
 * As telas do sistema são exatamente as mesmas: apenas as chamadas /api/*
 * passam a ser atendidas aqui.
 */
(function () {
  'use strict';

  const CHAVE_BANCO = 'licitapro.local.v1';
  const BANCO_IDB = 'licitapro-imagens';
  const LOJA_IDB = 'imagens';

  const estado = {
    ativo: false,
    banco: null,
    mapaImagens: new Map(), // 'idb:abc' -> blob URL
    baseCarregada: false,
    pesadasCarregadas: false,
  };

  // ----------------------------------------------------------- utilidades

  function novoId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function copiar(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function perfilPadrao() {
    return {
      criadoEm: new Date().toISOString(),
      empresa: {
        razaoSocial: '', nomeFantasia: '', cnpj: '', inscricaoEstadual: '', simplesNacional: true,
        telefone: '', email: '', endereco: '', cidade: '', uf: '', cep: '',
        banco: '', agencia: '', conta: '', chavePix: '',
        representante: '', cpfRepresentante: '', cargoRepresentante: 'REPRESENTANTE LEGAL DA EMPRESA',
        logo: '', assinatura: '',
      },
      padroes: {
        prazoEntrega: 'Conforme Edital.',
        validadeDias: 60,
        condicoesPagamento: 'Conforme Edital.',
        garantia: 'Conforme Termo de Referência.',
        observacoes: '',
        cidadeUf: '',
      },
    };
  }

  function bancoVazio() {
    return { versao: 2, perfil: perfilPadrao(), documentos: [], sequencia: {} };
  }

  function lerBanco() {
    if (estado.banco) return estado.banco;
    try {
      const bruto = window.localStorage.getItem(CHAVE_BANCO);
      const dados = bruto ? JSON.parse(bruto) : null;
      estado.banco = dados && dados.documentos ? dados : bancoVazio();
      // dados salvos antes (quando havia login no sistema) guardavam "usuario":
      // o que importa — empresa e padrões — passa a viver em "perfil"
      const anterior = dados && (dados.perfil || dados.usuario);
      if (anterior) estado.banco.perfil = Object.assign(perfilPadrao(), anterior);
      if (!estado.banco.perfil) estado.banco.perfil = perfilPadrao();
      delete estado.banco.usuario;
      estado.banco.versao = 2;
      if (estado.banco.documentos) {
        estado.banco.documentos.forEach((d) => { delete d.usuarioId; });
      }
    } catch (erro) {
      console.warn('[modo local] não consegui ler os dados salvos:', erro.message);
      estado.banco = bancoVazio();
    }
    return estado.banco;
  }

  let avisoSalvamento = false;
  function gravarBanco() {
    try {
      window.localStorage.setItem(CHAVE_BANCO, JSON.stringify(estado.banco));
      return true;
    } catch (erro) {
      if (!avisoSalvamento) {
        avisoSalvamento = true;
        window.UI && window.UI.toast(
          'Não foi possível salvar no navegador (armazenamento cheio). Baixe um backup e remova fotos grandes.',
          'erro', 12000
        );
      }
      console.warn('[modo local] falha ao gravar:', erro.message);
      return false;
    }
  }

  // --------------------------------------------------------- IndexedDB

  function abrirIdb() {
    return new Promise((resolver, rejeitar) => {
      if (!window.indexedDB) return rejeitar(new Error('IndexedDB indisponível'));
      const pedido = window.indexedDB.open(BANCO_IDB, 1);
      pedido.onupgradeneeded = () => {
        const banco = pedido.result;
        if (!banco.objectStoreNames.contains(LOJA_IDB)) banco.createObjectStore(LOJA_IDB);
      };
      pedido.onsuccess = () => resolver(pedido.result);
      pedido.onerror = () => rejeitar(pedido.error);
    });
  }

  async function comLoja(modo, acao) {
    const banco = await abrirIdb();
    return new Promise((resolver, rejeitar) => {
      const transacao = banco.transaction(LOJA_IDB, modo);
      const loja = transacao.objectStore(LOJA_IDB);
      const pedido = acao(loja);
      pedido.onsuccess = () => resolver(pedido.result);
      pedido.onerror = () => rejeitar(pedido.error);
    });
  }

  async function salvarImagemBlob(id, blob) {
    return comLoja('readwrite', (loja) => loja.put(blob, id));
  }

  async function lerImagemBlob(id) {
    try {
      return await comLoja('readonly', (loja) => loja.get(id));
    } catch (_) {
      return null;
    }
  }

  async function listarIdsImagens() {
    try {
      return await comLoja('readonly', (loja) => loja.getAllKeys());
    } catch (_) {
      return [];
    }
  }

  // -------------------------------------------------- imagens na interface

  /** Registra a imagem para que as pré-visualizações (<img src>) funcionem. */
  async function registrarImagem(ref) {
    if (!ref || !ref.startsWith('idb:') || estado.mapaImagens.has(ref)) return;
    const blob = await lerImagemBlob(ref.slice(4));
    if (!blob) return;
    estado.mapaImagens.set(ref, URL.createObjectURL(blob));
    if (window.UI && typeof window.UI.atualizarImagemLocal === 'function') {
      window.UI.atualizarImagemLocal(ref, estado.mapaImagens.get(ref));
    }
  }

  /** Resolve as imagens de um documento antes de exibir na tela. */
  async function resolverImagens(documento) {
    if (!documento) return documento;
    const refs = new Set();
    (documento.itens || []).forEach((item) => { if (item.foto && item.foto.startsWith('idb:')) refs.add(item.foto); });
    const proponente = documento.proponente || {};
    ['logo', 'assinatura'].forEach((campo) => {
      if (proponente[campo] && String(proponente[campo]).startsWith('idb:')) refs.add(proponente[campo]);
    });
    for (const ref of refs) await registrarImagem(ref);
    return documento;
  }

  function urlDaImagem(caminho) {
    if (!caminho) return '';
    if (estado.mapaImagens.has(caminho)) return estado.mapaImagens.get(caminho);
    if (/^(data:|blob:)/.test(caminho)) return caminho;
    if (caminho.startsWith('idb:')) return ''; // ainda carregando
    if (caminho.startsWith('/api/uploads/')) return ''; // não existe sem servidor
    return caminho;
  }

  // ------------------------------------------------------- bibliotecas

  // Módulos pequenos usados por quase toda chamada (validação, numeração,
  // montagem do documento). Carregá-los é rápido.
  const ARQUIVOS_BASE = [
    '../shared/format.js',
    '../shared/colunas.js',
    '../shared/imagens-links.js',
    '../shared/documento-schema.js',
    '../shared/documento-pdf.js',
    'js/navegador-imagens.js',
  ];

  // Bibliotecas grandes (pdfmake + fontes + xlsx, ~2,7 MB): só são baixadas
  // quando alguém gera PDF ou mexe com planilha. Assim a página abre rápido.
  const ARQUIVOS_PESADOS = [
    'vendor/xlsx.full.min.js',
    '../shared/importar.js',
    '../shared/modelo-importacao.js',
    'vendor/pdfmake.min.js',
    'vendor/times-afm.js', // métricas da Times (Times New Roman)
  ];

  /**
   * Versão dos arquivos de código. Ao publicar mudanças em js/, shared/ ou
   * css/, aumente este número e os ?v= do index.html e da apresentação: assim
   * o navegador baixa a versão nova em vez de reusar a que está no cache
   * (importante no GitHub Pages, onde o cache dura alguns minutos).
   */
  const VERSAO_ARQUIVOS = '11';

  function carregarScript(caminho) {
    return new Promise((resolver, rejeitar) => {
      const script = document.createElement('script');
      const endereco = new URL(caminho, document.baseURI);
      endereco.searchParams.set('v', VERSAO_ARQUIVOS);
      script.src = endereco.href;
      script.onload = () => resolver();
      script.onerror = () => rejeitar(new Error('Não foi possível carregar ' + caminho));
      document.head.appendChild(script);
    });
  }

  /**
   * Pasta onde estão css/js/vendor/shared.
   * No servidor é a própria raiz; na página gerada para o GitHub Pages a meta
   * licitapro-base indica "public/" (o repositório é publicado como está).
   */
  function prefixoBase() {
    const meta = document.querySelector('meta[name="licitapro-base"]');
    return meta && meta.content ? meta.content : '';
  }

  async function carregarLista(arquivos, marca) {
    const prefixo = prefixoBase();
    for (const arquivo of arquivos) await carregarScript(prefixo + arquivo);
    marca.carregado = true;
  }

  /** Módulos compartilhados pequenos (uma vez só). */
  async function carregarBibliotecas() {
    if (estado.baseCarregada) return;
    await carregarLista(ARQUIVOS_BASE, { set carregado(v) { estado.baseCarregada = v; } });
  }

  /** pdfmake (com as fontes) e xlsx — baixados apenas quando necessário. */
  async function carregarPesadas() {
    if (estado.pesadasCarregadas) return;
    await carregarLista(ARQUIVOS_PESADOS, { set carregado(v) { estado.pesadasCarregadas = v; } });
  }

  async function motorPdfPronto() {
    await carregarPesadas();
    return motorPdf();
  }

  function motorPdf() {
    // o pdfmake só existe depois do carregamento sob demanda: recria o motor
    // quando a biblioteca aparece (ou muda).
    if (!estado.motor || estado.motorPdfMake !== window.pdfMake) {
      estado.motor = window.criarDocumentoPdf(window.pdfMake, window.Formato, window.ImagensNavegador);
      estado.motorPdfMake = window.pdfMake;
    }
    return estado.motor;
  }

  // --------------------------------------------------------- numeração

  function proximoNumero(tipo, ano, grupo) {
    const banco = lerBanco();
    const chave = grupo ? `${tipo}:${grupo}` : tipo;
    banco.sequencia[chave] = banco.sequencia[chave] || {};
    return Number(banco.sequencia[chave][ano] || 0) + 1;
  }

  function reservarNumero(tipo, ano, grupo, numero) {
    const banco = lerBanco();
    const chave = grupo ? `${tipo}:${grupo}` : tipo;
    banco.sequencia[chave] = banco.sequencia[chave] || {};
    banco.sequencia[chave][ano] = Math.max(Number(banco.sequencia[chave][ano] || 0), Number(numero) || 0);
    gravarBanco();
  }

  // ---------------------------------------------------------- documentos

  const Esquema = () => window.DocumentoSchema;
  const Pdf = () => motorPdf();

  function resumo(documento) {
    const totais = Pdf().calcularTotais(documento);
    return {
      id: documento.id,
      tipo: documento.tipo,
      numero: documento.numero,
      numeroFormatado: Pdf().numeroFormatado(documento),
      status: documento.status,
      data: documento.data,
      titulo: documento.tipo === 'orcamento' ? 'Orçamento' : 'Proposta de Fornecimento',
      destinatario: documento.tipo === 'orcamento'
        ? (documento.cliente && documento.cliente.nome) || ''
        : (documento.orgao && documento.orgao.nome) || '',
      processo: (documento.orgao && documento.orgao.processo) || '',
      quantidadeItens: (documento.itens || []).length,
      total: totais.total,
      atualizadoEm: documento.atualizadoEm,
      criadoEm: documento.criadoEm,
    };
  }

  function acharDocumento(id) {
    return lerBanco().documentos.find((d) => d.id === id) || null;
  }

  function sanear(payload, tipoSugerido, anterior) {
    return Esquema().sanear(payload, lerBanco().perfil, tipoSugerido, anterior);
  }

  function nomeArquivoPdf(documento) {
    const banco = lerBanco();
    const nome = Pdf().nomeArquivo(documento, banco.perfil.empresa || {});
    return window.Formato.slug(nome.replace(/\.pdf$/i, '')) + '.pdf';
  }

  /**
   * Gera o PDF e devolve também as fotos que não puderam ser usadas, para a
   * tela avisar o usuário (link sem permissão, formato não aceito, arquivo
   * corrompido) em vez de a foto sair como "—" sem explicação.
   */
  async function gerarBlobPdf(documento) {
    await carregarPesadas();
    const banco = lerBanco();
    const motor = motorPdf();
    const fotosIgnoradas = [];
    const buffer = await motor.gerarPdf(documento, banco.perfil.empresa || {}, { relatorio: fotosIgnoradas });
    return {
      blob: new Blob([buffer], { type: 'application/pdf' }),
      fotosIgnoradas: fotosIgnoradas.length,
      detalhe: motor.descreverFotosIgnoradas(fotosIgnoradas),
    };
  }

  function blobPlanilha(livro) {
    const dados = window.Importador.escreverXlsx(livro);
    return new Blob([dados], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  // -------------------------------------------------------------- rotas

  function perfilPublico() {
    const perfil = lerBanco().perfil;
    return { empresa: copiar(perfil.empresa || {}), padroes: copiar(perfil.padroes || {}) };
  }

  async function responder(metodo, caminho, corpo) {
    await carregarBibliotecas();
    const url = new URL(caminho, window.location.origin);
    const rota = url.pathname;
    const busca = url.searchParams;
    const banco = lerBanco();

    // ------------------------------------------------------------ perfil
    if (rota === '/api/perfil' && metodo === 'GET') return { perfil: perfilPublico() };

    if (rota === '/api/perfil/empresa' && metodo === 'PUT') {
      banco.perfil.empresa = Object.assign(banco.perfil.empresa, copiar(corpo || {}));
      gravarBanco();
      return { empresa: copiar(banco.perfil.empresa) };
    }

    if (rota === '/api/perfil/padroes' && metodo === 'PUT') {
      banco.perfil.padroes = Object.assign(banco.perfil.padroes, copiar(corpo || {}));
      gravarBanco();
      return { padroes: copiar(banco.perfil.padroes) };
    }

    // -------------------------------------------------------- documentos
    if (rota === '/api/documentos' && metodo === 'GET') {
      let lista = banco.documentos.map(resumo);
      if (busca.get('tipo')) lista = lista.filter((d) => d.tipo === busca.get('tipo'));
      if (busca.get('status')) lista = lista.filter((d) => d.status === busca.get('status'));
      if (busca.get('ano')) lista = lista.filter((d) => String(d.numero.ano) === String(busca.get('ano')));
      if (busca.get('busca')) {
        const alvo = String(busca.get('busca')).toLowerCase();
        lista = lista.filter((d) =>
          [d.destinatario, d.numeroFormatado, d.processo, d.titulo].join(' ').toLowerCase().includes(alvo)
        );
      }
      lista.sort((a, b) => String(b.atualizadoEm || '').localeCompare(String(a.atualizadoEm || '')));
      const totais = lista.reduce(
        (acc, d) => {
          acc.quantidade += 1;
          acc.valor += d.total;
          if (d.status === 'ganha') { acc.ganhas += 1; acc.valorGanho += d.total; }
          if (d.status === 'enviada') acc.enviadas += 1;
          return acc;
        },
        { quantidade: 0, valor: 0, valorGanho: 0, ganhas: 0, enviadas: 0 }
      );
      totais.valor = window.Formato.arredondar(totais.valor, 2);
      totais.valorGanho = window.Formato.arredondar(totais.valorGanho, 2);
      return { documentos: lista, totais };
    }

    if (rota === '/api/documentos' && metodo === 'POST') {
      const dados = corpo || {};
      const tipo = Esquema().TIPOS.includes(dados.tipo) ? dados.tipo : 'proposta';
      const numeroEnviado = dados.numero || {};
      const ano = Number(numeroEnviado.ano) || new Date().getFullYear();
      const grupo = String(numeroEnviado.grupo || '').slice(0, 30);
      let sequencial = Number(numeroEnviado.sequencial) || proximoNumero(tipo, ano, grupo);
      const saneado = sanear(Object.assign({}, dados, { numero: { sequencial, ano, grupo } }), tipo);
      saneado.id = novoId();
      saneado.criadoEm = new Date().toISOString();
      saneado.atualizadoEm = saneado.criadoEm;
      banco.documentos.push(saneado);
      gravarBanco();
      reservarNumero(tipo, ano, grupo, sequencial);
      await resolverImagens(saneado);
      return { documento: copiar(saneado) };
    }

    if (rota === '/api/documentos/proximo-numero' && metodo === 'GET') {
      const tipo = busca.get('tipo') === 'orcamento' ? 'orcamento' : 'proposta';
      const ano = Number(busca.get('ano')) || new Date().getFullYear();
      const grupo = String(busca.get('grupo') || '').slice(0, 30);
      const sequencial = proximoNumero(tipo, ano, grupo);
      return { sequencial, ano, grupo, numeroFormatado: window.Formato.numeroDocumento(sequencial, ano) };
    }

    if (rota === '/api/documentos/previa-pdf' && metodo === 'POST') {
      const saneado = sanear(corpo || {}, (corpo && corpo.tipo) || 'proposta');
      const gerado = await gerarBlobPdf(saneado);
      return {
        __blob: gerado.blob,
        __nome: nomeArquivoPdf(saneado),
        __fotosIgnoradas: gerado.fotosIgnoradas,
        __fotosDetalhe: gerado.detalhe,
      };
    }

    const casamento = rota.match(/^\/api\/documentos\/([^/]+)(\/[a-z-]+)?$/);
    if (casamento) {
      const id = casamento[1];
      const acao = casamento[2];
      const documento = acharDocumento(id);
      if (!documento) throw Object.assign(new Error('Documento não encontrado.'), { status: 404 });

      if (!acao && metodo === 'GET') {
        await resolverImagens(documento);
        return { documento: copiar(documento), totais: Pdf().calcularTotais(documento) };
      }

      if (!acao && metodo === 'PUT') {
        const saneado = sanear(corpo || {}, documento.tipo, documento);
        const indice = banco.documentos.findIndex((d) => d.id === id);
        saneado.id = id;
        saneado.criadoEm = documento.criadoEm;
        saneado.atualizadoEm = new Date().toISOString();
        banco.documentos[indice] = saneado;
        gravarBanco();
        if (saneado.numero) {
          reservarNumero(saneado.tipo, saneado.numero.ano, saneado.numero.grupo, saneado.numero.sequencial);
        }
        await resolverImagens(saneado);
        return { documento: copiar(saneado), totais: Pdf().calcularTotais(saneado) };
      }

      if (!acao && metodo === 'DELETE') {
        banco.documentos = banco.documentos.filter((d) => d.id !== id);
        gravarBanco();
        return { ok: true };
      }

      if (acao === '/duplicar' && metodo === 'POST') {
        const ano = new Date().getFullYear();
        const grupo = (documento.numero && documento.numero.grupo) || '';
        const sequencial = proximoNumero(documento.tipo, ano, grupo);
        const copia = sanear(
          Object.assign({}, documento, {
            numero: { sequencial, ano, grupo },
            status: 'rascunho',
            itens: (documento.itens || []).map((i) => Object.assign({}, i, { id: novoId() })),
          }),
          documento.tipo
        );
        copia.id = novoId();
        copia.criadoEm = new Date().toISOString();
        copia.atualizadoEm = copia.criadoEm;
        banco.documentos.push(copia);
        gravarBanco();
        reservarNumero(documento.tipo, ano, grupo, sequencial);
        await resolverImagens(copia);
        return { documento: copiar(copia) };
      }

      if (acao === '/pdf' && metodo === 'GET') {
        const gerado = await gerarBlobPdf(documento);
        return {
          __blob: gerado.blob,
          __nome: nomeArquivoPdf(documento),
          __fotosIgnoradas: gerado.fotosIgnoradas,
          __fotosDetalhe: gerado.detalhe,
        };
      }

      if (acao === '/planilha' && metodo === 'GET') {
        await carregarPesadas();
        const livro = window.Importador.itensParaPlanilha(documento.itens || []);
        const nome = `${documento.tipo === 'orcamento' ? 'Orcamento' : 'Proposta'}_` +
          Pdf().numeroFormatado(documento).replace(/\W+/g, '-') + '_itens.xlsx';
        return { __blob: blobPlanilha(livro), __nome: nome };
      }
    }

    throw Object.assign(new Error('Rota não encontrada no modo local: ' + metodo + ' ' + rota), { status: 404 });
  }

  // --------------------------------------------------- arquivos (upload)

  async function enviarArquivoLocal(caminho, arquivo) {
    const rota = new URL(caminho, window.location.origin).pathname;

    if (rota === '/api/importar') {
      await carregarPesadas();
      const dados = await arquivo.arrayBuffer();
      return window.Importador.importar(dados, arquivo.name);
    }

    if (rota === '/api/uploads') {
      await carregarBibliotecas();
      // A imagem precisa virar JPEG/PNG: o gerador de PDF não aceita GIF, WebP
      // nem HEIC. O que não puder ser convertido é recusado com uma mensagem
      // explicando o que enviar.
      const reduzida = await window.ImagensNavegador.prepararParaEnvio(arquivo);
      const id = novoId();
      try {
        await salvarImagemBlob(id, reduzida);
        const ref = 'idb:' + id;
        estado.mapaImagens.set(ref, URL.createObjectURL(reduzida));
        return { caminho: ref, nome: arquivo.name, tamanho: reduzida.size };
      } catch (erro) {
        // sem IndexedDB: guarda a imagem dentro do documento
        const dataUrl = await window.ImagensNavegador.blobParaDataUrl(reduzida);
        return { caminho: dataUrl, nome: arquivo.name, tamanho: reduzida.size };
      }
    }

    throw new Error('Envio de arquivo não suportado no modo local: ' + rota);
  }

  // ------------------------------------------------------ pasta de trabalho

  function baixar(blob, nome) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = nome;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  async function baixarModeloPlanilha() {
    await carregarPesadas();
    const dados = window.ModeloImportacao.gerarBuffer();
    baixar(
      new Blob([dados], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      'Modelo_Importacao_Itens_DEJ.xlsx'
    );
  }

  /** Backup completo (documentos + imagens) em um arquivo .json. */
  /** Monta o conteúdo do backup (sem baixar nada) — usado também nos testes. */
  async function montarBackup() {
    await carregarBibliotecas();
    const banco = lerBanco();
    const imagens = {};
    for (const id of await listarIdsImagens()) {
      const blob = await lerImagemBlob(id);
      if (blob) imagens[id] = await window.ImagensNavegador.blobParaDataUrl(blob);
    }
    return {
      aplicativo: 'DEJ Solutions & Global',
      formato: 1,
      exportadoEm: new Date().toISOString(),
      banco: copiar(banco),
      imagens,
    };
  }

  async function exportarBackup() {
    const conteudo = await montarBackup();
    const nome = 'dej-solutions-global-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    baixar(new Blob([JSON.stringify(conteudo)], { type: 'application/json' }), nome);
    const total = (conteudo.banco.documentos || []).length;
    window.UI && window.UI.toast('Backup gerado com ' + total + ' documento(s).', 'sucesso');
    return conteudo;
  }

  async function importarBackup(arquivo) {
    await carregarBibliotecas();
    const texto = await arquivo.text();
    const conteudo = JSON.parse(texto);
    if (!conteudo || !conteudo.banco || !Array.isArray(conteudo.banco.documentos)) {
      throw new Error('Este arquivo não é um backup do DEJ Solutions & Global.');
    }
    estado.banco = conteudo.banco;
    estado.banco.perfil = Object.assign(perfilPadrao(), estado.banco.perfil || estado.banco.usuario || {});
    delete estado.banco.usuario;
    gravarBanco();

    const imagens = conteudo.imagens || {};
    for (const [id, dataUrl] of Object.entries(imagens)) {
      const blob = await (await fetch(dataUrl)).blob();
      await salvarImagemBlob(id, blob);
    }
    window.UI && window.UI.toast(
      'Backup restaurado: ' + estado.banco.documentos.length + ' documento(s) e ' +
      Object.keys(imagens).length + ' imagem(ns).', 'sucesso'
    );
  }

  // ---------------------------------------------------------- interface

  /**
   * Ajustes de interface do modo local. Não há aviso fixo na tela: o backup e a
   * restauração ficam no menu do topo (itens data-modo-local).
   */
  function prepararInterfaceLocal() {
    document.documentElement.setAttribute('data-modo', 'local');

    const menu = document.getElementById('lista-usuario');
    if (!menu) return;
    menu.querySelectorAll('[data-modo-local]').forEach((elemento) => elemento.classList.remove('oculto'));

    const exportar = menu.querySelector('#local-exportar');
    const importar = menu.querySelector('#local-importar');
    const entrada = menu.querySelector('#local-arquivo-backup');
    if (exportar) {
      exportar.addEventListener('click', () => {
        exportarBackup().catch((erro) => window.UI && window.UI.toast(erro.message, 'erro'));
      });
    }
    if (importar && entrada) {
      importar.addEventListener('click', () => entrada.click());
      entrada.addEventListener('change', async () => {
        const arquivo = entrada.files[0];
        if (!arquivo) return;
        try {
          await importarBackup(arquivo);
          window.location.reload();
        } catch (erro) {
          window.UI && window.UI.toast(erro.message, 'erro');
        }
      });
    }

    // Na versão publicada no GitHub Pages existe uma página de apresentação
    // ao lado do sistema (meta licitapro-sobre): ela entra no mesmo menu.
    const sobre = document.querySelector('meta[name="licitapro-sobre"]');
    if (sobre && sobre.content) {
      const link = document.createElement('a');
      link.className = 'menu-local-sobre';
      link.href = sobre.content;
      link.textContent = 'Sobre o sistema';
      menu.insertBefore(link, menu.querySelector('[data-modo-local]'));
    }
  }

  /** Links para /api/modelo-planilha passam a gerar o arquivo no navegador. */
  function interceptarModelo() {
    document.addEventListener('click', (evento) => {
      const link = evento.target.closest('a[href="/api/modelo-planilha"], a[href$="/api/modelo-planilha"]');
      if (!link) return;
      evento.preventDefault();
      baixarModeloPlanilha().catch((erro) => window.UI && window.UI.toast(erro.message, 'erro'));
    });
  }

  // ------------------------------------------------------------- ativação

  async function ativar() {
    if (estado.ativo) return;
    estado.ativo = true;

    lerBanco();
    gravarBanco();
    prepararInterfaceLocal();
    interceptarModelo();

    // As bibliotecas (pdfmake/xlsx) só são baixadas quando necessárias.
    try {
      await carregarBibliotecas();
    } catch (erro) {
      console.error('[modo local] falha ao carregar as bibliotecas:', erro);
      if (window.UI && window.UI.toast) {
        window.UI.toast(
          'Não foi possível carregar pdfmake/xlsx: importar planilha e gerar PDF ficam indisponíveis.',
          'erro', 15000
        );
      }
    }
  }

  // ------------------------------------------------------------- fachada
  //
  // A fachada assume as chamadas /api/* já no carregamento do script (antes de
  // qualquer tela pedir dados) e só entra em ação quando fica claro que não há
  // servidor atendendo. Assim não existe corrida entre a tela e a ativação.

  let fachadaInstalada = false;

  function instalarFachada() {
    if (fachadaInstalada) return;
    fachadaInstalada = true;

    const API = window.API;
    const pedirServidor = API.pedir.bind(API);
    const baixarServidor = API.baixar.bind(API);
    const previaServidor = API.previaPdf.bind(API);
    const enviarServidor = API.enviarArquivo.bind(API);
    const precisaModoLocal = (erro) => Boolean(erro && erro.semServidor);

    async function respostaLocal(metodo, caminho, corpo) {
      if (!estado.ativo) await ativar();
      return responder(metodo, caminho, corpo);
    }

    API.pedir = async function (caminho, opcoes) {
      const metodo = (opcoes && opcoes.method) || 'GET';
      const corpo = opcoes && opcoes.corpo;
      if (estado.ativo) {
        const resposta = await respostaLocal(metodo, caminho, corpo);
        return resposta && resposta.__blob ? resposta.__blob : resposta;
      }
      try {
        return await pedirServidor(caminho, opcoes);
      } catch (erro) {
        if (!precisaModoLocal(erro)) throw erro;
        const resposta = await respostaLocal(metodo, caminho, corpo);
        return resposta && resposta.__blob ? resposta.__blob : resposta;
      }
    };

    /** Guarda o aviso das fotos que não entraram no PDF (usado por editar.js). */
    function anotarFotos(resposta) {
      return {
        fotosIgnoradas: Number(resposta.__fotosIgnoradas || 0),
        detalheFotosIgnoradas: resposta.__fotosDetalhe || '',
      };
    }

    API.baixar = async function (caminho) {
      if (estado.ativo) {
        const resposta = await respostaLocal('GET', caminho);
        const fotos = anotarFotos(resposta);
        API.ultimasFotosIgnoradas = fotos;
        return Object.assign({ blob: resposta.__blob, nomeArquivo: resposta.__nome }, fotos);
      }
      try {
        return await baixarServidor(caminho);
      } catch (erro) {
        if (!precisaModoLocal(erro)) throw erro;
        const resposta = await respostaLocal('GET', caminho);
        const fotos = anotarFotos(resposta);
        API.ultimasFotosIgnoradas = fotos;
        return Object.assign({ blob: resposta.__blob, nomeArquivo: resposta.__nome }, fotos);
      }
    };

    API.previaPdf = async function (documento) {
      if (estado.ativo) {
        const resposta = await respostaLocal('POST', '/api/documentos/previa-pdf', documento);
        API.ultimasFotosIgnoradas = anotarFotos(resposta);
        return resposta.__blob;
      }
      try {
        return await previaServidor(documento);
      } catch (erro) {
        if (!precisaModoLocal(erro)) throw erro;
        const resposta = await respostaLocal('POST', '/api/documentos/previa-pdf', documento);
        API.ultimasFotosIgnoradas = anotarFotos(resposta);
        return resposta.__blob;
      }
    };

    API.enviarArquivo = async function (caminho, arquivo, campo) {
      if (estado.ativo) return enviarArquivoLocal(caminho, arquivo);
      try {
        return await enviarServidor(caminho, arquivo, campo);
      } catch (erro) {
        if (!precisaModoLocal(erro)) throw erro;
        await ativar();
        return enviarArquivoLocal(caminho, arquivo);
      }
    };
  }

  /** Detecta o ambiente sem API (GitHub Pages ou arquivo aberto direto). */
  async function verificarAmbiente() {
    if (window.location.protocol === 'file:') {
      await ativar();
      return true;
    }
    if (/\.github\.io$/i.test(window.location.hostname) || /\.pages\.dev$/i.test(window.location.hostname)) {
      await ativar();
      return true;
    }
    try {
      const resposta = await fetch('api/health', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
      const tipo = resposta.headers.get('content-type') || '';
      if (!tipo.includes('application/json')) {
        await ativar();
        return true;
      }
    } catch (_) {
      await ativar();
      return true;
    }
    return false;
  }

  window.ModoEstatico = {
    ativar,
    ativo: () => estado.ativo,
    urlDaImagem,
    lerImagemBlob,
    registrarImagem,
    resolverImagens,
    exportarBackup,
    montarBackup,
    importarBackup,
    baixarModeloPlanilha,
    motorPdf: motorPdfPronto,
    verificarAmbiente,
    _interno: estado,
  };

  // A fachada entra no lugar imediatamente e a checagem do ambiente confirma
  // (ou não) se este endereço tem servidor.
  instalarFachada();
  verificarAmbiente().catch((erro) => console.warn('[modo local]', erro.message));
})();
