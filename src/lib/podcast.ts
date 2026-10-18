// Build-time sermon podcast feed. Fails soft: returns [] on any error.
export const APPLE_PODCASTS_URL = 'https://podcasts.apple.com/podcast/id387370044';
const FEED = 'https://www.riversideconnect.com/feeds/sermons';

export interface Sermon {
  /** Feed GUID: the key for staff title overrides */
  guid: string;
  title: string;
  pubDate: Date;
  audioUrl: string;
  duration?: string;
  description: string;
  image?: string;
}

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();

const tag = (xml: string, name: string) =>
  xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`))?.[1];
const attr = (xml: string, name: string, a: string) =>
  xml.match(new RegExp(`<${name}\\b[^>]*\\b${a}="([^"]*)"`))?.[1];

export async function getSermons(): Promise<Sermon[]> {
  try {
    const res = await fetch(FEED);
    if (!res.ok) return [];
    const xml = await res.text();
    return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
      .map(([, item]): Sermon => ({
        guid: decode(tag(item, 'guid') ?? attr(item, 'enclosure', 'url') ?? ''),
        title: decode(tag(item, 'title') ?? ''),
        pubDate: new Date(tag(item, 'pubDate') ?? ''),
        audioUrl: decode(attr(item, 'enclosure', 'url') ?? ''),
        duration: tag(item, 'itunes:duration')?.trim(),
        description: decode(tag(item, 'description') ?? ''),
        image: attr(item, 'itunes:image', 'href'),
      }))
      .filter((s) => s.title && !isNaN(+s.pubDate))
      .sort((a, b) => +b.pubDate - +a.pubDate);
  } catch {
    return [];
  }
}
