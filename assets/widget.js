/* Zara — "Never Miss a Customer" demo chat engine (jewelry edition).
   100% client-side. No network calls, no tracking. Works from file:// .
   Leads are persisted to localStorage (simulated owner dashboard).
   Test hooks: ?fast=1 skips delays; window.__maya exposes state + send();
   window.__getLeads/__clearLeads expose and reset the persisted leads. */
(function () {
  'use strict';

  var qs = new URLSearchParams(location.search);
  var FAST = qs.get('fast') === '1';

  /* ---------- business profile (personalizable via ?biz= etc.) ---------- */
  var BIZ = {
    name:    qs.get('biz')     || 'Impression Jewelry by Kiran Rajput',
    tagline: qs.get('tagline') || 'Luxury · Bridal · Worldwide Delivery',
    city:    qs.get('city')    || 'Karachi, Pakistan',
    address: qs.get('addr') || qs.get('address') || 'Karachi, Pakistan — appointments & online only',
    phone:   qs.get('phone')   || '+92 300 0000000',
    host: 'Zara'
  };
  // short ref prefix from the name's initials, e.g. "Impression Jewelry" -> "IJ"
  BIZ.refPrefix = (BIZ.name.split(/\s+/).map(function (w) { return w.charAt(0); }).filter(function (c) { return /[A-Za-z]/.test(c); }).join('').slice(0, 2).toUpperCase()) || 'IJ';

  /* apply personalization to the page */
  function personalize() {
    document.querySelectorAll('[data-biz="name"]').forEach(function (el) { el.textContent = BIZ.name; });
    document.querySelectorAll('[data-biz="tagline"]').forEach(function (el) { el.textContent = BIZ.tagline; });
    document.querySelectorAll('[data-biz="city"]').forEach(function (el) { el.textContent = BIZ.city; });
    document.querySelectorAll('[data-biz="address"]').forEach(function (el) { el.textContent = BIZ.address; });
    document.querySelectorAll('[data-biz="phone"]').forEach(function (el) { el.textContent = BIZ.phone; });
    document.querySelectorAll('[data-biz="host"]').forEach(function (el) { el.textContent = BIZ.host; });
    document.querySelectorAll('[data-biz="host-initial"]').forEach(function (el) { el.textContent = BIZ.host.charAt(0); });
    document.title = BIZ.name + ' — ' + BIZ.tagline + ' | ' + BIZ.city;
  }
  /* ---------- deep personalization: ?services= ?hours= ----------
     services: pipe-separated REAL service names -> rendered into the services grid (max 8).
     hours: pipe-separated "Day(s): time" pairs -> rendered into the hours table (max 6).
     Graceful fallback: the page keeps its built-in fictional content when a param is absent. */
  function dpEsc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function deepPersonalize() {
    var svc = qs.get('services');
    if (svc) {
      var items = svc.split('|').map(function (s) { return s.trim(); }).filter(function (s) { return s; }).slice(0, 8);
      var grid = document.querySelector('#services .menu-grid, #menu .menu-grid, #rooms .menu-grid, #practice .menu-grid, #services .cards');
      if (grid && items.length) {
        var isCards = grid.classList.contains('cards');
        grid.innerHTML = items.map(function (name) {
          var n = dpEsc(name);
          if (isCards) {
            return '<div class="card"><div class="ico">&#10003;</div><h3>' + n + '</h3>' +
              '<p>Offered at ' + dpEsc(BIZ.name) + ' &mdash; chat below for details &amp; pricing.</p></div>';
          }
          return '<div class="menu-card"><div class="cat">Service</div><h3>' + n + '</h3>' +
            '<p>Offered at ' + dpEsc(BIZ.name) + ' &mdash; ask ' + dpEsc(BIZ.host) + ' below for details &amp; pricing.</p></div>';
        }).join('');
      }
    }
    var hrs = qs.get('hours');
    if (hrs) {
      var rows = hrs.split('|').map(function (s) { return s.trim(); }).filter(function (s) { return s; }).slice(0, 6);
      var table = document.querySelector('table.hours') || document.querySelector('#visit table');
      if (table && rows.length) {
        var chatCell = null;
        Array.prototype.forEach.call(table.rows, function (r) {
          if (/chat/i.test(r.textContent) && r.cells[1]) chatCell = r.cells[1].innerHTML;
        });
        var html = rows.map(function (r) {
          var i = r.indexOf(':');
          var day = (i > 0 ? r.slice(0, i) : r).trim();
          var time = (i > 0 ? r.slice(i + 1) : '').trim();
          return '<tr><td>' + dpEsc(day) + '</td><td>' + dpEsc(time) + '</td></tr>';
        }).join('');
        if (chatCell) html += '<tr><td>Chat with ' + dpEsc(BIZ.host) + '</td><td>' + chatCell + '</td></tr>';
        table.innerHTML = html;
      }
    }
  }


  /* ---------- dom ---------- */
  var panel, msgs, chipsBox, input, bubble, unread, closeBtn;
  var opened = false, autoOpened = false, greeted = false;

  /* conversation state */
  var S = {
    mode: 'idle',          // idle | booking | afterhours | review
    step: 0,
    booking: {},
    ah: {},
    lastTopic: null
  };

  function $(id) { return document.getElementById(id); }

  function delay(ms) {
    return new Promise(function (res) { setTimeout(res, FAST ? 0 : ms); });
  }

  function scrollDown() { msgs.scrollTop = msgs.scrollHeight; }

  function el(tag, cls, html) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (html !== undefined) d.innerHTML = html;
    return d;
  }

  /* ---------- rendering ---------- */
  function addUser(text) {
    var row = el('div', 'mrow user');
    row.appendChild(el('div', 'bubble', escapeHtml(text)));
    msgs.appendChild(row); scrollDown();
  }

  function addBot(html, opts) {
    var row = el('div', 'mrow bot');
    row.appendChild(el('div', 'mavatar', BIZ.host.charAt(0)));
    var b = el('div', 'bubble', html);
    row.appendChild(b);
    msgs.appendChild(row);
    if (opts && opts.notice) b.classList.add('notice');
    scrollDown();
    return b;
  }

  function addNotice(html) {
    var row = el('div', 'mrow bot');
    row.appendChild(el('div', 'notice', html));
    row.style.maxWidth = '100%';
    msgs.appendChild(row); scrollDown();
  }

  function addDashCard(rows) {
    var row = el('div', 'mrow bot');
    var card = el('div', 'dashcard');
    card.appendChild(el('div', 'dl-head', '&#128203; Saved to your dashboard'));
    rows.forEach(function (r) {
      card.appendChild(el('div', 'dl-row', '<span>' + r[0] + ':</span> <b>' + escapeHtml(r[1]) + '</b>'));
    });
    row.appendChild(card);
    row.style.maxWidth = '100%';
    msgs.appendChild(row); scrollDown();
  }

  function showTyping() {
    var row = el('div', 'mrow bot', '');
    row.id = 'maya-typing-row';
    row.appendChild(el('div', 'mavatar', BIZ.host.charAt(0)));
    var b = el('div', 'bubble typing', '<i></i><i></i><i></i>');
    row.appendChild(b);
    msgs.appendChild(row); scrollDown();
  }
  function hideTyping() {
    var t = $('maya-typing-row');
    if (t) t.remove();
  }

  function setChips(list) {
    chipsBox.innerHTML = '';
    (list || []).forEach(function (c) {
      var btn = el('button', 'chip', c.label);
      btn.type = 'button';
      btn.addEventListener('click', function () { userSays(c.value || c.label, c.silent); });
      chipsBox.appendChild(btn);
    });
    scrollDown();
  }

  function showStars() {
    chipsBox.innerHTML = '';
    var wrap = el('div', 'stars-row');
    for (var i = 1; i <= 5; i++) {
      (function (n) {
        var s = el('button', 'star-btn', '&#11088;');
        s.type = 'button';
        s.setAttribute('aria-label', n + ' star' + (n > 1 ? 's' : ''));
        s.addEventListener('click', function () { pickStars(n); });
        wrap.appendChild(s);
      })(i);
    }
    chipsBox.appendChild(wrap);
    scrollDown();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------- bot speech ---------- */
  function say(html, chips, opts) {
    showTyping();
    var wait = Math.min(700 + html.length * 6, 1900);
    return delay(wait).then(function () {
      hideTyping();
      addBot(html);
      setChips(chips);
    });
  }

  function sayMany(items) {
    // items: [{html, chips, notice, dash}]
    var p = Promise.resolve();
    items.forEach(function (it) {
      p = p.then(function () {
        showTyping();
        var wait = Math.min(600 + (it.html || '').length * 5, 1700);
        return delay(wait).then(function () {
          hideTyping();
          if (it.dash) { addDashCard(it.dash); }
          else if (it.notice) { addNotice(it.html); }
          else { addBot(it.html); }
          setChips(it.chips);
        });
      });
    });
    return p;
  }

  /* ---------- helpers ---------- */
  function makeRef() {
    var chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    var r = '';
    for (var i = 0; i < 5; i++) r += chars.charAt(Math.floor(Math.random() * chars.length));
    return BIZ.refPrefix + '-' + r;
  }

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  /* word-start keyword match (proven 2026-10-03 standard): "anywhere" must not
     trigger the location branch via "where", "foreclosure" must not trip hours
     via "close", "separate my bills" must not trip review via "rate", "recall
     our chat" must not trip the human branch via "call". Prefix keywords like
     'schedul'/'appoint' still match 'schedule'/'appointment'; phrases keep
     word-start match. */
  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function has(t) {
    var words = Array.prototype.slice.call(arguments, 1);
    return words.some(function (w) {
      return new RegExp('(^|[^a-z])' + escRe(w)).test(t);
    });
  }

  /* Simulated owner dashboard: leads persist in the browser (localStorage).
     A real client build syncs these to the boutique's CRM / order system. */
  var LEAD_KEY = 'nmc_jewelry_leads';
  var leads = [];
  try { leads = JSON.parse(localStorage.getItem(LEAD_KEY) || '[]'); } catch (e) { leads = []; }
  function saveLead(l) {
    l.at = new Date().toISOString(); l.biz = BIZ.name;
    leads.push(l);
    try { localStorage.setItem(LEAD_KEY, JSON.stringify(leads)); } catch (e) {}
  }

  /* ---------- intent answers ---------- */
  function hoursHtml() {
    return '<b>Visit &amp; shop:</b><br>Our online boutique is open <b>24/7</b> &mdash; worldwide shipping.<br>' +
      'Private appointments: Mon&ndash;Sat &middot; 11 AM &ndash; 8 PM<br>Sunday &middot; closed<br><br>' +
      'Bridal season slots go fast &mdash; want me to <b>hold one for you</b>?';
  }

  function servicesHtml() {
    return 'Gold-plated luxury, made to be worn forever. &#128141;<br><br>' +
      '<b>Most loved:</b><br>&middot; Bridal sets &mdash; from <b>Rs 12,999</b><br>' +
      '&middot; Engagement rings &mdash; from <b>Rs 4,999</b><br>' +
      '&middot; Gold-plated necklaces &mdash; from <b>Rs 5,999</b><br>' +
      '&middot; Earrings &mdash; from <b>Rs 2,499</b><br>' +
      '&middot; Custom designs &mdash; from <b>Rs 7,999</b><br><br>' +
      'Every piece ships <b>worldwide</b>, and styling consults are <b>free</b>. What are you dreaming of?';
  }

  function ringsHtml() {
    return 'Our <b>engagement rings from Rs 4,999</b> &mdash; gold-plated, hand-finished, and made to photograph beautifully. &#128141;<br><br>' +
      'Every ring comes with <b>free resizing guidance</b> and worldwide insured shipping. Shall I help you pick one?';
  }

  function necklaceHtml() {
    return 'Necklaces are our signature. &#10024;<br><br>' +
      '&middot; Gold-plated necklaces &amp; pendants &mdash; from <b>Rs 5,999</b><br>' +
      '&middot; Bridal necklace sets &mdash; from <b>Rs 12,999</b><br>' +
      '&middot; Everyday delicate chains &mdash; from <b>Rs 3,999</b><br><br>' +
      'All <b>gold-plated</b>, tarnish-resistant, and shipped worldwide. Want help choosing?';
  }

  function earringsHtml() {
    return 'Earrings from <b>Rs 2,499</b> &mdash; jhumkas, studs, and chandbalis in gold plate that <b>never look dull</b> in photos. &#10024;<br><br>' +
      'Lightweight enough for all-day wear. Want me to show you the bridal pairs?';
  }

  function customHtml() {
    return 'Dream it, we&rsquo;ll craft it. &#127912;<br><br>' +
      '<b>Custom designs from Rs 7,999</b> &mdash; send a reference photo or describe your vision, and our artisans make it in gold plate, just for you.<br><br>' +
      'Free design consultation included. Want to start your custom piece?';
  }

  function shippingHtml() {
    return 'We ship <b>worldwide</b> &mdash; insured, tracked, and packed like the treasure it is. &#128230;<br><br>' +
      '&middot; Pakistan: 2&ndash;4 working days<br>' +
      '&middot; International: 7&ndash;12 working days<br>' +
      '&middot; <b>FREE shipping on orders over Rs 25,000</b><br><br>' +
      'Every parcel is insured door-to-door. Ready to order?';
  }

  function bridalHtml() {
    return 'Bridal is our specialty. &#128141;<br><br>' +
      '<b>Bridal sets from Rs 12,999</b>: necklace, earrings, maang tikka &amp; bangles &mdash; a complete look, styled by Kiran Rajput herself.<br><br>' +
      'Bridal season books out months ahead. Want a <b>free styling consultation</b> to start planning?';
  }

  function consultHtml() {
    return 'Yes &mdash; <b>styling consults are always free</b>. &#129309;<br><br>' +
      'You&rsquo;ll talk through your occasion, skin tone and budget with a real consultant, and leave with an honest shortlist and exact pricing &mdash; <b>zero pressure, zero charge</b>. Shall I book yours?';
  }

  function defaultChips() {
    return [
      { label: '&#128141; Our collection' },
      { label: '&#128197; Book a styling appointment' },
      { label: '&#127769; After-hours demo' },
      { label: '&#11088; Rate your experience' }
    ];
  }

  function greet() {
    greeted = true;
    return say(
      'Welcome to Impression Jewelry! I\'m <b>' + escapeHtml(BIZ.host) + '</b>, your jewelry concierge. &#128141;<br><br>' +
      'Ask me about <b>bridal sets</b>, <b>rings</b>, <b>necklaces</b> or <b>custom designs</b> &mdash; or I can <b>book your styling appointment</b> right now. What can I help with?',
      defaultChips()
    );
  }

  /* ---------- flows ---------- */
  var REASONS = ['Bridal set', 'Engagement ring', 'Necklace', 'Custom design', 'Styling appointment'];

  function startBooking() {
    S.mode = 'booking'; S.step = 0; S.booking = {};
    return say('Wonderful &mdash; let\'s find your perfect piece. <b>What are you looking for?</b>',
      REASONS.map(function (r) { return { label: r }; }));
  }

  function bookingStep(text) {
    var t = text.toLowerCase().trim();
    if (S.step === 0) {
      /* word-start reason detection (house standard) — no indexOf loop */
      var reason = 'Styling appointment';
      if (has(t, 'bridal', 'wedding', 'bride', 'shaadi')) reason = 'Bridal set';
      if (has(t, 'ring', 'engagement', 'solitaire')) reason = 'Engagement ring';
      if (has(t, 'necklace', 'pendant', 'chain', 'haar')) reason = 'Necklace';
      if (has(t, 'earring', 'jhumka', 'studs', 'chandbali')) reason = 'Earrings';
      if (has(t, 'custom', 'design', 'made to order', 'bespoke')) reason = 'Custom design';
      if (has(t, 'bangle', 'bracelet', 'kara')) reason = 'Bangles';
      if (has(t, 'tikka', 'matha patti', 'headpiece')) reason = 'Maang tikka';
      S.booking.reason = reason; S.step = 1;
      return say('<b>' + escapeHtml(reason) + '</b> &mdash; excellent choice. <b>Your name</b> for the appointment?');
    }
    if (S.step === 1) {
      var name = text.trim();
      if (name.length < 2 || name.length > 40) {
        return say('And your <b>name</b> for the appointment?');
      }
      S.booking.name = name; S.step = 2;
      return say('Lovely to meet you, ' + escapeHtml(cap(name.split(' ')[0])) +
        '! Want a <b>text reminder</b> before your visit? Drop your number &mdash; or skip it.',
        [{ label: 'Skip', value: 'skip' }]);
    }
    if (S.step === 2) {
      var digits = t.replace(/\D/g, '');
      // FIXED validation: digit-less text like "notaphone" must be rejected
      if (t !== 'skip' && digits.length < 7) {
        return say('Hmm, that doesn\'t look like a complete number &mdash; mind double-checking it? <i>(or tap Skip)</i>',
          [{ label: 'Skip', value: 'skip' }]);
      }
      if (t !== 'skip') S.booking.phone = text.trim();
      S.step = 3;
      return say('<b>Which day</b> works best for you?',
        [{ label: 'Tomorrow' }, { label: 'Thursday' }, { label: 'Friday' }, { label: 'Saturday' }]);
    }
    if (S.step === 3) {
      var day = 'Friday';
      if (has(t, 'tomorrow', 'today')) day = 'Tomorrow';
      else {
        var dm = t.match(/monday|tuesday|wednesday|thursday|friday|saturday|sunday/);
        if (dm) day = cap(dm[0]);
      }
      S.booking.day = day; S.step = 4;
      return say('<b>' + escapeHtml(day) + '</b> &mdash; perfect. <b>Morning or afternoon</b> &mdash; what time suits you?',
        [{ label: '10:00 AM' }, { label: '12:30 PM' }, { label: '3:00 PM' }, { label: '5:30 PM' }]);
    }
    if (S.step === 4) {
      var tm = t.match(/\d{1,2}(:\d{2})?\s*(am|pm)?/);
      if (!tm) {
        return say('What <b>time</b> should I hold for you? <i>(e.g. 3:00 PM)</i>',
          [{ label: '10:00 AM' }, { label: '3:00 PM' }, { label: '5:30 PM' }]);
      }
      var time = text.trim();
      if (!/am|pm/i.test(time)) time += ' PM';
      var ref = makeRef();
      S.booking.ref = ref;
      var line = '<b>&#9989; You\'re booked!</b><br><br><b>' +
        escapeHtml(S.booking.reason) + '</b> &middot; ' + escapeHtml(S.booking.day) + ' at <b>' + escapeHtml(time) + '</b><br>Guest: <b>' + escapeHtml(S.booking.name) + '</b><br>' +
        'Reference: <span class="ref">' + ref + '</span><br><br>';
      if (S.booking.phone) line += 'We\'ll text your reminder. ';
      line += 'We\'ll confirm on WhatsApp shortly &mdash; worldwide shipping available on every order. Anything else I can help with?';
      S.mode = 'idle'; S.step = 0;
      return say(line, [{ label: '&#128141; Our collection' }, { label: '&#128336; Hours & location' }]);
    }
  }

  function startAfterHours() {
    S.mode = 'afterhours'; S.step = 0; S.ah = {};
    return sayMany([
      {
        notice: true,
        html: '&#127769; <b>It\'s 11:42 PM</b> &mdash; our team is asleep right now, but I\'m ' + escapeHtml(BIZ.host) +
          ', your jewelry concierge, and I\'m still here. <b>Midnight sparkle emergencies don\'t keep office hours.</b>'
      },
      { html: 'Tell me your <b>name</b> and I\'ll make sure the morning team reaches out first thing &mdash; <b>bridal season slots go fast</b>.' }
    ]);
  }

  function afterHoursStep(text) {
    var t = text.trim();
    if (S.step === 0) {
      if (t.length < 2 || t.length > 40 || /\d/.test(t)) {
        return say('What <b>name</b> should I save this under?');
      }
      S.ah.name = t; S.step = 1;
      return say('Thanks, ' + escapeHtml(cap(t.split(' ')[0])) + '! And the best <b>number</b> for the morning team to reach you?');
    }
    if (S.step === 1) {
      var digits = t.replace(/\D/g, '');
      // FIXED validation: digit-less text like "notaphone" must be rejected
      if (digits.length < 7) {
        return say('Hmm, that doesn\'t look like a complete number &mdash; mind double-checking it? <i>(digits only is fine)</i>');
      }
      S.ah.phone = t; S.step = 2;
      return say('Got it. And just between us &mdash; <b>what\'s on your wishlist?</b>',
        [{ label: 'Bridal set', value: 'Bridal set' }, { label: 'Ring', value: 'Ring' }, { label: 'Necklace', value: 'Necklace' }, { label: 'Skip', value: 'skip' }]);
    }
    if (S.step === 2) {
      S.ah.goal = (t === 'skip') ? 'General inquiry' : t;
      S.mode = 'idle'; S.step = 0;
      saveLead({
        name: S.ah.name,
        phone: S.ah.phone,
        goal: S.ah.goal,
        captured: '11:42 PM (after hours)',
        source: 'after-hours demo'
      });
      return sayMany([
        { html: '<b>&#9989; Saved!</b> The morning team will reach out <b>first thing</b> &mdash; bridal season slots go fast, and now you&rsquo;re first in line. No need to wonder till 9 AM if anyone saw your message.' },
        {
          dash: [
            ['New lead', S.ah.name],
            ['Phone', S.ah.phone],
            ['Wishlist', S.ah.goal],
            ['Captured', '11:42 PM (after hours)']
          ]
        },
        {
          html: 'That\'s the whole point &mdash; <b>every midnight necklace question becomes a morning order</b>, not a sale lost to a competitor. Anything else tonight?',
          chips: defaultChips()
        }
      ]);
    }
  }

  function startReview() {
    S.mode = 'review'; S.step = 0;
    return say('We\'d love to hear it &mdash; <b>how was your experience?</b> Tap the stars:').then(function () {
      showStars();
    });
  }

  function pickStars(n) {
    chipsBox.innerHTML = '';
    addUser('\u2B50'.repeat(n));
    if (n === 5) {
      S.mode = 'idle';
      say('You just made our whole team shine! &#128525;<br><br>Would you <b>share that on Google</b>? It genuinely keeps a boutique like ours thriving.',
        [{ label: 'Not now', value: 'not now' }]).then(function () {
          var row = document.querySelector('#maya-msgs .mrow.bot:last-child .bubble');
          if (row) {
            var a = document.createElement('a');
            a.className = 'gbtn'; a.href = 'https://www.google.com/maps'; a.target = '_blank'; a.rel = 'noopener';
            a.textContent = '\u2B50 Leave a Google review';
            row.appendChild(document.createElement('br'));
            row.appendChild(a); scrollDown();
          }
        });
    } else {
      S.mode = 'review'; S.step = 1;
      say('Thank you for being honest &mdash; that\'s how we get better. <b>What could we do better</b> next time?');
    }
  }

  function reviewStep(text) {
    S.mode = 'idle'; S.step = 0;
    /* 1-4 star feedback is private — persisted as a lead, like the dental/med-spa standard */
    saveLead({ name: '(review feedback)', phone: '\u2014', topic: 'Private feedback', details: text.trim(), source: 'review routing' });
    return say('<b>Noted &mdash; truly.</b> Our store manager will personally follow up on this.<br><br>' +
      'We\'d love a second chance to earn those last stars. Can I book you a free styling consult?',
      [{ label: '&#128197; Book a styling appointment' }, { label: 'No thanks', value: 'no thanks' }]);
  }

  /* ---------- main router ---------- */
  function route(text) {
    var t = text.toLowerCase().trim();

    if (S.mode === 'booking') return bookingStep(text);
    if (S.mode === 'afterhours') return afterHoursStep(text);
    if (S.mode === 'review' && S.step === 1) return reviewStep(text);

    if (has(t, 'book', 'appoint', 'schedul', 'order')) return startBooking();
    if (has(t, 'after hour', 'after-hour', 'closed', 'late night', 'midnight', '11:42')) return startAfterHours();
    if (has(t, 'review', 'rate', 'stars', 'feedback')) return startReview();
    if (has(t, 'bridal', 'bride', 'wedding', 'shaadi')) return say(bridalHtml(), [{ label: '&#128197; Book a styling appointment' }]);
    if (has(t, 'ring', 'engagement', 'solitaire')) return say(ringsHtml(), [{ label: '&#128197; Book a styling appointment' }]);
    if (has(t, 'necklace', 'pendant', 'chain', 'haar')) return say(necklaceHtml(), [{ label: '&#128197; Book a styling appointment' }]);
    if (has(t, 'earring', 'jhumka', 'studs', 'chandbali')) return say(earringsHtml(), [{ label: '&#128197; Book a styling appointment' }]);
    if (has(t, 'custom', 'design', 'made to order', 'bespoke')) return say(customHtml(), [{ label: '&#128197; Book a styling appointment' }]);
    if (has(t, 'bangle', 'bracelet', 'kara')) return say('Bangles &amp; bracelets from <b>Rs 3,499</b> &mdash; stackable gold-plated sets that jingle just right. &#10024;<br><br>Free styling consult included. Want help picking a stack?', [{ label: '&#128197; Book a styling appointment' }]);
    if (has(t, 'tikka', 'matha patti', 'headpiece')) return say('Maang tikka &amp; matha patti from <b>Rs 2,999</b> &mdash; the finishing touch every bridal look deserves. &#128141;<br><br>Pairs beautifully with our bridal sets. Want a free styling consult?', [{ label: '&#128197; Book a styling appointment' }]);
    if (has(t, 'ship', 'deliver', 'courier', 'worldwide', 'dispatch')) return say(shippingHtml(), [{ label: '&#128197; Book a styling appointment' }]);
    if (has(t, 'gold', 'plated', 'replica', 'tarnish', 'allergy', 'nickel')) return say('Every piece is <b>gold-plated</b> &mdash; tarnish-resistant, nickel-safe, and finished by hand. &#10024;<br><br>It looks and feels like fine jewelry, at a fraction of the price. Want to browse the collection?', [{ label: '&#128141; Our collection' }]);
    if (has(t, 'consult', 'styling appointment', 'appointment')) return say(consultHtml(), [{ label: '&#128197; Book a styling appointment' }]);
    /* location branch runs before service branches (house standard) */
    if (has(t, 'where', 'address', 'location', 'direction', 'park', 'find you')) {
      return say('We\'re based in <b>' + escapeHtml(BIZ.city) + '</b> &mdash; private appointments &amp; online orders, shipped <b>worldwide</b>. &#128205;<br><br>WhatsApp us anytime: <b>' + escapeHtml(BIZ.phone) + '</b>',
        [{ label: '&#128197; Book a styling appointment' }]);
    }
    if (has(t, 'hour', 'open', 'close', 'when do you', 'what time')) return say(hoursHtml(), [{ label: '&#128197; Book an appointment' }]);
    if (has(t, 'service', 'offer', 'do you do', 'price list', 'menu', 'collection')) return say(servicesHtml(), [{ label: '&#128197; Book a styling appointment' }]);
    if (has(t, 'price', 'cost', 'how much', 'expensive', 'cheap', '$$', 'fee', 'rate')) return say('Honest pricing, in writing: bridal sets from <b>Rs 12,999</b>, engagement rings from <b>Rs 4,999</b>, necklaces from <b>Rs 5,999</b>, earrings from <b>Rs 2,499</b>, custom designs from <b>Rs 7,999</b>. Styling consults are <b>always free</b>. &#128141;', [{ label: '&#128141; Our collection' }]);
    if (has(t, 'human', 'person', 'real person', 'call you', 'phone number', 'speak to', 'consultant', 'kiran')) return say('Of course &mdash; WhatsApp us at <b>' + escapeHtml(BIZ.phone) + '</b> and a real human replies during boutique hours. But honestly? I can handle <b>orders, appointments, and pricing</b> right here, even at 2 AM. &#128521;', defaultChips());
    if (has(t, 'thank', 'thanks', 'thx', 'great', 'awesome', 'perfect')) return say('Anytime! That\'s what I\'m here for. &#10024;', defaultChips());
    if (has(t, 'bye', 'goodbye', 'see you', 'later', 'khuda hafiz', 'allah hafiz')) { S.mode = 'idle'; return say('Stay radiant &mdash; see you soon at ' + escapeHtml(BIZ.name) + '! &#128141;'); }
    if (/\b(hi+|hello|hey+|hola|yo|assalam|aoa|salam)\b/.test(t) || has(t, 'good morning', 'good evening')) return say('Welcome! &#128075; What can I do for you &mdash; <b>bridal sets</b>, <b>rings</b>, <b>necklaces</b>, or shall I <b>book your styling appointment</b>?', defaultChips());
    if (has(t, 'no thanks', 'not now', 'nope', "i'm good", 'im good')) { S.mode = 'idle'; return say('No worries at all! I\'m here whenever you need me. &#10024;', defaultChips()); }

    /* graceful fallback — never dead-ends */
    S.lastTopic = text;
    return say('Great question &mdash; let me have the team confirm that for you. &#128172;<br><br>Meanwhile, can I help with a <b>styling appointment</b>, our <b>collection</b>, or <b>pricing</b>?',
      [{ label: '&#128197; Book a styling appointment' }, { label: '&#128141; Our collection' }, { label: '&#128336; Hours & location' }]);
  }

  function userSays(text, silent) {
    if (!text || !text.trim()) return Promise.resolve();
    text = text.trim();
    setChips([]);
    if (!silent) addUser(text);
    return route(text);
  }

  /* ---------- open / close ---------- */
  function openPanel(silent) {
    opened = true;
    panel.classList.add('open');
    bubble.classList.add('hidden');
    unread.classList.add('hidden');
    if (!greeted && !silent) greet();
  }
  function closePanel() {
    opened = false;
    panel.classList.remove('open');
    bubble.classList.remove('hidden');
  }

  function init() {
    panel = $('maya-panel'); msgs = $('maya-msgs'); chipsBox = $('maya-chips');
    input = $('maya-input'); bubble = $('maya-bubble'); unread = $('maya-unread'); closeBtn = $('maya-close');
    personalize();
    deepPersonalize();

    /* bubble click greets normally; hero CTA passes silent=true to skip straight to booking */
    bubble.addEventListener('click', function () { openPanel(); });
    closeBtn.addEventListener('click', closePanel);
    $('maya-send').addEventListener('click', function () { userSays(input.value); input.value = ''; input.focus(); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { userSays(input.value); input.value = ''; }
    });

    /* hero CTA opens widget straight into booking */
    document.querySelectorAll('[data-action="book"]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.preventDefault();
        openPanel(true); /* silent: goes straight to booking, no greeting */
        setTimeout(function () { if (S.mode === 'idle') startBooking(); }, FAST ? 50 : 600);
      });
    });

    /* proactive nudge — once, ~8s in */
    setTimeout(function () {
      if (!opened && !autoOpened) {
        autoOpened = true;
        unread.classList.remove('hidden');
        bubble.classList.add('hidden');
        panel.classList.add('open');
        opened = true;
        if (!greeted) greet();
      }
    }, FAST ? 600 : 8000);

    /* test hooks */
    window.__maya = {
      BIZ: BIZ, S: S,
      send: function (t) { openPanel(); return userSays(t); },
      open: openPanel, close: closePanel,
      pickStars: pickStars,
      getLeads: function () { return leads; },
      clearLeads: function () { leads = []; try { localStorage.removeItem(LEAD_KEY); } catch (e) {} }
    };
    window.__getLeads = function () { return leads; };
    window.__clearLeads = function () { leads = []; try { localStorage.removeItem(LEAD_KEY); } catch (e) {} };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
