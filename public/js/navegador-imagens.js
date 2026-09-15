/*
 * Resolve imagens para o gerador de PDF quando o sistema roda no navegador.
 *
 * O pdfmake só entende duas coisas numa imagem: um data URL de PNG ou JPEG
 * (navegador) ou um caminho de arquivo (Node). Qualquer outra coisa — link
 * http, blob:, GIF, WebP, HEIC — faz a geração do PDF inteira falhar com
 * "Unknown image format". Aqui tudo é normalizado:
 *   link / blob / arquivo enviado → data URL de PNG ou JPEG (convertendo
 *   quando o formato não é aceito).
 */
(function () {
  'use strict';

  const Links = window.ImagensLinks || { urlDireta: (u) => u };
  const cache = new Map(); // endereço -> data URL
  const FORMATO_FOTO = /^data:image\/(png|jpe?g);/i;
  const LARGURA_MAXIMA = 1200;

  function blobParaDataUrl(blob) {
    return new Promise((resolver, rejeitar) => {
      const leitor = new FileReader();
      leitor.onload = () => resolver(leitor.result);
      leitor.onerror = () => rejeitar(new Error('Não foi possível ler a imagem.'));
      leitor.readAsDataURL(blob);
    });
  }

  /** Formato real do arquivo, pelos primeiros bytes (mais confiável que o tipo informado). */
  async function formatoDoBlob(blob) {
    try {
      const bytes = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
      if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
      if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png';
      if (bytes.length >= 3 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'gif';
      if (bytes.length >= 12 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'webp';
      return '';
    } catch (_) {
      return '';
    }
  }

  /**
   * Desenha a imagem num canvas e devolve um JPEG (é o formato que o PDF aceita
   * para tudo que não é PNG/JPEG: GIF, WebP, BMP, HEIC quando o navegador sabe ler).
   * Devolve null quando não for possível.
   */
  function converterParaJpeg(blob, larguraMaxima) {
    return new Promise((resolver) => {
      let url = '';
      let encerrado = false;
      const encerrar = (resultado) => {
        if (encerrado) return;
        encerrado = true;
        clearTimeout(prazo);
        if (url) URL.revokeObjectURL(url);
        resolver(resultado || null);
      };
      // rede de segurança: nunca deixar a geração do PDF travada por uma imagem
      const prazo = setTimeout(() => encerrar(null), 6000);

      let imagem;
      try {
        url = URL.createObjectURL(blob);
        imagem = new Image();
      } catch (_) {
        return encerrar(null);
      }

      imagem.onload = () => {
        try {
          const limite = larguraMaxima || LARGURA_MAXIMA;
          const largura = imagem.width || imagem.naturalWidth || limite;
          const altura = imagem.height || imagem.naturalHeight || limite;
          const escala = Math.min(1, limite / largura);
          const tela = document.createElement('canvas');
          tela.width = Math.max(1, Math.round(largura * escala));
          tela.height = Math.max(1, Math.round(altura * escala));
          const contexto = tela.getContext('2d');
          contexto.fillStyle = '#ffffff';
          contexto.fillRect(0, 0, tela.width, tela.height);
          contexto.drawImage(imagem, 0, 0, tela.width, tela.height);
          if (typeof tela.toBlob !== 'function') return encerrar(null);
          tela.toBlob((saida) => encerrar(saida), 'image/jpeg', 0.9);
        } catch (_) {
          encerrar(null);
        }
      };
      imagem.onerror = () => encerrar(null);
      imagem.src = url;
    });
  }

  /** Devolve um data URL de PNG/JPEG (convertendo quando necessário) ou null. */
  async function blobParaImagemPdf(blob, larguraMaxima) {
    if (!blob || !blob.size) return null;
    const formato = await formatoDoBlob(blob);
    if (formato === 'jpeg' || formato === 'png') return blobParaDataUrl(blob);
    const convertido = await converterParaJpeg(blob, larguraMaxima);
    return convertido ? blobParaDataUrl(convertido) : null;
  }

  /** Reduz a imagem para caber no documento (sempre em JPEG). */
  async function reduzirParaJpeg(blob, larguraMaxima) {
    const convertido = await converterParaJpeg(blob, larguraMaxima);
    return convertido && convertido.size < blob.size ? convertido : null;
  }

  /**
   * Prepara um arquivo escolhido pelo usuário para ser guardado.
   * Devolve um Blob de PNG/JPEG e lança erro explicativo quando o formato
   * não pode ser usado no PDF.
   */
  async function prepararParaEnvio(arquivo, larguraMaxima) {
    const nome = String((arquivo && arquivo.name) || 'imagem');
    const tipo = String((arquivo && arquivo.type) || '').toLowerCase();
    const formato = await formatoDoBlob(arquivo);

    if (formato === 'png' || formato === 'jpeg') {
      if (!(await decodifica(arquivo))) {
        throw new Error('Não consegui abrir "' + nome + '": o arquivo parece estar corrompido. Envie outra imagem.');
      }
      if (formato === 'png' && arquivo.size <= 900 * 1024) return arquivo; // PNG é aceito no PDF como está
      const menor = await reduzirParaJpeg(arquivo, larguraMaxima);
      return menor || arquivo;
    }

    if (!formato && !/^image\//i.test(tipo)) {
      throw new Error('"' + nome + '" não é uma imagem. Envie um arquivo .jpg ou .png.');
    }

    const convertido = await converterParaJpeg(arquivo, larguraMaxima);
    if (!convertido) {
      throw new Error(
        'Não consegui usar "' + nome + '": este formato não entra no PDF. ' +
        'Envie a foto como .jpg ou .png.'
      );
    }
    return convertido;
  }

  /** Busca uma imagem (link, blob ou data URL) e devolve um data URL de PNG/JPEG. */
  async function paraDataUrl(url) {
    if (cache.has(url)) return cache.get(url);
    const resposta = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (!resposta.ok) throw new Error('HTTP ' + resposta.status);
    const blob = await resposta.blob();
    const dataUrl = await blobParaImagemPdf(blob);
    if (!dataUrl) throw new Error('o conteúdo do link não é uma imagem aceita no PDF');
    cache.set(url, dataUrl);
    return dataUrl;
  }

  /** Obtém os bytes da imagem a partir de uma referência (idb:, data:, http, blob:, /api/uploads/). */
  async function obterBlob(texto) {
    if (texto.startsWith('idb:')) {
      return window.ModoEstatico ? await window.ModoEstatico.lerImagemBlob(texto.slice(4)) : null;
    }
    if (texto.startsWith('data:')) {
      const resposta = await fetch(texto);
      if (!resposta.ok) return null;
      return resposta.blob();
    }
    const direta = /^https?:/i.test(texto) ? Links.urlDireta(texto) : texto;
    if (!/^(https?:|blob:|\/api\/uploads\/)/i.test(direta)) return null;
    const resposta = await fetch(direta, { mode: 'cors', credentials: 'omit' });
    if (!resposta.ok) throw new Error('HTTP ' + resposta.status);
    return resposta.blob();
  }

  /**
   * Confere se a imagem abre de verdade no navegador.
   * Um arquivo corrompido passaria apenas pela conferência de tipo e faria a
   * geração do PDF inteira falhar.
   */
  function decodifica(origem) {
    return new Promise((resolver) => {
      let url = '';
      let encerrado = false;
      const encerrar = (ok) => {
        if (encerrado) return;
        encerrado = true;
        clearTimeout(prazo);
        if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
        resolver(Boolean(ok));
      };
      const prazo = setTimeout(() => encerrar(false), 6000);

      let imagem;
      try {
        url = typeof origem === 'string' ? origem : URL.createObjectURL(origem);
        imagem = new Image();
      } catch (_) {
        return encerrar(false);
      }
      imagem.onload = () => encerrar(true);
      imagem.onerror = () => encerrar(false);
      imagem.src = url;
    });
  }

  /**
   * Interface esperada pelo gerador de PDF compartilhado:
   * devolve { imagem } com um data URL de PNG/JPEG, ou null quando a imagem
   * não existir/não puder ser usada (o PDF então mostra um traço no lugar).
   */
  async function prepararParaPdf(referencia) {
    const texto = String(referencia || '').trim();
    if (!texto) return null;

    if (texto.startsWith('data:')) {
      if (FORMATO_FOTO.test(texto)) {
        // confere se abre mesmo: imagem corrompida derrubaria a geração do PDF
        return (await decodifica(texto)) ? { imagem: texto } : null;
      }
      // GIF, WebP, HEIC embutidos: converte antes de entregar ao pdfmake
      try {
        const blob = await obterBlob(texto);
        const dataUrl = blob ? await blobParaImagemPdf(blob) : null;
        return dataUrl ? { imagem: dataUrl } : null;
      } catch (_) {
        return null;
      }
    }

    try {
      const blob = await obterBlob(texto);
      if (!blob) return null;
      const dataUrl = await blobParaImagemPdf(blob);
      return dataUrl ? { imagem: dataUrl } : null;
    } catch (_) {
      return null;
    }
  }

  window.ImagensNavegador = {
    prepararParaPdf,
    paraDataUrl,
    blobParaDataUrl,
    blobParaImagemPdf,
    formatosAceitos: ['image/png', 'image/jpeg'],
    prepararParaEnvio,
    decodifica,
    urlDireta: Links.urlDireta,
  };
})();
