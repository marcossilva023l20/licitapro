#!/usr/bin/env node
'use strict';

/**
 * Ferramenta de linha de comando do banco de dados.
 *
 * O sistema aceita dois bancos — escolha pelo que você configurar:
 *   Supabase (Postgres)  → SUPABASE_URL + SUPABASE_SERVICE_KEY
 *   Firebase (Firestore) → JSON da conta de serviço (FIREBASE_SERVICE_ACCOUNT*)
 *
 * Uso (os dois nomes fazem o mesmo):
 *   npm run banco                   → confere a conexão e mostra o que está no banco
 *   npm run banco -- configurar     → pergunta a credencial e grava o .env (funciona nos dois)
 *   npm run banco -- enviar         → envia o data/db.json local para o banco
 *   npm run banco -- sql            → (só Supabase) mostra o SQL que cria as tabelas
 *   npm run banco -- politicas      → (só Supabase) SQL opcional da chave pública
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const RAIZ = path.join(__dirname, '..');
require(path.join(RAIZ, 'server', 'config')).carregarEnv();
const Supabase = require(path.join(RAIZ, 'server', 'supabase'));
const banco = require(path.join(RAIZ, 'server', 'banco'));
const store = require(path.join(RAIZ, 'server', 'store'));
// as credenciais do .env são gravadas pelo mesmo código que a tela do sistema usa
const credenciais = require(path.join(RAIZ, 'server', 'credenciais'));

const CAMINHO_SQL = path.join(RAIZ, 'supabase', 'esquema.sql');
const CAMINHO_POLITICAS = path.join(RAIZ, 'supabase', 'politicas-anon.sql');
// tabela do cofre: é por ela que o site sem servidor guarda os dados cifrados
const CAMINHO_NUVEM = path.join(RAIZ, 'supabase', 'nuvem.sql');
// onde ficam as credenciais (o ambiente pode apontar para outro arquivo: testes)
const CAMINHO_ENV = credenciais.caminhoEnv();

/**
 * Faz as perguntas de uma vez só (uma única sessão de leitura: fechar e abrir
 * de novo perderia o que já foi digitado quando a entrada vem por pipe).
 * Respostas com `oculto: true` não aparecem na tela — é o caso da chave.
 */
function perguntarTudo(perguntas) {
  return new Promise((resolver) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const escreverOriginal = process.stdout.write.bind(process.stdout);
    const respostas = [];
    let indice = 0;

    const proxima = () => {
      if (indice >= perguntas.length) {
        process.stdout.write = escreverOriginal;
        rl.close();
        resolver(respostas);
        return;
      }
      const pergunta = perguntas[indice];
      if (pergunta.oculto) {
        process.stdout.write(pergunta.texto);
        process.stdout.write = () => true; // silencia o eco do que é digitado
      }
      rl.question(pergunta.oculto ? '' : pergunta.texto, (resposta) => {
        process.stdout.write = escreverOriginal;
        if (pergunta.oculto) process.stdout.write('\n');
        respostas.push(String(resposta || '').trim());
        indice += 1;
        proxima();
      });
    };

    proxima();
  });
}

