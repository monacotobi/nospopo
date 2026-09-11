'use strict';
const test = require('node:test');
const assert = require('node:assert');
const rules = require('../src/shared/rules.js');

test('isSpokenAudioHref: spoken paths', () => {
  for (const h of ['/show/abc', '/episode/abc', '/audiobook/abc', '/chapter/abc',
                   '/collection/your-episodes']) {
    assert.equal(rules.isSpokenAudioHref(h), true, h);
  }
});

test('isSpokenAudioHref: music paths', () => {
  for (const h of ['/track/abc', '/album/abc', '/artist/abc', '/playlist/abc',
                   '/collection/tracks', '/search', '/']) {
    assert.equal(rules.isSpokenAudioHref(h), false, h);
  }
});

test('isSpokenAudioHref: no false prefix match', () => {
  assert.equal(rules.isSpokenAudioHref('/showcase/abc'), false);
  assert.equal(rules.isSpokenAudioHref('/episodes-of-me'), false);
});

test('isSpokenAudioHref: bad input', () => {
  for (const h of [null, undefined, '', 42, {}, 'https://example.com/show/x']) {
    assert.equal(rules.isSpokenAudioHref(h), false, String(h));
  }
});

test('isSpokenAudioUri', () => {
  assert.equal(rules.isSpokenAudioUri('spotify:show:1'), true);
  assert.equal(rules.isSpokenAudioUri('spotify:episode:1'), true);
  assert.equal(rules.isSpokenAudioUri('spotify:audiobook:1'), true);
  assert.equal(rules.isSpokenAudioUri('spotify:chapter:1'), true);
  assert.equal(rules.isSpokenAudioUri('spotify:collection:your-episodes'), true);
  assert.equal(rules.isSpokenAudioUri('spotify:playlist:1'), false);
  assert.equal(rules.isSpokenAudioUri('spotify:collection:tracks'), false);
  assert.equal(rules.isSpokenAudioUri('spotify:album:1'), false);
  assert.equal(rules.isSpokenAudioUri(null), false);
});

// --- musicHomeUrl ------------------------------------------------------
test('musicHomeUrl rewrites every form of the home URL', () => {
  const want = '/home?facet=music-chip';
  for (const h of ['https://open.spotify.com/', 'https://open.spotify.com/home',
                   '/', '/home', '/home/']) {
    assert.equal(rules.musicHomeUrl(h), want, h);
  }
});

test('musicHomeUrl keeps the other query parameters', () => {
  assert.equal(rules.musicHomeUrl('/home?pt=x'), '/home?pt=x&facet=music-chip');
});

test('musicHomeUrl leaves a URL that already carries a facet', () => {
  assert.equal(rules.musicHomeUrl('/home?facet=music-chip'), null);
  assert.equal(rules.musicHomeUrl('/home?facet=podcasts-chip'), null);
});

test('musicHomeUrl leaves every other page', () => {
  for (const h of ['/album/1', '/show/1', '/search', '/collection/tracks',
                   '/homepage', 'https://example.com/', '', null, undefined, 42]) {
    assert.equal(rules.musicHomeUrl(h), null, String(h));
  }
});

test('musicHomeUrl never rewrites its own result — no redirect loop', () => {
  const once = rules.musicHomeUrl('/');
  assert.equal(rules.musicHomeUrl(once), null);
});

// --- itemContainer -----------------------------------------------------
// A tiny fake tree. Each node: {name, parent, hrefs}
function node(name, hrefs, parent) {
  const n = { name, hrefs, parent: parent || null };
  return n;
}
const adapter = { parent: n => n.parent, hrefs: n => n.hrefs };

test('itemContainer: climbs while every link shares one target', () => {
  const section = node('section', ['/show/a', '/album/b']);
  const tile = node('tile', ['/show/a', '/show/a'], section);
  const inner = node('inner', ['/show/a'], tile);
  const link = node('a', ['/show/a'], inner);
  assert.equal(rules.itemContainer(link, adapter).name, 'tile');
});

test('itemContainer: stops at the link when the parent is mixed', () => {
  const parent = node('parent', ['/show/a', '/album/b']);
  const link = node('a', ['/show/a'], parent);
  assert.equal(rules.itemContainer(link, adapter).name, 'a');
});

test('itemContainer: stops at the root', () => {
  const root = node('root', ['/show/a']);
  const link = node('a', ['/show/a'], root);
  assert.equal(rules.itemContainer(link, adapter).name, 'root');
});

test('itemContainer: a parent with no link stops the climb', () => {
  const outer = node('outer', []);
  const mid = node('mid', ['/show/a'], outer);
  const link = node('a', ['/show/a'], mid);
  assert.equal(rules.itemContainer(link, adapter).name, 'mid');
});

test('itemContainer: respects the depth cap', () => {
  // n0 is the root, n60 the leaf. The climb moves from n60 towards n0.
  let n = node('n0', ['/show/a']);
  for (let i = 1; i <= 60; i++) n = node('n' + i, ['/show/a'], n);
  const top = rules.itemContainer(n, adapter);
  // 40 steps up from n60 stops at n20. The cap must stop it before the root.
  assert.equal(top.name, 'n20');
});

// --- isShelfEmpty ------------------------------------------------------
test('isShelfEmpty', () => {
  assert.equal(rules.isShelfEmpty([true, true, true]), true);
  assert.equal(rules.isShelfEmpty([true, false, true]), false);
  assert.equal(rules.isShelfEmpty([false]), false);
  assert.equal(rules.isShelfEmpty([]), false, 'a shelf with no card is not empty-by-filter');
});

// --- selectors ---------------------------------------------------------
test('cardSelectors cover every spoken path and every wrapper', () => {
  const sels = rules.cardSelectors();
  assert.ok(sels.length >= 15);
  assert.ok(sels.some(s => s.includes('[data-encore-id="card"]') && s.includes('/show/')));
  assert.ok(sels.some(s => s.includes('[data-carousel-gridlist-item="true"]')));
  assert.ok(sels.some(s => s.includes('/collection/your-episodes')));
  assert.ok(sels.every(s => s.includes(':has(')));
});

test('cardSelectors cover the feed cell', () => {
  const sels = rules.cardSelectors();
  assert.ok(sels.some(s => s === rules.FEED_CELL + ':has(a[href^="/episode/"])'));
  assert.ok(sels.some(s => s === rules.FEED_CELL + ':has(a[href^="/show/"])'));
});

test('the feed cell selector reaches a child of the grid container only', () => {
  assert.equal(rules.FEED_CELL, '[data-testid="grid-container"] > *');
});

test('rowSelectors target the sidebar row by uri', () => {
  const sels = rules.rowSelectors();
  assert.ok(sels.some(s => s.includes('listrow-title-spotify:show:')));
  assert.ok(sels.every(s => s.startsWith('[role="row"]:has(')));
});

test('chipSelectors use the label list', () => {
  const sels = rules.chipSelectors();
  assert.ok(sels.some(s => s.includes('aria-label="Podcasts"')));
  assert.ok(sels.some(s => s.includes('aria-label="Audiobooks"')));
});

test('every selector is valid CSS and gated by the off attribute', () => {
  const all = rules.allSelectors();
  assert.ok(all.length > 20);
  for (const s of all) assert.ok(s.startsWith(rules.GATE + ' '), s);
});
