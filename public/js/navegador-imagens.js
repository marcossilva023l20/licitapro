/* Resolve imagens para o gerador de PDF quando o sistema roda no navegador. */
(function () {
  'use strict';

  const Links = window.ImagensLinks || { urlDireta: (u) => u };
  const cache = new Map(); // url -> data URL

  function blobParaDataUrl(blob) {
    return new Promise((resolver, rejeitar) => {
      const leitor = new FileReader();
      leitor.onload = () => resolver(leitor.result);
      leitor.onerror = () => rejeitar(new Error('Não foi possível ler a imagem.'));
      leitor.readAsDataURL(blob);
    });
  }

  /** Baixa uma imagem e devolve como data URL (para entrar no PDF sem depender da rede). */
  async function paraDataUrl(url) {
    if (cache.has(url)) return cache.get(url);
    const resposta = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (!resposta.ok) throw new Error('HTTP ' + resposta.status);
    const blob = await resposta.blob();
    if (!/^image\//.test(blob.type || '')) throw new Error('o link não é uma imagem');
    const dataUrl = await blobParaDataUrl(blob);
    cache.set(url, dataUrl);
    return dataUrl;
  }

  /**
   * Interface esperada pelo gerador de PDF compartilhado:
   * devolve { imagem } no formato aceito pelo pdfmake, ou null.
   */
  async function prepararParaPdf(referencia) {
    const texto = String(referencia || '').trim();
    if (!texto) return null;

    if (texto.startsWith('data:')) return { imagem: texto };
    if (texto.startsWith('blob:')) return { imagem: texto };

    // imagem enviada do computador (guardada no navegador)
    if (texto.startsWith('idb:')) {
      const blob = window.ModoEstatico ? await window.ModoEstatico.lerImagemBlob(texto.slice(4)) : null;
      if (!blob) return null;
      return { imagem: await blobParaDataUrl(blob) };
    }

    if (texto.startsWith('/api/uploads/')) {
      try {
        return { imagem: await paraDataUrl(texto) };
      } catch (_) {
        return null;
      }
    }

    const direta = Links.urlDireta(texto);
    if (!/^https?:\/\//i.test(direta)) return null;

    try {
      return { imagem: await paraDataUrl(direta) };
    } catch (_) {
      // Em último caso deixa o pdfmake tentar carregar o link direto.
      return { imagem: direta };
    }
  }

  window.ImagensNavegador = { prepararParaPdf, paraDataUrl, blobParaDataUrl, urlDireta: Links.urlDireta };
})();
