# QR Business Card

[![CI](https://github.com/overtonlabs/qr-business-card/actions/workflows/ci.yml/badge.svg)](https://github.com/overtonlabs/qr-business-card/actions/workflows/ci.yml)
[![Deploy](https://github.com/overtonlabs/qr-business-card/actions/workflows/static.yml/badge.svg)](https://github.com/overtonlabs/qr-business-card/actions/workflows/static.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A522-brightgreen.svg)](https://nodejs.org/)

Turn your contact details into a QR code that opens the native contact card on whatever phone scans
it. Print it on a business card, a flyer, a conference badge, or the back of your phone.

**Use it now: <https://qrbizcard.net/>** — nothing to install, nothing to sign up for.

The QR code holds a [vCard](https://en.wikipedia.org/wiki/VCard) directly. It is not a link to a
redirect service, so it works with no internet connection and no app, and nobody gets to log who
scanned it. The generator page holds to the same standard: it loads nothing from any other origin, and
what you type never leaves your browser.

## Quick start

Just open <https://qrbizcard.net/>, fill in the form, and press **Generate**.

To run it locally:

```bash
git clone https://github.com/overtonlabs/qr-business-card.git
cd qr-business-card
npm run serve          # http://localhost:4173/
```

`npm run serve` needs Node 22 or newer and installs nothing. The page is a native ES module, so it has
to be served over HTTP — opening `public/index.html` from the filesystem will not work.

## What goes in the code

Only first and last name are required. Any field left blank is omitted from the vCard entirely.

| Field | vCard property |
| --- | --- |
| First name, last name | `N`, `FN` |
| Organization | `ORG` |
| Job title | `TITLE` |
| Mobile phone | `TEL;TYPE=CELL;TYPE=VOICE;TYPE=PREF` |
| Work phone | `TEL;TYPE=WORK;TYPE=VOICE` |
| Work email | `EMAIL;TYPE=INTERNET;TYPE=WORK` |
| Personal email | `EMAIL;TYPE=INTERNET;TYPE=HOME` |
| Home address | `ADR;TYPE=HOME` |
| Work address | `ADR;TYPE=WORK` |
| Website, second website | `URL` |

An address is only included when its street, city, state and postal code are all filled in — a partial
address imports as a broken address rather than as no address.

A generated card looks like this:

```
BEGIN:VCARD
VERSION:3.0
N:Overton;Steve;;;
FN:Steve Overton
ORG:Overton Labs
TITLE:Principal Engineer
TEL;TYPE=CELL;TYPE=VOICE;TYPE=PREF:+1-555-0100
EMAIL;TYPE=INTERNET;TYPE=WORK:steve@example.com
ADR;TYPE=HOME:;;1234 Somewhere St;Springfield;IL;62704;USA
URL:https://example.com
END:VCARD
```

vCard **3.0** is deliberate: it is what Android contact importers handle most reliably, and working on
every phone is the whole point. See [AGENTS.md](AGENTS.md) before changing it.

## What it will and will not do

**It will:**

- Handle accented, CJK and emoji characters correctly.
- Keep `;` `,` and `\` inside the field you typed them into, so `Acme, Inc.` and `123 Main St; Suite 4`
  survive intact.
- Export a print-ready PNG on an opaque white background.
- Run entirely offline once the page has loaded.

**It will not:**

- Embed a contact photo. Photos are far too large for a QR code.
- Add birthdays, notes, or multiple phone numbers of the same type yet. See [TODO.md](TODO.md).
- Fit an unlimited amount of text. A very long contact — two full addresses plus long URLs — can
  exceed QR capacity, and the page will say so rather than fail silently.
- Guarantee any particular phone's Contacts app behaves identically. Scan your own code before you
  print a thousand of them.

## How it is built

No framework, no build step, no runtime dependencies. `public/` is published verbatim.

| | |
| --- | --- |
| Page | Hand-written HTML, CSS and ES modules |
| QR encoding | [lean-qr](https://github.com/davidje13/lean-qr), vendored and pinned by hash |
| Hosting | GitHub Pages, deployed by GitHub Actions from `public/` |
| Tests | `node:test` for units, Playwright for the browser round trip |

The page sets a deny-by-default Content-Security-Policy (`default-src 'none'`, no `unsafe-inline`).
A test suite enforces that no external origin ever creeps back in.

## Development

```bash
npm ci                                       # install dev dependencies
npx playwright install --with-deps chromium  # one-time browser download
npm test                                     # unit + end-to-end
npm run test:unit                            # fast; no browser needed
npm run test:e2e                             # fills the form, decodes the QR, checks the round trip
npm run serve                                # preview at http://localhost:4173/
```

The end-to-end suite decodes the rendered QR code and asserts it matches the vCard shown on the page,
so a broken encoder cannot pass. CI runs everything on Node 22 and 24, and the deploy workflow will not
publish unless it passes.

Playwright and `jsqr` are development dependencies only. Nothing is ever shipped to the page.

**Contributing and agent guidance: [AGENTS.md](AGENTS.md).** It documents the design rules, the
`vcard.js` contract, the landmines, and — importantly — what a green test run does *not* prove.

## Licence

[MIT](LICENSE). The vendored QR encoder is MIT, © 2021-2025 David Evans; see
[`public/vendor/lean-qr.LICENSE`](public/vendor/lean-qr.LICENSE).

Author: [Steve Overton](https://www.linkedin.com/in/overton/)
