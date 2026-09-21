#!/usr/bin/env node
'use strict';

/**
 * Gera public/vendor/times-afm.js com as métricas da família Times.
 *
 * O PDF usa a fonte padrão "Times" (Times-Roman/Times-Bold/Times-Italic),
 * que é o equivalente do Times New Roman e dispensa embutir o arquivo da
 * fonte — o PDF fica pequeno e abre igual em qualquer leitor.
 *
 * No servidor essas métricas vêm do disco (node_modules/pdfkit/js/data).
 * No navegador (modo local) elas precisam estar dentro do "sistema de
 * arquivos virtual" do pdfmake, e é isso que este arquivo faz.
 *
 * Uso: node scripts/fontes-padrao.js
 */

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const ORIGEM = path.join(RAIZ, 'node_modules', 'pdfkit', 'js', 'data');
const DESTINO = path.join(RAIZ, 'public', 'vendor', 'times-afm.js');

const ARQUIVOS = ['Times-Roman.afm', 'Times-Bold.afm', 'Times-Italic.afm', 'Times-BoldItalic.afm'];

function gerar() {
  // O "sistema de arquivos virtual" do pdfmake no navegador espera os
  // conteúdos em base64 (é assim que o vfs_fonts.js entrega o Roboto).
  const metricas = ARQUIVOS.map((nome) => {
    const caminho = path.join(ORIGEM, nome);
    if (!fs.existsSync(caminho)) {
      throw new Error('Não encontrei ' + caminho + '. Rode npm install antes.');
    }
    const base64 = fs.readFileSync(caminho).toString('base64');
    return "    'data/" + nome + "': " + JSON.stringify(base64);
  });

  return [
    '/*',
    ' * Métricas da família Times (Adobe) usadas pelo pdfmake no navegador.',
    ' * Gerado por scripts/fontes-padrao.js — não edite à mão.',
    ' *',
    ' * O gerador de PDF trabalha com a fonte padrão "Times" (Times-Roman,',
    ' * Times-Bold, Times-Italic), equivalente ao Times New Roman: o PDF não',
    ' * precisa embutir o arquivo da fonte e abre igual em qualquer leitor.',
    ' */',
    '(function () {',
    '  var alvo = window.pdfMake;',
    '  if (!alvo) return;',
    '  var metricas = {',
    metricas.join(',\n'),
    '  };',
    '  if (typeof alvo.addVirtualFileSystem === "function") {',
    '    alvo.addVirtualFileSystem(metricas);',
    '  } else {',
    '    alvo.vfs = alvo.vfs || {};',
    '    Object.keys(metricas).forEach(function (chave) { alvo.vfs[chave] = metricas[chave]; });',
    '  }',
    '  if (typeof alvo.addFonts === "function") {',
    '    alvo.addFonts({',
    '      "Times New Roman": {',
    '        normal: "Times-Roman",',
    '        bold: "Times-Bold",',
    '        italics: "Times-Italic",',
    '        bolditalics: "Times-BoldItalic"',
    '      }',
    '    });',
    '  }',
    '})();',
    '',
  ].join('\n');
}

function principal() {
  const conteudo = gerar();
  const atual = fs.existsSync(DESTINO) ? fs.readFileSync(DESTINO, 'utf8') : '';
  if (atual === conteudo) {
    console.log('public/vendor/times-afm.js já estava atualizado.');
    return;
  }
  fs.writeFileSync(DESTINO, conteudo);
  console.log('public/vendor/times-afm.js gerado (' + Math.round(conteudo.length / 1024) + ' KB).');
}

if (require.main === module) principal();

module.exports = { gerar, DESTINO };
