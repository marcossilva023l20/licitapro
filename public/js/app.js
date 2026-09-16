/* DEJ Solutions & Global — inicialização, rotas e telas. */
(function () {
  'use strict';

  const F = window.Formato;
  const UI = window.UI;
  const API = window.API;
  const $ = UI.$;
  const $$ = UI.$$;

  const estado = {
    perfil: null,
    documentos: [],
    totais: { quantidade: 0, valor: 0, ganhas: 0, enviadas: 0 },
    itensImportados: [],
    empresa: {},
    padroes: {},
    pendenteEditor: null,
  };

  // ------------------------------------------------------------- entrada

  /** Nome que aparece no topo: o da empresa; sem cadastro, um rótulo neutro. */
  function nomeDaEmpresa() {
    const empresa = (estado.perfil && estado.perfil.empresa) || {};
    return empresa.nomeFantasia || empresa.razaoSocial || 'Minha empresa';
  }

  /**
   * Mostra no painel onde os dados estão sendo salvos. É a resposta curta para
   * "o sistema está gravando no banco?" — sem precisar abrir o terminal:
   *   banco conectado · banco com problema · arquivo do servidor · este navegador
   */
  async function atualizarSituacaoDados() {
    const caixa = $('#situacao-dados');
    const texto = $('#situacao-dados-texto');
    if (!caixa || !texto) return;

    const modoLocal = window.ModoEstatico && window.ModoEstatico.ativo && window.ModoEstatico.ativo();
    if (modoLocal) {
      caixa.className = 'situacao-dados aviso';
      texto.textContent =
        'Dados salvos neste navegador (sem servidor). Use "Baixar backup" no menu para guardar uma cópia.';
      return;
    }

    try {
      const saude = await API.get('/api/health');
      const banco = saude.supabase || {};
      if (saude.armazenamento === 'supabase' && banco.conectado) {
        caixa.className = 'situacao-dados ok';
        texto.textContent = 'Banco de dados conectado (Supabase): empresa e documentos salvos no banco.';
      } else if (banco.configurado) {
        caixa.className = 'situacao-dados erro';
        texto.textContent =
          'O banco (Supabase) não está recebendo os dados: ' + (banco.erro || 'motivo desconhecido') +
          ' — o que você salvar fica no arquivo do servidor até o banco voltar.';
      } else {
        caixa.className = 'situacao-dados aviso';
        texto.textContent =
          'Supabase não configurado: os dados estão sendo salvos no arquivo do servidor. ' +
          'Veja o README (seção 4) para ligar o banco.';
      }
    } catch (erro) {
      caixa.className = 'situacao-dados erro';
      texto.textContent = 'Não consegui falar com o servidor para saber onde os dados estão: ' + erro.message;
    }
  }

  function mostrarApp() {
    const nome = nomeDaEmpresa();
    $('#nome-usuario').textContent = nome;
    $('#avatar-usuario').textContent = F.iniciais(nome) || 'DEJ';
    $('#saudacao').textContent = 'O que vamos montar hoje: uma proposta ou um orçamento?';
  }

  // -------------------------------------------------------------- rotas

  const VISTAS = ['painel', 'documentos', 'editor', 'importar', 'empresa'];

  function mostrarVista(nome) {
    VISTAS.forEach((v) => $('#view-' + v).classList.toggle('oculto', v !== nome));
    if (nome !== 'editor' && window.Editor) window.Editor.aoSairDaVista();
  }

  function marcarNavegacao(rota) {
    $$('#navegacao a').forEach((a) => a.classList.toggle('ativa', a.dataset.rota === rota));
    $('#navegacao').classList.remove('aberta');
  }

  function rotear() {
    if (!estado.perfil) return;
    const hash = window.location.hash || '#/painel';
    const partes = hash.replace(/^#\//, '').split('/').filter(Boolean);
    const primeira = partes[0] || 'painel';

    if (primeira === 'documento') {
      const segundo = partes[1];
      const tipo = partes[2] === 'orcamento' || partes[2] === 'proposta' ? partes[2] : null;
      if (segundo === 'novo') {
        mostrarVista('editor');
        marcarNavegacao('documento');
        if (estado.pendenteEditor) {
          const pendente = estado.pendenteEditor;
          estado.pendenteEditor = null;
          window.Editor.novoComItens(pendente.tipo, pendente.itens);
        } else {
          window.Editor.novo(tipo || $('#campo-tipo').value || 'proposta');
        }
        return;
      }
      if (segundo) {
        const atual = window.Editor.estadoAtual();
        if (atual.doc && atual.doc.id === segundo && !atual.novo) {
          mostrarVista('editor');
          marcarNavegacao('documento');
          return;
        }
        mostrarVista('editor');
        marcarNavegacao('documento');
        window.Editor.abrir(segundo);
        return;
      }
    }

    if (primeira === 'importar') {
      mostrarVista('importar');
      marcarNavegacao('importar');
      prepararImportacao();
      return;
    }
    if (primeira === 'empresa') {
      mostrarVista('empresa');
      marcarNavegacao('empresa');
      carregarEmpresa();
      return;
    }
    if (primeira === 'documentos') {
      mostrarVista('documentos');
      marcarNavegacao('documentos');
      carregarDocumentos().then(desenharListaDocumentos);
      return;
    }

    mostrarVista('painel');
    marcarNavegacao('painel');
    carregarDocumentos().then(desenharPainel);
  }

  // ----------------------------------------------------------- documentos

  async function carregarDocumentos() {
    try {
      const resposta = await API.get('/api/documentos');
      estado.documentos = resposta.documentos || [];
      estado.totais = resposta.totais || { quantidade: 0, valor: 0, ganhas: 0, enviadas: 0 };
    } catch (erro) {
      UI.toast('Não foi possível carregar os documentos: ' + erro.message, 'erro');
    }
  }

  function corpoDocumento(doc) {
    const etiqueta = `status-${doc.status}`;
    const destinatario = doc.destinatario || (doc.tipo === 'orcamento' ? 'Cliente não informado' : 'Órgão não informado');
    const meta = [];
    if (doc.processo) meta.push('Processo ' + UI.escaparHtml(doc.processo));
    meta.push(doc.quantidadeItens + (doc.quantidadeItens === 1 ? ' item' : ' itens'));
    meta.push('atualizado em ' + F.dataHora(doc.atualizadoEm));
    if (doc.data) meta.push('data do documento: ' + F.dataBR(doc.data));

    return `
      <div>
        <div class="doc-numero">${UI.escaparHtml(doc.numeroFormatado)}</div>
        <span class="doc-tipo ${doc.tipo === 'orcamento' ? 'orcamento' : ''}">${UI.rotuloTipo(doc.tipo)}</span>
      </div>
      <div>
        <div class="doc-titulo">${UI.escaparHtml(destinatario)}</div>
        <div class="doc-meta">
          <span class="etiqueta-status ${etiqueta}">${UI.rotuloStatus(doc.status)}</span>
          ${meta.map((m) => `<span>${m}</span>`).join('')}
        </div>
        <div class="doc-acoes">
          <button class="botao" data-acao="abrir" data-id="${doc.id}" type="button">Abrir / editar</button>
          <button class="botao botao-primario" data-acao="pdf" data-id="${doc.id}" type="button">Gerar PDF</button>
          <button class="botao" data-acao="duplicar" data-id="${doc.id}" type="button">Duplicar</button>
          <select data-acao="status" data-id="${doc.id}" data-status="${doc.status}" title="Alterar status">
            <option value="rascunho">Rascunho</option>
            <option value="enviada">Enviada</option>
            <option value="ganha">Ganha</option>
            <option value="perdida">Perdida</option>
            <option value="cancelada">Cancelada</option>
          </select>
          <button class="botao botao-fantasma" data-acao="excluir" data-id="${doc.id}" type="button">Excluir</button>
        </div>
      </div>
      <div class="doc-valor">${F.moeda(doc.total)}</div>`;
  }

  function desenharListaDocumentos() {
    const busca = ($('#filtro-busca').value || '').toLowerCase().trim();
    const tipo = $('#filtro-tipo').value;
    const status = $('#filtro-status').value;

    const filtrados = estado.documentos.filter((doc) => {
      if (tipo && doc.tipo !== tipo) return false;
      if (status && doc.status !== status) return false;
      if (busca) {
        const texto = [doc.destinatario, doc.numeroFormatado, doc.processo, doc.titulo].join(' ').toLowerCase();
        if (!texto.includes(busca)) return false;
      }
      return true;
    });

    const container = $('#lista-documentos');
    if (!filtrados.length) {
      container.innerHTML = estado.documentos.length
        ? '<div class="lista-vazia">Nenhum documento corresponde aos filtros.</div>'
        : `<div class="lista-vazia">
             <p>Você ainda não tem propostas nem orçamentos salvos.</p>
             <p><button class="botao botao-primario" data-acao="nova-proposta" type="button">Criar a primeira proposta</button>
             <a class="botao" href="#/importar">Importar planilha de itens</a></p>
           </div>`;
      return;
    }

    container.innerHTML = filtrados.map((doc) => `<article class="doc-item">${corpoDocumento(doc)}</article>`).join('');

    $$('select[data-acao="status"]', container).forEach((select) => {
      select.value = select.dataset.status;
      select.addEventListener('change', async () => {
        try {
          await API.put('/api/documentos/' + select.dataset.id, { status: select.value });
          UI.toast('Status atualizado.', 'sucesso');
          await carregarDocumentos();
          desenharListaDocumentos();
        } catch (erro) {
          UI.toast(erro.message, 'erro');
        }
      });
    });
  }

  function desenharPainel() {
    $('#ind-total').textContent = estado.totais.quantidade;
    $('#ind-total-valor').textContent = F.moeda(estado.totais.valor) + ' em valores';
    $('#ind-enviadas').textContent = estado.totais.enviadas;
    $('#ind-ganhas').textContent = estado.totais.ganhas;

    const recentes = estado.documentos.slice(0, 4);
    const container = $('#painel-recentes');
    if (!recentes.length) {
      container.innerHTML = `<div class="lista-vazia">
        <p>Comece importando a planilha de itens do edital ou criando uma proposta em branco.</p>
        <p><a class="botao botao-primario" href="#/importar">Importar planilha</a>
        <button class="botao" data-acao="nova-proposta" type="button">Nova proposta em branco</button></p>
      </div>`;
      return;
    }
    container.innerHTML = recentes.map((doc) => `<article class="doc-item">${corpoDocumento(doc)}</article>`).join('');
  }

  function ligarAcoesDocumentos() {
    document.addEventListener('click', async (evento) => {
      const botao = evento.target.closest('[data-acao]');
      if (!botao || botao.tagName === 'SELECT' || botao.dataset.acao === 'status') return;
      const id = botao.dataset.id;
      const acao = botao.dataset.acao;

      if (acao === 'nova-proposta') {
        window.location.hash = '#/documento/novo/proposta';
        return;
      }
      if (!id) return;

      if (acao === 'abrir') {
        window.location.hash = '#/documento/' + id;
        return;
      }
      if (acao === 'pdf') {
        try {
          botao.disabled = true;
          botao.textContent = 'Gerando...';
          const arquivo = await API.baixar('/api/documentos/' + id + '/pdf?download=1');
          API.baixarBlob(arquivo.blob, arquivo.nomeArquivo);
          UI.toast('PDF gerado: ' + arquivo.nomeArquivo, 'sucesso');
          UI.avisarFotosIgnoradas(arquivo);
        } catch (erro) {
          UI.toast('Erro ao gerar PDF: ' + erro.message, 'erro');
        } finally {
          botao.disabled = false;
          botao.textContent = 'Gerar PDF';
        }
        return;
      }
      if (acao === 'duplicar') {
        try {
          const resposta = await API.post('/api/documentos/' + id + '/duplicar');
          UI.toast('Documento duplicado.', 'sucesso');
          await carregarDocumentos();
          window.location.hash = '#/documento/' + resposta.documento.id;
        } catch (erro) {
          UI.toast(erro.message, 'erro');
        }
        return;
      }
      if (acao === 'excluir') {
        const confirma = await UI.confirmar({
          titulo: 'Excluir documento',
          texto: 'Esta ação não pode ser desfeita. Deseja excluir o documento?',
          textoConfirmar: 'Excluir',
          perigo: true,
        });
        if (!confirma) return;
        try {
          await API.del('/api/documentos/' + id);
          UI.toast('Documento excluído.', 'sucesso');
          await carregarDocumentos();
          rotear();
        } catch (erro) {
          UI.toast(erro.message, 'erro');
        }
      }
    });

    ['#filtro-busca', '#filtro-tipo', '#filtro-status'].forEach((sel) => {
      const elemento = $(sel);
      elemento.addEventListener(sel === '#filtro-busca' ? 'input' : 'change', UI.debounce(desenharListaDocumentos, 150));
    });
  }

  // ----------------------------------------------------------- importação

  function preencherColunasModelo() {
    const colunas = [
      ['Numero_Item', false], ['Descricao_Edital', true], ['Unidade', false], ['Quantidade', true],
      ['Valor_Referencia', false], ['Preco_Custo', false], ['Preco_Venda', false], ['Marca_Modelo', false],
      ['Foto_Produto', false], ['Descricao_Catalogo', false], ['Link_da_compra', false],
    ];
    $('#lista-colunas-modelo').innerHTML = colunas
      .map(([nome, obrigatoria]) => `<li class="${obrigatoria ? 'obrigatoria' : ''}">${nome}${obrigatoria ? ' *' : ''}</li>`)
      .join('');
  }

  async function prepararImportacao() {
    preencherColunasModelo();
    const select = $('#importacao-documento');
    await carregarDocumentos();
    select.innerHTML = '<option value="">Selecione...</option>' + estado.documentos
      .map((d) => `<option value="${d.id}">${UI.escaparHtml(d.numeroFormatado + ' — ' + UI.rotuloTipo(d.tipo) + ' — ' + (d.destinatario || 'sem destinatário'))}</option>`)
      .join('');
  }

  function htmlTabelaImportacao(itens) {
    const linhas = itens.map((item, indice) => `
      <tr>
        <td><input type="checkbox" data-indice="${indice}" checked /></td>
        <td>${UI.escaparHtml(item.numeroItem)}</td>
        <td>${UI.escaparHtml(item.descricao).slice(0, 200)}</td>
        <td>${UI.escaparHtml(item.unidade)}</td>
        <td class="numero">${F.quantidade(item.quantidade)}</td>
        <td class="numero">${F.moeda(item.precoVenda)}</td>
        <td>${UI.escaparHtml(item.marcaModelo)}</td>
        <td>${item.foto ? `<img class="foto-miniatura" src="/api/imagem?url=${encodeURIComponent(item.foto)}" alt="" />` : '—'}</td>
      </tr>`).join('');
    return `
      <table class="tabela">
        <thead>
          <tr>
            <th style="width:36px"><input type="checkbox" id="importacao-todos" checked /></th>
            <th>Item</th><th>Descrição</th><th>Un.</th><th class="numero">Qtd</th>
            <th class="numero">Preço de venda</th><th>Marca</th><th>Foto</th>
          </tr>
        </thead>
        <tbody>${linhas}</tbody>
      </table>`;
  }

  async function processarPlanilha(arquivo) {
    if (!arquivo) return;
    const area = $('#area-upload');
    area.innerHTML = '<p class="area-upload-icone">⏳</p><p>Lendo a planilha, aguarde...</p>';
    try {
      const resultado = await API.enviarArquivo('/api/importar', arquivo, 'arquivo');
      estado.itensImportados = resultado.itens;
      $('#bloco-importacao').classList.remove('oculto');
      $('#importacao-titulo').textContent = `${resultado.itens.length} itens encontrados na aba "${resultado.aba}"`;
      $('#importacao-tabela').innerHTML = htmlTabelaImportacao(resultado.itens);

      const avisos = $('#importacao-avisos');
      if (resultado.avisos && resultado.avisos.length) {
        avisos.classList.remove('oculto');
        avisos.innerHTML = '<strong>Confira antes de gerar o PDF:</strong><ul>' +
          resultado.avisos.slice(0, 50).map((a) => `<li>${UI.escaparHtml(a)}</li>`).join('') + '</ul>';
      } else {
        avisos.classList.add('oculto');
      }

      $('#importacao-todos').addEventListener('change', (evento) => {
        $$('#importacao-tabela input[type="checkbox"]').forEach((c) => { c.checked = evento.target.checked; });
      });
      $('#importacao-marcar').textContent = 'Desmarcar todos';
      UI.toast(resultado.itens.length + ' itens lidos da planilha.', 'sucesso');
      $('#bloco-importacao').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (erro) {
      area.innerHTML = `<p class="area-upload-icone">⚠️</p><p><strong>${UI.escaparHtml(erro.message)}</strong></p>
        <p class="texto-suave">Clique para escolher outro arquivo.</p>`;
      UI.toast(erro.message, 'erro');
    }
  }

  function itensSelecionados() {
    const marcados = $$('#importacao-tabela input[type="checkbox"]:checked');
    if (!marcados.length) return [];
    const indices = marcados.map((c) => Number(c.dataset.indice));
    return indices.map((i) => estado.itensImportados[i]).filter(Boolean);
  }

  function ligarImportacao() {
    const area = $('#area-upload');
    const arquivo = $('#arquivo-planilha');

    area.addEventListener('click', () => arquivo.click());
    arquivo.addEventListener('change', () => processarPlanilha(arquivo.files[0]));
    area.addEventListener('dragover', (evento) => {
      evento.preventDefault();
      area.classList.add('arrastando');
    });
    area.addEventListener('dragleave', () => area.classList.remove('arrastando'));
    area.addEventListener('drop', (evento) => {
      evento.preventDefault();
      area.classList.remove('arrastando');
      processarPlanilha(evento.dataTransfer.files[0]);
    });

    $('#importacao-marcar').addEventListener('click', () => {
      const caixas = $$('#importacao-tabela input[type="checkbox"]');
      const todosMarcados = caixas.every((c) => c.checked);
      caixas.forEach((c) => { c.checked = !todosMarcados; });
      $('#importacao-marcar').textContent = todosMarcados ? 'Marcar todos' : 'Desmarcar todos';
    });

    const criarDocumento = (tipo) => {
      const itens = itensSelecionados();
      if (!itens.length) {
        UI.toast('Selecione ao menos um item da tabela.', 'aviso');
        return;
      }
      estado.pendenteEditor = { tipo, itens };
      window.location.hash = '#/documento/novo/' + tipo;
    };

    $('#importacao-criar-proposta').addEventListener('click', () => criarDocumento('proposta'));
    $('#importacao-criar-orcamento').addEventListener('click', () => criarDocumento('orcamento'));

    $('#importacao-adicionar').addEventListener('click', async () => {
      const id = $('#importacao-documento').value;
      const itens = itensSelecionados();
      if (!id) {
        UI.toast('Escolha o documento que vai receber os itens.', 'aviso');
        return;
      }
      if (!itens.length) {
        UI.toast('Selecione ao menos um item da tabela.', 'aviso');
        return;
      }
      const botao = $('#importacao-adicionar');
      try {
        botao.disabled = true;
        botao.textContent = 'Adicionando...';
        const resposta = await API.get('/api/documentos/' + id);
        const documento = resposta.documento;
        documento.itens = (documento.itens || []).concat(itens);
        await API.put('/api/documentos/' + id, documento);
        UI.toast(itens.length + ' itens adicionados ao documento.', 'sucesso');
        window.location.hash = '#/documento/' + id;
      } catch (erro) {
        UI.toast(erro.message, 'erro');
      } finally {
        botao.disabled = false;
        botao.textContent = 'Adicionar ao documento selecionado';
      }
    });
  }

  // --------------------------------------------------------------- empresa

  const CAMPOS_EMPRESA = [
    ['razaoSocial', '#emp-razao'], ['nomeFantasia', '#emp-fantasia'], ['cnpj', '#emp-cnpj'],
    ['inscricaoEstadual', '#emp-ie'], ['telefone', '#emp-telefone'], ['email', '#emp-email'],
    ['cidade', '#emp-cidade'], ['uf', '#emp-uf'], ['endereco', '#emp-endereco'], ['cep', '#emp-cep'],
    ['banco', '#emp-banco'], ['agencia', '#emp-agencia'], ['conta', '#emp-conta'], ['chavePix', '#emp-pix'],
    ['representante', '#emp-representante'], ['cpfRepresentante', '#emp-cpf'], ['cargoRepresentante', '#emp-cargo'],
  ];

  const CAMPOS_PADROES = [
    ['validadeDias', '#pad-validade'], ['cidadeUf', '#pad-cidade'], ['prazoEntrega', '#pad-prazo'],
    ['garantia', '#pad-garantia'], ['condicoesPagamento', '#pad-pagamento'], ['observacoes', '#pad-observacoes'],
  ];

  function carregarEmpresa() {
    estado.empresa = Object.assign({}, (estado.perfil && estado.perfil.empresa) || {});
    estado.padroes = Object.assign({}, (estado.perfil && estado.perfil.padroes) || {});

    CAMPOS_EMPRESA.forEach(([chave, sel]) => {
      $(sel).value = estado.empresa[chave] == null ? '' : estado.empresa[chave];
    });
    $('#emp-simples').checked = estado.empresa.simplesNacional !== false;
    CAMPOS_PADROES.forEach(([chave, sel]) => {
      $(sel).value = estado.padroes[chave] == null ? '' : estado.padroes[chave];
    });
    ['#emp-previa-logo', '#emp-previa-assinatura'].forEach((sel) => {
      $(sel).classList.add('oculto');
      $(sel).dataset.referencia = '';
    });
    if (estado.empresa.logo) UI.aplicarImagem($('#emp-previa-logo'), estado.empresa.logo);
    if (estado.empresa.assinatura) UI.aplicarImagem($('#emp-previa-assinatura'), estado.empresa.assinatura);
  }


  function ligarEmpresa() {
    $('#emp-salvar').addEventListener('click', async () => {
      const empresa = Object.assign({}, estado.empresa);
      CAMPOS_EMPRESA.forEach(([chave, sel]) => { empresa[chave] = $(sel).value.trim(); });
      empresa.simplesNacional = $('#emp-simples').checked;
      try {
        const resposta = await API.put('/api/perfil/empresa', empresa);
        estado.empresa = Object.assign(estado.empresa, resposta.empresa);
        estado.perfil.empresa = resposta.empresa;
        mostrarApp(); // o nome da empresa também aparece no topo
        atualizarSituacaoDados();
        UI.toast('Dados da empresa salvos.', 'sucesso');
      } catch (erro) {
        UI.toast(erro.message, 'erro');
      }
    });

    $('#pad-salvar').addEventListener('click', async () => {
      const padroes = {};
      CAMPOS_PADROES.forEach(([chave, sel]) => { padroes[chave] = $(sel).value; });
      padroes.validadeDias = Number(padroes.validadeDias) || 0;
      try {
        const resposta = await API.put('/api/perfil/padroes', padroes);
        estado.perfil.padroes = resposta.padroes;
        UI.toast('Padrões salvos.', 'sucesso');
      } catch (erro) {
        UI.toast(erro.message, 'erro');
      }
    });

    $$('[data-upload-emp]').forEach((botao) => {
      const campo = botao.dataset.uploadEmp;
      const arquivo = $('#emp-arquivo-' + campo);
      botao.addEventListener('click', () => arquivo.click());
      arquivo.addEventListener('change', async () => {
        const escolhido = arquivo.files[0];
        if (!escolhido) return;
        try {
          botao.disabled = true;
          botao.textContent = 'Enviando...';
          const resposta = await API.enviarArquivo('/api/uploads', escolhido, 'arquivo');
          estado.empresa[campo] = resposta.caminho;
          UI.aplicarImagem($('#emp-previa-' + campo), resposta.caminho);
          UI.toast('Imagem enviada. Clique em "Salvar dados da empresa" para gravar.', 'aviso');
        } catch (erro) {
          UI.toast(erro.message, 'erro');
        } finally {
          botao.disabled = false;
          botao.textContent = 'Enviar imagem';
          arquivo.value = '';
        }
      });
    });

    $$('[data-remover-emp]').forEach((botao) => {
      botao.addEventListener('click', () => {
        const campo = botao.dataset.removerEmp;
        estado.empresa[campo] = '';
        const previa = $('#emp-previa-' + campo);
        previa.removeAttribute('src');
        previa.dataset.referencia = '';
        previa.classList.add('oculto');
        UI.toast('Imagem removida. Clique em "Salvar dados da empresa" para gravar.', 'aviso');
      });
    });
  }

  // --------------------------------------------------------------- geral

  function ligarNavegacao() {
    $('#alternar-menu').addEventListener('click', () => $('#navegacao').classList.toggle('aberta'));
    $('#botao-usuario').addEventListener('click', () => $('#lista-usuario').classList.toggle('oculto'));
    document.addEventListener('click', (evento) => {
      if (!evento.target.closest('.usuario-menu')) $('#lista-usuario').classList.add('oculto');
    });

    const abrirNovo = (tipo) => {
      const destino = '#/documento/novo/' + tipo;
      if (window.location.hash === destino) rotear(); // mesmo endereço não dispara hashchange
      else window.location.hash = destino;
    };
    const rever = $('#situacao-dados-rever');
    if (rever) rever.addEventListener('click', () => atualizarSituacaoDados());

    $('#botao-nova-proposta').addEventListener('click', () => abrirNovo('proposta'));
    $('#painel-nova-proposta').addEventListener('click', () => abrirNovo('proposta'));
    $('#docs-nova-proposta').addEventListener('click', () => abrirNovo('proposta'));
    $('#painel-novo-orcamento').addEventListener('click', () => abrirNovo('orcamento'));
    $('#docs-novo-orcamento').addEventListener('click', () => abrirNovo('orcamento'));

    window.addEventListener('hashchange', rotear);
  }

  let jaIniciado = false;

  async function iniciar() {
    if (jaIniciado) return; // evita ligar os eventos duas vezes
    jaIniciado = true;
    window.Editor.iniciar();
    ligarNavegacao();
    ligarAcoesDocumentos();
    ligarImportacao();
    ligarEmpresa();

    try {
      // não há login: o sistema abre direto no painel com os dados da empresa
      const resposta = await API.get('/api/perfil');
      estado.perfil = resposta.perfil || { empresa: {}, padroes: {} };
      mostrarApp();
      atualizarSituacaoDados();
      if (!window.location.hash) window.location.hash = '#/painel';
      rotear();
    } catch (erro) {
      UI.toast('Não foi possível carregar os dados do sistema: ' + erro.message, 'erro');
    }
  }

  window.App = {
    iniciar,
    atualizarSituacaoDados,
    recarregarLista: async () => {
      await carregarDocumentos();
      if (!$('#view-documentos').classList.contains('oculto')) desenharListaDocumentos();
      if (!$('#view-painel').classList.contains('oculto')) desenharPainel();
    },
    estado,
  };

  document.addEventListener('DOMContentLoaded', iniciar);
})();
