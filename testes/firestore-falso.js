'use strict';

/**
 * Servidor de mentira que imita o Firebase: o login do Google (troca do JWT da
 * conta de serviço por um token de acesso) e a API REST do Firestore.
 *
 * Confere de verdade a assinatura RS256 do JWT com a chave pública da conta de
 * serviço de teste — assim o caminho do Firebase é testado de ponta a ponta
 * sem internet e sem credencial de ninguém.
 */

const http = require('http');
const crypto = require('crypto');

const TABELAS = {
  perfil: 'licitapro_perfil',
  documentos: 'licitapro_documentos',
  sequencia: 'licitapro_sequencia',
};

const TOKEN_DE_TESTE = 'token-de-teste-do-google';

/** Cria um par de chaves e o "arquivo JSON" de uma conta de serviço de mentira. */
function criarContaDeServico(opcoes) {
  const config = opcoes || {};
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const projeto = config.projeto || 'projeto-de-teste';
  const conta = {
    type: 'service_account',
    project_id: projeto,
    private_key_id: 'chave-de-teste',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    client_email: 'servidor@' + projeto + '.iam.gserviceaccount.com',
    client_id: '000000000000000000000',
    auth_uri: 'https://accounts.google.com/o/oauth2/auth',
    token_uri: null, // o teste preenche com o endereço do servidor de mentira
  };
  return { conta, publicKey, json: () => JSON.stringify(conta) };
}

/**
 * Sobe o servidor de mentira. Opções:
 *   conta         → o objeto devolvido por criarContaDeServico()
 *   falhar        → responde 500 em tudo (banco fora do ar)
 *   semBanco      → 404 "The database (default) does not exist" (Firestore não criado)
 *   tamanhoPagina → quantos documentos por página (para testar a paginação)
 */
