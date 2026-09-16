#!/usr/bin/env node
'use strict';

/**
 * Ferramenta de linha de comando do banco (Supabase).
 *
 * Uso:
 *   npm run supabase              → confere a conexão e mostra o que está no banco
 *   npm run supabase -- sql       → mostra o SQL que cria as tabelas
 *   npm run supabase -- politicas → mostra o SQL (opcional) de liberar a chave pública
 *   npm run supabase -- enviar    → envia o data/db.json local para o banco
 *
 * As credenciais vêm do ambiente (ou do arquivo .env na raiz):
 *   SUPABASE_URL=...  SUPABASE_SERVICE_KEY=...
 */

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
require(path.join(RAIZ, 'server', 'config')).carregarEnv();
const Supabase = require(path.join(RAIZ, 'server', 'supabase'));
const store = require(path.join(RAIZ, 'server', 'store'));

const CAMINHO_SQL = path.join(RAIZ, 'supabase', 'esquema.sql');
const CAMINHO_POLITICAS = path.join(RAIZ, 'supabase', 'politicas-anon.sql');

function mostrarSql(arquivo) {
  console.log(fs.readFileSync(arquivo || CAMINHO_SQL, 'utf8'));
}

/** Diz qual chave está configurada e o que ela permite (sem acessar a rede). */
function mostrarChave() {
  const config = Supabase.lerConfiguracao();
  const tipo = Supabase.classificarChave(config.chave);
  const rotulos = {
    service_role: 'chave de servidor (service_role) — acesso total, ignora o RLS',
    secret: 'secret key (sb_secret_...) — acesso total, ignora o RLS',
    anon: 'chave pública (anon) — só funciona com as políticas abertas',
    publishable: 'publishable key (sb_publishable_...) — só funciona com as políticas abertas',
    ausente: 'nenhuma chave informada',
    desconhecida: 'chave em formato não reconhecido',
  };
  console.log('  Chave: ' + (rotulos[tipo] || tipo));
  const aviso = Supabase.orientacaoDaChave(config.chave);
  if (aviso) console.log('\n' + aviso.split('\n').map((l) => '  ' + l).join('\n'));
  return tipo;
}

function semCredenciais() {
  console.log('\nO Supabase ainda não está configurado.\n');
  console.log('1. Abra o seu projeto no Supabase → SQL Editor e rode o arquivo:');
  console.log('   ' + CAMINHO_SQL + '   (veja também: npm run supabase -- sql)');
  console.log('2. Informe as credenciais do projeto (Project Settings → Data API / API keys):');
  console.log('   SUPABASE_URL=https://xxxxxxxx.supabase.co');
  console.log('   SUPABASE_SERVICE_KEY=...   (service_role — só no servidor)');
  console.log('\nNo seu computador, crie um arquivo .env na raiz com essas duas linhas.');
  console.log('Na hospedagem (Render/Railway/Docker), cadastre as duas variáveis.\n');
}

/**
 * Conferência passo a passo: cada etapa diz "ok" ou onde parou e o que fazer.
 * É o caminho mais rápido para descobrir por que o sistema não está gravando
 * no banco.
 */
