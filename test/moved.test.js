// node --test: deep old URLs map to their new home.
import test from 'node:test';
import assert from 'node:assert/strict';
import { movedHome } from '../src/lib/moved.js';

test('moved: each old section prefix maps to its new page', () => {
  assert.equal(movedHome('/sermons/some-talk'), '/watch');
  assert.equal(movedHome('/sermons/2020/a/b/'), '/watch');
  assert.equal(movedHome('/about/riverside-community-church-blog/post-1'), '/about');
  assert.equal(movedHome('/connect/events/fall-picnic'), '/events');
  assert.equal(movedHome('/feeds/podcast.xml'), '/podcast');
});

test('moved: non-matches and near misses return null', () => {
  assert.equal(movedHome('/'), null);
  assert.equal(movedHome('/nope'), null);
  assert.equal(movedHome('/sermonsx'), null);
  assert.equal(movedHome('/sermonsx/y'), null);
  assert.equal(movedHome('/connect/eventsx/y'), null);
  assert.equal(movedHome('/feedsx'), null);
  assert.equal(movedHome('/sermons'), null); // bare section is a static redirect
});
