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

async function conferir() {
  const config = Supabase.lerConfiguracao();
  const cliente = Supabase.criarCliente();
  console.log('\nSupabase: ' + config.url);
  mostrarChave();
  await cliente.conferir();
  const estado = await Supabase.lerEstado(cliente);
  const empresa = (estado.perfil && estado.perfil.empresa) || {};
  console.log('  Conexão: ok (tabelas encontradas)');
  console.log('  Empresa: ' + (empresa.razaoSocial || empresa.nomeFantasia || '(não cadastrada)'));
  console.log('  Documentos: ' + estado.documentos.length);
  const anos = Object.values(estado.sequencia || {}).length;
  console.log('  Numeração: ' + (anos ? 'ok' : 'vazia'));
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
