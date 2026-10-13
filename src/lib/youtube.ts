// Build-time YouTube channel feed (keyless RSS). Fails soft: returns [] on any error.
const FEED = 'https://www.youtube.com/feeds/videos.xml?channel_id=UCWcjfHPkDfMiiGgp0L8zDjQ';

export interface Video {
  id: string;
  title: string;
  published: Date;
  thumbnail: string;
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
        return {
          id,
          title: decode(e.match(/<title>([^<]*)</)?.[1] ?? ''),
          published: new Date(e.match(/<published>([^<]+)</)?.[1] ?? ''),
          thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        };
      })
      .filter((v) => v.id)
      .sort((a, b) => +b.published - +a.published)
      .slice(0, limit);
  } catch {
    return [];
  }
}
