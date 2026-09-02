/**
 * Page behaviour for the QR Business Card generator.
 *
 * Purpose
 *   Wires the contact form to the vCard builder and renders the result as a QR code. This is the only
 *   script the page loads besides the vendored encoder, and it is the only file that touches the DOM.
 *
 * Key responsibilities
 *   - Read the form into a plain object and hand it to buildVCard().
 *   - Render the returned document into the canvas, and keep the on-page source pane in step with it.
 *   - Report failures to the user in the status region instead of throwing into the console.
 *   - Offer the rendered code as a PNG download.
 *
 * Design rules that must not be violated
 *   - No third-party code and no network access. The Content-Security-Policy in index.html forbids
 *     both, so anything added here must be same-origin.
 *   - No user-supplied value is ever assigned to innerHTML. Text goes in through textContent only.
 *   - Contact details must not be written to the console; this page handles other people's PII.
 *   - Every state change must leave the canvas, the source pane and the status line consistent with
 *     each other. A stale QR code beside fresh text is how a wrong contact gets printed.
 *
 * Related files
 *   - public/vcard.js - builds the document; pure, DOM-free, unit tested.
 *   - public/vendor/lean-qr.js - the QR encoder.
 *   - test/e2e/generator.spec.js - drives this file in a real browser and decodes the result.
 */

import { buildVCard } from './vcard.js';
import { generate, mode, correction } from './vendor/lean-qr.js';

const form = document.getElementById('contactInfo');
const canvas = document.getElementById('qrcode');
const source = document.getElementById('contactQRsource');
const status = document.getElementById('status');
const downloadButton = document.getElementById('download-qrcode');

const encoder = new TextEncoder();

// Holds the most recently rendered code, or null when nothing is on screen. The download button and
// the canvas both derive from this, so there is a single source of truth for "is there a code?".
let currentCode = null;

// The exact field names buildVCard() understands, read straight off the form
const FIELDS = [
  'firstName', 'lastName', 'org', 'jobTitle',
  'mobileNumber', 'workNumber', 'primaryEmail', 'secondaryEmail',
  'homeAddressStreet1', 'homeAddressStreet2', 'homeAddressCity',
  'homeAddressState', 'homeAddressZip', 'homeAddressCountryCode',
  'workAddressStreet1', 'workAddressStreet2', 'workAddressCity',
  'workAddressState', 'workAddressZip', 'workAddressCountryCode',
  'website1', 'website2'
];

/**
 * Writes a message to the live region beneath the form.
 *
 * @param {string} message - Text to announce; an empty string clears the region.
 * @param {'info'|'error'} [state] - Controls styling and the assertiveness of the announcement.
 */
function setStatus(message, state = 'info') {
  status.textContent = message;
  status.dataset.state = state;
}

/**
 * Collects the current form values into the shape buildVCard() expects.
 *
 * @returns {object} One property per entry in FIELDS.
 */
function readForm() {
  const contact = {};
  for (const name of FIELDS) {
    const element = form.elements[name];
    contact[name] = element ? element.value : '';
  }
  return contact;
}

// Empties the canvas and forgets the current code, leaving the page in its "nothing generated" state
function clearQRCode() {
  currentCode = null;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
  canvas.hidden = true;
  downloadButton.disabled = true;
}

/**
 * Encodes a vCard document and paints it into the canvas.
 *
 * The payload is handed over as explicit UTF-8 bytes. Passing a bare string would let the encoder
 * choose a mode that emits an ECI designator, which is standards-correct but changes the bytes a
 * phone scanner sees; raw byte mode reproduces what contact scanners already expect.
 *
 * @param {string} text - The vCard document to encode.
 */
function renderQRCode(text) {
  currentCode = generate(mode.bytes(encoder.encode(text)), {
    minCorrectionLevel: correction.M
  });
  currentCode.toCanvas(canvas, {
    // Opaque black on opaque white. The encoder defaults light modules to TRANSPARENT, which looks
    // fine on this page but exports a PNG with no background - unscannable once it is printed on
    // anything but white, or viewed in a dark-mode image viewer.
    on: [0, 0, 0],
    off: [255, 255, 255],
    // A four-module quiet zone is the minimum the QR specification requires; anything narrower and
    // real scanners intermittently fail to find the code.
    padX: 4,
    padY: 4
  });
  canvas.hidden = false;
  downloadButton.disabled = false;
}

// Builds the card, renders it, and keeps the source pane and status line consistent with the result
function handleSubmit(event) {
  event.preventDefault();

  let vcard;
  try {
    vcard = buildVCard(readForm());
  } catch (error) {
    clearQRCode();
    source.textContent = '';
    setStatus(error.message, 'error');
    return;
  }

  try {
    renderQRCode(vcard);
  } catch (error) {
    // An encoder failure must not leave a stale code on screen next to fresh text
    clearQRCode();
    source.textContent = '';
    setStatus(
      'That contact is too long to fit in a QR code. Try removing a field, such as a second address.',
      'error'
    );
    return;
  }

  source.textContent = vcard;
  setStatus('QR code generated. Scan it with your phone to check it before printing.');
}

/**
 * Saves the rendered code as a PNG.
 *
 * The anchor is never added to the document, so there is nothing to remove afterwards. An object URL
 * is used rather than a data URL because it stays small regardless of image size, and it is revoked
 * as soon as the click has been dispatched.
 */
function handleDownload() {
  if (!currentCode) {
    setStatus('Generate a QR code first, then download it.', 'error');
    return;
  }

  // Scaled well above display size so the PNG stays sharp when printed
  canvas.toBlob((blob) => {
    if (!blob) {
      setStatus('The QR code could not be saved. Try generating it again.', 'error');
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'qrbizcard.png';
    link.click();
    URL.revokeObjectURL(url);
    setStatus('QR code saved as qrbizcard.png.');
  }, 'image/png');
}

// Reset must clear the previous contact's details from the screen, not just the image
function handleReset() {
  clearQRCode();
  source.textContent = '';
  setStatus('');
}

form.addEventListener('submit', handleSubmit);
form.addEventListener('reset', handleReset);
downloadButton.addEventListener('click', handleDownload);

// The page starts with nothing generated, so the canvas is hidden and download is unavailable
clearQRCode();
