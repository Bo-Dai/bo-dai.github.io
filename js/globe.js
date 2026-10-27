/* Adapted from rushi-q.github.io (MIT), recolored for this site.
   Visitor globe — a draggable engraved-line orthographic globe in the site palette.
   Coast data: assets/js/globe-land.js (Int16Array rings; 32767,32767 separators).
   Visit data: JSON { points: [{ lat, lon, count, label }] } from data-stats URL. */
(function () {
  'use strict';

  var mount = document.getElementById('visitor-globe');
  if (!mount || !window.__GLOBE_COAST__) return;

  /* Each theme: an eggshell orb with a soft upper-left highlight, coastlines
     drawn as the engraved line (a wide faint bleed under a crisp stroke),
     a quiet graticule with a bordeaux equator, and an instrument ring with
     degree ticks that stays fixed while the globe turns inside it. */
  var PALETTES = {
    day: {
      orb: [
        [0.0, 'rgba(255, 255, 253, 0.95)'],
        [0.45, 'rgba(247, 246, 242, 0.6)'],
        [0.82, 'rgba(236, 234, 228, 0.55)'],
        [1.0, 'rgba(201, 197, 186, 0.65)']
      ],
      limb: 'rgba(23, 23, 28, 0.10)',
      rim: 'rgba(23, 23, 28, 0.6)',
      rimInner: 'rgba(23, 23, 28, 0.2)',
      tick: 'rgba(23, 23, 28, 0.45)',
      graticule: 'rgba(74, 74, 85, 0.14)',
      equator: 'rgba(97, 89, 214, 0.38)',
      coastHalo: 'rgba(23, 23, 28, 0.08)',
      coast: 'rgba(23, 23, 28, 0.75)',
      pole: 'rgba(97, 89, 214, 0.55)',
      marker: '#6159d6',
      halo: 'rgba(97, 89, 214, 0.16)',
      refDot: 'rgba(23, 23, 28, 0.75)'
    },
    night: {
      orb: [
        [0.0, 'rgba(233, 231, 225, 0.10)'],
        [0.45, 'rgba(233, 231, 225, 0.05)'],
        [0.82, 'rgba(17, 17, 20, 0.12)'],
        [1.0, 'rgba(0, 0, 0, 0.34)']
      ],
      limb: 'rgba(0, 0, 0, 0.22)',
      rim: 'rgba(177, 175, 184, 0.7)',
      rimInner: 'rgba(177, 175, 184, 0.25)',
      tick: 'rgba(177, 175, 184, 0.5)',
      graticule: 'rgba(155, 149, 245, 0.14)',
      equator: 'rgba(155, 149, 245, 0.4)',
      coastHalo: 'rgba(233, 231, 225, 0.1)',
      coast: 'rgba(233, 231, 225, 0.8)',
      pole: 'rgba(155, 149, 245, 0.6)',
      marker: '#9b95f5',
      halo: 'rgba(155, 149, 245, 0.2)',
      refDot: 'rgba(233, 231, 225, 0.85)'
    }
  };

  /* reference cities: quiet gazetteer marks that make the globe readable */
  var REF = [
    { name: 'Mountain View', lat: 37.39, lon: -122.08 },
    { name: 'Atlanta', lat: 33.75, lon: -84.39 },
    { name: 'New York', lat: 40.71, lon: -74.01 },
    { name: 'Mexico City', lat: 19.43, lon: -99.13 },
    { name: 'São Paulo', lat: -23.55, lon: -46.63 },
    { name: 'Buenos Aires', lat: -34.6, lon: -58.38 },
    { name: 'Honolulu', lat: 21.31, lon: -157.86 },
    { name: 'London', lat: 51.51, lon: -0.13 },
    { name: 'Rome', lat: 41.9, lon: 12.5 },
    { name: 'Moscow', lat: 55.76, lon: 37.62 },
    { name: 'Cairo', lat: 30.04, lon: 31.24 },
    { name: 'Cape Town', lat: -33.92, lon: 18.42 },
    { name: 'Dubai', lat: 25.2, lon: 55.27 },
    { name: 'Mumbai', lat: 19.08, lon: 72.88 },
    { name: 'Singapore', lat: 1.35, lon: 103.82 },
    { name: 'Beijing', lat: 39.9, lon: 116.4 },
    { name: 'Shanghai', lat: 31.23, lon: 121.47 },
    { name: 'Tokyo', lat: 35.68, lon: 139.69 },
    { name: 'Sydney', lat: -33.87, lon: 151.21 }
  ];
  (function () {
    for (var i = 0; i < REF.length; i++) {
      var la = REF[i].lat * Math.PI / 180;
      var lo = REF[i].lon * Math.PI / 180;
      REF[i].x = Math.cos(la) * Math.cos(lo);
      REF[i].y = Math.cos(la) * Math.sin(lo);
      REF[i].z = Math.sin(la);
    }
  })();

  function palette() {
    return document.documentElement.getAttribute('data-theme') === 'dark'
      ? PALETTES.night
      : PALETTES.day;
  }

  var canvas = document.createElement('canvas');
  var caption = document.createElement('div');
  var panel = document.createElement('div');
  var tooltip = document.createElement('div');
  caption.className = 'visitor-globe__caption';
  panel.className = 'visitor-globe__panel';
  panel.hidden = true;
  tooltip.className = 'visitor-globe__tooltip';
  tooltip.style.display = 'none';
  mount.appendChild(canvas);
  mount.appendChild(caption);
  mount.appendChild(panel);
  mount.appendChild(tooltip);

  var ctx = canvas.getContext('2d');

  /* coastline rings as unit vectors */
  var coast = [];
  (function () {
    var cr = window.__GLOBE_COAST__;
    var cur = [];
    for (var ci = 0; ci < cr.length; ci += 2) {
      if (cr[ci] === 32767) {
        if (cur.length >= 9) coast.push(new Float32Array(cur));
        cur = [];
        continue;
      }
      var lon = (cr[ci] / 10) * Math.PI / 180;
      var lat = (cr[ci + 1] / 10) * Math.PI / 180;
      cur.push(Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat));
    }
  })();

  var markers = [];
  var maxCount = 1;

  var size = 0;
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  function resize() {
    var w = Math.min(mount.clientWidth || 190, 260);
    if (w <= 0 || w === size) return;
    size = w;
    canvas.width = w * dpr;
    canvas.height = w * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = w + 'px';
    needsRender = true;
  }

  /* view state: spin (around the poles) and tilt (pitch toward the viewer) */
  var spin = -1.62;   /* opens on the Americas–Atlantic face */
  var tilt = 0.42;
  var vSpin = 0;
  var dragging = false;
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var AUTO = reduced ? 0 : 0.0016;
  var needsRender = true;
  var fly = null;          /* {spin, tilt} while easing toward a chosen place */
  var focusKey = null;     /* label of the marker the list is pointing at */

  function project(x, y, z, out) {
    var cs = Math.cos(spin), ss = Math.sin(spin);
    var x1 = x * cs - y * ss;
    var y1 = x * ss + y * cs;
    var ct = Math.cos(tilt), st = Math.sin(tilt);
    var x2 = x1 * ct + z * st;
    var z2 = -x1 * st + z * ct;
    out[0] = y1;
    out[1] = -z2;
    out[2] = x2;
  }

  var P = [0, 0, 0];
  var screenMarkers = [];
  var screenRefs = [];

  function strokeCircleOnSphere(c, R, latDeg, lonDeg, isParallel) {
    /* one parallel (fixed lat) or meridian (fixed lon), backface-culled */
    var first = true, a, lat, lon;
    for (a = isParallel ? 0 : -84; a <= (isParallel ? 360 : 84); a += 4) {
      lat = (isParallel ? latDeg : a) * Math.PI / 180;
      lon = (isParallel ? a : lonDeg) * Math.PI / 180;
      project(Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat), P);
      if (P[2] <= 0.01) { first = true; continue; }
      var gx = c + P[0] * R, gy = c + P[1] * R;
      if (first) { ctx.moveTo(gx, gy); first = false; } else { ctx.lineTo(gx, gy); }
    }
  }

  function render() {
    var pal = palette();
    var w = size;
    var c = w / 2;
    var R = w / 2 - 7;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, w);

    /* the orb: soft top-left highlight rolling into a shaded limb */
    var g = ctx.createRadialGradient(c - R * 0.42, c - R * 0.46, R * 0.08, c, c, R);
    for (var s0 = 0; s0 < pal.orb.length; s0++) g.addColorStop(pal.orb[s0][0], pal.orb[s0][1]);
    ctx.beginPath();
    ctx.arc(c, c, R, 0, 2 * Math.PI);
    ctx.fillStyle = g;
    ctx.fill();

    /* limb darkening: a narrow ring just inside the edge */
    var lg = ctx.createRadialGradient(c, c, R * 0.82, c, c, R);
    lg.addColorStop(0, 'rgba(0,0,0,0)');
    lg.addColorStop(1, pal.limb);
    ctx.beginPath();
    ctx.arc(c, c, R, 0, 2 * Math.PI);
    ctx.fillStyle = lg;
    ctx.fill();

    /* graticule: quiet parallels and meridians */
    var b;
    ctx.lineWidth = 0.85;
    ctx.strokeStyle = pal.graticule;
    ctx.beginPath();
    for (b = -60; b <= 60; b += 30) if (b !== 0) strokeCircleOnSphere(c, R, b, 0, true);
    for (b = 0; b < 360; b += 45) strokeCircleOnSphere(c, R, 0, b, false);
    ctx.stroke();

    /* the equator carries the accent: one bordeaux line around the world */
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = pal.equator;
    ctx.beginPath();
    strokeCircleOnSphere(c, R, 0, 0, true);
    ctx.stroke();

    /* coastlines: a wide faint ink-bleed under a crisp engraved stroke */
    var cs = Math.cos(spin), ss = Math.sin(spin);
    var ct = Math.cos(tilt), st = Math.sin(tilt);
    var pass, r0, ring, pen, k;
    for (pass = 0; pass < 2; pass++) {
      ctx.lineWidth = pass === 0 ? 3.2 : 1.05;
      ctx.strokeStyle = pass === 0 ? pal.coastHalo : pal.coast;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (r0 = 0; r0 < coast.length; r0++) {
        ring = coast[r0];
        pen = false;
        for (k = 0; k < ring.length; k += 3) {
          var x1 = ring[k] * cs - ring[k + 1] * ss;
          var y1 = ring[k] * ss + ring[k + 1] * cs;
          var depth = x1 * ct + ring[k + 2] * st;
          if (depth <= 0.01) { pen = false; continue; }
          var sx = c + y1 * R;
          var sy = c - (-x1 * st + ring[k + 2] * ct) * R;
          if (pen) ctx.lineTo(sx, sy); else { ctx.moveTo(sx, sy); pen = true; }
        }
      }
      ctx.stroke();
    }

    /* pole marks: tiny accent diamonds at the axis */
    for (var pp = -1; pp <= 1; pp += 2) {
      project(0, 0, pp, P);
      if (P[2] <= 0.02) continue;
      var pxx = c + P[0] * R, pyy = c + P[1] * R;
      ctx.save();
      ctx.translate(pxx, pyy);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = pal.pole;
      ctx.fillRect(-1.6, -1.6, 3.2, 3.2);
      ctx.restore();
    }

    /* the instrument ring: double rule + degree ticks, fixed while the globe turns */
    ctx.beginPath();
    ctx.arc(c, c, R, 0, 2 * Math.PI);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = pal.rim;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(c, c, R + 4, 0, 2 * Math.PI);
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = pal.rimInner;
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.strokeStyle = pal.tick;
    ctx.beginPath();
    for (var t0 = 0; t0 < 360; t0 += 10) {
      var ang = t0 * Math.PI / 180;
      var t1 = R + (t0 % 30 === 0 ? 4 : 2.2);
      ctx.moveTo(c + Math.cos(ang) * R, c + Math.sin(ang) * R);
      ctx.lineTo(c + Math.cos(ang) * t1, c + Math.sin(ang) * t1);
    }
    ctx.stroke();

    /* reference cities: small ink squares, named only on hover */
    screenRefs.length = 0;
    for (var rc = 0; rc < REF.length; rc++) {
      project(REF[rc].x, REF[rc].y, REF[rc].z, P);
      if (P[2] <= 0.12) continue;
      var fade = Math.min(1, (P[2] - 0.12) / 0.22);
      var rx = c + P[0] * R;
      var ry = c + P[1] * R;
      ctx.globalAlpha = fade;
      ctx.save();
      ctx.translate(rx, ry);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = pal.refDot;
      ctx.fillRect(-1.5, -1.5, 3, 3);
      ctx.restore();
      ctx.globalAlpha = 1;
      screenRefs.push({ x: rx, y: ry, label: REF[rc].name });
    }

    /* visitor markers: bordeaux diamonds sized by count */
    screenMarkers.length = 0;
    for (var m = 0; m < markers.length; m++) {
      var mk = markers[m];
      project(mk.x, mk.y, mk.z, P);
      if (P[2] <= 0.02) continue;
      var mx = c + P[0] * R;
      var my = c + P[1] * R;
      var s = 3.1 + 4.6 * Math.sqrt(mk.count / maxCount);
      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = pal.halo;
      ctx.fillRect(-s, -s, 2 * s, 2 * s);
      ctx.fillStyle = pal.marker;
      ctx.fillRect(-s / 2, -s / 2, s, s);
      ctx.restore();
      /* the place picked in the list wears a surveyor's ring */
      if (focusKey && mk.label === focusKey) {
        ctx.beginPath();
        ctx.arc(mx, my, s + 4.5, 0, 2 * Math.PI);
        ctx.lineWidth = 1.1;
        ctx.strokeStyle = pal.marker;
        ctx.stroke();
      }
      screenMarkers.push({ x: mx, y: my, r: Math.max(s, 5), label: mk.label, count: mk.count });
    }
  }

  function tick() {
    if (fly) {
      /* ease onto the chosen place, then hand the view back */
      spin += (fly.spin - spin) * 0.14;
      tilt += (fly.tilt - tilt) * 0.14;
      if (Math.abs(fly.spin - spin) < 0.002 && Math.abs(fly.tilt - tilt) < 0.002) {
        spin = fly.spin;
        tilt = fly.tilt;
        fly = null;
      }
      needsRender = true;
    } else if (!dragging) {
      /* the globe holds still while the list is open, so a place stays findable */
      spin += (openMode ? 0 : AUTO) + vSpin;
      vSpin *= 0.955;
      if (Math.abs(vSpin) < 0.00004) vSpin = 0;
      if ((AUTO && !openMode) || vSpin) needsRender = true;
    }
    if (needsRender && !document.hidden) {
      resize();
      render();
      needsRender = false;
    }
    requestAnimationFrame(tick);
  }

  /* drag to rotate */
  var lastX = 0, lastY = 0, moved = 0;
  canvas.addEventListener('pointerdown', function (e) {
    dragging = true;
    fly = null;
    moved = 0;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('is-dragging');
  });
  canvas.addEventListener('pointermove', function (e) {
    if (dragging) {
      var dx = e.clientX - lastX;
      var dy = e.clientY - lastY;
      moved += Math.abs(dx) + Math.abs(dy);
      lastX = e.clientX;
      lastY = e.clientY;
      spin += dx * 0.006;
      vSpin = dx * 0.0022;
      tilt = Math.max(-1.2, Math.min(1.2, tilt + dy * 0.006));
      needsRender = true;
      tooltip.style.display = 'none';
    } else {
      hover(e);
    }
  });
  function endDrag() {
    dragging = false;
    canvas.classList.remove('is-dragging');
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointerleave', function () {
    if (!dragging) tooltip.style.display = 'none';
  });

  function hover(e) {
    var rect = canvas.getBoundingClientRect();
    var px = e.clientX - rect.left;
    var py = e.clientY - rect.top;
    var best = null, bd = 121;
    for (var i = 0; i < screenMarkers.length; i++) {
      var sm = screenMarkers[i];
      var d = (sm.x - px) * (sm.x - px) + (sm.y - py) * (sm.y - py);
      if (d < bd && d < (sm.r + 6) * (sm.r + 6)) { bd = d; best = sm; }
    }
    if (!best) {
      var rbd = 64;
      for (var j = 0; j < screenRefs.length; j++) {
        var sr = screenRefs[j];
        var rd = (sr.x - px) * (sr.x - px) + (sr.y - py) * (sr.y - py);
        if (rd < rbd) { rbd = rd; best = sr; }
      }
    }
    if (best) {
      tooltip.textContent = best.count ? best.label + ' · ' + best.count : best.label;
      tooltip.style.display = 'block';
      tooltip.style.left = Math.round(best.x) + 'px';
      tooltip.style.top = Math.round(best.y - 12) + 'px';
    } else {
      tooltip.style.display = 'none';
    }
  }

  /* re-render when the theme toggle flips */
  new MutationObserver(function () { needsRender = true; })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  if (window.ResizeObserver) new ResizeObserver(function () { needsRender = true; }).observe(mount);

  /* ---- visit stats ---- */
  var base = (mount.getAttribute('data-stats') || '').replace(/\/+$/, '');
  var isLive = location.hostname === 'bo-dai.github.io';

  /* The two tallies in the caption double as tabs onto a ranked list:
     visits → how many visits each place sent; places → how many places per
     country. Neighbours that overlap on the orb — the Bay Area cluster — are
     unreadable as marks but perfectly legible as rows. */
  var PAGE = 5;
  var openMode = null;   /* null | 'visits' | 'places' */
  var shown = PAGE;
  var visitRows = [];
  var placeRows = [];

  var regionName = (function () {
    try {
      var dn = new Intl.DisplayNames(['en'], { type: 'region' });
      return function (code) {
        try { return dn.of(code) || code; } catch (e) { return code; }
      };
    } catch (e) {
      return function (code) { return code; };
    }
  })();

  function countryOf(label) {
    var i = label.lastIndexOf(', ');
    return i === -1 ? label : label.slice(i + 2);
  }

  function normalizePlaceLabel(label) {
    /* Apply the site's country grouping to both historical and new visit data. */
    var country = countryOf(label);
    if (/^(CN|HK|MO|TW|China|Hong Kong|Macao|Macau|Taiwan)$/i.test(country)) {
      return label.slice(0, label.length - country.length) + 'China';
    }
    return label;
  }

  function buildRows(points) {
    visitRows = points.map(function (p) {
      return {
        label: p.label || 'Somewhere',
        value: p.count || 1,
        lat: p.lat,
        lon: p.lon,
        key: p.label || 'Somewhere',
        note: (p.count || 1) + ((p.count || 1) === 1 ? ' visit' : ' visits')
      };
    }).sort(function (a, b) { return b.value - a.value || a.label.localeCompare(b.label); });

    var byCountry = {};
    for (var i = 0; i < points.length; i++) {
      var p = points[i];
      var code = countryOf(p.label || '??');
      var g = byCountry[code] || (byCountry[code] = { places: 0, visits: 0, top: null });
      g.places += 1;
      g.visits += p.count || 1;
      if (!g.top || (p.count || 1) > (g.top.count || 1)) g.top = p;
    }
    placeRows = Object.keys(byCountry).map(function (code) {
      var g = byCountry[code];
      return {
        label: regionName(code),
        value: g.places,
        lat: g.top ? g.top.lat : 0,
        lon: g.top ? g.top.lon : 0,
        key: g.top ? g.top.label : null,
        note: g.places + (g.places === 1 ? ' place · ' : ' places · ') +
              g.visits + (g.visits === 1 ? ' visit' : ' visits')
      };
    }).sort(function (a, b) { return b.value - a.value || a.label.localeCompare(b.label); });
  }

  function flyTo(lat, lon, key) {
    if (typeof lat !== 'number' || typeof lon !== 'number') return;
    focusKey = key || null;
    var targetSpin = -lon * Math.PI / 180;
    var targetTilt = Math.max(-1.2, Math.min(1.2, lat * Math.PI / 180));
    /* take the short way round rather than unwinding the whole globe */
    targetSpin += Math.round((spin - targetSpin) / (2 * Math.PI)) * 2 * Math.PI;
    vSpin = 0;
    if (reduced) {
      spin = targetSpin;
      tilt = targetTilt;
      fly = null;
    } else {
      fly = { spin: targetSpin, tilt: targetTilt };
    }
    needsRender = true;
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function renderPanel() {
    panel.textContent = '';
    if (!openMode) {
      panel.hidden = true;
      return;
    }
    var rows = openMode === 'visits' ? visitRows : placeRows;
    panel.hidden = false;
    panel.appendChild(el('div', 'visitor-globe__panel-head',
      openMode === 'visits' ? 'Visits per place' : 'Places per country'));

    var list = el('ol', 'visitor-globe__list');
    var n = Math.min(shown, rows.length);
    for (var i = 0; i < n; i++) {
      (function (row, rank) {
        var item = el('li');
        var btn = el('button', 'visitor-globe__row');
        btn.type = 'button';
        btn.title = row.label + ' · ' + row.note;
        btn.appendChild(el('span', 'visitor-globe__rank', String(rank)));
        btn.appendChild(el('span', 'visitor-globe__place', row.label));
        btn.appendChild(el('span', 'visitor-globe__count', row.value.toLocaleString('en-US')));
        if (focusKey && row.key === focusKey) btn.classList.add('is-focused');
        btn.addEventListener('click', function () {
          flyTo(row.lat, row.lon, row.key);
          renderPanel();
        });
        item.appendChild(btn);
        list.appendChild(item);
      })(rows[i], i + 1);
    }
    panel.appendChild(list);

    if (rows.length > PAGE) {
      var more = el('button', 'visitor-globe__more');
      more.type = 'button';
      if (shown < rows.length) {
        more.textContent = 'Show ' + Math.min(PAGE, rows.length - shown) + ' more';
        more.addEventListener('click', function () {
          shown += PAGE;
          renderPanel();
        });
      } else {
        more.textContent = 'Show less';
        more.addEventListener('click', function () {
          shown = PAGE;
          renderPanel();
        });
      }
      panel.appendChild(more);
    }
  }

  function setMode(mode) {
    openMode = openMode === mode ? null : mode;
    shown = PAGE;
    focusKey = null;   /* a new list means no place is being pointed at yet */
    var tabs = caption.querySelectorAll('.visitor-globe__stat');
    for (var i = 0; i < tabs.length; i++) {
      var on = tabs[i].getAttribute('data-mode') === openMode;
      tabs[i].classList.toggle('is-open', on);
      tabs[i].setAttribute('aria-expanded', on ? 'true' : 'false');
    }
    renderPanel();
    needsRender = true;
  }

  function statTab(mode, text) {
    var b = el('button', 'visitor-globe__stat', text);
    b.type = 'button';
    b.setAttribute('data-mode', mode);
    b.setAttribute('aria-expanded', 'false');
    b.addEventListener('click', function () { setMode(mode); });
    return b;
  }

  function buildCaption(visits, places) {
    caption.textContent = '';
    caption.appendChild(statTab('visits',
      visits.toLocaleString('en-US') + (visits === 1 ? ' visit' : ' visits')));
    caption.appendChild(el('span', 'visitor-globe__sep', '·'));
    caption.appendChild(statTab('places',
      places.toLocaleString('en-US') + (places === 1 ? ' place' : ' places')));
  }

  function setMarkers(points) {
    markers = [];
    maxCount = 1;
    var usable = [];
    for (var i = 0; i < points.length; i++) {
      var p = points[i];
      if (typeof p.lat !== 'number' || typeof p.lon !== 'number') continue;
      p = {
        lat: p.lat,
        lon: p.lon,
        count: p.count,
        label: normalizePlaceLabel(p.label || 'Somewhere')
      };
      var lat = p.lat * Math.PI / 180;
      var lon = p.lon * Math.PI / 180;
      markers.push({
        x: Math.cos(lat) * Math.cos(lon),
        y: Math.cos(lat) * Math.sin(lon),
        z: Math.sin(lat),
        count: p.count || 1,
        label: p.label || 'Somewhere'
      });
      usable.push(p);
      if ((p.count || 1) > maxCount) maxCount = p.count || 1;
    }
    var visits = usable.reduce(function (a, p) { return a + (p.count || 1); }, 0);
    if (visits > 0) {
      buildRows(usable);
      buildCaption(visits, usable.length);
      renderPanel();
    }
    needsRender = true;
  }

  if (base) {
    if (isLive && !sessionStorage.getItem('vg-hit')) {
      sessionStorage.setItem('vg-hit', '1');
      fetch(base + '/hit', { method: 'POST', keepalive: true }).catch(function () {});
    }
    fetch(base + '/stats')
      .then(function (r) { return r.json(); })
      .then(function (d) { setMarkers(d.points || d || []); })
      .catch(function () {});
  }

  resize();
  requestAnimationFrame(tick);
})();
