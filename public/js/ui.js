/* Utilitários de interface: toasts, modais, máscaras e abas. */
(function () {
  'use strict';

  const F = window.Formato;

  /**
   * Onde ficam css/js/vendor desta página: o endereço deste próprio arquivo
   * responde por todos os casos (servidor em "/", GitHub Pages em
   * "/licitapro/public/", testes em jsdom).
   */
  const CAMINHO_BASE = (() => {
    try {
      const atual = document.currentScript && document.currentScript.src;
      if (atual) return atual.replace(/js\/[^/]*$/, '');
    } catch (_) { /* ambientes sem currentScript */ }
    const meta = document.querySelector('meta[name="licitapro-base"]');
    return meta && meta.content ? meta.content : '';
  })();

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

  /**
   * Avisa quais fotos não entraram no PDF (link sem permissão pública, formato
   * não aceito, arquivo corrompido). Sem isso a foto sairia como "—" no
   * documento e o usuário não saberia o motivo.
   */
  function avisarFotosIgnoradas(info) {
    const quantidade = Number((info && info.fotosIgnoradas) || 0);
    const caixa = $('#previa-aviso');
    if (!quantidade) {
      if (caixa) caixa.classList.remove('aviso-alerta');
      return false;
    }
    const detalhe = String((info && info.detalheFotosIgnoradas) || '').trim();
    const resumo = quantidade === 1
      ? '1 foto não entrou no PDF e saiu como "—".'
      : quantidade + ' fotos não entraram no PDF e saíram como "—".';
    const dica = 'Se a foto for necessária, use "Enviar foto do computador" (o link pode não estar público).';
    toast(resumo + (detalhe ? ' ' + detalhe.slice(0, 140) + (detalhe.length > 140 ? '…' : '') : ''), 'aviso', 10000);
    if (caixa) {
      caixa.textContent = (resumo + ' ' + detalhe + ' ' + dica).replace(/\s+/g, ' ').trim();
      caixa.classList.remove('oculto');
      caixa.classList.add('aviso-alerta');
    }
    return true;
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

  /**
   * Endereço de uma imagem para exibição.
   * Com servidor, links externos passam pelo proxy /api/imagem.
   * No modo local (sem servidor), links vão direto e imagens enviadas do
   * computador vêm do armazenamento do navegador.
   */
  function urlImagem(caminho) {
    if (!caminho) return '';
    const texto = String(caminho);
    if (/^(data:|blob:)/.test(texto)) return texto;
    if (texto.startsWith('idb:')) {
      return window.ModoEstatico ? window.ModoEstatico.urlDaImagem(texto) : '';
    }
    if (window.ModoEstatico && window.ModoEstatico.ativo()) {
      return window.ModoEstatico.urlDaImagem(texto);
    }
    if (texto.startsWith('/api/uploads/')) return texto;
    return '/api/imagem?url=' + encodeURIComponent(texto);
  }

  /** Aplica a imagem num <img>, guardando a referência para atualização posterior. */
  function aplicarImagem(elemento, caminho) {
    if (!elemento) return;
    elemento.dataset.referencia = caminho || '';
    const url = urlImagem(caminho);
    if (url) {
      elemento.src = url;
      elemento.classList.remove('oculto');
      elemento.classList.remove('vazia');
      elemento.alt = elemento.alt || 'Imagem';
    } else {
      elemento.removeAttribute('src');
      elemento.classList.add('oculto');
    }
  }

  /** Atualiza as imagens já na tela quando uma foto do navegador fica pronta. */
  function atualizarImagemLocal(referencia, url) {
    document.querySelectorAll('img[data-referencia]').forEach((elemento) => {
      if (elemento.dataset.referencia === referencia) {
        elemento.src = url;
        elemento.classList.remove('oculto');
        elemento.classList.remove('vazia');
      }
    });
  }

  /**
   * Identidade do site: quando public/marca/logo.png existe, ele substitui o
   * monograma "LP" no topo e na tela de entrada. Sem o arquivo, nada muda.
   */
  function mostrarLogoDaMarca() {
    const alvos = $$('.marca');
    if (!alvos.length) return;
    const url = CAMINHO_BASE + 'marca/logo.png';
    const sonda = new Image();
    sonda.onload = () => {
      // naturalWidth = 0 significa que o servidor devolveu outra coisa (não uma imagem)
      if (!sonda.naturalWidth) return;
      alvos.forEach((alvo) => {
        const imagem = $('.marca-logo', alvo);
        if (imagem) imagem.src = url;
        alvo.classList.add('tem-logo');
      });
    };
    sonda.onerror = () => {};
    sonda.src = url;
  }

  window.UI = {
    $, $$,
    caminhoBase: CAMINHO_BASE,
    mostrarLogoDaMarca,
    toast,
    avisarFotosIgnoradas,
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
    urlImagem,
    aplicarImagem,
    atualizarImagemLocal,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mostrarLogoDaMarca);
  } else {
    mostrarLogoDaMarca();
  }

  document.addEventListener('click', (evento) => {
    if (evento.target.closest('[data-fechar-modal]')) fecharModal();
  });
  document.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape') fecharModal();
  });
})();
