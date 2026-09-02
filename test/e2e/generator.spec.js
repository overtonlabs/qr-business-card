/**
 * End-to-end tests for the QR Business Card generator.
 *
 * Purpose
 *   Unit tests prove the vCard text is correct. These prove the pixels are correct: each test fills the
 *   real form in a real browser, reads the rendered canvas, decodes the QR code back to a string, and
 *   asserts the decoded contact matches what the page claims to have encoded. That round trip is the
 *   only check that would have caught the encoder defect this project shipped for two years, where a
 *   single accented character produced no QR code at all.
 *
 * Key responsibilities
 *   - Decode what the user would actually scan, not what the page says it encoded.
 *   - Cover the non-ASCII and delimiter cases that previously corrupted or destroyed the output.
 *   - Assert the page reaches no external origin and logs no errors.
 *
 * Related files
 *   - public/app.js - the code under test.
 *   - test/support/static-server.mjs - serves the page for these tests.
 */

import { test, expect } from '@playwright/test';
import jsQR from 'jsqr';

/**
 * Fills the named form fields, leaving everything else untouched.
 *
 * Address fields sit inside collapsed disclosure sections, so the matching section is opened first,
 * the same way a visitor would have to open it before typing.
 */
async function fillContact(page, fields) {
  for (const [name, value] of Object.entries(fields)) {
    const field = page.locator(`#${name}`);
    const section = field.locator('xpath=ancestor::details[1]');

    if ((await section.count()) > 0 && !(await section.evaluate((el) => el.open))) {
      await section.locator('summary').click();
    }

    await field.fill(value);
  }
}

/**
 * Reads the rendered canvas and decodes the QR code it contains.
 *
 * The canvas holds one device pixel per QR module, which is correct for display but leaves a decoder
 * very little to work with, so it is upscaled with smoothing disabled before decoding. Scaling happens
 * in the page from the real canvas, so the bytes under test are the ones the user sees.
 *
 * @returns {Promise<string|null>} The decoded payload, or null when no code could be read.
 */
async function decodeRenderedQR(page) {
  const image = await page.evaluate(() => {
    const source = document.getElementById('qrcode');
    if (source.hidden || !source.width) return null;

    const scale = 8;
    const scaled = document.createElement('canvas');
    scaled.width = source.width * scale;
    scaled.height = source.height * scale;

    const context = scaled.getContext('2d');
    context.imageSmoothingEnabled = false;
    context.drawImage(source, 0, 0, scaled.width, scaled.height);

    const data = context.getImageData(0, 0, scaled.width, scaled.height);
    return { data: Array.from(data.data), width: data.width, height: data.height };
  });

  if (!image) return null;
  const decoded = jsQR(Uint8ClampedArray.from(image.data), image.width, image.height);
  return decoded ? decoded.data : null;
}

