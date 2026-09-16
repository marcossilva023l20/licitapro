'use strict';

/**
 * Escolhe o banco em uso — Supabase (Postgres) ou Firebase (Firestore) — e
 * guarda a credencial do escolhido.
 *
 * Todo o resto do sistema fala só com este módulo, então dá para trocar de banco
 * mudando as credenciais, sem mexer no site: o que não pode é haver os dois
 * configurados ao mesmo tempo (o Supabase tem prioridade).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const { DATA_DIR } = require('./config');
const credenciais = require('./credenciais');
const Supabase = require('./supabase');
const Firebase = require('./firebase');

/** Nome bonito de cada banco (aparece na tela e na linha de comando). */
const NOMES = { supabase: 'Supabase', firebase: 'Firebase' };

/** Onde o JSON da conta de serviço do Firebase fica no seu computador. */
const ARQUIVO_FIREBASE = Firebase.ARQUIVO_PADRAO;

/** Tamanho máximo de um JSON de credencial (o do Firebase tem ~2,5 KB). */
const TAMANHO_MAXIMO_CREDENCIAL = 65536;

/** Qual banco está configurado (sem tocar na rede). */
function escolhido(env) {
  const ambiente = env || process.env;
  if (Supabase.configurado(ambiente)) return { nome: 'supabase', modulo: Supabase };
  if (Firebase.configurado(ambiente)) return { nome: 'firebase', modulo: Firebase };
  return { nome: null, modulo: null };
}

function nome(env) {
  return escolhido(env).nome;
}

function configurado(env) {
  return Boolean(escolhido(env).nome);
}

/** O módulo do banco escolhido (é ele que tem criarCliente/lerEstado). */
function provedor(env) {
  const escolha = escolhido(env);
  if (!escolha.modulo) {
    throw new Error(
      'Nenhum banco configurado: informe o Supabase (SUPABASE_URL + SUPABASE_SERVICE_KEY) ' +
        'ou o Firebase (JSON da conta de serviço em FIREBASE_SERVICE_ACCOUNT).'
    );
  }
  return escolha.modulo;
}

/** Configuração normalizada, com o nome do banco junto. */
function lerConfiguracao(env) {
  const escolha = escolhido(env);
  if (!escolha.modulo) return { provedor: null, configurado: false, url: '', endereco: '', chave: '' };
  const config = escolha.modulo.lerConfiguracao(env);
  return Object.assign({ provedor: escolha.nome, endereco: config.url }, config);
}

/**
 * Endereço que o formulário do painel já vem preenchido: é o do Supabase (o
 * Firebase não usa endereço — quem manda é o JSON da conta de serviço).
 */
function enderecoPadrao(env) {
  const ambiente = env || process.env;
  return Supabase.lerConfiguracao(ambiente).url || Supabase.URL_PADRAO;
}

function criarCliente(opcoes) {
  const config = opcoes || {};
  const modulo = config.modulo || provedor(config.env);
  return modulo.criarCliente(config);
}

// ------------------------------------------------------- estado na nuvem

/** Lê o estado (perfil, documentos e numeração) do banco em uso. */
function lerEstado(cliente) {
  return (cliente && cliente.provedor === 'firebase' ? Firebase : Supabase).lerEstado(cliente);
}

/** Envia o estado para o banco em uso. */
function gravarEstado(cliente, estado, removerIds) {
  return (cliente && cliente.provedor === 'firebase' ? Firebase : Supabase).gravarEstado(
    cliente,
    estado,
    removerIds
  );
}

// -------------------------------------------------------------- recados

/** Dica do que fazer com o erro do banco (usa o banco configurado como referência). */
function dicaParaErro(erro, nomeProvedor) {
  if (nomeProvedor === 'firebase') return Firebase.dicaParaErro(erro);
  if (nomeProvedor === 'supabase') return Supabase.dicaParaErro(erro);
  const escolha = escolhido();
  if (escolha.modulo) return escolha.modulo.dicaParaErro(erro);
  // sem banco configurado: vale a explicação mais específica das duas
  const doSupabase = Supabase.dicaParaErro(erro);
  const doFirebase = Firebase.dicaParaErro(erro);
  return /^Detalhe:/.test(doSupabase) ? doFirebase : doSupabase;
}

function orientacaoDaChave(valor, nomeProvedor) {
  const modulo = nomeProvedor === 'firebase' ? Firebase : Supabase;
  return modulo.orientacaoDaChave(valor);
}

function classificarChave(texto, nomeProvedor) {
  const modulo = nomeProvedor === 'firebase' ? Firebase : Supabase;
  return modulo.classificarChave(texto);
}

// ------------------------------------------------------ credenciais

