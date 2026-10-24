/* Builds ../_smoke.html = the real index.html with the error trap prepended
   and the behavioural assertions appended, so headless Edge can run the app
   and report results through --dump-dom.
   Run:  node dev/build-smoke.js                                             */
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
  '<script src="dev/assert.js"></script>\n</body>'
);
if (!/dev\/assert\.js/.test(html)) throw new Error('could not inject dev/assert.js');

fs.writeFileSync(path.join(root, '_smoke.html'), html, 'utf8');
console.log('wrote _smoke.html (' + html.length + ' bytes)');
