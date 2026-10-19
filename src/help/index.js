// The in-admin help guide: short, task-based steps that use the admin's own button and field names.
// The server embeds helpSection() at <!--rs:help-->. Keep the wording in step with src/pages/admin.astro.
// `church` = CHURCH (site facts), for the office phone and email.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const b = (s) => `<strong>${s}</strong>`; // a label exactly as it appears on screen
const go = (id, s) => `<a class="link" href="#${id}">${s}</a>`;

export const TASKS = [
  ['weather', 'Post a weather or closing alert', [
    `Go to ${go('alerts', 'Alerts')}. Under ${b('Post an alert')}, choose ${b('Weather / closing (urgent)')}.`,
    `Write the ${b('Message')} in one or two plain sentences: what is happening and when. For example: “Church is closed Sunday, Jan 12 because of snow. Join us online at 10:30.”`,
    `Leave ${b('Group')} on ${b('None')}, so it shows on every page.`,
    `Leave the pop-up box ticked (${b('Also show as a pop-up the first time someone visits')}) so everyone sees it once, straight away.`,
    `Check ${b('Expires')}: the alert disappears by itself after that time.`,
    `To email it as well, tick ${b('Also email subscribers to Weather &amp; closing alerts')}.`,
    `Look at the ${b('Preview')}. If you like, press ${b('Send a test to me')} first.`,
    `Press ${b('Post alert')} (or ${b('Post alert and email')}), then confirm. It is on the site within a minute.`,
    `To take it down early, find it under ${b('Active alerts')} and press ${b('End now')}.`,
  ]],
  ['group-alert', 'Tell a group its meeting is cancelled or moved', [
    `Go to ${go('groups', 'Groups')} and open the group’s card.`,
    `Under ${b('This week')}, choose ${b('Not meeting on')} and pick the date. Press ${b('Save')}. The Groups page now says “Not meeting this week”, and it goes back to normal by itself after that date.`,
    `To explain why, or to say where it moved to, press ${b('Post a meeting alert')} on the same card. The alert form opens with the group already picked.`,
    `Write the message, for example “Prayer group is meeting in the lobby this week.” Leave ${b('Also show site-wide')} unticked unless the whole church needs to know.`,
    `To email the group too, tick ${b('Also email subscribers')}. ${b('The group’s list')} is already ticked.`,
    `Press ${b('Post alert')} and confirm.`,
  ]],
  ['event', 'Add a church event', [
    `Go to ${go('events', 'Events')} and press ${b('Add an event')}.`,
    `Fill in the ${b('Title')} and ${b('Date')}. ${b('Starts')}, ${b('Ends')}, ${b('Place')} and ${b('Description')} are optional. A blank place shows “Contact us”.`,
    `Choose how important it is. ${b('Major')} shows big on the home page (a picnic, Easter, a baptism Sunday). ${b('Minor')} shows in the list (a work day, a choir practice).`,
    `Press ${b('Save')}. It appears on the home page and on the Events page.`,
    'Past events disappear by themselves the day after. To change one, open it, edit and press Save. To remove it, press Remove.',
  ]],
  ['group', 'Update a group: this week, news and events', [
    `Go to ${go('groups', 'Groups')} and open the group’s card.`,
    `${b('This week')}: ${b('Meeting as usual')}, ${b('Not meeting on')} a date, or ${b('On break until')} a date. Press ${b('Save')}.`,
    `${b('Updates')}: write a ${b('Title')} and ${b('Message')}, then press ${b('Post update')}. It shows on the group’s section of the Groups page straight away.`,
    `${b('Events')}: press ${b('Add an event')} for a one-off date such as a picnic. Fill in the date and time, then press ${b('Save')}.`,
    `New group: press ${b('Add a group')} at the top, fill in the name, type, day, time and place, and press ${b('Save')}.`,
  ]],
  ['email', 'Send an email to a group (or to everyone)', [
    `Go to ${go('email', 'Email')} and choose ${b('Send an email')}.`,
    `Under ${b('Send to')}, tick the group (or Latest happenings, or Weather &amp; closing alerts). The line under it says how many people it goes to. Someone on two lists gets it once.`,
    `Write the ${b('Subject')} and ${b('Message')}. Leave a blank line between paragraphs. **Two stars** each side make words bold. Paste links as they are.`,
    `Check the ${b('Preview')}. Press ${b('Send test to me')} to see it in your own inbox.`,
    `Press ${b('Send…')} and confirm. Emails can’t be unsent.`,
    `It sends a little at a time, so a big list can take a while. You can close the page. ${b('Sent emails')} shows how many went out and if any failed.`,
    `To invite someone to a group’s list, choose ${b('Subscribers')}, then ${b('Invite to a group')}. They get an email and join only when they tap the link.`,
  ]],
  ['video', 'Fix a video title or thumbnail', [
    'Best: fix the title on YouTube itself. The website picks it up by itself.',
    `If you can’t, go to ${go('items', 'Videos &amp; podcast')} and find the video.`,
    `Change the ${b('Title')}, or press ${b('Change thumbnail')} and pick a picture (JPG, PNG or WebP). Then press ${b('Save')}.`,
    `${b('Reset to original')} brings back the YouTube version.`,
  ]],
  ['staff', 'Add a staff member, or reset a password', [
    `Go to ${go('staff', 'Staff accounts')}. Under ${b('Add a staff account')}, choose a ${b('Username')} (lowercase, for example “katrina”) and a ${b('Temporary password')} of at least 12 characters.`,
    `Press ${b('Add account')}. Give them the temporary password in person or by phone, never by email. They choose their own the first time they sign in.`,
    `Someone forgot their password: under ${b('Accounts')}, press ${b('Remove')} next to their name, then add them again with a new temporary password.`,
    `Your own password: use ${b('Change your password')} on the same page.`,
    `Someone leaves: press ${b('Remove')} next to their name. They can’t sign in any more.`,
    `To show a person on the About page (name, role, photo), use ${go('team', 'Our team')}: press ${b('Add a person')}, fill it in, then press ${b('Save team')}. This is separate from sign-in accounts.`,
  ]],
  ['live', 'Turn the livestream on or off', [
    `Go to ${go('live', 'Livestream')}. Normally leave it on ${b('Automatic, on the usual Sunday schedule')}.`,
    `Streaming at another time: choose ${b('Live now: show the stream')} and press ${b('Save')}. Set it back to Automatic afterwards.`,
    `Stream cancelled: choose ${b('Not live: hide the stream')} and press ${b('Save')}.`,
    `If the home page shows the wrong video, paste the 11 characters after “watch?v=” into ${b('YouTube video ID')} and press ${b('Save')}.`,
  ]],
  ['stats', 'Read the statistics', [
    `Go to ${go('stats', 'Statistics')} and pick a period: ${b('Last day')}, ${b('7 days')}, ${b('30 days')}, ${b('12 months')} or ${b('All time')}.`,
    `${b('Email subscribers')}: how many people get our emails now, and how that changed in the period. Open ${b('By list')} for each list and group.`,
    `${b('Visits')}: people who opened the website, counted once a day each. These are estimates: bots and staff are left out, and nobody is tracked.`,
    `${b('Video plays on our site')} and ${b('Podcast plays')}: how often someone pressed play on our pages. Views on YouTube itself are counted separately.`,
    `${b('Top pages')} shows what people look at most.`,
  ]],
];

