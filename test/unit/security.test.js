/**
 * Supply-chain and isolation guards for the deployed site.
 *
 * Purpose
 *   The product promise is that this page runs entirely in the visitor's browser and contacts nothing.
 *   That is easy to state and easy to break by adding one convenient CDN tag. These tests make the
 *   promise mechanical: if anything under public/ reaches off-origin, or the vendored encoder changes
 *   underneath us, the build fails.
 *
 * Key responsibilities
 *   - Assert that no file served to visitors references an external origin.
 *   - Assert that no inline script or style exists, which is what lets the CSP omit 'unsafe-inline'.
 *   - Assert that the Content-Security-Policy is present and still denies by default.
 *   - Pin the vendored third-party encoder by hash.
 *
 * Related files
 *   - public/index.html - carries the policy these tests check.
 *   - public/vendor/lean-qr.js - the only third-party code in the repository.
 *   - AGENTS.md - explains why these rules exist before you try to relax one.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, extname } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(HERE, '..', '..', 'public');

// The upstream bytes of lean-qr 2.7.3, excluding the provenance header this repository prepends.
// Recompute with: tail -n +9 public/vendor/lean-qr.js | shasum -a 256
const LEAN_QR_UPSTREAM_SHA256 = '3e1b236f34ce8e89398a12b08984a330a4afa29c7a8a010ae24dc382a216b0fd';
const LEAN_QR_HEADER_LINES = 8;

// Removes HTML comments so prose mentioning a tag is not mistaken for markup
function stripComments(html) {
  return html.replace(/<!--[\s\S]*?-->/g, '');
}

// Walks public/ and returns every text file a visitor could be served
function textFiles() {
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (['.html', '.js', '.css', '.xml', '.txt'].includes(extname(entry))) {
        found.push(full);
      }
    }
  };
  walk(PUBLIC_DIR);
  return found;
}

test('should not load any resource from an external origin', () => {
  const loaders = [
    /<script[^>]+src\s*=\s*["']([^"']+)["']/gi,
    /<link[^>]+rel=["'](?:stylesheet|icon|preload|prefetch|manifest)["'][^>]*href\s*=\s*["']([^"']+)["']/gi,
    /<img[^>]+src\s*=\s*["']([^"']+)["']/gi,
    /@import\s+(?:url\()?["']([^"']+)["']/gi,
    /url\(\s*["']?(https?:[^"')]+)["']?\s*\)/gi
  ];

  for (const file of textFiles()) {
    const contents = readFileSync(file, 'utf8');
    for (const pattern of loaders) {
      for (const match of contents.matchAll(pattern)) {
        const url = match[1];
        assert.ok(
          !/^(https?:)?\/\//.test(url),
          `${relative(PUBLIC_DIR, file)} loads an off-origin resource: ${url}`
        );
      }
    }
  }
});

test('should contain no inline script or style, so the CSP can forbid unsafe-inline', () => {
  const html = stripComments(readFileSync(join(PUBLIC_DIR, 'index.html'), 'utf8'));

  // A <script> tag with no src attribute is an inline script
  for (const match of html.matchAll(/<script\b([^>]*)>/gi)) {
    assert.match(match[1], /\bsrc\s*=/, `inline <script> found: <script${match[1]}>`);
  }

  assert.ok(!/<style\b/i.test(html), 'inline <style> block found');
  assert.ok(!/\sstyle\s*=\s*["']/i.test(html), 'inline style attribute found');
  assert.ok(!/\son[a-z]+\s*=\s*["']/i.test(html), 'inline event handler attribute found');
});

test('should declare a Content-Security-Policy that denies by default', () => {
  const html = readFileSync(join(PUBLIC_DIR, 'index.html'), 'utf8');
  const match = html.match(/<meta[^>]+http-equiv="Content-Security-Policy"[^>]+content="([^"]+)"/i);
  assert.ok(match, 'no Content-Security-Policy meta tag found');

  const policy = match[1];
  assert.match(policy, /default-src\s+'none'/, "policy must start from default-src 'none'");
  assert.match(policy, /script-src\s+'self'/, "scripts must be limited to 'self'");
  assert.match(policy, /object-src\s+'none'/, 'plugins must be denied');
  assert.match(policy, /base-uri\s+'none'/, 'base URI must be locked down');
  assert.ok(!/unsafe-inline/.test(policy), "policy must not permit 'unsafe-inline'");
  assert.ok(!/unsafe-eval/.test(policy), "policy must not permit 'unsafe-eval'");
});

test('should keep the vendored encoder byte-identical to the pinned upstream release', () => {
  const vendored = readFileSync(join(PUBLIC_DIR, 'vendor', 'lean-qr.js'), 'utf8');
  const payload = vendored.split('\n').slice(LEAN_QR_HEADER_LINES).join('\n');
  const digest = createHash('sha256').update(payload, 'utf8').digest('hex');

  assert.equal(
    digest,
    LEAN_QR_UPSTREAM_SHA256,
    'public/vendor/lean-qr.js no longer matches the pinned upstream bytes'
  );
});

test('should ship the licence text for the vendored encoder', () => {
  const licence = readFileSync(join(PUBLIC_DIR, 'vendor', 'lean-qr.LICENSE'), 'utf8');
  assert.match(licence, /MIT License/);
  assert.match(licence, /David Evans/);

  const vendored = readFileSync(join(PUBLIC_DIR, 'vendor', 'lean-qr.js'), 'utf8');
  assert.match(vendored, /MIT License/, 'the vendored file must carry its copyright notice');
});

test('should contain no third-party code outside the vendor directory', () => {
  for (const file of textFiles()) {
    if (relative(PUBLIC_DIR, file).startsWith('vendor')) continue;
    const contents = readFileSync(file, 'utf8');
    assert.ok(!/\beval\s*\(/.test(contents), `${relative(PUBLIC_DIR, file)} uses eval()`);
    assert.ok(!/new\s+Function\s*\(/.test(contents), `${relative(PUBLIC_DIR, file)} uses new Function()`);
    assert.ok(!/\.innerHTML\s*=/.test(contents), `${relative(PUBLIC_DIR, file)} assigns to innerHTML`);
  }
});

test('should not log contact details to the console', () => {
  for (const file of textFiles()) {
    if (relative(PUBLIC_DIR, file).startsWith('vendor')) continue;
    const contents = readFileSync(file, 'utf8');
    assert.ok(
      !/console\.(log|info|debug|warn)\s*\(/.test(contents),
      `${relative(PUBLIC_DIR, file)} writes to the console; this page handles other people's PII`
    );
  }
});

test('should reference the canonical domain consistently', () => {
  const html = readFileSync(join(PUBLIC_DIR, 'index.html'), 'utf8');
  const sitemap = readFileSync(join(PUBLIC_DIR, 'sitemap.xml'), 'utf8');
  const robots = readFileSync(join(PUBLIC_DIR, 'robots.txt'), 'utf8');

  assert.match(html, /<link rel="canonical" href="https:\/\/qrbizcard\.net\/">/);
  assert.match(sitemap, /<loc>https:\/\/qrbizcard\.net\/<\/loc>/);
  assert.match(robots, /Sitemap: https:\/\/qrbizcard\.net\/sitemap\.xml/);
});

test('should not reference the pre-move repository owner anywhere', () => {
  for (const file of textFiles()) {
    const contents = readFileSync(file, 'utf8');
    assert.ok(
      !/Steve0verton/i.test(contents),
      `${relative(PUBLIC_DIR, file)} still points at the old repository owner`
    );
  }
});