/**
 * O que a pessoa colou é a chave do Supabase ou o JSON do Firebase? Decidimos
 * pelo conteúdo, para a tela e a linha de comando terem um campo só.
 */
function detectarCredencial(texto) {
  const conteudo = String(texto || '').trim();
  if (!conteudo) return { provedor: null, erro: 'Cole a chave do projeto (ou o JSON da conta de serviço do Firebase).' };
  if (Firebase.pareceContaDeServico(Firebase.interpretarJson(conteudo))) {
    return { provedor: 'firebase', conteudo };
  }
  const tipo = Supabase.classificarChave(conteudo);
  if (tipo !== 'ausente' && tipo !== 'desconhecida') return { provedor: 'supabase', conteudo, chave: conteudo, tipo };

  // não é chave nem JSON: pode ser o caminho do arquivo baixado do Firebase
  // (na linha de comando é bem mais prático colar/arrastar o arquivo)
  const caminho = conteudo.replace(/^"(.*)"$/s, '$1').replace(/^'(.*)'$/s, '$1').trim();
  try {
    const dados = Firebase.interpretarJson(fs.readFileSync(caminho, 'utf8'));
    if (Firebase.pareceContaDeServico(dados)) {
      return { provedor: 'firebase', conteudo: JSON.stringify(dados), arquivo: caminho };
    }
  } catch (_) {
    /* não era um caminho de arquivo legível */
  }

  if (tipo === 'ausente') return { provedor: null, erro: 'Nada foi colado.' };
  return {
    provedor: null,
    erro: 'Não entendi essa credencial: ela não parece a chave do Supabase nem o JSON da conta de ' +
      'serviço do Firebase (nem o caminho do arquivo .json).',
  };
}

/**
 * Pastas onde o arquivo baixado do Firebase costuma estar. Dá para apontar
 * outras com LICITAPRO_BUSCA_CREDENCIAL (separa por ":" ou ";") — é o que os
 * testes usam.
 */
function pastasDeBusca() {
  const extras = String(process.env.LICITAPRO_BUSCA_CREDENCIAL || '')
    .split(/[:;]/)
    .map((item) => item.trim())
    .filter(Boolean);
  const casa = os.homedir();
  const candidatas = extras.concat([
    path.join(casa, 'Downloads'),
    path.join(casa, 'Desktop'),
    path.join(casa, 'Documents'),
    path.join(casa, 'Documentos'),
    path.join(casa, 'Área de Trabalho'),
    DATA_DIR,
  ]);
  const vistas = new Set();
  return candidatas
    .map((pasta) => path.resolve(pasta))
    .filter((pasta) => {
      if (vistas.has(pasta)) return false;
      vistas.add(pasta);
      try {
        return fs.statSync(pasta).isDirectory();
      } catch (_) {
        return false;
      }
    });
}

/**
 * Procura nas pastas prováveis um JSON de conta de serviço já baixado — o que o
 * console do Firebase entrega em "Generate new private key".
 *
 * Devolve só o nome do arquivo, o projeto e a conta (nunca o conteúdo: a chave
 * privada só é lida quando alguém confirma que é para usar este arquivo).
 */
function procurarCredencialFirebase(opcoes) {
  const config = opcoes || {};
  const limite = Number(config.limite) || 5;
  const maximoPorPasta = Number(config.maximoPorPasta) || 300;
  const encontrados = [];

  for (const pasta of config.pastas || pastasDeBusca()) {
    let arquivos = [];
    try {
      arquivos = fs.readdirSync(pasta, { withFileTypes: true });
    } catch (_) {
      continue;
    }
    let lidos = 0;
    for (const entrada of arquivos) {
      if (encontrados.length >= limite) return encontrados;
      if (!entrada.isFile() || !/\.json$/i.test(entrada.name)) continue;
      if (lidos >= maximoPorPasta) break;
      lidos += 1;
      const completo = path.join(pasta, entrada.name);
      let conteudo = '';
      try {
        if (fs.statSync(completo).size > TAMANHO_MAXIMO_CREDENCIAL) continue;
        conteudo = fs.readFileSync(completo, 'utf8');
      } catch (_) {
        continue;
      }
      const dados = Firebase.interpretarJson(conteudo);
      if (!Firebase.pareceContaDeServico(dados)) continue;
      encontrados.push({
        arquivo: completo,
        nome: entrada.name,
        projeto: String(dados.project_id || ''),
        conta: String(dados.client_email || ''),
      });
    }
  }
  return encontrados;
}

