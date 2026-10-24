/* Builds a clean, deployable copy of the app.
 *
 * The project root also holds the dev harness (dev/), generated smoke pages
 * (_smoke.html, _probe.html) and this README — none of which the app needs at
 * runtime. Uploading the root means uploading that noise, and worse, risking
 * someone poking at test pages. So we stage just the files the browser loads.
 *
 * Outputs:
 *   ../deploy/   staged files, ready to drag onto a host
 *   ../flight-ticket-generator.zip   same files, zipped (Netlify Drop accepts this)
 *
 * Run:  node dev/package.js
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const out = path.join(root, 'deploy');

const FILES = [
  'index.html',
  'styles.css',
  'app.js',
  'flight-api.js',
  'qrcode.js',
  'html-to-image.js',
  'html-to-image.js.map'
];

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

FILES.forEach(f => {
  const src = path.join(root, f);
  if (!fs.existsSync(src)) throw new Error('missing required file: ' + f);
  fs.copyFileSync(src, path.join(out, f));
});

/* sanity: the staged page must be self-contained (no dev/ or _smoke refs) */
const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
const bad = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
  .map(m => m[1])
  .filter(u => /^(dev\/|_smoke|_probe|https?:)/.test(u));
const missing = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
  .map(m => m[1])
  .filter(u => !/^(https?:|#|mailto:)/.test(u))
  .filter(u => !fs.existsSync(path.join(out, u)));
if (missing.length) throw new Error('staged page references files not in deploy/: ' + missing.join(', '));
if (bad.length) console.log('note — external/dev refs in page: ' + bad.join(', '));

/* zip it: Netlify Drop and most hosts accept a zip straight away */
const zip = path.join(root, 'flight-ticket-generator.zip');
fs.rmSync(zip, { force: true });
try {
  execFileSync('powershell.exe', [
    '-NoProfile', '-Command',
    `Compress-Archive -Path "${path.join(out, '*')}" -DestinationPath "${zip}" -Force`
  ], { stdio: 'ignore' });
} catch (e) {
  console.log('zip step failed (folder is still usable): ' + e.message);
}

const total = FILES.reduce((n, f) => n + fs.statSync(path.join(out, f)).size, 0);
console.log('staged ' + FILES.length + ' files -> deploy/  (' +
            Math.round(total / 1024) + ' KB)');
console.log(fs.existsSync(zip)
  ? 'zipped -> flight-ticket-generator.zip  (' +
    Math.round(fs.statSync(zip).size / 1024) + ' KB)'
  : 'no zip produced');
console.log('contents: ' + FILES.join(', '));
