'use strict';

/**
 * Guarda os dados do sistema. Não há login: existe um único perfil, com os
 * dados da empresa e os padrões usados nos documentos.
 *
 * Estrutura:
 * {
 *   perfil:     { empresa: {...}, padroes: {...}, criadoEm },
 *   documentos: [ { id, tipo, numero, ... } ],
 *   sequencia:  { "<tipo>[:<grupo>]": { "<ano>": 12 } }
 * }
 *
 * Onde os dados ficam:
 *  - **Supabase** (quando SUPABASE_URL e SUPABASE_SERVICE_KEY estão definidas):
 *    é a fonte de verdade. Tudo é lido do banco ao subir o servidor e cada
 *    alteração é enviada para lá (as chamadas das rotas continuam síncronas —
 *    o estado vive em memória e o banco é atualizado em seguida).
 *  - **data/db.json** (padrão, e também quando não há Supabase): arquivo local
 *    com gravação atômica. Mesmo com o Supabase ligado, o arquivo continua
 *    sendo gravado como cópia local — útil para inspecionar e para backup.
 */

const fs = require('fs');
const path = require('path');
const { DB_FILE, garantirPastas } = require('./config');

let db = null;
let timerGravar = null;
let gravando = false;

// ------------------------------------------------------------ Supabase
let remoto = null;                 // cliente do banco (Supabase ou Firebase)
let remotoProvedor = null;         // 'supabase' | 'firebase' (quando configurado)
let remotoModo = 'arquivo';        // 'arquivo' | 'supabase' | 'firebase'
let filaRemota = Promise.resolve(); // serializa os envios ao banco
let removidosRemotos = new Set();   // documentos excluídos (para apagar no banco)
let erroRemoto = null;              // última falha de gravação (aparece no /api/health)
let remotoIndisponivel = null;      // falha ao conectar no start (site segue no arquivo)

const VAZIO = () => ({ perfil: null, documentos: [], sequencia: {} });

/**
 * Converte bancos antigos (quando o sistema tinha login) para o formato atual:
 * o primeiro usuário vira o perfil — sem senha, sem nome de usuário — e a
 * numeração, que era por usuário, passa a ser única.
 */
function migrar(dados) {
  if (dados.perfil || !Array.isArray(dados.usuarios)) return dados;
  const antigo = dados.usuarios[0];
  delete dados.usuarios;
  if (antigo) {
    dados.perfil = {
      empresa: antigo.empresa || undefined,
      padroes: antigo.padroes || undefined,
      criadoEm: antigo.criadoEm,
    };
  }
  // sequencia: { usuarioId: { tipo: { ano: n } } }  →  { tipo: { ano: n } }
  const plana = {};
  Object.values(dados.sequencia || {}).forEach((porTipo) => {
    Object.entries(porTipo || {}).forEach(([tipo, porAno]) => {
      plana[tipo] = plana[tipo] || {};
      Object.entries(porAno || {}).forEach(([ano, n]) => {
        plana[tipo][ano] = Math.max(Number(plana[tipo][ano] || 0), Number(n || 0));
      });
    });
  });
  dados.sequencia = plana;
  return dados;
}

function carregar() {
  if (db) return db;
  garantirPastas();
  if (!fs.existsSync(DB_FILE)) {
    db = VAZIO();
    // arquivo novo: grava só a cópia local (com Supabase ligado o conteúdo
    // verdadeiro vem do banco, em carregarRemoto())
    try { gravarArquivo(); } catch (_) { /* segue sem arquivo */ }
    return db;
  }
  try {
    const bruto = fs.readFileSync(DB_FILE, 'utf8');
    const dados = JSON.parse(bruto || '{}');

    // banco do tempo em que havia login: converte e grava já no formato novo,
    // para o arquivo não ficar guardando senha e usuário que não são mais usados
    const eraAntigo = !dados.perfil && Array.isArray(dados.usuarios);
    db = Object.assign(VAZIO(), migrar(dados));
    db.documentos = Array.isArray(db.documentos) ? db.documentos : [];
    db.sequencia = db.sequencia && typeof db.sequencia === 'object' ? db.sequencia : {};

    // o dono do documento não existe mais: o banco é de um perfil só
    const tinhaDono = db.documentos.some((d) => d.usuarioId !== undefined);
    db.documentos.forEach((d) => { delete d.usuarioId; });
    garantirIds(db.documentos);

    if (eraAntigo || tinhaDono) salvarAgora();
  } catch (erro) {
    // Arquivo corrompido: preserva o original e começa limpo, para não travar o site.
    const backup = `${DB_FILE}.corrompido-${Date.now()}`;
    try { fs.renameSync(DB_FILE, backup); } catch (_) { /* ignora */ }
    console.error('[store] db.json inválido. Backup em', backup, '-', erro.message);
    db = VAZIO();
  }
  return db;
}

