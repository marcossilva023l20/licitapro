'use strict';

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Auth = require('../auth');
const { UPLOADS_DIR, garantirPastas } = require('../config');
const Importador = require('../importar');
const Modelo = require('../modeloImportacao');
const Imagens = require('../imagens');

const rotas = express.Router();

const armazenamento = multer.memoryStorage();

const uploadPlanilha = multer({
  storage: armazenamento,
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
  fileFilter: (req, arquivo, cb) => {
    const ext = path.extname(arquivo.originalname || '').toLowerCase();
    if (!['.xlsx', '.xls', '.csv', '.ods'].includes(ext)) {
      return cb(new Error('Formato não aceito. Envie um arquivo .xlsx, .xls, .csv ou .ods.'));
    }
    cb(null, true);
  },
}).single('arquivo');

const uploadImagem = multer({
  storage: armazenamento,
  limits: { fileSize: 6 * 1024 * 1024, files: 1 },
  fileFilter: (req, arquivo, cb) => {
    // O gerador de PDF aceita apenas JPEG e PNG. GIF e WebP são recusados aqui
    // (converta para .jpg antes de enviar) para o PDF não sair sem a foto.
    const ext = path.extname(arquivo.originalname || '').toLowerCase();
    if (!['.jpg', '.jpeg', '.png'].includes(ext)) {
      return cb(new Error('Envie uma imagem .jpg ou .png (GIF e WebP não entram no PDF).'));
    }
    cb(null, true);
  },
}).single('arquivo');

// --------------------------------------------------- modelo para download

rotas.get('/modelo-planilha', (req, res) => {
  const buffer = Modelo.gerarBuffer();
  const nome = 'Modelo_Importacao_Itens_DEJ.xlsx';
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${nome}"; filename*=UTF-8''${encodeURIComponent(nome)}`);
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.end(buffer);
});

// -------------------------------------------------------- importar planilha

rotas.post('/importar', Auth.exigirLogin, (req, res) => {
  uploadPlanilha(req, res, (erro) => {
    if (erro) return res.status(400).json({ erro: erro.message });
    if (!req.file) return res.status(400).json({ erro: 'Nenhum arquivo recebido.' });
    try {
      const resultado = Importador.importar(req.file.buffer, req.file.originalname);
      res.json(resultado);
    } catch (e) {
      res.status(400).json({ erro: e.message, detalhe: e.detalhe });
    }
  });
});

// -------------------------------------------------------- imagem no servidor

rotas.post('/uploads', Auth.exigirLogin, (req, res) => {
  uploadImagem(req, res, (erro) => {
    if (erro) return res.status(400).json({ erro: erro.message });
    if (!req.file) return res.status(400).json({ erro: 'Nenhum arquivo recebido.' });
    // A imagem precisa ser um JPEG/PNG de verdade: um arquivo corrompido não
    // gera erro no PDF, derruba o servidor na hora de montar o documento.
    if (!Imagens.imagemIntegra(req.file.buffer)) {
      return res.status(400).json({
        erro: 'Esta imagem não pôde ser lida (arquivo corrompido ou em formato não aceito). Envie um .jpg ou .png válido.',
      });
    }
    garantirPastas();
    const ext = path.extname(req.file.originalname || '').toLowerCase() || '.png';
    const nome = `${crypto.randomUUID()}${ext}`;
    fs.writeFileSync(path.join(UPLOADS_DIR, nome), req.file.buffer);
    res.status(201).json({ caminho: `/api/uploads/${nome}`, nome: req.file.originalname, tamanho: req.file.size });
  });
});

rotas.get('/uploads/:arquivo', Auth.exigirLogin, (req, res) => {
  const nome = path.basename(req.params.arquivo);
  if (!/^[a-f0-9-]{36}\.(jpg|jpeg|png)$/i.test(nome)) {
    return res.status(400).json({ erro: 'Arquivo inválido.' });
  }
  const caminho = path.join(UPLOADS_DIR, nome);
  if (!fs.existsSync(caminho)) return res.status(404).json({ erro: 'Arquivo não encontrado.' });
  res.setHeader('Content-Type', Imagens.tipoPorExtensao(nome));
  res.setHeader('Cache-Control', 'private, max-age=86400');
  fs.createReadStream(caminho).pipe(res);
});

/** Busca a imagem de um link (Drive, site do fornecedor) e devolve com cache. */
rotas.get('/imagem', Auth.exigirLogin, async (req, res) => {
  const url = String(req.query.url || '').trim();
  if (!url) return res.status(400).json({ erro: 'Informe o endereço da imagem.' });
  const baixada = await Imagens.baixarImagem(url);
  if (!baixada) {
    const lugarNenhum = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200">
        <rect width="300" height="200" fill="#F1F5F7"/>
        <text x="150" y="100" font-family="Arial" font-size="13" fill="#7A848D" text-anchor="middle">Imagem indisponível</text>
        <text x="150" y="120" font-family="Arial" font-size="10" fill="#9AA5B1" text-anchor="middle">verifique o link ou envie o arquivo</text>
       </svg>`
    );
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'no-store');
    return res.end(lugarNenhum);
  }
  res.setHeader('Content-Type', baixada.tipo);
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.end(baixada.dados);
});

module.exports = rotas;
