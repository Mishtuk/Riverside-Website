// Sermon podcast archive: a snapshot of riversideconnect.com/feeds/sermons taken 2026-10-19 (stale since June 2020; the feed
// and probably its audio go away when the old vendor's contract ends). Audio URLs still point at the vendor's host, cpmfiles1.com.
import snapshot from '../content/podcast.json';
export const APPLE_PODCASTS_URL = 'https://podcasts.apple.com/podcast/id387370044';

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

export async function getSermons(): Promise<Sermon[]> {
  return snapshot.map((s) => ({ ...s, pubDate: new Date(s.pubDate) }));
}
