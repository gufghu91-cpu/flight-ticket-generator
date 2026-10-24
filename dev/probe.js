/* Phone-width layout probe: reports horizontal overflow and the elements
   responsible, at a few common phone viewport widths.
   Run: node dev/build-smoke.js is NOT needed; serve then open dev/probe.html
   (built by dev/build-probe.js) and read #out. */
setTimeout(function () {
  var out = [];
  var W = window.innerWidth;
  out.push('viewport width: ' + W + 'px');
  out.push('document scrollWidth: ' + document.documentElement.scrollWidth +
           (document.documentElement.scrollWidth > W ? '  <-- HORIZONTAL OVERFLOW' : '  (fits)'));

  /* every element whose right edge sticks out past the viewport */
  var offenders = [];
  document.querySelectorAll('*').forEach(function (el) {
    var r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return;
    if (r.right > W + 1 || r.left < -1) {
      var id = el.id ? '#' + el.id : '';
      var cls = typeof el.className === 'string' && el.className
        ? '.' + el.className.trim().split(/\s+/).join('.') : '';
      offenders.push(el.tagName.toLowerCase() + id + cls +
        '  right=' + Math.round(r.right) + ' left=' + Math.round(r.left));
    }
  });
  out.push('elements past the viewport edge: ' + offenders.length);
  offenders.slice(0, 14).forEach(function (o) { out.push('   ' + o); });

  /* elements clipped by an ancestor with overflow:hidden (content cut off) */
  var ticket = document.getElementById('ticket');
  if (ticket) {
    var tr = ticket.getBoundingClientRect();
    var clipped = [];
    ticket.querySelectorAll('.fld, .v, .rt-city, .brand, .huge, .mid').forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.width && (r.right > tr.right + 1 || r.bottom > tr.bottom + 1)) {
        clipped.push((el.id ? '#' + el.id : el.className) + ' right=' + Math.round(r.right) +
          ' (ticket right=' + Math.round(tr.right) + ')');
      }
    });
    out.push('ticket: ' + Math.round(tr.width) + 'x' + Math.round(tr.height) +
             '  clipped children: ' + clipped.length);
    clipped.slice(0, 8).forEach(function (c) { out.push('   CLIPPED ' + c); });
  }

  /* tap-target audit: interactive things smaller than 40px tall */
  var small = [];
  document.querySelectorAll('button, a.primary, summary, .pax-chip, .fr-item').forEach(function (el) {
    var r = el.getBoundingClientRect();
    if (r.height && r.height < 40) {
      small.push((el.id ? '#' + el.id : el.tagName + '.' + (el.className || '?')) +
        ' h=' + Math.round(r.height));
    }
  });
  out.push('tap targets under 40px tall: ' + small.length);
  small.slice(0, 12).forEach(function (s) { out.push('   ' + s); });

  /* iOS Safari zooms any input under 16px on focus — check them all */
  var smallFont = [];
  document.querySelectorAll('input, select, textarea').forEach(function (el) {
    var fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < 16) smallFont.push((el.id || el.type) + ' ' + fs + 'px');
  });
  out.push('inputs under 16px (iOS focus-zoom): ' + smallFont.length +
           (smallFont.length ? '  e.g. ' + smallFont.slice(0, 4).join(', ') : ''));

  document.getElementById('out').textContent = '\n' + out.join('\n') + '\n';
  document.title = 'PROBE_DONE';
}, 500);