/** Lê uma credencial a partir do caminho do arquivo (usado pela tela e pela CLI). */
function lerCredencialDoArquivo(caminho) {
  const alvo = String(caminho || '').trim().replace(/^"(.*)"$/s, '$1').replace(/^'(.*)'$/s, '$1');
  if (!alvo) throw new Error('Informe o caminho do arquivo .json da conta de serviço.');
  let conteudo = '';
  try {
    const informacao = fs.statSync(alvo);
    if (!informacao.isFile()) throw new Error('não é um arquivo');
    if (informacao.size > TAMANHO_MAXIMO_CREDENCIAL) throw new Error('arquivo grande demais para uma credencial');
    conteudo = fs.readFileSync(alvo, 'utf8');
  } catch (erro) {
    throw new Error('Não consegui ler o arquivo "' + alvo + '": ' + erro.message);
  }
  const dados = Firebase.interpretarJson(conteudo);
  if (!Firebase.pareceContaDeServico(dados)) {
    throw new Error('O arquivo "' + alvo + '" não parece o JSON de uma conta de serviço do Firebase.');
  }
  return { provedor: 'firebase', conteudo: JSON.stringify(dados), arquivo: alvo, projeto: dados.project_id };
}

/**
 * Grava e apaga uma linha de teste para provar que o banco aceita gravação —
 * é o passo que responde "está salvando mesmo?".
 */
async function testarGravacao(cliente) {
  const agora = new Date().toISOString();
  if (cliente.provedor === 'firebase') {
    await cliente.gravar(Firebase.TABELAS.sequencia, '__teste__', { por_ano: {}, atualizado_em: agora });
    await cliente.apagar(Firebase.TABELAS.sequencia, '__teste__');
    return true;
  }
  await cliente.salvar(Supabase.TABELAS.sequencia, [{ chave: '__teste__', por_ano: {}, atualizado_em: agora }], 'chave');
  await cliente.apagar(Supabase.TABELAS.sequencia, 'chave=eq.__teste__');
  return true;
}

/** Grava a credencial do Supabase no .env (o mesmo código da linha de comando). */
function gravarCredencialSupabase(informado) {
  const gravado = credenciais.gravarCredenciais({ url: (informado && informado.url) || '', chave: informado.conteudo });
  credenciais.aplicarNoAmbiente({ url: gravado.url, chave: gravado.chave });
  return { provedor: 'supabase', arquivo: gravado.caminho, endereco: gravado.url || null };
}

/**
 * Grava o JSON da conta de serviço do Firebase na pasta de dados (fora do Git,
 * só o dono lê) e aponta o .env para ele.
 */
function gravarCredencialFirebase(informado) {
  const dados = Firebase.interpretarJson(informado && informado.conteudo);
  if (!Firebase.pareceContaDeServico(dados)) {
    throw new Error('Esse JSON não é de uma conta de serviço do Firebase (faltam private_key/client_email).');
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const destino = path.join(DATA_DIR, ARQUIVO_FIREBASE);
  fs.writeFileSync(destino, JSON.stringify(dados, null, 2) + '\n', { mode: 0o600 });
  credenciais.atualizarEnv({
    FIREBASE_SERVICE_ACCOUNT_FILE: destino,
    FIREBASE_PROJECT_ID: String(dados.project_id || '').trim(),
  });
  // vale já nesta execução, sem reiniciar o sistema
  process.env.FIREBASE_SERVICE_ACCOUNT_FILE = destino;
  process.env.FIREBASE_PROJECT_ID = String(dados.project_id || '').trim();
  return { provedor: 'firebase', arquivo: destino, endereco: 'projeto ' + dados.project_id };
}

/** Grava a credencial do banco detectado (Supabase ou Firebase). */
function gravarCredencial(informado) {
  const dados = informado || {};
  const detectado = dados.provedor ? { provedor: dados.provedor, conteudo: dados.conteudo } : detectarCredencial(dados.conteudo);
  if (!detectado.provedor) throw new Error(detectado.erro || 'Não entendi a credencial informada.');
  if (detectado.provedor === 'firebase') return gravarCredencialFirebase({ conteudo: dados.conteudo });
  return gravarCredencialSupabase({ url: dados.url, conteudo: dados.conteudo });
}

module.exports = {
  NOMES,
  ARQUIVO_FIREBASE,
  escolhido,
  nome,
  configurado,
  provedor,
  lerConfiguracao,
  enderecoPadrao,
  criarCliente,
  lerEstado,
  gravarEstado,
  dicaParaErro,
  orientacaoDaChave,
  classificarChave,
  detectarCredencial,
  gravarCredencial,
  pastasDeBusca,
  procurarCredencialFirebase,
  lerCredencialDoArquivo,
  testarGravacao,
  Supabase,
  Firebase,
};
