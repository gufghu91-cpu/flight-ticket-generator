/* Builds ../_probe.html = index.html + a phone-width overflow probe.
   Run:  node dev/build-probe.js                                              */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

html = html.replace(
  '<link rel="stylesheet" href="styles.css" />',
  '<link rel="stylesheet" href="styles.css" />\n<script src="dev/trap.js"></script>'
);
if (!/dev\/trap\.js/.test(html)) throw new Error('could not inject dev/trap.js');

html = html.replace(
  '</body>',
  '<div id="out" style="white-space:pre;font:13px/1.5 monospace;padding:16px">pending</div>\n' +
  '<script src="dev/probe.js"></script>\n</body>'
);
if (!/dev\/probe\.js/.test(html)) throw new Error('could not inject dev/probe.js');

fs.writeFileSync(path.join(root, '_probe.html'), html, 'utf8');
console.log('wrote _probe.html (' + html.length + ' bytes)');
