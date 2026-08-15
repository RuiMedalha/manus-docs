FROM node:22-slim

WORKDIR /app

COPY . .

RUN corepack enable && pnpm install --frozen-lockfile && pnpm run build

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "dist/index.js"]
