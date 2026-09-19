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

/**
 * Projeto do Supabase já usado por este sistema. Serve só como conveniência:
 * se uma chave for informada sem o endereço, usamos este projeto. Defina
 * SUPABASE_URL para apontar para outro projeto.
 */
const PROJETO_PADRAO = 'dynebhtodtkbtydzgouo';
const URL_PADRAO = `https://${PROJETO_PADRAO}.supabase.co`;

/**
 * Descobre que tipo de chave foi configurada — só pelo conteúdo dela, sem
 * chamar o Supabase (útil para avisar antes de tentar usar).
 *
 *  - `service_role` / `sb_secret_...`: acesso total, ignora o RLS. É a chave
 *    que o sistema espera: fica no servidor e ninguém mais tem.
 *  - `anon` / `sb_publishable_...`: chave pública (feita para rodar no
 *    navegador). Com o RLS ligado e sem políticas, ela NÃO lê nem grava.
 */
function classificarChave(chave) {
  const valor = String(chave || '').trim();
  if (!valor) return 'ausente';
  if (valor.startsWith('sb_secret_')) return 'secret';
  if (valor.startsWith('sb_publishable_')) return 'publishable';
  const partes = valor.split('.');
  if (partes.length === 3) {
    try {
      const dados = JSON.parse(Buffer.from(partes[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
      if (dados && dados.role === 'service_role') return 'service_role';
      if (dados && dados.role === 'anon') return 'anon';
      if (dados && dados.role) return 'jwt:' + dados.role;
    } catch (_) { /* não é um JWT legível */ }
  }
  return 'desconhecida';
}

/** A chave configurada serve para o servidor gravar sem depender de políticas? */
function chaveDeServidor(chave) {
  const tipo = classificarChave(chave);
  return tipo === 'service_role' || tipo === 'secret';
}

/** Texto pronto para explicar o que fazer com a chave configurada. */
function orientacaoDaChave(chave) {
  const tipo = classificarChave(chave);
  if (tipo === 'service_role' || tipo === 'secret') return null;
  if (tipo === 'anon' || tipo === 'publishable') {
    return [
      'A chave configurada é a pública (' + tipo + '), que roda no navegador.',
      'Com o RLS ligado e sem políticas, o Supabase recusa ler e gravar com ela.',
      'Escolha um dos dois caminhos:',
      '  A) usar a chave de servidor — no Supabase: Project Settings → API keys →',
      '     service_role (Reveal) [ou a secret key, sb_secret_...] e informe em',
      '     SUPABASE_SERVICE_KEY (ela fica só no servidor);',
      '  B) manter esta chave e abrir as políticas das três tabelas para o papel',
      '     anon — rode supabase/politicas-anon.sql no SQL Editor (veja',
      '     npm run supabase -- politicas). Qualquer pessoa que obtenha esta chave',
      '     pública poderá ler e gravar os documentos.',
    ].join('\n');
  }
  if (tipo === 'ausente') return 'Nenhuma chave do Supabase foi informada (SUPABASE_SERVICE_KEY).';
  return 'A chave informada não parece ser do Supabase (nem JWT, nem sb_secret_..., nem sb_publishable_...).';
}

/**
 * Traduz o erro do banco numa dica curta do que fazer. É a mesma explicação na
 * linha de comando (npm run supabase) e na tela ("Conectar banco de dados").
 */
function dicaParaErro(erroOuMensagem) {
  const mensagem = String((erroOuMensagem && erroOuMensagem.message) || erroOuMensagem || '').trim();
  if (!mensagem) return 'O banco não respondeu: confira o endereço do projeto, a chave e a internet.';
  if (/relation|does not exist|42P01/i.test(mensagem)) {
    return 'As tabelas ainda não existem neste projeto: rode supabase/esquema.sql no SQL Editor do Supabase.';
  }
  if (/401|403|permission denied|row-level security|JWT/i.test(mensagem)) {
    return 'O banco recusou a chave: confira se ela é a chave de servidor (service_role / sb_secret_...) ' +
      'ou rode supabase/politicas-anon.sql se quiser usar a chave pública.';
  }
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|fetch failed|timeout|abort/i.test(mensagem)) {
    return 'Não há conexão com o Supabase a partir daqui: verifique a internet (e se o endereço do projeto está certo).';
  }
  return 'Detalhe: ' + mensagem;
}

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
  const chave =
    ambiente.SUPABASE_SERVICE_KEY ||
    ambiente.SUPABASE_SERVICE_ROLE_KEY ||
    ambiente.SUPABASE_SECRET_KEY ||
    ambiente.SUPABASE_ANON_KEY ||
    ambiente.SUPABASE_KEY;
  // sem endereço informado, vai para o projeto padrão (o mesmo do repositório)
  const url = String(ambiente.SUPABASE_URL || '').trim() || (chave ? URL_PADRAO : '');
  return normalizar(url, chave);
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
    provedor: 'supabase',
    url: config.url,
    /** Só para diagnóstico: nunca imprimir a chave. */
    resumo() {
      return { url: config.url, tabelas: Object.assign({}, TABELAS) };
    },
    endereco() {
      return config.url;
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

module.exports = {
  TABELAS,
  PROJETO_PADRAO,
  URL_PADRAO,
  configurado,
  normalizar,
  lerConfiguracao,
  criarCliente,
  lerEstado,
  gravarEstado,
  classificarChave,
  chaveDeServidor,
  orientacaoDaChave,
  dicaParaErro,
};
