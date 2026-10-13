// Build-time YouTube channel feed (keyless RSS). Fails soft: returns [] on any error.
const FEED = 'https://www.youtube.com/feeds/videos.xml?channel_id=UCWcjfHPkDfMiiGgp0L8zDjQ';

export interface Video {
  id: string;
  title: string;
  published: Date;
  thumbnail: string;
  /** hqdefault, used as the onerror fallback when maxres does not exist */
  thumbFallback: string;
  /** "Sunday Service" for livestreams, else the cleaned title */
  displayTitle: string;
  service: boolean;
  /** "Sunday, October 11, 2026": the service date from the title when present, else published */
  dateLabel: string;
  /** "Oct 11" */
  dateShort: string;
  dateISO: string;
}

const clean = (t: string) => t.replace(/^Riverside Community Church\s*\|\s*/i, '');
const fmt = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleDateString('en-US', { ...o, timeZone: 'UTC' });

function describe(title: string, published: Date) {
  const service = /livestream/i.test(title);
  const m = title.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  // Service date in the title is a calendar date: build it in UTC so no timezone shifts it.
  const ny = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(published); // YYYY-MM-DD
  const d = service && m ? new Date(Date.UTC(+m[3], +m[1] - 1, +m[2])) : new Date(ny);
  return {
    service,
    displayTitle: service ? 'Sunday Service' : clean(title),
    dateLabel: fmt(d, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
    dateShort: fmt(d, { month: 'short', day: 'numeric' }),
    dateISO: d.toISOString().slice(0, 10),
  };
}

const decode = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

export async function getVideos(limit = 15): Promise<Video[]> {
  try {
    const res = await fetch(FEED);
    if (!res.ok) return [];
    const xml = await res.text();
    return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)]
      .map(([, e]): Video => {
        const id = e.match(/<yt:videoId>([^<]+)</)?.[1] ?? '';
        const title = decode(e.match(/<title>([^<]*)</)?.[1] ?? '');
        const published = new Date(e.match(/<published>([^<]+)</)?.[1] ?? '');
        return {
          id,
          title,
          published,
          thumbnail: `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
          thumbFallback: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
          ...describe(title, published),
        };
      })
      .filter((v) => v.id)
      .sort((a, b) => +b.published - +a.published)
      .slice(0, limit);
  } catch {
    return [];
  }
}
