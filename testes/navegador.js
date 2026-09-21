'use strict';

/**
 * Teste de navegador (com jsdom): carrega a interface real no HTML do site,
 * faz login, cria uma proposta, adiciona item e salva — tudo contra o servidor
 * de verdade (sem somar dependências ao código de produção).
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');

const RAIZ = path.join(__dirname, '..');

function esperar(condicao, descricao, tempoMaximo = 10000) {
  return new Promise((resolve, reject) => {
    const inicio = Date.now();
    const tentar = () => {
      let ok = false;
      try {
        ok = condicao();
      } catch (_) {
        ok = false;
      }
      if (ok) return resolve(true);
      if (Date.now() - inicio > tempoMaximo) {
        return reject(new Error('Tempo esgotado esperando: ' + descricao));
      }
      setTimeout(tentar, 25);
    };
    tentar();
  });
}

async function subirServidor() {
  const app = require(path.join(RAIZ, 'server', 'index.js'));
  return new Promise((resolve) => {
    const servidor = app.iniciar(0, '127.0.0.1');
    servidor.on('listening', () => resolve(servidor));
  });
}

async function abrirNavegador(porta) {
  const { JSDOM } = require('jsdom');
  const html = fs.readFileSync(path.join(RAIZ, 'public', 'index.html'), 'utf8');
  const base = `http://127.0.0.1:${porta}/`;

  const dom = new JSDOM(html, { url: base, runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;

  // Stubs necessários fora do navegador
  let cookieJar = '';
  window.fetch = async (url, opcoes = {}) => {
    const config = Object.assign({}, opcoes);
    config.headers = Object.assign({}, opcoes.headers || {});
    if (cookieJar) config.headers.Cookie = cookieJar;
    config.redirect = 'manual';
    const resposta = await fetch(new URL(url, base).toString(), config);
    if (typeof resposta.headers.getSetCookie === 'function') {
      const cookies = resposta.headers.getSetCookie();
      if (cookies.length) cookieJar = cookies.map((c) => String(c).split(';')[0]).join('; ');
    }
    return resposta;
  };
  window.URL.createObjectURL = () => 'blob:previa-de-teste';
  window.URL.revokeObjectURL = () => {};
  window.Element.prototype.scrollIntoView = function () {};
  if (!window.HTMLElement.prototype.scrollTo) window.HTMLElement.prototype.scrollTo = function () {};
  window.addEventListener('error', () => {});

  ['shared/format.js', 'js/api.js', 'js/ui.js', 'js/editar.js', 'js/app.js', 'js/modo-estatico.js'].forEach((relativo) => {
    // a pasta shared/ fica na raiz do projeto e é servida em /shared
    const caminho = relativo.startsWith('shared/')
      ? path.join(RAIZ, relativo)
      : path.join(RAIZ, 'public', relativo);
    window.eval(fs.readFileSync(caminho, 'utf8'));
  });

  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  return { dom, window, cookieJarAtual: () => cookieJar };
}

/** Confere se todos os ids usados pelo JavaScript existem no HTML. */
function verificarIds(html) {
  const idsNoHtml = new Set(
    Array.from(html.matchAll(/\sid="([^"]+)"/g)).map((m) => m[1])
  );
  const criadosEmTempoDeExecucao = new Set([
    'importar-area', 'importar-arquivo', 'importar-resultado', 'importar-titulo',
    'importar-avisos', 'importar-tabela', 'importacao-todos', 'importacao-selecionados',
    // criados no modal de declarações (a seção Declarações, na tela inicial)
    'declaracao-modelo',
    // seção Declarações (painel) e os botões que levam até ela
    'declaracoes-lista', 'declaracoes-nova', 'declaracoes-salvar', 'declaracoes-contagem',
    'painel-declaracoes', 'docs-declaracoes',  ]);
  const faltando = [];
  ['js/app.js', 'js/editar.js', 'js/ui.js'].forEach((relativo) => {
    const codigo = fs.readFileSync(path.join(RAIZ, 'public', relativo), 'utf8');
    // apenas seletores fixos: $('#id') — seletores montados com "+" são criados em tempo de execução
    Array.from(codigo.matchAll(/\$\('#([a-zA-Z0-9_-]+)'\)/g)).forEach((m) => {
      const id = m[1];
      if (!idsNoHtml.has(id) && !criadosEmTempoDeExecucao.has(id)) faltando.push(`${relativo} → #${id}`);
    });
  });
  return Array.from(new Set(faltando));
}

module.exports = { esperar, subirServidor, abrirNavegador, verificarIds };
