'use strict';

/**
 * Armazenamento no Firebase (Cloud Firestore) — alternativa ao Supabase.
 *
 * Fala direto com a API REST do Firestore usando o fetch do Node e assinando o
 * token do Google com o `crypto` — o projeto não ganha nenhuma dependência nova
 * (nada de firebase-admin, gRPC e centenas de pacotes).
 *
 * ⚠️ A credencial usada aqui é o **arquivo JSON da conta de serviço**
 * ("Project settings → Service accounts → Generate new private key"). Ela dá
 * acesso total ao banco e só pode ficar no servidor. Nunca copie para o site
 * (public/) — no navegador o sistema continua guardando os dados no próprio
 * navegador (modo local).
 *
 * Variáveis aceitas (qualquer uma serve):
 *   FIREBASE_SERVICE_ACCOUNT        = conteúdo do JSON (ou o mesmo em base64)
 *   FIREBASE_SERVICE_ACCOUNT_FILE   = caminho do arquivo .json
 *   GOOGLE_APPLICATION_CREDENTIALS  = caminho do arquivo .json (padrão do Google)
 *   FIREBASE_PROJECT_ID             = id do projeto (opcional: vem no JSON)
 *
 * FIREBASE_BASE e FIREBASE_TOKEN_URL apontam para outros endereços (emulador e
 * testes) — em produção ficam nos padrões do Google.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TIMEOUT_MS = 15000;
const ESCOPO = 'https://www.googleapis.com/auth/datastore';
const TOKEN_PADRAO = 'https://oauth2.googleapis.com/token';
const BASE_PADRAO = 'https://firestore.googleapis.com/v1';

/** Coleções usadas pelo sistema (as tabelas do Supabase, um documento por linha). */
const TABELAS = {
  perfil: 'licitapro_perfil',
  documentos: 'licitapro_documentos',
  sequencia: 'licitapro_sequencia',
};

/** Id do documento que guarda a empresa e os padrões. */
const DOC_PERFIL = '1';

// --------------------------------------------------------------- credenciais

/** Tenta ler um JSON que pode ter vindo cru ou em base64 (variável de ambiente). */
function interpretarJson(texto) {
  const valor = String(texto || '').trim();
  if (!valor) return null;
  const tentar = (bruto) => {
    try {
      const dados = JSON.parse(bruto);
      return dados && typeof dados === 'object' ? dados : null;
    } catch (_) {
      return null;
    }
  };
  return tentar(valor) || tentar(Buffer.from(valor, 'base64').toString('utf8'));
}

/** O que foi informado parece o JSON de uma conta de serviço do Google? */
function pareceContaDeServico(dados) {
  return Boolean(
    dados &&
      (dados.private_key || dados.privateKey) &&
      (dados.client_email || dados.clientEmail) &&
      (dados.project_id || dados.projectId || dados.projectID)
  );
}

/** Lê a credencial do ambiente (variável com o JSON, arquivo .json, ou as duas). */
function lerCredenciais(env) {
  const ambiente = env || process.env;
  const bruto = ambiente.FIREBASE_SERVICE_ACCOUNT || ambiente.FIREBASE_SERVICE_ACCOUNT_JSON;
  const arquivo = ambiente.FIREBASE_SERVICE_ACCOUNT_FILE || ambiente.GOOGLE_APPLICATION_CREDENTIALS;

  let dados = interpretarJson(bruto);
  let origem = 'FIREBASE_SERVICE_ACCOUNT';
  if (!pareceContaDeServico(dados) && arquivo) {
    try {
      dados = interpretarJson(fs.readFileSync(path.resolve(arquivo), 'utf8'));
      origem = arquivo;
    } catch (_) {
      dados = null;
    }
  }
  return comoCredenciais(dados, origem);
}

/**
 * Deixa qualquer entrada no mesmo formato: o resultado de `lerCredenciais()`,
 * o JSON cru da conta de serviço ou um objeto já montado. Nada de expor a
 * chave privada por aí: ela só é usada na hora de assinar o token.
 */
