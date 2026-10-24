/* ============================================================================
 * app.js — form state, rendering, export, templates/history and live search.
 * ==========================================================================*/
(function () {
'use strict';

var $ = function (id) { return document.getElementById(id); };

/* ------------------------------------------------------------------ state */
/* Fields shared by every passenger. */
var GLOBAL_FIELDS = [
  'airline', 'font', 'logoSize', 'logoColor', 'logoColorHex', 'logoTextColor',
  'logoTextColorHex', 'flight', 'date', 'fromCode', 'fromCity', 'fromTerm',
  'toCode', 'toCity', 'toTerm', 'dep', 'arr', 'dur', 'tripType',
  'retDate', 'retFlight', 'retDep', 'retArr', 'retDur',
  'site', 'fare', 'seq', 'pnrcode', 'bg'
];

/* Fields that belong to one passenger. */
var PAX_MAP = {
  passenger: 'name', seat: 'seat', gate: 'gate', class: 'cls',
  boarding: 'boarding', group: 'group', etkt: 'etkt', seq: 'seq'
};
var PAX_FIELDS = Object.keys(PAX_MAP);

var DEFAULT_PAX = {
  name: 'OLIVIA JOHN', seat: '14A', gate: '10', cls: 'Economy',
  boarding: '09:45', group: '2', etkt: '087-7532356789', seq: '03'
};

var PAX = [Object.assign({}, DEFAULT_PAX)];
var ACTIVE = 0;

var STATE_KEY = 'flight-ticket-generator:v2';
var LEGACY_KEY = 'flight-ticket-generator:v1';
var TPL_KEY = 'flight-ticket-generator:templates';
var HIST_KEY = 'flight-ticket-generator:history';
var HIST_MAX = 12;

/* shipped defaults, captured before saved state is restored, so Reset can go back */
var DEFAULTS = {};
GLOBAL_FIELDS.forEach(function (id) { if ($(id)) DEFAULTS[id] = $(id).value; });

/* ------------------------------------------------------------- storage IO */
function readStore(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
}
function writeStore(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* quota/private mode */ }
}

function snapshot() {
  var g = {};
  GLOBAL_FIELDS.forEach(function (id) { if ($(id)) g[id] = $(id).value; });
  return { g: g, pax: JSON.parse(JSON.stringify(PAX)), active: ACTIVE };
}

function saveState() { writeStore(STATE_KEY, snapshot()); }

function loadState() {
  var s = readStore(STATE_KEY);

  /* one-time migration from the single-passenger v1 layout */
  if (!s) {
    var v1 = readStore(LEGACY_KEY);
    if (v1 && typeof v1 === 'object') {
      s = { g: {}, pax: [Object.assign({}, DEFAULT_PAX, {
            name: v1.passenger || DEFAULT_PAX.name,
            seat: v1.seat || DEFAULT_PAX.seat,
            gate: v1.gate || DEFAULT_PAX.gate,
            cls:  v1['class'] || DEFAULT_PAX.cls,
            boarding: v1.boarding || DEFAULT_PAX.boarding,
            group: v1.group || DEFAULT_PAX.group,
            etkt: v1.etkt || DEFAULT_PAX.etkt,
            seq:  v1.seq || DEFAULT_PAX.seq
          })], active: 0 };
      GLOBAL_FIELDS.forEach(function (id) {
        if (v1[id] !== undefined) s.g[id] = v1[id];
      });
      /* the old app shipped an earlier date default */
      if (s.g.date === '2026-10-13') s.g.date = DEFAULTS.date;
    }
  }
  if (!s) return;

  GLOBAL_FIELDS.forEach(function (id) {
    if (s.g && s.g[id] !== undefined && $(id)) $(id).value = s.g[id];
  });
  if (Array.isArray(s.pax) && s.pax.length) {
    PAX = s.pax.map(function (p) { return Object.assign({}, DEFAULT_PAX, p); });
  }
  ACTIVE = Math.max(0, Math.min(s.active || 0, PAX.length - 1));

  /* uploaded photos live in memory only — never restore a stale "custom" */
  if (!$('bg').querySelector('option[value="custom"]')) $('bg').value = DEFAULTS.bg;
}

function resetAll() {
  try {
    localStorage.removeItem(STATE_KEY);
    localStorage.removeItem(LEGACY_KEY);
  } catch (e) {}
  GLOBAL_FIELDS.forEach(function (id) { if ($(id)) $(id).value = DEFAULTS[id]; });
  PAX = [Object.assign({}, DEFAULT_PAX)];
  ACTIVE = 0;
  document.body.style.removeProperty('--custom-bg');
  var opt = $('bg').querySelector('option[value="custom"]');
  if (opt) opt.remove();
  $('bgPhoto').value = '';
  applyLogoColor(); applyFont(); applyLogoSize(); applyBg();
  writePaxForm(); renderPaxChips(); render(); checkEtkt(); checkPnr();
  $('flightResults').innerHTML = '<div class="fr-empty">Set From / To, then search.</div>';
  setBadge('demo', 'Demo data');
  saveState();
}

/* ------------------------------------------------------ passengers in UI */
function pax() { return PAX[ACTIVE]; }

function writePaxForm() {
  var p = pax();
  PAX_FIELDS.forEach(function (domId) {
    var el = $(domId);
    if (!el) return;
    var v = p[PAX_MAP[domId]];
    if (v !== undefined && v !== null) el.value = v;
  });
}

function readPaxField(domId) {
  var el = $(domId);
  return el ? el.value : '';
}

function renderPaxChips() {
  var box = $('paxChips');
  box.innerHTML = '';
  PAX.forEach(function (p, i) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'pax-chip' + (i === ACTIVE ? ' active' : '');
    b.textContent = (i + 1) + ' · ' + (p.name || 'Passenger ' + (i + 1));
    b.title = p.name || '';
    b.addEventListener('click', function () {
      ACTIVE = i;
      writePaxForm();
      renderPaxChips();
      renderPaxTitle();
      render();
      saveState();
    });
    box.appendChild(b);
  });
  $('paxCount').textContent = PAX.length + (PAX.length === 1 ? ' passenger' : ' passengers');
  $('downloadAllBtn').textContent = PAX.length > 1 ? 'Download all (' + PAX.length + ')' : 'Download all';
  renderPaxTitle();
}

