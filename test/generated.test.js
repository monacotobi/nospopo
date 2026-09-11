'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const gen = require('../tools/gen-css.js');

test('src/content/filter.css matches the rules — run `npm run gen` if this fails', () => {
  const onDisk = fs.readFileSync(gen.OUT, 'utf8');
  assert.equal(onDisk, gen.build());
});

test('the manifest lists the files that exist', () => {
  const root = path.join(__dirname, '..');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  const listed = [
    manifest.background.service_worker,
    manifest.action.default_popup,
    ...manifest.content_scripts[0].css,
    ...manifest.content_scripts[0].js,
    ...Object.values(manifest.icons)
  ];
  for (const file of listed) {
    assert.ok(fs.existsSync(path.join(root, file)), 'missing: ' + file);
  }
});

test('rules.js loads before filter.js in the content script list', () => {
  const root = path.join(__dirname, '..');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  const js = manifest.content_scripts[0].js;
  assert.ok(js.indexOf('src/shared/rules.js') < js.indexOf('src/content/filter.js'));
  assert.equal(manifest.content_scripts[0].run_at, 'document_start');
});
