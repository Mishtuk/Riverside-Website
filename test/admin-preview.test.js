// node --test: the preview staff screen shows starting content and can never save.
import test from 'node:test';
import assert from 'node:assert/strict';
import { previewReply, previewScript } from '../src/lib/admin-preview.js';

const seed = { groups: [{ id: 'prayer' }], team: [{ name: 'Ezra Strickhouser' }], emailGroups: [], note: 'n' };

test('preview: every change is refused, whatever the area', () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    for (const path of ['/alerts', '/events/new', '/team', '/live', '/staff', '/password', '/email/send', '/email/test', '/email/invite']) {
      const r = previewReply(method, `/Riverside-Website/api/admin${path}`, seed);
      assert.equal(r.status, 403, `${method} ${path}`);
      assert.equal(r.body.error, 'preview');
    }
  }
});

test('preview: the email draft preview is the only POST that answers, and it saves nothing', () => {
  assert.equal(previewReply('POST', '/api/admin/email/preview', seed).status, 200);
});

test('preview: reads show the real starting content and no invented numbers', () => {
  assert.deepEqual(previewReply('GET', '/api/admin/state', seed).body.state.groups, seed.groups);
  assert.deepEqual(previewReply('GET', '/api/admin/team', seed).body.team, seed.team);
  assert.equal(previewReply('GET', '/api/admin/email/counts', seed).body.total, 0);
  for (const range of ['day', '7d', '30d', '12m', 'all']) {
    const s = previewReply('GET', `/api/admin/stats/summary?range=${range}`, seed).body;
    assert.equal(s.visitors + s.views + s.plays.video + s.plays.podcast, 0);
    assert.deepEqual(s.series.map((p) => p.n + p.p), [0]); // the chart needs one point to draw its empty state
  }
  assert.equal(previewReply('GET', '/api/admin/backup', seed).status, 403);
});

test('preview: a stray closing tag in the content cannot end the inline script', () => {
  assert.ok(!previewScript({ ...seed, team: [{ name: '</script><b>' }] }).includes('</script><b>'));
});
