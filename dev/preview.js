/* One-off: build a preview page with the Aviationstack source pre-selected and
   no key, so the onboarding banner can be screenshotted. Deleted afterwards. */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
html = html.replace(
  '<link rel="stylesheet" href="styles.css" />',
  '<link rel="stylesheet" href="styles.css" />\n' +
  '<script>\n' +
  '/* seed: live source chosen, no key yet */\n' +
  "try { localStorage.setItem('flight-ticket-generator:api',\n" +
  "  JSON.stringify({provider:'aviationstack', key:'', currency:'USD', adults:1}));\n" +
  '} catch (e) {}\n' +
  '</script>'
);
fs.writeFileSync(path.join(root, '_preview.html'), html, 'utf8');
console.log('wrote _preview.html');
