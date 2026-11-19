# Railway (and any Docker host) builds the web app from this file.
# The repo also holds the Rust escrow program, so without it Railway
# guesses "Rust project" and never installs Node or pnpm.
FROM node:22-bookworm

RUN corepack enable
WORKDIR /app

COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @potted/web build

ENV NODE_ENV=production
# Next.js listens on $PORT (Railway sets it; 8080 if run elsewhere).
ENV PORT=8080
EXPOSE 8080
CMD ["pnpm", "--filter", "@potted/web", "start"]
