// Single source for church facts + nav. Change times/address here, not in components.
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

/** Base-aware internal URL: href('/im-new') -> '/Riverside-Website/im-new' */
export const href = (path = '/') => `${BASE}${path.startsWith('/') ? path : `/${path}`}`;

export const CHURCH = {
  name: 'Riverside Community Church',
  tagline: 'People equipping people to reflect the transformational love of Jesus.',
  street: '239 Columbia Avenue',
  city: 'Horsham',
  region: 'PA',
  zip: '19044',
  phone: '215-441-0404',
  email: 'riverside@riversideconnect.com',
  textToGive: '267-274-2425',
  times: 'Sundays 9:00 & 10:30am',
  services: [{ label: '9:00am', start: '09:00' }, { label: '10:30am', start: '10:30' }],
  prayerTime: '9:30–10:30am',
  timesNote: 'Livestream & kids at 10:30',
  mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Riverside+Community+Church+239+Columbia+Ave+Horsham+PA+19044',
  mapsEmbed: 'https://www.google.com/maps?q=Riverside+Community+Church,+239+Columbia+Ave,+Horsham,+PA+19044&z=15&output=embed',
  socials: {
    instagram: 'https://www.instagram.com/riversidechurch_horsham',
    youtube: 'https://www.youtube.com/channel/UCWcjfHPkDfMiiGgp0L8zDjQ',
    facebook: 'https://www.facebook.com/150401978326964',
  },
} as const;

export const NAV = [
  { label: "I'm New", path: '/im-new' },
  { label: 'About', path: '/about' },
  { label: 'Watch', path: '/watch' },
  { label: 'Podcast', path: '/podcast' },
  { label: 'Get Involved', path: '/get-involved' },
  { label: 'Events', path: '/events' },
] as const;

/** Livestream schedule, evaluated in America/New_York. day: 0 = Sunday. */
export const LIVE = {
  tz: 'America/New_York',
  day: 0,
  banner: { start: '10:25', end: '12:00' }, // banner + "Live now" window
  service: '10:30', // shown as "10:30am"
  serviceLabel: '10:30am',
} as const;
