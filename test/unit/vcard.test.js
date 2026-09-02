/**
 * Unit tests for the vCard builder.
 *
 * Purpose
 *   Protects the invariants that decide whether a scanned QR code saves a correct contact. Every test
 *   here corresponds to a way the generator has produced, or could produce, a corrupted vCard.
 *
 * Key responsibilities
 *   - Prove that user input can never break out of the field it was typed into.
 *   - Prove that structured properties carry the component counts RFC 2426 requires.
 *   - Prove that blank optional fields produce no property at all.
 *
 * Related files
 *   - public/vcard.js - the module under test.
 *   - AGENTS.md - describes the contract these tests enforce.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildVCard, escapeText, VCARD_VERSION } from '../../public/vcard.js';

// Splits a structured vCard value on its unescaped semicolons, the way a conformant parser would
function splitComponents(value) {
  const parts = [];
  let current = '';
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (char === '\\') {
      current += char + (value[i + 1] || '');
      i += 1;
    } else if (char === ';') {
      parts.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts;
}

// Returns the value portion of the first line whose property name matches
function propertyValue(vcard, name) {
  const line = vcard.split('\n').find((l) => l.split(':')[0].split(';')[0] === name);
  return line === undefined ? undefined : line.slice(line.indexOf(':') + 1);
}

// Returns every line whose property name matches
function propertyLines(vcard, name) {
  return vcard.split('\n').filter((l) => l.split(':')[0].split(';')[0] === name);
}

const MINIMAL = { firstName: 'Steve', lastName: 'Overton' };

test('should require both a first and a last name', () => {
  assert.throws(() => buildVCard({ firstName: 'Steve' }), /required/);
  assert.throws(() => buildVCard({ lastName: 'Overton' }), /required/);
  assert.throws(() => buildVCard({}), /required/);
});

test('should reject whitespace-only names that would satisfy a required attribute', () => {
  assert.throws(() => buildVCard({ firstName: '   ', lastName: 'Overton' }), /required/);
  assert.throws(() => buildVCard({ firstName: 'Steve', lastName: '\t\n ' }), /required/);
});

test('should open and close the document and declare a single version', () => {
  const vcard = buildVCard(MINIMAL);
  const lines = vcard.split('\n');
  assert.equal(lines[0], 'BEGIN:VCARD');
  assert.equal(lines[1], `VERSION:${VCARD_VERSION}`);
  assert.equal(lines[lines.length - 1], 'END:VCARD');
  assert.equal(propertyLines(vcard, 'VERSION').length, 1);
});

test('should omit every optional property when only names are supplied', () => {
  const vcard = buildVCard(MINIMAL);
  for (const name of ['ORG', 'TITLE', 'TEL', 'EMAIL', 'ADR', 'URL', 'NOTE']) {
    assert.equal(propertyLines(vcard, name).length, 0, `${name} should not be emitted`);
  }
  assert.equal(vcard.split('\n').length, 5);
});

test('should treat blank and whitespace-only optional fields as absent', () => {
  const vcard = buildVCard({ ...MINIMAL, org: '   ', jobTitle: '', mobileNumber: '\t' });
  assert.equal(propertyLines(vcard, 'ORG').length, 0);
  assert.equal(propertyLines(vcard, 'TITLE').length, 0);
  assert.equal(propertyLines(vcard, 'TEL').length, 0);
});

test('should emit N with exactly five components', () => {
  const vcard = buildVCard(MINIMAL);
  assert.equal(splitComponents(propertyValue(vcard, 'N')).length, 5);
});

test('should keep N at five components when a name contains a semicolon', () => {
  const vcard = buildVCard({ firstName: 'Steve', lastName: 'O;Brien' });
  const components = splitComponents(propertyValue(vcard, 'N'));
  assert.equal(components.length, 5);
  assert.equal(components[0], 'O\\;Brien', 'the semicolon must stay inside the family-name field');
  assert.equal(components[1], 'Steve', 'the given name must not be displaced');
});

test('should escape backslash, semicolon, comma and newline in text values', () => {
  assert.equal(escapeText('Acme, Inc.'), 'Acme\\, Inc.');
  assert.equal(escapeText('a;b'), 'a\\;b');
  assert.equal(escapeText('a\\b'), 'a\\\\b');
  assert.equal(escapeText('line1\nline2'), 'line1\\nline2');
  assert.equal(escapeText('line1\r\nline2'), 'line1\\nline2');
});

test('should escape a backslash before the delimiters it introduces', () => {
  // A single input backslash must become exactly two, not four
  assert.equal(escapeText('\\'), '\\\\');
  assert.equal(escapeText('\\;'), '\\\\\\;');
});

test('should not split an organisation containing a comma', () => {
  const vcard = buildVCard({ ...MINIMAL, org: 'Acme, Inc.' });
  assert.equal(propertyValue(vcard, 'ORG'), 'Acme\\, Inc.');
});

test('should emit ORG without a trailing separator that implies an empty unit', () => {
  const vcard = buildVCard({ ...MINIMAL, org: 'Overton Labs' });
  assert.equal(propertyValue(vcard, 'ORG'), 'Overton Labs');
});

const FULL_ADDRESS = {
  homeAddressStreet1: '123 Main St',
  homeAddressCity: 'Springfield',
  homeAddressState: 'IL',
  homeAddressZip: '62704',
  homeAddressCountryCode: 'USA'
};

test('should emit ADR with exactly seven components', () => {
  const vcard = buildVCard({ ...MINIMAL, ...FULL_ADDRESS });
  assert.equal(splitComponents(propertyValue(vcard, 'ADR')).length, 7);
});

test('should keep ADR at seven components when the street contains a semicolon', () => {
  const vcard = buildVCard({
    ...MINIMAL,
    ...FULL_ADDRESS,
    homeAddressStreet1: '123 Main St; Suite 4'
  });
  const components = splitComponents(propertyValue(vcard, 'ADR'));
  assert.equal(components.length, 7, 'a semicolon in the street must not shift every later component');
  assert.equal(components[2], '123 Main St\\; Suite 4');
  assert.equal(components[3], 'Springfield', 'city must remain in the locality component');
  assert.equal(components[6], 'USA', 'country must remain in the final component');
});

test('should omit an address that is missing a required part', () => {
  for (const missing of ['homeAddressStreet1', 'homeAddressCity', 'homeAddressState', 'homeAddressZip']) {
    const address = { ...FULL_ADDRESS, [missing]: '' };
    const vcard = buildVCard({ ...MINIMAL, ...address });
    assert.equal(propertyLines(vcard, 'ADR').length, 0, `omitting ${missing} should suppress the address`);
  }
});

test('should emit an address whose country code is blank', () => {
  const vcard = buildVCard({ ...MINIMAL, ...FULL_ADDRESS, homeAddressCountryCode: '' });
  const components = splitComponents(propertyValue(vcard, 'ADR'));
  assert.equal(components.length, 7);
  assert.equal(components[6], '');
});

test('should fold a second street line into the street component as an escaped newline', () => {
  const vcard = buildVCard({ ...MINIMAL, ...FULL_ADDRESS, homeAddressStreet2: 'Building B' });
  const components = splitComponents(propertyValue(vcard, 'ADR'));
  assert.equal(components.length, 7);
  assert.equal(components[2], '123 Main St\\nBuilding B');
});

test('should emit home and work addresses independently', () => {
  const vcard = buildVCard({
    ...MINIMAL,
    ...FULL_ADDRESS,
    workAddressStreet1: '9 Business Park',
    workAddressCity: 'Chicago',
    workAddressState: 'IL',
    workAddressZip: '60601'
  });
  const addresses = propertyLines(vcard, 'ADR');
  assert.equal(addresses.length, 2);
  assert.ok(addresses[0].startsWith('ADR;TYPE=HOME:'));
  assert.ok(addresses[1].startsWith('ADR;TYPE=WORK:'));
});

test('should use registered vCard 3.0 telephone types', () => {
  const vcard = buildVCard({ ...MINIMAL, mobileNumber: '+1-555-0100', workNumber: '+1-555-0199' });
  const tels = propertyLines(vcard, 'TEL');
  assert.equal(tels.length, 2);
  assert.ok(tels[0].includes('TYPE=CELL'), 'mobile is not a registered 3.0 type; CELL is');
  assert.ok(tels[0].includes('TYPE=PREF'));
  assert.ok(tels[1].includes('TYPE=WORK'));
});

test('should emit both email addresses with distinct types', () => {
  const vcard = buildVCard({ ...MINIMAL, primaryEmail: 'work@example.com', secondaryEmail: 'home@example.com' });
  const emails = propertyLines(vcard, 'EMAIL');
  assert.equal(emails.length, 2);
  assert.ok(emails[0].includes('TYPE=WORK'));
  assert.ok(emails[1].includes('TYPE=HOME'));
});

test('should emit both websites as separate URL properties', () => {
  const vcard = buildVCard({ ...MINIMAL, website1: 'https://a.example', website2: 'https://b.example' });
  assert.equal(propertyLines(vcard, 'URL').length, 2);
});

test('should preserve non-ASCII characters unchanged', () => {
  const vcard = buildVCard({ firstName: 'Zoé', lastName: 'Müller', org: '東京株式会社' });
  assert.equal(propertyValue(vcard, 'FN'), 'Zoé Müller');
  assert.equal(propertyValue(vcard, 'ORG'), '東京株式会社');
  assert.equal(splitComponents(propertyValue(vcard, 'N'))[0], 'Müller');
});

test('should build a full card whose every line is a parseable property', () => {
  const vcard = buildVCard({
    firstName: 'Steve',
    lastName: 'Overton',
    org: 'Overton Labs, LLC',
    jobTitle: 'VP, Engineering',
    mobileNumber: '+1-555-0100',
    primaryEmail: 'work@example.com',
    ...FULL_ADDRESS,
    website1: 'https://example.com'
  });
  const lines = vcard.split('\n');
  assert.equal(lines[0], 'BEGIN:VCARD');
  assert.equal(lines[lines.length - 1], 'END:VCARD');
  for (const line of lines.slice(2, -1)) {
    assert.match(line, /^[A-Z]+(;[^:]+)?:/, `line is not a valid property: ${line}`);
  }
});
