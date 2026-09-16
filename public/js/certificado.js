/*
 * Certificado digital A1 (.pfx / .p12) usado para assinar os documentos.
 *
 * O arquivo e a senha dele ficam **só neste navegador** (é o que o sistema
 * guarda: o .pfx em base64). A senha do certificado nunca é guardada — ela é
 * pedida na hora de assinar e a chave privada nunca sai do computador. Por
 * isso o certificado não vai para a conta/nuvem: trocar de computador exige
 * importar o arquivo de novo.
 *
 * As bibliotecas de assinatura (pdf-lib + node-forge + @signpdf, ~840 KB) são
 * baixadas apenas quando alguém importa ou usa um certificado — o site continua
 * abrindo leve.
 */
(function () {
  'use strict';

  const CHAVE = 'licitapro.certificado.v1';
  const ARQUIVO_BIBLIOTECA = 'vendor/assinatura.min.js';

  let carregando = null;

  /** Pasta onde estão css/js/vendor (no GitHub Pages é "public/"). */
  function prefixo() {
    const meta = document.querySelector('meta[name="licitapro-base"]');
    return meta && meta.content ? meta.content : '';
  }

  /** Versão dos arquivos (o ?v= que veio no endereço do script). */
  function versao() {
    const script = Array.from(document.scripts || []).find((s) => /\/app\.js/.test(s.src || ''));
    if (!script) return '';
    try {
      return new URL(script.src).searchParams.get('v') || '';
    } catch (_) {
      return '';
    }
  }

  function bytesParaBase64(bytes) {
    const lista = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let texto = '';
    const passo = 0x8000;
    for (let i = 0; i < lista.length; i += passo) {
      texto += String.fromCharCode.apply(null, lista.subarray(i, i + passo));
    }
    return window.btoa(texto);
  }

  function base64ParaBytes(texto) {
    const cru = window.atob(String(texto || ''));
    const bytes = new Uint8Array(cru.length);
    for (let i = 0; i < cru.length; i += 1) bytes[i] = cru.charCodeAt(i);
    return bytes;
  }

  function lerTudo() {
    try {
      const bruto = window.localStorage.getItem(CHAVE);
      if (!bruto) return null;
      const dados = JSON.parse(bruto);
      if (!dados || !dados.arquivo) return null;
      return dados;
    } catch (_) {
      return null;
    }
  }

  /** Informação do certificado importado (ou null quando não há nenhum). */
  function info() {
    const dados = lerTudo();
    return dados ? dados.info || { titular: '' } : null;
  }

  /** O arquivo do certificado (bytes) importado neste navegador. */
  function arquivo() {
    const dados = lerTudo();
    return dados ? base64ParaBytes(dados.arquivo) : null;
  }

  function guardar(bytes, informacao) {
    const lista = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    try {
      window.localStorage.setItem(
        CHAVE,
        JSON.stringify({
          arquivo: bytesParaBase64(lista),
          info: informacao || {},
          importadoEm: new Date().toISOString(),
        })
      );
      return true;
    } catch (erro) {
      throw new Error('Não consegui guardar o certificado neste navegador (' + erro.message + ').');
    }
  }

  function remover() {
    try {
      window.localStorage.removeItem(CHAVE);
    } catch (_) {
      /* nada a fazer */
    }
  }

  /**
   * Baixa (uma vez) o pacote de assinatura e devolve a API pronta.
   * Sem internet ou sem o arquivo, a mensagem diz o que aconteceu.
   */
  function biblioteca() {
    if (window.AssinaturaDigital) return Promise.resolve(window.AssinaturaDigital);
    if (carregando) return carregando;
    carregando = new Promise((resolver, rejeitar) => {
      const script = document.createElement('script');
      const endereco = new URL(prefixo() + ARQUIVO_BIBLIOTECA, document.baseURI);
      const v = versao();
      if (v) endereco.searchParams.set('v', v);
      script.src = endereco.href;
      script.onload = () => {
        carregando = null;
        if (window.AssinaturaDigital) resolver(window.AssinaturaDigital);
        else rejeitar(new Error('O pacote de assinatura carregou, mas não se apresentou.'));
      };
      script.onerror = () => {
        carregando = null;
        rejeitar(
          new Error(
            'Não consegui baixar as bibliotecas de assinatura (' + ARQUIVO_BIBLIOTECA + '). ' +
              'Confira a internet e se o arquivo foi publicado junto com o site.'
          )
        );
      };
      document.head.appendChild(script);
    });
    return carregando;
  }

  /** Lê o arquivo escolhido pelo usuário (File/Blob) como bytes. */
  async function bytesDoArquivo(arquivoEscolhido) {
    if (!arquivoEscolhido) throw new Error('Escolha o arquivo do certificado (.pfx ou .p12).');
    if (typeof arquivoEscolhido.arrayBuffer === 'function') {
      return new Uint8Array(await arquivoEscolhido.arrayBuffer());
    }
    return new Promise((resolver, rejeitar) => {
      const leitor = new FileReader();
      leitor.onload = () => resolver(new Uint8Array(leitor.result));
      leitor.onerror = () => rejeitar(new Error('Não consegui ler o arquivo do certificado.'));
      leitor.readAsArrayBuffer(arquivoEscolhido);
    });
  }

  window.Certificado = {
    info,
    arquivo,
    guardar,
    remover,
    biblioteca,
    bytesDoArquivo,
    bytesParaBase64,
    base64ParaBytes,
    CHAVE,
  };
})();
