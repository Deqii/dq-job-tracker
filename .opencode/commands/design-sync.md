---
description: Regenerate the design contract after the mockups changed on purpose
---
The mockups in design/mockups were updated on purpose. Regenerate the contract and tell me what changed.

1. Run `npm run design:sync`. If it exits with code 2 it found a conflict between pages that nobody has decided yet: show me the CONFLICT lines and stop.
2. Run `git diff --stat design/` and `git diff design/design.css design/tokens.json design/motion-table.md`. Summarize in plain words which colors, radii, shadows, fonts, animations or rules changed.
3. Run `npm run design:check`. If DESIGN.md now mentions something that no longer exists, tell me what to edit. Do not edit DESIGN.md yourself.
4. List the app files and routes that probably need to be re-ported, one line each.
