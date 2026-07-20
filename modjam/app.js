(function () {
  'use strict';

  var main = document.getElementById('main-content');
  var archiveData;
  var modderData;
  var entries = [];
  var entryById = new Map();
  var countdownTimer;

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character];
    });
  }

  function safeUrl(value) {
    if (!value) return '';
    try {
      var parsed = new URL(value, location.origin);
      return /^https?:$/.test(parsed.protocol) ? escapeHtml(parsed.href) : '';
    } catch (_error) {
      return '';
    }
  }

  function authorLinks(authors) {
    return authors.map(function (author) {
      return '<a href="/modjam/modder/' + encodeURIComponent(author.id) + '" data-route>' + escapeHtml(author.name) + '</a>';
    }).join('<span class="author-join"> &amp; </span>');
  }

  function placementBadge(entry) {
    if (!entry.placement) return '';
    return '<span class="placement placement--' + escapeHtml(entry.placement) + '">' + escapeHtml(entry.placementLabel) + '</span>';
  }

  function eventTone(event) {
    return event.season.toLowerCase();
  }

  function eventCard(event) {
    var banner = event.banner
      ? '<img src="' + escapeHtml(event.banner) + '" alt="" loading="lazy" decoding="async">'
      : '<div class="event-card-art event-card-art--' + eventTone(event) + '" aria-hidden="true"><span>' + (event.season === 'Winter' ? '❄' : event.season === 'Spring' ? '✿' : '☀') + '</span></div>';
    var themes = Array.from(new Set(event.entries.flatMap(function (entry) { return entry.themes; }))).slice(0, 3);
    return '<a class="event-card event-card--' + eventTone(event) + '" href="/modjam/archive?event=' + event.id + '" data-route>' +
      '<div class="event-card-image">' + banner + '<span class="event-stamp">' + escapeHtml(event.season) + '<strong>' + event.year + '</strong></span></div>' +
      '<div class="event-card-copy"><div><span class="eyebrow">' + escapeHtml(event.competitionLabel) + '</span><h3>' + escapeHtml(event.label) + ' Modjam</h3></div>' +
      '<p>' + event.entries.length + ' entries · ' + escapeHtml(themes.join(' · ')) + '</p>' +
      '<span class="text-link">Open the archive <span aria-hidden="true">→</span></span></div></a>';
  }

  function entryPicture(entry) {
    var pictureUrl = safeUrl(entry.pictureUrl);
    var tone = eventTone(entry.event);
    var fallback = '<span class="entry-card-picture-fallback" aria-hidden="true">M</span>';
    if (!pictureUrl) {
      return '<div class="entry-card-picture entry-card-picture--' + tone + '">' + fallback + '</div>';
    }
    return '<a class="entry-card-picture entry-card-picture--' + tone + ' entry-card-picture--loading" href="' + safeUrl(entry.url) + '" target="_blank" rel="noopener" aria-label="Open ' + escapeHtml(entry.title) + ' on Nexus Mods">' +
      fallback + '<img src="' + pictureUrl + '" alt="" loading="lazy" decoding="async">' +
      '</a>';
  }

  function entryCard(entry, options) {
    options = options || {};
    var event = entry.event;
    var awards = entry.awards.length
      ? '<div class="award-chips">' + entry.awards.map(function (award) { return '<span>' + escapeHtml(award) + '</span>'; }).join('') + '</div>'
      : '';
    var placard = entry.awardPlacardUrl
      ? '<a class="placard-link" href="' + safeUrl(entry.awardPlacardUrl) + '" target="_blank" rel="noopener">View award placard <span aria-hidden="true">↗</span></a>'
      : '';
    var eventLabel = options.hideEvent ? '' : '<a class="entry-event" href="/modjam/archive?event=' + event.id + '" data-route>' + escapeHtml(event.label) + '</a>';
    var title = entry.url
      ? '<a href="' + safeUrl(entry.url) + '" target="_blank" rel="noopener">' + escapeHtml(entry.title) + '<span class="external-mark" aria-hidden="true">↗</span></a>'
      : escapeHtml(entry.title);
    var justForFun = event.competitionType === 'just-for-fun' ? '<span class="just-for-fun">Just for fun · no ranked winner</span>' : '';
    return '<article class="entry-card">' +
      entryPicture(entry) +
      '<div class="entry-card-top">' + eventLabel + placementBadge(entry) + '</div>' +
      '<h3>' + title + '</h3>' +
      '<p class="entry-authors">by ' + authorLinks(entry.authors) + '</p>' +
      '<div class="entry-meta"><span>' + escapeHtml(entry.category) + '</span><span>' + escapeHtml(entry.themes.join(' · ')) + '</span></div>' +
      justForFun + awards + placard +
      '</article>';
  }

  function pageIntro(kicker, title, copy) {
    var eyebrow = kicker ? '<span class="eyebrow">' + escapeHtml(kicker) + '</span>' : '';
    return '<section class="page-intro">' + eyebrow + '<h1>' + escapeHtml(title) + '</h1><p>' + escapeHtml(copy) + '</p></section>';
  }

  function updateCountdown() {
    var container = document.querySelector('[data-countdown]');
    if (!container) return;
    var view = ModjamSchedule.getCountdownView(Date.now());
    var clock = view.segments.length ? '<div class="countdown-clock" role="timer" aria-label="' + escapeHtml(view.ariaLabel) + '">' + view.segments.map(function (segment) {
      return '<div><strong>' + escapeHtml(segment.value) + '</strong><span>' + escapeHtml(segment.unit) + '</span></div>';
    }).join('') + '</div>' : '';
    container.className = 'countdown-card countdown-card--' + view.mode;
    container.innerHTML = '<div class="countdown-copy"><span>' + escapeHtml(view.eyebrow) + '</span><h2>' + escapeHtml(view.title) + '</h2><p>' + escapeHtml(view.detail) + '</p></div>' + clock;
  }

  function startCountdown() {
    clearInterval(countdownTimer);
    updateCountdown();
    countdownTimer = setInterval(updateCountdown, 1000);
  }

  function renderHome() {
    var latestEvents = archiveData.events.slice().reverse();
    var awardNames = entries.flatMap(function (entry) { return entry.awards; });
    var favorites = [
      'The Gigglesnort Award',
      'Four Ancestors in a Trenchcoat Award',
      'Narco N’wah Award',
      'Lighthouse That Never Goes Out Award',
      'I Will Never Recover Award',
      '“Mom, can I get a Penguin?” Award'
    ].map(function (wanted) {
      return awardNames.find(function (award) {
        return award.toLowerCase().replace(/[“”"'’]/g, '') === wanted.toLowerCase().replace(/[“”"'’]/g, '');
      }) || wanted;
    });

    main.innerHTML = '<section class="hero">' +
      '<div class="season-side season-side--winter" aria-hidden="true"><span class="flake flake--one">❄</span><span class="flake flake--two">❅</span><span class="pine pine--one"></span><span class="pine pine--two"></span></div>' +
      '<div class="season-side season-side--summer" aria-hidden="true"><span class="sun"></span><span class="palm">🌴</span><span class="wave wave--one"></span><span class="wave wave--two"></span></div>' +
      '<div class="hero-copy"><span class="hero-kicker">A Morrowind modding tradition since 2020</span><h1>Two days.<br><em>Endless possibilities.</em></h1><p>One surprise theme. One frantic weekend. A whole new shelf of Morrowind mods.</p><a class="button button--ink" href="/modjam/archive" data-route>Explore every entry <span aria-hidden="true">→</span></a></div>' +
      '<div class="countdown-wrap"><div data-countdown></div><p class="postcard-note">Save the weekend. Themes are revealed when the jam begins.</p></div>' +
      '</section>' +
      '<section class="stat-ribbon" aria-label="Archive totals"><div><strong>' + archiveData.summary.eventCount + '</strong><span>past Modjams</span></div><div><strong>' + archiveData.summary.entryCount + '</strong><span>mods made</span></div><div><strong>' + archiveData.summary.modderCount + '</strong><span>credited modders</span></div><div><strong>' + archiveData.summary.judgeAwardCount + '</strong><span>judge awards recorded</span></div></section>' +
      '<section class="archive-section"><div class="section-heading section-heading--row"><div><h2>The Modjam archive</h2></div><a class="text-link" href="/modjam/archive" data-route>Browse all 164 entries <span aria-hidden="true">→</span></a></div><div class="event-grid">' + latestEvents.map(eventCard).join('') + '</div></section>' +
      '<section class="awards-marquee"><div class="awards-marquee-copy"><h2>Serious craft.<br>Unserious awards.</h2><p>Beginning in Summer 2022, judges started honoring the memorable details that do not fit on a scorecard.</p><a class="button button--paper" href="/modjam/awards" data-route>Visit the awards cabinet</a></div><div class="award-ribbons">' + favorites.map(function (award, index) { return '<span style="--turn:' + (index % 2 ? '1.5deg' : '-1.5deg') + '">' + escapeHtml(award) + '</span>'; }).join('') + '</div></section>' +
      '<section class="modder-callout"><div class="host-card"><a class="host-portrait" href="https://danaeplays.thenet.sk/" target="_blank" rel="noopener" aria-label="Visit Danae\'s Journal"><img src="../modathon/assets/images/avatars/1233897.webp" alt="Danae" width="100" height="100" loading="lazy" decoding="async"></a><div class="host-card-copy"><span class="eyebrow">Modjam host</span><h2>Danae</h2><p>Explore her Morrowind writing, mods, and streams.</p><nav class="host-links" aria-label="Danae online"><a href="https://danaeplays.thenet.sk/" target="_blank" rel="noopener">Website <span aria-hidden="true">↗</span></a><a href="https://www.twitch.tv/danaeplays" target="_blank" rel="noopener">Twitch <span aria-hidden="true">↗</span></a></nav></div></div><div class="modder-callout-copy"><h2>Meet the Modjammers</h2><p>Follow every creator across the ModJams.</p><a class="button button--sun" href="/modjam/modders" data-route>Browse ' + archiveData.summary.modderCount + ' profiles <span aria-hidden="true">→</span></a></div></section>';
    startCountdown();
  }

  function renderArchive() {
    var params = new URLSearchParams(location.search);
    var selectedEvent = params.get('event') || '';
    main.innerHTML = '<div class="paper-page">' + pageIntro('', 'The entry archive', 'Search every released mod, theme, category, placement, and recorded judge award.') +
      '<section class="filter-panel" aria-label="Archive filters"><label><span>Search</span><input type="search" id="entry-search" placeholder="Mod, modder, theme, award…"></label><label><span>Modjam</span><select id="event-filter"><option value="">All Modjams</option>' + archiveData.events.slice().reverse().map(function (event) { return '<option value="' + event.id + '"' + (selectedEvent === event.id ? ' selected' : '') + '>' + escapeHtml(event.label) + '</option>'; }).join('') + '</select></label><label><span>Season</span><select id="season-filter"><option value="">All seasons</option><option>Winter</option><option>Spring</option><option>Summer</option></select></label><label><span>Category</span><select id="category-filter"><option value="">All categories</option>' + archiveData.summary.categories.map(function (category) { return '<option>' + escapeHtml(category) + '</option>'; }).join('') + '</select></label><label><span>Recognition</span><select id="result-filter"><option value="">Everything</option><option value="placements">Placed entries</option><option value="awards">Judge award recipients</option><option value="placards">Award placards</option><option value="just-for-fun">Just-for-fun entries</option></select></label><button class="clear-button" type="button" id="clear-filters">Clear</button></section>' +
      '<div class="results-heading"><p id="entry-count" aria-live="polite"></p><div class="legend"><span class="legend-winter">Winter</span><span class="legend-spring">Spring</span><span class="legend-summer">Summer</span></div></div><section class="entry-grid" id="entry-results"></section></div>';

    var controls = ['entry-search', 'event-filter', 'season-filter', 'category-filter', 'result-filter'].map(function (id) { return document.getElementById(id); });
    function update() {
      var query = controls[0].value.trim().toLowerCase();
      var eventValue = controls[1].value;
      var season = controls[2].value;
      var category = controls[3].value;
      var result = controls[4].value;
      var matches = entries.filter(function (entry) {
        var haystack = [entry.title, entry.category, entry.event.label].concat(entry.themes, entry.awards, entry.authors.map(function (author) { return author.name; })).join(' ').toLowerCase();
        if (query && !haystack.includes(query)) return false;
        if (eventValue && entry.event.id !== eventValue) return false;
        if (season && entry.event.season !== season) return false;
        if (category && entry.category !== category) return false;
        if (result === 'placements' && !entry.placement) return false;
        if (result === 'awards' && !entry.awards.length) return false;
        if (result === 'placards' && !entry.awardPlacardUrl) return false;
        if (result === 'just-for-fun' && entry.event.competitionType !== 'just-for-fun') return false;
        return true;
      });
      document.getElementById('entry-count').innerHTML = '<strong>' + matches.length + '</strong> ' + (matches.length === 1 ? 'entry' : 'entries') + ' found';
      document.getElementById('entry-results').innerHTML = matches.length ? matches.map(entryCard).join('') : '<div class="empty-state"><strong>No entries found.</strong><span>Try a broader search or clear the filters.</span></div>';
    }
    controls.forEach(function (control) { control.addEventListener(control.type === 'search' ? 'input' : 'change', update); });
    document.getElementById('clear-filters').addEventListener('click', function () { controls.forEach(function (control) { control.value = ''; }); update(); });
    update();
  }

  function modderAvatar(modder, large) {
    if (modder.avatarUrl) return '<img class="modder-avatar' + (large ? ' modder-avatar--large' : '') + '" src="' + safeUrl(modder.avatarUrl) + '" alt="" loading="lazy" referrerpolicy="no-referrer">';
    var initials = modder.name.split(/\s+/).map(function (piece) { return piece[0]; }).join('').slice(0, 2).toUpperCase();
    return '<span class="modder-avatar modder-avatar--fallback' + (large ? ' modder-avatar--large' : '') + '" aria-hidden="true">' + escapeHtml(initials) + '</span>';
  }

  function modderCard(modder) {
    return '<a class="modder-card" href="/modjam/modder/' + encodeURIComponent(modder.id) + '" data-route>' +
      modderAvatar(modder, false) + '<div class="modder-card-copy"><h3>' + escapeHtml(modder.name) + '</h3><p>Since ' + escapeHtml(modder.firstModjam) + '</p><div><span><strong>' + modder.entryIds.length + '</strong> entries</span><span><strong>' + modder.placementEntryIds.length + '</strong> placements</span><span><strong>' + modder.awardCount + '</strong> awards</span></div></div><span class="round-arrow" aria-hidden="true">→</span></a>';
  }

  function modjamPassport(modder) {
    var turns = [-7, 4, -3, 8, -5, 3, -8, 6, -2];
    var passportEvents = modder.participations.map(function (label) {
      return archiveData.events.find(function (event) { return event.label === label; });
    }).filter(Boolean);
    var stamps = passportEvents.map(function (event, index) {
      return '<a class="passport-stamp passport-stamp--' + eventTone(event) + '" href="/modjam/archive?event=' + event.id + '" data-route style="--stamp-turn:' + turns[index % turns.length] + 'deg" aria-label="Open the ' + escapeHtml(event.label) + ' Modjam archive">' +
        '<span>' + escapeHtml(event.season) + '</span><strong>' + event.year + '</strong><small>Modjam</small></a>';
    }).join('');

    return '<section class="passport-section" aria-labelledby="passport-heading"><div class="section-heading passport-heading"><span class="eyebrow">Official record</span><h2 id="passport-heading">Modjam passport</h2><p>Every stamp marks a weekend this modder joined the jam. Select one to revisit its entries.</p></div>' +
      '<div class="passport-scroll" tabindex="0" aria-label="Scrollable Modjam passport for ' + escapeHtml(modder.name) + '"><div class="passport-book">' +
      '<img class="passport-art" src="assets/images/modjam_passport.webp" alt="" width="2880" height="1440" decoding="async">' +
      '<div class="passport-identity"><div class="passport-wordmark"><span>Morrowind Modjam</span><strong>Passport</strong></div><div class="passport-holder"><div class="passport-photo">' + modderAvatar(modder, false) + '</div><div class="passport-details"><span>Passport holder</span><strong>' + escapeHtml(modder.name) + '</strong><dl><div><dt>First stamp</dt><dd>' + escapeHtml(modder.firstModjam) + '</dd></div><div><dt>Stamps</dt><dd>' + passportEvents.length + '</dd></div></dl></div></div></div>' +
      '<div class="passport-stamps"><span class="passport-stamps-title">Entry visas</span><div class="passport-stamp-grid">' + stamps + '</div></div>' +
      '</div></div><p class="passport-mobile-hint">Swipe to explore the full passport</p></section>';
  }

  function renderModders() {
    main.innerHTML = '<div class="paper-page">' + pageIntro('', 'The Modjammers', 'Browse every ModJam creator.') +
      '<section class="modder-toolbar"><label><span>Find a modder</span><input id="modder-search" type="search" placeholder="Search by name…"></label><label><span>Sort by</span><select id="modder-sort"><option value="entries">Most entries</option><option value="events">Most Modjams</option><option value="awards">Most awards</option><option value="name">Name A–Z</option></select></label><p id="modder-count" aria-live="polite"></p></section><section class="modder-grid" id="modder-results"></section></div>';
    var search = document.getElementById('modder-search');
    var sort = document.getElementById('modder-sort');
    function update() {
      var query = search.value.trim().toLowerCase();
      var matches = modderData.modders.filter(function (modder) { return modder.name.toLowerCase().includes(query); });
      matches.sort(function (left, right) {
        if (sort.value === 'name') return left.name.localeCompare(right.name);
        if (sort.value === 'events') return right.participations.length - left.participations.length || left.name.localeCompare(right.name);
        if (sort.value === 'awards') return right.awardCount - left.awardCount || right.entryIds.length - left.entryIds.length;
        return right.entryIds.length - left.entryIds.length || left.name.localeCompare(right.name);
      });
      document.getElementById('modder-count').textContent = matches.length + (matches.length === 1 ? ' profile' : ' profiles');
      document.getElementById('modder-results').innerHTML = matches.map(modderCard).join('');
    }
    search.addEventListener('input', update);
    sort.addEventListener('change', update);
    update();
  }

  function renderProfile(id) {
    var modder = modderData.modders.find(function (candidate) { return candidate.id === id; });
    if (!modder) {
      main.innerHTML = '<div class="paper-page"><div class="empty-state empty-state--page"><strong>That modder is not in the archive.</strong><a class="button button--ink" href="/modjam/modders" data-route>Browse all modders</a></div></div>';
      return;
    }
    var work = modder.entryIds.map(function (entryId) { return entryById.get(entryId); }).filter(Boolean).sort(function (a, b) { return b.event.year - a.event.year; });
    var recognized = work.filter(function (entry) { return entry.placement || entry.awards.length; });
    var links = [
      modder.nexusProfileUrl && '<a href="' + safeUrl(modder.nexusProfileUrl) + '" target="_blank" rel="noopener">Nexus Mods ↗</a>',
      modder.modathonProfileUrl && '<a href="' + safeUrl(modder.modathonProfileUrl) + '">Modathon profile ↗</a>',
      modder.madnessProfileUrl && '<a href="' + safeUrl(modder.madnessProfileUrl) + '">Madness profile ↗</a>'
    ].filter(Boolean).join('');
    var awardCabinet = recognized.length ? '<section class="profile-section"><div class="section-heading section-heading--row"><div><span class="eyebrow">Placements &amp; judge awards</span><h2>The trophy cabinet</h2></div><span class="cabinet-total">' + (modder.awardCount + modder.placementEntryIds.length) + ' recognitions</span></div><div class="cabinet-grid">' + recognized.map(function (entry) {
      return '<article><div>' + placementBadge(entry) + '<span class="entry-event">' + escapeHtml(entry.event.label) + '</span></div><h3>' + escapeHtml(entry.title) + '</h3>' + (entry.awards.length ? '<div class="award-chips">' + entry.awards.map(function (award) { return '<span>' + escapeHtml(award) + '</span>'; }).join('') + '</div>' : '') + (entry.awardPlacardUrl ? '<a class="placard-link" href="' + safeUrl(entry.awardPlacardUrl) + '" target="_blank" rel="noopener">View award placard ↗</a>' : '') + '</article>';
    }).join('') + '</div></section>' : '';
    main.innerHTML = '<div class="paper-page"><nav class="breadcrumb" aria-label="Breadcrumb"><a href="/modjam/modders" data-route>Modders</a><span aria-hidden="true">/</span><span>' + escapeHtml(modder.name) + '</span></nav><section class="profile-hero">' + modderAvatar(modder, true) + '<div class="profile-title"><span class="eyebrow">Modjammer since ' + escapeHtml(modder.firstModjam) + '</span><h1>' + escapeHtml(modder.name) + '</h1><div class="profile-links">' + links + '</div></div><div class="profile-stats"><div><strong>' + work.length + '</strong><span>entries</span></div><div><strong>' + modder.participations.length + '</strong><span>Modjams</span></div><div><strong>' + modder.placementEntryIds.length + '</strong><span>placements</span></div><div><strong>' + modder.awardCount + '</strong><span>judge awards</span></div></div></section>' + modjamPassport(modder) + awardCabinet + '<section class="profile-section"><div class="section-heading"><span class="eyebrow">Complete Modjamography</span><h2>' + escapeHtml(modder.name) + '’s entries</h2></div><div class="entry-grid">' + work.map(entryCard).join('') + '</div></section></div>';
  }

  function renderAwards() {
    var awardedEntries = entries.filter(function (entry) { return entry.awards.length; }).slice().reverse();
    main.innerHTML = '<div class="paper-page awards-page">' + pageIntro('', 'The judge awards cabinet', 'A record of the honors created by Modjam judges. First awarded in 2022.') +
      '<section class="award-toolbar"><label><span>Search the cabinet</span><input id="award-search" type="search" placeholder="Try “penguin,” “lighthouse,” or a modder…"></label><label><span>Modjam</span><select id="award-event"><option value="">All award years</option>' + archiveData.events.filter(function (event) { return event.hasJudgeAwards; }).slice().reverse().map(function (event) { return '<option value="' + event.id + '">' + escapeHtml(event.label) + '</option>'; }).join('') + '</select></label><p id="award-count" aria-live="polite"></p></section><section class="award-entry-grid" id="award-results"></section></div>';
    var search = document.getElementById('award-search');
    var eventSelect = document.getElementById('award-event');
    function update() {
      var query = search.value.trim().toLowerCase();
      var eventId = eventSelect.value;
      var matches = awardedEntries.filter(function (entry) {
        var haystack = [entry.title, entry.event.label].concat(entry.awards, entry.authors.map(function (author) { return author.name; })).join(' ').toLowerCase();
        return (!query || haystack.includes(query)) && (!eventId || entry.event.id === eventId);
      });
      var count = matches.reduce(function (total, entry) { return total + entry.awards.length; }, 0);
      document.getElementById('award-count').innerHTML = '<strong>' + count + '</strong> awards across ' + matches.length + ' entries';
      document.getElementById('award-results').innerHTML = matches.length ? matches.map(function (entry) {
        return '<article class="award-entry"><div class="award-entry-head"><span class="entry-event">' + escapeHtml(entry.event.label) + '</span>' + placementBadge(entry) + '</div><h2>' + escapeHtml(entry.title) + '</h2><p>by ' + authorLinks(entry.authors) + '</p><div class="award-chips award-chips--large">' + entry.awards.map(function (award) { return '<span>' + escapeHtml(award) + '</span>'; }).join('') + '</div>' + (entry.awardPlacardUrl ? '<a class="placard-link" href="' + safeUrl(entry.awardPlacardUrl) + '" target="_blank" rel="noopener">Open the original placard ↗</a>' : '') + '</article>';
      }).join('') : '<div class="empty-state"><strong>No matching awards.</strong><span>Try a different bit of delightful nonsense.</span></div>';
    }
    search.addEventListener('input', update);
    eventSelect.addEventListener('change', update);
    update();
  }

  function setActiveNav(name) {
    document.querySelectorAll('[data-nav]').forEach(function (link) { link.classList.toggle('is-active', link.dataset.nav === name); });
  }

  function renderRoute() {
    clearInterval(countdownTimer);
    var path = location.pathname.replace(/\/+$/, '') || '/';
    if (path === '/modjam/archive') { setActiveNav('archive'); renderArchive(); }
    else if (path === '/modjam/modders') { setActiveNav('modders'); renderModders(); }
    else if (path === '/modjam/awards') { setActiveNav('awards'); renderAwards(); }
    else if (path.indexOf('/modjam/modder/') === 0) { setActiveNav('modders'); renderProfile(decodeURIComponent(path.slice('/modjam/modder/'.length))); }
    else { setActiveNav('home'); renderHome(); }
    window.scrollTo(0, 0);
  }

  function navigate(href) {
    history.pushState(null, '', href);
    renderRoute();
  }

  document.addEventListener('click', function (event) {
    var link = event.target.closest('a[data-route]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(link.getAttribute('href'));
  });
  document.addEventListener('error', function (event) {
    if (!event.target.matches || !event.target.matches('.entry-card-picture img')) return;
    event.target.parentElement.classList.remove('entry-card-picture--loading');
    event.target.parentElement.classList.add('entry-card-picture--error');
    event.target.remove();
  }, true);
  document.addEventListener('load', function (event) {
    if (!event.target.matches || !event.target.matches('.entry-card-picture img')) return;
    event.target.parentElement.classList.remove('entry-card-picture--loading');
    event.target.parentElement.classList.add('entry-card-picture--loaded');
  }, true);
  window.addEventListener('popstate', renderRoute);

  Promise.all([
    fetch('./data/modjams.json').then(function (response) { if (!response.ok) throw new Error('Modjam archive failed to load'); return response.json(); }),
    fetch('./data/modders.json').then(function (response) { if (!response.ok) throw new Error('Modder archive failed to load'); return response.json(); })
  ]).then(function (data) {
    archiveData = data[0];
    modderData = data[1];
    entries = archiveData.events.flatMap(function (event) {
      return event.entries.map(function (entry) { return Object.assign({ event: event }, entry); });
    });
    entries.forEach(function (entry) { entryById.set(entry.id, entry); });
    renderRoute();
  }).catch(function (error) {
    main.innerHTML = '<div class="load-error"><strong>The archive would not unfold.</strong><p>' + escapeHtml(error.message) + '</p><button type="button" onclick="location.reload()">Try again</button></div>';
  });
})();
