FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist

# SIGAA_MCP_REMOTE_TOKEN é opcional mas fortemente recomendada (passe na
# plataforma de deploy) — sem ela o endpoint /mcp fica público, sem
# autenticação (ver src/remote.ts).
ENV PORT=3000
EXPOSE 3000

CMD ["node", "dist/remote.js"]
