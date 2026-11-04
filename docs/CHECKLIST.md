# Milestone M01 Checklist

- [x] P1 `prisma migrate dev` applied incl. `add_search_indexes`; error filter and `ZodPipe` in place; shared package exports enums, error codes, copy, limits
- [x] P1 fake providers working (`LLM_PROVIDER=fake`), refuses production
- [x] P2 Auth endpoints + mail service; T-01..T-08 green
- [x] P3 Workspaces, members, invitations, settings, model catalog; T-09..T-20 green
- [x] P4 Documents API with permitted filter used for list/detail; SSE events; T-21..T-31 green
- [x] P5 Four extractors, chunker, embedder, recovery, parallel-safe claim; T-32..T-37 green
- [x] P6 Retrieval, `RagService.ask`, SSE messages, citations, chats, feedback, cost; T-38..T-57 green
- [x] P7 API keys, `/v1/ask`, public routes, allowances; T-58..T-68 (API part) green
- [x] P8 Evaluation questions, runner, judge, scoring, compare, feedback to eval; T-69..T-75 green
- [ ] P9 Analytics; T-76..T-78 green
- [ ] P10 Sample documents + seed; T-79 green; `pnpm seed` idempotent
- [ ] P11 API client with refresh-retry, auth pages, shell, workspace picker, members, settings, guards; T-80..T-83 green
- [ ] P12 Documents pages, chat, citation panel, history, feedback; T-84..T-87 green
- [ ] P13 Evaluation, feedback, analytics, API access pages; T-88..T-90 green
- [ ] P14 `/demo`, `/embed/[key]` + CSP middleware, `widget.js`, landing, README run guide; T-91 and web part of T-68 green
- [ ] Golden path executed once against real providers; evaluation scores recorded in the repo README (PRD S-3)
- [ ] "Must not exist" list in section 1 verified with a repository search
