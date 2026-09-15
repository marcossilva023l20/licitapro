'use strict';

/**
 * Resolução de imagens de produtos.
 * - Links de upload interno (/api/uploads/...) são lidos do disco.
 * - Links do Google Drive são convertidos em link direto de imagem.
 * - Outros links http(s) são baixados (com proteção contra acesso à rede interna)
 *   e guardados em cache para não depender do site de terceiros na hora do PDF.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dns = require('dns').promises;
const zlib = require('zlib');
const net = require('net');
const { UPLOADS_DIR, CACHE_IMG_DIR, garantirPastas } = require('./config');
const { idDoDrive, urlDireta } = require('../shared/imagens-links');

const TIPOS_ACEITOS = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
const TAMANHO_MAXIMO = 8 * 1024 * 1024; // 8 MB
const TIMEOUT_MS = 15000;

function cabecalhoImagem(arquivo) {
  garantirPastas();
  const caminho = path.join(UPLOADS_DIR, arquivo);
  const dados = fs.readFileSync(caminho);
  return { dados, caminho, tipo: tipoPorExtensao(arquivo) };
}

function tipoPorExtensao(arquivo) {
  const ext = path.extname(arquivo).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  return 'application/octet-stream';
}

function ehEnderecoInterno(ip) {
  if (!ip) return true;
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }
  const baixo = String(ip).toLowerCase();
  return baixo === '::1' || baixo.startsWith('fc') || baixo.startsWith('fd') || baixo.startsWith('fe80');
}

const cacheMemoria = new Map(); // chave -> {dados, tipo}

function chaveCache(url) {
  return crypto.createHash('sha1').update(url).digest('hex');
}

/** Baixa (ou lê do cache) uma imagem da internet. Retorna null quando não dá. */
async function baixarImagem(url, opcoes = {}) {
  const direta = urlDireta(url);
  if (!/^https?:\/\//i.test(direta)) return null;

  const chave = chaveCache(direta);
  if (cacheMemoria.has(chave)) return cacheMemoria.get(chave);

  garantirPastas();
  const arquivoCache = path.join(CACHE_IMG_DIR, chave);
  if (fs.existsSync(arquivoCache)) {
    const meta = fs.existsSync(`${arquivoCache}.json`)
      ? JSON.parse(fs.readFileSync(`${arquivoCache}.json`, 'utf8'))
      : { tipo: 'image/jpeg' };
    const resultado = { dados: fs.readFileSync(arquivoCache), tipo: meta.tipo };
    cacheMemoria.set(chave, resultado);
    return resultado;
  }

  try {
    const { URL } = require('url');
    const alvo = new URL(direta);
    if (!['http:', 'https:'].includes(alvo.protocol)) return null;

    // Proteção contra SSRF: não baixar de endereços internos.
    const enderecos = await dns.lookup(alvo.hostname, { all: true });
    if (!enderecos.length || enderecos.some((e) => ehEnderecoInterno(e.address))) {
      console.warn('[imagens] endereço bloqueado:', alvo.hostname);
      return null;
    }

    const controle = new AbortController();
    const tempo = setTimeout(() => controle.abort(), opcoes.timeout || TIMEOUT_MS);
    const resposta = await fetch(direta, {
      redirect: 'follow',
      signal: controle.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatível; LicitaPro)',
        Accept: 'image/*,*/*;q=0.8',
      },
    });
    clearTimeout(tempo);

    if (!resposta.ok) return null;
    const tipo = String(resposta.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!TIPOS_ACEITOS.includes(tipo)) return null;

    const tamanho = Number(resposta.headers.get('content-length') || 0);
    if (tamanho > TAMANHO_MAXIMO) return null;

    const buffer = Buffer.from(await resposta.arrayBuffer());
    if (buffer.length > TAMANHO_MAXIMO) return null;

    const resultado = { dados: buffer, tipo };
    if (opcoes.cachear !== false) {
      try {
        fs.writeFileSync(arquivoCache, buffer);
        fs.writeFileSync(`${arquivoCache}.json`, JSON.stringify({ tipo, url: direta, baixadoEm: new Date().toISOString() }));
      } catch (_) { /* cache é opcional */ }
    }
    cacheMemoria.set(chave, resultado);
    return resultado;
  } catch (erro) {
    console.warn('[imagens] falha ao baixar', direta, '-', erro.message);
    return null;
  }
}

/**
 * O gerador de PDF (pdfkit) só entende JPEG e PNG — e, no caso do PNG, um
 * arquivo corrompido não gera erro: derruba o processo (erro de zlib fora de
 * qualquer try/catch). Por isso os bytes são conferidos de verdade aqui:
 *   • JPEG: estrutura dos segmentos (SOI, SOF com dimensões, SOS e EOI);
 *   • PNG: assinatura, CRC de cada bloco e descompressão dos dados (IDAT),
 *     que é justamente a etapa que falhava.
 * Formatos que o PDF não aceita (GIF, WebP, HEIC, SVG...) devolvem false e a
 * foto sai como traço no documento, em vez de quebrar a geração.
 */

