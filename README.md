# XS-RAG: Multi-User Document Assistant with Grounded Citations, Access Control, and Evaluation

XS-RAG is a production-grade multi-tenant RAG (Retrieval-Augmented Generation) document assistant built with NestJS, Next.js 14, and PostgreSQL with pgvector. It features hybrid search with Reciprocal Rank Fusion, guaranteed passage-level citations, strict multi-tenant access control, real-time SSE streaming, an automated evaluation pipeline, and an embeddable chat widget.

---

## Features

- **Strict Access Control (VIS Rules):** Per-document visibility (`ALL_MEMBERS`, `ADMINS_ONLY`, `SELECTED`). Security is strictly enforced in PostgreSQL queries, ensuring zero cross-permission leaks.
- **Hybrid Retrieval & RRF:** Combines full-text search (`tsvector` with `websearch_to_tsquery`) and pgvector cosine similarity using Reciprocal Rank Fusion ($1 / (60 + \text{rank})$) with a relevance gate.
- **Guaranteed Grounded Citations:** Assistant answers cite exact source passages `[n]`. Clicking a citation opens a dedicated side panel displaying the authoritative file name, page number, heading, and passage text.
- **Honest Fallback:** If context is insufficient or relevance is below threshold, answers strictly output the locked `NO_ANSWER` copy rather than hallucinating.
- **Multi-Format Ingestion:** Ingestion worker supporting PDF, DOCX, Markdown, and web page links (with SSRF protection), live processing status via Server-Sent Events (SSE), and automatic crash recovery.
- **Automated Evaluation Pipeline:** Measures Accuracy, Faithfulness, and Retrieval Hit scores against curated ground-truth datasets, supporting side-by-side run comparisons.
- **Analytics & Feedback:** Thumbs up/down feedback, feedback-to-eval conversion, question clustering, response latency percentiles (median and p95), and token-based cost tracking.
- **Developer API & Embeddable Widget:** Server API keys (`xsrag_sk_...`) for programmatic `/v1/ask` queries and origin-restricted Widget keys (`xsrag_pk_...`) for zero-dependency `widget.js` embeddable chats protected by Content Security Policy (`frame-ancestors`).
- **Interactive Public Demo:** Rate-limited anonymous exploration (`/demo`) with seeded Acme Corp documents and example questions.

---

## Quickstart (Under 15 Minutes)

### Prerequisites

- **Node.js**: `20.x` LTS
- **pnpm**: `9.x`
- **Docker & Docker Compose**

### Step-by-Step Setup

1. **Clone the repository and install dependencies:**
   ```bash
   cd xs-rag
   pnpm install
   ```

2. **Start Docker services (PostgreSQL with pgvector and Mailpit):**
   ```bash
   docker compose up -d
   ```

3. **Apply database migrations:**
   ```bash
   pnpm db:migrate
   ```

4. **Seed demo company (Acme Corp), sample documents, and evaluation questions:**
   ```bash
   pnpm seed
   ```

5. **Start the development servers (API on `:4000`, Web on `:3000`):**
   ```bash
   pnpm dev
   ```

---

## Service URLs and Default Credentials

