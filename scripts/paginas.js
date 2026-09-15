#!/usr/bin/env node
'use strict';

/**
 * Gera o index.html que o GitHub Pages exibe na raiz do site.
 *
 * O GitHub Pages só publica arquivos estáticos: não existe servidor Node lá.
 * Para o endereço do Pages abrir o sistema de verdade (e não um cartão de
 * apresentação), a página é a mesma do sistema — apenas com <base href="public/">
 * para que css/, js/, vendor/ e ../shared/ sejam encontrados no repositório.
 * Sem servidor, o site entra no "modo local" (veja public/js/modo-estatico.js).
 *
 * Uso:
 *   node scripts/paginas.js             grava o index.html da raiz
 *   node scripts/paginas.js --verificar falha se estiver desatualizado (testes/CI)
 */

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const ORIGEM = path.join(RAIZ, 'public', 'index.html');
const DESTINO = path.join(RAIZ, 'index.html');

const AVISO = [
  '<!--',
  '  ATENÇÃO: arquivo gerado por scripts/paginas.js — não edite à mão.',
  '  É a página do sistema (public/index.html) preparada para o GitHub Pages,',
  '  que publica apenas arquivos estáticos. O <base href="public/"> faz o',
  '  navegador procurar css/, js/, vendor/ e ../shared/ no lugar certo.',
  '  Para alterar, edite public/index.html e rode: npm run paginas',
  '-->',
].join('\n');

/** Monta o conteúdo do index.html da raiz a partir da página do sistema. */
function gerar() {
  const sistema = fs.readFileSync(ORIGEM, 'utf8');

  if (!/<head>/i.test(sistema)) throw new Error('public/index.html sem <head>.');
  if (/<base\s/i.test(sistema)) throw new Error('public/index.html já tem <base> — remova para não duplicar.');

  return sistema
    .replace('<head>', '<head>\n' + AVISO + '\n  <base href="public/" />\n  <meta name="licitapro-sobre" content="apresentacao.html" />');
}

function principal() {
  const conteudo = gerar();
  const atual = fs.existsSync(DESTINO) ? fs.readFileSync(DESTINO, 'utf8') : '';

  if (process.argv.includes('--verificar')) {
    if (atual !== conteudo) {
      console.error('index.html da raiz está desatualizado. Rode: npm run paginas');
      process.exit(1);
    }
    console.log('index.html da raiz está atualizado (GitHub Pages abre o sistema).');
    return;
  }

  if (atual === conteudo) {
    console.log('index.html da raiz já estava atualizado.');
    return;
  }
  fs.writeFileSync(DESTINO, conteudo);
  console.log('index.html da raiz gerado (' + conteudo.length + ' bytes).');
}

if (require.main === module) principal();

module.exports = { gerar, ORIGEM, DESTINO };
