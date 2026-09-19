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
    // documentos marcados na lista (para excluir vários de uma vez)
    selecaoDocs: [],
    // modelos de declaração do usuário (guardados com os dados da empresa)
    modelosDeclaracao: [],
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
  /** Nome do banco que aparece nas mensagens ('Supabase' / 'Firebase'). */
  function nomeDoBanco(provedor) {
    return ({ supabase: 'Supabase', firebase: 'Firebase' })[provedor] || 'banco';
  }

  /**
   * O nome do menu muda de tempo em tempo no painel do Supabase: este atalho
   * leva direto à página das chaves do projeto que está escrito no endereço
   * (nada é enviado para fora — serve só para economizar a procura).
   */
  function atualizarLinkSupabase() {
    const link = $('#banco-abrir-supabase');
    const campo = $('#banco-url');
    if (!link || !campo) return;
    const achado = campo.value.trim().match(/^https?:\/\/([a-z0-9-]+)\.supabase\.(?:co|in)\b/i);
    if (!achado) {
      link.classList.add('oculto');
      link.removeAttribute('href');
      return;
    }
    link.href = 'https://supabase.com/dashboard/project/' + achado[1] + '/settings/api-keys';
    link.classList.remove('oculto');
  }

  async function atualizarSituacaoDados() {
    if (!temTela()) return;
    const caixa = $('#situacao-dados');
    const texto = $('#situacao-dados-texto');
    const areaBanco = $('#conectar-banco');
    if (!caixa || !texto) return;

    const modoLocal = window.ModoEstatico && window.ModoEstatico.ativo && window.ModoEstatico.ativo();
    if (modoLocal) {
      const nuvem = window.Nuvem ? window.Nuvem.situacao() : { ativa: false };
      const nuvemAtiva = nuvem.ativa;
      const situacao = window.ModoEstatico.armazenamento ? window.ModoEstatico.armazenamento() : null;
      const ultimo = situacao && situacao.ultimoSalvamento;
      if (situacao && situacao.ok === false) {
        // janela privada, dados de site bloqueados ou cota cheia: o que for
        // digitado aqui não sobrevive a fechar a aba — melhor dizer na cara
        caixa.className = 'situacao-dados erro';
        texto.textContent =
          'Atenção: este navegador NÃO está guardando os dados' +
          (situacao.motivo ? ' (' + situacao.motivo + ')' : '') +
          '. Baixe um backup pelo menu antes de fechar, ou abra o sistema fora da janela privada.';
      } else if (ultimo && ultimo.ok === false) {
        caixa.className = 'situacao-dados erro';
        texto.textContent =
          'A última gravação neste navegador falhou' + (ultimo.motivo ? ' (' + ultimo.motivo + ')' : '') +
          '. Baixe um backup pelo menu e tente salvar de novo.';
      } else if (nuvemAtiva && nuvem.erro) {
        caixa.className = 'situacao-dados erro';
        texto.textContent = 'Nuvem: ' + nuvem.erro + ' — os dados continuam salvos neste navegador.';
      } else if (nuvemAtiva && nuvem.enviando) {
        caixa.className = 'situacao-dados';
        texto.textContent = 'Enviando para a conta "' + (nuvem.usuario || '') + '"...';
      } else if (nuvemAtiva && nuvem.pendente) {
        caixa.className = 'situacao-dados aviso';
        texto.textContent =
          'Alterações salvas neste navegador — enviando para a conta "' + (nuvem.usuario || '') +
          '" em instantes (pode fechar a página: o envio continua).';
      } else if (nuvemAtiva && nuvem.aviso) {
        caixa.className = 'situacao-dados aviso';
        texto.textContent = 'Conta "' + (nuvem.usuario || '') + '": ' + nuvem.aviso;
      } else if (nuvemAtiva) {
        caixa.className = 'situacao-dados ok';
        texto.textContent =
          'Dados salvos neste navegador e na conta ' + (nuvem.usuario ? '"' + nuvem.usuario + '"' : 'da nuvem') +
          (nuvem.projeto ? ' (projeto ' + nuvem.projeto + ')' : '') +
          (nuvem.sincronizadoEm ? ' — última sincronização ' + quando(nuvem.sincronizadoEm) + '.' : '.');
      } else {
        caixa.className = 'situacao-dados aviso';
        texto.textContent =
          'Dados salvos neste navegador (sem servidor). Para abrir em outro computador, entre numa ' +
          'conta em "Conta e nuvem" aqui embaixo — ou baixe um backup pelo menu.';
      }
      const blocoNuvem = $('#nuvem-bloco');
      if (blocoNuvem) blocoNuvem.classList.remove('oculto');
      mostrarStatusDaNuvem();
      if (areaBanco) areaBanco.classList.add('oculto');
      return;
    }

    const blocoNuvemComServidor = $('#nuvem-bloco');
    if (blocoNuvemComServidor) blocoNuvemComServidor.classList.add('oculto');

    try {
      const saude = await API.get('/api/health');
      const banco = saude.banco || {};
      const nomeBanco = nomeDoBanco(banco.provedor);
      const noBanco = saude.armazenamento !== 'arquivo' && banco.conectado;
      if (noBanco) {
        caixa.className = 'situacao-dados ok';
        texto.textContent =
          'Banco de dados conectado (' + nomeBanco + '): empresa e documentos salvos no banco.';
      } else if (banco.configurado) {
        caixa.className = 'situacao-dados erro';
        texto.textContent =
          'O banco (' + nomeBanco + ') não está recebendo os dados: ' + (banco.erro || 'motivo desconhecido') +
          ' — o que você salvar fica no arquivo do servidor até o banco voltar.';
      } else {
        caixa.className = 'situacao-dados aviso';
        texto.textContent =
          'Banco de dados não configurado: os dados estão sendo salvos no arquivo do servidor.' +
          (saude.configuravelAqui ? ' Use "Conectar banco de dados" aqui embaixo.' : ' Veja o README (seção 4).');
      }

      // o formulário de conectar o banco só faz sentido enquanto ele não está
      // ligado — e só existe onde o servidor aceita (a própria máquina)
      if (areaBanco) {
        areaBanco.classList.toggle('oculto', !(saude.configuravelAqui && !noBanco));
        const campoUrl = $('#banco-url');
        if (campoUrl && !campoUrl.value && banco.url) campoUrl.value = banco.url;
        atualizarLinkSupabase();
      }
    } catch (erro) {
      caixa.className = 'situacao-dados erro';
      texto.textContent = 'Não consegui falar com o servidor para saber onde os dados estão: ' + erro.message;
      if (areaBanco) areaBanco.classList.add('oculto');
    }
  }

  /**
   * Liga o banco pela própria tela: grava a credencial (chave do Supabase ou
   * JSON do Firebase) no servidor e reconecta na hora. Aparece só em localhost
   * — o servidor recusa pedidos que não venham da própria máquina.
   */
  function ligarConexaoBanco() {
    const abrir = $('#banco-abrir');
    const cancelar = $('#banco-cancelar');
    const form = $('#banco-form');
    const mensagem = $('#banco-mensagem');
    if (!form) return;

    const escrever = (texto, tipo) => {
      mensagem.textContent = texto || '';
      mensagem.className = 'mensagem-banco' + (tipo ? ' ' + tipo : '');
    };

    /** Lê o arquivo escolhido (o .json do Firebase) como texto. */
    function lerArquivoTexto(arquivo) {
      if (arquivo && typeof arquivo.text === 'function') return arquivo.text();
      return new Promise((resolver, rejeitar) => {
        const leitor = new FileReader();
        leitor.onload = () => resolver(String(leitor.result || ''));
        leitor.onerror = () => rejeitar(new Error('Não consegui ler o arquivo escolhido.'));
        leitor.readAsText(arquivo);
      });
    }

    const campoEndereco = $('#banco-url');
    if (campoEndereco) campoEndereco.addEventListener('input', atualizarLinkSupabase);

    const sugestao = $('#banco-sugestao');
    const sugestaoTexto = $('#banco-sugestao-texto');
    const sugestaoUsar = $('#banco-sugestao-usar');

    /**
     * Procura no computador um arquivo do Firebase já baixado: se achar, a tela
     * oferece "usar este arquivo" (a pessoa não precisa nem escolher na mão).
     */
    async function procurarArquivoBaixado() {
      if (!sugestao) return;
      sugestao.classList.add('oculto');
      try {
        const resposta = await API.get('/api/banco/procurar');
        const achado = (resposta.encontrados || [])[0];
        if (!achado) return;
        sugestaoTexto.textContent =
          'Encontrei o arquivo ' + achado.nome + (achado.projeto ? ' (projeto ' + achado.projeto + ')' : '') + '.';
        sugestaoUsar.dataset.caminho = achado.arquivo;
        sugestao.classList.remove('oculto');
      } catch (_) {
        /* servidor antigo ou sem permissão de leitura: segue no caminho manual */
      }
    }

    if (sugestaoUsar) {
      sugestaoUsar.addEventListener('click', () => enviarCredencial({ caminho: sugestaoUsar.dataset.caminho }));
    }

    if (abrir) {
      abrir.addEventListener('click', () => {
        form.classList.remove('oculto');
        abrir.classList.add('oculto');
        escrever('');
        const campoUrl = $('#banco-url');
        if (campoUrl) campoUrl.focus();
        atualizarLinkSupabase();
        procurarArquivoBaixado();
      });
    }
    if (cancelar) {
      cancelar.addEventListener('click', () => {
        form.classList.add('oculto');
        if (abrir) abrir.classList.remove('oculto');
        escrever('');
      });
    }

    async function enviarCredencial(extras) {
      const url = $('#banco-url').value.trim();
      const credencial = extras && extras.caminho ? '' : $('#banco-credencial').value.trim();
      if (!credencial && !(extras && extras.caminho)) {
        escrever('Escolha o arquivo .json do Firebase ou cole a chave do Supabase.', 'erro');
        return;
      }

      const botao = $('#banco-salvar');
      botao.disabled = true;
      escrever('Testando a conexão...');
      try {
        const corpo = Object.assign({ url, credencial }, extras || {});
        const resposta = await API.post('/api/banco/configurar', corpo);
        $('#banco-credencial').value = '';
        if (sugestao) sugestao.classList.add('oculto');
        if (resposta.ok) {
          escrever((resposta.provedorNome || 'Banco') + ' conectado! Os dados já estão sendo salvos nele.', 'ok');
          UI.toast('Banco de dados conectado.', 'sucesso');
        } else {
          const motivo = (resposta.banco && resposta.banco.erro) || '';
          escrever('Credencial salva, mas o banco ainda não respondeu.' +
            (motivo ? ' ' + motivo : '') + (resposta.dica ? ' ' + resposta.dica : ''), 'erro');
        }
        await atualizarSituacaoDados();
      } catch (erro) {
        escrever(erro.message, 'erro');
      } finally {
        botao.disabled = false;
      }
    }

    form.addEventListener('submit', (evento) => {
      evento.preventDefault();
      enviarCredencial();
    });

    // escolher o .json baixado do Firebase (o jeito mais fácil: não precisa
    // copiar o conteúdo da chave à mão) — envia assim que o arquivo é lido
    const campoArquivo = $('#banco-arquivo');
    const botaoArquivo = $('#banco-arquivo-botao');
    async function usarArquivo(arquivo) {
      if (!arquivo) return;
      try {
        const texto = await lerArquivoTexto(arquivo);
        $('#banco-credencial').value = texto.trim();
        escrever('Arquivo lido: ' + (arquivo.name || 'conta de serviço') + '. Conectando...');
        await enviarCredencial();
      } catch (erro) {
        escrever(erro.message, 'erro');
      }
    }
    if (botaoArquivo && campoArquivo) {
      botaoArquivo.addEventListener('click', () => campoArquivo.click());
      campoArquivo.addEventListener('change', () => usarArquivo(campoArquivo.files && campoArquivo.files[0]));
    }

    // arrastar o arquivo para dentro do formulário também funciona
    ['dragenter', 'dragover'].forEach((tipo) =>
      form.addEventListener(tipo, (evento) => {
        evento.preventDefault();
        form.classList.add('arrastando');
      })
    );
    ['dragleave', 'drop'].forEach((tipo) =>
      form.addEventListener(tipo, (evento) => {
        evento.preventDefault();
        form.classList.remove('arrastando');
      })
    );
    form.addEventListener('drop', (evento) => {
      const arquivo = evento.dataTransfer && evento.dataTransfer.files && evento.dataTransfer.files[0];
      usarArquivo(arquivo);
    });
  }

  function mostrarApp() {
    $('#app').classList.remove('oculto');
    const nome = nomeDaEmpresa();
    $('#nome-usuario').textContent = nome;
    $('#avatar-usuario').textContent = F.iniciais(nome) || 'DEJ';
    $('#saudacao').textContent = 'O que vamos montar hoje: uma proposta ou um orçamento?';
  }

  // -------------------------------------------------------------- rotas

  const VISTAS = ['painel', 'documentos', 'declaracoes', 'editor', 'importar', 'empresa'];

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
    if (primeira === 'declaracoes') {
      mostrarVista('declaracoes');
      marcarNavegacao('declaracoes');
      desenharModelosDeclaracao();
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
      // a seleção só guarda ids que ainda existem
      const vivos = estado.documentos.map((d) => d.id);
      estado.selecaoDocs = estado.selecaoDocs.filter((id) => vivos.indexOf(id) >= 0);
    } catch (erro) {
      UI.toast('Não foi possível carregar os documentos: ' + erro.message, 'erro');
    }
  }

  function corpoDocumento(doc, comSelecao) {
    const etiqueta = `status-${doc.status}`;
    const destinatario = doc.destinatario || (doc.tipo === 'orcamento' ? 'Cliente não informado' : 'Órgão não informado');
    const meta = [];
    if (doc.processo) meta.push('Processo ' + UI.escaparHtml(doc.processo));
    meta.push(doc.quantidadeItens + (doc.quantidadeItens === 1 ? ' item' : ' itens'));
    meta.push('atualizado em ' + F.dataHora(doc.atualizadoEm));
    if (doc.data) meta.push('data do documento: ' + F.dataBR(doc.data));

    const marcado = estado.selecaoDocs.indexOf(doc.id) >= 0;
    const marcador = comSelecao
      ? `<label class="doc-marcador" title="Selecionar este documento">
           <input type="checkbox" data-marcar-doc="${UI.escaparHtml(doc.id)}"${marcado ? ' checked' : ''} />
         </label>`
      : '';

    return `
      ${marcador}
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
          <button class="botao" data-acao="planilha" data-id="${doc.id}" type="button">Planilha (Excel)</button>
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
    atualizarBarraDocumentos();
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

    container.innerHTML = filtrados
      .map((doc) => {
        const marcado = estado.selecaoDocs.indexOf(doc.id) >= 0;
        return `<article class="doc-item${marcado ? ' marcado' : ''}" data-doc="${UI.escaparHtml(doc.id)}">${corpoDocumento(doc, true)}</article>`;
      })
      .join('');

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

  // ------------------------------------------- selecionar/excluir documentos

  /** Documentos que estão na tela agora (respeitando busca e filtros). */
  function documentosFiltrados() {
    const busca = ($('#filtro-busca').value || '').toLowerCase().trim();
    const tipo = $('#filtro-tipo').value;
    const status = $('#filtro-status').value;
    return estado.documentos.filter((doc) => {
      if (tipo && doc.tipo !== tipo) return false;
      if (status && doc.status !== status) return false;
      if (busca) {
        const texto = [doc.destinatario, doc.numeroFormatado, doc.processo, doc.titulo].join(' ').toLowerCase();
        if (!texto.includes(busca)) return false;
      }
      return true;
    });
  }

  function marcarDocumento(id, marcado) {
    const posicao = estado.selecaoDocs.indexOf(id);
    if (marcado && posicao < 0) estado.selecaoDocs.push(id);
    if (!marcado && posicao >= 0) estado.selecaoDocs.splice(posicao, 1);
    const item = $(`.doc-item[data-doc="${id}"]`);
    if (item) item.classList.toggle('marcado', marcado);
    atualizarBarraDocumentos();
  }

  function atualizarBarraDocumentos() {
    const quantos = estado.selecaoDocs.length;
    const visiveis = documentosFiltrados();
    const semVisiveis = visiveis.length === 0;
    $('#docs-selecao-contagem').textContent = quantos
      ? quantos + (quantos === 1 ? ' documento selecionado' : ' documentos selecionados')
      : 'Nenhum documento selecionado';
    $('#docs-excluir-selecionados').disabled = quantos === 0;
    $('#docs-selecionar-todos').disabled = semVisiveis;
    $('#docs-desmarcar-todos').disabled = semVisiveis && quantos === 0;
    $('#docs-selecionar-todos').textContent =
      !semVisiveis && visiveis.every((d) => estado.selecaoDocs.indexOf(d.id) >= 0)
        ? 'Desmarcar todos'
        : 'Selecionar todos';
    $('#docs-excluir-todos').disabled = estado.documentos.length === 0;
  }

  function selecionarTodosDocumentos() {
    const visiveis = documentosFiltrados().map((d) => d.id);
    const todosMarcados = visiveis.length > 0 && visiveis.every((id) => estado.selecaoDocs.indexOf(id) >= 0);
    if (todosMarcados) {
      estado.selecaoDocs = estado.selecaoDocs.filter((id) => visiveis.indexOf(id) < 0);
    } else {
      visiveis.forEach((id) => { if (estado.selecaoDocs.indexOf(id) < 0) estado.selecaoDocs.push(id); });
    }
    desenharListaDocumentos();
  }

  function limparSelecaoDocumentos() {
    estado.selecaoDocs = [];
  }

  /** Exclui uma lista de documentos (um, vários ou todos), com confirmação. */
  async function excluirDocumentos(ids, titulo, texto, textoConfirmar) {
    if (!ids.length) return;
    const confirma = await UI.confirmar({
      titulo,
      texto,
      textoConfirmar: textoConfirmar || 'Excluir',
      perigo: true,
    });
    if (!confirma) return;
    try {
      const resposta = await API.post('/api/documentos/excluir', { ids });
      const removidos = Number(resposta && resposta.removidos);
      limparSelecaoDocumentos();
      UI.toast(
        (removidos || ids.length) === 1
          ? 'Documento excluído.'
          : (removidos || ids.length) + ' documentos excluídos.',
        'sucesso'
      );
      await carregarDocumentos();
      rotear();
    } catch (erro) {
      UI.toast('Não foi possível excluir: ' + erro.message, 'erro');
    }
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
      if (acao === 'planilha') {
        try {
          botao.disabled = true;
          botao.textContent = 'Gerando...';
          const arquivo = await API.baixar('/api/documentos/' + id + '/planilha-auxiliar');
          API.baixarBlob(arquivo.blob, arquivo.nomeArquivo);
          UI.toast('Planilha auxiliar gerada: ' + arquivo.nomeArquivo, 'sucesso', 9000);
        } catch (erro) {
          UI.toast('Não consegui gerar a planilha: ' + erro.message, 'erro');
        } finally {
          botao.disabled = false;
          botao.textContent = 'Planilha (Excel)';
        }
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

    // caixas de marcar da lista de documentos
    document.addEventListener('change', (evento) => {
      const caixa = evento.target.closest('[data-marcar-doc]');
      if (caixa) marcarDocumento(caixa.dataset.marcarDoc, caixa.checked);
    });

    $('#docs-selecionar-todos').addEventListener('click', () => {
      if (!$('#docs-selecionar-todos').textContent.startsWith('Desmarcar')) {
        return selecionarTodosDocumentos();
      }
      // "desmarcar todos": tira só os que estão à vista, como o rótulo promete
      const visiveis = documentosFiltrados().map((d) => d.id);
      estado.selecaoDocs = estado.selecaoDocs.filter((id) => visiveis.indexOf(id) < 0);
      desenharListaDocumentos();
    });
    $('#docs-desmarcar-todos').addEventListener('click', () => {
      limparSelecaoDocumentos();
      desenharListaDocumentos();
    });
    $('#docs-excluir-selecionados').addEventListener('click', () => {
      const ids = estado.selecaoDocs.slice();
      excluirDocumentos(
        ids,
        'Excluir documentos',
        ids.length === 1
          ? 'Esta ação não pode ser desfeita. Deseja excluir o documento selecionado?'
          : 'Esta ação não pode ser desfeita. Deseja excluir os ' + ids.length + ' documentos selecionados?'
      );
    });
    $('#docs-excluir-todos').addEventListener('click', () => {
      const ids = estado.documentos.map((d) => d.id);
      excluirDocumentos(
        ids,
        'Excluir todos os documentos',
        'Esta ação não pode ser desfeita. Todos os ' + ids.length + ' documentos (propostas e orçamentos) serão excluídos.'
      );
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

    estado.modelosDeclaracao = (estado.perfil && estado.perfil.declaracoes) || [];
    desenharModelosDeclaracao();
  }

  // ------------------------------------------- modelos de declaração

  /** Onde a lista das declarações guardadas aparece (seção Declarações e Minha empresa). */
  function listasDeDeclaracoes() {
    return UI.$$('[data-lista-modelos]');
  }

  /** A lista que está à vista agora: é dela que se lê o que foi digitado. */
  function listaDeclaracoesVisivel() {
    return listasDeDeclaracoes().find((lista) => !lista.closest('.oculto')) || null;
  }

  /** Lista dos modelos guardados (o texto é reaproveitado nos documentos). */
  function desenharModelosDeclaracao() {
    const listas = listasDeDeclaracoes();
    if (!listas.length) return;
    const modelos = estado.modelosDeclaracao || [];

    const contagem = $('#declaracoes-contagem');
    if (contagem) {
      contagem.textContent = modelos.length
        ? modelos.length + (modelos.length === 1 ? ' declaração guardada' : ' declarações guardadas')
        : 'Nenhuma declaração guardada';
    }

    const html = modelos.length
      ? modelos.map((modelo, indice) => `
      <div class="declaracao">
        <div class="declaracao-cabecalho">
          <input type="text" data-modelo-titulo="${indice}" value="${UI.escaparHtml(modelo.titulo || '')}"
            placeholder="Título (ex.: Declaração ME / EPP / MEI)" />
          <div class="item-acoes">
            <button class="botao botao-fantasma" data-modelo-imprimir="${indice}" type="button"
              title="Imprimir esta declaração (folha timbrada, no padrão da proposta)">🖨</button>
            <button class="botao botao-fantasma" data-modelo-remover="${indice}" type="button" title="Remover declaração">🗑</button>
          </div>
        </div>
        <textarea data-modelo-texto="${indice}" placeholder="Texto da declaração">${UI.escaparHtml(modelo.texto || '')}</textarea>
      </div>
    `).join('')
      : '<p class="texto-suave">Nenhuma declaração guardada ainda. Clique em ' +
        '<strong>+ Nova declaração</strong> para começar de um modelo (Declaração Unificada, ' +
        'ME / EPP / MEI, não emprego de menor) ou escrever do zero.</p>';

    listas.forEach((lista) => { lista.innerHTML = html; });
  }

  /** Lê o que está na tela para a lista em memória. */
  function coletarModelosDeclaracao(onde) {
    const lista = onde || listaDeclaracoesVisivel();
    if (!lista) return;
    const modelos = estado.modelosDeclaracao || [];
    UI.$$('[data-modelo-titulo]', lista).forEach((campo) => {
      const indice = Number(campo.dataset.modeloTitulo);
      if (modelos[indice]) modelos[indice].titulo = campo.value;
    });
    UI.$$('[data-modelo-texto]', lista).forEach((campo) => {
      const indice = Number(campo.dataset.modeloTexto);
      if (modelos[indice]) modelos[indice].texto = campo.value;
    });
  }

  /** Abre o escolhedor de modelos: os do usuário, os sugeridos e "começar em branco". */
  async function escolherModeloDeclaracao(aoEscolher) {
    if (!estado.modelosDeclaracao) await recarregarPerfil();
    const meus = (estado.modelosDeclaracao || []).map((m) => Object.assign({}, m, { meu: true }));
    const nomes = meus.map((m) => String(m.titulo || '').toLowerCase());
    const sugeridos = window.Declaracoes.MODELOS
      .filter((m) => nomes.indexOf(m.titulo.toLowerCase()) < 0)
      .map((m) => Object.assign({}, m, { meu: false }));
    const modelos = meus.concat(sugeridos);

    UI.abrirModal({
      titulo: 'Adicionar declaração',
      corpo: `
        <p class="texto-suave">Escolha um modelo para começar. O texto é editável: mudar aqui não
        altera o modelo guardado.</p>
        <label class="campo campo-largo">Declaração
          <select id="declaracao-modelo">
            ${modelos.map((m, i) => `<option value="${i}">${UI.escaparHtml(m.titulo)}${m.meu ? ' (meu modelo)' : (m.descricao ? ' — ' + UI.escaparHtml(m.descricao) : '')}</option>`).join('')}
            <option value="branco">— Começar em branco —</option>
          </select>
        </label>
      `,
      botoes: [
        { texto: 'Cancelar', classe: 'botao-fantasma', acao: () => UI.fecharModal() },
        {
          texto: 'Adicionar',
          classe: 'botao-primario',
          acao: () => {
            const escolhido = $('#declaracao-modelo').value;
            const nova = escolhido === 'branco'
              ? window.Declaracoes.emBranco()
              : window.Declaracoes.doModelo(modelos[Number(escolhido)]);
            UI.fecharModal();
            aoEscolher(nova);
          },
        },
      ],
    });
  }

  /**
   * Imprime uma declaração guardada: sai a folha timbrada (o mesmo padrão da
   * proposta, com a logomarca) para assinar. Como aqui não há documento, valem os
   * dados da empresa — os campos do edital ficam sem valor e a tela avisa quais.
   */
  async function imprimirModeloDeclaracao(indice) {
    coletarModelosDeclaracao();
    const modelo = (estado.modelosDeclaracao || [])[indice];
    if (!modelo || !String(modelo.texto || '').trim()) {
      UI.toast('Escreva o texto da declaração antes de imprimir.', 'aviso');
      return;
    }
    try {
      const arquivo = await API.pdfDeclaracao([modelo], null);
      API.baixarBlob(arquivo.blob, arquivo.nomeArquivo);
      UI.toast('Declaração pronta: ' + arquivo.nomeArquivo, 'sucesso');
      UI.avisarFotosIgnoradas(API.ultimasFotosIgnoradas);
      if (arquivo.camposVazios && arquivo.camposVazios.length) {
        UI.toast(
          'No papel, ' + arquivo.camposVazios.map((c) => '{' + c + '}').join(', ') +
            ' sairão sem valor (são dados do documento). Para saírem preenchidos, imprima pela aba ' +
            'Declarações do documento.',
          'aviso',
          9000
        );
      }
    } catch (erro) {
      UI.toast('Não foi possível imprimir a declaração: ' + erro.message, 'erro');
    }
  }

  /** "+ Nova declaração": escolhe um modelo (ou em branco) e guarda na lista de trabalho. */
  async function adicionarModeloDeclaracao() {
    await escolherModeloDeclaracao((nova) => {
      estado.modelosDeclaracao = (estado.modelosDeclaracao || []).concat([
        { titulo: nova.titulo, texto: nova.texto },
      ]);
      desenharModelosDeclaracao();
      UI.toast('Declaração adicionada. Edite o texto e salve.', 'sucesso', 6000);
    });
  }

  async function salvarModelosDeclaracao() {
    coletarModelosDeclaracao();
    const lista = (estado.modelosDeclaracao || []).filter((m) => m.titulo || m.texto);
    try {
      const resposta = await API.put('/api/perfil/declaracoes', { declaracoes: lista });
      estado.modelosDeclaracao = resposta.declaracoes || [];
      if (estado.perfil) estado.perfil.declaracoes = estado.modelosDeclaracao;
      desenharModelosDeclaracao();
      UI.toast('Modelos de declaração salvos.', 'sucesso');
      await enviarParaAConta('Modelos de declaração salvos na sua conta.');
    } catch (erro) {
      UI.toast('Não foi possível salvar os modelos: ' + erro.message, 'erro');
    }
  }


  /** Data e hora curtinhas, para a linha do painel. */
  function quando(iso) {
    try {
      return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch (_) {
      return iso;
    }
  }

  /** Escreve o estado da conta/nuvem no bloco "Conta e nuvem". */
  function mostrarStatusDaNuvem() {
    if (!temTela()) return;
    const area = $('#nuvem-status');
    const nuvem = window.Nuvem ? window.Nuvem.situacao() : { ativa: false };
    const logado = Boolean(nuvem.ativa);
    const entrar = $('#nuvem-entrar');
    const sincronizar = $('#nuvem-sincronizar');
    const link = $('#nuvem-link');
    const sair = $('#nuvem-sair');
    if (entrar) entrar.classList.toggle('oculto', logado);
    [sincronizar, link, sair].forEach((botao) => { if (botao) botao.classList.toggle('oculto', !logado); });
    const noMenu = $('#menu-sair');
    if (noMenu) noMenu.classList.toggle('oculto', !logado);
    if (!area) return;
    if (!logado) {
      area.textContent = 'Sem conta: os dados ficam só neste navegador.';
      return;
    }
    area.textContent = nuvem.erro
      ? 'Conta "' + nuvem.usuario + '" no projeto ' + (nuvem.projeto || '') + ', mas com problema: ' + nuvem.erro
      : 'Conta "' + nuvem.usuario + '" no projeto ' + (nuvem.projeto || '') +
        (nuvem.sincronizadoEm ? ' — última sincronização ' + quando(nuvem.sincronizadoEm) + '.' : '.');
  }

  // --------------------------------------------------------------- entrar/criar

  const CHAVE_SEM_CONTA = 'licitapro.semconta.v1';

  /** A pessoa já escolheu continuar sem conta neste navegador? */
  function escolheuSemConta() {
    try {
      return window.localStorage.getItem(CHAVE_SEM_CONTA) === '1';
    } catch (_) {
      return false;
    }
  }

  function marcarSemConta(sim) {
    try {
      if (sim) window.localStorage.setItem(CHAVE_SEM_CONTA, '1');
      else window.localStorage.removeItem(CHAVE_SEM_CONTA);
    } catch (_) {
      /* sem armazenamento: a pergunta volta na próxima visita */
    }
  }

  let abaEntrar = 'entrar';

  function trocarAbaEntrar(nome) {
    abaEntrar = nome === 'criar' ? 'criar' : 'entrar';
    UI.$$('#abas-entrar .aba').forEach((aba) => {
      aba.classList.toggle('ativa', aba.dataset.abaEntrar === abaEntrar);
    });
    const repetir = $('#entrar-repetir-campo');
    if (repetir) repetir.classList.toggle('oculto', abaEntrar !== 'criar');
    const botao = $('#entrar-botao');
    if (botao) botao.textContent = abaEntrar === 'criar' ? 'Criar conta e entrar' : 'Entrar';
    const mensagem = $('#entrar-mensagem');
    if (mensagem) mensagem.textContent = '';
  }

  /** Tela de entrar/criar conta (existe só no site sem servidor). */
  function mostrarTelaEntrar() {
    const tela = $('#tela-entrar');
    if (!tela) return;
    const app = $('#app');
    if (app) app.classList.add('oculto');
    tela.classList.remove('oculto');
    const logo = $('#entrar-logo');
    if (logo && UI.caminhoBase) logo.src = UI.caminhoBase + 'marca/logo.png';

    // o endereço do projeto e a chave pública já vêm gravados no site
    // (config-nuvem.js): a tela pede só o e-mail e a senha
    const gravado = window.Nuvem ? window.Nuvem.padrao() : { url: '', chave: '' };
    const semProjeto = !gravado.url || !gravado.chave;
    const rodape = $('#entrar-rodape');
    if (rodape) rodape.classList.toggle('oculto', !semProjeto);
    trocarAbaEntrar(abaEntrar);
    const aviso = $('#entrar-aviso');
    if (aviso) {
      aviso.textContent = semProjeto
        ? 'O banco da conta ainda não está configurado neste site — por enquanto os dados ficam só neste navegador.'
        : '';
    }
    const usuario = $('#entrar-usuario');
    if (usuario && !usuario.value && window.Nuvem && window.Nuvem.usuario()) {
      usuario.value = window.Nuvem.usuario();
    }
    // onde estão os dados hoje (e como trocar de projeto, se a pessoa criou outro)
    const projeto = window.Nuvem ? window.Nuvem.padrao() : { url: '', chave: '', origem: '' };
    const atual = $('#entrar-projeto-atual');
    if (atual) {
      atual.textContent = projeto.url
        ? 'Projeto em uso: ' + projeto.url +
          (projeto.origem === 'site' ? ' (o do site)' : ' (escolhido neste navegador)') + '.'
        : 'Nenhum projeto configurado ainda.';
    }
    const url = $('#entrar-url');
    const chave = $('#entrar-chave');
    if (url && !url.value) url.value = projeto.url || '';
    if (chave && !chave.value) chave.value = projeto.chave || '';
    const esquecer = $('#entrar-esquecer-projeto');
    if (esquecer) esquecer.classList.toggle('oculto', projeto.origem === 'site');
    if (usuario && !tela.classList.contains('oculto')) usuario.focus();
  }

  /** Mostra a saída "continuar sem conta" (só quando ela é necessária). */
  function oferecerSemConta() {
    const rodape = $('#entrar-rodape');
    if (rodape) rodape.classList.remove('oculto');
  }

  /**
   * Mostra o resultado de um teste passo a passo ("testar a conexão/conta"):
   * uma linha por etapa, com ✓ ou ✕ e o motivo exato quando falha.
   */
  /**
   * Explica o caminho honesto para uma cópia no Google Drive: o Drive guarda
   * arquivos, não banco de dados — então o backup do sistema é um arquivo que
   * a pessoa salva lá (e restaura de volta quando precisar).
   */
  function explicarCopiaNoDrive() {
    UI.abrirModal({
      titulo: 'Guardar uma cópia no Google Drive',
      corpo:
        '<p>O Drive guarda <strong>arquivos</strong>, não um banco de dados — e o sistema não tem como ' +
        'escrever direto na sua conta Google (isso exigiria um aplicativo autorizado por você, com ' +
        'verificação do Google, e continua sem valer para duas pessoas ao mesmo tempo).</p>' +
        '<p>O caminho que funciona de verdade:</p>' +
        '<ol>' +
        '<li>Clique em <strong>Baixar backup</strong> (aqui no menu). Sai um arquivo ' +
        '<code>licitapro-backup-AAAA-MM-DD.json</code> com documentos, empresa e padrões.</li>' +
        '<li>No Drive, crie uma pasta (ex.: <em>LicitaPro</em>) e arraste esse arquivo para lá.</li>' +
        '<li>Quando quiser trazer de volta (outro computador, depois de formatar): baixe o arquivo do ' +
        'Drive e use <strong>Restaurar backup</strong>.</li>' +
        '</ol>' +
        '<p><strong>Automático em qualquer computador</strong> é o que a <em>conta</em> faz: os dados ' +
        'viajam cifrados para o seu projeto Supabase e abrem em qualquer máquina com o mesmo e-mail e ' +
        'senha (o Drive não é chamado nisso).</p>' +
        '<p class="texto-suave">Dica: o backup em arquivo é a única cópia que funciona sem internet e ' +
        'sem senha — vale baixar um de vez em quando.</p>',
      botoes: [{ texto: 'Entendi', classe: 'botao-primario', acao: () => UI.fecharModal() }],
    });
  }

  /** Versão dos arquivos que estão rodando (o ?v= que veio no endereço do script). */
  function versaoDosArquivos() {
    try {
      const scripts = Array.from(document.querySelectorAll('script[src]'));
      const alvo = scripts.map((s) => s.getAttribute('src') || '').find((src) => /modo-estatico\.js/.test(src));
      const achado = alvo && alvo.match(/[?&]v=([^&#]+)/);
      return achado ? achado[1] : '(sem versão no endereço)';
    } catch (_) {
      return '(não deu para ler)';
    }
  }

  /**
   * Retrato do estado da conta, para colar e pedir ajuda: o que está ligado,
   * onde estão os dados e o resultado do teste passo a passo.
   */
  async function montarDiagnostico() {
    const linhas = [];
    const nuvem = window.Nuvem ? window.Nuvem.situacao() : { ativa: false };
    const projeto = window.Nuvem ? window.Nuvem.padrao() : { url: '', origem: '' };
    const conta = window.Nuvem ? window.Nuvem.lerConfig() : null;
    const situacao = window.ModoEstatico && window.ModoEstatico.armazenamento
      ? window.ModoEstatico.armazenamento()
      : null;
    let guardado = null;
    try {
      guardado = window.localStorage.getItem('licitapro.local.v1');
    } catch (_) {
      guardado = null;
    }

    linhas.push('DEJ Solutions & Global — diagnóstico da conta');
    linhas.push('quando: ' + new Date().toLocaleString('pt-BR'));
    linhas.push('endereço: ' + window.location.href);
    linhas.push('versão dos arquivos: ' + versaoDosArquivos());
    linhas.push('modo: ' + (window.ModoEstatico && window.ModoEstatico.ativo() ? 'sem servidor (GitHub Pages)' : 'com servidor'));
    linhas.push('projeto em uso: ' + (projeto.url || '(nenhum)') + ' — origem: ' + (projeto.origem || '?'));
    linhas.push('conta ligada: ' + (nuvem.ativa ? 'sim' : 'não') + (conta && conta.usuario ? ' (' + conta.usuario + ')' : ''));
    linhas.push('última sincronização: ' + (conta && conta.sincronizadoEm ? conta.sincronizadoEm : '(nunca)'));
    linhas.push('erro guardado: ' + ((nuvem.erro || conta && conta.erro) || '(nenhum)'));
    linhas.push('aviso: ' + (nuvem.aviso || '(nenhum)'));
    linhas.push('envio agora: ' + (nuvem.enviando ? 'em andamento' : nuvem.pendente ? 'aguardando (2 s)' : 'tudo enviado'));
    linhas.push('dados neste navegador: ' + (guardado ? guardado.length + ' caracteres' : '(nada)'));
    linhas.push(
      'armazenamento do navegador: ' +
        (situacao ? (situacao.ok ? 'ok' : 'FALHANDO' + (situacao.motivo ? ' — ' + situacao.motivo : '')) : '?')
    );
    const fotos = conta && conta.imagens ? conta.imagens.length : 0;
    linhas.push('fotos enviadas para a conta: ' + fotos);

    linhas.push('');
    linhas.push('--- teste passo a passo ---');
    if (window.Nuvem && window.Nuvem.diagnostico) {
      try {
        const resultado = await window.Nuvem.diagnostico({});
        (resultado.passos || []).forEach((passo) => {
          linhas.push((passo.ok ? '[ok]  ' : '[X]   ') + passo.nome + (passo.detalhe ? ' — ' + passo.detalhe : ''));
        });
        linhas.push('resultado: ' + (resultado.ok ? 'tudo certo' : 'falhou'));
      } catch (erro) {
        linhas.push('o teste não pôde rodar: ' + erro.message);
      }
    } else {
      linhas.push('(o teste passo a passo não está disponível nesta versão)');
    }
    return linhas.join('\n');
  }

  /** Copia o diagnóstico (ou mostra numa caixa, quando a área de transferência não deixa). */
  async function copiarDiagnostico() {
    const caixa = $('#nuvem-diagnostico-caixa');
    const mensagem = $('#nuvem-mensagem');
    const escrever = (texto, tipo) => {
      if (!mensagem) return;
      mensagem.textContent = texto || '';
      mensagem.className = 'mensagem-banco' + (tipo ? ' ' + tipo : '');
    };
    escrever('Montando o diagnóstico...');
    const texto = await montarDiagnostico();
    if (caixa) {
      caixa.value = texto;
      caixa.classList.remove('oculto');
      caixa.select();
    }
    try {
      await navigator.clipboard.writeText(texto);
      escrever('Diagnóstico copiado: cole na conversa para eu ver o que está acontecendo.', 'ok');
    } catch (_) {
      escrever('Copie o texto que apareceu aqui embaixo e cole na conversa.', 'ok');
    }
    return texto;
  }

  /**
   * Manda agora para a conta o que acabou de ser salvo aqui (empresa, padrões,
   * logo). É o que evita a surpresa de salvar, sair do site e o dado não ter
   * subido: em vez de esperar o envio agendado, o envio sai na hora.
   */
  async function enviarParaAConta(aviso) {
    if (!window.Nuvem || !window.Nuvem.configurada || !window.Nuvem.configurada()) return;
    if (!window.Nuvem.enviarAgora) return;
    try {
      // `aoSair`: este envio nasce de um clique ("Salvar") e a pessoa costuma
      // sair logo depois — o navegador termina de mandá-lo mesmo assim
      await window.Nuvem.enviarAgora({ aoSair: true });
      if (aviso) UI.toast(aviso, 'sucesso');
      await atualizarSituacaoDados();
    } catch (erro) {
      UI.toast('Salvo neste navegador, mas não subiu para a conta: ' + erro.message, 'erro', 12000);
      await atualizarSituacaoDados();
    }
  }

  function mostrarPassos(seletor, resultado) {
    const lista = $(seletor);
    if (!lista) return;
    lista.textContent = '';
    const passos = (resultado && resultado.passos) || [];
    if (!passos.length) {
      lista.classList.add('oculto');
      return;
    }
    passos.forEach((passo) => {
      const item = document.createElement('li');
      item.className = passo.ok ? 'ok' : 'erro';
      const texto = document.createElement('span');
      texto.textContent = passo.nome;
      item.appendChild(texto);
      if (passo.detalhe) {
        const detalhe = document.createElement('span');
        detalhe.className = 'detalhe';
        detalhe.textContent = passo.detalhe;
        item.appendChild(detalhe);
      }
      lista.appendChild(item);
    });
    const resumo = document.createElement('li');
    resumo.className = resultado.ok ? 'ok' : 'erro';
    const texto = document.createElement('span');
    texto.textContent = resultado.ok
      ? 'Tudo certo: o banco está respondendo, aceitando gravação e devolvendo o que foi gravado.'
      : 'Parei na primeira etapa que falhou — o motivo está acima.';
    resumo.appendChild(texto);
    lista.appendChild(resumo);
    lista.classList.remove('oculto');
  }

  /**
   * A tela ainda está de pé? A janela pode ter sido fechada no meio de um
   * pedido (o navegador descarta tudo): estas funções só desenham, então
   * ficam quietas em vez de estourar um erro sem dono.
   */
  function temTela() {
    return typeof document !== 'undefined' && Boolean(document) && Boolean(document.querySelector);
  }

  function escreverEntrar(texto, tipo) {
    if (!temTela()) return;
    const mensagem = $('#entrar-mensagem');
    if (!mensagem) return;
    mensagem.textContent = texto || '';
    mensagem.className = 'mensagem-banco' + (tipo ? ' ' + tipo : '');
  }

  /** Carrega o perfil da empresa e abre o sistema (usado também depois de entrar). */
  async function abrirSistema() {
    const tela = $('#tela-entrar');
    if (tela) tela.classList.add('oculto');
    const resposta = await API.get('/api/perfil');
    estado.perfil = resposta.perfil || { empresa: {}, padroes: {} };
    mostrarApp();
    await atualizarSituacaoDados();
    // O endereço inicial é escrito com replaceState (e não com location.hash):
    // assim o app não disputa o endereço com quem clicou num link no mesmo
    // instante em que a conta abre — antes, o clique podia ser perdido porque
    // o app terminava de escrever '#/painel' por cima dele.
    if (!window.location.hash && window.history && window.history.replaceState) {
      window.history.replaceState(null, '', window.location.pathname + '#/painel');
    }
    rotear();
    await sincronizarAoAbrir();
  }

  /** Entrar numa conta ou criar uma nova (e já trazer/levar os dados). */
  async function entrarNoSistema(criar) {
    const botao = $('#entrar-botao');
    const usuario = $('#entrar-usuario').value.trim().toLowerCase();
    const senha = $('#entrar-senha').value;
    if (criar && senha !== $('#entrar-repetir').value) {
      escreverEntrar('As duas senhas precisam ser iguais.', 'erro');
      return;
    }
    botao.disabled = true;
    escreverEntrar(criar ? 'Criando a conta...' : 'Entrando...');
    try {
      const dados = { usuario, senha };
      if (criar) await window.Nuvem.criar(dados);
      else await window.Nuvem.entrar(dados);
      marcarSemConta(false);
      escreverEntrar('Tudo certo. Abrindo o sistema...', 'ok');
      await abrirSistema();
      await carregarDocumentos();
      desenharPainel();
      await atualizarSituacaoDados();
      UI.toast(
        criar ? 'Conta criada: seus dados agora abrem em qualquer computador.' : 'Bem-vindo de volta!',
        'sucesso'
      );
      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, '', window.location.pathname + window.location.hash);
      }
    } catch (erro) {
      if (!temTela()) return;
      escreverEntrar(erro.message, 'erro');
      // se não deu para falar com o banco, quem quiser continua sem conta
      // (os dados ficam só neste navegador) em vez de ficar preso na tela
      if (!/senha|e-mail|iguais|já existe/i.test(erro.message)) oferecerSemConta();
      const tela = $('#tela-entrar');
      const app = $('#app');
      if (tela && !tela.classList.contains('oculto') && app) app.classList.add('oculto');
    } finally {
      botao.disabled = false;
    }
  }

  /** Sair da conta: envia o que falta e limpa este navegador. */
  async function sairDaConta() {
    const confirmado = await UI.confirmar({
      titulo: 'Sair da conta',
      texto:
        'O sistema envia o que estiver pendente para a nuvem e depois limpa os dados deste navegador ' +
        '(eles continuam guardados na sua conta). Sair agora?',
      textoConfirmar: 'Sair',
      perigo: true,
    });
    if (!confirmado) return;
    try {
      if (window.Nuvem.configurada()) await window.Nuvem.sincronizar();
    } catch (erro) {
      const assim = await UI.confirmar({
        titulo: 'A nuvem não respondeu',
        texto:
          'Não consegui enviar agora (' + erro.message + '). Se sair, o que foi feito aqui desde a ' +
          'última sincronização pode se perder. Sair mesmo assim?',
        textoConfirmar: 'Sair mesmo assim',
        perigo: true,
      });
      if (!assim) return;
    }
    window.Nuvem.sair();
    if (window.ModoEstatico && window.ModoEstatico.limparTudo) window.ModoEstatico.limparTudo();
    UI.toast('Você saiu da conta. Os dados continuam na nuvem.', 'sucesso');
    window.location.reload();
  }

  /**
   * Conta e nuvem: entrar/criar conta, sincronizar e sair. No site publicado
   * (GitHub Pages) não existe servidor — a conta é o que leva os dados de um
   * computador para o outro, com tudo cifrado pela senha.
   */
  function ligarNuvem() {
    if (!window.Nuvem) return;

    UI.$$('#abas-entrar .aba').forEach((aba) => {
      aba.addEventListener('click', () => trocarAbaEntrar(aba.dataset.abaEntrar));
    });

    $('#form-entrar').addEventListener('submit', (evento) => {
      evento.preventDefault();
      entrarNoSistema(abaEntrar === 'criar');
    });

    const semConta = $('#entrar-sem-conta');
    if (semConta) {
      semConta.addEventListener('click', async () => {
        marcarSemConta(true);
        await abrirSistema();
      });
    }

    // ------------------------------------ testar a conexão / usar outro projeto
    const escreverTeste = (texto, tipo) => {
      const mensagem = $('#entrar-teste-mensagem');
      if (!mensagem) return;
      mensagem.textContent = texto || '';
      mensagem.className = 'mensagem-banco' + (tipo ? ' ' + tipo : '');
    };

    const testarNaTela = async (comOsCampos) => {
      escreverTeste('Testando...');
      $('#entrar-passos').classList.add('oculto');
      const dados = {
        usuario: $('#entrar-usuario').value,
        senha: $('#entrar-senha').value,
      };
      if (comOsCampos) {
        dados.url = $('#entrar-url').value;
        dados.chave = $('#entrar-chave').value;
      }
      try {
        const resultado = await window.Nuvem.diagnostico(dados);
        mostrarPassos('#entrar-passos', resultado);
        escreverTeste(
          resultado.ok ? 'A conta e o banco estão funcionando.' : 'O teste parou — veja as etapas acima.',
          resultado.ok ? 'ok' : 'erro'
        );
      } catch (erro) {
        escreverTeste(erro.message, 'erro');
      }
    };

    const testar = $('#entrar-testar');
    if (testar) testar.addEventListener('click', () => testarNaTela(true));

    const usar = $('#entrar-usar-projeto');
    if (usar) {
      usar.addEventListener('click', async () => {
        try {
          const troca = window.Nuvem.usarOutroProjeto($('#entrar-url').value, $('#entrar-chave').value);
          escreverTeste(
            troca.saiuDaConta
              ? 'Projeto trocado. A conta que estava ligada foi desconectada: entre (ou crie a conta) de novo neste projeto.'
              : 'Projeto trocado para ' + troca.url + '.',
            'ok'
          );
          $('#entrar-esquecer-projeto').classList.remove('oculto');
          await testarNaTela(false);
        } catch (erro) {
          escreverTeste(erro.message, 'erro');
        }
      });
    }

    const esquecer = $('#entrar-esquecer-projeto');
    if (esquecer) {
      esquecer.addEventListener('click', () => {
        window.Nuvem.esquecerProjeto();
        $('#entrar-url').value = '';
        $('#entrar-chave').value = '';
        mostrarTelaEntrar();
        escreverTeste('Voltou ao projeto gravado no site.');
      });
    }

    const sincronizar = $('#nuvem-sincronizar');
    if (sincronizar) {
      sincronizar.addEventListener('click', async () => {
        const mensagem = $('#nuvem-mensagem');
        const escrever = (texto, tipo) => {
          mensagem.textContent = texto || '';
          mensagem.className = 'mensagem-banco' + (tipo ? ' ' + tipo : '');
        };
        escrever('Sincronizando...');
        try {
          const resultado = await window.Nuvem.sincronizar();
          escrever(
            resultado && resultado.direcao === 'download'
              ? 'Os dados da nuvem vieram para este computador.'
              : 'Os dados deste computador foram para a nuvem.',
            'ok'
          );
          await recarregarPerfil();
          await carregarDocumentos();
          desenharPainel();
          atualizarSituacaoDados();
        } catch (erro) {
          escrever(erro.message, 'erro');
        }
      });
    }

    const testarConta = $('#nuvem-testar');
    if (testarConta) {
      testarConta.addEventListener('click', async () => {
        const mensagem = $('#nuvem-mensagem');
        const escrever = (texto, tipo) => {
          mensagem.textContent = texto || '';
          mensagem.className = 'mensagem-banco' + (tipo ? ' ' + tipo : '');
        };
        escrever('Testando...');
        $('#nuvem-passos').classList.add('oculto');
        try {
          const resultado = await window.Nuvem.diagnostico({});
          mostrarPassos('#nuvem-passos', resultado);
          escrever(
            resultado.ok ? 'Conta e banco funcionando.' : 'O teste parou — veja as etapas abaixo.',
            resultado.ok ? 'ok' : 'erro'
          );
        } catch (erro) {
          escrever(erro.message, 'erro');
        }
      });
    }

    const copiar = $('#nuvem-diagnostico');
    if (copiar) copiar.addEventListener('click', () => copiarDiagnostico());

    const link = $('#nuvem-link');
    if (link) {
      link.addEventListener('click', async () => {
        const mensagem = $('#nuvem-mensagem');
        const escrever = (texto, tipo) => {
          mensagem.textContent = texto || '';
          mensagem.className = 'mensagem-banco' + (tipo ? ' ' + tipo : '');
        };
        const endereco = window.Nuvem.linkParaOutroComputador();
        if (!endereco) {
          escrever('Entre numa conta primeiro.', 'erro');
          return;
        }
        const caixa = $('#nuvem-link-caixa');
        caixa.value = endereco;
        caixa.classList.remove('oculto');
        caixa.select();
        try {
          await navigator.clipboard.writeText(endereco);
          escrever('Link copiado. Abra no outro computador e entre com o mesmo usuário e senha.', 'ok');
        } catch (_) {
          escrever('Copie o link que apareceu aqui embaixo e abra no outro computador.', 'ok');
        }
      });
    }

    const sair = $('#nuvem-sair');
    if (sair) sair.addEventListener('click', sairDaConta);
    const sairMenu = $('#menu-sair');
    if (sairMenu) sairMenu.addEventListener('click', sairDaConta);
    const entrarPeloPainel = $('#nuvem-entrar');
    if (entrarPeloPainel) entrarPeloPainel.addEventListener('click', mostrarTelaEntrar);
  }

  /**
   * Ao abrir o sistema com a nuvem ligada, busca o que está lá (é o que faz os
   * documentos aparecerem em outro computador).
   */
  /**
   * Relê a empresa e os padrões depois que a nuvem trouxe dados para este
   * computador.
   *
   * Sem isto a tela de "Minha empresa" continuava mostrando o que estava aqui
   * ANTES de entrar na conta — em branco, numa janela nova — mesmo com os
   * dados já gravados: parecia que nada tinha sido salvo. É o caminho exato de
   * quem entra numa janela privativa e procura o nome da empresa.
   */
  async function recarregarPerfil() {
    try {
      const resposta = await API.get('/api/perfil');
      estado.perfil = resposta.perfil || { empresa: {}, padroes: {}, declaracoes: [] };
      estado.empresa = Object.assign({}, estado.perfil.empresa || {});
      estado.modelosDeclaracao = estado.perfil.declaracoes || estado.modelosDeclaracao;
      estado.padroes = Object.assign({}, estado.perfil.padroes || {});
      mostrarApp(); // nome no topo passa a ser o da empresa que veio da conta
      if (!$('#view-empresa').classList.contains('oculto')) carregarEmpresa();
    } catch (_) {
      /* o que veio agora já está gravado: a tela se acerta no próximo sync */
    }
  }

  async function sincronizarAoAbrir() {
    if (!window.Nuvem || !window.Nuvem.configurada()) return;
    try {
      const resultado = await window.Nuvem.sincronizar();
      if (resultado && resultado.direcao !== 'envio') {
        await recarregarPerfil();
        await carregarDocumentos();
        desenharPainel();
        if (!$('#view-documentos').classList.contains('oculto')) desenharListaDocumentos();
        UI.toast('Dados atualizados da nuvem.', 'sucesso');
      }
    } catch (erro) {
      if (temTela()) UI.toast('Nuvem: ' + erro.message, 'erro', 12000);
    }
    atualizarSituacaoDados();
  }

  /**
   * No modo local quem guarda é o próprio navegador: quando a gravação não
   * acontece (janela privada, cota cheia), a tela avisa na hora — senão a
   * pessoa só descobre na próxima visita, quando não encontra mais nada.
   */
  function avisarSeNaoGuardou(resposta, oQue) {
    if (!resposta || resposta.salvoNoNavegador !== false) return false;
    const motivo = resposta.motivoNaoSalvo ? ' (' + resposta.motivoNaoSalvo + ')' : '';
    UI.toast(
      oQue + ' não ficou guardado neste navegador' + motivo +
        '. Baixe um backup pelo menu antes de fechar.',
      'erro', 15000
    );
    atualizarSituacaoDados();
    return true;
  }

  function ligarEmpresa() {
    // declarações: a mesma lista aparece na seção Declarações e em Minha empresa
    listasDeDeclaracoes().forEach((lista) => {
      lista.addEventListener('input', () => coletarModelosDeclaracao(lista));
      lista.addEventListener('click', (evento) => {
        const imprimir = evento.target.closest('[data-modelo-imprimir]');
        if (imprimir) {
          imprimirModeloDeclaracao(Number(imprimir.dataset.modeloImprimir));
          return;
        }
        const botao = evento.target.closest('[data-modelo-remover]');
        if (!botao) return;
        coletarModelosDeclaracao(lista);
        (estado.modelosDeclaracao || []).splice(Number(botao.dataset.modeloRemover), 1);
        desenharModelosDeclaracao();
      });
    });
    UI.$$('[data-acao-modelos="nova"]').forEach((botao) => {
      botao.addEventListener('click', adicionarModeloDeclaracao);
    });
    UI.$$('[data-acao-modelos="salvar"]').forEach((botao) => {
      botao.addEventListener('click', salvarModelosDeclaracao);
    });
    ['#painel-declaracoes', '#docs-declaracoes'].forEach((sel) => {
      const botao = $(sel);
      if (botao) botao.addEventListener('click', () => { window.location.hash = '#/declaracoes'; });
    });

    $('#emp-salvar').addEventListener('click', async () => {
      const empresa = Object.assign({}, estado.empresa);
      CAMPOS_EMPRESA.forEach(([chave, sel]) => { empresa[chave] = $(sel).value.trim(); });
      empresa.simplesNacional = $('#emp-simples').checked;
      // quando isto foi editado: com dois computadores, quem salvou por último
      // manda nos dados da empresa (nunca um cadastro antigo por cima do novo)
      empresa.atualizadoEm = new Date().toISOString();
      try {
        const resposta = await API.put('/api/perfil/empresa', empresa);
        estado.empresa = Object.assign(estado.empresa, resposta.empresa);
        estado.perfil.empresa = resposta.empresa;
        mostrarApp(); // o nome da empresa também aparece no topo
        atualizarSituacaoDados();
        if (!avisarSeNaoGuardou(resposta, 'Os dados da empresa')) {
          UI.toast('Dados da empresa salvos.', 'sucesso');
        }
        // e vai para a conta agora (não deixa pendente para depois)
        await enviarParaAConta('Dados da empresa salvos na sua conta.');
      } catch (erro) {
        UI.toast(erro.message, 'erro');
      }
    });

    $('#pad-salvar').addEventListener('click', async () => {
      const padroes = {};
      CAMPOS_PADROES.forEach(([chave, sel]) => { padroes[chave] = $(sel).value; });
      padroes.validadeDias = Number(padroes.validadeDias) || 0;
      padroes.atualizadoEm = new Date().toISOString();
      try {
        const resposta = await API.put('/api/perfil/padroes', padroes);
        estado.perfil.padroes = resposta.padroes;
        if (!avisarSeNaoGuardou(resposta, 'Os padrões')) UI.toast('Padrões salvos.', 'sucesso');
        await enviarParaAConta('Padrões salvos na sua conta.');
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
    const drive = $('#local-drive');
    if (drive) drive.addEventListener('click', explicarCopiaNoDrive);
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
    ligarConexaoBanco();
    ligarNuvem();
    ligarNavegacao();
    ligarAcoesDocumentos();
    ligarImportacao();
    ligarEmpresa();

    // Antes de decidir o que mostrar, espera a checagem do ambiente: é ela que
    // diz se esta página tem servidor (com banco) ou se roda só no navegador.
    if (window.ModoEstatico && window.ModoEstatico.verificarAmbiente) {
      try {
        await window.ModoEstatico.verificarAmbiente();
      } catch (_) {
        /* sem servidor também não dá para responder: segue o fluxo normal */
      }
    }

    // No site publicado (sem servidor) os dados vivem no navegador. Quem ainda
    // não tem conta (e não escolheu continuar sem ela) vê a tela de entrar:
    // é a conta que leva os dados de um computador para o outro.
    const soNoNavegador = window.ModoEstatico && window.ModoEstatico.ativo && window.ModoEstatico.ativo();
    if (soNoNavegador && !window.Nuvem.configurada() && !escolheuSemConta()) {
      mostrarTelaEntrar();
      return;
    }

    try {
      // com servidor (ou já com conta) o sistema abre direto no painel
      await abrirSistema();
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
    estadoDocumentos: () => estado.documentos,
    // o editor usa o mesmo escolhedor de modelos da seção Declarações
    escolherModeloDeclaracao,
    adicionarModeloDeclaracao,
    imprimirModeloDeclaracao,
    listasDeDeclaracoes,
    // o editor chama isto depois de salvar modelos novos na aba Declarações
    recarregarModelosDeclaracao: async () => {
      await recarregarPerfil();
      estado.modelosDeclaracao = (estado.perfil && estado.perfil.declaracoes) || estado.modelosDeclaracao;
      desenharModelosDeclaracao();
    },
    estadoModelosDeclaracao: () => estado.modelosDeclaracao,
  };

  document.addEventListener('DOMContentLoaded', iniciar);
})();
