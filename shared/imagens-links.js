/**
 * Conversão de links de imagem (Google Drive e similares) em links diretos.
 * Usado pelo servidor e pelo navegador.
 */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) {
    module.exports = fabrica();
  } else {
    raiz.ImagensLinks = fabrica();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Extrai o ID de um link do Google Drive. */
  function idDoDrive(url) {
    const texto = String(url || '');
    const padroes = [
      /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]{10,})/,
      /drive\.google\.com\/open\?id=([a-zA-Z0-9_-]{10,})/,
      /drive\.google\.com\/uc\?[^#]*id=([a-zA-Z0-9_-]{10,})/,
      /drive\.usercontent\.google\.com\/download\?[^#]*id=([a-zA-Z0-9_-]{10,})/,
      /docs\.google\.com\/[^#]*[?&]id=([a-zA-Z0-9_-]{10,})/,
      /lh3\.googleusercontent\.com\/d\/([a-zA-Z0-9_-]{10,})/,
    ];
    for (const padrao of padroes) {
      const achou = texto.match(padrao);
      if (achou) return achou[1];
    }
    return null;
  }

  /** Transforma qualquer link de imagem conhecido numa URL direta de imagem. */
  function urlDireta(url) {
    const texto = String(url || '').trim();
    if (!texto) return '';
    const id = idDoDrive(texto);
    if (id) return `https://lh3.googleusercontent.com/d/${id}=w1400`;
    return texto;
  }

  /** Link para abrir a imagem numa nova aba (usado nas pré-visualizações). */
  function urlVisualizacao(url) {
    const texto = String(url || '').trim();
    if (!texto) return '';
    const id = idDoDrive(texto);
    return id ? `https://drive.google.com/file/d/${id}/view` : texto;
  }

  return { idDoDrive, urlDireta, urlVisualizacao };
});
