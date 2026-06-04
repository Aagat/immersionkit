# Validation

Run the narrowest check that covers your change, then broaden when the change
touches shared runtime behavior or packaged-extension integration.

## Core Checks

```bash
pnpm typecheck
pnpm test
pnpm build:local-assets
pnpm smoke:extension:build
```

## Benchmark Lanes

```bash
pnpm benchmark
pnpm benchmark:contextual-word-injection
pnpm benchmark:phrase-detection
pnpm benchmark:sentence-shortlisting
pnpm benchmark:sentence-suitability
pnpm benchmark:nlp-performance
```

Run benchmark lanes when changing analyzer behavior, contextual word rules,
phrase detection, sentence shortlisting, sentence suitability, curriculum gates,
benchmark fixtures, or scheduler signals.

## Browser Checks

Browser, smoke, benchmark, and extension E2E checks should run headless by
default. Use headed mode only for intentional visual debugging.

