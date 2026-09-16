/*
 * Conta e nuvem: guarda os dados no Supabase direto do navegador.
 *
 * Serve para o sistema publicado no GitHub Pages, onde não existe servidor.
 * Cada pessoa **cria uma conta** (usuário + senha) e, em qualquer computador,
 * entra com esse usuário e senha para continuar de onde parou.
 *
 * O usuário identifica a linha no banco (u:<usuario>); a senha é a chave da
 * cifra: tudo sai do navegador cifrado com AES-GCM (chave derivada da senha
 * por PBKDF2 com 150 mil iterações). No banco só existe texto cifrado — quem
 * abrir o Supabase sem a senha não lê nada — e a senha nunca é enviada a
 * lugar nenhum: o login é o navegador conseguindo decifrar o que está lá.
 *
 * A tabela usada é `licitapro_cofre` (veja supabase/nuvem.sql). Cada imagem
 * enviada vira uma linha própria, baixada só quando o PDF precisa dela.
 */
(function () {
  'use strict';

  const CHAVE_CONFIG = 'licitapro.nuvem.v1';
  const TABELA = 'licitapro_cofre';
  const ESPERA_ENVIO = 2500; // ms depois da última gravação, antes de enviar

  const estado = {
    enviando: false,
    agendado: null,
    ultimoErro: '',
    ultimoAviso: '',
  };

  // ------------------------------------------------------------- configuração

  function lerConfig() {
    try {
      const bruto = window.localStorage.getItem(CHAVE_CONFIG);
      return bruto ? JSON.parse(bruto) : null;
    } catch (_) {
      return null;
    }
  }

  function gravarConfig(config) {
    try {
      window.localStorage.setItem(CHAVE_CONFIG, JSON.stringify(config));
    } catch (_) {
      /* sem armazenamento não dá para lembrar a configuração */
    }
  }

  function configurada() {
    const config = lerConfig();
    return Boolean(config && config.url && config.chave && config.usuario && config.senha);
  }

  /** Usuário da conta ligada neste navegador ('' quando não há). */
  function usuario() {
    const config = lerConfig();
    return (config && config.usuario) || '';
  }

  /** Nome de usuário aceito: 3 a 20 caracteres, sem acento e sem espaço. */
  function usuarioValido(nome) {
    return /^[a-z0-9][a-z0-9._-]{2,19}$/.test(String(nome || '').toLowerCase());
  }

  /** Cada conta tem a sua linha no banco (e as imagens dela). */
  function linhaPrincipal(config) {
    return 'u:' + config.usuario;
  }

  function linhaImagem(config, id) {
    return 'u:' + config.usuario + ':img:' + id;
  }

  function projetoDaUrl(url) {
    const achado = String(url || '').match(/^https?:\/\/([a-z0-9-]+)\.supabase\./i);
    return achado ? achado[1] : '';
  }

  /** O que a tela mostra sobre a conta/nuvem. */
  function situacao() {
    const config = lerConfig();
    if (!config) return { ativa: false, enviando: false, erro: '', sincronizadoEm: null, projeto: '', usuario: '' };
    return {
      ativa: true,
      enviando: estado.enviando,
      usuario: config.usuario || '',
      projeto: config.projeto || projetoDaUrl(config.url),
      sincronizadoEm: config.sincronizadoEm || null,
      erro: estado.ultimoErro || config.erro || '',
      aviso: estado.ultimoAviso || '',
    };
  }

  // ------------------------------------------------------------------ cifra

  function paraBase64(bytes) {
    const lista = new Uint8Array(bytes);
    let texto = '';
    const passo = 0x8000;
    for (let i = 0; i < lista.length; i += passo) {
      texto += String.fromCharCode.apply(null, lista.subarray(i, i + passo));
    }
    return window.btoa(texto);
  }

  function deBase64(texto) {
    const cru = window.atob(String(texto || ''));
    const bytes = new Uint8Array(cru.length);
    for (let i = 0; i < cru.length; i += 1) bytes[i] = cru.charCodeAt(i);
    return bytes;
  }

  function temCifra() {
    return Boolean(window.crypto && window.crypto.subtle && window.crypto.subtle.importKey);
  }

  async function chaveDe(codigo, sal) {
    const material = await window.crypto.subtle.importKey(
      'raw', new TextEncoder().encode(codigo), 'PBKDF2', false, ['deriveKey']
    );
    return window.crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: sal, iterations: 150000, hash: 'SHA-256' },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async function cifrar(objeto, codigo) {
    if (!temCifra()) {
      throw new Error('Este navegador não sabe cifrar os dados (precisa abrir o sistema por https://).');
    }
    const sal = window.crypto.getRandomValues(new Uint8Array(16));
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const chave = await chaveDe(codigo, sal);
    const dados = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv }, chave, new TextEncoder().encode(JSON.stringify(objeto))
    );
    return { versao: 1, sal: paraBase64(sal), iv: paraBase64(iv), dados: paraBase64(new Uint8Array(dados)) };
  }

  async function decifrar(pacote, codigo) {
    if (!pacote || !pacote.dados || !pacote.sal || !pacote.iv) {
      throw new Error('O que está na nuvem não parece um cofre do sistema.');
    }
    try {
      const chave = await chaveDe(codigo, deBase64(pacote.sal));
      const dados = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: deBase64(pacote.iv) }, chave, deBase64(pacote.dados)
      );
      return JSON.parse(new TextDecoder().decode(dados));
    } catch (_) {
      throw new Error('Não consegui abrir o que está na nuvem: a senha está certa?');
    }
  }

  /** Marca pequena para saber se os dados daqui mudaram desde o último envio. */
  function resumo(texto) {
    let marca = 5381;
    for (let i = 0; i < texto.length; i += 1) marca = ((marca << 5) + marca + texto.charCodeAt(i)) >>> 0;
    return marca.toString(36) + '-' + texto.length.toString(36);
  }

  // ------------------------------------------------------------ conversa HTTP

  function cabecalhos(config) {
    return {
      apikey: config.chave,
      Authorization: 'Bearer ' + config.chave,
      'Content-Type': 'application/json',
    };
  }

  function explicarErro(situacao, texto) {
    if (situacao === 401 || situacao === 403) {
      return (
        'O Supabase recusou o pedido (código ' + situacao + '): confira a chave pública ' +
        '(anon/publishable) e se as políticas do supabase/nuvem.sql foram rodadas no projeto.'
      );
    }
    if (situacao === 404 || /does not exist|relation .* does not exist/i.test(texto)) {
      return 'A tabela do cofre ainda não existe no projeto: rode o supabase/nuvem.sql no SQL Editor.';
    }
    return 'O Supabase respondeu com erro ' + situacao + (texto ? ': ' + String(texto).slice(0, 200) : '');
  }

  async function pedir(config, caminho, opcoes) {
    const configuracao = Object.assign({}, opcoes || {});
    configuracao.headers = Object.assign(cabecalhos(config), (opcoes && opcoes.headers) || {});
    let resposta;
    try {
      resposta = await window.fetch(String(config.url).replace(/\/+$/, '') + '/rest/v1/' + caminho, configuracao);
    } catch (erro) {
      throw new Error('Não consegui falar com o Supabase (' + erro.message + '). Confira o endereço e a internet.');
    }
    const texto = await resposta.text();
    if (!resposta.ok) throw new Error(explicarErro(resposta.status, texto));
    if (!texto) return null;
    try {
      return JSON.parse(texto);
    } catch (_) {
      return null;
    }
  }

  function gravarLinha(config, id, conteudo) {
    return pedir(config, TABELA + '?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ id, conteudo, atualizado_em: new Date().toISOString() }),
    });
  }

  // --------------------------------------------------------------- conectar

  async function testar(config) {
    await pedir(config, TABELA + '?select=id&limit=1');
    return true;
  }

  /** Confere endereço, chave, usuário e senha antes de falar com o banco. */
  function conferirDados(dados, paraCriar) {
    const url = String((dados && dados.url) || '').trim().replace(/\/+$/, '');
    const chave = String((dados && dados.chave) || '').trim();
    const nome = String((dados && dados.usuario) || '').trim().toLowerCase();
    const senha = String((dados && dados.senha) || '');
    if (!/^https?:\/\/[^\s/]+\.[^\s/]+$/i.test(url)) {
      throw new Error('Endereço do projeto inválido. Ele é assim: https://xxxxxxxx.supabase.co');
    }
    if (chave.length < 20) {
      throw new Error('Cole a chave pública (anon/publishable): Project Settings → API Keys.');
    }
    if (!usuarioValido(nome)) {
      throw new Error('Usuário de 3 a 20 caracteres, usando letras, números, ponto, hífen ou _ (sem espaço).');
    }
    if (senha.length < 6) {
      throw new Error(
        (paraCriar ? 'Escolha uma senha' : 'Digite a sua senha') + ' com pelo menos 6 caracteres — é ela que cifra os dados.'
      );
    }
    return { url, chave, usuario: nome, senha };
  }

  function montarConfig(dados, anterior) {
    return {
      url: dados.url,
      chave: dados.chave,
      usuario: dados.usuario,
      senha: dados.senha,
      projeto: projetoDaUrl(dados.url),
      criadoEm: (anterior && anterior.criadoEm) || new Date().toISOString(),
      imagens: (anterior && anterior.imagens) || [],
      sincronizadoEm: null,
      resumo: '',
      erro: '',
    };
  }

  /** Existe conta com esse usuário neste projeto? (a linha é o usuário) */
  async function lerLinhaPrincipal(config) {
    const linhas = await pedir(
      config,
      TABELA + '?id=eq.' + encodeURIComponent(linhaPrincipal(config)) + '&select=conteudo'
    );
    if (!linhas || !linhas.length) return null;
    return linhas[0].conteudo;
  }

  /** Criar conta: grava o primeiro cofre (vazio) com a senha da pessoa. */
  async function criar(dados) {
    const limpos = conferirDados(dados, true);
    const config = montarConfig(limpos, lerConfig());
    const existente = await lerLinhaPrincipal(config);
    if (existente) {
      throw new Error('Já existe uma conta com o usuário "' + config.usuario + '". Escolha outro nome ou entre com ele.');
    }
    await gravarLinha(config, linhaPrincipal(config), await cifrar({
      aplicativo: 'DEJ Solutions & Global',
      formato: 1,
      criadoEm: new Date().toISOString(),
      atualizadoEm: new Date().toISOString(),
      banco: { versao: 2, perfil: { empresa: {}, padroes: {} }, documentos: [], sequencia: {} },
      imagens: [],
    }, config.senha));
    estado.ultimoErro = '';
    gravarConfig(config);
    return situacao();
  }

  /** Entrar: baixa o cofre da pessoa e abre com a senha dela. */
  async function entrar(dados) {
    const limpos = conferirDados(dados, false);
    const config = montarConfig(limpos, lerConfig());
    await testar(config);
    const cofre = await lerLinhaPrincipal(config);
    if (!cofre) {
      throw new Error(
        'Não existe conta com o usuário "' + config.usuario + '" neste projeto. ' +
        'Confira o nome ou use "Criar conta".'
      );
    }
    let conteudo;
    try {
      conteudo = await decifrar(cofre, config.senha);
    } catch (_) {
      throw new Error(
        'A senha não confere para o usuário "' + config.usuario + '". ' +
        'Confira as letras maiúsculas/minúsculas e tente de novo.'
      );
    }
    estado.ultimoErro = '';
    gravarConfig(config);
    return { situacao: situacao(), conteudo };
  }

  /** Atalho usado pela tela: criar conta nova ou entrar numa existente. */
  async function conectar(dados) {
    return dados && dados.criar ? criar(dados) : entrar(dados);
  }

  /** Sair da conta: esquece a senha e o usuário deste navegador. */
  function sair() {
    const config = lerConfig() || {};
    try {
      window.localStorage.removeItem(CHAVE_CONFIG);
    } catch (_) {
      /* nada a fazer */
    }
    estado.ultimoErro = '';
    return config.usuario || '';
  }

  /** Compatível com o nome antigo (era "desconectar a nuvem"). */
  const desconectar = sair;

  // ------------------------------------------------------------------ envio

  async function enviar() {
    const config = lerConfig();
    if (!config) throw new Error('A nuvem não está ligada.');
    if (!window.ModoEstatico || !window.ModoEstatico.montarBackup) {
      throw new Error('A nuvem funciona no sistema que roda sem servidor (GitHub Pages).');
    }

    const backup = await window.ModoEstatico.montarBackup();

    // 1) imagens novas: cada uma vira uma linha e nunca mais é enviada
    const enviadas = new Set(config.imagens || []);
    for (const [id, dataUrl] of Object.entries(backup.imagens || {})) {
      if (enviadas.has(id)) continue;
      const blob = await (await window.fetch(dataUrl)).blob();
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const pacote = await cifrar({ imagem: paraBase64(bytes), tipo: blob.type || 'image/jpeg' }, config.senha);
      await gravarLinha(config, linhaImagem(config, id), pacote);
      enviadas.add(id);
      gravarConfig(Object.assign({}, config, { imagens: Array.from(enviadas) }));
    }

    // 2) o conteúdo principal: documento, empresa, padrões e numeração
    const agora = new Date().toISOString();
    const pacote = await cifrar({
      aplicativo: 'DEJ Solutions & Global',
      formato: 1,
      atualizadoEm: agora,
      banco: backup.banco,
      imagens: Array.from(enviadas),
    }, config.senha);
    await gravarLinha(config, linhaPrincipal(config), pacote);
    gravarConfig(Object.assign({}, config, {
      imagens: Array.from(enviadas),
      sincronizadoEm: agora,
      resumo: resumo(JSON.stringify(backup.banco)),
      erro: '',
    }));
    estado.ultimoErro = '';
    estado.ultimoAviso = '';
    return agora;
  }

  /** Envia depois de uma pausa (cada gravação no meio de uma digitação não pesa). */
  function agendarEnvio() {
    if (!configurada()) return;
    if (estado.agendado) window.clearTimeout(estado.agendado);
    estado.agendado = window.setTimeout(() => {
      estado.agendado = null;
      enviar()
        .then(() => {
          if (window.App && window.App.atualizarSituacaoDados) window.App.atualizarSituacaoDados();
        })
        .catch((erro) => {
          estado.ultimoErro = erro.message;
          if (window.App && window.App.atualizarSituacaoDados) window.App.atualizarSituacaoDados();
        });
    }, ESPERA_ENVIO);
  }

  // ------------------------------------------------------------------ baixar

  async function baixarPrincipal(config) {
    const cofre = await lerLinhaPrincipal(config);
    if (!cofre) return null;
    return decifrar(cofre, config.senha);
  }

  /** Baixa uma imagem da nuvem (usada quando o PDF precisa dela neste PC). */
  async function baixarImagem(id) {
    const config = lerConfig();
    if (!config) return null;
    const linhas = await pedir(
      config,
      TABELA + '?id=eq.' + encodeURIComponent(linhaImagem(config, id)) + '&select=conteudo'
    );
    if (!linhas || !linhas.length) return null;
    const pacote = await decifrar(linhas[0].conteudo, config.senha);
    return new Blob([deBase64(pacote.imagem)], { type: pacote.tipo || 'image/jpeg' });
  }

  /** Junta dois bancos: documento por documento vale o mais novo; a numeração
   *  fica com o maior número; a empresa vem de quem tiver os dados. */
  function juntar(daqui, deLa) {
    const meu = daqui || { perfil: {}, documentos: [], sequencia: {} };
    const outro = deLa || { perfil: {}, documentos: [], sequencia: {} };
    const porId = new Map();
    (outro.documentos || []).forEach((d) => { if (d && d.id) porId.set(d.id, d); });
    (meu.documentos || []).forEach((d) => {
      if (!d || !d.id) return;
      const deLa1 = porId.get(d.id);
      const meuEm = String(d.atualizadoEm || '');
      const deleEm = String((deLa1 && deLa1.atualizadoEm) || '');
      if (!deLa1 || meuEm >= deleEm) porId.set(d.id, d);
    });

    const sequencia = Object.assign({}, outro.sequencia);
    Object.keys(meu.sequencia || {}).forEach((chave) => {
      const anos = Object.assign({}, sequencia[chave]);
      Object.keys(meu.sequencia[chave] || {}).forEach((ano) => {
        anos[ano] = Math.max(Number(anos[ano]) || 0, Number(meu.sequencia[chave][ano]) || 0);
      });
      sequencia[chave] = anos;
    });

    const empresaDaqui = (meu.perfil && meu.perfil.empresa) || {};
    const temEmpresa = Boolean(empresaDaqui.razaoSocial || empresaDaqui.cnpj || empresaDaqui.nomeFantasia);
    const perfil = temEmpresa
      ? meu.perfil
      : Object.assign({}, meu.perfil, outro.perfil || {});

    return { versao: 2, perfil, documentos: Array.from(porId.values()), sequencia };
  }

  /** Traz para este computador as imagens da nuvem que ainda não estão aqui. */
  async function baixarImagensFaltando(config, remoto) {
    const ids = (remoto && remoto.imagens) || [];
    for (const id of ids) {
      const jaTenho = await window.ModoEstatico.lerImagemBlob(id);
      if (jaTenho) continue;
      try {
        const blob = await baixarImagem(id);
        if (blob && window.ModoEstatico.salvarImagem) await window.ModoEstatico.salvarImagem(id, blob);
      } catch (_) {
        /* imagem que não veio agora é baixada na próxima vez (ou some só ela) */
      }
    }
  }

  /**
   * Sincroniza os dois lados: baixa o que está na nuvem e envia o que está aqui.
   * Se os dois lados mudaram, junta documento por documento (nada é perdido).
   */
  async function sincronizar() {
    const config = lerConfig();
    if (!config) throw new Error('A nuvem não está ligada.');
    estado.enviando = true;
    try {
      const remoto = await baixarPrincipal(config);
      if (!remoto || !remoto.banco) {
        await enviar();
        return { ok: true, direcao: 'envio' };
      }

      const daqui = await window.ModoEstatico.montarBackup();
      const mudouDaqui = !config.resumo || resumo(JSON.stringify(daqui.banco)) !== config.resumo;

      if (!mudouDaqui) {
        // este computador não mexeu em nada: quem manda é a nuvem
        await window.ModoEstatico.aplicarBackup({ banco: remoto.banco, imagens: {} });
        await baixarImagensFaltando(config, remoto);
        gravarConfig(Object.assign({}, config, {
          sincronizadoEm: remoto.atualizadoEm || new Date().toISOString(),
          resumo: resumo(JSON.stringify(remoto.banco)),
          erro: '',
        }));
        estado.ultimoErro = '';
        return { ok: true, direcao: 'download' };
      }

      const juntos = juntar(daqui.banco, remoto.banco);
      await window.ModoEstatico.aplicarBackup({ banco: juntos, imagens: {} });
      await baixarImagensFaltando(config, remoto);
      await enviar();
      return { ok: true, direcao: 'mistura' };
    } catch (erro) {
      estado.ultimoErro = erro.message;
      const atual = lerConfig();
      if (atual) gravarConfig(Object.assign({}, atual, { erro: erro.message }));
      throw erro;
    } finally {
      estado.enviando = false;
    }
  }

  /**
   * Link para abrir o sistema em outro computador já com o endereço e a chave
   * pública preenchidos (a senha nunca vai no link: ela é digitada lá).
   */
  function linkParaOutroComputador() {
    const config = lerConfig();
    if (!config) return '';
    const dados = encodeURIComponent(JSON.stringify({ url: config.url, chave: config.chave }));
    const endereco = window.location.origin + window.location.pathname.replace(/index\.html$/, '');
    return endereco + '?nuvem=' + dados + '#/painel';
  }

  /**
   * Endereço do projeto e chave que vierem no link (?nuvem=...): serve para
   * levar a configuração de um computador para o outro sem digitar nada.
   */
  function configDoEndereco() {
    try {
      const parametros = new URLSearchParams(window.location.search || '');
      const bruto = parametros.get('nuvem');
      if (!bruto) return null;
      const dados = JSON.parse(bruto);
      if (!dados || !dados.url || !dados.chave) return null;
      return { url: String(dados.url), chave: String(dados.chave) };
    } catch (_) {
      return null;
    }
  }

  window.Nuvem = {
    configurada,
    lerConfig,
    situacao,
    usuario,
    usuarioValido,
    entrar,
    criar,
    conectar,
    sair,
    desconectar,
    sincronizar,
    enviar,
    agendarEnvio,
    baixarImagem,
    juntar,
    linkParaOutroComputador,
    configDoEndereco,
    _interno: estado,
  };
})();
