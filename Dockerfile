# syntax=docker/dockerfile:1
# ============================================================================
# Imagem de produção do módulo de Conciliação Bancária
#
# Três estágios: dependências, build (Next.js standalone) e execução. A imagem
# final leva apenas o servidor gerado pelo Next e roda sem privilégios de root.
# ============================================================================

FROM node:20-alpine AS dependencias
WORKDIR /app
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=dependencias /app/node_modules ./node_modules
COPY . .
# Variáveis NEXT_PUBLIC_* são fixadas no build. Vazias, a tela usa a regra do
# documento de visão para o período (bloqueio + 1 até ontem).
ARG NEXT_PUBLIC_PERIODO_INICIO=""
ARG NEXT_PUBLIC_PERIODO_FIM=""
ENV NEXT_PUBLIC_PERIODO_INICIO=$NEXT_PUBLIC_PERIODO_INICIO \
    NEXT_PUBLIC_PERIODO_FIM=$NEXT_PUBLIC_PERIODO_FIM \
    NEXT_TELEMETRY_DISABLED=1 \
    BUILD_STANDALONE=1
RUN npm run build

FROM node:20-alpine AS execucao
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" || exit 1
CMD ["node", "server.js"]
