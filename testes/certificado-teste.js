'use strict';

/**
 * Certificado de mentira para os testes, no formato do ICP-Brasil (e-CNPJ):
 * CN "NOME:RAZAO SOCIAL:CNPJ", o OID 2.16.76.1.3.3 com o CNPJ e a AC no
 * emissor. Sai um arquivo .pfx/.p12 com a senha informada, exatamente como o
 * que a pessoa importa no sistema.
 */

const forge = require('node-forge');

const CNPJ = '65180352000111';
const SENHA = 'senha-do-certificado';

function criarCertificadoFallback(opcoes = {}) {
  const cn = opcoes.cn || 'JOAO DA SILVA:DEJ SOLUTIONS & GLOBAL LTDA:' + CNPJ;
  const dias = opcoes.dias == null ? 365 : opcoes.dias;
  const chaves = forge.pki.rsa.generateKeyPair(2048);
  const certificado = forge.pki.createCertificate();
  certificado.publicKey = chaves.publicKey;
  certificado.serialNumber = '01' + forge.util.bytesToHex(forge.random.getBytesSync(8));
  certificado.validity.notBefore = new Date(Date.now() - 86400000);
  certificado.validity.notAfter = new Date(Date.now() + dias * 86400000);

  const atributos = [
    { name: 'commonName', value: cn },
    { name: 'organizationName', value: 'AC Certisign RFB G5' },
    { name: 'organizationalUnitName', value: 'Certificado Digital A1' },
    { name: 'countryName', value: 'BR' },
  ];
  certificado.setSubject(atributos);
  certificado.setIssuer(atributos);
  certificado.setExtensions([
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, nonRepudiation: true },
    { name: 'extKeyUsage', clientAuth: true, emailProtection: true },
  ]);
  // o CNPJ vem nas "outras informações" do ICP-Brasil
  certificado.subject.addField({ type: '2.16.76.1.3.3', value: CNPJ });
  certificado.sign(chaves.privateKey, forge.md.sha256.create());

  const pacote = forge.pkcs12.toPkcs12Asn1(chaves.privateKey, [certificado], opcoes.senha || SENHA, {
    algorithm: '3des',
  });
  return {
    p12: new Uint8Array(Buffer.from(forge.asn1.toDer(pacote).getBytes(), 'binary')),
    chaves,
    certificado,
    senha: opcoes.senha || SENHA,
  };
}

module.exports = { criarCertificado: criarCertificadoFallback, CNPJ, SENHA };
