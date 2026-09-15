'use strict';

/**
 * Banco de dados simples em arquivo JSON, com gravação atômica.
 *
 * Estrutura:
 * {
 *   usuarios:  [ { id, nome, email, senhaHash, empresa: {...}, padroes: {...}, criadoEm } ],
 *   documentos:[ { id, usuarioId, tipo, numero, ... } ],
 *   sequencia: { "<usuarioId>": { "<tipo>": { "<ano>": 12 } } }
 * }
 */

const fs = require('fs');
const path = require('path');
const { DB_FILE, garantirPastas } = require('./config');

let db = null;
let timerGravar = null;
let gravando = false;

const VAZIO = () => ({ usuarios: [], documentos: [], sequencia: {} });

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
    db = Object.assign(VAZIO(), dados);
    db.usuarios = Array.isArray(db.usuarios) ? db.usuarios : [];
    db.documentos = Array.isArray(db.documentos) ? db.documentos : [];
    db.sequencia = db.sequencia && typeof db.sequencia === 'object' ? db.sequencia : {};
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

// ---------------------------------------------------------------- usuários

const usuario = {
  listar() {
    return carregar().usuarios;
  },
  porId(uid) {
    return carregar().usuarios.find((u) => u.id === uid) || null;
  },
  porEmail(email) {
    const alvo = String(email || '').trim().toLowerCase();
    return carregar().usuarios.find((u) => u.email === alvo) || null;
  },
  criar({ nome, email, senhaHash }) {
    const db = carregar();
    const novo = {
      id: id(),
      nome: String(nome || '').trim(),
      email: String(email || '').trim().toLowerCase(),
      senhaHash,
      criadoEm: new Date().toISOString(),
      empresa: empresaPadrao(),
      padroes: padroesPadrao(),
    };
    db.usuarios.push(novo);
    salvarAgora();
    return novo;
  },
  atualizar(uid, alteracoes) {
    const u = usuario.porId(uid);
    if (!u) return null;
    Object.assign(u, alteracoes);
    salvarAgora();
    return u;
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
  /** Lista (sem os itens, para ficar leve) os documentos de um usuário. */
  listarPorUsuario(uid) {
    return carregar()
      .documentos.filter((d) => d.usuarioId === uid)
      .sort((a, b) => String(b.atualizadoEm || '').localeCompare(String(a.atualizadoEm || '')));
  },
  porId(uid, did) {
    return carregar().documentos.find((d) => d.id === did && d.usuarioId === uid) || null;
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
  substituir(uid, did, dados) {
    const db = carregar();
    const indice = db.documentos.findIndex((d) => d.id === did && d.usuarioId === uid);
    if (indice === -1) return null;
    const atualizado = Object.assign({}, db.documentos[indice], dados, {
      id: did,
      usuarioId: uid,
      atualizadoEm: new Date().toISOString(),
    });
    db.documentos[indice] = atualizado;
    salvarAgora();
    return atualizado;
  },
  remover(uid, did) {
    const db = carregar();
    const antes = db.documentos.length;
    db.documentos = db.documentos.filter((d) => !(d.id === did && d.usuarioId === uid));
    if (db.documentos.length !== antes) {
      salvarAgora();
      return true;
    }
    return false;
  },

  /** Próximo número sequencial (por usuário, tipo e ano). */
  proximoNumero(uid, tipo, ano, grupo) {
    const db = carregar();
    const chave = grupo ? `${tipo}:${grupo}` : tipo;
    db.sequencia[uid] = db.sequencia[uid] || {};
    db.sequencia[uid][chave] = db.sequencia[uid][chave] || {};
    const atual = Number(db.sequencia[uid][chave][ano] || 0);
    return atual + 1;
  },

  reservarNumero(uid, tipo, ano, grupo, numero) {
    const db = carregar();
    const chave = grupo ? `${tipo}:${grupo}` : tipo;
    db.sequencia[uid] = db.sequencia[uid] || {};
    db.sequencia[uid][chave] = db.sequencia[uid][chave] || {};
    const atual = Number(db.sequencia[uid][chave][ano] || 0);
    db.sequencia[uid][chave][ano] = Math.max(atual, Number(numero) || 0);
    salvarAgora();
  },
};

module.exports = { carregar, salvar, salvarAgora, usuario, documento, empresaPadrao, padroesPadrao };
