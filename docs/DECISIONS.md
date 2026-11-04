# Architectural Decisions

date | phase | decision
2026-11-03 | P2 | Strip UTF-8 BOM from init migration SQL; isolate in-memory throttler store in auth test beforeEach to prevent cross-test rate limit bleed-over
2026-11-03 | P3 | Disable vitest e2e fileParallelism so test suites sharing the single xs_rag_test database run sequentially without truncate race conditions; consolidate WorkspaceMemberGuard and RolesGuard in roles.decorator.ts per TR file tree
2026-11-03 | P4 | Use configurable UrlGuard.dnsLookup static property for clean SSRF DNS testing in Node ESM; support SSE test streaming via dynamic port binding in e2e suite; implement permitted document filtering per VIS-1..VIS-4 & VIS-7
2026-11-04 | P5 | Use SELECT FOR UPDATE SKIP LOCKED in Prisma interactive transaction for concurrent ingestion worker safety; preserve short sections while merging sub-40-char split fragments; implement PDF median-height heading detection; embed 1536-dim hashed bag-of-words in fake provider with alias support
2026-11-04 | P6 | Split interactive transaction SET LOCAL into individual statements to avoid Postgres 25P02 aborted transaction block; resolve SSE abort promise on client/server socket close; apply reciprocal rank fusion 1/(60+rank) with 0.25 relevance gate and 14-char sentinel holdback for [[NO_ANSWER]]
2026-11-04 | P7 | Enforce pg_advisory_xact_lock(hashtext(visitorId)) inside assistant message creation transaction for atomic session/IP counting and allowance limits; key /v1/ask rate limiting strictly per API key id with sliding window bucket; restrict widget keys to 1-5 validated origins (https or localhost)
