/* Editor de propostas e orçamentos: preenchimento, itens, pré-visualização e PDF. */
(function () {
  'use strict';

  const F = window.Formato;
  const UI = window.UI;
  const $ = UI.$;
  const $$ = UI.$$;
  const estado = {
    doc: null,
    novo: true,
    sujo: false,
    salvando: false,
    timerAutosave: null,
    timerPrevia: null,
    urlPrevia: null,
    previaAberta: true,
    // modo "selecionar itens": marcar vários para apagar ou mover de uma vez
    selecao: { ativa: false, marcados: [] },
    avisosImportacao: [],
    itensImportados: null,
  };

  /**
   * Modalidades que a lista oferece de saída (as mais usadas nas compras
   * públicas). A pessoa não fica presa a elas: escolhendo "adicionar nova", a
   * que ela criar entra na lista e é lembrada neste navegador.
   */
  const MODALIDADES = [
    'Pregão Eletrônico',
    'Pregão Presencial',
    'Dispensa de Licitação',
    'Dispensa Eletrônica',
    'Inexigibilidade de Licitação',
    'Concorrência',
    'Concorrência Eletrônica',
    'Tomada de Preços',
    'Convite',
    'Leilão',
    'Concurso',
    'Credenciamento',
    'Chamada Pública',
    'Adesão a Ata de Registro de Preços',
    'Cotação Eletrônica',
  ];
  const CHAVE_MODALIDADES = 'licitapro.modalidades.v1';
  const MODALIDADE_NOVA = '__nova';

  /** Modalidades criadas por quem usa o sistema (guardadas neste navegador). */
  function modalidadesExtras() {
    try {
      const lista = JSON.parse(window.localStorage.getItem(CHAVE_MODALIDADES) || '[]');
      return Array.isArray(lista) ? lista.filter((item) => typeof item === 'string' && item.trim()) : [];
    } catch (_) {
      return [];
    }
  }

  function guardarModalidadeExtra(nome) {
    const lista = modalidadesExtras();
    if (!MODALIDADES.includes(nome) && !lista.includes(nome)) {
      lista.push(nome);
      try {
        window.localStorage.setItem(CHAVE_MODALIDADES, JSON.stringify(lista));
      } catch (_) {
        /* sem armazenamento: a opção vale só nesta aba */
      }
    }
    return lista;
  }

  /** Monta o seletor de modalidade com a lista + as opções criadas aqui. */
  function montarModalidades(valorAtual) {
    const select = $('#campo-orgao-modalidade');
    if (!select) return;
    const valores = MODALIDADES.concat(modalidadesExtras());
    if (valorAtual && !valores.includes(valorAtual)) valores.push(valorAtual);

    // documento novo ainda não tem modalidade: começa na primeira da lista
    const escolhido = valorAtual || select.value || MODALIDADES[0];
    select.innerHTML = '';
    valores.forEach((nome) => {
      const opcao = document.createElement('option');
      opcao.value = nome;
      opcao.textContent = nome;
      select.appendChild(opcao);
    });
    const nova = document.createElement('option');
    nova.value = MODALIDADE_NOVA;
    nova.textContent = '➕ Adicionar nova modalidade...';
    select.appendChild(nova);
    if (escolhido && escolhido !== MODALIDADE_NOVA) select.value = escolhido;
  }

  /** Pergunta o nome da modalidade nova e já a deixa escolhida no documento. */
  function pedirNovaModalidade() {
    const select = $('#campo-orgao-modalidade');
    if (!select) return;
    const anterior = (estado.doc && estado.doc.orgao && estado.doc.orgao.modalidade) || MODALIDADES[0];

    const corpo = document.createElement('div');
    const rotulo = document.createElement('label');
    rotulo.className = 'campo campo-largo';
    rotulo.textContent = 'Nome da modalidade';
    const entrada = document.createElement('input');
    entrada.type = 'text';
    entrada.id = 'campo-nova-modalidade';
    entrada.placeholder = 'Ex.: Dispensa de Licitação';
    entrada.maxLength = 120;
    rotulo.appendChild(entrada);
    corpo.appendChild(rotulo);
    const dica = document.createElement('p');
    dica.className = 'texto-suave';
    dica.textContent = 'Ela entra na lista e fica lembrada neste navegador para as próximas propostas.';
    corpo.appendChild(dica);

    const usar = () => {
      const nome = entrada.value.trim();
      if (!nome) {
        entrada.focus();
        UI.toast('Escreva o nome da modalidade.', 'aviso');
        return;
      }
      guardarModalidadeExtra(nome);
      montarModalidades(nome);
      definir('orgao.modalidade', nome);
      marcarSujo();
      UI.fecharModal();
      UI.toast('Modalidade "' + nome + '" adicionada à lista.', 'sucesso');
    };

    UI.abrirModal({
      titulo: 'Adicionar modalidade',
      corpo,
      botoes: [
        { texto: 'Adicionar', classe: 'botao-primario', acao: usar },
        {
          texto: 'Cancelar',
          acao: () => {
            select.value = anterior;
            UI.fecharModal();
          },
        },
      ],
    });
    entrada.addEventListener('keydown', (evento) => {
      if (evento.key === 'Enter') {
        evento.preventDefault();
        usar();
      }
    });
  }

  /** Campos do formulário mapeados para o caminho dentro do documento. */
  const CAMPOS = [
    { sel: '#campo-tipo', alvo: 'tipo' },
    { sel: '#campo-status', alvo: 'status' },
    { sel: '#campo-numero-sequencial', alvo: 'numero.sequencial', tipo: 'numero' },
    { sel: '#campo-numero-ano', alvo: 'numero.ano', tipo: 'numero' },
    { sel: '#campo-data', alvo: 'data' },

    { sel: '#campo-orgao-nome', alvo: 'orgao.nome' },
    { sel: '#campo-orgao-uasg', alvo: 'orgao.uasg' },
    { sel: '#campo-orgao-modalidade', alvo: 'orgao.modalidade' },
    { sel: '#campo-orgao-pregao', alvo: 'orgao.pregao' },
    { sel: '#campo-orgao-prazo', alvo: 'orgao.prazoEntrega' },
    { sel: '#campo-orgao-objeto', alvo: 'orgao.objeto' },

    { sel: '#campo-cliente-nome', alvo: 'cliente.nome' },
    { sel: '#campo-cliente-cnpj', alvo: 'cliente.cnpjCpf' },
    { sel: '#campo-cliente-contato', alvo: 'cliente.contato' },
    { sel: '#campo-cliente-telefone', alvo: 'cliente.telefone' },
    { sel: '#campo-cliente-email', alvo: 'cliente.email' },
    { sel: '#campo-cliente-endereco', alvo: 'cliente.endereco' },

    { sel: '#campo-desconto-modo', alvo: 'desconto.modo' },
    { sel: '#campo-desconto-valor', alvo: 'desconto.valor', tipo: 'moeda' },
    { sel: '#campo-acrescimo-ativo', alvo: 'acrescimo.ativo', tipo: 'check' },
    { sel: '#campo-acrescimo-descricao', alvo: 'acrescimo.descricao' },
    { sel: '#campo-acrescimo-valor', alvo: 'acrescimo.valor', tipo: 'moeda' },

    { sel: '#campo-validade', alvo: 'condicoes.validadeDias', tipo: 'numero' },
    { sel: '#campo-local', alvo: 'condicoes.local' },
    { sel: '#campo-prazo-entrega', alvo: 'condicoes.prazoEntrega' },
    { sel: '#campo-garantia', alvo: 'condicoes.garantia' },
    { sel: '#campo-pagamento', alvo: 'condicoes.condicoesPagamento' },
    { sel: '#campo-observacoes', alvo: 'condicoes.observacoes' },

    { sel: '#campo-prop-razao', alvo: 'proponente.razaoSocial' },
    { sel: '#campo-prop-fantasia', alvo: 'proponente.nomeFantasia' },
    { sel: '#campo-prop-cnpj', alvo: 'proponente.cnpj' },
    { sel: '#campo-prop-ie', alvo: 'proponente.inscricaoEstadual' },
    { sel: '#campo-prop-im', alvo: 'proponente.inscricaoMunicipal' },
    { sel: '#campo-prop-simples', alvo: 'proponente.simplesNacional', tipo: 'check' },
    { sel: '#campo-prop-telefone', alvo: 'proponente.telefone' },
    { sel: '#campo-prop-email', alvo: 'proponente.email' },
    { sel: '#campo-prop-cidade', alvo: 'proponente.cidade' },
    { sel: '#campo-prop-uf', alvo: 'proponente.uf' },
    { sel: '#campo-prop-endereco', alvo: 'proponente.endereco' },
    { sel: '#campo-prop-cep', alvo: 'proponente.cep' },
    { sel: '#campo-prop-banco', alvo: 'proponente.banco' },
    { sel: '#campo-prop-agencia', alvo: 'proponente.agencia' },
    { sel: '#campo-prop-conta', alvo: 'proponente.conta' },
    { sel: '#campo-prop-pix', alvo: 'proponente.chavePix' },
    { sel: '#campo-prop-representante', alvo: 'proponente.representante' },
    { sel: '#campo-prop-cpf', alvo: 'proponente.cpfRepresentante' },
    { sel: '#campo-prop-cargo', alvo: 'proponente.cargoRepresentante' },

    { sel: '#op-catalogo', alvo: 'opcoes.mostrarCatalogo', tipo: 'check' },
    { sel: '#op-fotos', alvo: 'opcoes.mostrarFotos', tipo: 'check' },
    { sel: '#op-bancarios', alvo: 'opcoes.mostrarDadosBancarios', tipo: 'check' },
    { sel: '#op-extenso', alvo: 'opcoes.mostrarPorExtenso', tipo: 'check' },
    { sel: '#op-assinatura', alvo: 'opcoes.mostrarAssinatura', tipo: 'check' },
    { sel: '#op-quebra', alvo: 'opcoes.quebrarPaginaCatalogo', tipo: 'check' },
    { sel: '#op-logo', alvo: 'opcoes.logoNoCabecalho', tipo: 'check' },
    { sel: '#op-marcadagua', alvo: 'opcoes.marcaDagua', tipo: 'check' },
    { sel: '#op-link-compra', alvo: 'opcoes.mostrarLinkCompra', tipo: 'check' },
    { sel: '#op-cor', alvo: 'opcoes.cor' },
  ];

  // ------------------------------------------------------- acesso a caminhos

  function obter(caminho, base) {
    return caminho.split('.').reduce((atual, chave) => (atual == null ? atual : atual[chave]), base || estado.doc);
  }

  function definir(caminho, valor, base) {
    const alvo = base || estado.doc;
    const chaves = caminho.split('.');
    let atual = alvo;
    for (let i = 0; i < chaves.length - 1; i += 1) {
      if (atual[chaves[i]] == null || typeof atual[chaves[i]] !== 'object') atual[chaves[i]] = {};
      atual = atual[chaves[i]];
    }
    atual[chaves[chaves.length - 1]] = valor;
  }

  // --------------------------------------------------------------- estado

  function marcarSujo() {
    estado.sujo = true;
    $('#editor-estado').textContent = 'Alterações não salvas';
    $('#editor-estado').className = 'etiqueta-estado sujo';
    if (estado.doc && estado.doc.id) {
      clearTimeout(estado.timerAutosave);
      estado.timerAutosave = setTimeout(() => salvar(true), 2200);
    }
    agendarPrevia();
  }

  function marcarSalvo() {
    estado.sujo = false;
    $('#editor-estado').textContent = 'Salvo';
    $('#editor-estado').className = 'etiqueta-estado salvo';
  }

  function agendarPrevia() {
    clearTimeout(estado.timerPrevia);
    estado.timerPrevia = setTimeout(() => {
      // com a pré-visualização oculta não há por que gerar o PDF
      if (estado.previaAberta && !$('#view-editor').classList.contains('oculto')) atualizarPrevia(true);
    }, 2500);
  }

  // ------------------------------------- mostrar/ocultar a pré-visualização

  const CHAVE_PREVIA = 'licitapro.previa.v1';

  /** A pré-visualização estava à vista na última visita? (escolha do usuário) */
  function lerPreviaAberta() {
    try {
      return window.localStorage.getItem(CHAVE_PREVIA) !== 'oculta';
    } catch (_) {
      return true;
    }
  }

  function guardarPreviaAberta(aberta) {
    try {
      window.localStorage.setItem(CHAVE_PREVIA, aberta ? 'aberta' : 'oculta');
    } catch (_) { /* sem armazenamento: a escolha vale só nesta tela */ }
  }

  /**
   * Mostra ou oculta a pré-visualização (botão "Pré-visualização" no topo do
   * editor). A escolha fica guardada no navegador — quem prefere trabalhar só
   * com o formulário não precisa fechar a prévia a cada documento.
   */
  function definirPrevia(aberta, guardar) {
    estado.previaAberta = !!aberta;
    const quadro = $('.editor-previa');
    const corpo = $('.editor-corpo');
    if (quadro) quadro.classList.toggle('oculto', !estado.previaAberta);
    if (corpo) corpo.classList.toggle('sem-previa', !estado.previaAberta);

    const botao = $('#editor-previa');
    if (botao) {
      botao.setAttribute('aria-pressed', estado.previaAberta ? 'true' : 'false');
      botao.title = estado.previaAberta ? 'Ocultar a pré-visualização' : 'Mostrar a pré-visualização';
    }
    if (guardar) guardarPreviaAberta(estado.previaAberta);
    // ao reabrir a prévia, o PDF é gerado se ainda não houver um carregado
    if (estado.previaAberta && estado.doc && !estado.urlPrevia) atualizarPrevia(false);
  }

  // ------------------------------------------------------------ formulário

  function preencherFormulario() {
    montarModalidades(obter('orgao.modalidade'));
    CAMPOS.forEach((campo) => {
      const elemento = $(campo.sel);
      if (!elemento) return;
      const valor = obter(campo.alvo);
      if (campo.tipo === 'check') {
        elemento.checked = valor !== false;
      } else if (campo.tipo === 'numero') {
        elemento.value = valor === 0 || valor ? valor : '';
      } else if (campo.tipo === 'moeda') {
        elemento.value = valor ? F.numero(valor, 2) : '';
      } else if (elemento.tagName === 'SELECT') {
        const texto = valor == null ? '' : String(valor);
        // modalidade que não está na lista (documento antigo, ou criada em
        // outro computador) entra como opção: o que está salvo nunca se perde
        if (texto && !Array.from(elemento.options).some((o) => o.value === texto)) {
          const opcao = document.createElement('option');
          opcao.value = texto;
          opcao.textContent = texto;
          elemento.insertBefore(opcao, elemento.lastElementChild);
        }
        // vazio não apaga a lista: fica a primeira opção (o padrão)
        if (texto) elemento.value = texto;
      } else {
        elemento.value = valor == null ? '' : valor;
      }
    });
    atualizarVisibilidadeTipo();
    atualizarVisibilidadeDesconto();
    desenharItens();
    desenharImagens();
    atualizarCabecalho();
  }

  function coletarFormulario() {
    CAMPOS.forEach((campo) => {
      const elemento = $(campo.sel);
      if (!elemento) return;
      let valor;
      if (campo.tipo === 'check') valor = elemento.checked;
      else if (campo.tipo === 'numero') valor = elemento.value === '' ? 0 : Number(elemento.value);
      else if (campo.tipo === 'moeda') valor = elemento.value === '' ? 0 : F.paraNumero(elemento.value);
      else valor = elemento.value;
      // a opção "adicionar nova modalidade" é um caminho da tela, não um dado
      if (valor === MODALIDADE_NOVA) valor = obter(campo.alvo) || '';
      definir(campo.alvo, valor);
    });
    return estado.doc;
  }

  /** Valor de um campo do formulário, já no tipo certo. */
  function valorDoCampo(campo, elemento) {
    if (campo.tipo === 'check') return elemento.checked;
    if (campo.tipo === 'numero') return elemento.value === '' ? 0 : Number(elemento.value);
    if (campo.tipo === 'moeda') return elemento.value === '' ? 0 : F.paraNumero(elemento.value);
    return elemento.value;
  }

  function atualizarVisibilidadeTipo() {
    const tipo = $('#campo-tipo').value || (estado.doc && estado.doc.tipo) || 'proposta';
    $('.grupo-proposta').classList.toggle('oculto', tipo !== 'proposta');
    $('.grupo-orcamento').classList.toggle('oculto', tipo !== 'orcamento');
    atualizarVisibilidadeDesconto();
  }

  /**
   * Desconto e frete são opcionais: ficam guardados atrás da caixa "Usar
   * desconto e frete / instalação". No orçamento (documento comercial) já vêm
   * marcados, porque é lá que eles costumam ser necessários; na proposta de
   * licitação ficam fora do caminho — a não ser que já haja valor preenchido,
   * para não esconder um desconto que o documento já tinha.
   */
  function descontoFreteLigado(doc) {
    if (!doc) return false;
    const escolha = doc.desconto && doc.desconto.ativo;
    if (escolha === true) return true;
    if (escolha === false) return false;
    if (doc.tipo === 'orcamento') return true;
    const desconto = doc.desconto || {};
    const acrescimo = doc.acrescimo || {};
    const temDesconto = desconto.modo && desconto.modo !== 'nenhum' && F.paraNumero(desconto.valor) > 0;
    const temFrete = acrescimo.ativo && F.paraNumero(acrescimo.valor) > 0;
    return Boolean(temDesconto || temFrete);
  }

  function atualizarVisibilidadeDesconto() {
    const ligado = descontoFreteLigado(estado.doc);
    $('#op-desconto-frete').checked = ligado;
    $('#bloco-desconto-frete-campos').classList.toggle('oculto', !ligado);
  }

  function alternarDescontoFrete(ligado) {
    const doc = estado.doc;
    if (!doc) return;
    doc.desconto = Object.assign({ modo: 'nenhum', valor: 0 }, doc.desconto || {});
    doc.desconto.ativo = ligado;
    if (!ligado) {
      // desmarcar quer dizer "este documento não tem desconto nem frete":
      // os valores saem para o total não ficar com conta escondida
      doc.desconto.modo = 'nenhum';
      doc.desconto.valor = 0;
      doc.acrescimo = Object.assign({ ativo: false, descricao: 'Frete / Instalação', valor: 0 }, doc.acrescimo || {});
      doc.acrescimo.ativo = false;
      doc.acrescimo.valor = 0;
      $('#campo-desconto-modo').value = 'nenhum';
      $('#campo-desconto-valor').value = '';
      $('#campo-acrescimo-ativo').checked = false;
      $('#campo-acrescimo-valor').value = '';
    }
    atualizarVisibilidadeDesconto();
    atualizarResumos();
    marcarSujo();
  }

  function atualizarCabecalho() {
    if (!estado.doc) return;
    const tipo = estado.doc.tipo;
    const numero = F.numeroDocumento(estado.doc.numero.sequencial || 1, estado.doc.numero.ano || new Date().getFullYear());
    $('#editor-titulo').textContent = (tipo === 'orcamento' ? 'Orçamento' : 'Proposta de fornecimento') + ' nº ' + numero;
    const destinatario = tipo === 'orcamento'
      ? (estado.doc.cliente && estado.doc.cliente.nome) || 'cliente não informado'
      : (estado.doc.orgao && estado.doc.orgao.nome) || 'órgão não informado';
    $('#editor-subtitulo').textContent = destinatario + (estado.novo ? ' • ainda não salvo' : '');
  }

  // ---------------------------------------------------------------- itens

  function calculos() {
    const itens = (estado.doc && estado.doc.itens) || [];
    const subtotal = itens.reduce((s, i) => s + F.paraNumero(i.quantidade) * F.paraNumero(i.precoVenda), 0);
    const custo = itens.reduce((s, i) => s + F.paraNumero(i.quantidade) * F.paraNumero(i.precoCusto), 0);
    const desconto = estado.doc.desconto || { modo: 'nenhum', valor: 0 };
    let valorDesconto = 0;
    if (desconto.modo === 'percentual') valorDesconto = (subtotal * F.paraNumero(desconto.valor)) / 100;
    else if (desconto.modo === 'valor') valorDesconto = F.paraNumero(desconto.valor);
    const acrescimo = estado.doc.acrescimo && estado.doc.acrescimo.ativo ? F.paraNumero(estado.doc.acrescimo.valor) : 0;
    const total = Math.max(0, subtotal - valorDesconto) + acrescimo;
    const lucro = F.arredondar(total - custo - acrescimo, 2);
    return {
      itens: itens.length,
      subtotal: F.arredondar(subtotal, 2),
      custo: F.arredondar(custo, 2),
      lucro,
      total: F.arredondar(total, 2),
      desconto: F.arredondar(valorDesconto, 2),
      // lucro sobre o total (margem do documento) e sobre o custo (a mesma
      // conta da ferramenta "margem sobre o custo")
      percentualLucro: total > 0 ? F.arredondar((lucro / total) * 100, 1) : 0,
      percentualSobreCusto: custo > 0 ? F.arredondar((lucro / custo) * 100, 1) : 0,
    };
  }

  function atualizarResumos() {
    const c = calculos();
    $('#resumo-qtd-itens').textContent = c.itens;
    $('#resumo-subtotal').textContent = F.moeda(c.subtotal);
    $('#resumo-custo').textContent = F.moeda(c.custo);
    $('#resumo-lucro').textContent = F.moeda(c.lucro);
    // a porcentagem vem junto do valor; o título mostra as duas leituras
    $('#resumo-lucro-percentual').textContent = F.porcentagem(c.percentualLucro) + ' do total';
    $('#resumo-lucro-percentual').title =
      'Lucro sobre o total (margem): ' + F.porcentagem(c.percentualLucro) +
      ' · sobre o custo: ' + F.porcentagem(c.percentualSobreCusto);
    $('#resumo-total').textContent = F.moeda(c.total);
    $('#itens-vazio').classList.toggle('oculto', c.itens > 0);
    $$('#lista-itens .item').forEach((elemento, indice) => {
      const item = estado.doc.itens[indice];
      if (!item) return;
      const total = F.paraNumero(item.quantidade) * F.paraNumero(item.precoVenda);
      $('.item-total', elemento).textContent = F.moeda(total);
      $('.item-numero', elemento).textContent = item.numeroItem || indice + 1;
    });
  }


  function criarCampoItem(rotulo, valor, atributo, opcoes) {
    const config = opcoes || {};
    const label = document.createElement('label');
    label.textContent = rotulo;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = valor == null ? '' : valor;
    input.dataset.campo = atributo;
    if (config.classe) input.className = config.classe;
    if (config.moeda) input.inputMode = 'decimal';
    label.appendChild(input);
    return label;
  }

  function linhaItem(item, indice) {
    const bloco = document.createElement('div');
    bloco.className = 'item';
    bloco.dataset.indice = String(indice);

    const linha = document.createElement('div');
    linha.className = 'item-linha';

    const numero = document.createElement('span');
    numero.className = 'item-numero';
    numero.textContent = item.numeroItem || indice + 1;

    const descricao = document.createElement('input');
    descricao.type = 'text';
    descricao.value = item.descricao || '';
    descricao.placeholder = 'Descrição do item conforme o edital';
    descricao.dataset.campo = 'descricao';

    const campos = document.createElement('div');
    campos.className = 'item-campos';
    campos.appendChild(criarCampoItem('Qtd', item.quantidade, 'quantidade', { classe: 'item-quantidade' }));
    campos.appendChild(criarCampoItem('Un.', item.unidade, 'unidade', { classe: 'item-unidade' }));
    campos.appendChild(criarCampoItem('Valor un.', item.precoVenda ? F.numero(item.precoVenda, 2) : '', 'precoVenda', { classe: 'item-preco', moeda: true }));

    const total = document.createElement('span');
    total.className = 'item-total';
    total.textContent = F.moeda(F.paraNumero(item.quantidade) * F.paraNumero(item.precoVenda));

    const acoes = document.createElement('div');
    acoes.className = 'item-acoes';
    const botoes = [
      { acao: 'detalhes', texto: 'Detalhes', titulo: 'Descrição completa, foto e catálogo' },
      { acao: 'duplicar', texto: '⧉', titulo: 'Duplicar item' },
      { acao: 'subir', texto: '↑', titulo: 'Mover para cima (o número acompanha a ordem)' },
      { acao: 'descer', texto: '↓', titulo: 'Mover para baixo (o número acompanha a ordem)' },
      { acao: 'remover', texto: '🗑', titulo: 'Remover item' },
    ];
    botoes.forEach((b) => {
      const botao = document.createElement('button');
      botao.type = 'button';
      botao.dataset.acaoItem = b.acao;
      botao.title = b.titulo;
      botao.textContent = b.texto;
      acoes.appendChild(botao);
    });

    if (estado.selecao.ativa) {
      const marcador = document.createElement('label');
      marcador.className = 'item-marcador';
      marcador.title = 'Selecionar este item';
      const caixa = document.createElement('input');
      caixa.type = 'checkbox';
      caixa.setAttribute('data-marcar-item', '');
      caixa.checked = estado.selecao.marcados.indexOf(item) >= 0;
      marcador.appendChild(caixa);
      linha.appendChild(marcador);
      if (caixa.checked) bloco.classList.add('selecionado');
    }

    linha.append(numero, descricao, campos, total, acoes);
    bloco.appendChild(linha);

    // painel de detalhes
    const detalhes = document.createElement('div');
    detalhes.className = 'item-detalhes oculto';

    const grade1 = document.createElement('div');
    grade1.className = 'grade-2';
    grade1.append(
      criarCampoItem('Nº do item', item.numeroItem, 'numeroItem'),
      criarCampoItem('Marca / Modelo', item.marcaModelo, 'marcaModelo'),
      criarCampoItem('Valor de referência (edital)', item.valorReferencia ? F.numero(item.valorReferencia, 2) : '', 'valorReferencia', { moeda: true }),
      criarCampoItem('Preço de custo', item.precoCusto ? F.numero(item.precoCusto, 2) : '', 'precoCusto', { moeda: true }),
      criarCampoItem('Preço de venda', item.precoVenda ? F.numero(item.precoVenda, 2) : '', 'precoVenda', { moeda: true }),
      criarCampoItem('Link da compra', item.linkCompra, 'linkCompra')
    );

    const descricaoLonga = document.createElement('label');
    descricaoLonga.className = 'campo campo-largo';
    descricaoLonga.textContent = 'Descrição completa (usada na tabela de preços)';
    const textarea = document.createElement('textarea');
    textarea.rows = 2;
    textarea.dataset.campo = 'descricao';
    textarea.value = item.descricao || '';
    descricaoLonga.appendChild(textarea);

    const catalogo = document.createElement('label');
    catalogo.className = 'campo campo-largo';
    catalogo.textContent = 'Descrição do catálogo (texto comercial que aparece no catálogo)';
    const textareaCatalogo = document.createElement('textarea');
    textareaCatalogo.rows = 4;
    textareaCatalogo.dataset.campo = 'descricaoCatalogo';
    textareaCatalogo.value = item.descricaoCatalogo || '';
    catalogo.appendChild(textareaCatalogo);

    const fotoArea = document.createElement('div');
    fotoArea.className = 'campo campo-largo';
    const rotulo = document.createElement('span');
    rotulo.className = 'rotulo-campo';
    rotulo.textContent = 'Foto do produto (link da internet ou arquivo enviado)';
    const linhaFoto = document.createElement('div');
    linhaFoto.className = 'item-foto-area';

    const imagem = document.createElement('img');
    imagem.className = 'previa-foto';
    imagem.alt = 'Foto do item';
    if (item.foto) UI.aplicarImagem(imagem, item.foto);
    else {
      imagem.classList.add('vazia');
      imagem.alt = 'sem foto';
    }
    imagem.addEventListener('error', () => {
      imagem.removeAttribute('src');
      imagem.classList.add('vazia');
      imagem.alt = 'imagem indisponível';
    });

    const controles = document.createElement('div');
    controles.style.flex = '1';
    const inputFoto = document.createElement('input');
    inputFoto.type = 'text';
    inputFoto.placeholder = 'https://... (link da foto do produto)';
    inputFoto.value = item.foto || '';
    inputFoto.dataset.campo = 'foto';
    const botoesFoto = document.createElement('div');
    botoesFoto.className = 'upload-acoes';
    botoesFoto.style.marginTop = '8px';

    const arquivo = document.createElement('input');
    arquivo.type = 'file';
    arquivo.accept = 'image/*';
    arquivo.className = 'oculto';
    arquivo.dataset.campoArquivo = 'foto';

    const enviar = document.createElement('button');
    enviar.type = 'button';
    enviar.className = 'botao';
    enviar.textContent = 'Enviar foto do computador';
    enviar.addEventListener('click', () => arquivo.click());

    const limpar = document.createElement('button');
    limpar.type = 'button';
    limpar.className = 'botao botao-fantasma';
    limpar.textContent = 'Remover foto';
    limpar.addEventListener('click', () => {
      estado.doc.itens[indice].foto = '';
      inputFoto.value = '';
      imagem.removeAttribute('src');
      imagem.classList.add('vazia');
      marcarSujo();
    });

    arquivo.addEventListener('change', async () => {
      const escolhido = arquivo.files[0];
      if (!escolhido) return;
      try {
        enviar.disabled = true;
        enviar.textContent = 'Enviando...';
        const resposta = await window.API.enviarArquivo('/api/uploads', escolhido, 'arquivo');
        estado.doc.itens[indice].foto = resposta.caminho;
        inputFoto.value = resposta.caminho;
        UI.aplicarImagem(imagem, resposta.caminho);
        imagem.classList.remove('vazia');
        marcarSujo();
        UI.toast('Foto enviada.', 'sucesso');
      } catch (erro) {
        UI.toast(erro.message, 'erro');
      } finally {
        enviar.disabled = false;
        enviar.textContent = 'Enviar foto do computador';
        arquivo.value = '';
      }
    });

    botoesFoto.append(enviar, limpar);
    controles.append(inputFoto, arquivo, botoesFoto);
    linhaFoto.append(imagem, controles);
    fotoArea.append(rotulo, linhaFoto);

    detalhes.append(grade1, descricaoLonga, catalogo, fotoArea);
    bloco.appendChild(detalhes);
    return bloco;
  }

  /**
   * Guarda o que a pessoa estava fazendo na lista: quais painéis "Detalhes"
   * estavam abertos, qual campo estava em edição (com a posição do cursor) e
   * onde a página estava rolada. Os itens são identificados pelo próprio
   * objeto, então mover/apagar não troca o estado de lugar.
   */
  function capturarEstadoItens() {
    const itens = (estado.doc && estado.doc.itens) || [];
    const abertos = [];
    UI.$$('#lista-itens .item').forEach((bloco) => {
      const detalhes = $('.item-detalhes', bloco);
      if (detalhes && !detalhes.classList.contains('oculto')) {
        const item = itens[Number(bloco.dataset.indice)];
        if (item) abertos.push(item);
      }
    });
    const foco = document.activeElement;
    let campoFocado = null;
    if (foco && foco.dataset && foco.dataset.campo) {
      const bloco = foco.closest('#lista-itens .item');
      const item = bloco ? itens[Number(bloco.dataset.indice)] : null;
      if (item) {
        campoFocado = {
          item,
          campo: foco.dataset.campo,
          inicio: typeof foco.selectionStart === 'number' ? foco.selectionStart : null,
          fim: typeof foco.selectionEnd === 'number' ? foco.selectionEnd : null,
        };
      }
    }
    return { abertos, campoFocado, rolagem: window.scrollY || 0 };
  }

  function blocoDoItem(item) {
    const indice = ((estado.doc && estado.doc.itens) || []).indexOf(item);
    if (indice < 0) return null;
    return $('#lista-itens .item[data-indice="' + indice + '"]');
  }

  /** Devolve o painel aberto, o cursor e a rolagem depois de redesenhar. */
  function restaurarEstadoItens(antes) {
    if (!antes) return;
    (antes.abertos || []).forEach((item) => {
      const bloco = blocoDoItem(item);
      if (!bloco) return;
      const detalhes = $('.item-detalhes', bloco);
      if (detalhes) detalhes.classList.remove('oculto');
      const botao = $('[data-acao-item="detalhes"]', bloco);
      if (botao) botao.textContent = 'Ocultar';
    });
    const foco = antes.campoFocado;
    if (foco) {
      const bloco = blocoDoItem(foco.item);
      const elemento = bloco ? bloco.querySelector('[data-campo="' + foco.campo + '"]') : null;
      if (elemento && document.activeElement !== elemento) {
        elemento.focus();
        if (foco.inicio !== null) {
          try { elemento.setSelectionRange(foco.inicio, foco.fim); } catch (_) { /* campo sem seleção */ }
        }
      }
    }
    // devolve a posição da página só se ela realmente mudou (não briga com
    // quem está rolando, e ambientes sem scrollTo ficam em paz)
    if (typeof antes.rolagem === 'number' && typeof window.scrollY === 'number' && window.scrollY !== antes.rolagem) {
      window.scrollTo(0, antes.rolagem);
    }
  }

  /**
   * Redesenha a lista de itens.
   * @param {object} [antes] estado capturado antes de mexer nos itens; sem ele,
   *   o estado é lido do que está na tela agora.
   */
  function desenharItens(antes) {
    const estadoAnterior = antes || capturarEstadoItens();
    const lista = $('#lista-itens');
    lista.classList.toggle('em-selecao', estado.selecao.ativa);
    lista.innerHTML = '';
    (estado.doc.itens || []).forEach((item, indice) => lista.appendChild(linhaItem(item, indice)));
    restaurarEstadoItens(estadoAnterior);
    atualizarPainelSelecao();
    atualizarResumos();
  }

  /** O que muda o desenho da lista: quantidade de itens e numeração. */
  function assinaturaItens(itens) {
    return (itens || []).map((i) => String(i.numeroItem == null ? '' : i.numeroItem)).join('|') + '#' + ((itens || []).length);
  }

  function itemVazio() {
    return {
      numeroItem: String((estado.doc.itens || []).length + 1),
      descricao: '',
      unidade: 'UND',
      quantidade: 1,
      valorReferencia: 0,
      precoCusto: 0,
      precoVenda: 0,
      marcaModelo: '',
      foto: '',
      descricaoCatalogo: '',
      linkCompra: '',
      observacao: '',
    };
  }

  // ------------------------------------------------ organizar por item

  /**
   * Número do item em pedaços, para comparar como as pessoas leem:
   * "15" → [15], "2.10" → [2, 10] (por isso 2.2 vem antes de 2.10),
   * "S/N" → [] (sem número, vai para o fim).
   */
  function chaveDoNumero(valor) {
    const pedacos = String(valor == null ? '' : valor).match(/\d+/g);
    return pedacos ? pedacos.map(Number) : [];
  }

  /** Compara dois números de item, pedaço por pedaço (1, 2, 2.2, 2.10, 15). */
  function compararNumeroItem(a, b) {
    const na = chaveDoNumero(a);
    const nb = chaveDoNumero(b);
    if (!na.length && !nb.length) return 0;
    if (!na.length) return 1; // item sem número fica no fim
    if (!nb.length) return -1;
    const partes = Math.max(na.length, nb.length);
    for (let i = 0; i < partes; i += 1) {
      // quem acabou antes vem primeiro: "2" antes de "2.1"
      const da = na[i] === undefined ? -1 : na[i];
      const db = nb[i] === undefined ? -1 : nb[i];
      if (da !== db) return da - db;
    }
    return 0;
  }

  /** O item tem número com dígitos? ("S/N", "-" e vazio não entram na conta) */
  function temNumeroDeItem(valor) {
    return chaveDoNumero(valor).length > 0;
  }

  /**
   * Troca o número entre dois itens que mudaram de lugar. É o que faz a
   * numeração acompanhar a ordem: ao descer, o item assume o número do que
   * estava abaixo (crescente); ao subir, o do que estava acima (decrescente).
   * Se um dos dois não tem número (por exemplo "S/N"), nada é trocado — não
   * existe número para colocar em sequência.
   */
  function trocarNumeroItem(a, b) {
    if (!a || !b || a === b) return false;
    if (!temNumeroDeItem(a.numeroItem) || !temNumeroDeItem(b.numeroItem)) return false;
    const guardado = a.numeroItem;
    a.numeroItem = b.numeroItem;
    b.numeroItem = guardado;
    return true;
  }

  /**
   * Organiza os itens pelo número do item (1, 15, 2, 3 → 1, 2, 3, 15).
   * A ordem da tela é a ordem do PDF e da planilha; os números em si não são
   * trocados — o item continua com o número que veio do edital.
   */
  function organizarPorItem() {
    const itens = estado.doc.itens || [];
    if (itens.length < 2) {
      UI.toast('Adicione pelo menos dois itens para organizar.', 'aviso');
      return;
    }
    const antes = capturarEstadoItens();
    const ordenados = itens
      .map((item, posicao) => ({ item, posicao }))
      .sort((a, b) => {
        const diferenca = compararNumeroItem(a.item.numeroItem, b.item.numeroItem);
        if (diferenca) return diferenca;
        // números iguais escritos de formas diferentes ("2.1" e "2-01"):
        // compara o texto e, se ainda empatar, mantém a ordem atual
        const texto = String(a.item.numeroItem == null ? '' : a.item.numeroItem)
          .localeCompare(String(b.item.numeroItem == null ? '' : b.item.numeroItem), 'pt-BR', { numeric: true });
        return texto || a.posicao - b.posicao;
      })
      .map((registro) => registro.item);

    const jaEstava = ordenados.every((item, indice) => item === itens[indice]);
    if (jaEstava) {
      UI.toast('Os itens já estão na ordem do número.', 'aviso');
      return;
    }
    estado.doc.itens = ordenados;
    desenharItens(antes);
    marcarSujo();
    UI.toast('Itens organizados pelo número.', 'sucesso');
  }

  // ------------------------------------------------ selecionar itens

  /**
   * Modo "selecionar itens": uma caixa em cada item, para apagar ou mover
   * vários de uma vez (o sistema não pergunta item por item).
   */
  function atualizarPainelSelecao() {
    const barra = $('#itens-selecao');
    const botao = $('#itens-selecionar');
    const quantos = estado.selecao.marcados.length;
    barra.classList.toggle('oculto', !estado.selecao.ativa);
    botao.setAttribute('aria-pressed', estado.selecao.ativa ? 'true' : 'false');
    botao.textContent = estado.selecao.ativa ? 'Concluir seleção' : 'Selecionar itens';
    $('#itens-selecao-contagem').textContent = quantos
      ? quantos + (quantos === 1 ? ' item selecionado' : ' itens selecionados')
      : 'Nenhum item selecionado';
    $('#itens-selecionar-todos').textContent =
      quantos && quantos === (estado.doc.itens || []).length ? 'Desmarcar todos' : 'Marcar todos';
    ['#itens-subir-todos', '#itens-descer-todos', '#itens-remover-todos'].forEach((sel) => {
      $(sel).disabled = quantos === 0;
    });
  }

  function definirSelecao(ativa) {
    estado.selecao.ativa = !!ativa;
    if (!estado.selecao.ativa) estado.selecao.marcados = [];
    desenharItens();
  }

  function marcarItem(item, marcado) {
    const marcados = estado.selecao.marcados;
    const posicao = marcados.indexOf(item);
    if (marcado && posicao < 0) marcados.push(item);
    if (!marcado && posicao >= 0) marcados.splice(posicao, 1);
    atualizarPainelSelecao();
  }

  function marcarTodos() {
    const itens = estado.doc.itens || [];
    estado.selecao.marcados = estado.selecao.marcados.length === itens.length ? [] : itens.slice();
    desenharItens();
  }

  /** Move os itens marcados um passo para cima ou para baixo, na ordem deles. */
  function moverSelecionados(direcao) {
    const itens = estado.doc.itens || [];
    const marcados = itens.filter((i) => estado.selecao.marcados.indexOf(i) >= 0);
    if (!marcados.length) {
      UI.toast('Marque pelo menos um item para mover.', 'aviso');
      return;
    }
    const antes = capturarEstadoItens();
    // subindo começa pelo primeiro; descendo, pelo último (o bloco anda junto)
    const ordem = direcao < 0 ? marcados : marcados.slice().reverse();
    let moveu = false;
    let numerosTrocados = false;
    ordem.forEach((item) => {
      const de = itens.indexOf(item);
      const para = de + direcao;
      if (de < 0 || para < 0 || para >= itens.length) return;
      if (estado.selecao.marcados.indexOf(itens[para]) >= 0) return; // vizinho marcado: já vai junto
      itens.splice(de, 1);
      itens.splice(para, 0, item);
      // quem ficou no índice antigo é o vizinho que foi passado: os números
      // trocam de lugar junto com os itens
      if (trocarNumeroItem(item, itens[de])) numerosTrocados = true;
      moveu = true;
    });
    if (!moveu) {
      UI.toast(direcao < 0 ? 'Os itens marcados já estão no topo.' : 'Os itens marcados já estão no fim.', 'aviso');
      return;
    }
    desenharItens(antes);
    if (numerosTrocados) {
      UI.toast('Itens movidos: a numeração acompanhou a nova ordem.', 'sucesso', 3500);
    }
    marcarSujo();
  }

  async function removerSelecionados() {
    const itens = estado.doc.itens || [];
    const marcados = itens.filter((i) => estado.selecao.marcados.indexOf(i) >= 0);
    if (!marcados.length) {
      UI.toast('Marque pelo menos um item para remover.', 'aviso');
      return;
    }
    const confirma = await UI.confirmar({
      titulo: 'Remover itens',
      texto: marcados.length === 1
        ? 'Deseja remover o item selecionado?'
        : 'Deseja remover os ' + marcados.length + ' itens selecionados?',
      textoConfirmar: 'Remover',
      perigo: true,
    });
    if (!confirma) return;
    const antes = capturarEstadoItens();
    estado.doc.itens = itens.filter((i) => estado.selecao.marcados.indexOf(i) < 0);
    estado.selecao.marcados = [];
    desenharItens(antes);
    marcarSujo();
  }

  // --------------------------------------------------------- prévia e PDF

  function liberarPrevia() {
    if (estado.urlPrevia) {
      URL.revokeObjectURL(estado.urlPrevia);
      estado.urlPrevia = null;
    }
  }

  async function atualizarPrevia(silencioso) {
    if ($('#view-editor').classList.contains('oculto') || !estado.doc) return;
    const aviso = $('#previa-aviso');
    if (!silencioso) {
      aviso.textContent = 'Gerando pré-visualização...';
      aviso.classList.remove('oculto');
      $('#previa-iframe').classList.add('oculto');
    }
    try {
      coletarFormulario();
      const blob = await window.API.previaPdf(estado.doc);
      liberarPrevia();
      estado.urlPrevia = URL.createObjectURL(blob);
      $('#previa-iframe').src = estado.urlPrevia;
      $('#previa-iframe').classList.remove('oculto');
      aviso.classList.add('oculto');
      UI.avisarFotosIgnoradas(window.API.ultimasFotosIgnoradas);
    } catch (erro) {
      if (!silencioso) {
        aviso.textContent = 'Não foi possível gerar a pré-visualização: ' + erro.message;
        aviso.classList.remove('oculto');
      }
    }
  }

  async function salvar(silencioso) {
    if (estado.salvando) return estado.doc;
    estado.salvando = true;
    const antesDosItens = assinaturaItens(estado.doc && estado.doc.itens);
    try {
      coletarFormulario();
      $('#editor-estado').textContent = 'Salvando...';
      let resposta;
      if (estado.novo && !estado.doc.id) {
        resposta = await window.API.post('/api/documentos', estado.doc);
      } else {
        resposta = await window.API.put('/api/documentos/' + estado.doc.id, estado.doc);
      }
      estado.doc = resposta.documento;
      estado.novo = false;
      // no modo local o documento é guardado pelo navegador: se a gravação não
      // aconteceu, dizer "Salvo" seria mentira
      const guardado = resposta.salvoNoNavegador !== false;
      if (guardado) {
        marcarSalvo();
      } else {
        $('#editor-estado').textContent = 'Não guardado';
        $('#editor-estado').className = 'etiqueta-estado erro';
        if (!silencioso) {
          UI.toast(
            'Atenção: este navegador não guardou o documento' +
              (resposta.motivoNaoSalvo ? ' (' + resposta.motivoNaoSalvo + ')' : '') +
              '. Baixe um backup pelo menu antes de fechar.',
            'erro', 15000
          );
        }
      }
      atualizarCabecalho();
      // Redesenha os itens só quando a lista mudou de verdade (numeração nova
      // ou item a mais/menos). O salvamento automático acontece enquanto a
      // pessoa digita: redesenhar à toa fechava o painel "Detalhes" e
      // devolvia o cursor para o começo do campo.
      if (antesDosItens !== assinaturaItens(estado.doc.itens)) desenharItens();
      if (!silencioso && guardado) UI.toast('Documento salvo.', 'sucesso');
      if (window.App) window.App.recarregarLista();
      // o endereço passa a apontar para o documento salvo — mas só quando a
      // pessoa continua no editor. Se ela já foi para outra tela (clicou em
      // "Minha empresa", por exemplo), o endereço é dela: mexer aqui a
      // arrastaria de volta, e numa corrida a tela pedida nem aparecia.
      const enderecoDoEditor = /^#\/documento(\/|$)/.test(window.location.hash || '');
      if (enderecoDoEditor && !$('#view-editor').classList.contains('oculto')) {
        window.location.hash = '#/documento/' + estado.doc.id;
      }
      return estado.doc;
    } catch (erro) {
      $('#editor-estado').textContent = 'Erro ao salvar';
      $('#editor-estado').className = 'etiqueta-estado erro';
      UI.toast(erro.message, 'erro');
      throw erro;
    } finally {
      estado.salvando = false;
    }
  }

  async function gerarPdf() {
    const botao = $('#editor-gerar-pdf');
    try {
      botao.disabled = true;
      botao.textContent = 'Gerando...';
      let salvo = estado.doc;
      if (estado.sujo || estado.novo || !estado.doc.id) salvo = await salvar(true);
      const arquivo = await window.API.baixar('/api/documentos/' + salvo.id + '/pdf?download=1');
      window.API.baixarBlob(arquivo.blob, arquivo.nomeArquivo);
      UI.toast('PDF gerado: ' + arquivo.nomeArquivo, 'sucesso');
      UI.avisarFotosIgnoradas(arquivo);
    } catch (erro) {
      UI.toast('Erro ao gerar PDF: ' + erro.message, 'erro');
    } finally {
      botao.disabled = false;
      botao.textContent = 'Gerar PDF';
    }
  }

  // ------------------------------------------------------------- importar

  function montarModalImportacao() {
    const corpo = document.createElement('div');
    corpo.innerHTML = `
      <p class="texto-suave">Selecione a planilha de itens (.xlsx, .xls, .csv ou .ods). Precisa ter ao menos as
      colunas <strong>Descricao_Edital</strong> e <strong>Quantidade</strong>.</p>
      <div class="area-upload" id="importar-area">
        <input type="file" id="importar-arquivo" accept=".xlsx,.xls,.csv,.ods" class="oculto" />
        <p class="area-upload-icone">📄</p>
        <p><strong>Clique para escolher</strong> ou arraste a planilha aqui</p>
        <p class="texto-suave">Baixe o <a href="/api/modelo-planilha">modelo de planilha</a> se precisar.</p>
      </div>
      <div id="importar-resultado" class="oculto">
        <h4 id="importar-titulo"></h4>
        <div id="importar-avisos" class="avisos oculto"></div>
        <div id="importar-tabela" class="tabela-rolavel"></div>
      </div>`;
    return corpo;
  }

  function abrirImportacao(aoConcluir) {
    const corpo = montarModalImportacao();
    const modal = UI.abrirModal({
      titulo: 'Importar itens da planilha',
      corpo,
      larga: true,
      botoes: [{ texto: 'Fechar', classe: 'botao-fantasma', acao: UI.fecharModal }],
    });

    const area = $('#importar-area', corpo);
    const arquivo = $('#importar-arquivo', corpo);

    async function enviar(file) {
      if (!file) return;
      area.innerHTML = '<p class="area-upload-icone">⏳</p><p>Lendo a planilha...</p>';
      try {
        const resultado = await window.API.enviarArquivo('/api/importar', file, 'arquivo');
        mostrarResultado(resultado);
      } catch (erro) {
        area.innerHTML = `<p class="area-upload-icone">⚠️</p><p>${UI.escaparHtml(erro.message)}</p>`;
      }
    }

    function mostrarResultado(resultado) {
      $('#importar-resultado', corpo).classList.remove('oculto');
      $('#importar-titulo', corpo).textContent = `${resultado.itens.length} itens encontrados na aba "${resultado.aba}"`;
      const avisos = $('#importar-avisos', corpo);
      if (resultado.avisos && resultado.avisos.length) {
        avisos.classList.remove('oculto');
        avisos.innerHTML = '<strong>Verifique estes pontos:</strong><ul>' +
          resultado.avisos.slice(0, 40).map((a) => `<li>${UI.escaparHtml(a)}</li>`).join('') + '</ul>';
      }
      const linhas = resultado.itens.slice(0, 60).map((item) => `
        <tr>
          <td>${UI.escaparHtml(item.numeroItem)}</td>
          <td>${UI.escaparHtml(item.descricao).slice(0, 160)}</td>
          <td>${UI.escaparHtml(item.unidade)}</td>
          <td class="numero">${F.quantidade(item.quantidade)}</td>
          <td class="numero">${F.moeda(item.precoVenda)}</td>
          <td>${UI.escaparHtml(item.marcaModelo)}</td>
        </tr>`).join('');
      $('#importar-tabela', corpo).innerHTML = `
        <table class="tabela">
          <thead><tr><th>Item</th><th>Descrição</th><th>Un.</th><th class="numero">Qtd</th><th class="numero">Preço</th><th>Marca</th></tr></thead>
          <tbody>${linhas}</tbody>
        </table>`;

      const rodape = modal.rodape;
      rodape.innerHTML = '';
      const criarBotao = (texto, classe, acao) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'botao ' + classe;
        b.textContent = texto;
        b.addEventListener('click', acao);
        rodape.appendChild(b);
      };
      criarBotao('Cancelar', 'botao-fantasma', UI.fecharModal);
      criarBotao('Adicionar aos itens', '', () => {
        estado.doc.itens = (estado.doc.itens || []).concat(resultado.itens);
        finalizar(resultado);
      });
      criarBotao('Substituir todos os itens', 'botao-primario', () => {
        estado.doc.itens = resultado.itens.slice();
        finalizar(resultado);
      });
    }

    function finalizar(resultado) {
      desenharItens();
      marcarSujo();
      UI.fecharModal();
      const aviso = resultado.avisos && resultado.avisos.length ? ` (${resultado.avisos.length} avisos)` : '';
      UI.toast(`${resultado.itens.length} itens importados${aviso}.`, resultado.avisos && resultado.avisos.length ? 'aviso' : 'sucesso');
      if (aoConcluir) aoConcluir(resultado);
    }

    area.addEventListener('click', () => arquivo.click());
    arquivo.addEventListener('change', () => enviar(arquivo.files[0]));
    area.addEventListener('dragover', (evento) => {
      evento.preventDefault();
      area.classList.add('arrastando');
    });
    area.addEventListener('dragleave', () => area.classList.remove('arrastando'));
    area.addEventListener('drop', (evento) => {
      evento.preventDefault();
      area.classList.remove('arrastando');
      enviar(evento.dataTransfer.files[0]);
    });
  }

  // ------------------------------------------------------------- imagens

  function desenharImagens() {
    const proponente = estado.doc.proponente || {};
    [['#previa-logo', proponente.logo], ['#previa-assinatura', proponente.assinatura]].forEach(([sel, caminho]) => {
      const elemento = $(sel);
      if (!elemento) return;
      if (caminho) UI.aplicarImagem(elemento, caminho);
      else {
        elemento.removeAttribute('src');
        elemento.dataset.referencia = '';
        elemento.classList.add('oculto');
      }
    });
  }

  // -------------------------------------------------------------- eventos

  function ligarEventos() {
    // abas
    UI.ligarAbas('#abas-editor', 'aba-editor', (aba) => {
      UI.$$('.painel-aba').forEach((painel) => painel.classList.toggle('oculto', painel.dataset.painel !== aba));
    });

    // campos simples
    const formulario = $('.editor-formulario');
    /** Grava o que foi digitado/alterado num campo do formulário. */
    function aplicarCampo(alvo) {
      const campo = CAMPOS.find((c) => c.sel === '#' + alvo.id);
      if (!campo) return;
      const valor = valorDoCampo(campo, alvo);
      // "adicionar nova modalidade" é um caminho da tela, não um dado
      if (valor === MODALIDADE_NOVA) return;
      definir(campo.alvo, valor);
      if (campo.alvo === 'tipo') {
        atualizarVisibilidadeTipo();
        atualizarCabecalho();
      }
      if (campo.alvo.startsWith('numero.')) atualizarCabecalho();
      // desconto e frete mexem no total: recalcula enquanto a pessoa digita
      if (['desconto.modo', 'desconto.valor', 'acrescimo.ativo', 'acrescimo.valor'].includes(campo.alvo)) {
        atualizarResumos();
      }
      marcarSujo();
    }

    // "input" cobre o que é digitado; "change" também grava (listas e
    // navegadores que só disparam um dos dois) — gravar duas vezes não muda nada
    formulario.addEventListener('input', (evento) => {
      if (evento.target.closest('#lista-itens')) return;
      aplicarCampo(evento.target);
    });
    formulario.addEventListener('change', (evento) => {
      const alvo = evento.target;
      if (alvo.closest('#lista-itens')) return;
      if (alvo.id === 'campo-orgao-modalidade' && alvo.value === MODALIDADE_NOVA) {
        pedirNovaModalidade();
        return;
      }
      aplicarCampo(alvo);
    });

    // valores em dinheiro do formulário
    ['#campo-desconto-valor', '#campo-acrescimo-valor'].forEach((sel) => UI.ligarMoeda($(sel)));

    // desconto e frete ficam atrás desta caixa: são opcionais e, na proposta,
    // só aparecem quando a pessoa quiser usá-los
    $('#op-desconto-frete').addEventListener('change', () => alternarDescontoFrete($('#op-desconto-frete').checked));

    // ---------------------------------------------------------- itens
    const lista = $('#lista-itens');
    lista.addEventListener('input', (evento) => {
      const campo = evento.target.dataset.campo;
      if (!campo) return;
      const bloco = evento.target.closest('.item');
      const indice = Number(bloco.dataset.indice);
      const item = estado.doc.itens[indice];
      if (!item) return;
      const valor = evento.target.value;
      item[campo] = ['quantidade', 'precoVenda', 'precoCusto', 'valorReferencia'].includes(campo)
        ? F.paraNumero(valor)
        : valor;
      // mantém a descrição sincronizada entre a linha e o painel de detalhes
      if (campo === 'descricao') {
        UI.$$('.item-detalhes [data-campo="descricao"]', bloco).forEach((outro) => {
          if (outro !== evento.target) outro.value = valor;
        });
        if (!item.descricaoCatalogo) {
          UI.$$('[data-campo="descricaoCatalogo"]', bloco).forEach((outro) => { outro.value = valor; });
          item.descricaoCatalogo = valor;
        }
      }
      if (campo === 'precoVenda') {
        UI.$$('.item-detalhes [data-campo="precoVenda"]', bloco).forEach((outro) => {
          if (outro !== evento.target && document.activeElement !== outro) outro.value = valor;
        });
      }
      if (campo === 'foto') {
        const imagem = $('.previa-foto', bloco);
        if (valor) {
          UI.aplicarImagem(imagem, valor);
          imagem.classList.remove('vazia');
        } else {
          imagem.removeAttribute('src');
          imagem.dataset.referencia = '';
          imagem.classList.add('vazia');
        }
      }
      atualizarResumos();
      marcarSujo();
    });

    lista.addEventListener('change', (evento) => {
      // caixa do modo "selecionar itens"
      if (evento.target.dataset.marcarItem !== undefined) {
        const bloco = evento.target.closest('.item');
        const item = estado.doc.itens[Number(bloco.dataset.indice)];
        marcarItem(item, evento.target.checked);
        bloco.classList.toggle('selecionado', evento.target.checked);
        return;
      }
      const campo = evento.target.dataset.campo;
      if (campo && ['precoVenda', 'precoCusto', 'valorReferencia'].includes(campo)) {
        evento.target.value = evento.target.value === '' ? '' : F.numero(F.paraNumero(evento.target.value), 2);
        atualizarResumos();
      }
    });

    lista.addEventListener('focusout', (evento) => {
      const campo = evento.target.dataset.campo;
      if (!campo) return;
      if (['precoVenda', 'precoCusto', 'valorReferencia'].includes(campo)) {
        evento.target.value = evento.target.value === '' ? '' : F.numero(F.paraNumero(evento.target.value), 2);
      }
    });

    lista.addEventListener('click', (evento) => {
      const botao = evento.target.closest('[data-acao-item]');
      if (!botao) return;
      const bloco = botao.closest('.item');
      const indice = Number(bloco.dataset.indice);
      const itens = estado.doc.itens;
      const acao = botao.dataset.acaoItem;

      if (acao === 'detalhes') {
        const detalhes = $('.item-detalhes', bloco);
        detalhes.classList.toggle('oculto');
        botao.textContent = detalhes.classList.contains('oculto') ? 'Detalhes' : 'Ocultar';
        return;
      }
      if (acao === 'duplicar') {
        const antes = capturarEstadoItens();
        const copia = JSON.parse(JSON.stringify(itens[indice]));
        copia.numeroItem = String(itens.length + 1);
        itens.splice(indice + 1, 0, copia);
        desenharItens(antes);
        marcarSujo();
        return;
      }
      if (acao === 'subir' || acao === 'descer') {
        const destino = acao === 'subir' ? indice - 1 : indice + 1;
        if (destino < 0 || destino >= itens.length) {
          UI.toast(acao === 'subir' ? 'Este item já é o primeiro.' : 'Este item já é o último.', 'aviso');
          return;
        }
        const movido = itens[indice];
        const vizinho = itens[destino];
        const antes = capturarEstadoItens();
        itens.splice(indice, 1);
        itens.splice(destino, 0, movido);
        // a numeração anda junto: o item passa a ter o número da posição nova
        const numerosTrocados = trocarNumeroItem(movido, vizinho);
        desenharItens(antes);
        const linha = blocoDoItem(movido);
        if (linha) linha.scrollIntoView({ block: 'nearest' });
        if (numerosTrocados) {
          UI.toast(
            'Item movido: agora é o nº ' + (movido.numeroItem || destino + 1) + ' ' +
              (acao === 'subir' ? '(subiu)' : '(desceu)') + '.',
            'sucesso',
            3500
          );
        }
        marcarSujo();
        return;
      }
      if (acao === 'remover') {
        UI.confirmar({
          titulo: 'Remover item',
          texto: 'Deseja remover este item da proposta?',
          textoConfirmar: 'Remover',
          perigo: true,
        }).then((confirma) => {
          if (!confirma) return;
          const antes = capturarEstadoItens();
          const removido = itens[indice];
          estado.selecao.marcados = estado.selecao.marcados.filter((i) => i !== removido);
          itens.splice(indice, 1);
          desenharItens(antes);
          marcarSujo();
        });
      }
    });

    $('#itens-adicionar').addEventListener('click', () => {
      estado.doc.itens = estado.doc.itens || [];
      estado.doc.itens.push(itemVazio());
      desenharItens();
      marcarSujo();
      const ultimo = UI.$$('#lista-itens .item').pop();
      if (ultimo) {
        ultimo.querySelector('input[data-campo="descricao"]').focus();
        ultimo.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });

    $('#itens-selecionar').addEventListener('click', () => definirSelecao(!estado.selecao.ativa));
    $('#itens-organizar').addEventListener('click', organizarPorItem);
    $('#itens-selecionar-todos').addEventListener('click', marcarTodos);
    $('#itens-subir-todos').addEventListener('click', () => moverSelecionados(-1));
    $('#itens-descer-todos').addEventListener('click', () => moverSelecionados(1));
    $('#itens-remover-todos').addEventListener('click', removerSelecionados);
    $('#itens-selecao-concluir').addEventListener('click', () => definirSelecao(false));

    $('#itens-limpar').addEventListener('click', async () => {
      if (!estado.doc.itens || !estado.doc.itens.length) return;
      const confirma = await UI.confirmar({
        titulo: 'Limpar itens',
        texto: 'Todos os itens serão removidos do documento.',
        textoConfirmar: 'Limpar tudo',
        perigo: true,
      });
      if (!confirma) return;
      estado.doc.itens = [];
      estado.selecao.marcados = [];
      desenharItens();
      marcarSujo();
    });

    $('#itens-importar').addEventListener('click', () => abrirImportacao());
    $('#editor-importar').addEventListener('click', () => abrirImportacao());

    $('#aplicar-margem').addEventListener('click', async () => {
      const percentual = F.paraNumero($('#margem-percentual').value);
      const comCusto = (estado.doc.itens || []).filter((i) => F.paraNumero(i.precoCusto) > 0);
      if (!comCusto.length) {
        UI.toast('Nenhum item tem preço de custo preenchido.', 'aviso');
        return;
      }
      const confirma = await UI.confirmar({
        titulo: 'Aplicar margem',
        texto: `O preço de venda de ${comCusto.length} item(ns) será recalculado como custo + ${percentual}%.`,
        textoConfirmar: 'Aplicar',
      });
      if (!confirma) return;
      comCusto.forEach((item) => {
        item.precoVenda = F.arredondar(F.paraNumero(item.precoCusto) * (1 + percentual / 100), 2);
      });
      desenharItens();
      marcarSujo();
      UI.toast('Margem aplicada.', 'sucesso');
    });

    // --------------------------------------------------------- proponente
    UI.$$('[data-upload]').forEach((botao) => {
      const campo = botao.dataset.upload;
      const arquivo = $('#arquivo-' + campo);
      botao.addEventListener('click', () => arquivo.click());
      arquivo.addEventListener('change', async () => {
        const escolhido = arquivo.files[0];
        if (!escolhido) return;
        try {
          botao.disabled = true;
          botao.textContent = 'Enviando...';
          const resposta = await window.API.enviarArquivo('/api/uploads', escolhido, 'arquivo');
          definir('proponente.' + campo, resposta.caminho);
          desenharImagens();
          marcarSujo();
          UI.toast('Imagem enviada.', 'sucesso');
        } catch (erro) {
          UI.toast(erro.message, 'erro');
        } finally {
          botao.disabled = false;
          botao.textContent = 'Enviar imagem';
          arquivo.value = '';
        }
      });
    });

    UI.$$('[data-remover]').forEach((botao) => {
      botao.addEventListener('click', () => {
        definir('proponente.' + botao.dataset.remover, '');
        desenharImagens();
        marcarSujo();
      });
    });

    // ------------------------------------------------------------ prévia
    $('#previa-atualizar').addEventListener('click', () => atualizarPrevia(false));
    $('#previa-baixar').addEventListener('click', gerarPdf);
    $('#editor-previa').addEventListener('click', () => definirPrevia(!estado.previaAberta, true));
    $('#editor-gerar-pdf').addEventListener('click', gerarPdf);
    $('#editor-salvar').addEventListener('click', () => salvar(false));
    $('#editor-voltar').addEventListener('click', () => {
      window.location.hash = '#/documentos';
    });

    $('#editor-exportar').addEventListener('click', async () => {
      if (!estado.doc.id) {
        UI.toast('Salve o documento antes de exportar os itens.', 'aviso');
        return;
      }
      try {
        const arquivo = await window.API.baixar('/api/documentos/' + estado.doc.id + '/planilha');
        window.API.baixarBlob(arquivo.blob, arquivo.nomeArquivo);
        UI.toast('Planilha de itens exportada.', 'sucesso');
      } catch (erro) {
        UI.toast(erro.message, 'erro');
      }
    });

    // planilha auxiliar: itens preenchidos no formato do modelo de importação
    // (+ aba de resumo), para trabalhar no Excel e para reenviar pelo sistema
    const planilha = $('#editor-planilha');
    if (planilha) {
      planilha.addEventListener('click', async () => {
        if (estado.sujo || estado.novo || !estado.doc.id) {
          // a planilha sai do que está salvo: salva antes, para não ir desatualizada
          try {
            await salvar(true);
          } catch (_) {
            return;
          }
        }
        try {
          planilha.disabled = true;
          const arquivo = await window.API.baixar('/api/documentos/' + estado.doc.id + '/planilha-auxiliar');
          window.API.baixarBlob(arquivo.blob, arquivo.nomeArquivo);
          UI.toast(
            'Planilha auxiliar gerada: ' + arquivo.nomeArquivo + ' (itens no formato do modelo + aba Resumo).',
            'sucesso',
            9000
          );
        } catch (erro) {
          UI.toast('Não consegui gerar a planilha: ' + erro.message, 'erro');
        } finally {
          planilha.disabled = false;
        }
      });
    }

    window.addEventListener('beforeunload', (evento) => {
      if (estado.sujo && !$('#view-editor').classList.contains('oculto')) {
        evento.preventDefault();
        evento.returnValue = '';
      }
    });
  }

  // ------------------------------------------------------------ interface

  async function novo(tipo) {
    try {
      const inicial = await window.API.get('/api/perfil');
      const perfil = (inicial && inicial.perfil) || {};
      const proximo = await window.API.get('/api/documentos/proximo-numero?tipo=' + tipo);
      estado.doc = {
        tipo,
        status: 'rascunho',
        numero: { sequencial: proximo.sequencial, ano: proximo.ano, grupo: '' },
        data: F.dataISO(new Date()),
        orgao: {},
        cliente: {},
        proponente: Object.assign({}, perfil.empresa || {}),
        itens: [],
        condicoes: {
          validadeDias: (perfil.padroes && perfil.padroes.validadeDias) || 60,
          condicoesPagamento: (perfil.padroes && perfil.padroes.condicoesPagamento) || '',
          prazoEntrega: (perfil.padroes && perfil.padroes.prazoEntrega) || 'Conforme Edital.',
          garantia: (perfil.padroes && perfil.padroes.garantia) || '',
          observacoes: (perfil.padroes && perfil.padroes.observacoes) || '',
          local: (perfil.padroes && perfil.padroes.cidadeUf) || '',
        },
        desconto: { modo: 'nenhum', valor: 0 },
        acrescimo: { ativo: false, descricao: 'Frete / Instalação', valor: 0 },
        opcoes: {
          mostrarCatalogo: true,
          mostrarFotos: true,
          mostrarDadosBancarios: true,
          mostrarPorExtenso: true,
          mostrarAssinatura: true,
          quebrarPaginaCatalogo: true,
          logoNoCabecalho: true,
          mostrarLinkCompra: false,
          cor: '#0B1F33',
        },
      };
      estado.novo = true;
      estado.sujo = true;
      estado.selecao = { ativa: false, marcados: [] };
      prepararTela();
      $('#editor-estado').textContent = 'Não salvo';
      $('#editor-estado').className = 'etiqueta-estado';
      UI.$$('.painel-aba').forEach((painel) => painel.classList.toggle('oculto', painel.dataset.painel !== 'identificacao'));
      UI.$$('#abas-editor .aba').forEach((b) => b.classList.toggle('ativa', b.dataset.abaEditor === 'identificacao'));
    } catch (erro) {
      UI.toast('Não foi possível criar o documento: ' + erro.message, 'erro');
    }
  }

  async function novoComItens(tipo, itens) {
    await novo(tipo);
    if (!estado.doc) return;
    estado.doc.itens = itens.slice();
    desenharItens();
    estado.sujo = true;
    abrirAba('itens');
    UI.toast(itens.length + ' itens carregados. Revise e clique em Gerar PDF.', 'sucesso');
  }

  function abrirAba(nome) {
    UI.$$('.painel-aba').forEach((painel) => painel.classList.toggle('oculto', painel.dataset.painel !== nome));
    UI.$$('#abas-editor .aba').forEach((b) => b.classList.toggle('ativa', b.dataset.abaEditor === nome));
  }

  function prepararTela() {
    preencherFormulario();
    liberarPrevia();
    $('#previa-iframe').classList.add('oculto');
    $('#previa-aviso').classList.remove('oculto');
    $('#previa-aviso').textContent = 'Clique em Atualizar (ou aguarde) para ver o PDF.';
    if (estado.previaAberta) atualizarPrevia(false);
  }

  async function abrir(id) {
    try {
      const resposta = await window.API.get('/api/documentos/' + id);
      estado.doc = resposta.documento;
      estado.novo = false;
      estado.sujo = false;
      estado.selecao = { ativa: false, marcados: [] };
      prepararTela();
      $('#editor-estado').textContent = 'Salvo';
      $('#editor-estado').className = 'etiqueta-estado salvo';
      abrirAba('identificacao');
    } catch (erro) {
      UI.toast(erro.message, 'erro');
      window.location.hash = '#/documentos';
    }
  }

  function aoSairDaVista() {
    liberarPrevia();
  }

  function iniciar() {
    ligarEventos();
    // a pré-visualização começa como o usuário deixou da última vez
    definirPrevia(lerPreviaAberta(), false);
  }

  window.Editor = {
    iniciar,
    novo,
    novoComItens,
    abrir,
    aoSairDaVista,
    abrirImportacao,
    estadoAtual: () => estado,
  };
})();
