# Cyberpunk UI Spec

## Design Goal

Language Learner should feel like a focused cyberpunk reading console: high contrast, neon signal colors, compact controls, and strong scanning affordances without hurting long-form reading.

## Theme Tokens

- Base surfaces use `--langr-page`, `--langr-surface`, `--langr-surface-raised`, `--langr-surface-inset`, and `--langr-surface-glass`.
- Neon accents use `--langr-accent`, `--langr-accent-hot`, `--langr-accent-warm`, and `--langr-accent-cool`.
- Borders use `--langr-border-subtle`, `--langr-border`, `--langr-border-strong`, and `--langr-border-neon`.
- Glow is centralized in `--langr-glow-*` and `--langr-shadow-*`; do not hand-code one-off neon shadows in view files.
- Density uses the existing `--langr-space-*` scale and 4-8px radii. Large pill radii are reserved for status chips and progress bars.

## Light And Dark

The default root theme is the light cyberpunk variant. `.theme-dark` overrides the same tokens for the dark variant. View files must consume tokens only and should not branch on theme classes directly unless a component has a visual defect in one theme.

## Components

- `.langr-shell` owns panel background, grid texture, typography, and base text color.
- `.langr-card` is the primary framed panel. Its pseudo-elements should stay subtle and must not add fixed color rails.
- `.langr-card-muted` is for contained meters and secondary groups.
- `.langr-toolbar`, `.langr-toolbar-title`, `.langr-subtle`, `.langr-icon-button`, `.langr-state`, and `.langr-status-chip` are shared primitives.
- Naive UI remains the control layer. The plugin theme overrides keep Naive controls aligned with the same tokens.

## Rules For New UI

- Prefer semantic shared classes before adding component-local paint.
- Keep reading content calmer than tool panels: use neon on selection, hover, status marks, and borders, not on every paragraph.
- Use no more than one local background effect per view. The global shell already supplies the grid.
- Avoid inline colors. If a new color is needed, add a token in `src/stalin.css` first and document the role here.
- Preserve Obsidian theme integration by deriving from Obsidian CSS variables where possible.
