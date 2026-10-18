// Mailchimp, called only from the worker. Topics are tags on the existing list; keys live in Worker secrets.
// Env: MAILCHIMP_API_KEY (secret, "xxxx-us2"), MAILCHIMP_LIST_ID, MAILCHIMP_FROM_NAME, MAILCHIMP_REPLY_TO.
export const TOPICS = { news: 'Latest happenings', alerts: 'Weather & closing alerts' };

export const mailConfigured = (env) => Boolean(env.MAILCHIMP_API_KEY && env.MAILCHIMP_LIST_ID && env.MAILCHIMP_FROM_NAME && env.MAILCHIMP_REPLY_TO);

async function mc(env, path, method = 'GET', body) {
  const dc = env.MAILCHIMP_API_KEY.split('-').pop();
  const res = await fetch(`https://${dc}.api.mailchimp.com/3.0${path}`, {
    method,
    headers: { Authorization: `Basic ${btoa(`riverside:${env.MAILCHIMP_API_KEY}`)}`, 'Content-Type': 'application/json' },
    body: body && JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Mailchimp ${method} ${path.split('?')[0]}: ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res.status === 204 ? null : res.json();
}

const md5 = async (s) => [...new Uint8Array(await crypto.subtle.digest('MD5', new TextEncoder().encode(s.toLowerCase())))]
  .map((b) => b.toString(16).padStart(2, '0')).join('');

/** Adds (or updates) the member and tags the chosen topics. New members get Mailchimp's confirmation email. */
export async function subscribe(env, email, topics) {
  const member = `/lists/${env.MAILCHIMP_LIST_ID}/members/${await md5(email)}`;
  await mc(env, member, 'PUT', { email_address: email, status_if_new: 'pending' });
  await mc(env, `${member}/tags`, 'POST', { tags: topics.map((t) => ({ name: TOPICS[t], status: 'active' })) });
}

// Tags are static segments; null until the first subscriber has the tag.
async function tag(env, topic) {
  const r = await mc(env, `/lists/${env.MAILCHIMP_LIST_ID}/segments?type=static&count=1000&fields=segments.id,segments.name,segments.member_count`);
  return r.segments.find((s) => s.name === TOPICS[topic]) ?? null;
}

export const countRecipients = async (env, topic) => (await tag(env, topic))?.member_count ?? 0;

/** Emails everyone tagged with `topic`. With `testTo`, sends only a test to that address and deletes the draft. */
export async function sendAlert(env, topic, subject, html, testTo) {
  const t = await tag(env, topic);
  if (!t && !testTo) throw new Error('No subscribers for this topic yet');
  const recipients = { list_id: env.MAILCHIMP_LIST_ID };
  if (t) recipients.segment_opts = { match: 'all', conditions: [{ condition_type: 'StaticSegment', field: 'static_segment', op: 'static_is', value: t.id }] };
  const c = await mc(env, '/campaigns', 'POST', {
    type: 'regular',
    recipients,
    settings: { subject_line: subject, title: `Site alert: ${subject}`.slice(0, 100), from_name: env.MAILCHIMP_FROM_NAME, reply_to: env.MAILCHIMP_REPLY_TO },
  });
  await mc(env, `/campaigns/${c.id}/content`, 'PUT', { html });
  if (!testTo) return mc(env, `/campaigns/${c.id}/actions/send`, 'POST');
  await mc(env, `/campaigns/${c.id}/actions/test`, 'POST', { test_emails: [testTo], send_type: 'html' });
  await mc(env, `/campaigns/${c.id}`, 'DELETE');
}
