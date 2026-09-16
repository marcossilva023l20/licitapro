'use strict';

/**
 * Dados do perfil — no sistema não há login: só os dados da empresa (que saem
 * no PDF) e os padrões dos documentos.
 */

const express = require('express');
const { perfil: Perfil, empresaPadrao, padroesPadrao } = require('../store');

const rotas = express.Router();

const CAMPOS_TEXTO_EMPRESA = [
  'razaoSocial', 'nomeFantasia', 'cnpj', 'inscricaoEstadual', 'telefone', 'email', 'endereco',
  'cidade', 'uf', 'cep', 'banco', 'agencia', 'conta', 'chavePix', 'representante',
  'cpfRepresentante', 'cargoRepresentante', 'logo', 'assinatura',
];

function publico(registro) {
  return { empresa: registro.empresa, padroes: registro.padroes };
}

rotas.get('/', (req, res) => {
  res.json({ perfil: publico(Perfil.obter()) });
});

rotas.put('/empresa', (req, res) => {
  const enviado = req.body || {};
  const empresa = Object.assign(empresaPadrao(), Perfil.obter().empresa || {});
  CAMPOS_TEXTO_EMPRESA.forEach((campo) => {
    if (enviado[campo] !== undefined) empresa[campo] = String(enviado[campo] || '').trim().slice(0, 1200);
  });
  if (enviado.simplesNacional !== undefined) {
    empresa.simplesNacional = enviado.simplesNacional === true || enviado.simplesNacional === 'true';
  }
  if (empresa.uf) empresa.uf = empresa.uf.toUpperCase().slice(0, 2);
  const atualizado = Perfil.atualizar({ empresa });
  res.json({ empresa: atualizado.empresa });
});

rotas.put('/padroes', (req, res) => {
  const enviado = req.body || {};
  const padroes = Object.assign(padroesPadrao(), Perfil.obter().padroes || {});
  ['prazoEntrega', 'condicoesPagamento', 'garantia', 'observacoes', 'cidadeUf'].forEach((campo) => {
    if (enviado[campo] !== undefined) padroes[campo] = String(enviado[campo] || '').trim().slice(0, 600);
  });
  if (enviado.validadeDias !== undefined) padroes.validadeDias = Number(enviado.validadeDias) || 0;
  const atualizado = Perfil.atualizar({ padroes });
  res.json({ padroes: atualizado.padroes });
});

module.exports = rotas;
