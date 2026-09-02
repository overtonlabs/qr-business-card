/**
 * vCard construction for the QR Business Card generator.
 *
 * Purpose
 *   Builds an RFC 2426 (vCard 3.0) document from plain contact fields. This is the payload that gets
 *   encoded into the QR code, so its correctness is the whole product: a malformed value here becomes
 *   a wrong contact saved on someone's phone.
 *
 * Key responsibilities
 *   - Escape every user-supplied value so that delimiters cannot break out of their field.
 *   - Emit properties only for fields that carry a value, so blank inputs never produce empty properties.
 *   - Assemble structured values (N, ADR, ORG) with the exact component counts the spec requires.
 *
 * Design rules that must not be violated
 *   - This is a native ES module served as a static file. There is no build step and no bundler, so
 *     it must stay dependency-free and run unmodified in both a browser and Node.
 *   - It must never touch the DOM. Keeping it pure is what allows every invariant below to be unit
 *     tested without a browser.
 *   - Every value interpolated into the document passes through escapeText(). The only unescaped
 *     characters in the output are the structural delimiters this file writes itself.
 *   - vCard 3.0 is deliberate, not legacy drift. See VCARD_VERSION below.
 *
 * Related files
 *   - public/app.js - reads the form, calls buildVCard(), and renders the result as a QR code.
 *   - test/vcard.test.js - unit tests for every invariant described here.
 *   - AGENTS.md - the contract this module is expected to honour.
 */

/**
 * vCard version emitted by this module.
 *
 * 3.0 is chosen over 4.0 on compatibility grounds. The product promise is that a scanned code opens
 * the native contact viewer on any mainstream phone without an app, and 3.0 is the most broadly
 * supported version across Android contact importers. The property syntax below (TYPE=INTERNET,
 * TYPE=PREF, comma-free parameter values) is 3.0 syntax; declaring 4.0 while emitting it, as this
 * project did until now, produced a document that conformed to neither version.
 */
export const VCARD_VERSION = '3.0';

/**
 * Escapes a single text value for inclusion in a vCard document.
 *
 * RFC 2426 section 2 requires backslash, semicolon and comma to be escaped inside text values, and
 * newlines to be encoded as the two-character sequence \n. Backslash is replaced first; replacing it
 * later would double-escape the backslashes introduced by the other replacements.
 *
 * @param {string} value - Raw value as typed by the user.
 * @returns {string} The value, safe to interpolate into a vCard property.
 */
export function escapeText(value) {
  return String(value == null ? '' : value)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

// Normalises a field to a trimmed string, treating null and undefined as empty
function clean(value) {
  return String(value == null ? '' : value).trim();
}

/**
 * Assembles one ADR property value from its parts.
 *
 * An address is only emitted when street, city, state and postal code are all present, because a
 * partial address imports as a broken address rather than as no address. The post-office-box and
 * extended-address components are always empty, which is why the value opens with two separators.
 *
 * @param {object} parts - street1, street2, city, state, zip and countryCode, unescaped.
 * @returns {string} The seven-component ADR value, or an empty string when incomplete.
 */
export function buildAddress(parts) {
  const street1 = clean(parts.street1);
  const street2 = clean(parts.street2);
  const city = clean(parts.city);
  const state = clean(parts.state);
  const zip = clean(parts.zip);
  const country = clean(parts.countryCode);

  if (!street1 || !city || !state || !zip) {
    return '';
  }

  // A second street line is folded into the street component as an escaped newline
  let street = escapeText(street1);
  if (street2) {
    street = street + '\\n' + escapeText(street2);
  }

  return [
    '', // post office box, intentionally unused
    '', // extended address, intentionally unused
    street,
    escapeText(city),
    escapeText(state),
    escapeText(zip),
    escapeText(country)
  ].join(';');
}

/**
 * Builds a complete vCard document from a contact object.
 *
 * Only firstName and lastName are required; every other field is omitted from the output when blank.
 * Lines are joined with LF rather than the CRLF the spec calls for: every mainstream phone importer
 * accepts LF, and each saved byte is QR capacity that a longer contact would otherwise lose. This is
 * a deliberate, tested deviation - see test/vcard.test.js.
 *
 * @param {object} contact - Trimmed or untrimmed contact fields; values are cleaned internally.
 * @returns {string} A vCard 3.0 document.
 * @throws {Error} When either name component is missing or blank.
 */
export function buildVCard(contact) {
  const input = contact || {};
  const firstName = clean(input.firstName);
  const lastName = clean(input.lastName);

  if (!firstName || !lastName) {
    throw new Error('First name and last name are required.');
  }

  const lines = ['BEGIN:VCARD', 'VERSION:' + VCARD_VERSION];

  // N carries five components: family, given, additional, prefix, suffix
  lines.push('N:' + escapeText(lastName) + ';' + escapeText(firstName) + ';;;');
  lines.push('FN:' + escapeText(firstName + ' ' + lastName));

  // Optional single-value properties, emitted only when the user supplied something
  const org = clean(input.org);
  if (org) {
    lines.push('ORG:' + escapeText(org));
  }

  const jobTitle = clean(input.jobTitle);
  if (jobTitle) {
    lines.push('TITLE:' + escapeText(jobTitle));
  }

  // CELL and WORK are the registered vCard 3.0 telephone types; "mobile" is not one
  const mobileNumber = clean(input.mobileNumber);
  if (mobileNumber) {
    lines.push('TEL;TYPE=CELL;TYPE=VOICE;TYPE=PREF:' + escapeText(mobileNumber));
  }

  const workNumber = clean(input.workNumber);
  if (workNumber) {
    lines.push('TEL;TYPE=WORK;TYPE=VOICE:' + escapeText(workNumber));
  }

  const primaryEmail = clean(input.primaryEmail);
  if (primaryEmail) {
    lines.push('EMAIL;TYPE=INTERNET;TYPE=WORK:' + escapeText(primaryEmail));
  }

  const secondaryEmail = clean(input.secondaryEmail);
  if (secondaryEmail) {
    lines.push('EMAIL;TYPE=INTERNET;TYPE=HOME:' + escapeText(secondaryEmail));
  }

  const homeAddress = buildAddress({
    street1: input.homeAddressStreet1,
    street2: input.homeAddressStreet2,
    city: input.homeAddressCity,
    state: input.homeAddressState,
    zip: input.homeAddressZip,
    countryCode: input.homeAddressCountryCode
  });
  if (homeAddress) {
    lines.push('ADR;TYPE=HOME:' + homeAddress);
  }

  const workAddress = buildAddress({
    street1: input.workAddressStreet1,
    street2: input.workAddressStreet2,
    city: input.workAddressCity,
    state: input.workAddressState,
    zip: input.workAddressZip,
    countryCode: input.workAddressCountryCode
  });
  if (workAddress) {
    lines.push('ADR;TYPE=WORK:' + workAddress);
  }

  const website1 = clean(input.website1);
  if (website1) {
    lines.push('URL:' + escapeText(website1));
  }

  const website2 = clean(input.website2);
  if (website2) {
    lines.push('URL:' + escapeText(website2));
  }

  lines.push('END:VCARD');

  return lines.join('\n');
}