function renderPaxTitle() {
  $('paxTitle').textContent = '· ' + (pax().name || 'Passenger ' + (ACTIVE + 1)) +
    '  (' + (ACTIVE + 1) + '/' + PAX.length + ')';
}

$('paxAdd').addEventListener('click', function () {
  PAX.push(Object.assign({}, DEFAULT_PAX, {
    name: '', seat: '', etkt: genEtkt(),
    seq: String(PAX.length + 1).padStart(2, '0')
  }));
  ACTIVE = PAX.length - 1;
  writePaxForm(); renderPaxChips(); render(); saveState();
  $('passenger').focus();
});
$('paxDup').addEventListener('click', function () {
  PAX.splice(ACTIVE + 1, 0, JSON.parse(JSON.stringify(pax())));
  ACTIVE = ACTIVE + 1;
  writePaxForm(); renderPaxChips(); render(); saveState();
});
$('paxRemove').addEventListener('click', function () {
  if (PAX.length <= 1) { flash('Only one passenger — nothing to remove.'); return; }
  PAX.splice(ACTIVE, 1);
  ACTIVE = Math.max(0, ACTIVE - 1);
  writePaxForm(); renderPaxChips(); render(); saveState();
});

/* ------------------------------------------------------------ rendering */
function fmtDate(v) {
  if (!v) return '—';
  var d = new Date(v + 'T00:00:00');
  if (isNaN(d.getTime())) return '—';
  var M = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][d.getMonth()];
  return String(d.getDate()).padStart(2, '0') + M + String(d.getFullYear()).slice(2);
}

function money(n, cur) {
  if (n == null) return '';
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency', currency: (cur || 'USD').toUpperCase(), maximumFractionDigits: 0
    }).format(n);
  } catch (e) { return '$' + n; }
}

function render() {
  var g = function (id) { var el = $(id); return el ? el.value : ''; };
  var p = pax();

  var airline = g('airline') || 'Airline';
  var flight  = g('flight').toUpperCase();
  var date    = fmtDate(g('date'));
  var from    = (g('fromCode') || '---').toUpperCase();
  var to      = (g('toCode') || '---').toUpperCase();
  var name    = (p.name || 'PASSENGER').toUpperCase();
  var cls     = p.cls || 'Economy';
  var pnr     = (g('pnrcode') || 'XXXXXX').toUpperCase();
  var round   = g('tripType') === 'round';

  $('tBrand').textContent    = airline;
  $('tCarrier').textContent  = airline;
  $('sCarrier').textContent  = airline.split(' ')[0];
  $('tabSeq').textContent    = p.seq || '—';
  $('tName').textContent     = name;
  $('sName').textContent     = name;
  $('tFromCity').textContent = g('fromCity');
  $('tToCity').textContent   = g('toCity');
  $('tFromTerm').textContent = g('fromTerm') || '—';
  $('tToTerm').textContent   = g('toTerm') || '—';
  $('sFrom').textContent     = from;
  $('sTo').textContent       = to;
  $('sFromTerm').textContent = g('fromTerm') || '—';
  $('sToTerm').textContent   = g('toTerm') || '—';

  /* route + times row */
  var depT = g('dep'), arrT = g('arr');
  $('rFromCode').textContent  = from;
  $('rToCode').textContent    = to;
  $('rFromCity2').textContent = g('fromCity') || '—';
  $('rToCity2').textContent   = g('toCity') || '—';
  $('rDep').textContent       = depT || '--:--';
  $('rArr').textContent       = arrT || '--:--';
  $('rDur').textContent       = g('dur') || '—';
  /* arrival not after departure means it lands the next day */
  $('rNext').style.display    = (depT && arrT && arrT <= depT) ? '' : 'none';

  $('gFlight').textContent   = flight;
  $('sFlightN').textContent  = flight;
  $('tDate').textContent     = date;
  $('sDate').textContent     = date;
  $('gSeat').textContent     = p.seat || '—';
  $('sSeat').textContent     = p.seat || '—';
  $('gGate').textContent     = p.gate || '—';
  $('gBoard').textContent    = p.boarding || '--:--';
  $('gGroup').textContent    = p.group || '—';
  $('gClass').textContent    = cls;
  $('gClass2').textContent   = cls;
  $('sClass').textContent    = cls;
  $('gSeq').textContent      = p.seq || '—';
  $('gEtkt').textContent     = p.etkt || '—';
  $('tSite').textContent     = g('site');
  $('tNotice').textContent   = round
    ? 'Round trip · return ' + fmtDate(g('retDate'))
    : 'Boarding closes 20 minutes before departure';

  /* fare is optional */
  $('fareFld').hidden = !g('fare');
  $('gFare').textContent = g('fare') || '—';

  /* return leg strip */
  $('retStrip').hidden = !round;
  if (round) {
    $('rsFrom').textContent = to;
    $('rsTo').textContent   = from;
    $('rsFlight').textContent = (g('retFlight') || '—').toUpperCase();
    $('rsDate').textContent = fmtDate(g('retDate'));
    $('rsTimes').textContent =
      (g('retDep') || '--:--') + ' → ' + (g('retArr') || '--:--') +
      (g('retDur') ? ' (' + g('retDur') + ')' : '');
  }
  $('retBlock').hidden = !round;

  drawBarcode($('barcode'), pnr + flight.replace(/\s/g, '') + (p.seq || ''));
  drawBarcode($('barcodeStub'), pnr + (p.seat || '') + (p.gate || ''));
  drawQR(qrPayload());

  checkRoute();
}

