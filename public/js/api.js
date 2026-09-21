/* Comunicação com o servidor. */
(function () {
  'use strict';

  async function tratar(resposta) {
    const tipo = resposta.headers.get('content-type') || '';
    const ehJson = tipo.includes('application/json');
    let corpo = null;
    if (ehJson) corpo = await resposta.json().catch(() => null);

    if (!resposta.ok) {
      const erro = new Error((corpo && (corpo.erro || corpo.message)) || `Erro ${resposta.status}`);
      erro.status = resposta.status;
      erro.corpo = corpo;
      // resposta sem JSON significa que não há API neste endereço (site estático)
      if (!ehJson) erro.semServidor = true;
      throw erro;
    }
    // todas as rotas /api respondem JSON; qualquer outra coisa indica site estático
    if (!ehJson) {
      const erro = new Error('Este endereço não tem a API do sistema.');
      erro.status = resposta.status;
      erro.semServidor = true;
      throw erro;
    }
    return corpo;
  }

  /**
   * Fotos que não puderam ser usadas no PDF (link fora do ar, formato não aceito,
   * arquivo corrompido). O servidor e o modo local avisam por cabeçalho, e a tela
   * mostra o aviso em vez de deixar a foto sumir sem explicação.
   */
  function lerFotosIgnoradas(resposta) {
    const cabecalho = (nome) => {
      try {
        return resposta.headers.get(nome);
      } catch (_) {
        return null;
      }
    };
    const quantidade = Number(cabecalho('x-fotos-ignoradas') || 0) || 0;
    let detalhe = cabecalho('x-fotos-ignoradas-detalhe') || '';
    if (detalhe) {
      try {
        detalhe = decodeURIComponent(detalhe);
      } catch (_) { /* mantém o texto como veio */ }
    }
    return { fotosIgnoradas: quantidade, detalheFotosIgnoradas: detalhe };
  }

  const API = {
    ultimasFotosIgnoradas: { fotosIgnoradas: 0, detalheFotosIgnoradas: '' },
    async pedir(caminho, opcoes) {
      const config = Object.assign({ credentials: 'same-origin', headers: {} }, opcoes || {});
      if (config.corpo !== undefined) {
        config.headers['Content-Type'] = 'application/json';
        config.body = JSON.stringify(config.corpo);
        delete config.corpo;
      }
      const resposta = await fetch(caminho, config);
      return tratar(resposta);
    },
    get(caminho) {
      return this.pedir(caminho, { method: 'GET' });
    },
    post(caminho, corpo) {
      return this.pedir(caminho, { method: 'POST', corpo });
    },
    put(caminho, corpo) {
      return this.pedir(caminho, { method: 'PUT', corpo });
    },
    del(caminho) {
      return this.pedir(caminho, { method: 'DELETE' });
    },
    /** Envia um arquivo (multipart/form-data). */
    async enviarArquivo(caminho, arquivo, nomeCampo) {
      const dados = new FormData();
      dados.append(nomeCampo || 'arquivo', arquivo);
      const resposta = await fetch(caminho, { method: 'POST', body: dados, credentials: 'same-origin' });
      return tratar(resposta);
    },
    /** Baixa um arquivo binário (PDF, planilha) e devolve também o nome sugerido. */
    async baixar(caminho) {
      const resposta = await fetch(caminho, { credentials: 'same-origin' });
      if (!resposta.ok) {
        let mensagem = `Erro ${resposta.status}`;
        try {
          const corpo = await resposta.json();
          mensagem = corpo.erro || mensagem;
        } catch (_) { /* resposta não é JSON */ }
        throw new Error(mensagem);
      }
      const blob = await resposta.blob();
      let nomeArquivo = 'documento.pdf';
      const disposicao = resposta.headers.get('content-disposition') || '';
      const utf8 = disposicao.match(/filename\*=UTF-8''([^;]+)/i);
      const simples = disposicao.match(/filename="([^"]+)"/i);
      if (utf8) nomeArquivo = decodeURIComponent(utf8[1]);
      else if (simples) nomeArquivo = simples[1];
      const fotos = lerFotosIgnoradas(resposta);
      API.ultimasFotosIgnoradas = fotos;
      return Object.assign({ blob, nomeArquivo }, fotos);
    },
    /** Gera o PDF a partir dos dados em tela (sem salvar). */
    /**
     * Folha da declaração: o PDF timbrado (mesmo padrão da proposta) de uma ou
     * mais declarações, sem imprimir o documento inteiro.
     */
    async pdfDeclaracao(declaracoes, documento) {
      const lista = Array.isArray(declaracoes) ? declaracoes : [declaracoes];
      const resposta = await fetch('/api/declaracoes/pdf', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ declaracoes: lista, documento: documento || null }),
      });
      if (!resposta.ok) {
        let mensagem = 'Não foi possível gerar a declaração.';
        try {
          const corpo = await resposta.json();
          mensagem = corpo.erro || mensagem;
        } catch (_) { /* resposta não é JSON */ }
        throw new Error(mensagem);
      }
      const blob = await resposta.blob();
      const disposicao = resposta.headers.get('content-disposition') || '';
      const nome = /filename="([^"]+)"/.exec(disposicao);
      const vazios = resposta.headers.get('x-campos-vazios') || '';
      const aviso = vazios ? decodeURIComponent(vazios).split(',').filter(Boolean) : [];
      // a tela usa o mesmo aviso das fotos ignoradas
      window.API.ultimasFotosIgnoradas = {
        fotosIgnoradas: Number(resposta.headers.get('x-fotos-ignoradas') || 0),
        detalheFotosIgnoradas: resposta.headers.get('x-fotos-ignoradas-detalhe')
          ? decodeURIComponent(resposta.headers.get('x-fotos-ignoradas-detalhe'))
          : '',
      };
      return { blob, nomeArquivo: nome ? nome[1] : 'declaracao.pdf', camposVazios: aviso };
    },

    async previaPdf(documento) {
      const resposta = await fetch('/api/documentos/previa-pdf', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(documento),
      });
      if (!resposta.ok) {
        let mensagem = 'Não foi possível gerar a pré-visualização.';
        try {
          const corpo = await resposta.json();
          mensagem = corpo.erro || mensagem;
        } catch (_) { /* ignora */ }
        throw new Error(mensagem);
      }
      API.ultimasFotosIgnoradas = lerFotosIgnoradas(resposta);
      return resposta.blob();
    },
    /** Dispara o download de um blob com o nome de arquivo informado. */
    baixarBlob(blob, nomeArquivo) {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = nomeArquivo;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    },
  };

  window.API = API;
})();
