/* Verifies the app works when served from a SUBPATH, not just the domain
   root — GitHub Pages serves at user.github.io/repo/, and a leading-slash
   asset reference would silently break there while still working locally.
 *
 * Copies the runtime files into <temp>/ftg-sub/demo-repo/, serves the parent,
 * and prints the URL so headless Edge can be pointed at it.
 * Run:  node dev/subpath.js            (then load /demo-repo/_smoke.html)
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const root = path.join(__dirname, '..');
const sub = path.join(os.tmpdir(), 'ftg-sub', 'demo-repo');
const mount = path.join(os.tmpdir(), 'ftg-sub');

/* fresh copy of everything the page loads */
fs.rmSync(path.join(os.tmpdir(), 'ftg-sub'), { recursive: true, force: true });
fs.mkdirSync(path.join(sub, 'dev'), { recursive: true });

const runtime = ['index.html', 'styles.css', 'app.js', 'flight-api.js',
                 'qrcode.js', 'html-to-image.js', 'html-to-image.js.map'];
const dev = ['trap.js', 'assert.js'];

/* build the smoke page first so it exists to copy */
require('child_process').execFileSync(process.execPath,
  [path.join(__dirname, 'build-smoke.js')], { stdio: 'ignore' });

runtime.concat(['_smoke.html']).forEach(f => {
  const src = path.join(root, f);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(sub, f));
});
dev.forEach(f => fs.copyFileSync(path.join(__dirname, f), path.join(sub, 'dev', f)));

const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.map': 'application/json; charset=utf-8'
};

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(mount, url === '/' ? 'demo-repo/index.html' : url);
  if (!file.startsWith(mount)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, {
      'Content-Type': types[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(buf);
  });
});

server.listen(0, '127.0.0.1', () => {
  const port = server.address().port;
  fs.writeFileSync(path.join(__dirname, '.subport'), String(port));
  console.log('serving parent dir so the app lives at a nested path:');
  console.log('  http://127.0.0.1:' + port + '/demo-repo/index.html');
});
