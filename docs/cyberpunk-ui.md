# UI Style Spec (Minimal)

## Design Goal

Language Learner should feel like a calm, focused reading tool: neutral layered surfaces, a single restrained accent, hairline borders, and soft shadows. Texture comes from subtle elevation, a top hairline highlight, and a soft ambient light rather than neon glow, grid textures, or scanning effects. Long-form reading stays the quietest surface in the UI.

## Theme Tokens

- Base surfaces use `--langr-page`, `--langr-surface`, `--langr-surface-raised`, `--langr-surface-inset`, and `--langr-surface-glass`. These derive from Obsidian background variables, with `--langr-surface-raised` lifted brighter and `--langr-surface-inset` recessed darker to establish elevation.
- Accent is a single color: `--langr-accent` and `--langr-accent-hover` derive from Obsidian's `--interactive-accent`. `--langr-accent-hot` is kept as an alias for `--langr-accent-hover` so view files don't need to change. `--langr-accent-warm` and `--langr-accent-cool` are muted secondary hues used only for charts.
- Borders use `--langr-border-subtle`, `--langr-border`, and `--langr-border-strong`, all neutral hairline tones. `--langr-border-neon` is a soft accent-tinted border reserved for active and focus states.
- Light and texture are centralized in `--langr-hairline` (a 1px top highlight) and `--langr-sheen` (a soft ambient light). Use these instead of hand-coded white overlays.
- Elevation is centralized in `--langr-shadow` and `--langr-shadow-strong`; `--langr-glow-*` is reduced to a single subtle accent ring. Do not hand-code colored glows in view files.
- Density uses the existing `--langr-space-*` scale and 4-12px radii. Large pill radii are reserved for status chips and progress bars.

## Light And Dark

The default root theme is the light variant. `.theme-dark` overrides only shadow depth and status chip foreground tones; accent and surfaces follow Obsidian automatically. View files must consume tokens only and should not branch on theme classes directly unless a component has a visual defect in one theme.

## Components

- `.langr-shell` owns panel background, typography, and base text color. It adds a single soft ambient light at the top; keep it subtle.
- `.langr-card` is the primary framed panel. Its pseudo-elements may only add a subtle top highlight, never fixed color rails.
- `.langr-card-muted` is for contained meters and secondary groups.
- `.langr-toolbar`, `.langr-toolbar-title`, `.langr-subtle`, `.langr-icon-button`, `.langr-state`, and `.langr-status-chip` are shared primitives.
- Naive UI remains the control layer. The plugin theme overrides keep Naive controls aligned with the same tokens.

## Rules For New UI

- Prefer semantic shared classes before adding component-local paint.
- Keep reading content calmer than tool panels: reserve accent for hover, selection, status marks, and focus borders, not on every paragraph.
- Avoid grid, scanline, and radial-glow backgrounds. Texture comes from elevation and hairlines.
- Avoid inline colors. If a new color is needed, add a token in `src/stalin.css` first and document the role here.
- Preserve Obsidian theme integration by deriving from Obsidian CSS variables where possible.
