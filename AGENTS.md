# Stageplot Generator

Offline-first 2D stage plot designer for bands and sound engineers: stage editor, drum, percussion and orchestra editors, routing, print view and project export.

See `README.md` for features, key files and the release process. `ARBEITSREGELN.md` holds the binding rules for illustrations, product photos, release notes and Supabase. `PRODUKTPLAN.md` holds the target group, Standard/Pro split and roadmap.

## Commands

See `package.json` for all scripts. Run `npm run` to list them.

## Workflow

- As soon as work on a GitHub issue begins, set its GitHub project status to `In Progress` and verify the change before starting implementation.
- Keep the associated GitHub issue updated at meaningful milestones, when scope or findings change, and after merging. Record implemented changes, the linked PR/commit, the checks actually run with their results, scope and limitations, and an actionable checklist of remaining agreed work.
- Distinguish automated test samples from comprehensive testing and user acceptance. Do not claim broader validation than was performed.
- Close the issue and set its project status to `Done` only when the agreed scope is complete, including any user testing or approval explicitly requested for that issue. After merging, verify both issue and project status; if a PR auto-closed an incomplete issue, reopen it, restore an active project status and document what remains.
- `stageplot-studio.html` is canonical. The modules in `MODULES` (`scripts/build-inline.cjs`) are the single source for its embedded blocks: edit the module, run `npm run build`, never hand-edit between the `build-inline` markers.
- Run `npm test` after every code change. Check behavior or layout changes in the app via `npm run dev`.
- Keep saving local-first and existing browser-storage drafts loadable.
- Never commit secrets, exported projects or personal contact data.
- Never mix this repo with Gigboard or Stageplay 3D.
