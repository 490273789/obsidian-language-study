# Repository Instructions

## Project snapshot

This repository is the Obsidian Language Learner plugin, published as
`obsidian-language-study`. It is a Vite library build that emits Obsidian plugin artifacts into
the repository root.

- Runtime: Obsidian plugin, Vue 3, TypeScript, Naive UI, Dexie/IndexedDB, optional remote DB.
- Package manager: `pnpm@11.5.2`.
- Required Node version: `>=22.18.0`.
- Plugin entry: `src/plugin.ts`.
- Generated build outputs: `main.js` and root `styles.css`. Do not hand-edit these; edit source
  files under `src/` and rebuild.
- `manifest.json` is source metadata and must keep `isDesktopOnly: false` unless the product
  decision explicitly changes.

## Agent skills

### Library documentation

When a task asks about a library, framework, SDK, API, CLI tool, or cloud service, use Context7
for current docs before answering or changing code. Start with `resolve-library-id`, then
`query-docs` with the selected `/org/project` ID and the full user question. Do not use Context7
for routine refactors, business logic debugging, code review, or general programming concepts.

### Issue tracker

Issues are tracked in GitHub Issues for `490273789/obsidian-language-study`; external PRs are not
a triage request surface. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles use the default label names. See
`docs/agents/triage-labels.md`.

### Domain docs

This repo uses a single-context domain-doc layout. See `docs/agents/domain.md`.

## Repository map

- `src/plugin.ts`: plugin lifecycle, settings load/save, DB selection, self server startup, global
  Vue mount, reading view hooks, text database refresh.
- `src/plugin/commands.ts` and `src/plugin/views.ts`: Obsidian command and view registration.
- `src/settings.ts`: settings schema, defaults, normalization, and settings tab UI.
- `src/db/`: DB provider interface, Dexie-backed local DB, remote web DB, and IndexedDB schema.
- `src/views/`: Obsidian views and Vue panels for reading, search, learn, data, stats, and parsing.
- `src/dictionary/`: dictionary registry plus dictionary-specific engines and Vue renderers.
- `src/api/server.ts`: desktop-only localhost HTTP bridge for browser extension integration.
- `src/utils/safeHtml.ts`: branded safe HTML helpers. Use this path for user-controlled HTML.
- `src/stalin.css`: shared cyberpunk theme tokens and common UI classes. `src/main.css` imports it.
- `docs/cyberpunk-ui.md`: visual design rules for plugin UI work.
- `tests/`: Vitest tests using `happy-dom` and `tests/mocks/obsidian.ts`.

## Commands

Use the scripts from `package.json`; do not assume npm equivalents.

- Install: `pnpm install`
- Watch build for Obsidian: `pnpm dev`
- Typecheck: `pnpm typecheck`
- Tests: `pnpm test`
- Lint: `pnpm lint`
- Format changed source/test/config files: `pnpm format`
- Format check: `pnpm format:check`
- Full local gate: `pnpm check`
- Production build: `pnpm build`
- Build and deploy to the configured iCloud Obsidian plugin folder: `pnpm deploy`

For narrow changes, run the smallest relevant command first, then broaden to `pnpm check` when the
change touches shared behavior, settings, DB contracts, parser output, platform compatibility, or
build configuration.

## Coding rules

- Keep TypeScript strict. Prefer explicit domain types from `src/db/interface.ts` over ad hoc
  objects.
- Use existing path aliases: `@/*`, `@dict/*`, and `@comp/*`.
- Keep settings changes synchronized across `MyPluginSettings`, `DEFAULT_SETTINGS`,
  `normalizeSettings`, the settings tab UI, and tests.
- Keep DB shape changes synchronized across `src/db/interface.ts`, `src/db/idb.ts`,
  `LocalDb`, `WebDb`, server payload handling, and tests.
- When mutating expressions or phrase data in the local DB, preserve phrase cache invalidation.
- Treat dictionary additions as a three-part change: engine, view, and registry/default settings.
- Use `t()` for user-facing strings that should be localized.
- Do not introduce broad refactors while fixing a narrow behavior. Follow the existing class-based
  plugin structure and Vue component patterns.

## Obsidian and platform constraints

- The plugin supports desktop and mobile. Guard Electron, Node.js, filesystem, and HTTP server
  code with Obsidian `Platform` checks or dynamic imports.
- The self server in `src/api/server.ts` must remain desktop-only and bound to `127.0.0.1`.
- Preserve server hardening unless a task explicitly changes it: origin allowlist, route method
  checks, JSON parse errors, body size limit, and clear HTTP status codes.
- Avoid relying on global `app` unless the surrounding Obsidian API pattern already requires it.
- On unload, detach custom views, close DB/server resources, and unmount/remove global Vue roots.

## UI and styling

- Follow `docs/cyberpunk-ui.md` for visual direction.
- Prefer shared classes and tokens from `src/stalin.css` before adding component-local paint.
- Add new colors as `--langr-*` tokens first; avoid inline colors in Vue files.
- Keep Naive UI styling aligned through `src/ui/theme.ts` rather than one-off overrides.
- Reading content should stay calmer than tool panels: reserve neon emphasis for status, hover,
  selection, controls, and borders.
- Obsidian theme compatibility matters. Derive from Obsidian CSS variables where practical.

## HTML and data safety

- Escape or sanitize user-controlled text before rendering HTML.
- Use `SafeHtml`, `escapeHtml`, `sanitizeToSafeHtml`, `highlightExpression`, and
  `safeHtmlToString` from `src/utils/safeHtml.ts` rather than raw string insertion.
- Any use of `unsafeMarkSafeHtml` must be paired with nearby escaping or a clearly safe source.
- Keep parser-generated HTML covered by tests when changing `src/views/parser.ts`.

## Testing expectations

- Add or update Vitest coverage for parser behavior, DB cache behavior, settings normalization,
  local server behavior, platform helpers, and safe HTML helpers when those areas change.
- Use `tests/mocks/obsidian.ts` for Obsidian API seams instead of importing real app state.
- Prefer focused tests beside the existing test topic files over creating unrelated broad suites.
- If a change touches build output behavior, run `pnpm build`; if it touches lint/format-sensitive
  code, run `pnpm check`.

## Git hygiene

- Inspect `git status --short` before editing.
- The worktree may contain user changes. Do not revert or overwrite unrelated edits.
- Keep generated `main.js` and root `styles.css` out of manual edits unless the user explicitly
  asks for packaged artifacts.
- Version changes should use `pnpm version`, which updates `manifest.json` and `versions.json` and
  stages them.
