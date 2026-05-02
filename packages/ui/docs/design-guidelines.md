# ImmersionKit UI Guidelines

These notes describe the reusable UI surfaces in `@immersionkit/ui`. They are
kept release-neutral so the same components can continue past the first public
ship.

## Surfaces

- `ExtensionPopup` owns the extension popover and site availability states.
  Supported pages must expose both site states: on and paused.
- `ReadingPage` demonstrates inline reading states: supported page, word help,
  phrase help, and optional sentence help.
- `ExtensionOptions` owns the settings shell and switches between General,
  Translation, and Advanced sections.

The extension should wire behavior through these state props instead of
mounting separate screens for each screenshot state.

## Visual Language

- Use quiet white surfaces, thin borders, and compact 8px radii.
- Keep teal as the active reading color. Use blue only for optional help and
  explanatory states, amber for recoverable warnings, and red only for blocked
  validation.
- Inline language marks should look reversible and low-pressure: subtle fill,
  clear underline, and no dense decoration.
- Inline tokens use two independent axes:
  - `kind`: word, phrase, or sentence.
  - `status`: new, learning, known, or muted.
- Status color should stay soft. New uses a warm coral underline, learning uses
  amber, known uses green, and muted uses gray. Kind changes the mark structure:
  words get one underline, phrases get a double underline, and sentences get a
  dotted sentence-level treatment.
- Popovers should stay close to the selected token and never require scheduler
  or diagnostics language.
- The popup prioritizes one site-level control. Secondary controls remain
  links or low-emphasis buttons.
- Every button-like control needs visible hover and pressed states. The large
  site power button should make its current state obvious before interaction:
  teal means active, muted gray means paused or unavailable.
- Options pages should feel like browser settings: left navigation, tab row,
  bordered sections, and practical density.

## Theme Tokens

The stylesheet defines the component contract through CSS variables on
`.ik-ui-frame`. Light mode is the default. Dark mode can be enabled later by
setting `data-theme="dark"` on the same root without changing component markup.

Important token groups:

- Surface: `--ik-ui-bg`, `--ik-ui-browser`, `--ik-ui-surface`,
  `--ik-ui-surface-soft`, `--ik-ui-surface-tint`
- Text: `--ik-ui-ink`, `--ik-ui-text`, `--ik-ui-muted`,
  `--ik-ui-soft-muted`
- Borders: `--ik-ui-line`, `--ik-ui-line-strong`
- Status: `--ik-ui-accent`, `--ik-ui-blue`, `--ik-ui-warning`,
  `--ik-ui-danger`
- Shape and depth: `--ik-ui-radius`, `--ik-ui-shadow-sm`,
  `--ik-ui-shadow-md`

## Copy Rules

- Prefer "reading mode", "reading band", "local signals", and "stored on this
  device".
- Avoid internal scheduler terms, confidence scores, provider jargon in normal
  reading flows, and anything that sounds like a full course or assessment.
- Sentence help always names provider use as optional and selected-sentence
  only.

## Interaction Rules

- Opening word help is useful evidence by itself. Explicit word controls are
  secondary and learner-facing.
- Phrase help explains meaning and reuse, but does not expose phrase memory
  management.
- Unsupported pages explain why controls are unavailable and preserve progress
  context.
- Advanced diagnostics stay collapsed and support-oriented.
