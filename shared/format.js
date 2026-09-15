/**
 * Formatações em português do Brasil.
 * Este arquivo roda tanto no Node (server) quanto no navegador (public).
 * No navegador fica disponível como window.Formato.
 */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) {
    module.exports = fabrica();
  } else {
    raiz.Formato = fabrica();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MESES = [
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
  ];

  /**
   * Converte texto digitado pelo usuário em número.
   * Aceita "R$ 1.490,00", "1490,5", "1.490", "1490.90" e "1490".
   * Como o sistema é brasileiro, um ponto seguido de exatamente 3 dígitos
   * é tratado como separador de milhar ("1.490" = mil quatrocentos e noventa).
   */
  function paraNumero(valor) {
    if (valor === null || valor === undefined || valor === '') return 0;
    if (typeof valor === 'number') return isFinite(valor) ? valor : 0;
    let texto = String(valor).trim().replace(/[Rr]\$\s?/g, '').replace(/\s/g, '');
    if (!texto) return 0;
    texto = texto.replace(/[^0-9.,-]/g, '');
    if (!texto) return 0;

    const temVirgula = texto.includes(',');
    const temPonto = texto.includes('.');
    const partesPorPonto = texto.split('.');

    if (temVirgula && temPonto) {
      // formato brasileiro: 1.490,55
      texto = texto.replace(/\./g, '').replace(',', '.');
    } else if (temVirgula) {
      texto = texto.replace(',', '.');
    } else if (temPonto) {
      const ultimoGrupo = partesPorPonto[partesPorPonto.length - 1];
      const ehMilhar = partesPorPonto.length > 2 || ultimoGrupo.length === 3;
      if (ehMilhar) texto = partesPorPonto.join('');
    }

    const numero = parseFloat(texto);
    return isFinite(numero) ? numero : 0;
  }

  function numero(valor, casas) {
    const n = paraNumero(valor);
    const dec = casas === undefined ? 2 : casas;
    return n.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }

  function moeda(valor) {
    const n = paraNumero(valor);
    return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /** Quantidade: sem decimais quando for inteira. */
  function quantidade(valor) {
    const n = paraNumero(valor);
    return Number.isInteger(n)
      ? n.toLocaleString('pt-BR')
      : n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function dataISO(valor) {
    if (!valor) return '';
    if (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor)) return valor;
    const d = valor instanceof Date ? valor : new Date(valor);
    if (isNaN(d.getTime())) return '';
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mes}-${dia}`;
  }

  function dataBR(valor) {
    const iso = dataISO(valor);
    if (!iso) return '';
    const [a, m, d] = iso.split('-');
    return `${d}/${m}/${a}`;
  }

  /** "30 de abril de 2026" */
  function dataLonga(valor) {
    const iso = dataISO(valor);
    if (!iso) return '';
    const [a, m, d] = iso.split('-').map(Number);
    return `${d} de ${MESES[m - 1]} de ${a}`;
  }

  /** "30/04/2026 14:35" */
  function dataHora(valor) {
    if (!valor) return '';
    const d = new Date(valor);
    if (isNaN(d.getTime())) return '';
    return (
      d.toLocaleDateString('pt-BR') +
      ' ' +
      d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    );
  }

  // ------------------------------------------------------- valor por extenso

  const UNIDADES = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
  const DEZ_A_DEZENOVE = [
    'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze',
    'dezesseis', 'dezessete', 'dezoito', 'dezenove',
  ];
  const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  const CENTENAS = [
    '', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos',
    'seiscentos', 'setecentos', 'oitocentos', 'novecentos',
  ];

  function centenaPorExtenso(n) {
    if (n === 100) return 'cem';
    const c = Math.floor(n / 100);
    const resto = n % 100;
    const partes = [];
    if (c > 0) partes.push(CENTENAS[c]);
    if (resto > 0) {
      if (resto < 10) partes.push(UNIDADES[resto]);
      else if (resto < 20) partes.push(DEZ_A_DEZENOVE[resto - 10]);
      else {
        const d = Math.floor(resto / 10);
        const u = resto % 10;
        partes.push(u > 0 ? `${DEZENAS[d]} e ${UNIDADES[u]}` : DEZENAS[d]);
      }
    }
    return partes.join(' e ');
  }

  /** Número inteiro em palavras (até trilhões). */
  function inteiroPorExtenso(valor) {
    let n = Math.floor(Math.abs(paraNumero(valor)));
    if (n === 0) return 'zero';

    const grupos = [];
    const nomes = [
      { singular: '', plural: '' }, // unidades
      { singular: 'mil', plural: 'mil' },
      { singular: 'milhão', plural: 'milhões' },
      { singular: 'bilhão', plural: 'bilhões' },
      { singular: 'trilhão', plural: 'trilhões' },
    ];

    let indice = 0;
    while (n > 0 && indice < nomes.length) {
      const grupo = n % 1000;
      if (grupo > 0) {
        const nome = nomes[indice];
        // em português não se diz "um mil", e sim "mil"
        let texto = grupo === 1 && indice === 1 ? '' : centenaPorExtenso(grupo);
        if (nome.singular) {
          const quantidade = grupo === 1 ? nome.singular : nome.plural;
          texto = texto ? `${texto} ${quantidade}` : quantidade;
        }
        grupos.unshift({ texto, valor: grupo, indice });
      }
      n = Math.floor(n / 1000);
      indice += 1;
    }

    let resultado = '';
    grupos.forEach((g, i) => {
      if (i === 0) {
        resultado = g.texto;
        return;
      }
      // "e" quando o grupo seguinte é menor que 100 ou múltiplo de 100:
      // "mil e cem", "mil e cinquenta", "um milhão e quinhentos mil".
      const usaE = g.valor < 100 || g.valor % 100 === 0;
      // depois de milhão/bilhão usa-se vírgula: "um milhão, duzentos mil, trezentos e quarenta".
      const separador = usaE ? ' e ' : grupos[i - 1].indice >= 2 ? ', ' : ' ';
      resultado += separador + g.texto;
    });

    return resultado;
  }

  /** "oito mil novecentos e quarenta reais" — usado no total da proposta. */
  function moedaPorExtenso(valor) {
    const n = Math.round(Math.abs(paraNumero(valor)) * 100);
    const reais = Math.floor(n / 100);
    const centavos = n % 100;

    const partes = [];
    if (reais > 0) {
      const texto = inteiroPorExtenso(reais);
      const terminaEmGrande = /(milhão|milhões|bilhão|bilhões|trilhão|trilhões)$/.test(texto);
      const moedaNome = reais === 1 ? 'real' : 'reais';
      partes.push(`${texto} ${terminaEmGrande ? 'de ' : ''}${moedaNome}`);
    }
    if (centavos > 0) {
      partes.push(`${inteiroPorExtenso(centavos)} ${centavos === 1 ? 'centavo' : 'centavos'}`);
    }
    if (!partes.length) return 'zero real';
    return partes.join(' e ');
  }

  function porExtenso(valor) {
    return inteiroPorExtenso(valor);
  }

  // ------------------------------------------------------------ documentos

  function somenteDigitos(valor) {
    return String(valor || '').replace(/\D/g, '');
  }

  function cnpj(valor) {
    const d = somenteDigitos(valor).slice(0, 14);
    return d
      .replace(/^(\d{2})(\d)/, '$1.$2')
      .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1/$2')
      .replace(/(\d{4})(\d)/, '$1-$2');
  }

  function cpf(valor) {
    const d = somenteDigitos(valor).slice(0, 11);
    return d.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/(\d{3})(\d)/, '$1-$2');
  }

  function cep(valor) {
    const d = somenteDigitos(valor).slice(0, 8);
    return d.replace(/^(\d{5})(\d)/, '$1-$2');
  }

  function telefone(valor) {
    const d = somenteDigitos(valor).slice(0, 11);
    if (d.length <= 10) {
      return d.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2');
    }
    return d.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
  }

  function documento(valor) {
    const d = somenteDigitos(valor);
    if (d.length === 14) return cnpj(d);
    if (d.length === 11) return cpf(d);
    return valor || '';
  }

  // ------------------------------------------------- ------------- utilidade

  function escapar(texto) {
    return String(texto === null || texto === undefined ? '' : texto)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function slug(texto) {
    return String(texto || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();
  }

  function primeiroNome(nome) {
    return String(nome || '').trim().split(/\s+/)[0] || '';
  }

  function iniciais(texto) {
    const partes = String(texto || '').trim().split(/\s+/).filter(Boolean);
    if (!partes.length) return '?';
    if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
    return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
  }

  function textoOuTraco(valor) {
    const t = String(valor === null || valor === undefined ? '' : valor).trim();
    return t || '—';
  }

  function arredondar(valor, casas) {
    const fator = Math.pow(10, casas === undefined ? 2 : casas);
    return Math.round((paraNumero(valor) + Number.EPSILON) * fator) / fator;
  }

  function numeroDocumento(sequencial, ano) {
    return `${String(sequencial).padStart(3, '0')}/${ano}`;
  }

  return {
    MESES,
    paraNumero,
    numero,
    moeda,
    quantidade,
    dataISO,
    dataBR,
    dataLonga,
    dataHora,
    porExtenso,
    moedaPorExtenso,
    cnpj,
    cpf,
    cep,
    telefone,
    documento,
    somenteDigitos,
    escapar,
    slug,
    primeiroNome,
    iniciais,
    textoOuTraco,
    arredondar,
    numeroDocumento,
  };
});
