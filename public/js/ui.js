/* Utilitários de interface: toasts, modais, máscaras e abas. */
(function () {
  'use strict';

  const F = window.Formato;

  const $ = (seletor, raiz) => (raiz || document).querySelector(seletor);
  const $$ = (seletor, raiz) => Array.from((raiz || document).querySelectorAll(seletor));

  // ------------------------------------------------------------- toasts

  function toast(mensagem, tipo, duracaoMs) {
    const caixa = $('#caixa-toasts');
    const elemento = document.createElement('div');
    elemento.className = 'toast ' + (tipo || '');
    elemento.textContent = mensagem;
    caixa.appendChild(elemento);
    setTimeout(() => {
      elemento.style.opacity = '0';
      elemento.style.transition = 'opacity 0.3s';
      setTimeout(() => elemento.remove(), 320);
    }, duracaoMs || (tipo === 'erro' ? 6500 : 3800));
  }

  // -------------------------------------------------------------- modal

  function abrirModal(opcoes) {
    const config = opcoes || {};
    $('#modal-titulo').textContent = config.titulo || '';
    const corpo = $('#modal-corpo');
    corpo.innerHTML = '';
    if (typeof config.corpo === 'string') corpo.innerHTML = config.corpo;
    else if (config.corpo) corpo.appendChild(config.corpo);

    const rodape = $('#modal-rodape');
    rodape.innerHTML = '';
    (config.botoes || []).forEach((botao) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'botao ' + (botao.classe || '');
      el.textContent = botao.texto;
      el.addEventListener('click', () => {
        if (botao.acao) botao.acao();
      });
      rodape.appendChild(el);
    });
    rodape.classList.toggle('oculto', !(config.botoes || []).length);

    $('#modal').classList.remove('oculto');
    $('#modal .modal-caixa').classList.toggle('larga', Boolean(config.larga));
    const primeiroCampo = corpo.querySelector('input, textarea, select, button');
    if (primeiroCampo) setTimeout(() => primeiroCampo.focus(), 60);
    return { corpo, rodape };
  }

  function fecharModal() {
    $('#modal').classList.add('oculto');
    $('#modal-corpo').innerHTML = '';
  }

  function confirmar(opcoes) {
    const config = opcoes || {};
    return new Promise((resolver) => {
      abrirModal({
        titulo: config.titulo || 'Confirmar',
        corpo: `<p>${config.texto || 'Tem certeza?'}</p>`,
        botoes: [
          { texto: config.textoCancelar || 'Cancelar', classe: 'botao-fantasma', acao: () => { fecharModal(); resolver(false); } },
          { texto: config.textoConfirmar || 'Confirmar', classe: config.perigo ? 'botao-perigo' : 'botao-primario', acao: () => { fecharModal(); resolver(true); } },
        ],
      });
    });
  }

  // ------------------------------------------------------------ máscaras

  /** Campo de dinheiro: digite 1490,50 e o campo formata como 1.490,50 ao sair. */
  function ligarMoeda(input) {
    if (!input) return;
    input.addEventListener('focus', () => {
      const n = F.paraNumero(input.value);
      input.value = n ? n.toFixed(2).replace('.', ',') : '';
    });
    input.addEventListener('blur', () => {
      const n = F.paraNumero(input.value);
      input.value = input.value.trim() === '' ? '' : F.numero(n, 2);
    });
  }

  function ligarMascara(input, funcao) {
    if (!input) return;
    input.addEventListener('input', () => { input.value = funcao(input.value); });
    input.addEventListener('blur', () => { input.value = funcao(input.value); });
  }

  function ligarAbas(containerSeletor, atributo, aoTrocar) {
    const container = $(containerSeletor);
    if (!container) return;
    container.addEventListener('click', (evento) => {
      const botao = evento.target.closest('[data-' + atributo + ']');
      if (!botao) return;
      $$('[data-' + atributo + ']', container).forEach((b) => b.classList.toggle('ativa', b === botao));
      if (aoTrocar) aoTrocar(botao.getAttribute('data-' + atributo));
    });
  }

  function debounce(fn, ms) {
    let timer = null;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  function escaparHtml(texto) {
    return F.escapar(texto);
  }

  function rotuloStatus(status) {
    const nomes = {
      rascunho: 'Rascunho',
      enviada: 'Enviada',
      ganha: 'Ganha',
      perdida: 'Perdida',
      cancelada: 'Cancelada',
    };
    return nomes[status] || status || '';
  }

  function rotuloTipo(tipo) {
    return tipo === 'orcamento' ? 'Orçamento' : 'Proposta';
  }

  window.UI = {
    $, $$,
    toast,
    abrirModal,
    fecharModal,
    confirmar,
    ligarMoeda,
    ligarMascara,
    ligarAbas,
    debounce,
    escaparHtml,
    rotuloStatus,
    rotuloTipo,
  };

  document.addEventListener('click', (evento) => {
    if (evento.target.closest('[data-fechar-modal]')) fecharModal();
  });
  document.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape') fecharModal();
  });
})();