/* QR carries the human-critical booking details so a phone scan "works". */
function qrPayload() {
  var g = function (id) { var el = $(id); return el ? el.value : ''; };
  var p = pax();
  var rows = [
    'FLIGHT ' + (g('airline') || '-'),
    (g('passenger') ? '' : '') + (p.name || '-'),
    (g('fromCode') || '-') + ' > ' + (g('toCode') || '-') +
      '  ' + fmtDate(g('date')) + '  ' + (g('dep') || '--:--'),
    'SEAT ' + (p.seat || '-') + '  GATE ' + (p.gate || '-') +
      '  ' + (p.cls || '-').toUpperCase(),
    'REF ' + (g('pnrcode') || '-') + '  ETKT ' + (p.etkt || '-')
  ];
  if (g('tripType') === 'round') {
    rows.push('RET ' + (g('toCode') || '-') + ' > ' + (g('fromCode') || '-') +
      '  ' + fmtDate(g('retDate')) + '  ' + (g('retFlight') || '-'));
  }
  return rows.join('\n');
}

/* deterministic pseudo-random from string seed */
function seeded(str) {
  return window.FlightAPI.seeded(str);
}

function drawBarcode(el, seed) {
  if (!el) return;
  var rnd = seeded(seed);
  el.innerHTML = '';
  for (var i = 0; i < 58; i++) {
    var b = document.createElement('i');
    b.style.width = (rnd() > 0.6 ? 3 : 1.5) + 'px';
    el.appendChild(b);
  }
}

/* ------------------------------------------------------------------- QR */
var QR_CDN = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';

function loadQrLib() {
  if (typeof window.qrcode === 'function') return Promise.resolve(true);
  return new Promise(function (resolve) {
    var s = document.createElement('script');
    s.src = QR_CDN;
    s.onload = function () { resolve(typeof window.qrcode === 'function'); };
    s.onerror = function () { resolve(false); };
    document.head.appendChild(s);
  });
}