function gravarArquivo() {
  garantirPastas();
  const temporario = `${DB_FILE}.tmp-${process.pid}`;
  fs.writeFileSync(temporario, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(temporario, DB_FILE);
}

/** Grava a cópia local e, se houver banco configurado, envia para ele. */
function gravarAgora() {
  try {
    gravarArquivo();
  } catch (erro) {
    console.error('[store] falha ao gravar o arquivo local:', erro.message);
  }
  agendarEnvioRemoto();
}

/** Marca o banco como alterado (gravação em disco agrupada, ~120ms). */
function salvar() {
  if (timerGravar) clearTimeout(timerGravar);
  timerGravar = setTimeout(() => {
    timerGravar = null;
    if (gravando) return;
    gravando = true;
    try { gravarAgora(); } catch (e) { console.error('[store] falha ao gravar:', e.message); }
    gravando = false;
  }, 120);
  if (timerGravar.unref) timerGravar.unref();
}

/** Grava imediatamente (usado ao encerrar o processo e em operações críticas). */
function salvarAgora() {
  if (timerGravar) { clearTimeout(timerGravar); timerGravar = null; }
  try { gravarAgora(); } catch (e) { console.error('[store] falha ao gravar:', e.message); }
}

function id() {
  return require('crypto').randomUUID();
}

/** O perfil tem algum dado preenchido? (usado para escolher entre banco e arquivo) */
function perfilTemDados(perfil) {
  if (!perfil) return false;
  const empresa = perfil.empresa || {};
  const padroes = perfil.padroes || {};
  return [empresa, padroes].some((grupo) =>
    Object.values(grupo).some((valor) => (typeof valor === 'string' ? valor.trim() !== '' : Boolean(valor)))
  );
}

/**
 * Junta o que está no banco com o que está no arquivo local **sem perder nada**:
 *  - documentos: união pelo id (quando o documento existe nos dois, vale a
 *    versão do banco — é a que recebeu as edições mais recentes);
 *  - perfil: o do banco, quando tem dados; senão o local;
 *  - numeração: o maior número de cada tipo/ano.
 *
 * É o que permite subir o sistema depois de um período sem banco (ou com o
 * arquivo local mais novo) sem que nenhum documento desapareça.
 */
function mesclar(local, remoto) {
  const origemLocal = local || VAZIO();
  const origemRemota = remoto || VAZIO();

  const porId = new Map();
  (origemLocal.documentos || []).forEach((d) => { if (d && d.id) porId.set(d.id, d); });
  (origemRemota.documentos || []).forEach((d) => { if (d && d.id) porId.set(d.id, d); }); // banco vence

  const sequencia = {};
  [origemLocal.sequencia, origemRemota.sequencia].forEach((grupo) => {
    Object.entries(grupo || {}).forEach(([chave, porAno]) => {
      sequencia[chave] = sequencia[chave] || {};
      Object.entries(porAno || {}).forEach(([ano, numero]) => {
        sequencia[chave][ano] = Math.max(Number(sequencia[chave][ano] || 0), Number(numero || 0));
      });
    });
  });

  const documentos = Array.from(porId.values());
  garantirIds(documentos);
  return {
    perfil: perfilTemDados(origemRemota.perfil) ? origemRemota.perfil : (origemLocal.perfil || origemRemota.perfil || null),
    documentos,
    sequencia,
  };
}

/**
 * Documento sem id (arquivo antigo ou editado à mão) ganha um: a chave primária
 * do banco é um uuid e não pode ficar vazia.
 */
function garantirIds(documentos) {
  (documentos || []).forEach((documento) => {
    if (!documento.id) documento.id = id();
  });
  return documentos;
}

// ----------------------------------------------------- Supabase (remoto)

/** Liga o banco do Supabase neste armazenamento (usado no start e nos testes). */
function usarRemoto(cliente) {
  remoto = cliente || null;
  // o cliente sabe de qual banco ele é ('supabase' ou 'firebase')
  remotoProvedor = remoto ? remoto.provedor || 'supabase' : null;
  remotoModo = remoto ? remotoProvedor : 'arquivo';
  erroRemoto = null;
  return remoto;
}

function modo() {
  return remotoModo;
}

/** O Supabase está configurado (mesmo que esteja fora do ar agora)? */
function remotoConfigurado() {
  return Boolean(remoto);
}

/** Detalhes do banco para o /api/health e para os avisos do log. */
function situacaoRemota() {
  const erro = remotoIndisponivel || erroRemoto;
  return {
    provedor: remotoProvedor,
    endereco: remoto && typeof remoto.endereco === 'function' ? remoto.endereco() : null,
    configurado: Boolean(remoto),
    // "conectado" é o estado da última gravação: se ela falhou, fica falso até
    // a próxima dar certo (mesmo que o banco tenha respondido no start)
    conectado: Boolean(remoto) && !erro,
    erro: erro ? erro.message : null,
  };
}

/**
 * O banco não respondeu no start: o site continua funcionando com o arquivo
 * local e cada alteração tenta o banco de novo (quando ele voltar, os dois
 * lados são unidos e nada se perde).
 */
function marcarRemotoIndisponivel(erro) {
  remotoIndisponivel = erro || new Error('Supabase indisponível');
  remotoModo = 'arquivo';
  erroRemoto = remotoIndisponivel;
}

function ultimoErroRemoto() {
  return erroRemoto ? erroRemoto.message : null;
}

/** Envia o estado atual para o banco (uma gravação por vez). */
function agendarEnvioRemoto() {
  if (!remoto) return filaRemota;
  const enviar = () => enviarRemoto();
  filaRemota = filaRemota.then(enviar, enviar);
  return filaRemota;
}

async function enviarRemoto() {
  if (!remoto) return;
  const banco = require('./banco');
  const remover = new Set(removidosRemotos);
  try {
    await banco.gravarEstado(remoto, db || VAZIO(), remover);
    remover.forEach((documentoId) => removidosRemotos.delete(documentoId));
    erroRemoto = null;
    if (remotoIndisponivel) {
      remotoIndisponivel = null; // o banco voltou
      remotoModo = remotoProvedor || 'supabase';
      console.log('[supabase] conexão restabelecida: banco e arquivo estão sincronizados.');
    }
  } catch (erro) {
    erroRemoto = erro;
    console.error('[supabase] falha ao gravar os dados:', erro.message);
    console.error('[supabase] os dados continuam salvos em ' + DB_FILE + ' e serão reenviados na próxima alteração.');
  }
}

/**
 * Carrega o estado do banco. Se o banco estiver vazio, aproveita o que já
 * existe em data/db.json (primeiro uso depois de configurar o Supabase) e
 * envia esse conteúdo para lá.
 */
async function carregarRemoto() {
  if (!remoto) return false;
  const banco = require('./banco');
  const estado = await banco.lerEstado(remoto);
  const local = lerArquivoLocal();
  const tinhaLocal = Boolean(local && (local.documentos.length || perfilTemDados(local.perfil)));

  // une os dois lados (nada é descartado) e devolve a união para o banco
  db = mesclar(local, { perfil: estado.perfil, documentos: estado.documentos, sequencia: estado.sequencia });
  await banco.gravarEstado(remoto, db, new Set());
  gravarArquivo();

  if (estado.vazio && tinhaLocal) {
    console.log('[supabase] banco vazio: enviei o conteúdo de ' + DB_FILE + ' para lá.');
  } else if (tinhaLocal && !estado.vazio) {
    console.log('[supabase] dados do banco e do arquivo local unidos (' + db.documentos.length + ' documento(s)).');
  }

  remotoModo = remotoProvedor || 'supabase';
  remotoIndisponivel = null;
  return true;
}

/** Lê o arquivo local (se existir), sem mexer no estado em memória. */
function lerArquivoLocal() {
  try {
    if (!fs.existsSync(DB_FILE)) return null;
    const dados = JSON.parse(fs.readFileSync(DB_FILE, 'utf8') || '{}');
    const base = Object.assign(VAZIO(), migrar(dados));
    base.documentos = Array.isArray(base.documentos) ? base.documentos : [];
    base.sequencia = base.sequencia && typeof base.sequencia === 'object' ? base.sequencia : {};
    base.documentos.forEach((d) => { delete d.usuarioId; });
    garantirIds(base.documentos);
    if (!base.perfil && base.documentos.length === 0) return null;
    return base;
  } catch (erro) {
    console.error('[store] não consegui ler ' + DB_FILE + ':', erro.message);
    return null;
  }
}

/** Espera os envios pendentes (usado ao encerrar o servidor e nos testes). */
async function encerrar() {
  if (!remoto) return true;
  await agendarEnvioRemoto();
  return !erroRemoto;
}

/** Esquece o estado em memória (próxima leitura vem do banco/arquivo). */
function esquecer() {
  db = null;
  removidosRemotos = new Set();
  erroRemoto = null;
}

// ------------------------------------------------------------------- perfil

/**
 * Perfil único do sistema (não há login). É criado na primeira gravação, já com
 * os campos da empresa e os padrões de documento vazios.
 */
const perfil = {
  obter() {
    const db = carregar();
    if (!db.perfil) {
      db.perfil = { empresa: empresaPadrao(), padroes: padroesPadrao(), criadoEm: new Date().toISOString() };
      salvarAgora();
    } else {
      db.perfil.empresa = Object.assign(empresaPadrao(), db.perfil.empresa || {});
      db.perfil.padroes = Object.assign(padroesPadrao(), db.perfil.padroes || {});
    }
    return db.perfil;
  },
  atualizar(alteracoes) {
    const atual = perfil.obter();
    Object.assign(atual, alteracoes);
    salvarAgora();
    return atual;
  },
};

function empresaPadrao() {
  return {
    razaoSocial: '',
    nomeFantasia: '',
    cnpj: '',
    inscricaoEstadual: '',
    simplesNacional: true,
    telefone: '',
    email: '',
    endereco: '',
    cidade: '',
    uf: '',
    cep: '',
    banco: '',
    agencia: '',
    conta: '',
    chavePix: '',
    representante: '',
    cpfRepresentante: '',
    cargoRepresentante: 'REPRESENTANTE LEGAL DA EMPRESA',
    logo: '',
    assinatura: '',
  };
}

function padroesPadrao() {
  return {
    prazoEntrega: 'Conforme Edital.',
    validadeDias: 60,
    condicoesPagamento: 'Conforme Edital.',
    garantia: 'Conforme Termo de Referência.',
    observacoes: '',
    cidadeUf: '',
  };
}

// ------------------------------------------------------------- documentos

const documento = {
  /** Lista (sem os itens, para ficar leve) todos os documentos, do mais novo ao mais antigo. */
  listar() {
    return carregar()
      .documentos.slice()
      .sort((a, b) => String(b.atualizadoEm || '').localeCompare(String(a.atualizadoEm || '')));
  },
  porId(did) {
    return carregar().documentos.find((d) => d.id === did) || null;
  },
  criar(dados) {
    const db = carregar();
    const agora = new Date().toISOString();
    const base = Object.assign({}, dados);
    // o id é sempre gerado aqui (nunca vem do cliente)
    delete base.id;
    const novo = Object.assign(base, {
      id: id(),
      criadoEm: dados && dados.criadoEm ? dados.criadoEm : agora,
      atualizadoEm: agora,
    });
    db.documentos.push(novo);
    salvarAgora();
    return novo;
  },
  substituir(did, dados) {
    const db = carregar();
    const indice = db.documentos.findIndex((d) => d.id === did);
    if (indice === -1) return null;
    const atualizado = Object.assign({}, db.documentos[indice], dados, {
      id: did,
      atualizadoEm: new Date().toISOString(),
    });
    db.documentos[indice] = atualizado;
    salvarAgora();
    return atualizado;
  },
  remover(did) {
    const db = carregar();
    const antes = db.documentos.length;
    db.documentos = db.documentos.filter((d) => d.id !== did);
    if (db.documentos.length !== antes) {
      if (remoto) removidosRemotos.add(did); // apaga também no banco
      salvarAgora();
      return true;
    }
    return false;
  },

  /** Próximo número sequencial (por tipo, grupo e ano). */
  proximoNumero(tipo, ano, grupo) {
    const db = carregar();
    const chave = grupo ? `${tipo}:${grupo}` : tipo;
    db.sequencia[chave] = db.sequencia[chave] || {};
    const atual = Number(db.sequencia[chave][ano] || 0);
    return atual + 1;
  },

  reservarNumero(tipo, ano, grupo, numero) {
    const db = carregar();
    const chave = grupo ? `${tipo}:${grupo}` : tipo;
    db.sequencia[chave] = db.sequencia[chave] || {};
    const atual = Number(db.sequencia[chave][ano] || 0);
    db.sequencia[chave][ano] = Math.max(atual, Number(numero) || 0);
    salvarAgora();
  },
};

module.exports = {
  carregar,
  salvar,
  salvarAgora,
  perfil,
  documento,
  empresaPadrao,
  padroesPadrao,
  usarRemoto,
  modo,
  ultimoErroRemoto,
  carregarRemoto,
  encerrar,
  esquecer,
  marcarRemotoIndisponivel,
  remotoConfigurado,
  situacaoRemota,
  mesclar,
  perfilTemDados,
};
