// Build-time YouTube uploads: keyless RSS first; if that fails or is empty, the Data API (env YOUTUBE_API_KEY, 2 quota units a build).
// Zero videos fails the build so the last good deploy stays live. ALLOW_EMPTY_VIDEOS=1 builds without them (local work).
const CHANNEL = 'UCWcjfHPkDfMiiGgp0L8zDjQ';
const FEED = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL}`;

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
  /** "Sun, Oct 11, 2026": compact, for cards */
  dateCard: string;
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
    dateCard: fmt(d, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
    dateShort: fmt(d, { month: 'short', day: 'numeric' }),
    dateISO: d.toISOString().slice(0, 10),
  };
}

const decode = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

type Raw = { id: string; title: string; published: Date };

async function fromRss(): Promise<Raw[]> {
  try {
    const res = await fetch(FEED);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return [...(await res.text()).matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, e]) => ({
      id: e.match(/<yt:videoId>([^<]+)</)?.[1] ?? '',
      title: decode(e.match(/<title>([^<]*)</)?.[1] ?? ''),
      published: new Date(e.match(/<published>([^<]+)</)?.[1] ?? ''),
    }));
  } catch (e) {
    console.warn(`[youtube] RSS feed failed: ${(e as Error).message}`);
    return [];
  }
}

async function fromApi(key: string): Promise<Raw[]> {
  const api = async (path: string, q: Record<string, string>) => {
    const res = await fetch(`https://www.googleapis.com/youtube/v3/${path}?${new URLSearchParams({ ...q, key })}`);
    if (!res.ok) throw new Error(`${path} HTTP ${res.status}`);
    return res.json();
  };
  try {
    const ch = await api('channels', { part: 'contentDetails', id: CHANNEL });
    const uploads = ch.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!uploads) throw new Error('no uploads playlist');
    const pl = await api('playlistItems', { part: 'snippet,contentDetails', playlistId: uploads, maxResults: '50' });
    return (pl.items ?? [])
      .filter((i: any) => i.contentDetails?.videoPublishedAt) // private/deleted uploads have none
      .map((i: any) => ({ id: i.contentDetails.videoId, title: i.snippet.title, published: new Date(i.contentDetails.videoPublishedAt) }));
  } catch (e) {
    console.warn(`[youtube] Data API failed: ${(e as Error).message}`);
    return [];
  }
}

let uploads: Promise<Raw[]> | undefined; // one fetch per build, shared by every page
async function load(): Promise<Raw[]> {
  let list = (await fromRss()).filter((v) => v.id);
  const key = process.env.YOUTUBE_API_KEY;
  if (!list.length && key) list = (await fromApi(key)).filter((v) => v.id);
  if (!list.length) {
    const why = `no YouTube videos (RSS empty or down${key ? ', Data API failed too' : ', and YOUTUBE_API_KEY is not set'})`;
    if (process.env.ALLOW_EMPTY_VIDEOS !== '1') throw new Error(`[youtube] ${why}. Set ALLOW_EMPTY_VIDEOS=1 to build anyway.`);
    console.warn(`[youtube] ${why}; building without videos (ALLOW_EMPTY_VIDEOS=1).`);
  }
  return list;
}

export async function getVideos(limit = 15): Promise<Video[]> {
  return (await (uploads ??= load()))
    .map((v): Video => ({
      ...v,
      thumbnail: `https://i.ytimg.com/vi/${v.id}/maxresdefault.jpg`,
      thumbFallback: `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
      ...describe(v.title, v.published),
    }))
    .sort((a, b) => +b.published - +a.published)
    .slice(0, limit);
}
