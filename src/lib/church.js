// Church facts: the single source. Plain JS so the Node server (email footer, groups board) uses the same values.
// site.ts re-exports this as CHURCH; change facts here only.
export const CHURCH = Object.freeze({
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
  mapsUrl: 'https://www.google.com/maps/dir/?api=1&destination=Riverside%20Community%20Church%2C%20239%20Columbia%20Ave%2C%20Horsham%2C%20PA%2019044',
  appleMapsUrl: 'https://maps.apple.com/?daddr=239%20Columbia%20Ave%2C%20Horsham%2C%20PA%2019044&q=Riverside%20Community%20Church',
  mapsEmbed: 'https://www.google.com/maps?q=Riverside+Community+Church,+239+Columbia+Ave,+Horsham,+PA+19044&z=15&output=embed',
  socials: {
    instagram: 'https://www.instagram.com/riversidechurch_horsham',
    youtube: 'https://www.youtube.com/channel/UCWcjfHPkDfMiiGgp0L8zDjQ',
    facebook: 'https://www.facebook.com/150401978326964',
  },
});
