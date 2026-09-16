'use strict';

/**
 * Servidor de mentira que imita a API REST do Supabase (PostgREST) — só o
 * suficiente para os testes: ler as tabelas, gravar (upsert) e apagar.
 *
 * Assim o sistema é testado de ponta a ponta no caminho do banco sem precisar
 * de internet nem de credenciais de verdade.
 */

const http = require('http');

const TABELAS = ['licitapro_perfil', 'licitapro_documentos', 'licitapro_sequencia'];
const CHAVE_ESPERADA = 'chave-de-teste';

function chavePrimaria(tabela) {
  if (tabela === 'licitapro_documentos') return 'id';
  if (tabela === 'licitapro_sequencia') return 'chave';
  return 'id';
}

function criarServidorDeMentira(opcoes) {
  const config = opcoes || {};
  const banco = {};
  TABELAS.forEach((t) => { banco[t] = []; });

  const estado = {
    banco,
    requisicoes: [],
    falhar: Boolean(config.falhar),
    fechado: false,
    /** Quantidade de linhas de uma tabela. */
    contagem(tabela) {
      return (banco[tabela] || []).length;
    },
    linhas(tabela) {
      return banco[tabela] || [];
    },
    definir(tabela, linhas) {
      banco[tabela] = linhas;
    },
  };

  const servidor = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    estado.requisicoes.push({ metodo: req.method, caminho: url.pathname, busca: url.search });

    const responder = (codigo, corpo) => {
      res.writeHead(codigo, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(corpo === undefined ? null : corpo));
    };

    if (estado.falhar) return responder(500, { message: 'banco fora do ar (teste)' });

    const tabela = url.pathname.replace('/rest/v1/', '');
    if (!TABELAS.includes(tabela)) return responder(404, { message: 'tabela desconhecida: ' + tabela });
    if (req.headers.apikey !== CHAVE_ESPERADA || !String(req.headers.authorization || '').startsWith('Bearer ')) {
      return responder(401, { message: 'chave ausente ou inválida' });
    }

    const filtroId = url.searchParams.get('id') || url.searchParams.get('chave');
    const iguais = filtroId && filtroId.startsWith('eq.') ? filtroId.slice(3) : null;

    if (req.method === 'GET') {
      let linhas = banco[tabela].slice();
      if (iguais !== null) {
        const chave = chavePrimaria(tabela);
        linhas = linhas.filter((linha) => String(linha[chave]) === iguais);
      }
      const limite = Number(url.searchParams.get('limit') || 0);
      if (limite > 0) linhas = linhas.slice(0, limite);
      return responder(200, linhas);
    }

    if (req.method === 'DELETE') {
      const chave = chavePrimaria(tabela);
      banco[tabela] = banco[tabela].filter((linha) => String(linha[chave]) !== iguais);
      return responder(204);
    }

    if (req.method === 'POST') {
      const partes = [];
      req.on('data', (pedaco) => partes.push(pedaco));
      req.on('end', () => {
        let linhas;
        try {
          linhas = JSON.parse(Buffer.concat(partes).toString('utf8') || '[]');
        } catch (_) {
          return responder(400, { message: 'corpo inválido' });
        }
        const chave = chavePrimaria(tabela);
        const recebidas = Array.isArray(linhas) ? linhas : [linhas];
        recebidas.forEach((linha) => {
          const existente = banco[tabela].findIndex((l) => String(l[chave]) === String(linha[chave]));
          if (existente >= 0) banco[tabela][existente] = Object.assign({}, banco[tabela][existente], linha);
          else banco[tabela].push(linha);
        });
        responder(201, []);
      });
      return undefined;
    }

    return responder(405, { message: 'método não suportado' });
  });

  servidor.on('close', () => { estado.fechado = true; });

  return new Promise((resolver) => {
    servidor.listen(0, '127.0.0.1', () => {
      const porta = servidor.address().port;
      estado.url = `http://127.0.0.1:${porta}`;
      estado.fechar = () => new Promise((pronto) => servidor.close(pronto));
      resolver(estado);
    });
  });
}

module.exports = { criarServidorDeMentira, CHAVE_ESPERADA, TABELAS };
