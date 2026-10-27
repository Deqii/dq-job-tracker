# Warm Editorial: design contract

The mockups are the source of truth. If this file disagrees with a mockup, the mockup wins: stop and tell the maintainer.

## Source files
- `design/mockups/B-Dashboard.dc.html`, `design/mockups/B-Applications.dc.html`, `design/mockups/B-Detail.dc.html`, `design/mockups/B-Form.dc.html`: layout, copy and states, exported from the design canvas. Never edit.
- `design/design.css`, `design/tokens.json`, `design/motion-table.md`: generated from the mockups by `design/tools/extract.mjs`. Never edit by hand. Read `design/design.css` before writing any style.

## The look
Cream paper, ink-colored 2px borders, hard offset shadows with zero blur, pill and soft-square shapes, slightly rotated stickers, dashed dividers. Headlines in Bricolage Grotesque, body in Instrument Sans, the job-description textarea in the monospace stack.

Forbidden even if it looks better: gradients, blurred or inset shadows, translucency or glass effects, emoji, any new color, radius, font size or animation, Inter/Roboto/system fonts for headings, a UI library's default theme, Tailwind's default palette.

## Rules
1. Colors: only the custom properties declared on `:root` in `design/design.css` (`var(--ink)`, `var(--marker)`, ...) or literal values already listed in `design/tokens.json` under `used.colors`.
2. Shadows: `Npx Npx 0 <color>`. Blur and spread are always 0. Offsets come from `used.shadows`.
3. Radii, border widths, font sizes: only the values in `used.radii`, `used.borderWidths`, `used.fontSizes`.
4. Fonts: both web fonts must really load (the `@import` at the top of `design/design.css`, or self-hosted `@font-face` with the same family names and weights). A missing font falls back silently.
5. Motion: every animation and transition comes from `design/motion-table.md` with the same duration, easing and delay. A class that animates must be in the `prefers-reduced-motion` block of `design/design.css`. No inline `style` transitions, no animation library, no new keyframes. The only JavaScript motion is the Dashboard count-up (requestAnimationFrame, 1000ms, ease-out cubic, skipped under reduced motion).
6. Layout and spacing are checked only by the pixel baseline. Copy inline style values from the mockup verbatim. Do not convert them to a spacing scale or utility classes, do not tidy them.
7. Copy: use the mockup text verbatim. `{{...}}` is app data, not text.
8. Hover, active, focus and disabled styles come from the shared classes in `design/design.css` (`.hard`, `.field`, `.stg`, `.back`, `.nav-b`, ...). Do not restyle them per page.

## Reading a mockup
- `{{a.b}}` is a value from app data, `<sc-for list="{{rows}}" as="row">` a loop, `<sc-if value="{{x}}">` a conditional, `onClick="{{fn}}"` a handler. `class` becomes `className`.
- The root element `.ed` is the page wrapper. Set `--sticker-base` on it to the page's value in `design/motion-table.md`.
- Per-element variables: `--d` delay, `--i` index, `--r` rotation, `--sh` shadow color, `--ping` ping color.
- The mockups are drawn at 1440px wide with flex-wrap. Do not invent other breakpoints.

## Mockup versus current app
Styling only: everything not listed here.
New behavior the mockups propose (stub with a TODO and ask first): Dashboard funnel, source breakdown and follow-up list with a done toggle; Applications source filter chips, Board/Table toggle and "Show more" tile; Detail stage picker (replaces the select), "Save notes" button and real dates in the status history; Form company Saved/New toggle, remote toggle switch and live "Board preview" panel.
Sample data in the mockups (the user name "Tio", counts, dates) must be replaced by real data.

## Done means
`npm run design:check` and `npm run verify:design` print PASS (a SKIP column was not checked and counts as not verified), the real output is pasted in the final message, and the maintainer has compared the route with the mockup by eye. Never write that a page "matches the mockup".
