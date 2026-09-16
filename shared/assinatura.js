/**
 * Assinatura digital dos PDFs com certificado A1 (.pfx / .p12).
 *
 * Este módulo é compartilhado como os outros (recebe as bibliotecas de quem
 * chama), porque a assinatura acontece **no navegador**: o arquivo do
 * certificado e a senha dele nunca saem do computador de quem assina.
 *
 * O que ele faz, em ordem:
 *   1. abre o .pfx/.p12 e lê o certificado (titular, CNPJ/CPF, emissor, prazo);
 *   2. acrescenta ao PDF uma folha de assinatura (Times New Roman) e o campo
 *      de assinatura do AcroForm, do jeito que o Adobe Reader espera;
 *   3. monta o CMS/PKCS#7 *detached* com os atributos assinados exigidos pelo
 *      perfil PAdES (content-type, message-digest, signing-time e
 *      signing-certificate-v2 — a norma do ICP-Brasil / DOC-ICP-15) e assina
 *      com RSA-SHA256 usando a chave privada do certificado;
 *   4. grava a assinatura no PDF (ByteRange + /Contents) e devolve os bytes.
 *
 * Token/cartão (A3) não funciona aqui: o navegador não alcança a chave privada
 * que vive no hardware. Para A3 o caminho é assinar pelo portal ou por um
 * programa que converse com o token (o PDF continua o mesmo).
 */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) {
    module.exports = fabrica;
  } else {
    raiz.criarAssinatura = fabrica;
  }
})(typeof self !== 'undefined' ? self : this, function (deps) {
  'use strict';

  const forge = deps.forge;
  const PDFLib = deps.pdfLib;
  const addPlaceholder = deps.addPlaceholder;
  const SignPdf = deps.SignPdf;
  const Signer = deps.Signer;
  const Buffer = deps.Buffer;
  const Formato = deps.Formato;

  const asn1 = forge.asn1;
  const OIDS = {
    sha256: '2.16.840.1.101.3.4.2.1',
    rsaEncryption: '1.2.840.113549.1.1.1',
    data: '1.2.840.113549.1.7.1',
    signedData: '1.2.840.113549.1.7.2',
    contentType: '1.2.840.113549.1.9.3',
    messageDigest: '1.2.840.113549.1.9.4',
    signingTime: '1.2.840.113549.1.9.5',
    // ESS signing-certificate-v2 (RFC 5035) — exigido no PAdES do ICP-Brasil
    signingCertificateV2: '1.2.840.113549.1.9.16.2.47',
  };
  // OIDs das "outras informações" do ICP-Brasil (onde vêm CNPJ/CPF e nascimento)
  const OIDS_ICP = {
    '2.16.76.1.3.1': 'nascimento',
    '2.16.76.1.3.3': 'cnpj',
    '2.16.76.1.3.4': 'cpf',
    '2.16.76.1.3.5': 'nis',
    '2.16.76.1.3.6': 'rg',
    '2.16.76.1.3.7': 'cei',
  };
  // o pdf-lib quer as cores no formato dele (rgb com valores de 0 a 1)
  const rgb = (r, g, b) => PDFLib.rgb(r / 255, g / 255, b / 255);
  const COR_AZUL = rgb(0x0b, 0x1f, 0x33);
  const COR_DOURADA = rgb(0x8a, 0x6a, 0x31);
  const COR_CINZA = rgb(0xe8, 0xec, 0xef);
  const COR_BRANCA = rgb(0xff, 0xff, 0xff);
  const COR_CLARA = rgb(0xd8, 0xe2, 0xec);
  const COR_FRACA = rgb(0x73, 0x80, 0x8c);

  // ------------------------------------------------------------------ bytes

  function bytesDe(entrada) {
    if (!entrada) throw new Error('Arquivo vazio.');
    if (entrada instanceof Uint8Array) return entrada;
    if (typeof ArrayBuffer !== 'undefined' && entrada instanceof ArrayBuffer) return new Uint8Array(entrada);
    if (entrada.buffer && entrada.byteLength != null) return new Uint8Array(entrada.buffer, entrada.byteOffset || 0, entrada.byteLength);
    throw new Error('Não entendi o formato do arquivo.');
  }

  /** Uint8Array -> a "string binária" que o forge usa por dentro. */
  function paraBinario(bytes) {
    const lista = bytesDe(bytes);
    let texto = '';
    const passo = 0x8000;
    for (let i = 0; i < lista.length; i += passo) {
      texto += String.fromCharCode.apply(null, lista.subarray(i, i + passo));
    }
    return texto;
  }

  function deBinario(texto) {
    const saida = new Uint8Array(texto.length);
    for (let i = 0; i < texto.length; i += 1) saida[i] = texto.charCodeAt(i) & 0xff;
    return saida;
  }

  function paraBuffer(bytes) {
    const lista = bytesDe(bytes);
    return Buffer.from(lista.buffer.slice(lista.byteOffset, lista.byteOffset + lista.byteLength));
  }

  function sha256Bytes(bytes) {
    const md = forge.md.sha256.create();
    md.update(paraBinario(bytes));
    return deBinario(md.digest().getBytes());
  }

  function hexDosBytes(bytes) {
    return Array.from(bytesDe(bytes))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();
  }

  // ------------------------------------------------------------ certificado

  /** Lê o CNPJ/CPF e o nome de dentro do certificado (padrão ICP-Brasil). */
  function dadosDoTitular(certificado) {
    const partes = [];
    const atributos = (certificado.subject && certificado.subject.attributes) || [];
    atributos.forEach((atributo) => {
      let valor = atributo.value;
      if (valor == null) return;
      if (typeof valor !== 'string') {
        // valores que vêm em DER (as "outras informações" do ICP-Brasil)
        try {
          valor = asn1.fromDer(forge.util.createBuffer(valor)).value;
        } catch (_) {
          valor = String(valor);
        }
      }
      partes.push({ tipo: String(atributo.shortName || atributo.name || atributo.type || ''), oid: atributo.type, valor: String(valor) });
    });

    // nome: o CN do ICP-Brasil vem como "NOME:RAZAO SOCIAL:CNPJ"
    const cn = partes.find((p) => p.tipo === 'CN');
    const bruto = cn ? cn.valor : '';
    const pedacos = bruto.split(':').map((p) => p.trim()).filter(Boolean);
    const soDigitos = (t) => String(t || '').replace(/\D/g, '');
    const ehDocumento = (t) => [11, 14].includes(soDigitos(t).length) && !/\D/.test(String(t || '').trim()) === false || [11, 14].includes(soDigitos(t).length);
    const nome = pedacos[0] || bruto;
    const razaoSocial = pedacos.length > 1 && !ehDocumento(pedacos[1]) ? pedacos[1] : '';

    let documento = '';
    partes.forEach((parte) => {
      const achado = parte.valor.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}|\d{3}\.?\d{3}\.?\d{3}-?\d{2}/);
      if (achado) documento = documento || achado[0];
    });
    const doOid = partes.find((p) => OIDS_ICP[p.oid]);
    if (doOid) {
      const limpo = doOid.valor.replace(/\D/g, '');
      if (limpo.length === 14 || limpo.length === 11) documento = limpo;
    }
    if (!documento && pedacos.length > 2) {
      const ultimo = pedacos[pedacos.length - 1].replace(/\D/g, '');
      if (ultimo.length === 14 || ultimo.length === 11) documento = ultimo;
    }

    const digitos = documento.replace(/\D/g, '');
    let documentoFormatado = documento;
    if (digitos.length === 14) {
      documentoFormatado = digitos.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
    } else if (digitos.length === 11) {
      documentoFormatado = digitos.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
    }

    return {
      titular: nome,
      razaoSocial,
      documento: digitos,
      documentoFormatado,
      tipoDocumento: digitos.length === 14 ? 'CNPJ' : digitos.length === 11 ? 'CPF' : '',
    };
  }

  /** Nome de quem emitiu o certificado (a Autoridade Certificadora). */
  function nomeDoEmissor(certificado) {
    const atributos = (certificado.issuer && certificado.issuer.attributes) || [];
    const valores = atributos.map((a) => String(a.value || '')).filter(Boolean);
    const achar = (tipo) => {
      const achado = atributos.find((a) => a.shortName === tipo || a.name === tipo);
      return achado ? String(achado.value) : '';
    };
    // o nome da AC costuma começar com "AC " (AC Certisign RFB G5, AC Soluti...)
    const autoridade = valores.find((v) => /^AC\s/i.test(v));
    const organizacao = achar('O');
    const comum = achar('CN');
    const escolhida = autoridade || organizacao || comum;
    const extras = [organizacao, comum].filter(
      (v) => v && v !== escolhida && v !== 'ICP-Brasil' && !escolhida.includes(v)
    );
    return [escolhida, ...extras].filter(Boolean).join(' — ');
  }

  /** Lê o arquivo .pfx/.p12 e devolve o que interessa mostrar na tela. */
  function lerCertificado(entrada, senha) {
    let pacote;
    try {
      const der = asn1.fromDer(forge.util.createBuffer(paraBinario(entrada)));
      pacote = forge.pkcs12.pkcs12FromAsn1(der, false, String(senha == null ? '' : senha));
    } catch (erro) {
      const texto = String((erro && erro.message) || '');
      if (/Invalid password|mac could not be verified|too few bytes|PKCS#12/i.test(texto)) {
        throw new Error('Não consegui abrir o certificado: confira a senha do arquivo .pfx/.p12.');
      }
      throw new Error('Este arquivo não parece um certificado .pfx/.p12: ' + texto);
    }

    const certBags = pacote.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || [];
    const chaveCifrada = (pacote.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || [])[0];
    const chaveSimples = (pacote.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] || [])[0];
    const chave = (chaveCifrada && chaveCifrada.key) || (chaveSimples && chaveSimples.key);
    if (!certBags.length) throw new Error('O arquivo não tem nenhum certificado dentro.');
    if (!chave) {
      throw new Error(
        'O arquivo tem o certificado, mas não a chave privada — provavelmente é só a cadeia de certificados. ' +
          'Exporte o certificado inteiro (.pfx/.p12) no programa da Autoridade Certificadora.'
      );
    }

    const titular = certBags.map((bag) => bag.cert).find((cert) => {
      if (!cert || !cert.publicKey || !chave.n || !chave.e) return false;
      return chave.n.compareTo(cert.publicKey.n) === 0 && chave.e.compareTo(cert.publicKey.e) === 0;
    });
    if (!titular) throw new Error('O certificado do titular não combina com a chave privada do arquivo.');

    const validade = {
      de: titular.validity.notBefore,
      ate: titular.validity.notAfter,
    };
    const agora = new Date();
    const fingerprint = forge.md.sha256.create();
    fingerprint.update(asn1.toDer(forge.pki.certificateToAsn1(titular)).getBytes());

    return {
      certificado: Object.assign(dadosDoTitular(titular), {
        emissor: nomeDoEmissor(titular),
        serie: String(titular.serialNumber || '').toUpperCase(),
        validoDe: validade.de.toISOString(),
        validoAte: validade.ate.toISOString(),
        expirado: agora > validade.ate,
        aindaNaoVale: agora < validade.de,
        algoritmo: 'RSA-SHA256',
        impressao: hexDosBytes(deBinario(fingerprint.digest().getBytes())).replace(/(.{2})(?=.)/g, '$1:'),
      }),
      cadeia: certBags.length,
      // material de uso interno (fica só na memória de quem está assinando)
      material: { chave, titular, certificados: certBags.map((bag) => bag.cert) },
    };
  }

  /**
   * O CMS/PKCS#7 que vai dentro do PDF: assinatura *detached* (o conteúdo é o
   * próprio PDF, via ByteRange) com os atributos assinados do PAdES.
   */
  function criarCms(opcoes) {
    const { chave, certificadoDoTitular, cadeia, conteudo, quando } = opcoes;
    const digestConteudo = sha256Bytes(conteudo);

    // --- atributos assinados (na ordem canônica do DER, por isso ordenamos)
    const atributo = (oid, valores) =>
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
        asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer(oid).getBytes()),
        asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SET, true, valores),
      ]);

    const comoUtc = (data) =>
      data.getUTCFullYear() >= 1950 && data.getUTCFullYear() < 2050
        ? asn1.create(asn1.Class.UNIVERSAL, asn1.Type.UTCTIME, false, asn1.dateToUtcTime(data))
        : asn1.create(asn1.Class.UNIVERSAL, asn1.Type.GENERALIZEDTIME, false, asn1.dateToGeneralizedTime(data));

    const certificadoDer = asn1.toDer(forge.pki.certificateToAsn1(certificadoDoTitular));
    const hashDoCertificado = forge.md.sha256.create();
    hashDoCertificado.update(certificadoDer.getBytes());

    const atributos = [
      atributo(OIDS.contentType, [
        asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer(OIDS.data).getBytes()),
      ]),
      atributo(OIDS.signingTime, [comoUtc(quando)]),
      atributo(OIDS.messageDigest, [
        asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OCTETSTRING, false, paraBinario(digestConteudo)),
      ]),
      // ESSCertIDv2 ::= SEQUENCE { hashAlgorithm DEFAULT sha256, certHash OCTET STRING }
      atributo(OIDS.signingCertificateV2, [
        asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
          asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OCTETSTRING, false, hashDoCertificado.digest().getBytes()),
        ]),
      ]),
    ];

    // SET OF ordenado pelo DER de cada elemento (exigência do DER)
    const conjunto = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SET, true, atributos);
    conjunto.value.sort((a, b) => {
      const da = asn1.toDer(a).getBytes();
      const db = asn1.toDer(b).getBytes();
      return da < db ? -1 : da > db ? 1 : 0;
    });
    const atributosDer = asn1.toDer(conjunto).getBytes();

    // a assinatura é sobre o DER do SET (mesmo conteúdo, etiqueta SET universal)
    const md = forge.md.sha256.create();
    md.update(atributosDer);
    // a assinatura RSA vira um OCTET STRING com os bytes crus. O forge pode
    // devolver em hexadecimal ou já em bytes: o tamanho da chave diz qual é.
    const bruto = chave.sign(md, 'RSASSA-PKCS1-V1_5');
    const tamanho = Math.ceil(certificadoDoTitular.publicKey.n.bitLength() / 8);
    let assinaturaDer;
    if (typeof bruto !== 'string') {
      assinaturaDer = bruto.bytes();
    } else if (bruto.length === tamanho * 2 && /^[0-9a-fA-F]+$/.test(bruto)) {
      assinaturaDer = forge.util.hexToBytes(bruto);
    } else {
      assinaturaDer = bruto;
    }

    // no SignerInfo os atributos vão com a etiqueta [0] IMPLICIT
    const atributosAssinados = asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, conjunto.value);

    const algoritmo = (oid) =>
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
        asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer(oid).getBytes()),
        asn1.create(asn1.Class.UNIVERSAL, asn1.Type.NULL, false, ''),
      ]);

    const numeroDeSerie = asn1.create(
      asn1.Class.UNIVERSAL,
      asn1.Type.INTEGER,
      false,
      new forge.jsbn.BigInteger('00' + String(certificadoDoTitular.serialNumber || ''), 16).toString(16)
    );

    const signerInfo = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.INTEGER, false, String.fromCharCode(1)),
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
        forge.pki.distinguishedNameToAsn1(certificadoDoTitular.issuer),
        numeroDeSerie,
      ]),
      algoritmo(OIDS.sha256),
      atributosAssinados,
      algoritmo(OIDS.rsaEncryption),
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OCTETSTRING, false, assinaturaDer),
    ]);

    const certificados = asn1.create(
      asn1.Class.CONTEXT_SPECIFIC,
      0,
      true,
      (cadeia || []).map((cert) => forge.pki.certificateToAsn1(cert))
    );

    const signedData = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.INTEGER, false, String.fromCharCode(1)),
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SET, true, [algoritmo(OIDS.sha256)]),
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
        asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer(OIDS.data).getBytes()),
      ]),
      certificados,
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SET, true, [signerInfo]),
    ]);

    const contentInfo = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer(OIDS.signedData).getBytes()),
      asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, [signedData]),
    ]);

    return deBinario(asn1.toDer(contentInfo).getBytes());
  }

  /**
   * Assinador no formato que o @signpdf espera: recebe o PDF (já com o campo
   * de assinatura) e devolve o CMS pronto.
   */
  function criarAssinador(pacote, certificadoDoTitular, cadeia) {
    class Assinador extends Signer {
      async sign(pdfBuffer, signingTime) {
        return Buffer.from(
          paraBinario(
            criarCms({
              chave: pacote,
              certificadoDoTitular,
              cadeia,
              conteudo: new Uint8Array(pdfBuffer),
              quando: signingTime || new Date(),
            })
          ),
          'binary'
        );
      }
    }
    return new Assinador();
  }

  // ------------------------------------------------------------- folha nova

  /** Monta o texto que aparece na folha de assinatura. */
  function textoDaAssinatura(info, dados, quando, sha256) {
    const data = Formato ? Formato.dataHora(quando) : quando.toLocaleString('pt-BR');
    const validade = (iso) => {
      const d = new Date(iso);
      return isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR');
    };
    const documento = info.documentoFormatado
      ? info.tipoDocumento + ' ' + info.documentoFormatado
      : '';
    return {
      titular: info.titular || 'Titular do certificado',
      linhas: [
        'Documento assinado digitalmente por ' + (info.titular || '—') +
          (documento ? ', ' + documento : '') + '.',
        'Certificado ICP-Brasil emitido por ' + (info.emissor || '—') + '.',
        'Série ' + (info.serie || '—') + ' • válido de ' + validade(info.validoDe) + ' a ' + validade(info.validoAte) + '.',
        'Assinado em ' + data + (dados.local ? ' — ' + dados.local : '') + '.',
        dados.motivo ? 'Motivo: ' + dados.motivo + '.' : '',
        'Para conferir esta assinatura: Adobe Reader (Painel de assinaturas) ou validar.iti.gov.br.',
        'Impressão SHA-256 do arquivo assinado: ' + (sha256 || '—'),
      ].filter(Boolean),
    };
  }

  /** Desenha a folha de assinatura (Times New Roman) e o campo do AcroForm. */
  async function acrescentarFolhaEPlaceholder(bytesPdf, info, dados, quando) {
    const pdfDoc = await PDFLib.PDFDocument.load(bytesPdf, { updateMetadata: false });
    const paginas = pdfDoc.getPages();
    const ultima = paginas[paginas.length - 1];
    const { width, height } = ultima.getSize();
    const nova = pdfDoc.addPage([width, height]);

    const fonte = await pdfDoc.embedFont(PDFLib.StandardFonts.TimesRoman);
    const fonteNegrito = await pdfDoc.embedFont(PDFLib.StandardFonts.TimesRomanBold);
    const margem = 56;
    const larguraUtil = width - margem * 2;

    // faixa dourada/azul no topo, na identidade do sistema
    nova.drawRectangle({ x: 0, y: height - 76, width, height: 76, color: COR_AZUL });
    nova.drawRectangle({ x: 0, y: height - 82, width, height: 6, color: COR_DOURADA });
    nova.drawText('ASSINATURA DIGITAL', {
      x: margem, y: height - 52, size: 17, font: fonteNegrito, color: COR_BRANCA,
    });
    nova.drawText('DEJ Solutions & Global', {
      x: margem, y: height - 70, size: 10, font: fonte, color: COR_CLARA,
    });

    const caixa = { x: margem, y: height - 330, largura: larguraUtil, altura: 210 };
    nova.drawRectangle({
      x: caixa.x, y: caixa.y, width: caixa.largura, height: caixa.altura,
      color: COR_CINZA, borderColor: COR_DOURADA, borderWidth: 1,
    });

    let linhaY = caixa.y + caixa.altura - 26;
    const texto = textoDaAssinatura(info, dados, quando, dados.sha256);
    texto.linhas.forEach((linha, indice) => {
      const cabecalho = indice === 0;
      const tamanho = cabecalho ? 12 : 10;
      const fonteUsada = cabecalho ? fonteNegrito : fonte;
      // quebra simples para caber na largura da caixa
      const palavras = String(linha).split(' ');
      let atual = '';
      const linhas = [];
      palavras.forEach((palavra) => {
        const tentativa = atual ? atual + ' ' + palavra : palavra;
        if (fonteUsada.widthOfTextAtSize(tentativa, tamanho) > caixa.largura - 32) {
          linhas.push(atual);
          atual = palavra;
        } else {
          atual = tentativa;
        }
      });
      if (atual) linhas.push(atual);
      linhas.forEach((pedaco) => {
        nova.drawText(pedaco, {
          x: caixa.x + 16, y: linhaY, size: tamanho, font: fonteUsada,
          color: cabecalho ? COR_DOURADA : COR_AZUL,
        });
        linhaY -= tamanho + 6;
      });
      linhaY -= 2;
    });

    // linha de assinatura, como nos documentos em papel
    const linhaAssinaturaY = caixa.y - 60;
    nova.drawLine({
      start: { x: margem, y: linhaAssinaturaY },
      end: { x: margem + Math.min(300, larguraUtil), y: linhaAssinaturaY },
      thickness: 0.8, color: COR_AZUL,
    });
    nova.drawText(texto.titular, {
      x: margem, y: linhaAssinaturaY - 14, size: 10, font: fonte, color: COR_AZUL,
    });
    nova.drawText('Assinatura digital — a validade pode ser conferida no Adobe Reader', {
      x: margem, y: 40, size: 8, font: fonte, color: COR_FRACA,
    });

    addPlaceholder({
      pdfDoc,
      pdfPage: nova,
      reason: dados.motivo || 'Assinatura da proposta',
      name: dados.nome || info.titular || '',
      location: dados.local || '',
      contactInfo: dados.contato || '',
      signingTime: quando,
      signatureLength: dados.tamanhoAssinatura || 30000,
      subFilter: 'adbe.pkcs7.detached',
      widgetRect: [
        caixa.x,
        caixa.y,
        caixa.x + caixa.largura,
        caixa.y + caixa.altura,
      ],
    });

    // sem object streams: o @signpdf precisa achar o /ByteRange literal no arquivo
    return pdfDoc.save({ useObjectStreams: false });
  }

  /**
   * Assina o PDF. @param opcoes { p12, senha, nome, motivo, local, contato, quando }
   * @returns { pdf: Uint8Array, assinatura: {...} }
   */
  async function assinarPdf(entrada, opcoes) {
    const config = opcoes || {};
    const bytes = bytesDe(entrada);
    const lido = lerCertificado(config.p12, config.senha);
    if (lido.certificado.expirado) {
      throw new Error(
        'O certificado de ' + lido.certificado.titular + ' venceu em ' +
          new Date(lido.certificado.validoAte).toLocaleDateString('pt-BR') + '. Use um certificado dentro da validade.'
      );
    }

    const quando = config.quando instanceof Date ? config.quando : new Date();
    const comFolha = await acrescentarFolhaEPlaceholder(bytes, lido.certificado, config, quando);
    const assinado = await new SignPdf().sign(
      paraBuffer(comFolha),
      criarAssinador(lido.material.chave, lido.material.titular, lido.material.certificados),
      quando
    );
    const pdf = new Uint8Array(assinado);
    const sha256 = hexDosBytes(sha256Bytes(pdf)).replace(/(.{2})(?=.)/g, '$1:');

    return {
      pdf,
      assinatura: {
        em: quando.toISOString(),
        titular: lido.certificado.titular,
        documento: lido.certificado.documentoFormatado,
        tipoDocumento: lido.certificado.tipoDocumento,
        emissor: lido.certificado.emissor,
        serie: lido.certificado.serie,
        validoDe: lido.certificado.validoDe,
        validoAte: lido.certificado.validoAte,
        motivo: config.motivo || '',
        local: config.local || '',
        algoritmo: lido.certificado.algoritmo,
        sha256,
      },
    };
  }

  // ------------------------------------------------------------- conferência

  /** Acha o ByteRange e o /Contents de um PDF assinado. */
  function lerAssinaturaDoPdf(bytes) {
    const texto = paraBinario(bytes);
    const posicao = texto.indexOf('/ByteRange');
    if (posicao < 0) return null;
    const faixa = texto.slice(posicao).match(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/);
    if (!faixa) return null;
    const inicioConteudo = texto.indexOf('<', texto.indexOf('/Contents', posicao));
    const fimConteudo = texto.indexOf('>', inicioConteudo);
    if (inicioConteudo < 0 || fimConteudo < 0) return null;
    const hex = texto.slice(inicioConteudo + 1, fimConteudo).replace(/[^0-9a-fA-F]/g, '');
    return {
      byteRange: [Number(faixa[1]), Number(faixa[2]), Number(faixa[3]), Number(faixa[4])],
      hex,
    };
  }

  /**
   * Confere uma assinatura já feita: recalcula o digest do arquivo e verifica a
   * assinatura RSA com o certificado que está dentro do PDF. Serve tanto para
   * os testes quanto para a tela dizer "esta assinatura confere".
   */
  function conferirPdf(entrada) {
    const bytes = bytesDe(entrada);
    const achado = lerAssinaturaDoPdf(bytes);
    if (!achado) return { assinado: false, integro: false, problemas: ['Este PDF não tem assinatura digital.'] };

    const problemas = [];
    const [a, b, c, d] = achado.byteRange;
    const conteudo = new Uint8Array(b + d);
    conteudo.set(bytes.subarray(a, a + b), 0);
    conteudo.set(bytes.subarray(c, c + d), b);

    const cmsBytes = new Uint8Array(achado.hex.length / 2);
    for (let i = 0; i < cmsBytes.length; i += 1) cmsBytes[i] = parseInt(achado.hex.substr(i * 2, 2), 16);

    let arvore;
    let mensagem;
    try {
      // o /Contents é maior que a assinatura: o resto é preenchido com zeros,
      // então lemos só o primeiro objeto DER (parseAllBytes: false)
      arvore = asn1.fromDer(forge.util.createBuffer(paraBinario(cmsBytes)), {
        strict: false,
        parseAllBytes: false,
      });
      mensagem = forge.pkcs7.messageFromAsn1(arvore);
    } catch (erro) {
      return { assinado: true, integro: false, problemas: ['Não consegui ler a assinatura: ' + erro.message] };
    }

    // ---- percorre o ASN.1 para achar os atributos assinados e a assinatura
    let signerInfo = null;
    try {
      const signedData = arvore.value[1].value[0];
      const conjuntoDeSigners = signedData.value[signedData.value.length - 1];
      signerInfo = conjuntoDeSigners.value[0];
    } catch (_) {
      return { assinado: true, integro: false, problemas: ['A assinatura está num formato que não reconheci.'] };
    }
    const atributos = signerInfo.value.find((el) => el.tagClass === 128 && el.type === 0);
    const assinaturaDer = signerInfo.value[signerInfo.value.length - 1];
    if (!atributos) problemas.push('A assinatura não traz os atributos assinados (não é PAdES).');

    // ---- digest do conteúdo
    const digestCalculado = hexDosBytes(sha256Bytes(conteudo));
    let digestAssinado = '';
    if (atributos) {
      atributos.value.forEach((attr) => {
        const oid = asn1.derToOid(attr.value[0].value);
        if (oid === OIDS.messageDigest) digestAssinado = forge.util.bytesToHex(attr.value[1].value[0].value);
      });
      if (!digestAssinado) problemas.push('A assinatura não traz o resumo (message-digest) do documento.');
      else if (digestAssinado.toLowerCase() !== digestCalculado.toLowerCase()) {
        problemas.push('O arquivo mudou depois de assinado (o resumo não confere).');
      }
    }

    // ---- verificação RSA com o certificado do próprio PDF.
    // O serial do assinante está no SignerInfo (o forge não converte os
    // assinantes na leitura, então lemos o próprio ASN.1)
    let serialDoSigner = '';
    try {
      const numeroDeSerie = signerInfo.value[1].value[1];
      serialDoSigner = String(numeroDeSerie.value || '')
        .split('')
        .map((c) => c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join('')
        .replace(/^0+/, '')
        .toLowerCase();
    } catch (_) {
      /* sem serial: cai no primeiro certificado do pacote */
    }
    const certificado = (mensagem.certificates || []).find((cert) =>
      String(cert.serialNumber || '').replace(/^0+/, '').toLowerCase() === serialDoSigner
    ) || (mensagem.certificates || [])[0];
    let assinaturaOk = false;
    if (certificado && atributos && assinaturaDer) {
      try {
        const conjunto = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SET, true, atributos.value);
        const md = forge.md.sha256.create();
        md.update(asn1.toDer(conjunto).getBytes());
        // o forge quer a assinatura como bytes (binary string) e o resumo idem
        assinaturaOk = certificado.publicKey.verify(md.digest().bytes(), assinaturaDer.value);
      } catch (erro) {
        problemas.push('Não consegui conferir a assinatura: ' + erro.message);
      }
    }
    if (certificado && !assinaturaOk && !problemas.some((p) => /resumo/.test(p))) {
      problemas.push('A assinatura não confere com o certificado.');
    }

    let quando = '';
    if (atributos) {
      atributos.value.forEach((attr) => {
        const oid = asn1.derToOid(attr.value[0].value);
        if (oid === OIDS.signingTime) {
          const valor = attr.value[1].value[0];
          quando = valor.type === asn1.Type.UTCTIME
            ? asn1.utcTimeToDate(valor.value).toISOString()
            : asn1.generalizedTimeToDate(valor.value).toISOString();
        }
      });
    }

    const info = certificado ? dadosDoTitular(certificado) : {};
    return {
      assinado: true,
      integro: assinaturaOk && problemas.length === 0,
      titular: info.titular || '',
      documento: info.documentoFormatado || '',
      emissor: certificado ? nomeDoEmissor(certificado) : '',
      serie: certificado ? String(certificado.serialNumber || '').toUpperCase() : '',
      quando,
      problemas,
    };
  }

  function nomeArquivoAssinado(nome) {
    const limpo = String(nome || 'documento.pdf');
    return limpo.replace(/\.pdf$/i, '') + '_assinado.pdf';
  }

  return {
    lerCertificado,
    assinarPdf,
    conferirPdf,
    nomeArquivoAssinado,
    OIDS,
  };
});
