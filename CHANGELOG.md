# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Releases before 1.0.0 were untagged and unversioned; the site was deployed straight from `main`. The
entry below is the first release with a version number attached.

## [Unreleased]

## [1.0.0] - 2026-09-01

The first versioned release. It fixes a defect that made the generator produce no QR code at all for
anyone whose details contained an accented or non-Latin character, removes every third-party runtime
dependency, and puts the project under test and working CI for the first time.

### Fixed

- **Non-ASCII input produced no QR code.** A single accented character — `José`, `Müller`, `東京` — made
  the page render nothing, with no error shown to the user, while still displaying the vCard text
  underneath as though it had worked. The bundled `qrcodejs` encoder hoisted its byte-scratch array
  outside its character loop and never truncated it, so after any multi-byte character every
  subsequent narrower character emitted stale trailing bytes (`"José Muñoz"` encoded to 17 bytes
  instead of 12). The result was usually `code length overflow`. It could not be fixed by
  configuration — it failed at every error-correction level and every QR version — and the upstream
  minified build had not been regenerated since 2013. Replaced with
  [lean-qr](https://github.com/davidje13/lean-qr).
- **Contact values were never escaped.** `;`, `,` and `\` were written into the vCard raw, so a last
  name of `O'Brien; Jr.` pushed the first name into the Middle Name field on import, `Acme, Inc.`
  became a two-value organization, and a street of `123 Main St; Suite 4` produced an eight-component
  address that shifted city into region, state into postal code and ZIP into country. Every value is
  now escaped per RFC 2426.
- **The card claimed to be vCard 4.0 while being written in 3.0 syntax**, conforming to neither. It now
  declares and emits valid vCard 3.0. `N` carries its required five components (it previously emitted
  three) and `ORG` no longer emits a trailing separator implying an empty organizational unit. `TEL`
  uses the registered `CELL` type rather than the unregistered `mobile`.
- **The download button threw on every use.** `document.body.removeChild()` was called on an anchor
  that had never been appended, raising `NotFoundError` each time. Pressing Download before generating
  anything, or after pressing Reset, threw a `TypeError` and did nothing at all, with no feedback.
  Downloads now report success or failure in the status line.
- **Reset left the previous person's details on screen.** It cleared the QR image but not the vCard
  text pane, so a full name, phone number and home address stayed visible after the form was cleared.
- **The deploy pipeline had been broken for roughly nineteen months.** The workflow pinned
  `actions/upload-pages-artifact@v1`, which wraps `actions/upload-artifact@v3` — shut down by GitHub on
  2025-01-30. The last successful deploy predated the shutdown, so the site kept serving and nothing
  ever reported a failure. All actions are now on supported majors and Dependabot watches them.
- The generated QR image had no `alt` text, and the twelve address inputs had no `<label>` elements.
- The address accordion declared `aria-expanded="true"` on a panel that rendered collapsed.

### Added

- A test suite: 31 unit tests (`node:test`, no dependencies) covering the vCard contract, and 11
  Playwright tests that fill the real form, decode the rendered QR code and assert the decoded text
  matches what the page displays.
- Automated enforcement of the project's own rules — tests fail the build if any file under `public/`
  references an external origin, if an inline script or style appears, if the Content-Security-Policy
  is weakened, or if the vendored encoder stops matching its pinned hash.
- A CI workflow running the full suite on Node 22 and 24. The deploy workflow now depends on it, so a
  commit whose tests fail can no longer be published.
- A deny-by-default Content-Security-Policy (`default-src 'none'`, no `unsafe-inline`, no
  `unsafe-eval`) and `referrer: no-referrer`.
- `AGENTS.md` as the canonical contributor and agent guidance, covering the design rules, the
  `vcard.js` interface contract, the known landmines and the verification boundary.
- This changelog, a Dependabot configuration, and a root `.gitignore`.

### Changed

- **The page now loads nothing from any other origin.** Bootstrap, jQuery and Popper were being pulled
  from two third-party CDNs on every page view; jQuery was never used at all and Popper was loaded
  twice, since `bootstrap.bundle.min.js` already contains it. All three are gone, replaced by
  hand-written CSS. The address sections use native `<details>` elements instead of a framework
  accordion, which removed the JavaScript behind them entirely.
- The vCard builder was extracted from an inline event handler into `public/vcard.js`, a pure,
  DOM-free ES module. It could not be tested at all in its previous form.
- The QR code renders to a `<canvas>` on an opaque white background. The encoder defaults light
  modules to transparent, which looks correct on screen but exports a PNG with no background — one
  that stops scanning when printed on coloured stock or opened in a dark-mode viewer.
- The quiet zone around the code is a full four modules, as the QR specification requires.
- Downloads use an object URL rather than a data URL, and revoke it immediately.
- `README.md` rewritten for both a first-time visitor and an agent needing the exact contract.
- `sitemap.xml` gained the XML declaration it was missing and dropped an unused image namespace;
  `robots.txt` dropped a `Disallow` rule for a path that never existed, copied from Google's example
  file.
- The repository moved to the `overtonlabs` organisation. Every in-repo URL was updated.

### Removed

- The contact details of whoever used the page were being written to the browser console on every
  generate. They no longer are.
- `public/qrcode.min.js`, the unmaintained bundled encoder.

### Corrections to earlier documentation

These correct statements that were wrong when written; the historical record above and in git is left
as it stands.

- The README's "Contact Syntax Example" documented `VERSION:3.0` while the code emitted `VERSION:4.0`,
  listed the same `VERSION` line twice — which is not a valid vCard — and documented `NOTE` and `BDAY`
  properties that the generator has never produced. `NOTE` was removed from the form in `42937a3`
  (2024) and `BDAY` was never implemented.
- Commit `07a639a`, "Update vCard to version 4.0", changed only the version string. The properties
  around it stayed vCard 3.0 throughout, so the output was never valid 4.0. This release resolves the
  contradiction toward 3.0.
- `TODO.md` listed "Print and download buttons to make it easier to save QR code" as outstanding after
  a download button had already shipped in `72ffd71` (2024-10-10).

[Unreleased]: https://github.com/overtonlabs/qr-business-card/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/overtonlabs/qr-business-card/releases/tag/v1.0.0