// Fails the test if the page logged an uncaught error or a console error at any point
function trackPageErrors(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  return errors;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('should encode a minimal contact and decode it back exactly', async ({ page }) => {
  const errors = trackPageErrors(page);

  await fillContact(page, { firstName: 'Steve', lastName: 'Overton' });
  await page.click('button[type="submit"]');

  const shown = await page.textContent('#contactQRsource');
  const decoded = await decodeRenderedQR(page);

  expect(decoded).not.toBeNull();
  expect(decoded).toBe(shown);
  expect(decoded).toContain('BEGIN:VCARD');
  expect(decoded).toContain('VERSION:3.0');
  expect(decoded).toContain('N:Overton;Steve;;;');
  expect(decoded).toContain('FN:Steve Overton');
  expect(decoded.endsWith('END:VCARD')).toBe(true);
  expect(errors).toEqual([]);
});

test('should encode accented and non-Latin characters without corrupting them', async ({ page }) => {
  const errors = trackPageErrors(page);

  // This exact input produced no QR code at all before the encoder was replaced
  await fillContact(page, {
    firstName: 'José',
    lastName: 'Muñoz',
    org: '東京株式会社',
    jobTitle: 'Directeur Général'
  });
  await page.click('button[type="submit"]');

  const decoded = await decodeRenderedQR(page);

  expect(decoded, 'a QR code must be rendered for non-ASCII input').not.toBeNull();
  expect(decoded).toContain('FN:José Muñoz');
  expect(decoded).toContain('N:Muñoz;José;;;');
  expect(decoded).toContain('ORG:東京株式会社');
  expect(decoded).toContain('TITLE:Directeur Général');
  expect(errors).toEqual([]);
});

test('should keep delimiters inside the field they were typed into', async ({ page }) => {
  await fillContact(page, {
    firstName: 'Steve',
    lastName: 'O;Brien',
    org: 'Acme, Inc.',
    homeAddressStreet1: '123 Main St; Suite 4',
    homeAddressCity: 'Springfield',
    homeAddressState: 'IL',
    homeAddressZip: '62704'
  });
  await page.click('button[type="submit"]');

  const decoded = await decodeRenderedQR(page);
  expect(decoded).not.toBeNull();

  // Escaped, so a parser sees one family name rather than a name plus a displaced given name
  expect(decoded).toContain('N:O\\;Brien;Steve;;;');
  expect(decoded).toContain('ORG:Acme\\, Inc.');

  const address = decoded.split('\n').find((line) => line.startsWith('ADR;TYPE=HOME:'));
  expect(address).toBeDefined();
  // Seven components: the semicolon in the street must not shift city, state or ZIP along
  expect(address.slice('ADR;TYPE=HOME:'.length).split(/(?<!\\);/)).toHaveLength(7);
  expect(address).toContain('123 Main St\\; Suite 4');
});

test('should omit optional properties that were left blank', async ({ page }) => {
  await fillContact(page, { firstName: 'Steve', lastName: 'Overton' });
  await page.click('button[type="submit"]');

  const decoded = await decodeRenderedQR(page);
  for (const property of ['ORG:', 'TITLE:', 'TEL', 'EMAIL', 'ADR', 'URL:']) {
    expect(decoded).not.toContain(property);
  }
});

test('should refuse to generate without a name and explain why', async ({ page }) => {
  const errors = trackPageErrors(page);

  await fillContact(page, { firstName: 'Steve' });
  await page.click('button[type="submit"]');

  await expect(page.locator('#status')).toHaveAttribute('data-state', 'error');
  await expect(page.locator('#status')).toContainText('required');
  await expect(page.locator('#qrcode')).toBeHidden();
  expect(errors).toEqual([]);
});

test('should clear the previous contact from the page on reset', async ({ page }) => {
  await fillContact(page, { firstName: 'Steve', lastName: 'Overton', mobileNumber: '+1-555-0100' });
  await page.click('button[type="submit"]');
  await expect(page.locator('#qrcode')).toBeVisible();

  await page.click('button[type="reset"]');

  // The rendered code and the previous person's details must both be gone
  await expect(page.locator('#qrcode')).toBeHidden();
  await expect(page.locator('#contactQRsource')).toHaveText('');
  expect(await decodeRenderedQR(page)).toBeNull();
});

test('should keep the download button unavailable until a code exists', async ({ page }) => {
  const errors = trackPageErrors(page);

  await expect(page.locator('#download-qrcode')).toBeDisabled();

  await fillContact(page, { firstName: 'Steve', lastName: 'Overton' });
  await page.click('button[type="submit"]');
  await expect(page.locator('#download-qrcode')).toBeEnabled();

  await page.click('button[type="reset"]');
  await expect(page.locator('#download-qrcode')).toBeDisabled();

  expect(errors).toEqual([]);
});

test('should download the rendered code as a PNG', async ({ page }) => {
  const errors = trackPageErrors(page);

  await fillContact(page, { firstName: 'Steve', lastName: 'Overton' });
  await page.click('button[type="submit"]');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#download-qrcode')
  ]);

  expect(download.suggestedFilename()).toBe('qrbizcard.png');

  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const bytes = Buffer.concat(chunks);

  // PNG magic number, so this is a real image rather than the page saved under an image name
  expect(bytes.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  expect(errors).toEqual([]);
});

test('should render the code on an opaque white background', async ({ page }) => {
  await fillContact(page, { firstName: 'Steve', lastName: 'Overton' });
  await page.click('button[type="submit"]');

  // The encoder defaults light modules to transparent, which exports a PNG with no background and
  // stops scanning once it is printed on coloured stock or shown in a dark-mode viewer.
  const corner = await page.evaluate(() => {
    const canvas = document.getElementById('qrcode');
    const { data } = canvas.getContext('2d').getImageData(0, 0, 1, 1);
    return { r: data[0], g: data[1], b: data[2], a: data[3] };
  });

  expect(corner).toEqual({ r: 255, g: 255, b: 255, a: 255 });
});

test('should request nothing from any external origin', async ({ page }) => {
  const offOrigin = [];
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (!['localhost', '127.0.0.1'].includes(url.hostname)) offOrigin.push(url.href);
    route.continue();
  });

  await page.goto('/');
  await fillContact(page, { firstName: 'Steve', lastName: 'Overton' });
  await page.click('button[type="submit"]');
  await page.waitForLoadState('networkidle');

  expect(offOrigin, `page contacted external origins: ${offOrigin.join(', ')}`).toEqual([]);
});

test('should re-render rather than leave a stale code when the contact changes', async ({ page }) => {
  await fillContact(page, { firstName: 'Steve', lastName: 'Overton' });
  await page.click('button[type="submit"]');
  const first = await decodeRenderedQR(page);

  await page.fill('#lastName', 'Overton-Smith');
  await page.click('button[type="submit"]');
  const second = await decodeRenderedQR(page);

  expect(second).not.toBe(first);
  expect(second).toContain('FN:Steve Overton-Smith');
  expect(second).toBe(await page.textContent('#contactQRsource'));
});
