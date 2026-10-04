# syntax=docker/dockerfile:1
# Same image locally and on Cloud Run (design.md, Components: Container image).
# node:22-slim pinned by digest (multi-arch index, resolved 2026-10-04); bump deliberately.
ARG NODE_IMAGE=node:22-slim@sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c

FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY public ./public
RUN npm run build

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080
WORKDIR /app
COPY package.json package-lock.json ./
# --ignore-scripts: the three runtime dependencies need no install scripts.
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/dist ./dist
# Files stay root-owned and read-only for the app; it runs as the unprivileged node user.
USER node
EXPOSE 8080
# node directly, not `npm start`: the container must not read a .env file.
CMD ["node", "dist/main.js"]
