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
const net = require('net');
const { UPLOADS_DIR, CACHE_IMG_DIR, garantirPastas } = require('./config');

const TIPOS_ACEITOS = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
const TAMANHO_MAXIMO = 8 * 1024 * 1024; // 8 MB
const TIMEOUT_MS = 15000;

/** Extrai o ID de um link do Google Drive. */
function idDoDrive(url) {
  const texto = String(url || '');
  const padroes = [
    /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]{10,})/,
    /drive\.google\.com\/open\?id=([a-zA-Z0-9_-]{10,})/,
    /drive\.google\.com\/uc\?[^#]*id=([a-zA-Z0-9_-]{10,})/,
    /drive\.usercontent\.google\.com\/download\?[^#]*id=([a-zA-Z0-9_-]{10,})/,
    /docs\.google\.com\/[^#]*[?&]id=([a-zA-Z0-9_-]{10,})/,
    /lh3\.googleusercontent\.com\/d\/([a-zA-Z0-9_-]{10,})/,
  ];
  for (const padrao of padroes) {
    const achou = texto.match(padrao);
    if (achou) return achou[1];
  }
  return null;
}

/** Transforma qualquer link de imagem conhecido numa URL direta de imagem. */
function urlDireta(url) {
  const texto = String(url || '').trim();
  if (!texto) return '';
  const id = idDoDrive(texto);
  if (id) return `https://lh3.googleusercontent.com/d/${id}=w1400`;
  return texto;
}

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
 * Prepara uma imagem para o gerador de PDF (que aceita {image: buffer|path}).
 * Retorna null quando a imagem não puder ser usada.
 */
async function prepararParaPdf(urlOuArquivo) {
  const texto = String(urlOuArquivo || '').trim();
  if (!texto) return null;

  if (texto.startsWith('/api/uploads/')) {
    const arquivo = path.basename(texto);
    const caminho = path.join(UPLOADS_DIR, arquivo);
    if (fs.existsSync(caminho)) return { imagem: caminho };
    return null;
  }

  if (texto.startsWith('data:image/')) return { imagem: texto };

  const baixada = await baixarImagem(texto);
  if (baixada) return { imagem: baixada.dados };
  return null;
}

module.exports = { idDoDrive, urlDireta, baixarImagem, prepararParaPdf, cabecalhoImagem, tipoPorExtensao };