function comoCredenciais(valor, origem) {
  if (!valor) {
    return { projeto: '', email: '', chave: '', tokenUrl: TOKEN_PADRAO, keyId: '', completo: false, origem: null };
  }
  if (valor.credenciais) return valor.credenciais; // configuração já normalizada
  if (valor.completo !== undefined) return valor; // resultado de lerCredenciais()
  const projeto = String(valor.project_id || valor.projectId || valor.projeto || '').trim();
  const email = String(valor.client_email || valor.clientEmail || valor.email || '').trim();
  const chave = String(valor.private_key || valor.privateKey || valor.chave || '');
  return {
    projeto,
    email,
    chave,
    tokenUrl: String(valor.token_uri || valor.tokenUrl || TOKEN_PADRAO).trim(),
    keyId: String(valor.private_key_id || valor.keyId || '').trim(),
    completo: pareceContaDeServico(valor),
    origem: origem || 'informado',
  };
}

/** Normaliza a configuração (mesmo formato do Supabase, para o resto do sistema). */
function normalizarCredencial(valor, env) {
  const ambiente = env || process.env;
  const credenciais = comoCredenciais(valor, valor && valor.origem);
  const projeto = credenciais.projeto || String(ambiente.FIREBASE_PROJECT_ID || '').trim();
  const completo = Boolean(credenciais.completo && projeto);
  return {
    provedor: 'firebase',
    url: projeto ? 'firebase:' + projeto : '',
    endereco: projeto ? 'projeto ' + projeto : '',
    projeto,
    chave: credenciais.email,
    credenciais,
    configurado: completo,
  };
}

function lerConfiguracao(env) {
  return normalizarCredencial(lerCredenciais(env), env);
}

/** O sistema foi configurado para usar o Firebase? */
function configurado(env) {
  const ambiente = env || process.env;
  const armazenamento = String(ambiente.LICITAPRO_ARMAZENAMENTO || '').trim().toLowerCase();
  if (armazenamento === 'arquivo') return false;
  const config = lerConfiguracao(ambiente);
  return config.configurado;
}

// ------------------------------------------------------------------- token

/** Assina o "JWT assertion" que troca por um token de acesso do Google. */
function assinaturaJwt(credenciais, agoraSegundos, tokenUrl) {
  const cabecalho = { alg: 'RS256', typ: 'JWT' };
  if (credenciais.keyId) cabecalho.kid = credenciais.keyId;
  const corpo = {
    iss: credenciais.email,
    sub: credenciais.email,
    aud: tokenUrl,
    iat: agoraSegundos,
    exp: agoraSegundos + 3600,
    scope: ESCOPO,
  };
  const base64 = (objeto) => Buffer.from(JSON.stringify(objeto)).toString('base64url');
  const semAssinatura = base64(cabecalho) + '.' + base64(corpo);
  const assinatura = crypto
    .sign('RSA-SHA256', Buffer.from(semAssinatura), credenciais.chave)
    .toString('base64url');
  return semAssinatura + '.' + assinatura;
}

/** Converte um valor do Firestore ({stringValue: ...}) de volta para JSON. */
function deValor(valor) {
  if (!valor || typeof valor !== 'object') return null;
  if (valor.stringValue !== undefined) return valor.stringValue;
  if (valor.integerValue !== undefined) return Number(valor.integerValue);
  if (valor.doubleValue !== undefined) return Number(valor.doubleValue);
  if (valor.booleanValue !== undefined) return valor.booleanValue;
  if (valor.nullValue !== undefined) return null;
  if (valor.mapValue) return deCampos(valor.mapValue.fields);
  if (valor.arrayValue) return (valor.arrayValue.values || []).map(deValor);
  return null;
}

/** Converte os campos de um documento do Firestore de volta para um objeto. */
function deCampos(campos) {
  const saida = {};
  Object.entries(campos || {}).forEach(([chave, valor]) => {
    saida[chave] = deValor(valor);
  });
  return saida;
}

/** Converte um objeto simples em campos do Firestore (objetos viram texto JSON). */
function paraCampos(dados) {
  const campos = {};
  Object.entries(dados || {}).forEach(([chave, valor]) => {
    if (valor === undefined) return;
    campos[chave] = { stringValue: typeof valor === 'string' ? valor : JSON.stringify(valor) };
  });
  return campos;
}

