'use strict';

/**
 * Armazenamento no Supabase (Postgres) — usado quando SUPABASE_URL e uma chave
 * de serviço estão configuradas.
 *
 * Fala direto com a API REST do Supabase (PostgREST) usando o fetch do Node:
 * o projeto não ganha nenhuma dependência nova.
 *
 * ⚠️ A chave usada aqui é a **service_role** (ou a secret key do projeto novo):
 * ela dá acesso total ao banco e só pode ficar no servidor. Nunca copie essa
 * chave para o site (public/) — no navegador o sistema continua guardando os
 * dados no próprio navegador (modo local).
 */

const TIMEOUT_MS = 15000;

/** Tabelas usadas pelo sistema (veja supabase/esquema.sql). */
const TABELAS = {
  perfil: 'licitapro_perfil',
  documentos: 'licitapro_documentos',
  sequencia: 'licitapro_sequencia',
};

/** Normaliza um par url/chave (do ambiente ou informado à mão). */
function normalizar(url, chave) {
  const endereco = String(url || '').trim().replace(/\/+$/, '');
  const segredo = String(chave || '').trim();
  // endereço tem de ser a API REST do projeto (https://xxxx.supabase.co)
  const urlValida = /^https?:\/\/.+/i.test(endereco);
  return { url: endereco, chave: segredo, configurado: Boolean(urlValida && segredo) };
}

function lerConfiguracao(env) {
  const ambiente = env || process.env;
  return normalizar(
    ambiente.SUPABASE_URL,
    ambiente.SUPABASE_SERVICE_KEY || ambiente.SUPABASE_SERVICE_ROLE_KEY || ambiente.SUPABASE_KEY
  );
}

/** O sistema foi configurado para usar o Supabase? */
function configurado(env) {
  const armazenamento = String((env || process.env).LICITAPRO_ARMAZENAMENTO || '').trim().toLowerCase();
  if (armazenamento === 'arquivo') return false; // escolha explícita pelo arquivo local
  return lerConfiguracao(env).configurado;
}

/** Cliente HTTP da API REST. `fetchImpl` existe para os testes. */
function criarCliente(opcoes) {
  const informado = opcoes && (opcoes.url || opcoes.chave);
  const config = informado ? normalizar(opcoes.url, opcoes.chave) : lerConfiguracao();
  if (!config.configurado) {
    throw new Error('Supabase não configurado: informe SUPABASE_URL e SUPABASE_SERVICE_KEY.');
  }
  const fetchImpl = (opcoes && opcoes.fetchImpl) || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('Este Node não tem fetch (precisa do Node 18 ou superior).');
  }
  const base = `${config.url}/rest/v1/`;
  const cabecalhos = {
    apikey: config.chave,
    Authorization: `Bearer ${config.chave}`,
    'Content-Type': 'application/json',
  };

  async function requisitar(metodo, tabela, consulta, corpo, prefer) {
    const endereco = base + tabela + (consulta ? '?' + consulta : '');
    const resposta = await fetchImpl(endereco, {
      method: metodo,
      headers: Object.assign({ Accept: 'application/json' }, cabecalhos, prefer ? { Prefer: prefer } : {}),
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const texto = await resposta.text();
    if (!resposta.ok) {
      let detalhe = texto.slice(0, 300);
      try {
        const json = JSON.parse(texto);
        detalhe = json.message || json.hint || json.error || detalhe;
      } catch (_) { /* resposta não é JSON */ }
      const erro = new Error(`Supabase respondeu ${resposta.status}: ${detalhe}`);
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

  return {
    url: config.url,
    /** Só para diagnóstico: nunca imprimir a chave. */
    resumo() {
      return { url: config.url, tabelas: Object.assign({}, TABELAS) };
    },
    listar(tabela, consulta) {
      return requisitar('GET', tabela, consulta || 'select=*');
    },
    /** Insere ou atualiza as linhas informadas (upsert pela chave primária). */
    salvar(tabela, linhas, chave) {
      if (!linhas || !linhas.length) return Promise.resolve(null);
      return requisitar(
        'POST',
        tabela,
        chave ? `on_conflict=${encodeURIComponent(chave)}` : '',
        linhas,
        'resolution=merge-duplicates,return=minimal'
      );
    },
    apagar(tabela, consulta) {
      return requisitar('DELETE', tabela, consulta, undefined, 'return=minimal');
    },
    /** Confere se as tabelas existem e devolve as contagens. */
    async conferir() {
      const [perfil, documentos, sequencia] = await Promise.all([
        requisitar('GET', TABELAS.perfil, 'select=id&limit=1'),
        requisitar('GET', TABELAS.documentos, 'select=id&limit=1'),
        requisitar('GET', TABELAS.sequencia, 'select=chave&limit=1'),
      ]);
      return [perfil, documentos, sequencia].every((r) => Array.isArray(r));
    },
  };
}

/** Lê o estado completo (perfil, documentos e numeração) do banco. */
async function lerEstado(cliente) {
  const [linhasPerfil, linhasDocumentos, linhasSequencia] = await Promise.all([
    cliente.listar(TABELAS.perfil, 'select=dados&id=eq.1'),
    cliente.listar(TABELAS.documentos, 'select=id,dados'),
    cliente.listar(TABELAS.sequencia, 'select=chave,por_ano'),
  ]);

  const perfil = (Array.isArray(linhasPerfil) && linhasPerfil[0] && linhasPerfil[0].dados) || null;
  const documentos = (Array.isArray(linhasDocumentos) ? linhasDocumentos : [])
    .map((linha) => linha.dados)
    .filter(Boolean);
  const sequencia = {};
  (Array.isArray(linhasSequencia) ? linhasSequencia : []).forEach((linha) => {
    if (linha && linha.chave) sequencia[linha.chave] = linha.por_ano || {};
  });

  return {
    perfil,
    documentos,
    sequencia,
    vazio: !perfil && documentos.length === 0,
  };
}

/** Envia o estado completo para o banco (o que já está lá é atualizado). */
async function gravarEstado(cliente, estado, removerIds) {
  const agora = new Date().toISOString();
  await cliente.salvar(
    TABELAS.perfil,
    [{ id: 1, dados: estado.perfil || {}, atualizado_em: agora }],
    'id'
  );
  await cliente.salvar(
    TABELAS.documentos,
    (estado.documentos || []).map((documento) => ({
      id: documento.id,
      dados: documento,
      atualizado_em: documento.atualizadoEm || agora,
    })),
    'id'
  );
  await Promise.all(
    Object.entries(estado.sequencia || {}).map(([chave, porAno]) =>
      cliente.salvar(TABELAS.sequencia, [{ chave, por_ano: porAno || {}, atualizado_em: agora }], 'chave')
    )
  );
  // documentos excluídos no sistema saem do banco
  await Promise.all(
    Array.from(removerIds || []).map((id) => cliente.apagar(TABELAS.documentos, `id=eq.${encodeURIComponent(id)}`))
  );
}

module.exports = { TABELAS, configurado, normalizar, lerConfiguracao, criarCliente, lerEstado, gravarEstado };