function criarServidorDeMentira(opcoes) {
  const config = opcoes || {};
  const conta = config.conta || criarContaDeServico().conta;
  const banco = {};
  Object.values(TABELAS).forEach((colecao) => {
    banco[colecao] = new Map();
  });

  const estado = {
    banco,
    requisicoes: [],
    tokensEmitidos: 0,
    falhar: Boolean(config.falhar),
    semBanco: Boolean(config.semBanco),
    tamanhoPagina: Number(config.tamanhoPagina) || 300,
    conta,
    /** Quantos documentos tem uma coleção. */
    contagem(colecao) {
      return (banco[colecao] || new Map()).size;
    },
    /** Os dados (já convertidos de volta) de uma coleção. */
    dados(colecao) {
      const saida = [];
      (banco[colecao] || new Map()).forEach((campos, id) => {
        const valores = {};
        Object.entries(campos).forEach(([chave, valor]) => {
          if (valor && valor.stringValue !== undefined) {
            try {
              valores[chave] = JSON.parse(valor.stringValue);
            } catch (_) {
              valores[chave] = valor.stringValue;
            }
          }
        });
        saida.push({ id, campos: valores });
      });
      return saida;
    },
  };

  const responder = (res, codigo, corpo) => {
    res.writeHead(codigo, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(corpo === undefined ? {} : corpo));
  };

  const erro = (res, codigo, status, mensagem) =>
    responder(res, codigo, { error: { code: codigo, status, message: mensagem } });

  const nomeDoProjeto = () => 'projects/' + conta.project_id;

  /** Monta o documento no formato do Firestore a partir dos campos guardados. */
  const documento = (colecao, id) => ({
    name: nomeDoProjeto() + '/databases/(default)/documents/' + colecao + '/' + id,
    fields: banco[colecao].get(id),
    createTime: '2026-01-01T00:00:00Z',
    updateTime: '2026-01-01T00:00:00Z',
  });

  const servidor = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    estado.requisicoes.push({ metodo: req.method, caminho: url.pathname, busca: url.search });

    if (estado.falhar) return erro(res, 500, 'INTERNAL', 'banco fora do ar (teste)');

    const lerCorpo = (depois) => {
      const partes = [];
      req.on('data', (pedaco) => partes.push(pedaco));
      req.on('end', () => depois(Buffer.concat(partes).toString('utf8')));
    };

    // ---------------------------------------------------- login do Google
    if (url.pathname === '/token' || url.pathname === '/oauth2/token') {
      if (req.method !== 'POST') return erro(res, 405, 'METHOD_NOT_ALLOWED', 'use POST');
      return lerCorpo((corpo) => {
        const dados = new URLSearchParams(corpo);
        const afirmacao = dados.get('assertion');
        if (dados.get('grant_type') !== 'urn:ietf:params:oauth:grant-type:jwt-bearer' || !afirmacao) {
          return responder(res, 400, { error: 'invalid_grant', error_description: 'afirmação ausente' });
        }
        const partes = afirmacao.split('.');
        if (partes.length !== 3) return responder(res, 400, { error: 'invalid_grant', error_description: 'JWT torto' });

        const assinaturaOk = crypto.verify(
          'RSA-SHA256',
          Buffer.from(partes[0] + '.' + partes[1]),
          config.publicKey || criarContaDeServico().publicKey,
          Buffer.from(partes[2], 'base64url')
        );
        let conteudo = null;
        try {
          conteudo = JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8'));
        } catch (_) {
          conteudo = null;
        }
        if (!assinaturaOk || !conteudo || conteudo.iss !== conta.client_email) {
          return responder(res, 401, { error: 'invalid_grant', error_description: 'assinatura ou emissor inválidos' });
        }
        if (conteudo.scope !== 'https://www.googleapis.com/auth/datastore') {
          return responder(res, 403, { error: 'invalid_scope', error_description: 'escopo errado: ' + conteudo.scope });
        }
        estado.tokensEmitidos += 1;
        return responder(res, 200, {
          access_token: TOKEN_DE_TESTE,
          expires_in: 3600,
          token_type: 'Bearer',
        });
      });
    }

    // ------------------------------------------------------- Firestore
    const prefixo = '/v1/projects/' + conta.project_id + '/databases/(default)/documents';
    if (!url.pathname.startsWith(prefixo)) return erro(res, 404, 'NOT_FOUND', 'endereço desconhecido: ' + url.pathname);
    if (estado.semBanco) {
      return erro(
        res,
        404,
        'NOT_FOUND',
        'The database (default) does not exist for project ' + conta.project_id
      );
    }
    if (String(req.headers.authorization || '') !== 'Bearer ' + TOKEN_DE_TESTE) {
      return erro(res, 401, 'UNAUTHENTICATED', 'token ausente ou inválido');
    }

    const caminho = url.pathname.slice(prefixo.length).replace(/^\//, '');
    const partes = caminho.split('/').filter(Boolean);
    const colecao = partes[0];
    const id = partes[1] ? decodeURIComponent(partes[1]) : null;
    if (!Object.values(TABELAS).includes(colecao)) {
      return erro(res, 404, 'NOT_FOUND', 'coleção desconhecida: ' + colecao);
    }

    if (req.method === 'GET' && !id) {
      const ids = Array.from(banco[colecao].keys());
      const inicio = url.searchParams.get('pageToken') ? Number(url.searchParams.get('pageToken')) : 0;
      const pagina = ids.slice(inicio, inicio + estado.tamanhoPagina);
      const corpo = { documents: pagina.map((chave) => documento(colecao, chave)) };
      const proximo = inicio + estado.tamanhoPagina;
      if (proximo < ids.length) corpo.nextPageToken = String(proximo);
      return responder(res, 200, corpo);
    }

    if (req.method === 'GET' && id) {
      if (!banco[colecao].has(id)) return erro(res, 404, 'NOT_FOUND', 'Document not found.');
      return responder(res, 200, documento(colecao, id));
    }

    if (req.method === 'PATCH' && id) {
      return lerCorpo((corpo) => {
        let dados = null;
        try {
          dados = JSON.parse(corpo || '{}');
        } catch (_) {
          return erro(res, 400, 'INVALID_ARGUMENT', 'corpo inválido');
        }
        if (!dados || typeof dados.fields !== 'object') {
          return erro(res, 400, 'INVALID_ARGUMENT', 'faltou o campo "fields"');
        }
        // sem máscara de atualização, o documento inteiro é substituído
        banco[colecao].set(id, dados.fields);
        return responder(res, 200, documento(colecao, id));
      });
    }

    if (req.method === 'DELETE' && id) {
      banco[colecao].delete(id);
      return responder(res, 200, {});
    }

    return erro(res, 405, 'METHOD_NOT_ALLOWED', 'método não suportado: ' + req.method);
  });

  return new Promise((resolver) => {
    servidor.listen(0, '127.0.0.1', () => {
      const porta = servidor.address().port;
      estado.url = 'http://127.0.0.1:' + porta;
      estado.tokenUrl = estado.url + '/token';
      estado.firestoreBase = estado.url + '/v1';
      estado.fechar = () => new Promise((pronto) => servidor.close(pronto));
      resolver(estado);
    });
  });
}

module.exports = { criarServidorDeMentira, criarContaDeServico, TABELAS, TOKEN_DE_TESTE };
