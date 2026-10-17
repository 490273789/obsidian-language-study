# UI Style Spec (Minimal)

## Design Goal

Language Learner follows the editorial UI direction of the sibling Study Studio project (`../obsidian-study-studio/src/core/styles/README.md`, `base.scss`, and `layout.scss`): a compact, calm workbench that inherits Obsidian's theme and accent. Establish hierarchy through solid surfaces, hairline borders, spacing, and typography. Ordinary panels and controls stay flat; only floating popups use a soft shadow. Long-form reading stays the quietest surface in the UI.

## Theme Tokens

- `--langr-page` is the secondary-background canvas. `--langr-surface` is the primary-background reading surface. `--langr-surface-muted` is a section surface and `--langr-surface-raised` is a card surface. Their mixes follow Study Studio's theme-derived surface hierarchy.
- `--langr-surface-inset` is the input surface; `--langr-surface-control` is the button surface; `--langr-surface-popover` is reserved for floating content. `--langr-surface-glass` remains an opaque section-surface alias for existing consumers.
- `--langr-accent` and `--langr-accent-hover` follow Obsidian's interactive accent. Cyan fallbacks match Study Studio's primary palette. `--langr-accent-hot` aliases the hover color. `--langr-text-on-accent` follows Obsidian's foreground for filled primary actions. Warm/cool chart hues and learning-status colors retain their semantic roles.
- `--langr-border-subtle`, `--langr-border`, and `--langr-border-strong` provide neutral separators and outlines. Accent-tinted borders are reserved for interaction states.
- `--langr-focus-ring` is a compact keyboard/input focus indicator. `--langr-shadow-popover` is the sole elevation token, with restrained light/dark variants. Do not apply it to panels, toolbars, cards, or ordinary controls.
- Radii follow Study Studio's 2/4/6/8px scale. Keep the existing spacing scale so reading and tool layouts preserve their available space. Large pill radii are reserved for status chips and progress bars.

## Light And Dark

Surfaces, text, accent, and borders derive from Obsidian automatically. `.theme-dark` adjusts only popup shadow depth and status foreground tones. Component styles consume tokens rather than fixed light/dark palettes.

## Components

- `.langr-shell` owns the solid canvas background, typography, and base text color.
- `.langr-card` is a bordered, flat card. `.langr-card-muted` groups secondary content with a solid section surface. Neither adds sheen, inset depth, or decorative pseudo-elements.
- `.langr-toolbar`, `.langr-toolbar-title`, `.langr-subtle`, `.langr-icon-button`, `.langr-state`, and `.langr-status-chip` are shared primitives.
- Naive UI remains the control layer. `src/ui/theme.ts` aligns primary foregrounds, input/control surfaces, tables, and popup colors with these tokens. Preserve typed primary/error/warning button borders rather than overriding them globally.
- Settings use simple divided rows and section headings instead of a framed card for every option.

## Rules For New UI

- Prefer shared classes and tokens before adding component-local paint.
- Reserve accent for actions, hover, selection, status marks, and focus. Preserve visible keyboard focus and semantic reading highlights.
- Avoid decorative gradients, scanlines, glows, hover lifts, and stacked shadows. A dictionary content-fade gradient may remain where it communicates truncated content.
- Add new colors as semantic tokens here first. Derive them from Obsidian variables where practical.
- Respect reduced motion and preserve mobile layouts, touch targets, and theme contrast.
