'use strict';

/**
 * Testes do "modo local": o sistema rodando direto no navegador, sem servidor
 * (é assim que ele funciona no GitHub Pages ou aberto por file://).
 *
 * A página é montada no jsdom com os mesmos arquivos do site, e o fetch é
 * trocado por um que devolve HTML 404 — exatamente o que o GitHub Pages faz
 * quando alguém chama /api/....
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const RAIZ = path.join(__dirname, '..');

function esperar(condicao, descricao, tempoMaximo = 8000) {
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
      if (Date.now() - inicio > tempoMaximo) return reject(new Error('Tempo esgotado esperando: ' + descricao));
      setTimeout(tentar, 30);
    };
    tentar();
  });
}

/**
 * Lê um script local do site, resolvendo os caminhos como o navegador faria.
 * No GitHub Pages o repositório é publicado em /<nome-do-repo>/, então esse
 * prefixo é removido para encontrar o arquivo dentro do projeto.
 */
function lerRecurso(url, base) {
  const prefixo = base ? new URL(base).pathname.replace(/public\/?$/, '') : '/';
  const semPrefixo = url.startsWith(prefixo) ? url.slice(prefixo.length) : url.replace(/^\//, '');

  const candidatos = [
    path.join(RAIZ, semPrefixo),
    path.join(RAIZ, url.replace(/^\//, '')),
    path.join(RAIZ, 'public', url.replace(/^\//, '')),
  ];
  for (const candidato of candidatos) {
    if (fs.existsSync(candidato) && fs.statSync(candidato).isFile()) {
      return fs.readFileSync(candidato, 'utf8');
    }
  }
  return null;
}

/**
 * Abre o sistema no jsdom sem servidor algum.
 * @param {object} opcoes { base, arquivo }
 */
async function abrirSemServidor(opcoes = {}) {
  const base = opcoes.base || 'https://marcossilva023l20.github.io/licitapro/public/';
  const arquivo = opcoes.arquivo || 'public/index.html';
  const html = fs.readFileSync(path.join(RAIZ, arquivo), 'utf8');
  const consoleVirtual = new VirtualConsole();
  const erros = [];
  consoleVirtual.on('jsdomError', (erro) => erros.push(erro.message));
  consoleVirtual.on('error', (...args) => erros.push(args.join(' ')));

  const dom = new JSDOM(html, {
    url: base,
    runScripts: 'dangerously',
    resources: undefined,
    pretendToBeVisual: true,
    virtualConsole: consoleVirtual,
  });
  const { window } = dom;

  // Sem servidor: qualquer /api/... responde a página 404 do GitHub Pages (HTML).
  window.fetch = async (url) => {
    const endereco = String(url);
    const corpo = '<!DOCTYPE html><html><body>404 — There isn\'t a GitHub Pages site here.</body></html>';
    return new window.Response(corpo, {
      status: 404,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  };
  if (!window.Response) {
    window.Response = class ResponseFalsa {
      constructor(corpo, config) {
        this.corpo = corpo;
        this.status = (config && config.status) || 200;
        this.ok = this.status >= 200 && this.status < 300;
        this.headers = {
          get: (nome) => ((config && config.headers) || {})[String(nome).toLowerCase()] || null,
        };
      }
      async text() { return this.corpo; }
      async json() { return JSON.parse(this.corpo); }
      async blob() { return new window.Blob([this.corpo]); }
      async arrayBuffer() { return new window.TextEncoder().encode(this.corpo).buffer; }
    };
  }

  // O jsdom não busca scripts externos: aqui eles são lidos do projeto e
  // avaliados, exatamente como o navegador faria com os arquivos reais.
  const baseDoDocumento = () => window.document.baseURI || base;
  const appendOriginal = window.document.head.appendChild.bind(window.document.head);
  window.document.head.appendChild = function (elemento) {
    if (elemento && elemento.tagName === 'SCRIPT' && elemento.src) {
      const caminhoAbsoluto = new URL(elemento.src, baseDoDocumento()).pathname;
      const codigo = lerRecurso(caminhoAbsoluto, base);
      setTimeout(() => {
        if (!codigo) {
          elemento.dispatchEvent(new window.Event('error'));
          return;
        }
        try {
          window.eval(codigo);
          elemento.dispatchEvent(new window.Event('load'));
        } catch (erro) {
          erros.push('falha ao carregar ' + elemento.src + ': ' + erro.message);
          elemento.dispatchEvent(new window.Event('error'));
        }
      }, 0);
      return elemento;
    }
    return appendOriginal(elemento);
  };

  // Carrega os scripts locais na mesma ordem do index.html, resolvendo os
  // endereços relativos como o navegador faria (inclusive ../shared/...).
  const scripts = Array.from(html.matchAll(/<script src="([^"]+)"><\/script>/g)).map((m) => m[1]);
  for (const relativo of scripts) {
    const absoluto = new URL(relativo, baseDoDocumento()).pathname;
    const codigo = lerRecurso(absoluto, base);
    if (!codigo) {
      if (opcoes.ignorarFaltando) continue;
      throw new Error('Script não encontrado: ' + relativo + ' → ' + absoluto);
    }
    window.eval(codigo);
  }

  window.URL.createObjectURL = () => 'blob:modo-local';
  window.URL.revokeObjectURL = () => {};
  window.Element.prototype.scrollIntoView = function () {};
  window.HTMLElement.prototype.scrollTo = function () {};
  if (!window.indexedDB) {
    // IndexedDB não existe no jsdom: o modo local cai no fallback (data URL).
    window.indexedDB = undefined;
  }

  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  return { dom, window, erros, base };
}

/**
 * Cria um arquivo de planilha em memória (como o usuário enviaria pelo site).
 * Usa a mesma biblioteca XLSX do projeto e devolve um "arquivo" com a mesma
 * interface que o navegador oferece: name, type e arrayBuffer().
 */
function planilhaDeTeste(window) {
  const XLSX = require('xlsx');
  const linhas = [
    ['Numero_Item', 'Descricao_Edital', 'Unidade', 'Quantidade', 'Valor_Referencia', 'Preco_Custo', 'Preco_Venda', 'Marca_Modelo', 'Foto_Produto', 'Descricao_Catalogo', 'Link_da_compra'],
    [1, 'RÁDIO TRANSCEPTOR DIGITAL 48 CANAIS', 'UND', 6, '1.600,00', '1.150,00', 'R$ 1.490,00', 'Hytera / BP516', '', 'Rádio com 48 canais e bateria de 1500 mAh', 'https://loja.com/r'],
    [2, 'BATERIA EXTRA 1500 mAh', 'UND', 6, 320, 180, 249.9, 'Hytera / BL2016', '', 'Bateria de íons de lítio', ''],
  ];
  const livro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro, XLSX.utils.aoa_to_sheet(linhas), 'Itens');
  const dados = XLSX.write(livro, { bookType: 'xlsx', type: 'array' });
  // o navegador entrega um ArrayBuffer do próprio navegador: aqui a cópia
  // é feita no "reino" do jsdom para o teste ficar igual ao uso real.
  const bytes = new Uint8Array(dados);
  const copia = window ? new window.ArrayBuffer(bytes.byteLength) : new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copia).set(bytes);

  return {
    name: 'itens-teste.xlsx',
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    arrayBuffer: async () => copia,
  };
}

/** Simula um arquivo de backup escolhido pelo usuário. */
function arquivoDeBackup(conteudo) {
  return { name: 'licitapro-backup.json', text: async () => JSON.stringify(conteudo) };
}

module.exports = { abrirSemServidor, esperar, planilhaDeTeste, arquivoDeBackup, lerRecurso };
