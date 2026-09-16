/**
 * Normalização (whitelist) dos documentos de proposta/orçamento.
 * Garante que só os campos conhecidos entram no banco e já aplica valores padrão.
 *
 * O mesmo módulo roda no servidor e no navegador (modo local), recebendo as
 * formatações em pt-BR por injeção.
 */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) {
    module.exports = fabrica(require('../shared/format'));
  } else {
    raiz.DocumentoSchema = fabrica(raiz.Formato);
  }
})(typeof self !== 'undefined' ? self : this, function (Formato) {
  'use strict';

const TIPOS = ['proposta', 'orcamento'];
const STATUS = ['rascunho', 'enviada', 'ganha', 'perdida', 'cancelada'];
const CORES = /^#[0-9a-fA-F]{6}$/;

function texto(valor, limite) {
  const t = String(valor === undefined || valor === null ? '' : valor).trim();
  return limite ? t.slice(0, limite) : t;
}

function booleano(valor, padrao) {
  if (valor === undefined || valor === null || valor === '') return padrao;
  if (typeof valor === 'boolean') return valor;
  const t = String(valor).toLowerCase();
  return t === 'true' || t === '1' || t === 'sim' || t === 'on';
}

function numero(valor, casas) {
  const n = Formato.paraNumero(valor);
  return casas === undefined ? n : Formato.arredondar(n, casas);
}

function itemNovo(base, indice) {
  const b = base || {};
  return {
    id: texto(b.id, 60) || `item-${Date.now()}-${indice}`,
    numeroItem: texto(b.numeroItem, 20) || String(indice + 1),
    descricao: texto(b.descricao, 4000),
    unidade: texto(b.unidade, 12).toUpperCase() || 'UND',
    quantidade: numero(b.quantidade, 3),
    valorReferencia: numero(b.valorReferencia, 2),
    precoCusto: numero(b.precoCusto, 2),
    precoVenda: numero(b.precoVenda, 2),
    marcaModelo: texto(b.marcaModelo, 160),
    foto: texto(b.foto, 1200),
    descricaoCatalogo: texto(b.descricaoCatalogo, 6000),
    linkCompra: texto(b.linkCompra, 1200),
    observacao: texto(b.observacao, 600),
  };
}

function sanearItens(itens) {
  if (!Array.isArray(itens)) return [];
  return itens.slice(0, 800).map((item, i) => itemNovo(item, i));
}

function documentoBase(perfil, tipo, extras) {
  const agora = new Date();
  return Object.assign(
    {
      id: null,
      tipo: TIPOS.includes(tipo) ? tipo : 'proposta',
      numero: { sequencial: 1, ano: agora.getFullYear(), grupo: '' },
      status: 'rascunho',
      data: Formato.dataISO(new Date()),
      orgao: {
        nome: '',
        uasg: '',
        processo: '',
        pregao: '',
        modalidade: 'Pregão Eletrônico',
        objeto: '',
        prazoEntrega: (perfil.padroes && perfil.padroes.prazoEntrega) || 'Conforme Edital.',
      },
      cliente: { nome: '', cnpjCpf: '', contato: '', telefone: '', email: '', endereco: '' },
      proponente: Object.assign({}, perfil.empresa || {}),
      itens: [],
      condicoes: {
        validadeDias: (perfil.padroes && perfil.padroes.validadeDias) || 60,
        condicoesPagamento: (perfil.padroes && perfil.padroes.condicoesPagamento) || '',
        prazoEntrega: (perfil.padroes && perfil.padroes.prazoEntrega) || 'Conforme Edital.',
        garantia: (perfil.padroes && perfil.padroes.garantia) || '',
        observacoes: (perfil.padroes && perfil.padroes.observacoes) || '',
        local: (perfil.padroes && perfil.padroes.cidadeUf) || '',
      },
      desconto: { modo: 'nenhum', valor: 0 },
      acrescimo: { ativo: false, descricao: 'Frete / Instalação', valor: 0 },
      opcoes: {
        mostrarCatalogo: true,
        mostrarFotos: true,
        mostrarDadosBancarios: true,
        mostrarPorExtenso: true,
        mostrarAssinatura: true,
        mostrarDeclaracao: true,
        quebrarPaginaCatalogo: true,
        logoNoCabecalho: true,
        marcaDagua: true,
        cor: '#0B1F33',
      },
      criadoEm: agora.toISOString(),
      atualizadoEm: agora.toISOString(),
    },
    extras || {}
  );
}

/** Junta os dados enviados pelo site com um documento base (ou com o documento anterior). */
function sanear(payload, perfil, tipoSugerido, anterior) {
  const p = payload || {};
  const tipo = TIPOS.includes(p.tipo) ? p.tipo : anterior ? anterior.tipo : TIPOS.includes(tipoSugerido) ? tipoSugerido : 'proposta';
  const base = documentoBase(perfil, tipo);
  const atual = anterior || base;

  const numeroAnterior = atual.numero || base.numero;
  const numeroEnviado = p.numero || {};
  const ano = Number(numeroEnviado.ano) || Number(numeroAnterior.ano) || new Date().getFullYear();

  const orgao = Object.assign({}, base.orgao, atual.orgao || {}, p.orgao || {});
  const cliente = Object.assign({}, base.cliente, atual.cliente || {}, p.cliente || {});
  const condicoes = Object.assign({}, base.condicoes, atual.condicoes || {}, p.condicoes || {});
  const opcoes = Object.assign({}, base.opcoes, atual.opcoes || {}, p.opcoes || {});
  const proponente = Object.assign({}, base.proponente, atual.proponente || {}, p.proponente || {});

  const desconto = Object.assign({ modo: 'nenhum', valor: 0 }, atual.desconto || {}, p.desconto || {});
  const acrescimo = Object.assign({ ativo: false, descricao: 'Frete / Instalação', valor: 0 }, atual.acrescimo || {}, p.acrescimo || {});

  return {
    id: atual.id || null,
    tipo,
    numero: {
      sequencial: Number(numeroEnviado.sequencial || numeroAnterior.sequencial) || 1,
      ano,
      grupo: texto(numeroEnviado.grupo !== undefined ? numeroEnviado.grupo : numeroAnterior.grupo, 30),
    },
    status: STATUS.includes(p.status) ? p.status : atual.status || 'rascunho',
    data: Formato.dataISO(p.data || atual.data) || Formato.dataISO(new Date()),
    orgao: {
      nome: texto(orgao.nome, 300),
      uasg: texto(orgao.uasg, 60),
      processo: texto(orgao.processo, 120),
      pregao: texto(orgao.pregao, 120),
      modalidade: texto(orgao.modalidade, 120),
      objeto: texto(orgao.objeto, 1200),
      prazoEntrega: texto(orgao.prazoEntrega, 400),
    },
    cliente: {
      nome: texto(cliente.nome, 300),
      cnpjCpf: texto(cliente.cnpjCpf, 30),
      contato: texto(cliente.contato, 160),
      telefone: texto(cliente.telefone, 30),
      email: texto(cliente.email, 200),
      endereco: texto(cliente.endereco, 600),
    },
    proponente: {
      razaoSocial: texto(proponente.razaoSocial, 300),
      nomeFantasia: texto(proponente.nomeFantasia, 300),
      cnpj: texto(proponente.cnpj, 30),
      inscricaoEstadual: texto(proponente.inscricaoEstadual, 40),
      simplesNacional: booleano(proponente.simplesNacional, true),
      telefone: texto(proponente.telefone, 30),
      email: texto(proponente.email, 200),
      endereco: texto(proponente.endereco, 600),
      cidade: texto(proponente.cidade, 120),
      uf: texto(proponente.uf, 4).toUpperCase(),
      cep: texto(proponente.cep, 12),
      banco: texto(proponente.banco, 120),
      agencia: texto(proponente.agencia, 40),
      conta: texto(proponente.conta, 60),
      chavePix: texto(proponente.chavePix, 200),
      representante: texto(proponente.representante, 200),
      cpfRepresentante: texto(proponente.cpfRepresentante, 20),
      cargoRepresentante: texto(proponente.cargoRepresentante, 120) || 'REPRESENTANTE LEGAL DA EMPRESA',
      logo: texto(proponente.logo, 1200),
      assinatura: texto(proponente.assinatura, 1200),
    },
    itens: Array.isArray(p.itens) ? sanearItens(p.itens) : atual.itens || [],
    condicoes: {
      validadeDias: numero(condicoes.validadeDias, 0),
      condicoesPagamento: texto(condicoes.condicoesPagamento, 600),
      prazoEntrega: texto(condicoes.prazoEntrega, 400),
      garantia: texto(condicoes.garantia, 400),
      observacoes: texto(condicoes.observacoes, 2000),
      local: texto(condicoes.local, 200),
    },
    desconto: {
      modo: ['nenhum', 'percentual', 'valor'].includes(desconto.modo) ? desconto.modo : 'nenhum',
      valor: numero(desconto.valor, 2),
    },
    acrescimo: {
      ativo: booleano(acrescimo.ativo, false),
      descricao: texto(acrescimo.descricao, 120) || 'Frete / Instalação',
      valor: numero(acrescimo.valor, 2),
    },
    opcoes: {
      mostrarCatalogo: booleano(opcoes.mostrarCatalogo, true),
      mostrarFotos: booleano(opcoes.mostrarFotos, true),
      mostrarDadosBancarios: booleano(opcoes.mostrarDadosBancarios, true),
      mostrarPorExtenso: booleano(opcoes.mostrarPorExtenso, true),
      mostrarAssinatura: booleano(opcoes.mostrarAssinatura, true),
      mostrarDeclaracao: booleano(opcoes.mostrarDeclaracao, true),
      quebrarPaginaCatalogo: booleano(opcoes.quebrarPaginaCatalogo, true),
      logoNoCabecalho: booleano(opcoes.logoNoCabecalho, true),
      mostrarLinkCompra: booleano(opcoes.mostrarLinkCompra, false),
      marcaDagua: booleano(opcoes.marcaDagua, true),
      cor: CORES.test(String(opcoes.cor || '')) ? String(opcoes.cor) : '#0B1F33',
    },
    criadoEm: atual.criadoEm || new Date().toISOString(),
    atualizadoEm: new Date().toISOString(),
  };
}

  return { sanear, TIPOS, STATUS, documentoBase, sanearItens };
});
