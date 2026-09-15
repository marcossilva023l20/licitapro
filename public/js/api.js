/* Comunicação com o servidor. */
(function () {
  'use strict';

  async function tratar(resposta) {
    const tipo = resposta.headers.get('content-type') || '';
    let corpo = null;
    if (tipo.includes('application/json')) {
      corpo = await resposta.json().catch(() => null);
    }
    if (!resposta.ok) {
      const erro = new Error((corpo && (corpo.erro || corpo.message)) || `Erro ${resposta.status}`);
      erro.status = resposta.status;
      erro.corpo = corpo;
      throw erro;
    }
    return corpo;
  }

  const API = {
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
      return { blob, nomeArquivo };
    },
    /** Gera o PDF a partir dos dados em tela (sem salvar). */
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
