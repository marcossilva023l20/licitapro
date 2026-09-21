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

function esperar(condicao, descricao, tempoMaximo = 15000) {
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

  // Abrir "numa nova aba": o navegador entrega o mesmo armazenamento da visita
  // anterior (é o que o usuário espera quando salva e volta depois).
  Object.entries(opcoes.armazenamento || {}).forEach(([chave, valor]) => {
    window.localStorage.setItem(chave, valor);
  });

  // Gancho para os testes prepararem o "navegador" antes do sistema carregar
  // (por exemplo: um armazenamento que recusa gravações, como na janela privada).
  if (typeof opcoes.preparar === 'function') opcoes.preparar(window);

  // O jsdom não traz WebCrypto: aqui entra o do Node, igual ao que o navegador
  // oferece em https (o modo nuvem cifra os dados antes de enviar).
  if (!window.crypto || !window.crypto.subtle) {
    Object.defineProperty(window, 'crypto', { configurable: true, value: require('crypto').webcrypto });
  }

  // Sem servidor: qualquer /api/... responde a página 404 do GitHub Pages (HTML).
  // Endereços listados em `externo` (o Supabase de mentira dos testes) saem de
  // verdade pela rede — é assim que dá para testar a nuvem de ponta a ponta.
  const externos = (opcoes.externo || []).map((endereco) => String(endereco).replace(/\/+$/, ''));
  window.fetch = async (url, configuracao) => {
    const endereco = String(url);
    if (externos.some((prefixo) => endereco.startsWith(prefixo))) {
      return fetch(endereco, configuracao);
    }
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

  // cada object URL fica associado ao blob, para os testes poderem dizer
  // exatamente qual imagem deve falhar ao abrir
  const blobsFalsos = new Map();
  let contadorBlobs = 0;
  window.URL.createObjectURL = (blob) => {
    const url = 'blob:falso-' + (contadorBlobs += 1);
    blobsFalsos.set(url, blob);
    return url;
  };
  window.URL.revokeObjectURL = () => {};
  window.Element.prototype.scrollIntoView = function () {};
  window.HTMLElement.prototype.scrollTo = function () {};
  if (!window.indexedDB) {
    // IndexedDB não existe no jsdom: o modo local cai no fallback (data URL).
    window.indexedDB = undefined;
  }

  /**
   * Fechar a aba como o navegador faz: a página é avisada (`pagehide`) e os
   * timers pendentes morrem ali mesmo. Sem isso o jsdom continuaria rodando
   * coisas depois do "fechamento" e os testes passariam a mentir — foi assim
   * que um envio que nunca chegava no navegador aparecia como sucesso aqui.
   */
  const setTimeoutOriginal = window.setTimeout.bind(window);
  const clearTimeoutOriginal = window.clearTimeout.bind(window);
  const timers = new Set();
  window.setTimeout = (fn, ms, ...args) => {
    const id = setTimeoutOriginal((...a) => {
      timers.delete(id);
      if (typeof fn === 'function') fn(...a);
    }, ms, ...args);
    timers.add(id);
    return id;
  };
  window.clearTimeout = (id) => {
    timers.delete(id);
    return clearTimeoutOriginal(id);
  };
  const fecharOriginal = window.close.bind(window);
  window.close = () => {
    try {
      window.dispatchEvent(new window.Event('pagehide'));
    } catch (_) {
      /* a página não quis nem saber: seguimos com o fechamento */
    }
    timers.forEach((id) => clearTimeoutOriginal(id));
    timers.clear();
    return fecharOriginal();
  };

  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  return { dom, window, erros, base, blobsFalsos };
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

// ------------------------------------------------------------ imagens de teste

/** CRC32 usado nos blocos do PNG (mesma conta do servidor). */
function crc32(buffer) {
  const tabela = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })();
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) c = tabela[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function blocoPng(tipo, dados) {
  const tamanho = Buffer.alloc(4);
  tamanho.writeUInt32BE(dados.length, 0);
  const corpo = Buffer.concat([Buffer.from(tipo, 'latin1'), dados]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(corpo), 0);
  return Buffer.concat([tamanho, corpo, crc]);
}

/**
 * Monta um PNG válido de verdade (assinatura, blocos com CRC e dados
 * comprimidos), sem depender de nenhum arquivo binário no repositório.
 */
function pngValido(largura = 4, altura = 4) {
  const zlib = require('zlib');
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largura, 0);
  ihdr.writeUInt32BE(altura, 4);
  ihdr[8] = 8;  // 8 bits por canal
  ihdr[9] = 2;  // RGB
  const linhas = [];
  for (let y = 0; y < altura; y += 1) {
    const linha = Buffer.alloc(1 + largura * 3);
    for (let x = 0; x < largura; x += 1) {
      linha[1 + x * 3] = 15;
      linha[2 + x * 3] = 118;
      linha[3 + x * 3] = 110;
    }
    linhas.push(linha);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    blocoPng('IHDR', ihdr),
    blocoPng('IDAT', zlib.deflateSync(Buffer.concat(linhas))),
    blocoPng('IEND', Buffer.alloc(0)),
  ]);
}

/** PNG com a estrutura certa mas dados corrompidos (era o que derrubava o servidor). */
function pngCorrompido() {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
    'base64'
  );
}

function dataUrlPng(dados) {
  return 'data:image/png;base64,' + Buffer.from(dados).toString('base64');
}

/**
 * Faz o jsdom "saber" abrir imagens (ele não decodifica nada por conta própria).
 * Permite testar o caminho feliz num ambiente onde a imagem realmente carrega.
 */
function simularImagens(window, opcoes = {}) {
  // aceita true/false ou uma função que decide por imagem (cuidado: Boolean(fn) é true)
  const porEndereco = opcoes.falhar === undefined ? false : opcoes.falhar;
  const blobs = opcoes.blobs || null;   // mapa endereço -> blob (de abrirSemServidor)
  const ruins = opcoes.ruins || [];     // blobs que devem falhar ao abrir

  class ImagemFalsa {
    constructor() {
      this.onload = null;
      this.onerror = null;
      this.width = 60;
      this.height = 40;
    }

    set src(valor) {
      this._src = valor;
      setTimeout(() => {
        let deveFalhar;
        if (blobs && blobs.has(valor)) deveFalhar = ruins.includes(blobs.get(valor));
        else deveFalhar = typeof porEndereco === 'function' ? porEndereco(valor) : porEndereco;
        if (deveFalhar) {
          if (this.onerror) this.onerror(new window.Event('error'));
        } else if (this.onload) {
          this.onload(new window.Event('load'));
        }
      }, 0);
    }

    get src() {
      return this._src;
    }
  }
  window.Image = ImagemFalsa;
  return window;
}

/** Simula um arquivo de backup escolhido pelo usuário. */
function arquivoDeBackup(conteudo) {
  return { name: 'licitapro-backup.json', text: async () => JSON.stringify(conteudo) };
}

module.exports = {
  abrirSemServidor, esperar, planilhaDeTeste, arquivoDeBackup, lerRecurso,
  pngValido, pngCorrompido, dataUrlPng, simularImagens, crc32,
};
