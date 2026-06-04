# Agent Instructions

Use this file as the public repository operating guide for coding agents.
Keep public docs accurate, implementation-focused, and free of private business
plans, private content workflows, or unpublished roadmap commitments.

## Project

ImmersionKit is a local-first Chrome MV3 extension for English-to-Spanish
immersion learning while browsing. The extension keeps learning state in the
browser profile, selects inline replacements conservatively, and runs expensive
sentence analysis in the background worker instead of the content script.

This branch contains public example assets only. Do not add private curriculum
packs, private import/curation tooling, private deployment details, provider
keys, live infrastructure identifiers, or non-public roadmap plans.

## Repository Map

- `apps/extension/`: extension runtime, popup/options UI, storage, background
  services, content script, and extension-specific tests.
- `apps/api/`: optional Cloudflare Worker example API and contract tests.
- `apps/share-site/`: optional static packaging/share site.
- `packages/shared/`: shared curriculum gates, phrase detection, scheduler,
  text helpers, and validation helpers.
- `packages/ui/`: shared React UI components and screens.
- `apps/extension/src/assets/`: public example lexeme, render-unit, and
  phrase-target assets.
- `tools/assets/`: local asset-pack server and example release-pack builders.
- `tools/smoke/`: packaged-extension browser smoke checks.
- `tools/benchmarks/`: validation benchmark runners.
- `fixtures/`: deterministic pages and evaluation fixtures.
- `docs/`: public development, architecture, and validation documentation.

## First Docs

- [Docs index](./docs/README.md)
- [Getting started](./docs/development/getting-started.md)
- [Architecture](./docs/engineering/architecture.md)
- [Extension assets](./apps/extension/src/assets/README.md)
- [Validation](./docs/validation/README.md)
- [Agent workflow](./docs/development/agent-workflow.md)

## Commands

Use the narrowest useful check, then broaden before handing off changes that
touch runtime behavior.

```bash
pnpm dev
pnpm typecheck
pnpm test
pnpm build:local-assets
pnpm smoke:extension:build
pnpm benchmark
```

Lane-specific benchmark commands:

```bash
pnpm benchmark:contextual-word-injection
pnpm benchmark:phrase-detection
pnpm benchmark:sentence-shortlisting
pnpm benchmark:sentence-suitability
pnpm benchmark:nlp-performance
```

## Validation Rules

- Run `pnpm typecheck` after TypeScript changes.
- Run focused tests for the changed package or behavior.
- Run `pnpm test` before broad handoff when shared runtime behavior changed.
- Run `pnpm smoke:extension:build` after manifest, background, content-script,
  asset-loading, or packaged-extension integration changes.
- Run `pnpm benchmark` or the relevant lane when touching analyzer behavior,
  contextual word rules, phrase detection, sentence shortlisting, suitability
  ranking, curriculum gates, benchmark fixtures, or scheduler signals.
- Browser, smoke, benchmark, and extension E2E checks should run headless by
  default.

## Architecture Rules

- Keep expensive linguistic analysis out of the content script.
- Shortlist page sentences in content, analyze in background, and cache by
  sentence hash.
- Keep analyzer-specific objects behind shared adapter contracts.
- Persist durable learning state separately from ephemeral page occurrences.
- Store phrase learning items by canonical phrase registry ID.
- Persist qualified evidence, not every render.
- Do not let due-review boosts bypass contextual safety.
- Keep diagnostics compact and developer-facing.
- Never send page text, sentence text, source/target inline text, full URLs,
  provider keys, user vocabulary, phrase registry rows, or review history to a
  remote service without an explicit public design and privacy review.

## Documentation Rules

- Keep root markdown limited to `README.md` and `AGENTS.md`.
- Keep durable public docs under `docs/` or module-local README files.
- Do not add private roadmaps, business plans, private content workflows,
  unpublished release plans, or live infrastructure details.
- Update existing docs when behavior changes.
- Treat example assets as schema/reference data, not as a complete curriculum.

