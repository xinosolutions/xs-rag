# Production deploy (Hetzner)

| Piece | Where |
|---|---|
| Web (Next.js) | `127.0.0.1:1391` → https://rag.xinosolutions.com |
| API (NestJS) | `:1390` → https://api.rag.xinosolutions.com |
| Postgres + pgvector | container `xs-rag-db`, `127.0.0.1:5433`, volume `xs-rag-pgdata` |
| App files | `/home/github-runner/apps/xs-rag` |
| Uploaded documents | `/home/github-runner/apps/xs-rag-data/storage` |
| Services | `systemctl --user status xs-rag-api xs-rag-web` (as `github-runner`) |
| Logs | `/home/github-runner/apps/xs-rag/logs/{api,web}.log` |

Pushing to `main` runs `.github/workflows/deploy.yml` on the self-hosted runner
labelled `xs-rag` + `xino-hetzner` (the Hetzner box; another runner also carries `xs-rag`), using the `production` GitHub environment. The workflow never
runs on pull requests.

## GitHub `production` environment

Secrets: `POSTGRES_PASSWORD`, `DATABASE_URL`, `TEST_DATABASE_URL`, `JWT_SECRET`,
`IP_HASH_SALT`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `SEED_DEMO_ADMIN_PASSWORD`.

Variables: `NODE_ENV`, `API_PORT`, `WEB_PORT`, `DB_HOST_PORT`, `WEB_ORIGIN`,
`NEXT_PUBLIC_API_URL`, `COOKIE_DOMAIN`, `TRUST_PROXY`, `STORAGE_DIR`, `SMTP_HOST`,
`SMTP_PORT`, `MAIL_FROM`, `LLM_PROVIDER`, `EVAL_JUDGE_MODEL`, `RAG_MIN_SIMILARITY`,
`INGESTION_WORKERS`, `THROTTLE_AUTH_PER_MIN`, `THROTTLE_ASK_PER_MIN`,
`V1_RATE_PER_MIN`, `DEMO_WORKSPACE_SLUG`, `RUN_SEED`, `DEFAULT_CHAT_MODEL`,
`GEMINI_CHAT_MODEL`, `GEMINI_EMBEDDING_MODEL`, `GEMINI_THINKING_BUDGET`.

`LLM_PROVIDER=fake` is refused by the API when `NODE_ENV=production`, so production
uses `real` and needs `GEMINI_API_KEY` (embeddings via `gemini-embedding-001` at 1536 dims, and chat via the
`gemini-flash` catalog model). Set `DEFAULT_CHAT_MODEL=gemini-flash` and `EVAL_JUDGE_MODEL=gemini-flash`
if Anthropic is not configured. `ANTHROPIC_API_KEY` is only needed for the Claude models.

## nginx + SSL

`deploy/nginx/*.conf` are the site files. Once the DNS A records for
`rag.xinosolutions.com` and `api.rag.xinosolutions.com` point to the server:

```bash
sudo cp deploy/nginx/*.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d rag.xinosolutions.com -d api.rag.xinosolutions.com
```