const TABELA_CRC = (() => {
  const tabela = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabela[n] = c;
  }
  return tabela;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) c = TABELA_CRC[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** JPEG: percorre os segmentos e confere se o arquivo está inteiro. */
function jpegIntegro(b) {
  if (b.length < 125 || b[0] !== 0xff || b[1] !== 0xd8) return false;
  let pos = 2;
  let temDimensoes = false;
  while (pos + 4 <= b.length) {
    if (b[pos] !== 0xff) return false;
    let marcador = b[pos + 1];
    while (marcador === 0xff && pos + 2 < b.length) {
      pos += 1;
      marcador = b[pos + 1];
    }
    if (marcador === 0xd8 || (marcador >= 0xd0 && marcador <= 0xd7) || marcador === 0x01) {
      pos += 2;
      continue;
    }
    if (marcador === 0xd9) return temDimensoes; // fim da imagem
    if (pos + 4 > b.length) return false;
    const tamanho = b.readUInt16BE(pos + 2);
    if (tamanho < 2 || pos + 2 + tamanho > b.length) return false;
    const comDimensoes =
      (marcador >= 0xc0 && marcador <= 0xc3) ||
      (marcador >= 0xc5 && marcador <= 0xc7) ||
      (marcador >= 0xc9 && marcador <= 0xcb) ||
      (marcador >= 0xcd && marcador <= 0xcf);
    if (comDimensoes) {
      const altura = b.readUInt16BE(pos + 5);
      const largura = b.readUInt16BE(pos + 7);
      if (!largura || !altura) return false;
      temDimensoes = true;
    }
    if (marcador === 0xda) {
      // início dos dados comprimidos: o arquivo precisa terminar com EOI (FFD9)
      for (let i = b.length - 2; i > pos + 2; i -= 1) {
        if (b[i] === 0xff && b[i + 1] === 0xd9) return temDimensoes;
      }
      return false;
    }
    pos += 2 + tamanho;
  }
  return false;
}

/** PNG: assinatura, CRC dos blocos e descompressão dos dados (pega o caso que derrubava o servidor). */
function pngIntegro(b) {
  if (b.length < 57) return false;
  const assinatura = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < 8; i += 1) if (b[i] !== assinatura[i]) return false;

  let pos = 8;
  let viuIHDR = false;
  let viuIEND = false;
  let largura = 0;
  let altura = 0;
  const blocosIDAT = [];

  while (pos + 12 <= b.length) {
    const tamanho = b.readUInt32BE(pos);
    if (tamanho > b.length) return false;
    const tipo = b.toString('latin1', pos + 4, pos + 8);
    const fimDados = pos + 8 + tamanho;
    if (fimDados + 4 > b.length) return false;
    if (crc32(b.subarray(pos + 4, fimDados)) !== b.readUInt32BE(fimDados)) return false;

    if (tipo === 'IHDR') {
      viuIHDR = true;
      largura = b.readUInt32BE(pos + 8);
      altura = b.readUInt32BE(pos + 12);
      if (!largura || !altura) return false;
    } else if (tipo === 'IDAT') {
      blocosIDAT.push(b.subarray(pos + 8, fimDados));
    } else if (tipo === 'IEND') {
      viuIEND = true;
      break;
    }
    pos = fimDados + 4;
  }

  if (!viuIHDR || !viuIEND || !blocosIDAT.length) return false;

  try {
    const dados = zlib.inflateSync(Buffer.concat(blocosIDAT));
    return dados.length > 0; // um PNG corrompido estoura aqui (era o que derrubava o processo)
  } catch (_) {
    return false;
  }
}

/** A imagem pode entrar no PDF? (JPEG ou PNG íntegros) */
function imagemIntegra(dados) {
  if (!dados || !dados.length) return false;
  const b = Buffer.isBuffer(dados) ? dados : Buffer.from(dados);
  if (b.length >= 2 && b[0] === 0xff && b[1] === 0xd8) return jpegIntegro(b);
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50) return pngIntegro(b);
  return false;
}

/** Compatibilidade: diz apenas se o formato é aceito (JPEG ou PNG). */
function formatoSuportado(dados) {
  if (!dados || !dados.length) return false;
  const b = Buffer.isBuffer(dados) ? dados : Buffer.from(dados);
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return true;
  if (b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return true;
  return false;
}

/** Extrai os bytes de um data URL ('' quando não for data URL de imagem). */
function bytesDoDataUrl(texto) {
  const casamento = /^data:image\/[a-z0-9.+-]+;base64,([\s\S]+)$/i.exec(String(texto || '').trim());
  if (!casamento) return null;
  try {
    return Buffer.from(casamento[1].replace(/\s/g, ''), 'base64');
  } catch (_) {
    return null;
  }
}

/**
 * Prepara uma imagem para o gerador de PDF (que aceita {image: buffer|path}).
 * Retorna null quando a imagem não puder ser usada.
 */
async function prepararParaPdf(urlOuArquivo) {
  const texto = String(urlOuArquivo || '').trim();
  if (!texto) return null;

  if (texto.startsWith('data:')) {
    const bytes = bytesDoDataUrl(texto);
    if (!bytes) return null; // gif, webp, heic, svg...
    if (!imagemIntegra(bytes)) {
      console.warn('[imagens] imagem embutida inválida — ignorada no PDF.');
      return null;
    }
    return { imagem: texto };
  }

  if (texto.startsWith('/api/uploads/')) {
    const arquivo = path.basename(texto);
    const caminho = path.join(UPLOADS_DIR, arquivo);
    if (!fs.existsSync(caminho)) return null;
    if (!imagemIntegra(fs.readFileSync(caminho))) {
      console.warn('[imagens] arquivo enviado inválido — ignorado no PDF:', arquivo);
      return null;
    }
    return { imagem: caminho };
  }

  const baixada = await baixarImagem(texto);
  if (baixada) {
    if (imagemIntegra(baixada.dados)) return { imagem: baixada.dados };
    console.warn('[imagens] imagem baixada inválida ou em formato não aceito:', texto.slice(0, 80));
  }
  return null;
}

module.exports = {
  idDoDrive, urlDireta, baixarImagem, prepararParaPdf, cabecalhoImagem, tipoPorExtensao,
  formatoSuportado, imagemIntegra, bytesDoDataUrl, jpegIntegro, pngIntegro,
};
