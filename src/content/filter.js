/*
 * nospopo — content script.
 *
 * The stylesheet does most of the work. This script only does the four jobs
 * that CSS cannot do:
 *   1. keep the on/off attribute in sync with the stored state;
 *   2. send a cold load of the home page to the music facet, which Spotify
 *      filters on its own server (see rules.musicHomeUrl);
 *   3. hide the shortcut tiles and shelf headers, which carry no stable
 *      attribute (see rules.itemContainer);
 *   4. hide a shelf that holds no visible card any more.
 *
 * It never removes a node. Spotify's React code keeps its own view of the DOM.
 */
(function () {
  'use strict';

  var rules = globalThis.nospopoRules;
  var MARK = 'data-nospopo-hide';
  var HEALTH_DELAY_MS = 5000;

  var root = document.documentElement;
  var observer = null;
  var scheduled = false;

  // --- state ----------------------------------------------------------

  function applyState(enabled) {
    if (enabled) root.removeAttribute('data-nospopo');
    else root.setAttribute('data-nospopo', 'off');
  }

  // Default to on. A slow or failed read therefore leaves the page filtered.
  chrome.storage.local.get({ enabled: true }, function (state) {
    var enabled = state.enabled !== false;
    applyState(enabled);
    if (enabled) redirectHome();
  });

  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== 'local' || !changes.enabled) return;
    applyState(changes.enabled.newValue !== false);
  });

  // --- the music facet ------------------------------------------------

  /*
   * Send a cold load of the home page to the music facet, where Spotify's own
   * server drops every podcast, show and audiobook.
   *
   * This runs once, at document_start, so nothing draws twice. It never runs
   * again: the Home button inside the player is a button, not a link, and its
   * router ignores the URL, so a second call would reload the page under the
   * reader. An in-player step to the home page therefore lands on the whole
   * home page, and the selector rules do the work there.
   */
  function redirectHome() {
    var next = rules.musicHomeUrl(location.href);
    if (next) location.replace(next);
  }

  // --- DOM adapter for the pure rules ---------------------------------

  var adapter = {
    parent: function (node) { return node.parentElement; },
    hrefs: function (node) {
      var out = [];
      if (node.tagName === 'A' && node.hasAttribute('href')) out.push(node.getAttribute('href'));
      var found = node.querySelectorAll ? node.querySelectorAll('a[href]') : [];
      for (var i = 0; i < found.length; i++) out.push(found[i].getAttribute('href'));
      return out;
    }
  };

  function isHidden(el) {
    return !!el.closest('[' + MARK + ']') || !el.getClientRects().length;
  }

  function mark(el) {
    if (el && !el.hasAttribute(MARK)) el.setAttribute(MARK, '');
  }

  // --- the pass -------------------------------------------------------

  function hideLooseItems() {
    var links = document.querySelectorAll('a[href]');
    for (var i = 0; i < links.length; i++) {
      var link = links[i];
      if (!rules.isSpokenAudioHref(link.getAttribute('href'))) continue;
      if (link.closest('[' + MARK + ']')) continue;
      mark(rules.itemContainer(link, adapter));
    }
  }

  // A shelf holds encore cards, or feed cells, or both.
  function shelfItems(section) {
    var out = [];
    var groups = [
      section.querySelectorAll('[data-encore-id="card"]'),
      section.querySelectorAll(rules.FEED_CELL)
    ];
    for (var g = 0; g < groups.length; g++) {
      for (var i = 0; i < groups[g].length; i++) out.push(groups[g][i]);
    }
    return out;
  }

  function hideEmptyShelves() {
    var sections = document.querySelectorAll(rules.HOME_PAGE + ' section');
    for (var i = 0; i < sections.length; i++) {
      var section = sections[i];
      if (section.hasAttribute(MARK)) continue;
      var items = shelfItems(section);
      var states = [];
      for (var c = 0; c < items.length; c++) states.push(isHidden(items[c]));
      if (rules.isShelfEmpty(states)) mark(section);
    }
  }

  function pass() {
    scheduled = false;
    if (root.getAttribute('data-nospopo') === 'off') return;
    try {
      hideLooseItems();
      hideEmptyShelves();
    } catch (err) {
      console.warn('[nospopo] the pass stopped:', err);
      if (observer) observer.disconnect();
      report(false);
    }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(pass);
  }

  // --- health ---------------------------------------------------------

  function report(ok) {
    try {
      chrome.runtime.sendMessage({ type: 'nospopo-health', ok: ok });
    } catch (err) { /* the service worker is asleep; nothing to do */ }
  }

  /*
   * The canary is the card attribute itself. An account with no podcast
   * matches no rule, and that is correct. But a home page with no
   * `[data-encore-id="card"]` at all means Spotify changed its markup.
   */
  function checkHealth() {
    if (!document.querySelector(rules.HOME_PAGE)) return;
    var ok = document.querySelectorAll('[data-encore-id="card"]').length > 0;
    if (!ok) {
      console.warn('[nospopo] no card matched the known markup. The rules need repair.');
      if (observer) observer.disconnect();
    }
    report(ok);
  }

  // --- start ----------------------------------------------------------

  function start() {
    if (!CSS.supports('selector(:has(a))')) {
      console.warn('[nospopo] this browser has no :has() support. The filter is off.');
      report(false);
      return;
    }
    pass();
    observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(checkHealth, HEALTH_DELAY_MS);
  }

  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });
})();