/**
 * Cliente HTTP do Firestore. `fetchImpl`, `base`, `tokenUrl` e `agora` existem
 * para os testes (servidor de mentira); em produção valem os endereços do Google.
 */
function criarCliente(opcoes) {
  const ambiente = (opcoes && opcoes.env) || process.env;
  const credenciais = opcoes && (opcoes.credenciais || opcoes.projeto)
    ? comoCredenciais(opcoes.credenciais || opcoes, (opcoes && opcoes.origem) || 'informado')
    : lerCredenciais(ambiente);
  const config = normalizarCredencial(credenciais, ambiente);

  if (!config.configurado) {
    throw new Error(
      'Firebase não configurado: informe o JSON da conta de serviço em FIREBASE_SERVICE_ACCOUNT ' +
        '(ou o caminho dele em FIREBASE_SERVICE_ACCOUNT_FILE).'
    );
  }

  const fetchImpl = (opcoes && opcoes.fetchImpl) || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('Este Node não tem fetch (precisa do Node 18 ou superior).');
  }
  // endereços do Google; as variáveis existem para testes/emulador
  const base = String((opcoes && opcoes.base) || process.env.FIREBASE_BASE || BASE_PADRAO).replace(/\/+$/, '');
  const tokenUrl = String(
    (opcoes && opcoes.tokenUrl) || process.env.FIREBASE_TOKEN_URL || credenciais.tokenUrl || TOKEN_PADRAO
  );
  const agora = (opcoes && opcoes.agora) || (() => Date.now());
  const raiz = `${base}/projects/${encodeURIComponent(config.projeto)}/databases/(default)/documents`;

  let token = null; // { valor, expiraEm }
  // o que já foi gravado nesta execução: evita reescrever o que não mudou
  // (no Firestore cada gravação é cobrada, então isso vale ouro)
  const gravados = new Map();
  const chaveDe = (colecao, id) => colecao + '/' + id;

  async function tokenDeAcesso() {
    if (token && token.expiraEm - 60000 > agora()) return token.valor;
    const agoraSegundos = Math.floor(agora() / 1000);
    const corpo = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: assinaturaJwt(credenciais, agoraSegundos, tokenUrl),
    });
    const resposta = await fetchImpl(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: corpo.toString(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const texto = await resposta.text();
    if (!resposta.ok) {
      throw new Error(`O Google recusou a credencial (${resposta.status}): ${texto.slice(0, 200)}`);
    }
    let json = null;
    try {
      json = JSON.parse(texto);
    } catch (_) {
      /* resposta inesperada */
    }
    if (!json || !json.access_token) throw new Error('O Google não devolveu o token de acesso.');
    token = { valor: json.access_token, expiraEm: agora() + Number(json.expires_in || 3600) * 1000 };
    return token.valor;
  }

  async function requisitar(metodo, caminho, corpo, parametros) {
    const autorizacao = await tokenDeAcesso();
    const busca = new URLSearchParams(parametros || {}).toString();
    const endereco = `${raiz}${caminho}${busca ? '?' + busca : ''}`;
    const resposta = await fetchImpl(endereco, {
      method: metodo,
      headers: Object.assign(
        { Authorization: 'Bearer ' + autorizacao, Accept: 'application/json' },
        corpo === undefined ? {} : { 'Content-Type': 'application/json' }
      ),
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const texto = await resposta.text();
    if (!resposta.ok) {
      let detalhe = texto.slice(0, 300);
      try {
        const json = JSON.parse(texto);
        detalhe = (json.error && (json.error.message || json.error.status)) || detalhe;
      } catch (_) {
        /* resposta não é JSON */
      }
      const erro = new Error(`Firestore respondeu ${resposta.status}: ${detalhe}`);
      erro.status = resposta.status;
      throw erro;
    }
    if (!texto) return null;
    try {
      return JSON.parse(texto);
    } catch (_) {
      return null;
    }
  }

  const cliente = {
    provedor: 'firebase',
    projeto: config.projeto,
    resumo() {
      return { provedor: 'firebase', projeto: config.projeto, conta: credenciais.email, colecoes: Object.assign({}, TABELAS) };
    },

    /** Lê um documento (ou null quando ele ainda não existe). */
    async obter(colecao, id) {
      try {
        const documento = await requisitar('GET', `/${colecao}/${encodeURIComponent(id)}`);
        return documento && documento.fields ? deCampos(documento.fields) : null;
      } catch (erro) {
        if (erro.status === 404) return null;
        throw erro;
      }
    },

    /** Lista os documentos de uma coleção (com paginação). */
    async listar(colecao) {
      const documentos = [];
      let pageToken = null;
      do {
        const parametros = { pageSize: 300 };
        if (pageToken) parametros.pageToken = pageToken;
        const resposta = await requisitar('GET', `/${colecao}`, undefined, parametros);
        (resposta && resposta.documents ? resposta.documents : []).forEach((documento) => {
          const id = decodeURIComponent(String(documento.name || '').split('/').pop() || '');
          if (id) documentos.push({ id, campos: deCampos(documento.fields) });
        });
        pageToken = (resposta && resposta.nextPageToken) || null;
      } while (pageToken);
      return documentos;
    },

    /**
     * Cria ou atualiza um documento. Sem máscara de atualização o Firestore
     * grava o documento inteiro (e cria, se ainda não existir) — é o que basta
     * aqui, porque cada documento tem sempre os mesmos campos.
     * `marca` é o que fica guardado para saber se vale gravar de novo.
     */
    async gravar(colecao, id, dados, marca) {
      await requisitar('PATCH', `/${colecao}/${encodeURIComponent(id)}`, { fields: paraCampos(dados) });
      gravados.set(chaveDe(colecao, id), JSON.stringify(marca === undefined ? dados : marca));
      return true;
    },

    /** Apaga um documento (apagar o que não existe é sucesso). */
    async apagar(colecao, id) {
      try {
        await requisitar('DELETE', `/${colecao}/${encodeURIComponent(id)}`);
      } catch (erro) {
        if (erro.status !== 404) throw erro;
      }
      gravados.delete(chaveDe(colecao, id));
      return true;
    },

    /** Já gravamos exatamente isto nesta execução? (evita gravação cobrada à toa) */
    jaGravado(colecao, id, marca) {
      return gravados.has(chaveDe(colecao, id)) && gravados.get(chaveDe(colecao, id)) === JSON.stringify(marca);
    },

    /** Confere se as coleções respondem (o Firestore cria na primeira gravação). */
    async conferir() {
      await Promise.all(
        Object.values(TABELAS).map((colecao) => requisitar('GET', `/${colecao}`, undefined, { pageSize: 1 }))
      );
      return true;
    },

    /** Só para diagnóstico: nunca imprimir a chave privada. */
    endereco() {
      return 'projeto ' + config.projeto;
    },
  };

  return cliente;
}

// ------------------------------------------------------------------- estado

/** Lê o estado completo (perfil, documentos e numeração) do Firestore. */
async function lerEstado(cliente) {
  const [linhasPerfil, linhasDocumentos, linhasSequencia] = await Promise.all([
    cliente.obter(TABELAS.perfil, DOC_PERFIL),
    cliente.listar(TABELAS.documentos),
    cliente.listar(TABELAS.sequencia),
  ]);

  // no Firestore os objetos viram texto JSON (uma string por campo)
  const lerJson = (texto) => {
    if (!texto) return null;
    if (typeof texto === 'object') return texto;
    try {
      return JSON.parse(texto);
    } catch (_) {
      return null;
    }
  };

  const perfil = linhasPerfil ? lerJson(linhasPerfil.dados) : null;
  const documentos = linhasDocumentos
    .map((linha) => lerJson(linha.campos && linha.campos.dados))
    .filter(Boolean);
  const sequencia = {};
  linhasSequencia.forEach((linha) => {
    if (!linha.id) return;
    sequencia[linha.id] = lerJson(linha.campos && linha.campos.por_ano) || {};
  });

  return {
    perfil,
    documentos,
    sequencia,
    vazio: !perfil && documentos.length === 0,
  };
}

/** Envia o estado completo para o Firestore (o que já está lá é atualizado). */
async function gravarEstado(cliente, estado, removerIds) {
  const agora = new Date().toISOString();

  const perfil = estado.perfil || {};
  if (!cliente.jaGravado(TABELAS.perfil, DOC_PERFIL, { dados: perfil })) {
    await cliente.gravar(TABELAS.perfil, DOC_PERFIL, { dados: perfil, atualizado_em: agora }, { dados: perfil });
  }

  for (const documento of estado.documentos || []) {
    const marca = { dados: documento };
    if (cliente.jaGravado(TABELAS.documentos, documento.id, marca)) continue;
    await cliente.gravar(
      TABELAS.documentos,
      documento.id,
      { dados: documento, atualizado_em: documento.atualizadoEm || agora },
      marca
    );
  }

  for (const [chave, porAno] of Object.entries(estado.sequencia || {})) {
    const marca = { por_ano: porAno || {} };
    if (cliente.jaGravado(TABELAS.sequencia, chave, marca)) continue;
    await cliente.gravar(TABELAS.sequencia, chave, { por_ano: porAno || {}, atualizado_em: agora }, marca);
  }

  for (const id of Array.from(removerIds || [])) {
    await cliente.apagar(TABELAS.documentos, id);
  }
}

// ------------------------------------------------------------------ recados

/**
 * Traduz o erro do Firestore numa dica curta do que fazer (mesmo formato das
 * mensagens do Supabase: a linha de comando e a tela mostram o mesmo texto).
 */
function dicaParaErro(erroOuMensagem) {
  const mensagem = String((erroOuMensagem && erroOuMensagem.message) || erroOuMensagem || '').trim();
  if (!mensagem) return 'O Firestore não respondeu: confira a internet e o JSON da conta de serviço.';
  if (/401|UNAUTHENTICATED|invalid_grant|recusou a credencial/i.test(mensagem)) {
    return 'O Google recusou a credencial: gere uma nova chave (Project settings → Service accounts → ' +
      'Generate new private key) e cole o JSON inteiro de novo.';
  }
  if (/403|PERMISSION_DENIED/i.test(mensagem)) {
    return 'A conta de serviço não tem permissão no Firestore: no console do Firebase, dê o papel ' +
      '"Cloud Datastore User" (ou "Firebase Admin") para ela em IAM.';
  }
  if (/does not exist|FAILED_PRECONDITION|NOT_FOUND|404/i.test(mensagem)) {
    return 'O banco ainda não existe neste projeto: no console do Firebase, abra "Firestore Database" e ' +
      'clique em "Create database" uma vez.';
  }
  if (/exceeds|too large|maximum|size/i.test(mensagem)) {
    return 'Um documento ficou grande demais para o Firestore (limite de 1 MB por documento). ' +
      'Reduza os itens do documento ou use o Supabase, que não tem esse limite.';
  }
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|fetch failed|timeout|abort/i.test(mensagem)) {
    return 'Não há conexão com o Google a partir daqui: verifique a internet/proxy.';
  }
  return 'Detalhe: ' + mensagem;
}

/** Texto pronto para explicar o que é a credencial configurada. */
function orientacaoDaChave(valor) {
  const credenciais = comoCredenciais(valor, valor && valor.origem);
  if (credenciais.completo) return null;
  return [
    'Nenhuma conta de serviço do Firebase foi informada.',
    'No console do Firebase: Project settings (⚙) → Service accounts →',
    '  "Generate new private key" (baixa um arquivo .json).',
    'Informe o conteúdo desse arquivo em FIREBASE_SERVICE_ACCOUNT, ou o caminho',
    'dele em FIREBASE_SERVICE_ACCOUNT_FILE (colando pela tela, o sistema grava em',
    'data/firebase-service-account.json).',
  ].join('\n');
}

module.exports = {
  NOME: 'firebase',
  TABELAS,
  DOC_PERFIL,
  TOKEN_PADRAO,
  BASE_PADRAO,
  ESCOPO,
  configurado,
  lerCredenciais,
  lerConfiguracao,
  normalizarCredencial,
  comoCredenciais,
  pareceContaDeServico,
  interpretarJson,
  assinaturaJwt,
  deCampos,
  paraCampos,
  criarCliente,
  lerEstado,
  gravarEstado,
  dicaParaErro,
  orientacaoDaChave,
  classificarChave: (texto) => (pareceContaDeServico(interpretarJson(texto)) ? 'conta_de_servico' : 'desconhecida'),
};
