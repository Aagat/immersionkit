# ImmersionKit UI Guidelines

These notes describe the exported UI surfaces in `@immersionkit/ui`. Product
truth stays in the PRD; this file is only for UI implementation conventions.

## Surfaces

- `ExtensionPopup` owns the extension popover and site availability states.
  Supported pages must expose both site states: on and paused.
- `ReadingPage` demonstrates inline reading states: supported page, word help,
  phrase help, and optional sentence help.
- `ExtensionOptions` owns the settings shell and switches between Overview,
  Reading, Curriculum, Stats, Sites, Translation, and Advanced sections.

The extension should wire behavior through these state props instead of
mounting separate screens for each screenshot state.

## Component System

- Use generated shadcn/ui components from `src/components/ui`.
- Preserve `@immersionkit/ui` as the app-specific screen surface package.
- Do not export custom primitive controls such as `Button`, `Card`, `Badge`,
  `Icon`, `Toggle`, `Popover`, or `WordMark`.
- Compose screens with shadcn `Card`, `Button`, `Badge`, `Alert`, `Progress`,
  `Tabs`, `Sidebar`, `Slider`, `RadioGroup`, `Switch`, `Select`, `Input`, and
  `Separator`.
- Keep app-only helpers inside screen modules when they prevent repetition, but
  do not turn them into a public primitive layer.

## Content UI

- Content pages must not receive global Tailwind preflight or shadcn resets.
- Keep page-injected CSS limited to inline mark styles, sentence source versus
  translation visibility, active/hover states, and minimal popover host
  positioning.
- Render word, phrase, and sentence popovers as React content inside a shadow
  root. Avoid portalled shadcn primitives in content popovers.
- Preserve `data-ik-popover`, `data-ik-status-action`, and
  `data-ik-sentence-action` attributes for runtime behavior and tests.

## Interaction Rules

- Opening word help is useful evidence by itself. Explicit word controls are
  secondary and learner-facing.
- Phrase help explains meaning and reuse, but does not expose phrase memory
  management.
- Unsupported pages explain why controls are unavailable and preserve progress
  context.
- Advanced diagnostics stay support-oriented and developer-facing.

## Copy Rules

- Prefer "reading mode", "reading band", "local signals", and "stored on this
  device".
- Avoid internal scheduler terms, confidence scores, provider jargon in normal
  reading flows, and anything that sounds like a full course or assessment.
- Sentence help always names provider use as optional and selected-sentence
  only.
