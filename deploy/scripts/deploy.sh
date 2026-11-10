#!/usr/bin/env bash
# Production deploy for xs-rag on the self-hosted runner (Hetzner, user github-runner).
# Follows the server convention: native Node + systemd --user services behind nginx.
# Postgres (pgvector) runs in its own container bound to 127.0.0.1.
set -euo pipefail

SOURCE_DIR="${GITHUB_WORKSPACE:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
DEPLOY_PATH="${DEPLOY_PATH:-$HOME/apps/xs-rag}"
DATA_DIR="${DATA_DIR:-$HOME/apps/xs-rag-data}"
API_PORT="${API_PORT:-1390}"
WEB_PORT="${WEB_PORT:-1391}"
DB_HOST_PORT="${DB_HOST_PORT:-5433}"
POSTGRES_USER="${POSTGRES_USER:-xs}"
POSTGRES_DB="${POSTGRES_DB:-xs_rag}"
RUN_SEED="${RUN_SEED:-false}"
UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"

require() {
  local missing=0
  for name in "$@"; do
    if [ -z "${!name:-}" ]; then echo "ERROR: required setting ${name} is empty"; missing=1; fi
  done
  [ "$missing" -eq 0 ] || exit 1
}
require POSTGRES_PASSWORD JWT_SECRET IP_HASH_SALT WEB_ORIGIN NEXT_PUBLIC_API_URL

if [ "${#JWT_SECRET}" -lt 32 ]; then echo "ERROR: JWT_SECRET must be at least 32 characters"; exit 1; fi
if [ "${NODE_ENV:-production}" = "production" ] && [ "${LLM_PROVIDER:-real}" = "fake" ]; then
  echo "ERROR: LLM_PROVIDER=fake is rejected by the API in production"; exit 1
fi
if [ -z "${OPENAI_API_KEY:-}" ]; then
  echo "WARNING: OPENAI_API_KEY is empty - document ingestion (embeddings) will fail until it is set."
fi
if [ -z "${ANTHROPIC_API_KEY:-}" ] && [ -z "${OPENAI_API_KEY:-}" ]; then
  echo "WARNING: no LLM API key set - chat answers will fail until one is set."
fi

DATABASE_URL="${DATABASE_URL:-postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:${DB_HOST_PORT}/${POSTGRES_DB}}"
TEST_DATABASE_URL="${TEST_DATABASE_URL:-postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:${DB_HOST_PORT}/xs_rag_test}"

echo "Deploy path: ${DEPLOY_PATH}"
mkdir -p "${DEPLOY_PATH}" "${DATA_DIR}/storage" "${DEPLOY_PATH}/logs" "${UNIT_DIR}"

echo "Syncing source ..."
rsync -a --delete \
  --exclude .git --exclude node_modules --exclude '.next' --exclude dist \
  --exclude logs --exclude storage --exclude '.env' --exclude '.env.*' \
  --exclude '*.tsbuildinfo' \
  "${SOURCE_DIR}/" "${DEPLOY_PATH}/"
cd "${DEPLOY_PATH}"

echo "Writing ${DEPLOY_PATH}/.env ..."
umask 077
cat > .env <<ENVFILE
NODE_ENV=${NODE_ENV:-production}
DATABASE_URL=${DATABASE_URL}
TEST_DATABASE_URL=${TEST_DATABASE_URL}
API_PORT=${API_PORT}
PORT=${WEB_PORT}
WEB_ORIGIN=${WEB_ORIGIN}
NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
COOKIE_DOMAIN=${COOKIE_DOMAIN:-}
JWT_SECRET=${JWT_SECRET}
IP_HASH_SALT=${IP_HASH_SALT}
TRUST_PROXY=${TRUST_PROXY:-true}
STORAGE_DIR=${STORAGE_DIR:-${DATA_DIR}/storage}
SMTP_HOST=${SMTP_HOST:-localhost}
SMTP_PORT=${SMTP_PORT:-25}
MAIL_FROM=${MAIL_FROM:-no-reply@xinosolutions.com}
LLM_PROVIDER=${LLM_PROVIDER:-real}
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}
OPENAI_API_KEY=${OPENAI_API_KEY:-}
EVAL_JUDGE_MODEL=${EVAL_JUDGE_MODEL:-claude-sonnet-5-5}
RAG_MIN_SIMILARITY=${RAG_MIN_SIMILARITY:-0.25}
INGESTION_WORKERS=${INGESTION_WORKERS:-1}
THROTTLE_AUTH_PER_MIN=${THROTTLE_AUTH_PER_MIN:-10}
THROTTLE_ASK_PER_MIN=${THROTTLE_ASK_PER_MIN:-20}
V1_RATE_PER_MIN=${V1_RATE_PER_MIN:-60}
DEMO_WORKSPACE_SLUG=${DEMO_WORKSPACE_SLUG:-acme-demo}
SEED_DEMO_ADMIN_PASSWORD=${SEED_DEMO_ADMIN_PASSWORD:-}
POSTGRES_USER=${POSTGRES_USER}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_DB=${POSTGRES_DB}
DB_HOST_PORT=${DB_HOST_PORT}
ENVFILE
umask 022
chmod 600 .env
# Prisma CLI and the API both look for apps/api/.env
ln -sf ../../.env apps/api/.env

