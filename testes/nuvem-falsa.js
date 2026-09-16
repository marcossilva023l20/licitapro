'use strict';

/**
 * Supabase de mentira, para os testes da nuvem (site sem servidor).
 *
 * Atende só o que o cofre usa — ler e gravar linhas da tabela
 * `licitapro_cofre` —, com a mesma exigência de chave do Supabase de verdade:
 * sem `apikey`/`Authorization` a resposta é 401. Também sabe fingir que a
 * tabela não existe (para conferir a mensagem que manda rodar nuvem.sql).
 */

const http = require('http');

function criarServidorDeMentira(opcoes) {
  const config = opcoes || {};
  const linhas = new Map(); // id -> { id, conteudo, atualizado_em }
  const autenticadas = [];
  const corpos = []; // o que o navegador mandou (para conferir que a senha não sai)
  let requisicoes = 0;

  const servidor = http.createServer((req, res) => {
    requisicoes += 1;
    const url = new URL(req.url, 'http://127.0.0.1');
    const responder = (situacao, corpo) => {
      res.writeHead(situacao, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(JSON.stringify(corpo));
    };

    if (config.semTabela) {
      return responder(404, { message: 'relation "public.licitapro_cofre" does not exist' });
    }

    const chave = req.headers.apikey || String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!chave || (config.chave && chave !== config.chave)) {
      return responder(401, { message: 'No API key found in request' });
    }
    autenticadas.push(req.method + ' ' + url.pathname + url.search);

    if (!url.pathname.startsWith('/rest/v1/licitapro_cofre')) {
      return responder(404, { message: 'rota desconhecida: ' + url.pathname });
    }

    if (req.method === 'GET') {
      const pedido = url.searchParams.get('id') || '';
      const id = pedido.startsWith('eq.') ? decodeURIComponent(pedido.slice(3)) : null;
      const lista = id ? (linhas.has(id) ? [linhas.get(id)] : []) : Array.from(linhas.values());
      const campos = (url.searchParams.get('select') || '').split(',').filter(Boolean);
      return responder(200, lista.map((linha) => {
        if (!campos.length) return linha;
        const saida = {};
        campos.forEach((campo) => { if (campo in linha) saida[campo] = linha[campo]; });
        return saida;
      }));
    }

    if (req.method === 'POST') {
      let corpo = '';
      req.on('data', (pedaco) => { corpo += pedaco; });
      req.on('end', () => {
        corpos.push(corpo);
        try {
          const dados = JSON.parse(corpo);
          linhas.set(dados.id, Object.assign({}, linhas.get(dados.id) || {}, dados));
          responder(201, []);
        } catch (erro) {
          responder(400, { message: 'JSON inválido: ' + erro.message });
        }
      });
      return undefined;
    }

    return responder(405, { message: 'método não usado pelo cofre: ' + req.method });
  });

  return new Promise((resolver) => {
    servidor.listen(0, '127.0.0.1', () => {
      resolver({
        url: 'http://127.0.0.1:' + servidor.address().port,
        linhas,
        autenticadas,
        corpos,
        requisicoes: () => requisicoes,
        fechar: () => new Promise((pronto) => servidor.close(pronto)),
      });
    });
  });
}

module.exports = { criarServidorDeMentira };