function drawQR(text) {
  var canvas = $('qrCanvas');
  if (!canvas) return;
  var ctx = canvas.getContext && canvas.getContext('2d');
  if (!ctx) return;

  if (typeof window.qrcode !== 'function') {
    /* the lib is still loading (or blocked) — show a placeholder, redraw shortly */
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#6b7a92'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('QR', canvas.width / 2, canvas.height / 2 + 3);
    loadQrLib().then(function (ok) {
      if (ok) drawQR(text);
      else canvas.title = 'QR library could not be loaded — the barcode still works.';
    });
    return;
  }

  try {
    var qr = window.qrcode(0, 'M');   /* 0 = pick the smallest version */
    qr.addData(text);
    qr.make();

    var count  = qr.getModuleCount();
    var quiet  = 4;                    /* QR spec quiet zone */
    var total  = count + quiet * 2;
    var target = 152;                  /* 2× the CSS size, so it stays crisp */
    var scale  = Math.max(1, Math.floor(target / total));
    var px     = total * scale;

    canvas.width = px;
    canvas.height = px;
    canvas.style.width = '76px';
    canvas.style.height = '76px';

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, px, px);
    ctx.fillStyle = '#12213a';
    for (var r = 0; r < count; r++) {
      for (var c = 0; c < count; c++) {
        if (qr.isDark(r, c)) {
          ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
        }
      }
    }
  } catch (e) {
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

/* ------------------------------------------------------ logo colour/size */
function shade(hex, amt) {
  var n = parseInt(hex.slice(1), 16);
  var clamp = function (v) { return Math.max(0, Math.min(255, Math.round(v))); };
  var r = clamp((n >> 16) + amt);
  var g = clamp(((n >> 8) & 0xff) + amt);
  var b = clamp((n & 0xff) + amt);
  return '#' + [r, g, b].map(function (v) { return v.toString(16).padStart(2, '0'); }).join('');
}

function validHex(v) { return /^#[0-9a-f]{6}$/i.test(v); }

function applyLogoColor() {
  var c = $('logoColorHex').value.trim();
  if (!validHex(c)) c = $('logoColor').value;
  var t = $('logoTextColorHex').value.trim();
  if (!validHex(t)) t = $('logoTextColor').value;

  document.documentElement.style.setProperty('--accent', c);
  document.querySelector('.seq-tab').style.background = c;
  document.querySelector('.seq-tab').style.color = t;
}

$('logoColor').addEventListener('input', function () { $('logoColorHex').value = $('logoColor').value; applyLogoColor(); });
$('logoTextColor').addEventListener('input', function () { $('logoTextColorHex').value = $('logoTextColor').value; applyLogoColor(); });
$('logoColorHex').addEventListener('input', function (e) {
  if (validHex(e.target.value)) { $('logoColor').value = e.target.value; applyLogoColor(); }
});
$('logoTextColorHex').addEventListener('input', function (e) {
  if (validHex(e.target.value)) { $('logoTextColor').value = e.target.value; applyLogoColor(); }
});

function applyFont() { $('ticket').style.fontFamily = $('font').value; }
$('font').addEventListener('change', applyFont);

function applyLogoSize() {
  var px = $('logoSize').value;
  $('logoSizeVal').textContent = px;
  $('tBrand').style.fontSize = px + 'px';
}
$('logoSize').addEventListener('input', applyLogoSize);

/* ------------------------------------------------- ticket photo backdrop */
function applyBg() {
  var stage = $('stage');
  stage.className = 'stage-none';
  var v = $('bg').value;
  if (v === 'table') stage.className = 'stage-table';
  else if (v === 'bed') stage.className = 'stage-bed';
  else if (v === 'custom' && document.body.style.getPropertyValue('--custom-bg')) {
    stage.className = 'stage-custom';
  }
}
$('bg').addEventListener('change', applyBg);

/* Uploaded photos live in memory only — they are never persisted. */
$('bgPhoto').addEventListener('change', function (e) {
  var f = e.target.files && e.target.files[0];
  if (!f) return;
  var r = new FileReader();
  r.onload = function () {
    document.body.style.setProperty('--custom-bg', 'url("' + r.result + '")');
    $('bg').value = 'custom';
    if (!$('bg').querySelector('option[value="custom"]')) {
      var o = document.createElement('option');
      o.value = 'custom';
      o.textContent = 'My photo';
      $('bg').appendChild(o);
    }
    applyBg();
    saveState();
  };
  r.readAsDataURL(f);
});

/* --------------------------------------------------------- field wiring */
GLOBAL_FIELDS.forEach(function (id) {
  var el = $(id);
  if (!el) return;
  var handler = function () {
    if (id === 'tripType') { render(); }
    render(); saveState();
  };
  el.addEventListener('input', handler);
  el.addEventListener('change', handler);
});

PAX_FIELDS.forEach(function (domId) {
  var el = $(domId);
  if (!el) return;
  var handler = function () {
    pax()[PAX_MAP[domId]] = el.value;
    render();
    if (domId === 'passenger') renderPaxChips();
    saveState();
  };
  el.addEventListener('input', handler);
  el.addEventListener('change', handler);
});

$('resetBtn').addEventListener('click', resetAll);

/* -------------------------------------------------------- input validation */
var ETKT_RE = /^\d{3}-\d{10}$/;
var PNR_RE  = /^[A-Z0-9]{6}$/;

function checkRoute() {
  var from = $('fromCode').value.trim().toUpperCase();
  var to   = $('toCode').value.trim().toUpperCase();
  $('routeWarn').hidden = !(from && to && from === to);
}
function markBad(el, hint, bad) {
  el.classList.toggle('bad', bad);
  hint.classList.toggle('bad', bad);
}
function checkEtkt() { markBad($('etkt'), $('etktHint'), !ETKT_RE.test($('etkt').value.trim())); }
function checkPnr() {
  markBad($('pnrcode'), $('pnrHint'), !PNR_RE.test($('pnrcode').value.trim().toUpperCase()));
}

/* airport codes: tidy up when leaving the field */
['fromCode', 'toCode'].forEach(function (id) {
  $(id).addEventListener('blur', function () {
    $(id).value = $(id).value.trim().toUpperCase();
    render(); saveState(); checkRoute();
  });
});

/* ETKT: auto-insert the hyphen on blur, flag the format */
function genEtkt() {
  var head = ['000', '001', '006', '055', '125'][Math.floor(Math.random() * 5)];
  var tail = Array.from({ length: 10 }, function () { return Math.floor(Math.random() * 10); }).join('');
  return head + '-' + tail;
}

$('etkt').addEventListener('input', function () {
  if (ETKT_RE.test($('etkt').value.trim())) markBad($('etkt'), $('etktHint'), false);
});
$('etkt').addEventListener('blur', function () {
  var digits = $('etkt').value.replace(/\D/g, '').slice(0, 13);
  if (digits.length > 3) $('etkt').value = digits.slice(0, 3) + '-' + digits.slice(3);
  pax().etkt = $('etkt').value;
  checkEtkt(); render(); saveState();
});

/* booking ref: letters and digits only, uppercased, capped at 6 */
$('pnrcode').addEventListener('input', function () {
  if (PNR_RE.test($('pnrcode').value.trim().toUpperCase())) markBad($('pnrcode'), $('pnrHint'), false);
});
$('pnrcode').addEventListener('blur', function () {
  $('pnrcode').value = $('pnrcode').value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6);
  checkPnr(); render(); saveState();
});

/* ------------------------------------------------------------ small utils */
function flash(msg) {
  var n = document.createElement('div');
  n.textContent = msg;
  n.style.cssText = 'position:fixed;left:50%;bottom:26px;transform:translateX(-50%);' +
    'background:#12213a;color:#fff;padding:10px 16px;border-radius:8px;font-size:13px;' +
    'z-index:99;box-shadow:0 8px 24px rgba(0,0,0,.25)';
  document.body.appendChild(n);
  setTimeout(function () { n.remove(); }, 2600);
}

function setBadge(kind, text) {
  var b = $('srcBadge');
  b.className = 'src-badge ' + kind;
  b.textContent = text;
}

/* --------------------------------------------------------------- randomize */
var AIRLINES = ['Skyline Airways','Northwind Air','Aurora Jet','Cresta Air','Blue Meridian'];
var CITIES = [['LHR','London'],['JFK','New York'],['NRT','Tokyo'],['CDG','Paris'],
              ['SIN','Singapore'],['DXB','Dubai'],['BER','Berlin'],['YYZ','Toronto'],['SYD','Sydney']];
var CLASSES = ['Economy','Premium Economy','Business','First'];
var PEOPLE = ['OLIVIA JOHN','JAMES SMITH','AMARA PATEL','LUCAS MÜLLER','SOFIA ROSSI',
              'NOAH WILLIAMS','ISABEL GARCA','KENJI TANAKA','EMMA DUBOIS','ARJUN NAIR'];

function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

$('randomBtn').addEventListener('click', function () {
  var a = pick(CITIES), b = pick(CITIES.filter(function (c) { return c[0] !== a[0]; }));
  var depH = Math.floor(Math.random() * 20) + 1;
  var depM = pick(['00','15','30','45']);
  var durMin = 60 + Math.floor(Math.random() * 480);
  var arrTotal = depH * 60 + (+depM) + durMin;
  var boardTotal = Math.max(depH * 60 + (+depM) - 20, 0);

  $('airline').value = pick(AIRLINES);
  $('flight').value  = String.fromCharCode(65 + Math.floor(Math.random()*26)) +
                       String.fromCharCode(65 + Math.floor(Math.random()*26)) + ' ' +
                       (Math.floor(Math.random()*900) + 100);
  $('fromCode').value = a[0]; $('fromCity').value = a[1];
  $('toCode').value   = b[0]; $('toCity').value   = b[1];
  $('dep').value = String(depH).padStart(2,'0') + ':' + depM;
  $('arr').value = String(Math.floor(arrTotal / 60) % 24).padStart(2,'0') + ':' + String(arrTotal % 60).padStart(2,'0');
  $('dur').value = Math.floor(durMin / 60) + 'h ' + String(durMin % 60).padStart(2,'0') + 'm';
  $('fromTerm').value = String(Math.floor(Math.random()*4) + 1);
  $('toTerm').value = pick(['A','B','C','D','1','2','3']);
  $('fare').value = '$' + (49 + Math.floor(Math.random() * 40) * 10);

  if ($('tripType').value === 'round') {
    var retH = Math.floor(Math.random() * 18) + 1;
    $('retFlight').value = $('flight').value.replace(/\d+$/, function (n) { return String(+n + 1); });
    $('retDep').value = String(retH).padStart(2,'0') + ':' + pick(['00','15','30','45']);
    $('retArr').value = String((retH + Math.floor(durMin / 60)) % 24).padStart(2,'0') + ':' + depM;
    $('retDur').value = $('dur').value;
  }

  /* passengers: keep the count, refresh the details */
  PAX.forEach(function (p, i) {
    p.name = pick(PEOPLE);
    p.seat = (Math.floor(Math.random()*30)+1) + pick(['A','B','C','D','E','F']);
    p.gate = pick(['A','B','C','D']) + (Math.floor(Math.random()*30)+1);
    p.cls  = pick(CLASSES);
    p.boarding = String(Math.floor(boardTotal / 60)).padStart(2,'0') + ':' + String(boardTotal % 60).padStart(2,'0');
    p.group = String(Math.floor(Math.random()*6) + 1);
    p.etkt = genEtkt();
    p.seq  = String(i + 1 + Math.floor(Math.random()*90)).padStart(2,'0');
  });
  $('pnrcode').value = Array.from({length:6}, function () {
      return 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random()*32)];
  }).join('');

  writePaxForm(); renderPaxChips(); render(); checkEtkt(); checkPnr(); saveState();
});

