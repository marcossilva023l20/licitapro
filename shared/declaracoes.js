/**
 * DECLARAÇÕES do documento (as que acompanham propostas de licitação).
 *
 * A ideia: o texto é do usuário. Aqui ficam só **modelos prontos** para começar
 * (Declaração Unificada, ME/EPP/MEI, não emprego de menor) — todos editáveis e
 * nenhum deles entra no PDF sozinho: só sai o que estiver marcado no documento.
 *
 * O texto pode usar os dados que já estão no sistema, escrevendo os campos
 * entre chaves: `{RAZAO}`, `{CNPJ}`, `{ORGAO}`, `{DATA}`... A troca acontece na
 * hora de gerar o PDF (veja `substituirTokens`), então o texto continua legível
 * e reaproveitável em outros documentos.
 *
 * Roda no servidor (Node) e no navegador, com as bibliotecas de quem chama.
 */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) {
    module.exports = fabrica(require('./format'));
  } else {
    raiz.Declaracoes = fabrica(raiz.Formato);
  }
})(typeof self !== 'undefined' ? self : this, function (Formato) {
  'use strict';

  const LIMITE_TITULO = 120;
  const LIMITE_TEXTO = 6000;

  /**
   * Modelos sugeridos. Todos podem ser editados, copiados ou apagados.
   * `descricao` é só ajuda na tela: não vai para o texto nem para o PDF.
   */
  const MODELOS = [
    {
      id: 'unificada',
      titulo: 'Declaração Unificada',
      descricao: 'as declarações do edital em um só texto (habilitação, idoneidade, veracidade)',
      texto: [
        'A Empresa {RAZAO}, inscrita no CNPJ nº {CNPJ}, por intermédio de seu representante legal',
        'o(a) Sr(a). {REPRESENTANTE}, portador(a) do CPF nº {CPF_REPRESENTANTE}, DECLARA, para os fins',
        'do disposto no {MODALIDADE} nº {EDITAL}, promovido por {ORGAO}, sob as sanções',
        'administrativas cabíveis e sob as penas da lei, que esta empresa, na presente data:',
        '',
        'I - não foi declarada inidônea para licitar ou contratar com a Administração Pública e não',
        'está impedida de participar desta licitação, cumprindo os requisitos de habilitação',
        'exigidos no instrumento convocatório;',
        '',
        'II - está ciente e concorda com as condições contidas no edital e seus anexos, bem como de',
        'que a proposta apresentada compreende a integralidade dos custos para atendimento dos',
        'direitos trabalhistas assegurados na Constituição Federal, nas leis trabalhistas, nas',
        'normas infralegais, nas convenções coletivas de trabalho e nos termos de ajustamento de',
        'conduta vigentes na data de entrega da proposta, e que cumpre plenamente os requisitos de',
        'habilitação definidos no instrumento convocatório;',
        '',
        'III - não emprega menor de 18 anos em trabalho noturno, perigoso ou insalubre e não emprega',
        'menor de 16 anos, salvo na condição de aprendiz, a partir de 14 anos, nos termos do art. 7º,',
        'inciso XXXIII, da Constituição Federal;',
        '',
        'IV - não possui empregados executando trabalho degradante ou forçado, observando o disposto',
        'nos incisos III e IV do art. 1º e no inciso III do art. 5º da Constituição Federal;',
        '',
        'V - cumpre as exigências de reserva de cargos para pessoa com deficiência e para reabilitado',
        'da Previdência Social, previstas em lei e em outras normas específicas;',
        '',
        'VI - não possui, em seu quadro societário ou de dirigentes, pessoa que mantenha vínculo de',
        'natureza técnica, comercial, econômica, financeira, trabalhista ou civil com dirigente do',
        'órgão ou entidade contratante ou com agente público que desempenhe função na licitação ou',
        'atue na fiscalização ou na gestão do contrato, ou que deles seja cônjuge, companheiro ou',
        'parente em linha reta, colateral ou por afinidade, até o terceiro grau;',
        '',
        'VII - declara, para fins de direito, na qualidade de proponente do procedimento de licitação',
        'instaurado pela Administração, que não possui sanção que a impeça de licitar ou contratar,',
        'que não foi declarada inidônea por qualquer órgão ou entidade da Administração Pública,',
        'direta ou indireta, federal, estadual, distrital ou municipal, e que não incide em nenhuma',
        'das hipóteses de impedimento previstas no art. 156 da Lei nº 14.133/2021;',
        '',
        'VIII - declara que as informações e os documentos apresentados são verdadeiros e autênticos,',
        'responsabilizando-se pelas sanções legais cabíveis em caso de declaração falsa, e que se',
        'compromete a manter, durante toda a execução do contrato, as condições de habilitação e de',
        'qualificação exigidas.',
      ].join('\n'),
    },
    {
      id: 'me-epp-mei',
      titulo: 'Declaração ME / EPP / MEI',
      descricao: 'enquadramento no Simples Nacional (LC 123/2006) — ajuste ME, EPP ou MEI',
      texto: [
        '{RAZAO}, inscrita no CNPJ sob o nº {CNPJ}, DECLARA, sob as penas da lei, para os fins',
        'do disposto na Lei Complementar nº 123/2006, que se enquadra na condição de',
        'microempresa (ME) / empresa de pequeno porte (EPP) / microempreendedor individual',
        '(MEI), estando apta a usufruir dos benefícios previstos na referida lei complementar,',
        'e que não se encontra em nenhuma das situações de exclusão do § 4º do art. 3º da',
        'mesma lei.',
      ].join('\n'),
    },
    {
      id: 'nao-emprega-menor',
      titulo: 'Declaração de não emprego de menor',
      descricao: 'art. 7º, XXXIII, da Constituição (não emprego de menor de idade)',
      texto: [
        '{RAZAO}, inscrita no CNPJ sob o nº {CNPJ}, DECLARA, sob as penas da lei, que não',
        'emprega menor de 18 anos em trabalho noturno, perigoso ou insalubre, nem menor de 16',
        'anos em qualquer trabalho, salvo na condição de aprendiz, a partir de 14 anos, nos',
        'termos do art. 7º, inciso XXXIII, da Constituição Federal.',
      ].join('\n'),
    },
  ];

  /**
   * Campos que podem ser escritos entre chaves no texto da declaração.
   * `de` recebe o documento e a empresa; devolve o valor já formatado.
   */
  const TOKENS = [
    { chave: 'RAZAO', descricao: 'razão social da empresa', de: (doc, empresa) => empresa.razaoSocial || empresa.nomeFantasia || '' },
    { chave: 'FANTASIA', descricao: 'nome fantasia', de: (doc, empresa) => empresa.nomeFantasia || '' },
    { chave: 'CNPJ', descricao: 'CNPJ da empresa', de: (doc, empresa) => (empresa.cnpj ? Formato.cnpj(empresa.cnpj) : '') },
    { chave: 'IE', descricao: 'inscrição estadual', de: (doc, empresa) => empresa.inscricaoEstadual || '' },
    { chave: 'ENDERECO', descricao: 'endereço da empresa', de: (doc, empresa) => empresa.endereco || '' },
    { chave: 'CIDADE', descricao: 'cidade da empresa', de: (doc, empresa) => empresa.cidade || '' },
    { chave: 'UF', descricao: 'UF da empresa', de: (doc, empresa) => empresa.uf || '' },
    { chave: 'CEP', descricao: 'CEP', de: (doc, empresa) => (empresa.cep ? Formato.cep(empresa.cep) : '') },
    { chave: 'TELEFONE', descricao: 'telefone', de: (doc, empresa) => (empresa.telefone ? Formato.telefone(empresa.telefone) : '') },
    { chave: 'EMAIL', descricao: 'e-mail', de: (doc, empresa) => empresa.email || '' },
    { chave: 'REPRESENTANTE', descricao: 'representante legal', de: (doc, empresa) => empresa.representante || '' },
    { chave: 'CARGO', descricao: 'cargo do representante', de: (doc, empresa) => empresa.cargoRepresentante || '' },
    { chave: 'CPF_REPRESENTANTE', descricao: 'CPF do representante', de: (doc, empresa) => (empresa.cpfRepresentante ? Formato.cpf(empresa.cpfRepresentante) : '') },
    { chave: 'ORGAO', descricao: 'órgão da proposta', de: (doc) => (doc.orgao && doc.orgao.nome) || '' },
    { chave: 'UASG', descricao: 'UASG', de: (doc) => (doc.orgao && doc.orgao.uasg) || '' },
    { chave: 'MODALIDADE', descricao: 'modalidade da licitação', de: (doc) => (doc.orgao && doc.orgao.modalidade) || '' },
    { chave: 'EDITAL', descricao: 'edital / pregão', de: (doc) => (doc.orgao && doc.orgao.pregao) || '' },
    { chave: 'PROCESSO', descricao: 'processo nº', de: (doc) => (doc.orgao && doc.orgao.processo) || '' },
    { chave: 'OBJETO', descricao: 'objeto da licitação', de: (doc) => (doc.orgao && doc.orgao.objeto) || '' },
    { chave: 'CLIENTE', descricao: 'cliente (orçamento)', de: (doc) => (doc.cliente && doc.cliente.nome) || '' },
    { chave: 'NUMERO', descricao: 'número do documento', de: (doc) => (doc.numeroFormatado || '') },
    { chave: 'ANO', descricao: 'ano do documento', de: (doc) => String((doc.numero && doc.numero.ano) || '') },
    { chave: 'DATA', descricao: 'data do documento', de: (doc) => Formato.dataBR(doc.data) },
  ];

  function texto(valor, limite) {
    return String(valor == null ? '' : valor).replace(/\r\n?/g, '\n').trim().slice(0, limite);
  }

  function novoId() {
    return 'd' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  }

  /** Uma declaração do documento, com os campos que o sistema usa. */
  function criar(dados) {
    const base = dados || {};
    return {
      id: base.id || novoId(),
      titulo: texto(base.titulo, LIMITE_TITULO),
      texto: texto(base.texto, LIMITE_TEXTO),
      incluir: base.incluir !== false,
    };
  }

  /** Declaração em branco, pronta para o usuário escrever. */
  function emBranco() {
    return criar({ titulo: '', texto: '', incluir: true });
  }

  /** Cópia editável de um modelo (o modelo em si não muda). */
  function doModelo(modelo) {
    const m = modelo || {};
    return criar({ titulo: m.titulo, texto: m.texto, incluir: true });
  }

  /** Limpa a lista vinda do documento (ou do perfil) mantendo só o que interessa. */
  function normalizar(lista) {
    return (Array.isArray(lista) ? lista : [])
      .map((item) => criar(item))
      .filter((item) => item.titulo || item.texto);
  }

  /** As declarações que entram no PDF: marcadas e com texto escrito. */
  function paraPdf(doc, empresa) {
    return normalizar(doc && doc.declaracoes)
      .filter((item) => item.incluir && item.texto)
      .map((item) => ({
        titulo: item.titulo || 'DECLARAÇÃO',
        texto: substituirTokens(item.texto, doc, empresa),
        vazios: tokensVazios(item.texto, doc, empresa),
      }));
  }

  /**
   * Troca `{TOKEN}` pelos dados do documento/empresa.
   * Token sem valor sai do texto (nunca fica "{ORGAO}" impresso no papel);
   * quem avisa sobre isso é a tela, com `tokensVazios`.
   */
  function substituirTokens(conteudo, doc, empresa) {
    const valores = valoresDosTokens(doc, empresa);
    return String(conteudo || '').replace(/\{([A-Z_]+)\}/g, (achado, chave) =>
      valores[chave] === undefined ? achado : valores[chave]
    );
  }

  function valoresDosTokens(doc, empresa) {
    const dados = Object.assign({}, doc || {});
    const proponente = Object.assign({}, empresa || {}, (doc && doc.proponente) || {});
    const valores = {};
    TOKENS.forEach((token) => {
      let valor = '';
      try {
        valor = token.de(dados, proponente);
      } catch (_) {
        valor = '';
      }
      valores[token.chave] = String(valor == null ? '' : valor).trim();
    });
    return valores;
  }

  /** Tokens usados no texto que ainda não têm valor (a tela avisa quais são). */
  function tokensVazios(conteudo, doc, empresa) {
    const valores = valoresDosTokens(doc, empresa);
    const usados = [];
    String(conteudo || '').replace(/\{([A-Z_]+)\}/g, (achado, chave) => {
      if (valores[chave] === '' && usados.indexOf(chave) < 0) usados.push(chave);
      return achado;
    });
    return usados;
  }

  return {
    MODELOS,
    TOKENS,
    LIMITE_TITULO,
    LIMITE_TEXTO,
    criar,
    emBranco,
    doModelo,
    normalizar,
    paraPdf,
    substituirTokens,
    tokensVazios,
  };
});
