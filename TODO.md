# TODO

Running list of things to do. Items completed in 1.0.0 have been removed; see
[CHANGELOG.md](CHANGELOG.md) for what changed.

## Features

* Ability to select phone and email "type" from a standardised drop-down
* Ability to select address "type" from a standardised drop-down
* Country selection from a standardised drop-down rather than a free-text field
* Add more than one of a repeated field (phone, email, address) by adding rows on demand, instead of
  showing a fixed set
* Checkbox to mark which phone, email or address is "preferred"
* Add birthday (`BDAY`)
* Add contact notes (`NOTE`). Previously present and removed in 42937a3 because the value did not
  import correctly on iOS; needs retesting on a current device before it comes back
* Stronger field validation, particularly on the address components
* Address lookup and validation. Any such service is a third-party network call, which the design
  rules in AGENTS.md currently forbid — this needs a decision before it can be built, not just an
  implementation

## Known limitations

* **No HSTS.** `http://qrbizcard.net` returns a cleartext 301 to HTTPS, and GitHub Pages does not send
  a `Strict-Transport-Security` header for custom domains, so the first request of a session is still
  interceptable. Fixing this properly needs a CDN in front of Pages. This supersedes the older
  "figure out why the non-HTTPS version gets redirected" note: enforced HTTPS narrowed that problem
  but did not remove it.
* **Contact photos are not supported and probably never will be.** A photo does not fit in a QR code
  at any useful resolution. Attempted in 327c6a6 and reverted in 874a442.
* **Only Chromium is covered by the browser tests.** Safari and Firefox behaviour is unverified.
* **No real device is exercised in CI.** Nothing here proves a given iOS or Android Contacts app
  imports the card as expected; that still needs a manual scan before releasing encoder changes.