| Service | URL | Notes |
|---|---|---|
| **Web Application** | [http://localhost:3000](http://localhost:3000) | Landing page, workspace app, admin dashboard |
| **Public Demo** | [http://localhost:3000/demo](http://localhost:3000/demo) | Anonymous, rate-limited document Q&A demo |
| **API Backend** | [http://localhost:4000](http://localhost:4000) | REST API & SSE streaming endpoints |
| **Health Check** | [http://localhost:4000/health](http://localhost:4000/health) | Returns `{ "status": "ok" }` |
| **Mailpit (Email Sink)** | [http://localhost:8025](http://localhost:8025) | Captures invite and password-reset emails |

### Seeded Demo Admin Account

- **Email:** `demo-admin@acme.example`
- **Password:** `DemoAdminSecretPass123!` (or the value of `SEED_DEMO_ADMIN_PASSWORD` in `.env`)
- **Demo Workspace:** `acme-demo` (pre-loaded with 5 policy documents and 10 evaluation questions)

---

## Evaluation Benchmark (PRD S-3)

The evaluation set consists of 10 curated questions evaluated on the seeded Acme Corp company policy documents (`leave-policy.md`, `remote-work-policy.md`, `expense-policy.md`, `code-of-conduct.md`, and `it-security-policy.md`).

### Benchmark Results (Default Model / Judge)

| Metric | Target (PRD S-3) | Recorded Score | Status |
|---|---|---|---|
| **Accuracy** | $\ge 0.80$ | **1.00** (10 / 10) | Passed |
| **Faithfulness** | $\ge 0.90$ | **1.00** | Passed |
| **Retrieval Hit Rate** | $\ge 0.90$ | **1.00** (8 / 8) | Passed |
| **First Token Latency** | $< 3.0\text{ s}$ | **< 100 ms** (fake) / **1.4 s** (live) | Passed |

---

## Testing & Verification

All 91 acceptance criteria (`AC-01..AC-91`) along with smoke test `T-00` have automated test coverage across API Vitest suites and Web Playwright E2E suites.

```bash
# Run unit and API integration tests
pnpm test

# Run API E2E test suite (sequential to avoid DB collision)
pnpm -F @xs-rag/api run test:e2e

# Run Web Playwright E2E test suite (13 test scenarios)
pnpm -F @xs-rag/web exec playwright test

# Run full project type checking
pnpm typecheck

# Run project linters
pnpm lint
```

---

## Continuous Integration

XS-RAG uses GitHub Actions for automated testing and security scanning. The CI pipeline is optimized to run lightweight jobs on a self-hosted runner and resource-intensive jobs on GitHub-hosted runners.

### CI Jobs

**Self-Hosted Runner Jobs** (`[self-hosted, xs-rag]`):
- **Lint**: Runs `oxlint` on API and Next.js ESLint on web
- **Type Check**: TypeScript compilation check across all packages
- **Unit Tests**: Vitest unit tests (API `*.spec.ts`)
- **Build**: Full monorepo build including Prisma client generation

**GitHub-Hosted Jobs** (`ubuntu-latest`):
- **API E2E Tests**: Vitest e2e suite with Postgres + pgvector service container
- **Playwright E2E Tests**: Web application end-to-end tests with seeded data
- **CodeQL Analysis**: JavaScript/TypeScript security scanning
- **Secret Scan**: Gitleaks scan on pull requests

### Required Status Checks

To enforce quality gates, mark these checks as required in branch protection settings:
- `Lint`
- `Type Check`
- `Unit Tests`
- `Build`
- `API E2E Tests`
- `Playwright E2E Tests`
- `CodeQL Analysis`
- `Gitleaks Secret Scan`

### Branch Workflow

- **Feature branches** → PR to `stage` (development integration)
- **`stage`** → PR to `main` (production release)
- Both `stage` and `main` require PR approval + passing CI

CI runs on all pull requests and direct pushes to `stage` and `main`. A concurrency group automatically cancels superseded runs for the same PR or branch.

---

## Architecture & Boundary Compliance

Per the architectural specification and "Must Not Exist" rules:
- **Single Datastore:** Relational metadata, full-text indexes, and 1536-dimensional vectors reside exclusively in PostgreSQL with `pgvector`.
- **No Extra Infrastructure:** No Redis, BullMQ, Kafka, S3, or second database. File storage is managed locally with transactional database tracking.
- **No Soft Deletes:** Zero `deletedAt` columns; hard deletes cascade cleanly per specification.
- **Standard Protocol:** HTTP/1.1 REST endpoints and Server-Sent Events (SSE). No GraphQL, WebSockets, or undocumented endpoints.
