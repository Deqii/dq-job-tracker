---
description: Port one mockup page into the app (usage: /design-port B-Detail)
---

Port the mockup design/mockups/$ARGUMENTS.dc.html into the app. Work in this order.

1. Plan first. Read design/DESIGN.md, the mockup file and design/motion-table.md. Then show me: the files you will create or edit, every {{hole}} and the real data that feeds it, and every part of the mockup that needs behavior the app does not have yet. Wait for my OK before writing code.
2. Import design/design.css once, globally, if it is not imported yet. Port the markup in the same element order with the same classes. Copy inline style values verbatim. Replace {{...}} with real data, sc-for with a map, sc-if with a conditional, class with className. Set --sticker-base on the page wrapper to this page's value in design/motion-table.md.
3. Add or fix this page's route in design/verify.config.json (name, path, waitFor, expectAnimations).
4. Run `npm run design:check`, then `npm run verify:design -- --route <route name>`. Paste the real output. Fix the APP until both print PASS. Never edit tokens, design.css, the mockup or the check tools to get a PASS.
5. Final message: files changed, the pasted check output, and the list of mockup parts you stubbed. Do not say the page matches the mockup; I compare it by eye.