/** Pergunta a credencial, grava o .env e já confere a conexão. */
async function configurar() {
  const atual = banco.lerConfiguracao();
  const nomeAtual = atual.provedor ? banco.NOMES[atual.provedor] : null;
  console.log('\nConfigurando o banco de dados');
  console.log('-'.repeat(52));
  console.log('As credenciais ficam no arquivo ' + CAMINHO_ENV + ' (fora do Git).');
  if (nomeAtual) console.log('Hoje o sistema está usando: ' + nomeAtual + '.');
  console.log('');
  console.log('Cole UMA das duas coisas:');
  console.log('  · a chave do Supabase ......... Project Settings → API keys → service_role');
  console.log('  · o arquivo do Firebase ....... Project settings → Service accounts →');
  console.log('                                  "Generate new private key" (arraste o .json aqui)');
  console.log('Deixe em branco para manter o que já está configurado.\n');

  // procura sozinho o arquivo que o console do Firebase baixou: se achar, é só
  // apertar Enter (ou seja: a pessoa não precisa nem saber onde ele está)
  const achados = banco.procurarCredencialFirebase();
  const achado = achados[0];
  if (achado) {
    console.log('Encontrei um arquivo de conta de serviço do Firebase neste computador:');
    console.log('  ' + achado.arquivo + (achado.projeto ? '   (projeto ' + achado.projeto + ')' : ''));
    console.log('Aperte Enter na próxima pergunta para usar esse arquivo.\n');
  }

  const [endereco, segredo] = await perguntarTudo([
    { texto: 'Endereço do projeto Supabase [' + (Supabase.lerConfiguracao().url || Supabase.URL_PADRAO) + ']: ' },
    {
      texto: 'Chave do Supabase ou arquivo .json do Firebase' + (achado ? ' [Enter = ' + achado.nome + ']' : '') + ': ',
      oculto: true,
    },
  ]);
  const url = endereco || Supabase.lerConfiguracao().url || Supabase.URL_PADRAO;
  const informado = segredo || (achado ? achado.arquivo : '') || (atual.provedor === 'supabase' ? atual.chave : '');

  if (!informado) {
    console.log('\nNenhuma credencial informada — nada foi alterado.');
    console.log('Supabase: Project Settings → API keys → service_role (Reveal).');
    console.log('Firebase: Project settings → Service accounts → Generate new private key');
    console.log('  (não achei nenhum arquivo já baixado em Downloads/Desktop/pasta de dados).\n');
    process.exitCode = 1;
    return;
  }

  const detectado = banco.detectarCredencial(informado);
  if (!detectado.provedor) {
    console.log('\n' + detectado.erro);
    console.log('Dica: no Firebase, cole o caminho do arquivo baixado (ou arraste o arquivo para aqui).\n');
    process.exitCode = 1;
    return;
  }

  const gravado = banco.gravarCredencial({
    provedor: detectado.provedor,
    conteudo: detectado.conteudo,
    url: detectado.provedor === 'supabase' ? url : '',
  });
  console.log('\nCredencial do ' + banco.NOMES[gravado.provedor] + ' gravada em ' + gravado.arquivo + '.');

  if (detectado.provedor === 'supabase' && !Supabase.chaveDeServidor(detectado.conteudo)) {
    console.log('\nAtenção: essa é a chave pública (' + Supabase.classificarChave(detectado.conteudo) + ').');
    console.log('Ela só funciona se as políticas estiverem abertas (supabase/politicas-anon.sql).');
    console.log('O recomendado é usar a service_role — ela fica só aqui no servidor.');
  }

  await conferir();
}

function mostrarSql(arquivo) {
  console.log(fs.readFileSync(arquivo || CAMINHO_SQL, 'utf8'));
}

/** Diz qual banco/credencial está configurado e o que ele permite (sem acessar a rede). */
function mostrarChave() {
  const config = banco.lerConfiguracao();

  if (config.provedor === 'firebase') {
    console.log('  Banco: Firebase (Firestore) — projeto ' + config.projeto);
    console.log('  Conta de serviço: ' + (config.credenciais.email || '(sem e-mail no JSON)'));
    const aviso = banco.Firebase.orientacaoDaChave(config.credenciais);
    if (aviso) console.log('\n' + aviso.split('\n').map((l) => '  ' + l).join('\n'));
    return 'conta_de_servico';
  }

  const tipo = Supabase.classificarChave(config.chave);
  const rotulos = {
    service_role: 'chave de servidor (service_role) — acesso total, ignora o RLS',
    secret: 'secret key (sb_secret_...) — acesso total, ignora o RLS',
    anon: 'chave pública (anon) — só funciona com as políticas abertas',
    publishable: 'publishable key (sb_publishable_...) — só funciona com as políticas abertas',
    ausente: 'nenhuma chave informada',
    desconhecida: 'chave em formato não reconhecido',
  };
  console.log('  Banco: Supabase — ' + config.url);
  console.log('  Chave: ' + (rotulos[tipo] || tipo));
  const aviso = Supabase.orientacaoDaChave(config.chave);
  if (aviso) console.log('\n' + aviso.split('\n').map((l) => '  ' + l).join('\n'));
  return tipo;
}

function semCredenciais() {
  console.log('\nNenhum banco de dados está configurado.\n');
  console.log('Escolha um dos dois — os dois funcionam no sistema:\n');
  console.log('A) Supabase (Postgres)');
  console.log('   1. No painel do projeto: SQL Editor → cole ' + CAMINHO_SQL + ' → Run');
  console.log('      (veja todo o SQL com: npm run banco -- sql)');
  console.log('   2. Project Settings → API keys → service_role (Reveal)');
  console.log('\nB) Firebase (Firestore)');
  console.log('   1. No console: crie o projeto e abra "Firestore Database" → Create database');
  console.log('   2. Project settings → Service accounts → "Generate new private key"');
  console.log('\nPara gravar a credencial:');
  console.log('   npm run banco -- configurar');
  console.log('   (ou, com o sistema aberto em localhost, use o botão "Conectar banco de dados" no painel)\n');
}

/**
 * Conferência passo a passo: cada etapa diz "ok" ou onde parou e o que fazer.
 * É o caminho mais rápido para descobrir por que o sistema não está gravando
 * no banco.
 */
