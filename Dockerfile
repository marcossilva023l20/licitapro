# DEJ Solutions & Global — imagem de produção
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

# 1) dependências (aproveita o cache do Docker)
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

# 2) código da aplicação
COPY . .

# 3) pasta de dados (banco, uploads e cache) — monte um volume nela
VOLUME ["/app/data"]
ENV LICITAPRO_DATA_DIR=/app/data
ENV PORT=3000

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server/index.js"]
