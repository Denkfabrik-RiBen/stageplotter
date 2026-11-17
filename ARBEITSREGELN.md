# Arbeitsregeln für besondere Aufgaben

Diese Regeln gelten nur für die jeweilige Aufgabe. `CLAUDE.md` verweist hierher, damit sie nicht bei jedem Start geladen werden.

## Instrument- und Gerätebilder

- Fixed user rule: always use image generation for new or replacement instrument/equipment illustrations and save the resulting raster assets locally. Do not substitute hand-coded SVG paths or CSS drawings for these images.
- Research the characteristic anatomy of new instrument variants first. Keep an asset manifest with prompts, reference sources and generation provenance. SVG may position the raster image without redrawing the instrument.
- Microphone catalog pictures and named DI-box product pictures are explicit exceptions: use only real photographs of the correct product. Never generate catalog photos; label representative photos for generic types. Keep source/credit metadata with the local files.
- Keep Stageplot assets local so the editor continues to work offline.

## Release Notes und Veröffentlichung

- Maintain the in-app release notes regularly. Before each publication, check which user-visible changes are missing and summarize related improvements in one dated entry when appropriate; a separate entry for every small fix is unnecessary.
- Describe shipped behavior, and keep the current entry, version badge, help footer, README, package.json and package-lock.json consistent. Preserve earlier release entries.

## Account und Supabase

- The optional Supabase login and sync client are prepared. Production credentials and live integration testing remain outstanding; see `ACCOUNT_SETUP.md`.
- Keep the default public configuration empty and the SDK bundle local. Run `npm run build:vendor` when updating its dependencies.