/* ============================== FLIGHT SEARCH ========================== */
var lastRows = [];

function searchHint() {
  var info = window.FlightAPI.providerInfo();
  var wait = window.FlightAPI.throttleRemaining();
  if (info.id === 'demo') {
    return 'Demo data — fictional flights, generated locally. No key needed.';
  }
  if (!window.FlightAPI.hasKey()) {
    return info.label + ' selected, but no key is set. Open “Flight data settings”.';
  }
  if (wait > 0) {
    return 'Free tier allows 1 request per minute — next live call in ' +
           Math.ceil(wait / 1000) + 's. Cached results still work.';
  }
  return info.label + ' — real scheduled flights.';
}

function renderRows(rows, source) {
  var box = $('flightResults');
  lastRows = rows;

  if (!rows.length) {
    var none = document.createElement('div');
    none.className = 'fr-empty';
    none.textContent = 'No flights matched. Try another route or date.';
    box.appendChild(none);
    return;
  }

  rows.forEach(function (f) {
    var item = document.createElement('div');
    item.className = 'fr-item';
    var tag = source === 'demo'
      ? '<span class="fr-tag demo">DEMO</span>'
      : '<span class="fr-tag live">LIVE</span>';

    var priceHtml = f.price != null
      ? '<div class="fr-price">' + money(f.price, f.currency) + '</div>'
      : '<div class="fr-price">&mdash;</div>';
    var seatsHtml = f.seats
      ? '<div class="fr-seats">' + f.seats + ' seat' + (f.seats > 1 ? 's' : '') + ' left</div>'
      : (f.status ? '<div class="fr-seats">' + String(f.status).toUpperCase() + '</div>' : '');

    item.innerHTML =
      '<div>' +
        '<div class="fr-time">' + f.depStr + ' &rarr; ' + f.arrStr +
          (f.arrNextDay ? '<sup class="rt-next">+1</sup>' : '') + ' ' + tag + '</div>' +
        '<div class="fr-meta">' + (f.flightNo || '—') + ' &middot; ' +
          f.durH + 'h ' + f.durM + 'm &middot; ' +
          (f.stops ? f.stops + ' stop' : 'non-stop') + '</div>' +
      '</div>' +
      '<div style="text-align:right">' + priceHtml + seatsHtml + '</div>';

    item.addEventListener('click', function () { applyFlight(f); });
    box.appendChild(item);
  });
}

