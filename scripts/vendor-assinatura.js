#!/usr/bin/env node
'use strict';

/**
 * Gera o pacote de assinatura digital que o site usa no navegador:
 *   public/vendor/assinatura.min.js
 *
 * Por que um pacote (bundle) e não os arquivos soltos: a assinatura precisa de
 * pdf-lib (montar a folha de assinatura e o campo do AcroForm), node-forge
 * (abrir o .pfx/.p12 e montar o CMS/PKCS#7) e @signpdf (gravar a assinatura no
 * PDF). O site publicado no GitHub Pages só serve arquivos estáticos, então
 * essas bibliotecas viram um arquivo só, publicado junto com o resto.
 *
 * Uso:
 *   npm run pacote-assinatura          gera o arquivo
 *   npm run pacote-assinatura -- --verificar   falha se estiver desatualizado
 */

const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const RAIZ = path.join(__dirname, '..');
const ENTRADA = path.join(RAIZ, 'shared', 'assinatura-navegador.js');
const SAIDA = path.join(RAIZ, 'public', 'vendor', 'assinatura.min.js');
const VERIFICAR = process.argv.includes('--verificar');

async function gerar() {
  const resultado = await esbuild.build({
    entryPoints: [ENTRADA],
    bundle: true,
    minify: true,
    format: 'iife',
    target: ['es2020'],
    platform: 'browser',
    legalComments: 'none',
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'silent',
    write: false,
  });
  const conteudo = resultado.outputFiles[0].contents;
  return conteudo;
}

async function principal() {
  const conteudo = await gerar();
  const bytes = Buffer.from(conteudo);

  if (VERIFICAR) {
    const atual = fs.existsSync(SAIDA) ? fs.readFileSync(SAIDA) : Buffer.alloc(0);
    if (!atual.equals(bytes)) {
      console.error(
        'public/vendor/assinatura.min.js está desatualizado (' + atual.length + ' bytes no arquivo, ' +
          bytes.length + ' bytes agora). Rode: npm run pacote-assinatura'
      );
      process.exit(1);
    }
    console.log('public/vendor/assinatura.min.js está atualizado (' + bytes.length + ' bytes).');
    return;
  }

  fs.mkdirSync(path.dirname(SAIDA), { recursive: true });
  fs.writeFileSync(SAIDA, bytes);
  console.log('public/vendor/assinatura.min.js gerado (' + (bytes.length / 1024).toFixed(0) + ' KB).');
}

if (require.main === module) {
  principal().catch((erro) => {
    console.error('Falha ao gerar o pacote de assinatura:', erro.message);
    process.exit(1);
  });
}

module.exports = { gerar, principal, SAIDA, ENTRADA };
