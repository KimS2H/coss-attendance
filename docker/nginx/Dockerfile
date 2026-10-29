# 화면(React) 빌드 + Nginx (입구 두 개: 공개 8080, 관리자 8081)
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci -w apps/web --omit=optional
COPY apps/web apps/web
RUN npm run build -w apps/web

FROM nginx:1.27-alpine
# templates/*.template 안의 ${ADMIN_GATE_SECRET}는 켤 때 .env 값으로 바뀐다
COPY docker/nginx/templates /etc/nginx/templates
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