echo "Starting database container ..."
docker compose -f deploy/docker-compose.prod.yml --env-file .env up -d db
for i in $(seq 1 40); do
  status="$(docker inspect -f '{{.State.Health.Status}}' xs-rag-db 2>/dev/null || echo starting)"
  [ "$status" = "healthy" ] && break
  sleep 3
done
[ "$status" = "healthy" ] || { echo "ERROR: xs-rag-db is not healthy"; docker logs --tail 50 xs-rag-db; exit 1; }

set -a; . ./.env; set +a
export NODE_OPTIONS="--max-old-space-size=1024"
export NEXT_TELEMETRY_DISABLED=1

echo "Installing dependencies ..."
pnpm install --frozen-lockfile --prod=false

echo "Building ..."
pnpm -F @xs-rag/shared run build
pnpm -F @xs-rag/api exec prisma generate
pnpm -F @xs-rag/api run build
pnpm -F @xs-rag/web run build

echo "Running migrations ..."
pnpm -F @xs-rag/api exec prisma migrate deploy

if [ "${RUN_SEED}" = "true" ]; then
  echo "Seeding demo data ..."
  pnpm seed
fi
unset NODE_OPTIONS

API_ENTRY="${DEPLOY_PATH}/apps/api/dist/main.js"
[ -f "${API_ENTRY}" ] || API_ENTRY="${DEPLOY_PATH}/apps/api/dist/src/main.js"
[ -f "${API_ENTRY}" ] || { echo "ERROR: API build output not found"; exit 1; }
NODE_BIN="$(command -v node)"

for svc in api web; do
  sed \
    -e "s|__DEPLOY_PATH__|${DEPLOY_PATH}|g" \
    -e "s|__NODE_BIN__|${NODE_BIN}|g" \
    -e "s|__API_ENTRY__|${API_ENTRY}|g" \
    -e "s|__WEB_PORT__|${WEB_PORT}|g" \
    "deploy/systemd/xs-rag-${svc}.service.template" > "${UNIT_DIR}/xs-rag-${svc}.service"
done

if [ -z "${XDG_RUNTIME_DIR:-}" ] && [ -d "/run/user/$(id -u)" ]; then
  export XDG_RUNTIME_DIR="/run/user/$(id -u)"
fi
systemctl --user daemon-reload
systemctl --user enable xs-rag-api.service xs-rag-web.service
systemctl --user restart xs-rag-api.service
systemctl --user restart xs-rag-web.service

check() {
  local name="$1" url="$2"
  for i in $(seq 1 30); do
    if curl -fsS -o /dev/null "$url"; then echo "${name} healthy: ${url}"; return 0; fi
    sleep 3
  done
  echo "ERROR: ${name} did not respond at ${url}"
  systemctl --user status "xs-rag-${name}.service" --no-pager || true
  tail -n 60 "${DEPLOY_PATH}/logs/${name}.log" || true
  return 1
}
check api "http://127.0.0.1:${API_PORT}/health"
check web "http://127.0.0.1:${WEB_PORT}/"

echo "Pruning pnpm store ..."
pnpm store prune >/dev/null 2>&1 || true
echo "Deploy finished."
