#!/usr/bin/env node
'use strict';

/**
 * Ferramenta de linha de comando do banco (Supabase).
 *
 * Uso:
 *   npm run supabase            → confere a conexão e mostra o que está no banco
 *   npm run supabase -- sql     → mostra o SQL que cria as tabelas
 *   npm run supabase -- enviar  → envia o data/db.json local para o banco
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

function mostrarSql() {
  console.log(fs.readFileSync(CAMINHO_SQL, 'utf8'));
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
    }
    process.exitCode = 1;
  }
})();