async function conferir() {
  const config = banco.lerConfiguracao();
  const arquivoEnv = CAMINHO_ENV;
  const nomeBanco = config.provedor ? banco.NOMES[config.provedor] : 'Supabase/Firebase';
  const passos = [];

  const marcar = (ok, titulo, detalhe) => {
    passos.push({ ok, titulo, detalhe });
    console.log(`  ${ok ? 'ok  ' : 'FALHA'} ${titulo}${detalhe ? '\n        ' + detalhe : ''}`);
  };

  console.log('\nConferindo o banco de dados (' + nomeBanco + ')\n' + '-'.repeat(52));

  // 1. arquivo .env
  marcar(true, 'Arquivo .env: ' + (fs.existsSync(arquivoEnv) ? 'encontrado' : 'não existe (usando variáveis de ambiente)'),
    fs.existsSync(arquivoEnv) ? arquivoEnv : 'Na hospedagem, as variáveis ficam no painel do serviço.');

  // 2. credencial
  if (!config.configurado) {
    marcar(false, 'Credencial do banco',
      'Nada configurado. Rode: npm run banco -- configurar (ou use o botão no painel do sistema).');
    return resumo(passos);
  }
  mostrarChave();
  if (config.provedor === 'supabase') {
    const tipo = Supabase.classificarChave(config.chave);
    marcar(
      Supabase.chaveDeServidor(config.chave),
      'Chave: ' + tipo,
      Supabase.orientacaoDaChave(config.chave) || 'Chave de servidor: pode ler e gravar sem depender das políticas.'
    );
  } else {
    marcar(true, 'Credencial: conta de serviço do Firebase',
      'Projeto ' + config.projeto + ' — ' + (config.credenciais.email || '(sem e-mail no JSON)'));
  }

  let cliente;
  try {
    cliente = banco.criarCliente();
  } catch (erro) {
    marcar(false, 'Cliente do banco', erro.message);
    return resumo(passos);
  }

  // 3. conexão
  try {
    await cliente.conferir();
    if (config.provedor === 'supabase') {
      marcar(true, 'Conexão e tabelas: ok (' + Object.values(Supabase.TABELAS).join(', ') + ')');
    } else {
      marcar(true, 'Conexão e coleções: ok (' + Object.values(banco.Firebase.TABELAS).join(', ') + ')');
    }
  } catch (erro) {
    let dica = banco.dicaParaErro(erro, config.provedor);
    if (/as tabelas ainda não existem/i.test(dica)) {
      dica += '\n        (veja todo o SQL com: npm run banco -- sql)';
    }
    marcar(false, 'Conexão com o banco', dica);
    return resumo(passos);
  }

  // 4. escrita de verdade: grava e apaga uma linha de teste
  try {
    await banco.testarGravacao(cliente);
    marcar(true, 'Gravação: ok (linha de teste criada e removida)');
  } catch (erro) {
    marcar(false, 'Gravação', 'O banco não aceitou gravar: ' + erro.message);
    return resumo(passos);
  }

  // 5. conteúdo
  let estado;
  try {
    estado = await banco.lerEstado(cliente);
  } catch (erro) {
    marcar(false, 'Leitura do conteúdo', banco.dicaParaErro(erro, config.provedor));
    return resumo(passos);
  }
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
          '        npm run banco -- enviar');
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
    console.log('Resultado: tudo certo — o sistema está gravando no banco.');
    console.log('No painel do sistema aparece "Banco de dados conectado".');
  }
  console.log('');
}

async function enviar() {
  const cliente = banco.criarCliente();
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
    console.log('\n' + '-'.repeat(64));
    console.log('Para o sistema publicado no GitHub Pages (sem servidor) guardar os dados');
    console.log('no seu projeto e abrir em qualquer computador, rode também este arquivo');
    console.log('no SQL Editor (uma vez):');
    console.log('-'.repeat(64) + '\n');
    mostrarSql(CAMINHO_NUVEM);
    return;
  }
  if (acao === 'politicas') {
    mostrarSql(CAMINHO_POLITICAS);
    return;
  }
  if (acao === 'nuvem') {
    mostrarSql(CAMINHO_NUVEM);
    return;
  }
  if (acao === 'configurar') {
    await configurar();
    return;
  }
  if (!banco.configurado() && acao !== 'configurar') {
    semCredenciais();
    process.exitCode = 1;
    return;
  }
  try {
    if (acao === 'enviar') await enviar();
    else if (acao === 'conferir') await conferir();
    else {
      console.error('Ação desconhecida: ' + acao + ' (use: conferir, configurar, enviar, sql, nuvem ou politicas)');
      process.exitCode = 1;
    }
  } catch (erro) {
    console.error('\nFalhou: ' + erro.message);
    console.error('  ' + banco.dicaParaErro(erro));
    console.error('  Confira tudo com: npm run banco');
    process.exitCode = 1;
  }
})();