async function conferir() {
  const config = Supabase.lerConfiguracao();
  const arquivoEnv = path.join(RAIZ, '.env');
  const passos = [];

  const marcar = (ok, titulo, detalhe) => {
    passos.push({ ok, titulo, detalhe });
    console.log(`  ${ok ? 'ok  ' : 'FALHA'} ${titulo}${detalhe ? '\n        ' + detalhe : ''}`);
  };

  console.log('\nConferindo o banco de dados (Supabase)\n' + '-'.repeat(52));

  // 1. arquivo .env
  marcar(true, 'Arquivo .env: ' + (fs.existsSync(arquivoEnv) ? 'encontrado' : 'não existe (usando variáveis de ambiente)'),
    fs.existsSync(arquivoEnv) ? arquivoEnv : 'Na hospedagem, as variáveis ficam no painel do serviço.');

  // 2. endereço e chave
  if (!config.configurado) {
    marcar(false, 'Credenciais do projeto', 'Informe SUPABASE_URL e SUPABASE_SERVICE_KEY (veja .env.example).');
    return resumo(passos);
  }
  marcar(true, 'Endereço do projeto: ' + config.url);
  const tipo = Supabase.classificarChave(config.chave);
  marcar(
    Supabase.chaveDeServidor(config.chave),
    'Chave: ' + tipo,
    Supabase.orientacaoDaChave(config.chave) || 'Chave de servidor: pode ler e gravar sem depender das políticas.'
  );

  const cliente = Supabase.criarCliente();

  // 3. conexão
  try {
    await cliente.conferir();
    marcar(true, 'Conexão e tabelas: ok (' + Object.values(Supabase.TABELAS).join(', ') + ')');
  } catch (erro) {
    const faltandoTabela = /relation|does not exist|42P01/i.test(erro.message);
    const semPermissao = /401|403|permission denied|row-level security/i.test(erro.message);
    const semRede = /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|fetch failed|timeout/i.test(erro.message);
    let dica;
    if (faltandoTabela) {
      dica = 'As tabelas ainda não existem neste projeto: rode supabase/esquema.sql no SQL Editor.\n' +
             '        (veja todo o SQL com: npm run supabase -- sql)';
    } else if (semPermissao) {
      dica = 'O banco recusou a chave. Confira se ela é a service_role (ou sb_secret_...)\n' +
             '        ou rode supabase/politicas-anon.sql se quiser usar a chave pública.';
    } else if (semRede) {
      dica = 'Não há conexão com o Supabase a partir daqui: verifique a internet/proxy\n' +
             '        (e se o SUPABASE_URL está certo).';
    } else {
      dica = 'Detalhe: ' + erro.message;
    }
    marcar(false, 'Conexão e tabelas', dica);
    return resumo(passos);
  }

  // 4. escrita de verdade: grava e apaga uma linha de teste
  try {
    const agora = new Date().toISOString();
    await cliente.salvar('licitapro_sequencia', [{ chave: '__teste__', por_ano: {}, atualizado_em: agora }], 'chave');
    await cliente.apagar('licitapro_sequencia', 'chave=eq.__teste__');
    marcar(true, 'Gravação: ok (linha de teste criada e removida)');
  } catch (erro) {
    marcar(false, 'Gravação', 'O banco não aceitou gravar: ' + erro.message);
    return resumo(passos);
  }

  // 5. conteúdo
  const estado = await Supabase.lerEstado(cliente);
  const empresa = (estado.perfil && estado.perfil.empresa) || {};
  marcar(true, 'Empresa cadastrada no banco: ' + (empresa.razaoSocial || empresa.nomeFantasia || '(nenhuma ainda)'));
  marcar(true, 'Documentos no banco: ' + estado.documentos.length);
  marcar(true, 'Numeração: ' + (Object.keys(estado.sequencia || {}).length ? 'ok' : 'vazia'));

  const local = path.join(RAIZ, 'data', 'db.json');
  if (fs.existsSync(local)) {
    try {
      const dados = JSON.parse(fs.readFileSync(local, 'utf8'));
      const quantidade = (dados.documentos || []).length;
      if (quantidade !== estado.documentos.length) {
        marcar(false, 'Cópia local diferente do banco',
          'data/db.json tem ' + quantidade + ' documento(s) e o banco tem ' + estado.documentos.length + '.\n' +
          '        Ao subir o sistema, os dois são unidos (nada é perdido). Para enviar agora:\n' +
          '        npm run supabase -- enviar');
      } else {
        marcar(true, 'Cópia local: em dia com o banco');
      }
    } catch (_) { /* arquivo ilegível: o sistema avisa ao subir */ }
  }

  return resumo(passos);
}

function resumo(passos) {
  const falhas = passos.filter((p) => !p.ok).length;
  console.log('-'.repeat(52));
  if (falhas) {
    console.log('Resultado: ' + falhas + ' problema(s) acima — o sistema está salvando no arquivo');
    console.log('local (data/db.json) enquanto isso. O painel do sistema mostra o mesmo aviso.');
  } else {
    console.log('Resultado: tudo certo — o sistema está gravando no banco Supabase.');
    console.log('No painel do sistema aparece "Banco de dados conectado (Supabase)".');
  }
  console.log('');
}

async function enviar() {
  const cliente = Supabase.criarCliente();
  const caminho = path.join(RAIZ, 'data', 'db.json');
  if (!fs.existsSync(caminho)) {
    console.error('\nNão encontrei ' + caminho + ' — nada para enviar.\n');
    process.exitCode = 1;
    return;
  }
  store.carregar();
  store.usarRemoto(cliente);
  const enviado = await store.carregarRemoto(); // banco vazio → semeia com o arquivo
  await store.encerrar();
  const banco = store.carregar();
  console.log('\nEnvio concluído: ' + banco.documentos.length + ' documento(s) no banco.');
  if (!enviado) console.log('(o banco já tinha dados; o conteúdo local foi mantido como cópia)');
  console.log('');
}

const acao = (process.argv[2] || 'conferir').toLowerCase();

(async () => {
  if (acao === 'sql') {
    mostrarSql();
    return;
  }
  if (acao === 'politicas') {
    mostrarSql(CAMINHO_POLITICAS);
    return;
  }
  if (!Supabase.configurado()) {
    semCredenciais();
    process.exitCode = 1;
    return;
  }
  try {
    if (acao === 'enviar') await enviar();
    else if (acao === 'conferir') await conferir();
    else {
      console.error('Ação desconhecida: ' + acao + ' (use: conferir, sql ou enviar)');
      process.exitCode = 1;
    }
  } catch (erro) {
    console.error('\nFalhou: ' + erro.message);
    if (/relation|does not exist|42P01/i.test(erro.message)) {
      console.error('As tabelas parecem não existir ainda. Rode o SQL no Supabase:');
      console.error('   npm run supabase -- sql');
    } else if (/401|403|permission denied|row-level security|JWT/i.test(erro.message)) {
      console.error('O banco recusou a chave configurada (RLS). Confira:');
      console.error('   npm run supabase -- conferir   (mostra o tipo da chave)');
    } else if (/ENOTFOUND|EAI_AGAIN|fetch failed|timeout/i.test(erro.message)) {
      console.error('Não consegui falar com o Supabase — confira o SUPABASE_URL e a internet.');
    }
    process.exitCode = 1;
  }
})();
