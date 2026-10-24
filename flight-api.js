/* ============================================================================
 * flight-api.js — pluggable live flight data + the built-in demo generator.
 *
 * Status of the market (checked Oct 2026):
 *   · Kiwi.com Tequila   → closed to self-service, invite-only partners.
 *   · Amadeus Self-Service → portal decommissioned 17 Jul 2026.
 *   · Aviationstack      → still self-serve: 100 free requests/month, CORS *.
 *
 * Everything here returns ONE normalised shape so the UI never cares which
 * provider (or the demo generator) produced the list:
 *
 *   { carrier, flightNo, depStr, arrStr, depTotal, durH, durM, stops,
 *     price, currency, seats, fromCode, toCode, fromTerm, toTerm, gate,
 *     depDate, arrNextDay, status, source, deepLink }
 * ==========================================================================*/
(function (global) {
  'use strict';

  var CFG_KEY    = 'flight-ticket-generator:api';
  var CACHE_KEY  = 'flight-ticket-generator:apicache';
  var LAST_KEY   = 'flight-ticket-generator:lastcall';
  var CACHE_TTL  = 15 * 60 * 1000;
  var MIN_GAP_MS = 60 * 1000;   /* Aviationstack free plan: 1 request / 60 s */

  var DEFAULTS = {
    provider : 'demo',
    key      : '',
    endpoint : 'https://api.tequila.kiwi.com',
    currency : 'USD',
    adults   : 1
  };

  var cfg = load();

  function load() {
    var out = {};
    for (var k in DEFAULTS) out[k] = DEFAULTS[k];
    try {
      var saved = JSON.parse(localStorage.getItem(CFG_KEY) || '{}');
      for (var j in saved) if (j in DEFAULTS) out[j] = saved[j];
    } catch (e) { /* corrupt or unavailable storage — keep defaults */ }
    return out;
  }

  function persist() {
    try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) {}
  }

  /* ------------------------------- errors ------------------------------- */
  function apiError(code, message, hint) {
    var e = new Error(message);
    e.code = code;
    e.hint = hint || '';
    return e;
  }

  /* ------------------------------ utilities ----------------------------- */
  function pad2(n) { return String(n).padStart(2, '0'); }

  /* "2026-11-01T10:05:00+00:00" -> "10:05" (clock time as printed on the
     board — deliberately NOT converted to the viewer's timezone). */
  function clockOf(iso) {
    if (!iso) return null;
    var m = /T(\d{2}):(\d{2})/.exec(iso);
    return m ? m[1] + ':' + m[2] : null;
  }

  /* Correct elapsed time: parse the two ISO instants (they carry offsets). */
  function durationMins(depIso, arrIso) {
    if (!depIso || !arrIso) return null;
    var a = Date.parse(depIso), b = Date.parse(arrIso);
    if (isNaN(a) || isNaN(b)) return null;
    return Math.max(0, Math.round((b - a) / 60000));
  }

  /* dd/mm/yyyy as Tequila wants it */
  function dmy(isoDate) {
    if (!isoDate) return '';
    var p = String(isoDate).split('-');
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : '';
  }

  function toMinutes(hhmm) {
    if (!hhmm) return 0;
    var p = hhmm.split(':');
    return (parseInt(p[0], 10) || 0) * 60 + (parseInt(p[1], 10) || 0);
  }

  function normFlightNo(s) {
    return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  /* Deterministic pseudo-random from a string seed (barcodes, demo data). */
  function seeded(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return function () {
      h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
      return ((h >>> 0) % 1000) / 1000;
    };
  }

  /* --------------------------- provider catalogue ------------------------ */
  var PROVIDERS = {
    demo: {
      id: 'demo',
      label: 'Demo data (no key required)',
      needsKey: false,
      signup: null,
      note: 'Fictional flights generated in your browser. Same route always ' +
            'returns the same five flights. Works offline and costs nothing.'
    },
    aviationstack: {
      id: 'aviationstack',
      label: 'Aviationstack — free tier (100 requests/month)',
      needsKey: true,
      signup: 'https://aviationstack.com/signup/free',
      note: 'Free plan: 100 requests/month, 1 request per 60 seconds, real-time ' +
            'flights only (no history, schedules or fares) and non-commercial ' +
            'use. Sign up — no credit card — copy the Access Key from your ' +
            'dashboard and paste it here. Requests go straight from your ' +
            'browser, so use a key you are happy to have in localStorage.'
    },
    tequila: {
      id: 'tequila',
      label: 'Kiwi.com Tequila / compatible proxy',
      needsKey: true,
      signup: 'https://tequila.kiwi.com/',
      note: 'Kiwi.com closed self-service signups (partner access only). Point ' +
            'this at your own approved endpoint or a proxy you control. ' +
            'Response format is the Tequila v2 search shape.'
    }
  };

  /* ------------------------------- cache -------------------------------- */
  function cacheGet(k) {
    try {
      var e = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}')[k];
      if (e && Date.now() - e.at < CACHE_TTL) return e.v;
    } catch (err) {}
    return null;
  }
  function cacheSet(k, v) {
    try {
      var all = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
      all[k] = { at: Date.now(), v: v };
      var keys = Object.keys(all);
      if (keys.length > 25) {
        keys.sort(function (a, b) { return all[a].at - all[b].at; })
            .slice(0, keys.length - 25)
            .forEach(function (kk) { delete all[kk]; });
      }
      localStorage.setItem(CACHE_KEY, JSON.stringify(all));
    } catch (e) {}
  }

  function msSinceLastCall() {
    var t = parseInt(localStorage.getItem(LAST_KEY) || '0', 10);
    return Date.now() - t;
  }
  function markCall() {
    try { localStorage.setItem(LAST_KEY, String(Date.now())); } catch (e) {}
  }

  /* =============================== DEMO DATA ============================= */
  /* Fictional demo data, not a real booking feed. Seeded by route so the
     same From/To always returns the same five flights, sorted by departure. */
  var DEMO_CARRIERS = ['Skyline Airways', 'Northwind Air', 'Aurora Jet',
                       'Cresta Air', 'Blue Meridian'];

  function demoSearch(p) {
    var from = String(p.from || '').trim().toUpperCase();
    var to   = String(p.to || '').trim().toUpperCase();

    if (!from || !to) {
      throw apiError('missing-route', 'Enter From and To codes first.');
    }
    if (from === to) {
      throw apiError('same-route', 'From and To must be different.');
    }

    var rnd = seeded(from + '>' + to);
    var pick = function (arr) { return arr[Math.floor(rnd() * arr.length)]; };
    var flights = [];

    for (var i = 0; i < 5; i++) {
      var depH   = 5 + Math.floor(rnd() * 16);            /* 05:00 – 20:00 */
      var depM   = pick(['00', '10', '20', '30', '45']);
      var durH   = 1 + Math.floor(rnd() * 9);
      var durM   = pick(['05', '20', '35', '50']);
      var total  = depH * 60 + (+depM) + durH * 60 + (+durM);
      var carrier = DEMO_CARRIERS[i % DEMO_CARRIERS.length];
      var code   = carrier.split(' ').map(function (w) { return w[0]; })
                          .join('').slice(0, 2).toUpperCase();

      flights.push({
        carrier    : carrier,
        flightNo   : code + ' ' + (100 + Math.floor(rnd() * 899)),
        depH       : depH,
        depM       : depM,
        durH       : durH,
        durM       : durM,
        depTotal   : depH * 60 + (+depM),
        arrTotal   : total,
        stops      : rnd() > 0.6 ? 1 : 0,
        price      : 49 + Math.floor(rnd() * 40) * 10,
        seats      : 1 + Math.floor(rnd() * 9),
        fromCode   : from,
        toCode     : to,
        source     : 'demo',
        status     : null,
        fromTerm   : null,
        toTerm     : null,
        gate       : null,
        depDate    : p.date || null,
        deepLink   : null
      });
    }

    flights.sort(function (a, b) { return a.depTotal - b.depTotal; });

    return flights.map(function (f) {
      var arrTotal = f.arrTotal % (24 * 60);
      return {
        carrier   : f.carrier,
        flightNo  : f.flightNo,
        depStr    : pad2(f.depH) + ':' + f.depM,
        arrStr    : pad2(Math.floor(arrTotal / 60)) + ':' + pad2(arrTotal % 60),
        depTotal  : f.depTotal,
        durH      : f.durH,
        durM      : f.durM,
        arrNextDay: f.arrTotal >= 24 * 60,
        stops     : f.stops,
        price     : f.price,
        currency  : cfg.currency,
        seats     : f.seats,
        fromCode  : f.fromCode,
        toCode    : f.toCode,
        fromCity  : null,
        toCity    : null,
        fromTerm  : null,
        toTerm    : null,
        gate      : null,
        depDate   : f.depDate,
        status    : null,
        source    : 'demo',
        deepLink  : null
      };
    });
  }

  /* ============================ AVIATIONSTACK ============================ */
  /* GET https://api.aviationstack.com/v1/flights?access_key=&dep_iata=&arr_iata=
        &flight_date=&limit=                                        (CORS: *) */
  var AV_BASE = 'https://api.aviationstack.com/v1/flights';

  function aviationstackSearch(p) {
    var q = new URLSearchParams();
    q.set('access_key', cfg.key);
    q.set('limit', '10');

    var flightCode = normFlightNo(p.flightNo);
    /* "SK284" / "SK 284" → search by flight number when it looks like one */
    if (/^[A-Z0-9]{2}\d{1,4}$/.test(flightCode)) {
      q.set('flight_iata', flightCode);
    } else {
      q.set('dep_iata', String(p.from || '').trim().toUpperCase());
      q.set('arr_iata', String(p.to || '').trim().toUpperCase());
    }
    if (p.date) q.set('flight_date', p.date);

    return httpJson(AV_BASE + '?' + q.toString(), { headers: {} })
      .then(function (json) {
        if (json && json.error) {
          throw apiError(json.error.code || 'api-error',
            json.error.message || 'Aviationstack returned an error.');
        }
        var rows = (json && json.data) || [];
        return rows.map(mapAviationstack).filter(Boolean).map(function (f) {
          /* searching by flight number returns any route — only fill the
             codes the payload did not already give us */
          if (!f.fromCode && p.from) f.fromCode = p.from;
          if (!f.toCode && p.to)     f.toCode   = p.to;
          f.currency = cfg.currency;
          return f;
        });
      });
  }

  function mapAviationstack(r) {
    if (!r || !r.departure || !r.arrival) return null;
    var depIso = r.departure.scheduled || r.departure.estimated;
    var arrIso = r.arrival.scheduled   || r.arrival.estimated;
    var depStr = clockOf(depIso);
    var arrStr = clockOf(arrIso);
    if (!depStr || !arrStr) return null;

    var mins = durationMins(depIso, arrIso);
    var iata = (r.airline && r.airline.iata) || '';
    var num  = (r.flight && (r.flight.number || '')) || '';

    return {
      carrier   : (r.airline && r.airline.name) || iata || 'Unknown airline',
      flightNo  : (iata && num) ? (iata + ' ' + num) : (r.flight && r.flight.iata) || '',
      depStr    : depStr,
      arrStr    : arrStr,
      depTotal  : toMinutes(depStr),
      durH      : mins == null ? 0 : Math.floor(mins / 60),
      durM      : mins == null ? 0 : mins % 60,
      arrNextDay: mins != null && (toMinutes(depStr) + mins) >= 24 * 60,
      stops     : 0,
      price     : null,
      currency  : cfg.currency,
      seats     : null,
      fromCode  : (r.departure.iata || '').toUpperCase(),
      toCode    : (r.arrival.iata || '').toUpperCase(),
      fromCity  : r.departure.airport || null,
      toCity    : r.arrival.airport || null,
      fromTerm  : r.departure.terminal || null,
      toTerm    : r.arrival.terminal || null,
      gate      : r.departure.gate || null,
      depDate   : r.flight_date || null,
      status    : r.flight_status || null,
      source    : 'aviationstack',
      deepLink  : null
    };
  }

  /* ======================== TEQUILA-COMPATIBLE v2 ======================== */
  /* GET {endpoint}/v2/search?fly_from=&fly_to=&date_from=dd/mm/yyyy&...
        header: apikey: <key>                                          */
  function tequilaSearch(p) {
    var base = String(cfg.endpoint || DEFAULTS.endpoint).replace(/\/+$/, '');
    var q = new URLSearchParams();
    q.set('fly_from', String(p.from || '').trim().toUpperCase());
    q.set('fly_to',   String(p.to || '').trim().toUpperCase());
    q.set('date_from', dmy(p.date));
    q.set('date_to',   dmy(p.date));
    q.set('flight_type', p.tripType === 'round' ? 'round' : 'one_way');
    if (p.tripType === 'round' && p.returnDate) {
      q.set('return_from', dmy(p.returnDate));
      q.set('return_to',   dmy(p.returnDate));
    }
    q.set('adults', String(cfg.adults || 1));
    q.set('curr', String(cfg.currency || 'USD').toUpperCase());
    q.set('limit', '10');
    q.set('sort', 'duration');
    q.set('max_stopovers', '2');

    return httpJson(base + '/v2/search?' + q.toString(),
                    { headers: { apikey: cfg.key } })
      .then(function (json) {
        if (json && (json.error || json.message && !json.data)) {
          throw apiError('api-error', json.message || 'Tequila returned an error.');
        }
        var rows = (json && json.data) || [];
        return rows.map(mapTequila).filter(Boolean);
      });
  }

  function mapTequila(r) {
    if (!r) return null;
    var depStr = clockOf(r.local_departure);
    var arrStr = clockOf(r.local_arrival);
    if (!depStr || !arrStr) return null;

    var route0 = (r.route && r.route[0]) || {};
    var durSec = (r.duration && r.duration.departure) || 0;
    var durMin = Math.round(durSec / 60);

    return {
      carrier   : (route0.airline || (r.airlines && r.airlines[0]) || '').toUpperCase(),
      flightNo  : route0.flight_iata ||
                    ((route0.airline || '') + ' ' + (route0.flight_no || '')).trim(),
      depStr    : depStr,
      arrStr    : arrStr,
      depTotal  : toMinutes(depStr),
      durH      : Math.floor(durMin / 60),
      durM      : durMin % 60,
      arrNextDay: (toMinutes(depStr) + durMin) >= 24 * 60,
      stops     : Math.max(0, ((r.route || []).length || 1) - 1),
      price     : (typeof r.price === 'number') ? Math.round(r.price) : null,
      currency  : cfg.currency,
      seats     : null,
      fromCode  : String(r.flyFrom || '').toUpperCase(),
      toCode    : String(r.flyTo || '').toUpperCase(),
      fromCity  : r.cityFrom || null,
      toCity    : r.cityTo || null,
      fromTerm  : route0.departure_terminal || null,
      toTerm    : route0.arrival_terminal || null,
      gate      : route0.departure_gate || null,
      depDate   : String(r.local_departure || '').slice(0, 10) || null,
      status    : null,
      source    : 'tequila',
      deepLink  : r.deep_link || null
    };
  }

  /* ============================== plumbing ============================== */
  function httpJson(url, opts) {
    opts = opts || {};
    var headers = opts.headers || {};
    return fetch(url, { headers: headers, cache: 'no-store' }).then(function (res) {
      return res.text().then(function (text) {
        var body = null;
        try { body = text ? JSON.parse(text) : null; } catch (e) { /* non-JSON */ }

        if (res.status === 401 || res.status === 403) {
          throw apiError('unauthorized',
            'The API rejected the key (HTTP ' + res.status + ').',
            'Check the key is correct, active and for the right environment.');
        }
        if (res.status === 429) {
          throw apiError('rate-limit',
            'Rate limit reached (HTTP 429).',
            'The Aviationstack free plan allows 1 request per 60 seconds.');
        }
        if (!res.ok) {
          var msg = (body && (body.error && body.error.message || body.message)) ||
                    ('HTTP ' + res.status);
          throw apiError('http-' + res.status, msg);
        }
        return body;
      });
    }, function (err) {
      throw apiError('network',
        'Could not reach the API.',
        'Offline, blocked by the browser, or the endpoint does not allow ' +
        'cross-origin requests from a file:// page. A proxy you control can fix that.');
    });
  }

  function cacheKeyFor(p) {
    return ['v1', cfg.provider, p.from, p.to, p.date, p.flightNo,
            p.tripType, p.returnDate, cfg.currency, cfg.adults].join('|');
  }

  /* ------------------------------- public -------------------------------- */
  var FlightAPI = {
    PROVIDERS: PROVIDERS,
    seeded: seeded,
    MIN_GAP_MS: MIN_GAP_MS,

    get: function (k) { return cfg[k]; },
    set: function (k, v) { cfg[k] = v; persist(); },
    config: function () { return cfg; },
    providerInfo: function () { return PROVIDERS[cfg.provider] || PROVIDERS.demo; },
    hasKey: function () { return !!String(cfg.key || '').trim(); },

    /* Milliseconds until the next live call is allowed (0 = go ahead). */
    throttleRemaining: function () {
      if (cfg.provider === 'demo') return 0;
      return Math.max(0, MIN_GAP_MS - msSinceLastCall());
    },

    /* Search. Never rejects with a bare string — always an Error carrying
       `.code` and `.hint` so the UI can explain and offer the demo fallback. */
    search: function (p) {
      var provider = PROVIDERS[cfg.provider] ? cfg.provider : 'demo';

      if (provider === 'demo') {
        return new Promise(function (resolve) { resolve(demoSearch(p)); });
      }
      if (!cfg.key) {
        return Promise.reject(apiError('no-key',
          'No API key set for ' + PROVIDERS[provider].label + '.',
          'Open “Flight data settings”, paste a key, then search again.'));
      }

      var ck = cacheKeyFor(p);
      var cached = cacheGet(ck);
      if (cached) return Promise.resolve(cached);

      var wait = this.throttleRemaining();
      if (wait > 0) {
        return Promise.reject(apiError('throttle',
          'Please wait ' + Math.ceil(wait / 1000) + ' more seconds.',
          PROVIDERS[provider].note));
      }

      var fn = provider === 'aviationstack' ? aviationstackSearch : tequilaSearch;

      return fn(p).then(function (rows) {
        markCall();
        cacheSet(ck, rows);
        return rows;
      }, function (err) {
        /* 4xx/5xx mean we made a real call, so consume the minute anyway —
           but a network failure never reached them, so don't throttle it. */
        if (err.code !== 'network') markCall();
        throw err;
      });
    },

    /* One cheap live call to prove the key works. */
    test: function () {
      var provider = PROVIDERS[cfg.provider] ? cfg.provider : 'demo';
      if (provider === 'demo') {
        return Promise.resolve({ message: 'Demo data needs no key — ready.' });
      }
      if (!cfg.key) {
        return Promise.reject(apiError('no-key', 'No API key set.',
          'Paste a key first.'));
      }
      var p = provider === 'aviationstack'
        ? { flightNo: '', from: '', to: '', date: '' }
        : { from: 'LHR', to: 'JFK', date: '', flightNo: '' };

      if (provider === 'aviationstack') {
        var q = new URLSearchParams();
        q.set('access_key', cfg.key);
        q.set('limit', '1');
        return httpJson(AV_BASE + '?' + q.toString(), { headers: {} })
          .then(function (json) {
            if (json && json.error) {
              throw apiError(json.error.code || 'api-error', json.error.message);
            }
            markCall();
            var n = ((json && json.data) || []).length;
            return { message: 'Key accepted. Sample rows returned: ' + n + '.' };
          });
      }
      return tequilaSearch(p).then(function (rows) {
        markCall();
        return { message: 'Key accepted. Sample rows returned: ' + rows.length + '.' };
      });
    },

    demoSearch: function (p) {
      return new Promise(function (resolve) { resolve(demoSearch(p)); });
    }
  };

  global.FlightAPI = FlightAPI;
})(window);
