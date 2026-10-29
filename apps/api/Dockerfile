# API 서버와 Worker가 같이 쓰는 이미지 (docker-compose.yml에서 실행 명령만 다르게 준다)
# 빌드는 저장소 맨 위 폴더에서: docker compose build

FROM node:22-bookworm-slim AS base
# openssl: Prisma에 필요 / postgresql-client-16: Worker의 DB 백업(pg_dump)용 (DB 버전과 맞춤)
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates gnupg openssl \
 && install -d /usr/share/postgresql-common/pgdg \
 && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
 && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
 && apt-get update && apt-get install -y --no-install-recommends postgresql-client-16 \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS build
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
# --omit=optional: 개발 PC용 내장 PostgreSQL 바이너리는 받지 않는다
RUN npm ci -w apps/api --omit=optional
COPY apps/api apps/api
RUN npm run build -w apps/api

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/apps/api/package.json /app/apps/api/package.json
COPY --from=build /app/apps/api/dist /app/apps/api/dist
COPY --from=build /app/apps/api/prisma /app/apps/api/prisma
WORKDIR /app/apps/api
EXPOSE 3000
# 켤 때마다 DB 구조를 최신으로 맞춘 뒤(마이그레이션) 서버를 시작한다
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