export function helpSection(church = {}) {
  const tel = String(church.phone ?? '').replace(/\D/g, '');
  const tasks = TASKS.map(([id, title, steps]) => `<details class="card help-task" id="help-${id}"><summary>${esc(title)}</summary><ol>${steps.map((s) => `<li>${s}</li>`).join('')}</ol></details>`).join('');
  return `<section id="help" aria-labelledby="help-h"><style>${CSS}</style>
<h2 id="help-h" class="h2">Help</h2>
<p class="muted">Short steps for the everyday jobs. Tap one to open it. The words in bold are what you see on the screen.</p>
<div class="help-list">${tasks}
<details class="card help-task" id="help-wrong"><summary>Something looks wrong</summary><ol>
<li>Don’t worry: you can’t break the website’s design from here. Alerts, events and emails are the only things visitors see change.</li>
<li>Reload the page. Most hiccups are a weak connection: if a save fails, a message says so and offers ${b('Try again')}.</li>
<li>A wrong alert or event: edit it, or remove it (${b('End now')} for alerts, ${b('Remove')} for events). An email that went out can’t be taken back; send a short correction.</li>
<li>Locked out: another staff member can remove your account and add it again with a new temporary password.</li>
<li>Still stuck, or the site is down: call the developer. Note what you pressed and what you saw (a screenshot helps).</li>
${church.phone ? `<li>For visitors with questions, the church office is <a class="link" href="tel:+1${esc(tel)}">${esc(church.phone)}</a>${church.email ? ` or <a class="link" href="mailto:${esc(church.email)}">${esc(church.email)}</a>` : ''}.</li>` : ''}
</ol></details></div>
</section>`;
}

const CSS = `#help .help-list{display:grid;gap:.75rem;margin-top:1rem}
#help .help-task{padding:0}
#help .help-task summary{display:flex;align-items:center;min-height:56px;padding:.75rem 1.25rem;cursor:pointer;font-weight:700;font-size:var(--step-0)}
#help .help-task summary::after{content:'+';margin-left:auto;padding-left:1rem;font-size:1.4rem;line-height:1}
#help .help-task[open] summary::after{content:'\\2212'}
#help .help-task ol{margin:0;padding:0 1.25rem 1.25rem 2.5rem;display:grid;gap:.6rem;max-width:62ch}
#help .help-task li{line-height:1.5}
#help .help-task .link{padding-block:.2rem}`;
