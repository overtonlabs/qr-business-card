# AGENTS.md

Canonical guidance for anyone — human or AI agent — changing this repository. Read it before editing.
`CLAUDE.md` points here; there is no second source of truth.

## What this project is

A single static page that turns contact details into a QR code containing a
[vCard](https://en.wikipedia.org/wiki/VCard). Scanning it opens the native contact viewer on the
scanning phone, so the contact can be saved in one tap.

The point is what it *doesn't* do. The code contains the contact outright — it is not a link to a
redirect service, so it keeps working with no internet connection, no app, and nothing tracking the
scan. The page that generates it holds to the same standard: it loads nothing from anywhere else, and
the details typed into it never leave the browser.

- Live site: <https://qrbizcard.net/> — served by GitHub Pages from `public/`.
- Repository: <https://github.com/overtonlabs/qr-business-card>

## Design rules that must not be violated

These are the constraints the whole design rests on. Breaking one silently undoes the product's reason
to exist, so each is enforced by a test in `test/unit/security.test.js`.

1. **No third-party runtime dependencies, ever.** The deployed page makes zero external requests. No
   CDN tags, no fonts, no analytics, no frameworks. The only third-party code is the QR encoder,
   vendored into `public/vendor/` and pinned by hash.
2. **No build step.** `public/` is uploaded verbatim by the deploy workflow. What you edit is what
   ships. Anything requiring compilation, bundling or transpilation is out of scope.
3. **The Content-Security-Policy stays deny-by-default.** `default-src 'none'`, no `unsafe-inline`, no
   `unsafe-eval`. That is only possible because there is no inline script or style anywhere — keep it
   that way rather than relaxing the policy.
4. **No contact data leaves the browser, and none is logged.** No `console.log`, no telemetry, no
   storage. This page handles other people's PII.
5. **No `innerHTML`.** User text reaches the DOM through `textContent` only.

## Module layout

```
public/                    everything served to visitors; the deploy artifact, verbatim
  index.html               markup, the CSP, and the only <script> tag
  app.js                   DOM wiring: read form -> buildVCard -> render -> download -> reset
  vcard.js                 pure vCard construction; no DOM, fully unit tested
  styles.css               hand-written; replaced the Bootstrap/jQuery/Popper bundles
  vendor/lean-qr.js        the QR encoder, vendored verbatim and pinned by hash
  vendor/lean-qr.LICENSE   its MIT licence text, which the MIT terms require us to ship
  favicon.ico, robots.txt, sitemap.xml
test/
  unit/vcard.test.js       the vCard contract; zero dependencies, node:test
  unit/security.test.js    enforces the five rules above mechanically
  e2e/generator.spec.js    fills the real form, decodes the rendered QR, asserts the round trip
  support/static-server.mjs  dependency-free static server for preview and for Playwright
.github/workflows/
  ci.yml                   unit + e2e on Node 22 and 24; also called by static.yml
  static.yml               deploys public/ to Pages, gated on ci.yml passing
```

## The interface contract

`public/vcard.js` is the stable surface. `app.js` and the tests both depend on exactly this:

```js
import { buildVCard, escapeText, buildAddress, VCARD_VERSION } from './vcard.js';

buildVCard(contact) -> string   // throws Error when firstName or lastName is blank
escapeText(value)   -> string   // escapes \  ;  ,  and newline
VCARD_VERSION       === '3.0'
```

`buildVCard` accepts a flat object. Recognised keys, all optional except the two names:

```
firstName* lastName* org jobTitle mobileNumber workNumber primaryEmail secondaryEmail
website1 website2
homeAddressStreet1 homeAddressStreet2 homeAddressCity homeAddressState homeAddressZip homeAddressCountryCode
workAddressStreet1 workAddressStreet2 workAddressCity workAddressState workAddressZip workAddressCountryCode
```

Guarantees, each covered by a test:

- Blank or whitespace-only optional fields emit **no property at all**, never an empty one.
- Every interpolated value is escaped. Structural delimiters written by `vcard.js` itself are not.
- `N` always has exactly 5 components; `ADR` always exactly 7, regardless of input content.
- An address is emitted only when street, city, state and postal code are all present.
- Input is returned unchanged apart from escaping — including non-ASCII.

The form field `id` and `name` attributes in `index.html` must match these key names exactly;
`app.js` reads them by name from the `FIELDS` list.

## Known landmines

**The previous QR encoder silently produced no QR code for non-ASCII input.** `qrcodejs` hoisted its
byte-scratch array outside its character loop and never truncated it, so after any multi-byte
character every subsequent narrower character emitted stale trailing bytes — `"José Muñoz"` became 17
bytes instead of 12. The usual result was `code length overflow` and a blank QR area with no error
shown. It was unfixable by configuration and the upstream minified build had not been rebuilt since
2013. It was replaced with `lean-qr`. **Do not reintroduce a hand-rolled UTF-8 encoder**; hand the
encoder explicit bytes from `TextEncoder`.

**lean-qr defaults light modules to transparent.** `off: [0, 0, 0, 0]`. On screen that looks correct
against the page background, but the exported PNG then has no background and stops scanning once
printed on coloured stock or opened in a dark-mode viewer. `app.js` passes explicit opaque
`on`/`off` colours. Keep them.

**The quiet zone must stay at 4 modules.** Narrower and real scanners intermittently fail to find the
code, even though a software decoder may still read it.

**vCard 3.0 is deliberate.** The code declared `VERSION:4.0` from 2023 to 2026 while emitting 3.0
property syntax throughout, so it conformed to neither. It was resolved toward 3.0 because 3.0 is what
Android contact importers ingest most reliably, and reliability on every phone is the product promise.
If you move to 4.0, `TEL` values must become `tel:` URIs, `TYPE=PREF` becomes `PREF=1`, and
`TYPE=INTERNET` must go — it is undefined in RFC 6350. Change `VCARD_VERSION` and the property syntax
together or not at all.

**A `CNAME` file will not help.** This site publishes from a custom Actions workflow, and GitHub's
documentation is explicit: *"If you are publishing from a custom GitHub Actions workflow, no `CNAME`
file is created, and any existing `CNAME` file is ignored and is not required."* The custom domain
lives only in the repository's Pages settings. Adding a `CNAME` file would be a misleading no-op.

**`upload-pages-artifact@v1` is dead and so is anything on the node16 runtime.** The deploy pipeline
sat broken for roughly nineteen months without anyone noticing, because the last push predated the
shutdown of the action it wrapped. Nothing failed; nothing deployed either. Dependabot now watches
this, but if a deploy ever silently stops happening, check action versions first.

**`form` carries `novalidate`.** Validation is handled in `app.js` so failures are announced in the
live region rather than shown as browser bubbles, and so they are testable. Removing `novalidate`
would make the required-field tests pass for the wrong reason.

## How to make common changes

**Add a contact field.** Add the input to `index.html` with matching `id` and `name`; add that name to
`FIELDS` in `app.js`; emit the property in `buildVCard`, routing the value through `escapeText`; add a
unit test asserting it is omitted when blank and escaped when it contains a delimiter.

**Change the vCard output.** Edit `public/vcard.js` only. It must stay DOM-free — that is what keeps it
unit testable. Update `test/unit/vcard.test.js` in the same change.

**Change the page's appearance.** Edit `public/styles.css`. Do not add a framework and do not add an
inline `style` attribute; the CSP forbids the latter and a test enforces it.

**Update the vendored encoder.** Replace `public/vendor/lean-qr.js` keeping the provenance header,
refresh `LEAN_QR_UPSTREAM_SHA256` in `test/unit/security.test.js`, and re-run the suite. Verify with:

```bash
tail -n +9 public/vendor/lean-qr.js | shasum -a 256
```

## Verifying your change

```bash
npm ci                                     # once
npx playwright install --with-deps chromium # once
npm test                                    # unit + end-to-end
npm run serve                               # preview at http://localhost:4173/
```

The page is a native ES module, so it must be served over HTTP. Opening `public/index.html` from the
filesystem fails on the module import — use `npm run serve`.

### What a green suite does and does not prove

It proves the vCard text is correct, that the rendered QR **decodes back** to exactly that text
(including accented and CJK input), that the page contacts no external origin, that the download is a
real PNG, and that the CSP and vendored hash are intact.

It does **not** prove:

- that any specific iPhone or Android build imports the vCard the way its user expects — no real
  Contacts app is exercised anywhere in CI;
- that a phone camera can read the code off printed paper at a given size or in poor light;
- that the GitHub Pages deployment itself works — the workflow is only exercised by running it;
- anything about DNS, the custom domain, or TLS certificate issuance;
- cross-browser behaviour beyond Chromium, which is the only browser the suite runs.

Test on a real phone before releasing a change to the encoder or to the vCard structure. That is the
one check nothing here can do for you.

## Release process

1. Work on a branch; `npm test` must pass.
2. Move the change from `## [Unreleased]` into a new version heading in `CHANGELOG.md`, following
   Keep a Changelog. Bump `version` in `package.json` to match.
3. Open a PR. CI runs the suite on Node 22 and 24.
4. Merge to `main`. `static.yml` re-runs the suite and, only if it passes, publishes `public/`.
5. Confirm <https://qrbizcard.net/> serves the change, then scan the code with a real phone.
