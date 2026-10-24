/* Static check: every id the JS reaches for must exist in the HTML, and every
   local asset referenced by the page must exist on disk.
   Run:  node dev/check.js                                                  */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'app.js'), 'utf8') +
           fs.readFileSync(path.join(root, 'flight-api.js'), 'utf8');

const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
const used = new Set([...js.matchAll(/\$\(\s*'([^']+)'\s*\)/g)].map(m => m[1]));

const missing = [...used].filter(i => !ids.has(i));
console.log('ids in html          :', ids.size);
console.log('ids reached from js  :', used.size);
console.log(missing.length
  ? 'MISSING IN HTML      : ' + missing.join(', ')
  : 'OK — every id referenced from JS exists in index.html');

const neverUsed = [...ids].filter(i => !used.has(i));
console.log('ids defined, unused  :', neverUsed.join(', ') || '(none)');

const assets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
  .map(m => m[1])
  .filter(u => !/^(https?:|#|mailto:)/.test(u));
const missingAssets = assets.filter(a => !fs.existsSync(path.join(root, a)));
console.log('local assets         :', assets.join(', '));
console.log(missingAssets.length
  ? 'MISSING ASSETS       : ' + missingAssets.join(', ')
  : 'OK — all local assets exist');

process.exitCode = missing.length || missingAssets.length ? 1 : 0;
