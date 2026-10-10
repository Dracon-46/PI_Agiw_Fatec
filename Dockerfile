# =============================================================================
# Dockerfile - Módulo Conciliação Bancária
# Projeto Banco - Ticket 37060 | Agiw Sistemas
#
# Build em múltiplos estágios: a imagem final carrega apenas o servidor
# standalone do Next.js, sem o node_modules de desenvolvimento.
#
# Nenhum segredo é copiado para a imagem. As credenciais (MYSQL_*, SAFRA_*,
# BRADESCO_*) entram como variáveis de ambiente no momento da execução.
# =============================================================================

# ---------- 1) Dependências ----------
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---------- 2) Build ----------
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Liga o "output: standalone" apenas aqui. Deixá-lo sempre ativo no
# next.config.js trava o "next dev" em "Starting..." na máquina do desenvolvedor.
ENV BUILD_STANDALONE=1
RUN npm run build

# ---------- 3) Execução ----------
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Servidor roda sem privilégios de root
RUN addgroup -g 1001 -S nodejs && adduser -S -u 1001 -G nodejs nextjs

# O projeto atual não possui pasta public, então não copiamos
# COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Scripts de banco: permitem rodar db:init e db:seed dentro do contêiner
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /app/database ./database
COPY --from=builder --chown=nextjs:nodejs /app/src ./src

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