function renderResults(rows, source) {
  $('flightResults').innerHTML = '';
  renderRows(rows, source);
}

/* Prepend a failure notice, then whatever fallback list we still have. */
function renderWithNotice(noticeHtml, rows, source) {
  var box = $('flightResults');
  box.innerHTML = '';
  var msg = document.createElement('div');
  msg.className = 'fr-empty';
  msg.innerHTML = noticeHtml;
  box.appendChild(msg);
  if (rows && rows.length) renderRows(rows, source);
}

function renderError(err) {
  renderWithNotice(
    '<strong>That did not work.</strong><br>' +
    escapeHtml(err.message || 'Unknown error.') +
    (err.hint ? '<br><span style="color:#a11">' + escapeHtml(err.hint) + '</span>' : ''),
    [], null
  );
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
  });
}

function searchParams() {
  var rt = $('tripType').value === 'round';
  return {
    from: $('fromCode').value.trim().toUpperCase(),
    to: $('toCode').value.trim().toUpperCase(),
    date: $('date').value,
    flightNo: $('flight').value,
    tripType: rt ? 'round' : 'oneway',
    returnDate: rt ? $('retDate').value : ''
  };
}

function runDemoSearch() {
  window.FlightAPI.demoSearch(searchParams()).then(
    function (rows) { renderResults(rows, 'demo'); setBadge('demo', 'Demo data'); },
    function (err) { renderError(err); }
  );
}

function runSearch() {
  var box = $('flightResults');
  var btn = $('searchBtn');
  var old = btn.textContent;
  btn.textContent = 'Searching…';
  btn.disabled = true;
  box.innerHTML = '<div class="fr-empty">Contacting ' +
    escapeHtml(window.FlightAPI.providerInfo().label) + '…</div>';

  window.FlightAPI.search(searchParams()).then(
    function (rows) {
      renderResults(rows, window.FlightAPI.get('provider'));
      setBadge('live', 'Live · ' + shortProvider());
    },
    function (err) {
      /* fall back to the demo list so the app is never a dead end */
      var notice =
        '<strong>Live search failed — showing demo flights instead.</strong><br>' +
        escapeHtml(err.message || 'Unknown error.') +
        (err.hint ? '<br><span style="color:#a11">' + escapeHtml(err.hint) + '</span>' : '');

      window.FlightAPI.demoSearch(searchParams()).then(
        function (demoRows) { renderWithNotice(notice, demoRows, 'demo'); },
        function () { renderWithNotice(notice, [], null); }
      );
      setBadge('err', 'Live failed · demo shown');
    }
  ).then(function () {
    btn.textContent = old;
    btn.disabled = false;
    $('searchHint').textContent = searchHint();
  });
}

function shortProvider() {
  var p = window.FlightAPI.get('provider');
  return p === 'aviationstack' ? 'Aviationstack' : 'Tequila';
}

$('searchBtn').addEventListener('click', runSearch);
$('searchDemoBtn').addEventListener('click', runDemoSearch);

/* Load a chosen flight into the form. */
function applyFlight(f) {
  $('airline').value = f.carrier || $('airline').value;
  if (f.flightNo) $('flight').value = f.flightNo;
  $('dep').value = f.depStr;
  $('arr').value = f.arrStr;
  $('dur').value = f.durH + 'h ' + String(f.durM).padStart(2, '0') + 'm';

  if (f.fromCode) $('fromCode').value = f.fromCode;
  if (f.toCode)   $('toCode').value   = f.toCode;
  if (f.fromCity) $('fromCity').value = f.fromCity;
  if (f.toCity)   $('toCity').value   = f.toCity;
  if (f.fromTerm) $('fromTerm').value = f.fromTerm;
  if (f.toTerm)   $('toTerm').value   = f.toTerm;
  if (f.depDate && /^\d{4}-\d{2}-\d{2}$/.test(f.depDate)) $('date').value = f.depDate;
  if (f.price != null) $('fare').value = money(f.price, f.currency);

  /* boarding = 20 minutes before departure (with minute borrow) */
  var depTotal = f.depH != null
    ? f.depH * 60 + (+f.depM)
    : (parseInt(f.depStr.split(':')[0], 10) * 60 + parseInt(f.depStr.split(':')[1], 10));
  var boardTotal = Math.max(depTotal - 20, 0);
  pax().boarding = String(Math.floor(boardTotal / 60)).padStart(2,'0') + ':' +
                   String(boardTotal % 60).padStart(2,'0');
  if (f.gate) pax().gate = f.gate;

  writePaxForm(); render(); checkEtkt(); checkPnr(); saveState();
  flash('Loaded ' + (f.flightNo || 'flight') + ' onto the ticket.');
}

/* ============================ EXPORT ================================== */
var CDN_URL = 'https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.js';

function loadHtmlToImage() {
  if (window.htmlToImage) return Promise.resolve(true);
  return new Promise(function (resolve) {
    var s = document.createElement('script');
    s.src = CDN_URL;
    s.onload = function () { resolve(!!window.htmlToImage); };
    s.onerror = function () { resolve(false); };
    document.head.appendChild(s);
  });
}

