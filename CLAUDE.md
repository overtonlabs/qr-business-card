# CLAUDE.md

Guidance for this repository lives in **[AGENTS.md](AGENTS.md)**. Read it before making any change.

It is the single source of truth for the design rules, the module layout, the `public/vcard.js`
interface contract, the known landmines, and what a green test run does and does not prove.

Quick reference:

```bash
npm ci && npx playwright install --with-deps chromium   # once
npm test                                                 # unit + end-to-end
npm run serve                                            # preview at http://localhost:4173/
```

Three rules that are easy to break by accident, all enforced by `test/unit/security.test.js`:

- The deployed page loads **nothing** from any external origin. No CDN tags, no fonts, no analytics.
- There is **no build step**. `public/` is published verbatim.
- No inline `<script>`, no inline `style`, no `innerHTML`, and no logging of contact details.
