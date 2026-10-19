// Nav, base-aware links and the livestream window. Church facts live in church.js (re-exported here as CHURCH).
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

/** Base-aware internal URL: href('/im-new') -> '/Riverside-Website/im-new' */
export const href = (path = '/') => `${BASE}${path.startsWith('/') ? path : `/${path}`}`;

/** Photo from public/media/photos (name or path). Large 1920w file + -960 small file; storytime is a 1500px native crop. */
const PHOTO_W: Record<string, number> = { storytime: 1500 };
export const photo = (p: string) => {
  const n = p.split('/').pop()!.replace(/\.jpg$/, '');
  const w = PHOTO_W[n] ?? 1920;
  return {
    src: href(`/media/photos/${n}.jpg`),
    srcset: `${href(`/media/photos/${n}-960.jpg`)} 960w, ${href(`/media/photos/${n}.jpg`)} ${w}w`,
    width: w, height: Math.round((w * 9) / 16),
  };
};

export { CHURCH } from './church.js';

export const NAV = [
  { label: "I'm New", path: '/im-new' },
  { label: 'About', path: '/about' },
  { label: 'Watch', path: '/watch' },
  { label: 'Podcast', path: '/podcast' },
  { label: 'Get Involved', path: '/get-involved' },
  { label: 'Groups', path: '/groups' },
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