function exportNode() {
  return $('stage').className === 'stage-none' ? $('ticket') : $('stage');
}

function safeName(s) {
  return String(s || 'ticket').trim().replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'ticket';
}

function exportPng(filename) {
  return loadHtmlToImage().then(function (ok) {
    if (!ok) throw new Error('lib-not-loaded');
    var node = exportNode();
    return window.htmlToImage.toPng(node, {
      pixelRatio: 2,
      backgroundColor: node === $('ticket') ? '#ffffff' : undefined,
      cacheBust: true
    }).then(function (url) {
      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      return url;
    });
  });
}

function currentFilename() {
  return 'itinerary-' + safeName($('fromCode').value) + '-' + safeName($('toCode').value) +
         '-' + safeName(pax().name) + '.png';
}

$('downloadBtn').addEventListener('click', function () {
  var btn = $('downloadBtn');
  var old = btn.textContent;
  btn.textContent = 'Rendering…';
  btn.disabled = true;
  exportPng(currentFilename()).then(
    function () { pushHistory(); },
    function (e) {
      alert('PNG export failed (' + e.message + ').\nTip: right-click the ticket → Save image, or use “Save as PDF” → Print → Save as PDF.');
    }
  ).then(function () {
    btn.textContent = old;
    btn.disabled = false;
  });
});

/* Export every passenger as its own PNG. */
$('downloadAllBtn').addEventListener('click', function () {
  var btn = $('downloadAllBtn');
  var old = btn.textContent;
  var keepActive = ACTIVE;
  var i = 0;

  btn.disabled = true;

  function next() {
    if (i >= PAX.length) {
      ACTIVE = keepActive;
      writePaxForm(); renderPaxChips(); render();
      btn.textContent = old;
      btn.disabled = false;
      pushHistory();
      return;
    }
    ACTIVE = i;
    writePaxForm(); renderPaxChips(); render();
    btn.textContent = 'Rendering ' + (i + 1) + '/' + PAX.length + '…';

    /* let the DOM paint before we snapshot it */
    setTimeout(function () {
      exportPng(currentFilename())
        .catch(function (e) {
          alert('PNG export failed for passenger ' + (i + 1) + ' (' + e.message + ').');
        })
        .then(function () { i++; setTimeout(next, 250); });
    }, 60);
  }
  next();
});

/* PDF uses the browser's print pipeline — no extra library, vector output. */
$('pdfBtn').addEventListener('click', function () { pushHistory(); window.print(); });

/* ===================== TEMPLATES + HISTORY ============================ */
function renderLibrary() {
  var tpls = readStore(TPL_KEY) || [];
  var hist = readStore(HIST_KEY) || [];

  var tplBox = $('tplList');
  tplBox.innerHTML = '';
  if (!tpls.length) {
    tplBox.innerHTML = '<div class="lib-empty">No templates yet.</div>';
  } else {
    tpls.forEach(function (t) {
      tplBox.appendChild(libItem({
        title: t.name,
        sub: (t.snap.g.fromCode || '?') + ' → ' + (t.snap.g.toCode || '?') + ' · ' +
             (t.snap.g.airline || '') + ' · ' + t.snap.pax.length + ' pax',
        actions: [
          { label: 'Load', cls: 'primary', fn: function () {
              applySnapshot(t.snap); flash('Template “' + t.name + '” loaded.'); } },
          { label: '✕', cls: 'ghost', title: 'Delete', fn: function () {
              writeStore(TPL_KEY, (readStore(TPL_KEY) || []).filter(function (x) { return x.id !== t.id; }));
              renderLibrary(); } }
        ]
      }));
    });
  }

  var histBox = $('histList');
  histBox.innerHTML = '';
  if (!hist.length) {
    histBox.innerHTML = '<div class="lib-empty">Nothing generated yet.</div>';
  } else {
    hist.forEach(function (h) {
      histBox.appendChild(libItem({
        title: h.label,
        sub: new Date(h.at).toLocaleString() + ' · ' + h.snap.pax.length + ' pax',
        actions: [
          { label: 'Restore', cls: 'ghost', fn: function () {
              applySnapshot(h.snap); flash('Ticket restored.'); } }
        ]
      }));
    });
  }
}

function libItem(o) {
  var row = document.createElement('div');
  row.className = 'lib-item';
  var main = document.createElement('div');
  main.className = 'li-main';
  var t = document.createElement('div');
  t.className = 'li-title';
  t.textContent = o.title;
  var s = document.createElement('div');
  s.className = 'li-sub';
  s.textContent = o.sub;
  main.appendChild(t); main.appendChild(s);

  var acts = document.createElement('div');
  acts.className = 'li-actions';
  o.actions.forEach(function (a) {
    var b = document.createElement('button');
    b.className = a.cls + ' tiny';
    b.textContent = a.label;
    if (a.title) b.title = a.title;
    b.addEventListener('click', a.fn);
    acts.appendChild(b);
  });

  row.appendChild(main);
  row.appendChild(acts);
  return row;
}

function applySnapshot(snap) {
  if (!snap || !snap.g) return;
  GLOBAL_FIELDS.forEach(function (id) {
    if (snap.g[id] !== undefined && $(id)) $(id).value = snap.g[id];
  });
  PAX = (snap.pax && snap.pax.length)
    ? snap.pax.map(function (p) { return Object.assign({}, DEFAULT_PAX, p); })
    : [Object.assign({}, DEFAULT_PAX)];
  ACTIVE = Math.min(snap.active || 0, PAX.length - 1);

  if (!$('bg').querySelector('option[value="custom"]')) $('bg').value = DEFAULTS.bg;
  applyLogoColor(); applyFont(); applyLogoSize(); applyBg();
  writePaxForm(); renderPaxChips(); render(); checkEtkt(); checkPnr(); saveState();
}

