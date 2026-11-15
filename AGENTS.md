# Stageplot Generator

Offline-first 2D stage plot designer for bands and sound engineers: stage editor, drum, percussion and orchestra editors, routing, print view and project export.

See `README.md` for features, key files and the release process. `CLAUDE.md` holds the binding rules for illustrations, product photos and release notes.

## Commands

See `package.json` for all scripts. Run `npm run` to list them.

## Workflow

- As soon as work on a GitHub issue begins, set its GitHub project status to `In Progress` and verify the change before starting implementation.
- `stageplot-studio.html` is canonical. The modules in `MODULES` (`scripts/build-inline.cjs`) are the single source for its embedded blocks: edit the module, run `npm run build`, never hand-edit between the `build-inline` markers.
- Run `npm test` after every code change. Check behavior or layout changes in the app via `npm run dev`.
- Keep saving local-first and existing browser-storage drafts loadable.
- Never commit secrets, exported projects or personal contact data.
- Never mix this repo with Gigboard or Stageplay 3D.
