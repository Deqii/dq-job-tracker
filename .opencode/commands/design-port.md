---
description: Port one mockup page into the app (usage: /design-port B-Detail)
---

Port the mockup design/mockups/$ARGUMENTS.dc.html into the app. Work in this order.

1. Plan first. Read design/DESIGN.md, the mockup file and design/motion-table.md. Then show me: the files you will create or edit, every {{hole}} and the real data that feeds it, every part of the mockup that needs behavior the app does not have yet, and every part of the current page that exists in the app today but is not drawn in the mockup (so nothing disappears silently). Wait for my OK before writing code.
2. Import design/design.css once, globally, if it is not imported yet. Port the markup in the same element order with the same classes. Copy inline style values verbatim. Replace {{...}} with real data, sc-for with a map, sc-if with a conditional, class with className. Set --sticker-base on the page wrapper to this page's value in design/motion-table.md.
3. Check this page's route in design/verify.config.json. If its path or waitFor does not fit this app, fix only those two fields. Never edit expectAnimations, reference, pixel, audit, viewport or fixedTime, and never add or remove routes. If the check output shows "unmocked API call ...", you may add that one "mock" entry and its fixture under design/fixtures/, shaped like the real API response, and tell me which. If anything else in that file looks wrong, stop and ask me.
4. Run `npm run design:check`, then `npm run verify:design -- --route <route name>`. Paste the real output. Fix the APP until both print PASS. Never edit tokens, design.css, the mockup or the check tools to get a PASS. Never run verify.mjs with --init or any command that writes design/reference.
5. Final message: files changed, the pasted check output, and the list of mockup parts you stubbed. Do not say the page matches the mockup; I compare it by eye.