$('tplSave').addEventListener('click', function () {
  var name = $('tplName').value.trim() ||
             ($('fromCode').value + '–' + $('toCode').value + ' · ' + $('airline').value);
  var tpls = readStore(TPL_KEY) || [];
  tpls.unshift({
    id: 't' + Date.now(),
    name: name,
    at: Date.now(),
    snap: snapshot()
  });
  writeStore(TPL_KEY, tpls.slice(0, 20));
  $('tplName').value = '';
  renderLibrary();
  flash('Template saved.');
});

function pushHistory() {
  var g = snapshot().g;
  var label = (g.fromCode || '?') + ' → ' + (g.toCode || '?') + ' · ' +
              (g.flight || '') + ' · ' + (pax().name || 'passenger');
  var hist = readStore(HIST_KEY) || [];
  hist.unshift({ id: 'h' + Date.now(), at: Date.now(), label: label, snap: snapshot() });
  writeStore(HIST_KEY, hist.slice(0, HIST_MAX));
  renderLibrary();
}

$('histClear').addEventListener('click', function () {
  writeStore(HIST_KEY, []);
  renderLibrary();
});

/* ============================== SETTINGS ============================== */
/* Shown while a live source is selected but no key has been pasted yet. */
var onboardDismissed = false;

function syncOnboard() {
  var info = window.FlightAPI.providerInfo();
  var show = !!info.needsKey && !window.FlightAPI.hasKey() && !onboardDismissed;
  $('onboardBox').hidden = !show;
  if (show && info.signup) $('obGetKey').href = info.signup;
}

$('obPaste').addEventListener('click', function () {
  $('settingsPanel').hidden = false;
  syncSettingsUi();
  $('apiKey').focus();
  $('settingsPanel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

$('obDismiss').addEventListener('click', function () {
  onboardDismissed = true;
  window.FlightAPI.set('provider', 'demo');
  syncSettingsUi();
});

function syncSettingsUi() {
  $('apiProvider').value = window.FlightAPI.get('provider');
  $('apiKey').value = window.FlightAPI.get('key') || '';
  $('apiEndpoint').value = window.FlightAPI.get('endpoint') || '';
  $('apiCurrency').value = window.FlightAPI.get('currency') || 'USD';

  var info = window.FlightAPI.providerInfo();
  $('apiKeyBlock').hidden = !info.needsKey;
  $('endpointBlock').hidden = window.FlightAPI.get('provider') !== 'tequila';
  if (info.signup) {
    $('apiSignup').parentNode.innerHTML = 'API key — <a id="apiSignup" href="' +
      info.signup + '" target="_blank" rel="noopener">get one</a>';
  }
  $('apiNote').textContent = info.note;

  if (window.FlightAPI.get('provider') === 'demo') setBadge('demo', 'Demo data');
  else if (window.FlightAPI.hasKey()) setBadge('live', 'Live · ' + shortProvider());
  else setBadge('err', 'Live · key missing');

  $('searchHint').textContent = searchHint();
  syncOnboard();
}

$('settingsBtn').addEventListener('click', function () {
  var p = $('settingsPanel');
  p.hidden = !p.hidden;
  if (!p.hidden) { syncSettingsUi(); p.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
});

$('apiProvider').addEventListener('change', function () {
  window.FlightAPI.set('provider', $('apiProvider').value);
  syncSettingsUi();
});
$('apiKey').addEventListener('input', function () {
  window.FlightAPI.set('key', $('apiKey').value.trim());
  $('searchHint').textContent = searchHint();
  syncOnboard();
  if (window.FlightAPI.get('provider') !== 'demo') {
    setBadge(window.FlightAPI.hasKey() ? 'live' : 'err',
             window.FlightAPI.hasKey() ? 'Live · ' + shortProvider() : 'Live · key missing');
  }
});
$('apiEndpoint').addEventListener('input', function () {
  window.FlightAPI.set('endpoint', $('apiEndpoint').value.trim());
});
$('apiCurrency').addEventListener('input', function () {
  var v = $('apiCurrency').value.trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(v)) window.FlightAPI.set('currency', v);
});
$('apiClear').addEventListener('click', function () {
  window.FlightAPI.set('key', '');
  $('apiKey').value = '';
  syncSettingsUi();
  $('apiStatus').textContent = 'Key cleared.';
  $('apiStatus').className = 'api-status ok';
});
$('apiTest').addEventListener('click', function () {
  var out = $('apiStatus');
  out.className = 'api-status';
  out.textContent = 'Testing…';
  window.FlightAPI.test().then(
    function (r) { out.className = 'api-status ok'; out.textContent = r.message; },
    function (e) {
      out.className = 'api-status bad';
      out.textContent = (e.message || 'Test failed.') + (e.hint ? ' — ' + e.hint : '');
    }
  );
});

/* ================================ BOOT =============================== */
loadState();
syncSettingsUi();
writePaxForm();
renderPaxChips();
render();
applyLogoColor();
applyFont();
applyLogoSize();
applyBg();
checkEtkt();
checkPnr();
renderLibrary();
saveState();

/* the QR lib loads asynchronously in some setups — redraw once it settles */
setTimeout(function () { drawQR(qrPayload()); }, 400);

})();
