// Email topics. Keys are stored on each subscriber ('news,alerts,group:prayer'); labels are what people see.
// Every group is also a list, "group:<slug>". Groups belong to the server (getGroups); a group topic whose group
// no longer exists is ignored everywhere (counts, sends, pages), so removing a group needs no migration.
import { GROUP_TYPES } from '../lib/state.js';

export const TOPICS = { news: 'Latest happenings', alerts: 'Weather & closing alerts' };
const SLUG = /^[a-z0-9-]{1,60}$/;
/** Shape only (tokens); cleanTopics also checks that the group still exists. */
export const TOPIC_SHAPE = /^(news|alerts|group:[a-z0-9-]{1,60})$/;

/** [{ key: 'group:slug', name, type }] for the groups that exist now. */
export const groupTopics = (groups = []) => (Array.isArray(groups) ? groups : [])
  .filter((g) => SLUG.test(g?.slug ?? '') && typeof g.name === 'string' && g.name)
  .map((g) => ({ key: `group:${g.slug}`, name: g.name, type: g.type }));

/** Known keys only: the two fixed topics, then current groups, each once. */
export const cleanTopics = (v, groups = []) => {
  const want = new Set((Array.isArray(v) ? v : String(v ?? '').split(',')).map((t) => String(t).trim()));
  return [...Object.keys(TOPICS), ...groupTopics(groups).map((g) => g.key)].filter((k) => want.has(k));
};

const label = (k, groups) => TOPICS[k] ?? groupTopics(groups).find((g) => g.key === k)?.name ?? '';
export const topicLabels = (keys, groups = [], sep = ' · ') => cleanTopics(keys, groups).map((k) => label(k, groups)).join(sep);

/** For "You're getting this because you signed up for …": "Latest happenings and the Sunday prayer list". */
export const whyLabels = (keys, groups = []) => cleanTopics(keys, groups).map((k) => TOPICS[k] ?? `the ${label(k, groups)} list`).join(' and ');

/** Current groups by type, in the board's order: [{ label, groups: [{ key, name }] }]. Unknown types go under "Other groups". */
export const groupsByType = (groups = []) => {
  const gs = groupTopics(groups);
  const known = new Set(GROUP_TYPES.map(([k]) => k));
  return GROUP_TYPES.map(([type, name]) => ({ label: name, groups: gs.filter((g) => (known.has(g.type) ? g.type : 'other') === type) }))
    .filter((t) => t.groups.length);
};
