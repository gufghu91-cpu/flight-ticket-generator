/* Minimal static server. Serve over http:// rather than file:// — Chromium
   redacts every page error to "Script error." on file:// origins, which makes
   debugging impossible.
   Run:  node dev/serve.js   then open http://127.0.0.1:<port>/index.html     */
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.map': 'application/json; charset=utf-8'
};

const server = http.createServer(function (req, res) {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(root, url === '/' ? 'index.html' : url);

  if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }

  fs.readFile(file, function (err, buf) {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, {
      'Content-Type': types[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(buf);
  });
});

server.listen(0, '127.0.0.1', function () {
  const port = server.address().port;
  fs.writeFileSync(path.join(__dirname, '.port'), String(port));
  console.log('serving ' + root);
  console.log('index : http://127.0.0.1:' + port + '/index.html');
  console.log('smoke : http://127.0.0.1:' + port + '/_smoke.html   (run dev/build-smoke.js first)');
});
