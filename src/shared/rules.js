/*
 * nospopo — shared rules.
 *
 * Pure logic only. No DOM and no Chrome API, so `node --test` can drive it.
 * The file runs in two places:
 *   - as a content script, where it assigns `globalThis.nospopoRules`;
 *   - in the tests and the generators, through `module.exports`.
 */
(function (root) {
  'use strict';

  // Spotify puts the content type in the path of a home page card link.
  var SPOKEN_PATHS = [
    '/show/',
    '/episode/',
    '/audiobook/',
    '/chapter/',
    '/collection/your-episodes'
  ];

  // The sidebar rows hold no link. They carry the URI in `aria-labelledby`.
  var SPOKEN_URIS = [
    'spotify:show:',
    'spotify:episode:',
    'spotify:audiobook:',
    'spotify:chapter:',
    'spotify:collection:your-episodes'
  ];

  // The chip label is the only signal that depends on the interface language.
  // A miss leaves a chip visible. It breaks nothing else.
  var CHIP_LABELS = [
    'Podcasts', 'Audiobooks', 'Podcasts & Shows',       // en
    'Podcasts et livres audio',                          // fr
    'Podcasts y audiolibros',                            // es
    'Hörbücher', 'Podcasts & Shows',                     // de
    'Podcast e audiolibri'                               // it
  ];

  // The home page feed holds a second card format. The cell carries no stable
  // attribute of its own, but its parent does, so the child combinator reaches
  // it. The cell holds a small header, a picture and a description. Without
  // this wrapper the filter hides the title and leaves the rest.
  var FEED_CELL = '[data-testid="grid-container"] > *';

  // The card wrappers, from the outside in. The extension hides all four, so
  // the grid keeps no gap where a card was.
  var CARD_WRAPPERS = [
    '[data-carousel-gridlist-item="true"]',
    '[data-carousel-item="true"]',
    FEED_CELL,
    '[data-encore-id="card"]'
  ];

  // Spotify serves a music-only home page when the URL carries this facet. The
  // server does the filtering, so no markup rule can miss a card. The rules
  // below stay, because the facet can fail: a link from outside, a back step,
  // or a change at Spotify all land on the plain home page again.
  var HOME_PATHS = ['/', '/home'];
  var HOME_ORIGIN = 'https://open.spotify.com';
  var FACET_KEY = 'facet';
  var MUSIC_FACET = 'music-chip';

  /*
   * Return the music-facet path for a home page URL, as `/home?facet=…`.
   *
   * Return null when the URL is not the home page, when it already carries a
   * facet, or when it points at another site. A null therefore means "leave
   * this URL alone", and a rewritten URL never matches again. The caller can
   * run this on every pass with no loop.
   */
  function musicHomeUrl(href) {
    if (typeof href !== 'string' || !href) return null;
    var url;
    try { url = new URL(href, HOME_ORIGIN); } catch (err) { return null; }
    if (url.origin !== HOME_ORIGIN) return null;
    var path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : url.pathname;
    if (HOME_PATHS.indexOf(path) === -1) return null;
    if (url.searchParams.has(FACET_KEY)) return null;
    url.searchParams.set(FACET_KEY, MUSIC_FACET);
    return '/home' + url.search + url.hash;
  }

  var HOME_PAGE = '[data-testid="home-page"]';
  var SIDEBAR = 'div[role="grid"][aria-label="Your Library"]';

  // Every rule hangs off this gate, so the popup can switch the filter off
  // without a page reload.
  var GATE = 'html:not([data-nospopo="off"])';

  var MAX_CLIMB = 40;

  function startsWithAny(value, prefixes) {
    if (typeof value !== 'string' || !value) return false;
    for (var i = 0; i < prefixes.length; i++) {
      if (value.indexOf(prefixes[i]) === 0) return true;
    }
    return false;
  }

  function isSpokenAudioHref(href) {
    return startsWithAny(href, SPOKEN_PATHS);
  }

  function isSpokenAudioUri(uri) {
    return startsWithAny(uri, SPOKEN_URIS);
  }

  /*
   * Return the element that represents one item.
   *
   * The shortcut tiles at the top of the home page carry no stable attribute,
   * so CSS cannot reach them. This climbs from the link to the highest ancestor
   * in which every link still points at the same target. That ancestor is the
   * tile, and never more than the tile.
   *
   * `adapter` keeps the DOM out of this file: { parent(node), hrefs(node) }.
   */
  function itemContainer(link, adapter) {
    var href = adapter.hrefs(link)[0];
    var node = link;
    for (var depth = 0; depth < MAX_CLIMB; depth++) {
      var parent = adapter.parent(node);
      if (!parent) return node;
      var hrefs = adapter.hrefs(parent);
      if (!hrefs.length) return node;
      for (var i = 0; i < hrefs.length; i++) {
        if (hrefs[i] !== href) return node;
      }
      node = parent;
    }
    return node;
  }

  // A shelf counts as empty only when it held cards and the filter hid them
  // all. A shelf with no card at all is a different thing, and it stays.
  function isShelfEmpty(cardHiddenStates) {
    if (!cardHiddenStates || !cardHiddenStates.length) return false;
    for (var i = 0; i < cardHiddenStates.length; i++) {
      if (!cardHiddenStates[i]) return false;
    }
    return true;
  }

  function cardSelectors() {
    var out = [];
    for (var w = 0; w < CARD_WRAPPERS.length; w++) {
      for (var p = 0; p < SPOKEN_PATHS.length; p++) {
        out.push(CARD_WRAPPERS[w] + ':has(a[href^="' + SPOKEN_PATHS[p] + '"])');
      }
    }
    return out;
  }

  function rowSelectors() {
    var out = [];
    for (var i = 0; i < SPOKEN_URIS.length; i++) {
      out.push('[role="row"]:has([aria-labelledby^="listrow-title-' + SPOKEN_URIS[i] + '"])');
    }
    return out;
  }

  function chipSelectors() {
    var out = [];
    var seen = {};
    for (var i = 0; i < CHIP_LABELS.length; i++) {
      var label = CHIP_LABELS[i];
      if (seen[label]) continue;
      seen[label] = true;
      out.push('[data-carousel-item="true"]:has(> [data-encore-id="chip"][aria-label="' + label + '"])');
      out.push('[data-encore-id="chip"][aria-label="' + label + '"]');
    }
    return out;
  }

  // Everything the static stylesheet hides, each rule gated by GATE.
  function allSelectors() {
    var raw = cardSelectors().concat(rowSelectors(), chipSelectors());
    var out = [];
    for (var i = 0; i < raw.length; i++) out.push(GATE + ' ' + raw[i]);
    return out;
  }

  var api = {
    SPOKEN_PATHS: SPOKEN_PATHS,
    SPOKEN_URIS: SPOKEN_URIS,
    CHIP_LABELS: CHIP_LABELS,
    CARD_WRAPPERS: CARD_WRAPPERS,
    FEED_CELL: FEED_CELL,
    HOME_PATHS: HOME_PATHS,
    MUSIC_FACET: MUSIC_FACET,
    musicHomeUrl: musicHomeUrl,
    HOME_PAGE: HOME_PAGE,
    SIDEBAR: SIDEBAR,
    GATE: GATE,
    isSpokenAudioHref: isSpokenAudioHref,
    isSpokenAudioUri: isSpokenAudioUri,
    itemContainer: itemContainer,
    isShelfEmpty: isShelfEmpty,
    cardSelectors: cardSelectors,
    rowSelectors: rowSelectors,
    chipSelectors: chipSelectors,
    allSelectors: allSelectors
  };

  root.nospopoRules = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
