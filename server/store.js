'use strict';

/**
 * Banco de dados simples em arquivo JSON, com gravação atômica.
 *
 * O sistema é de uso único (não há login): existe um único perfil, que guarda
 * os dados da empresa e os padrões usados nos documentos.
 *
 * Estrutura:
 * {
 *   perfil:     { empresa: {...}, padroes: {...}, criadoEm },
 *   documentos: [ { id, tipo, numero, ... } ],
 *   sequencia:  { "<tipo>[:<grupo>]": { "<ano>": 12 } }
 * }
 */

const fs = require('fs');
const path = require('path');
const { DB_FILE, garantirPastas } = require('./config');

let db = null;
let timerGravar = null;
let gravando = false;

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
    gravarAgora();
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

function gravarAgora() {
  garantirPastas();
  const temporario = `${DB_FILE}.tmp-${process.pid}`;
  fs.writeFileSync(temporario, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(temporario, DB_FILE);
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

module.exports = { carregar, salvar, salvarAgora, perfil, documento, empresaPadrao, padroesPadrao };
