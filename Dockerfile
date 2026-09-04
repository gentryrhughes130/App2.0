# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npx expo export --platform web

FROM nginx:1.27-alpine AS runtime
LABEL org.opencontainers.image.source="https://github.com/gentryrhughes130/App2.0" \
      org.opencontainers.image.description="ResonX web audio player" \
      org.opencontainers.image.licenses="MIT"

COPY --from=builder /app/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
