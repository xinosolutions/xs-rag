# Architectural Decisions

date | phase | decision
2026-11-03 | P2 | Strip UTF-8 BOM from init migration SQL; isolate in-memory throttler store in auth test beforeEach to prevent cross-test rate limit bleed-over
2026-11-03 | P3 | Disable vitest e2e fileParallelism so test suites sharing the single xs_rag_test database run sequentially without truncate race conditions; consolidate WorkspaceMemberGuard and RolesGuard in roles.decorator.ts per TR file tree
