# Health_App: Good → Great Refactor Plan

This is the final, incremental plan to transform your codebase into a “big-tech clean” architecture while staying aligned with **Plan/** as the contract.

---

## Goals (what “great” looks like)

- **Plan-driven architecture:** every major Plan/ section maps to an owning module and entrypoint.
- **Thin routes, thick services:** `src/app/**` only composes UI + calls use-cases.
- **Hard boundaries:** UI never touches DB or raw AI output; server-only code is explicit.
- **Reliability for Visual RAG:** schema validation, retries, fallbacks, observability.
- **Testability:** core domain logic and AI parsing are unit-testable; integration tests cover the full pipeline.

---

## Target directory structure (final)

```txt
Health_App/
├── src/
│   ├── app/                        # Next.js routes ONLY (thin layer)
│   │   ├── (auth)/
│   │   ├── (dashboard)/
│   │   └── api/                    # route handlers (thin adapters)
│   │
│   ├── core/                       # Domain modules (DDD)
│   │   ├── nutrition/
│   │   │   ├── repo.server.ts      # Supabase DAL (server-only)
│   │   │   ├── usecases.server.ts  # Use-cases/orchestration (server-only)
│   │   │   ├── rules.ts            # Pure domain logic (no IO)
│   │   │   └── types.ts            # Domain entities/types
│   │   │
│   │   ├── ai/
│   │   │   ├── vision.server.ts    # Gemini integration + retry (server-only)
│   │   │   ├── vector.server.ts    # Embeddings + retrieval orchestration
│   │   │   ├── prompts/            # Versioned prompts
│   │   │   └── schemas.ts          # Zod validation
│   │   │
│   │   └── user/
│   │       ├── repo.server.ts
│   │       ├── usecases.server.ts
│   │       └── types.ts
│   │
│   ├── lib/                        # Infrastructure
│   │   ├── supabase/
│   │   │   ├── client.ts           # Browser client factory
│   │   │   ├── server.ts           # Server client factory
│   │   │   └── storage.server.ts   # Storage helpers (server-only)
│   │   ├── auth.server.ts          # getCurrentUser, guards
│   │   ├── env.ts                  # Env validation (zod)
│   │   ├── logger.ts               # Structured logging
│   │   ├── errors.ts               # Typed errors + codes
│   │   └── ratelimit.server.ts     # Optional
│   │
│   ├── components/                 # Presentation layer
│   │   ├── ui/                     # Atoms (shadcn/radix)
│   │   ├── layouts/                # AppShell, Navigation
│   │   ├── feedback/               # Loading/Error states
│   │   └── features/               # UI “organisms” by domain
│   │       ├── nutrition/
│   │       ├── scan/
│   │       └── analytics/
│   │
│   └── types/
│       └── supabase.ts             # Single source of generated DB types
│
├── Plan/                           # Keep as-is (contract)
├── docs/
│   ├── architecture/
│   │   └── plan-to-code-map.md
│   └── adr/
└── tests/
    ├── unit/
    ├── integration/
    └── e2e/
```

**Key conventions**
- `*.server.ts` is server-only. Add `import "server-only";` at top of those files.
- UI (`components/**`, `app/**`) **must not** import any `repo.server.ts`.

---

## Architecture rules (non-negotiable)

### Import boundaries
1) `src/app/**` may import:
- `components/**`
- `core/**/usecases.server.ts` (only from Server Components / route handlers)
- `lib/auth.server.ts`, `lib/env.ts`, etc.

2) `components/**` may import:
- `components/**`
- `core/**/types.ts` and `core/**/rules.ts` (pure only)
- **never** `core/**/repo.server.ts` or `core/**/usecases.server.ts`

3) `core/**/usecases.server.ts` may import:
- `core/**/repo.server.ts`
- `core/**/rules.ts`
- `lib/**`

4) `core/**/rules.ts` must remain pure:
- no Supabase
- no network
- no filesystem

### Visual RAG flow must be explicit
- `core/ai/vision.server.ts` returns **validated** structured data only.
- `core/ai/vector.server.ts` owns embeddings + retrieval orchestration.
- `core/nutrition/repo.server.ts` owns DB queries and RPC (`match_foods`).

---

## Plan → Code mapping (create this first)

Create: `docs/architecture/plan-to-code-map.md`

Minimum sections:
- **Main_Project_Plan_AI_Food_MVP.md**
  - Perception step → `core/ai/vision.server.ts`
  - Retrieval step → `core/ai/vector.server.ts` + `core/nutrition/repo.server.ts`
  - Draft verification → `core/nutrition/usecases.server.ts`
  - Portion memory → `core/nutrition/usecases.server.ts` (+ DB tables)

- **Technical_Blueprint_AI_Food_Recognition.md**
  - JSON-only output + schema validation → `core/ai/schemas.ts`
  - Prompt versions → `core/ai/prompts/*`

- **database-contracts.md**
  - generated DB types → `src/types/supabase.ts`

---

## Phased migration plan (safe, incremental)

### Phase 0 — Baseline safety (same day)
- Ensure build + tests pass before refactor.
- Add a “refactor checklist” issue with:
  - `npm run build`
  - `npm run lint`
  - `npm run test`
  - `npm run test:e2e` (if present)

Deliverables:
- `docs/architecture/plan-to-code-map.md` (draft)

---

### Phase 1 — Foundation folders + env/logging/errors (1–2 days)
1) Create folders:
- `src/core/{nutrition,ai,user}`
- `src/lib/supabase`
- `src/components/features`

2) Add `src/lib/env.ts` (zod) and replace direct `process.env.*` usage.

3) Add `src/lib/logger.ts` (simple structured logger wrapper).

4) Add `src/lib/errors.ts` with error codes:
- `AI_SERVICE_UNAVAILABLE`
- `AI_OUTPUT_INVALID`
- `DB_QUERY_FAILED`
- `RATE_LIMITED`

Deliverables:
- Env validated at startup.
- Central logger + typed errors.

---

### Phase 2 — Nutrition module extraction (2–4 days)
Goal: Home page and logging use-cases become testable.

1) Extract DB reads/writes from `app`/components into:
- `core/nutrition/repo.server.ts`

2) Create orchestration in:
- `core/nutrition/usecases.server.ts`

3) Move pure logic into:
- `core/nutrition/rules.ts` (daily totals, unit conversions, etc.)

4) Update `src/app/(dashboard)/page.tsx` to:
- parse inputs
- call `getDailyNutrition()`
- render

Exit criteria:
- No `supabase.from(...)` in any `page.tsx`.
- Unit tests added for `rules.ts`.

---

### Phase 3 — AI module extraction (2–4 days)
Goal: Visual RAG becomes reliable and observable.

1) Move Gemini integration to:
- `core/ai/vision.server.ts`

Required capabilities:
- JSON-only responses (where supported)
- Zod schema validation (`core/ai/schemas.ts`)
- Retry policy (lightweight)
- Safe error mapping (typed errors)

2) Move embeddings + retrieval orchestration to:
- `core/ai/vector.server.ts`

Boundary rule:
- `vector.server.ts` calls `nutrition/repo.server.ts` for DB vector search/RPC.

3) Update `app/api/analyze/route.ts` to call `core/ai/vision.server.ts`.

Exit criteria:
- No raw model text reaches UI.
- Logs show request id + latency for AI step.

---

### Phase 4 — UI cleanup + feature components (2–5 days)
Goal: UI becomes predictable and easy to extend.

1) Move complex UI blocks to:
- `components/features/nutrition/*`
- `components/features/scan/*`

2) Standardize loading + error UI:
- `components/feedback/*`

3) Ensure client components only receive:
- validated DTOs from server
- no DB or AI imports

Exit criteria:
- Client code imports only `components/**`, `shared ui`, and pure `core/**/types|rules`.

---

### Phase 5 — Enforcement + CI quality gates (1–2 days)
1) ESLint `no-restricted-imports` rules:
- UI cannot import `core/**/repo.server.ts`
- `components/**` cannot import `*.server.ts`

2) Add/confirm CI:
- typecheck
- lint
- unit tests
- (optional) e2e smoke

Exit criteria:
- Violations fail PR builds.

---

## Testing strategy (minimum bar)

### Unit tests (fast)
- `core/nutrition/rules.ts`
- `core/ai/schemas.ts` (schema validation)

### Integration tests (moderate)
- “Analyze → Retrieve → Draft DTO” pipeline with mock Gemini output
- DB query contract tests for repo methods (can mock supabase client)

### E2E (smoke)
- Login → scan → draft review → confirm save

---

## Observability (simple but effective)

In `lib/logger.ts` include:
- `requestId`
- `userId` (if available)
- `latencyMs`
- `step`: `PERCEPTION | RETRIEVAL | DRAFT | SAVE`

Track 3 core metrics (even as logs at first):
- AI latency
- Retrieval latency
- % of “AI output invalid”

---

## Deliverables checklist (printable)

- [ ] `docs/architecture/plan-to-code-map.md`
- [ ] `src/lib/env.ts` (zod)
- [ ] `src/lib/logger.ts`
- [ ] `src/lib/errors.ts`
- [ ] `core/nutrition/{repo.server.ts,usecases.server.ts,rules.ts,types.ts}`
- [ ] `core/ai/{vision.server.ts,vector.server.ts,schemas.ts,prompts/*}`
- [ ] `app/**` pages updated to call use-cases only
- [ ] ESLint boundaries enforced
- [ ] Unit + integration tests added

---

## What to refactor first (highest ROI order)

1) **Home page data fetching** → move to `core/nutrition/*`
2) **Gemini parsing + schema validation** → `core/ai/vision.server.ts`
3) **Vector retrieval orchestration** → `core/ai/vector.server.ts`
4) UI consolidation into `components/features/*`

---

## “Definition of Great” (done when…)

- A new engineer can locate any behavior by domain in < 60 seconds.
- No DB calls in UI/routes except in repos.
- AI output is validated; failures degrade gracefully.
- Plan-to-code map stays current with each PR touching architecture.

