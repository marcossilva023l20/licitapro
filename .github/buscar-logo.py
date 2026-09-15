"""Baixa a logo da marca do Google Drive e prepara uma versão leve.

Saída: public/marca/logo.png (o menor arquivo entre PNG, PNG-256 e JPG, em até
512 px), /tmp/b64.txt (base64 em linhas de 3900) e /tmp/previa.txt (miniatura).
"""
import base64
import hashlib
import io
import os
import re
import sys
import textwrap
import urllib.request

from PIL import Image

url = os.environ.get("LOGO_URL", "").strip()
achado = re.search(r"/d/([A-Za-z0-9_-]{15,})", url) or re.search(r"[?&]id=([A-Za-z0-9_-]{15,})", url)
fid = achado.group(1) if achado else None
print("ID do arquivo:", fid)

candidatos = []
if fid:
    candidatos += [
        "https://drive.usercontent.google.com/download?id=%s&export=download&confirm=t" % fid,
        "https://drive.google.com/uc?export=download&id=%s" % fid,
        "https://docs.google.com/uc?export=download&id=%s" % fid,
        "https://drive.google.com/uc?id=%s&export=png" % fid,
        "https://lh3.googleusercontent.com/d/%s=w2400" % fid,
        "https://lh3.googleusercontent.com/d/%s" % fid,
    ]
candidatos.append(url)


def eh_imagem(dados):
    return (
        dados[:8] == b"\x89PNG\r\n\x1a\n"
        or dados[:3] == b"\xff\xd8\xff"
        or dados[:4] == b"RIFF"
    )


dados = None
for c in candidatos:
    if not c:
        continue
    try:
        pedido = urllib.request.Request(c, headers={"User-Agent": "Mozilla/5.0 (github-actions)"})
        with urllib.request.urlopen(pedido, timeout=60) as resposta:
            corpo = resposta.read()
        print("tentativa %s -> %d bytes, inicio %r" % (c[:90], len(corpo), corpo[:8]))
        if eh_imagem(corpo):
            dados = corpo
            break
        print("  resposta nao e imagem")
    except Exception as erro:  # noqa: BLE001
        print("tentativa %s falhou: %s" % (c[:90], erro))

if dados is None:
    print("NAO_FOI_POSSIVEL_BAIXAR")
    sys.exit(1)

original = Image.open(io.BytesIO(dados))
original.load()
print("origem: %s %s %s" % (original.format, original.size, original.mode))

alfa = original.mode in ("RGBA", "LA") or "transparency" in original.info
base = original.convert("RGBA") if alfa else original.convert("RGB")
if max(base.size) > 512:
    fator = 512 / max(base.size)
    base = base.resize(
        (max(1, round(base.width * fator)), max(1, round(base.height * fator))), Image.LANCZOS
    )

variantes = {}
buffer = io.BytesIO()
base.save(buffer, "PNG", optimize=True)
variantes["png"] = buffer.getvalue()

if alfa:
    try:
        quantizada = base.convert("RGBA").quantize(colors=256, method=Image.FASTOCTREE)
        buffer = io.BytesIO()
        quantizada.save(buffer, "PNG", optimize=True)
        variantes["png256"] = buffer.getvalue()
    except Exception as erro:  # noqa: BLE001
        print("quantizacao falhou:", erro)
else:
    buffer = io.BytesIO()
    base.save(buffer, "JPEG", quality=88, optimize=True, progressive=True)
    variantes["jpg"] = buffer.getvalue()
    try:
        quantizada = base.convert("P", palette=Image.ADAPTIVE, colors=256)
        buffer = io.BytesIO()
        quantizada.save(buffer, "PNG", optimize=True)
        variantes["png256"] = buffer.getvalue()
    except Exception as erro:  # noqa: BLE001
        print("quantizacao falhou:", erro)

nome, escolhido = min(variantes.items(), key=lambda par: len(par[1]))
print("tamanhos:", {chave: len(valor) for chave, valor in variantes.items()})
print("escolhido: %s %d bytes | %s" % (nome, len(escolhido), base.size))
print("sha256:", hashlib.sha256(escolhido).hexdigest())

os.makedirs("public/marca", exist_ok=True)
with open("public/marca/logo.png", "wb") as arquivo:
    arquivo.write(escolhido)

texto = base64.b64encode(escolhido).decode()
linhas = textwrap.wrap(texto, 3900)
with open("/tmp/b64.txt", "w", encoding="utf-8") as arquivo:
    arquivo.write("\n".join(linhas) + "\n")  # nova linha no fim: 'while read' ignora a última sem ela
with open("/tmp/pedacos.txt", "w", encoding="utf-8") as arquivo:
    arquivo.write(str(len(linhas)))

menor = base.copy()
fator = 200 / max(menor.size)
menor = menor.resize(
    (max(1, round(menor.width * fator)), max(1, round(menor.height * fator))), Image.LANCZOS
)
previa = io.BytesIO()
menor.convert("RGB").save(previa, "JPEG", quality=75, optimize=True)
with open("/tmp/previa.txt", "w", encoding="utf-8") as arquivo:
    arquivo.write("\n".join(textwrap.wrap(base64.b64encode(previa.getvalue()).decode(), 3900)) + "\n")
print("previa: %d bytes" % len(previa.getvalue()))
