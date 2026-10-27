---
description: Run the design checks and fix drift in the app (usage: /design-verify [route name])
---

Run `npm run design:check`.

Then run the browser checks. The route argument is: "$ARGUMENTS". If it is empty, run `npm run verify:design` (all routes). Otherwise run `npm run verify:design -- --route $ARGUMENTS`.

Read the output. For every violation, fix the APP code, then run both commands again. At most 5 rounds.
Never change tokens, design.css, motion-table.md, the mockups, the check tools or design/verify.config.json to get a PASS. If a violation looks like a problem in the contract or the tools, stop and explain it instead.
A column that says SKIP was not checked (for example pixels without a reference PNG). Report it as "not verified", never as a pass.
End with the real output of the last run and the list of files you changed.
