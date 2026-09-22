FROM node:22-bookworm-slim
WORKDIR /app
RUN corepack enable
COPY . .
RUN corepack pnpm install --frozen-lockfile && corepack pnpm build
ENV NODE_ENV=production
CMD ["node", "apps/api/dist/apps/api/src/index.js"]
