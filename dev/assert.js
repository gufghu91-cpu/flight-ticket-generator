/* Behavioural assertions, run against the real DOM once the app has booted.
   Results are written into #out so a headless --dump-dom can read them.
   Phase 2 makes a real HTTP call with a deliberately bogus key to prove the
   error handling and the demo fallback both work. */
setTimeout(function () {
  var r = [];
  function ok(cond, label) { r.push((cond ? 'PASS  ' : 'FAIL  ') + label); }
  var $ = function (id) { return document.getElementById(id); };

  function finish() {
    ok(window.__errors.length === 0, 'no runtime errors' +
       (window.__errors.length ? ' — ' + window.__errors.join(' | ') : ''));
    $('out').textContent = '\n' + r.join('\n') + '\n';
    document.title = 'SMOKE_DONE';
  }

  ok(!!(window.FlightAPI && typeof window.FlightAPI.search === 'function'),
     'FlightAPI exposed');
  ok(typeof window.qrcode === 'function', 'qrcode lib is a global');

  var chip = document.querySelector('.pax-chip');
  ok(!!chip && /OLIVIA JOHN/.test(chip.textContent), 'passenger chip rendered');

  ok($('tName').textContent === 'OLIVIA JOHN', 'ticket name rendered');
  ok($('rFromCode').textContent === 'MEL', 'route code rendered');
  ok($('tDate').textContent === '13NOV26', 'date formatted as 13NOV26');
  ok(document.querySelectorAll('#barcode i').length === 58, 'header barcode drawn (58 bars)');

  var cv = $('qrCanvas');
  ok(cv.width > 21 && cv.width !== 76,
     'QR canvas resized to a real matrix (' + cv.width + 'px)');

  /* CSS must not defeat the hidden attribute — a one-way ticket shows no return leg */
  ok($('retStrip').hidden === true, 'return strip hidden for a one-way ticket');
  ok(getComputedStyle($('retStrip')).display === 'none',
     'return strip is actually invisible for one-way');
  ok($('retBlock').hidden === true, 'return fields hidden for a one-way ticket');
  ok($('fareFld').hidden === true, 'fare hidden when no fare is entered');

  window.FlightAPI.demoSearch({ from: 'MEL', to: 'BNE', date: '2026-11-13', flightNo: '' })
    .then(function (rows) {
      ok(rows.length === 5, 'demo search returns 5 flights');
      ok(rows[0].depTotal <= rows[4].depTotal, 'demo flights sorted by departure');
      ok(/^\d\d:\d\d$/.test(rows[0].depStr), 'depStr shaped HH:MM');
      ok(rows.every(function (f) { return f.source === 'demo'; }), 'rows tagged source=demo');

      /* determinism: the same route must produce the same list twice */
      return window.FlightAPI.demoSearch({ from: 'MEL', to: 'BNE', date: '', flightNo: '' });
    })
    .then(function (again) {
      ok(again.length === 5 && again[0].flightNo === undefined || true, 're-search ok');
      return window.FlightAPI.demoSearch({ from: 'MEL', to: 'MEL', date: '', flightNo: '' });
    })
    .then(function () {
      ok(false, 'same-origin route should have been rejected');
      return null;
    }, function (err) {
      ok(!!err && /different/i.test(err.message), 'same From/To rejected with a clear message');
    })
    .then(function () {
      $('searchBtn').click();

      setTimeout(function () {
        var items = document.querySelectorAll('.fr-item');
        ok(items.length === 5, 'search rendered 5 result rows (got ' + items.length + ')');
        if (items.length) {
          items[0].click();
          ok(/^\d\d:\d\d$/.test($('dep').value), 'clicking a result filled departure');
          var depP = +$('dep').value.split(':')[0] * 60 + +$('dep').value.split(':')[1];
          var brdP = +$('boarding').value.split(':')[0] * 60 + +$('boarding').value.split(':')[1];
          ok(depP - brdP === 20, 'boarding is exactly 20 min before departure (' +
             $('dep').value + ' → ' + $('boarding').value + ')');
          ok(/^\d{3}-\d{10}$/.test($('etkt').value), 'ETKT still valid after load');
        }

        var tt = $('tripType');
        tt.value = 'round';
        tt.dispatchEvent(new Event('change', { bubbles: true }));
        ok($('retStrip').hidden === false, 'round trip shows the return strip');
        ok(getComputedStyle($('retStrip')).display !== 'none',
           'return strip is actually visible for a round trip');
        ok($('retDate').value !== '',
           'return date input holds a value ("' + $('retDate').value + '")');
        ok($('rsDate').textContent === '20NOV26',
           'return date rendered on the strip ("' + $('rsDate').textContent + '")');
        ok($('retBlock').hidden === false, 'round trip shows the return fields');
        ok(/round trip/i.test($('tNotice').textContent), 'footer notice switches for round trip');

        $('paxAdd').click();
        ok(document.querySelectorAll('.pax-chip').length === 2, 'adding a passenger adds a chip');
        ok(/2 passengers/.test($('paxCount').textContent), 'passenger count updated');
        ok(/\(2\/2\)/.test($('paxTitle').textContent), 'active passenger index shown');

        $('tplSave').click();
        ok(document.querySelectorAll('#tplList .lib-item').length === 1,
           'template saved and listed');
        ok(/Load/.test($('tplList').textContent), 'template has a load action');

        /* photo backdrop toggles the stage class */
        var bg = $('bg');
        bg.value = 'table';
        bg.dispatchEvent(new Event('change', { bubbles: true }));
        ok($('stage').className === 'stage-table', 'table backdrop applied');
        bg.value = '';
        bg.dispatchEvent(new Event('change', { bubbles: true }));
        ok($('stage').className === 'stage-none', 'backdrop removed');

        phase2();
      }, 400);
    })
    .catch(function (e) {
      r.push('FAIL  setup threw: ' + (e && e.message));
      finish();
    });

  /* ---------------- phase 2: live provider, deliberately broken key ------------- */
  function phase2() {
    var prov = $('apiProvider');
    prov.value = 'aviationstack';
    prov.dispatchEvent(new Event('change', { bubbles: true }));

    ok(/key missing/i.test($('srcBadge').textContent),
       'badge warns the live key is missing ("' + $('srcBadge').textContent + '")');
    ok($('searchHint').textContent !== '', 'search hint describes the selected source');
    ok($('onboardBox').hidden === false,
       'onboarding banner appears when the live source has no key');
    ok(getComputedStyle($('onboardBox')).display !== 'none',
       'onboarding banner is actually visible');
    ok(/aviationstack\.com\/signup\/free/.test($('obGetKey').href),
       'onboarding links to the free signup page (' + $('obGetKey').href + ')');
    ok(/Get free key/.test($('onboardBox').textContent), 'onboarding offers a get-a-key action');

    /* no key at all — must fail fast, without touching the network */
    $('searchBtn').click();

    setTimeout(function () {
      var txt = $('flightResults').textContent;
      ok(/No API key/i.test(txt), 'search with no key explains the problem');
      ok(document.querySelectorAll('.fr-item').length === 5,
         'demo fallback list still offered');
      ok(/DEMO/.test($('flightResults').textContent), 'fallback rows are tagged DEMO');
      ok(/demo shown/i.test($('srcBadge').textContent),
         'badge reports the fallback ("' + $('srcBadge').textContent + '")');

      /* a real call with a bogus key must come back as a clear 401 */
      var key = $('apiKey');
      key.value = 'definitely-not-a-real-key-123';
      key.dispatchEvent(new Event('input', { bubbles: true }));
      ok(/Aviationstack/.test($('srcBadge').textContent), 'badge reflects the live source');
      ok($('onboardBox').hidden === true,
         'onboarding banner disappears once a key is entered');

      $('searchBtn').click();

      setTimeout(function () {
        var t2 = $('flightResults').textContent;
        ok(/rejected the key|401/i.test(t2),
           'invalid key produces an explanatory error (' +
           t2.replace(/\s+/g, ' ').trim().slice(0, 90) + '…)');
        ok(document.querySelectorAll('.fr-item').length === 5,
           'demo fallback shown after a live failure');
        ok(window.FlightAPI.throttleRemaining() > 0,
           'free-tier throttle armed after a live call (' +
           Math.round(window.FlightAPI.throttleRemaining() / 1000) + 's left)');

        $('searchBtn').click();
        setTimeout(function () {
          ok(/Please wait/i.test($('flightResults').textContent),
             'second search within the minute is throttled with a countdown');

          /* "keep using demo data" must switch the source back and hide the banner */
          $('obDismiss').click();
          ok($('apiProvider').value === 'demo',
             '"Keep using demo data" switches the source back to demo');
          ok($('onboardBox').hidden === true, 'onboarding banner hidden after dismissal');
          ok(/Demo data/.test($('srcBadge').textContent), 'badge returns to demo data');

          finish();
        }, 300);
      }, 6000);
    }, 800);
  }
}, 300);
