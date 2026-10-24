/* Phone emulation harness.
 *
 * Headless Edge clamps --window-size to a ~496px minimum, so media queries
 * for 390px/360px phones cannot be tested that way. This drives the browser
 * over the DevTools protocol instead, which can set a true device viewport
 * (and returns a real phone-sized screenshot).
 *
 * Usage:
 *   node dev/serve.js                 (in one shell)
 *   node dev/mobile.js <width> [height] [path]
 * e.g.
 *   node dev/mobile.js 390 844 /_probe.html
 * Writes C:\...\Temp\ftg_mobile_<w>.png and prints the probe output.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
].find(p => fs.existsSync(p));

const width = parseInt(process.argv[2] || '390', 10);
const height = parseInt(process.argv[3] || '844', 10);
const pagePath = process.argv[4] || '/_probe.html';

const portFile = path.join(__dirname, '.port');
const appPort = process.env.FTG_PORT ||
  (fs.existsSync(portFile) ? fs.readFileSync(portFile, 'utf8').trim() : null);
if (!appPort) { console.error('no dev/.port — run node dev/serve.js first (or set FTG_PORT)'); process.exit(1); }

const DEBUG_PORT = 9333;
const tmp = os.tmpdir();

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const proc = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--remote-debugging-port=' + DEBUG_PORT,
    '--user-data-dir=' + path.join(tmp, 'ftg-cdp-profile'),
    'about:blank'
  ], { stdio: 'ignore' });

  let targets = null;
  for (let i = 0; i < 40 && !targets; i++) {
    await sleep(250);
    try { targets = await (await fetch('http://127.0.0.1:' + DEBUG_PORT + '/json/list')).json(); }
    catch (e) { /* not up yet */ }
  }
  if (!targets) { proc.kill(); throw new Error('CDP endpoint never came up'); }

  const page = targets.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let seq = 0;
  const pending = new Map();
  ws.onmessage = ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  };
  function send(method, params) {
    const id = ++seq;
    ws.send(JSON.stringify({ id, method, params: params || {} }));
    return new Promise(res => pending.set(id, res));
  }

  /* a true phone viewport, not a clamped desktop window */
  await send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 2, mobile: true
  });
  await send('Page.enable');
  await send('Page.navigate', { url: 'http://127.0.0.1:' + appPort + pagePath });

  /* wait for the probe to report */
  let text = '';
  for (let i = 0; i < 60; i++) {
    await sleep(300);
    const r = await send('Runtime.evaluate', {
      expression: '(document.getElementById("out")||{}).textContent || ""',
      returnByValue: true
    });
    text = (r.result && r.result.result && r.result.result.value) || '';
    if (/viewport width/.test(text)) break;
  }

  /* full-page capture (captureBeyondViewport) so tall phone layouts are
     visible in one image; a hash target means "just show me that element",
     where a plain viewport shot at 1:1 is more useful and reliable. */
  const wantElement = pagePath.indexOf('#') !== -1;
  let shot;
  if (wantElement) {
    shot = await send('Page.captureScreenshot', { format: 'png' });
  } else {
    const metrics = await send('Page.getLayoutMetrics');
    const cs = metrics.result && metrics.result.cssContentSize;
    shot = await send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: cs ? { x: 0, y: 0, width: cs.width, height: cs.height, scale: 1 } : undefined
    });
    if (!shot.result || !shot.result.data) shot = await send('Page.captureScreenshot', { format: 'png' });
  }
  const shotPath = path.join(tmp, 'ftg_mobile_' + width + '.png');
  fs.writeFileSync(shotPath, Buffer.from(shot.result.data, 'base64'));

  console.log(text || '(probe produced no output)');
  console.log('screenshot: ' + shotPath);

  ws.close();
  proc.kill();
  process.exit(0);
}

main().catch(e => { console.error(e.message); process.exit(1); });
