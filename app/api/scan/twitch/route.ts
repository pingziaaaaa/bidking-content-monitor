import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const USERS_URL = 'https://api.twitch.tv/helix/users';
const VIDEOS_URL = 'https://api.twitch.tv/helix/videos';

type ChannelSeed = {
  login: string;
  displayName: string | null;
  followersFallback: number | null;
};

type StreamRow = {
  startText: string;
  startIso: string | null;
  streamLengthHours: number | null;
  avgViewers: number | null;
  peakViewers: number | null;
  watchTimeHours: number | null;
  followersDelta: number | null;
  containsBidKing: boolean;
  rawText: string;
};

type TwitchVideo = {
  id: string;
  title: string;
  url: string;
  user_id: string;
  user_name: string;
  created_at: string;
  published_at: string | null;
  view_count: number | null;
  duration: string | null;
  type: string | null;
};

function jsonError(message: string, status = 500) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function stripHtml(html: string): string {
  return decodeEntities(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseNumber(value?: string | null): number | null {
  if (!value) return null;
  const normalized = value.replace(/,/g, '').trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseFollowers(text: string): number | null {
  const match = text.match(/Followers\s*[:\s]\s*([\d,]+)/i);
  return parseNumber(match?.[1] ?? null);
}

function parseChannelDisplayName(text: string, login: string): string | null {
  const loginRegex = escapeRegExp(login);
  const match = text.match(new RegExp(`([^\\s()]{1,80})\\s*\\(${loginRegex}\\)`, 'i'));

  if (!match?.[1]) return null;

  const candidate = match[1].trim();

  if (/SullyGnome|Twitch|Summary|Streams|Games|Search|Home|Channels/i.test(candidate)) {
    return null;
  }

  return candidate;
}

function parseSullyStartToIso(startText: string): string | null {
  const match = startText.match(
    /\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+([A-Z][a-z]{2})\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\d{1,2}):(\d{2})\b/
  );

  if (!match) return null;

  const monthMap: Record<string, number> = {
    Jan: 0,
    Feb: 1,
    Mar: 2,
    Apr: 3,
    May: 4,
    Jun: 5,
    Jul: 6,
    Aug: 7,
    Sep: 8,
    Oct: 9,
    Nov: 10,
    Dec: 11,
  };

  const month = monthMap[match[1]];
  const day = Number(match[2]);
  const hour = Number(match[3]);
  const minute = Number(match[4]);

  if (month === undefined || !Number.isFinite(day) || !Number.isFinite(hour) || !Number.isFinite(minute)) {
    return null;
  }

  const now = new Date();
  let year = now.getUTCFullYear();
  const candidate = new Date(Date.UTC(year, month, day, hour, minute, 0));

  if (candidate.getTime() - now.getTime() > 1000 * 60 * 60 * 24 * 30) {
    year -= 1;
  }

  return new Date(Date.UTC(year, month, day, hour, minute, 0)).toISOString();
}

function rowContainsBidKing(rowHtml: string, rowText: string): boolean {
  return /Bid\s*King|bidking|\/game\/bidking|458263763/i.test(rowHtml) || /Bid\s*King|bidking/i.test(rowText);
}

function parseStreamRow(rowText: string, rowHtml = ''): StreamRow | null {
  const cleaned = stripHtml(rowText || rowHtml);

  const match = cleaned.match(
    /\b((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+[A-Z][a-z]{2}\s+\d{1,2}(?:st|nd|rd|th)?\s+\d{1,2}:\d{2})\s+([\d.]+)\s*hrs\s+([\d,]+)\s+([\d,]+)\s+([\d.]+)\s*hrs\s+(-?[\d,]+)/i
  );

  if (!match) return null;

  return {
    startText: match[1],
    startIso: parseSullyStartToIso(match[1]),
    streamLengthHours: parseNumber(match[2]),
    avgViewers: parseNumber(match[3]),
    peakViewers: parseNumber(match[4]),
    watchTimeHours: parseNumber(match[5]),
    followersDelta: parseNumber(match[6]),
    containsBidKing: rowContainsBidKing(rowHtml, cleaned),
    rawText: cleaned,
  };
}

function parseStreamRowsFromSullyChannel(html: string, text: string): {
  rows: StreamRow[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const rows: StreamRow[] = [];

  const trMatches = html.match(/<tr[\s\S]*?<\/tr>/gi) ?? [];

  for (const rowHtml of trMatches) {
    const rowText = stripHtml(rowHtml);
    if (!/(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+[A-Z][a-z]{2}/.test(rowText)) continue;

    const row = parseStreamRow(rowText, rowHtml);
    if (row) rows.push(row);
  }

  if (rows.length > 0) {
    return { rows: rows.filter((row) => row.containsBidKing), warnings };
  }

  warnings.push('SullyGnome HTML row parsing failed; using plain text fallback.');

  const textPattern =
    /\b((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+[A-Z][a-z]{2}\s+\d{1,2}(?:st|nd|rd|th)?\s+\d{1,2}:\d{2}\s+[\d.]+\s*hrs\s+[\d,]+\s+[\d,]+\s+[\d.]+\s*hrs\s+-?[\d,]+)/gi;

  const plainRows = text.match(textPattern) ?? [];

  for (const plainRow of plainRows) {
    const row = parseStreamRow(plainRow, '');
    if (row) rows.push(row);
  }

  if (rows.length > 0 && /Bid\s*King|bidking|\/game\/bidking|458263763/i.test(html)) {
    warnings.push('Row-level game detection unavailable; treating parsed stream rows as Bid King rows because channel page contains Bid King context.');
    return {
      rows: rows.map((row) => ({
        ...row,
        containsBidKing: true,
      })),
      warnings,
    };
  }

  return { rows: [], warnings };
}

function isWithinDays(iso: string | null, days: number): boolean {
  if (!iso) return false;

  const time = new Date(iso).getTime();
  if (!Number.isFinite(time)) return false;

  const now = Date.now();
  const min = now - days * 24 * 60 * 60 * 1000;
  const max = now + 24 * 60 * 60 * 1000;

  return time >= min && time <= max;
}

async function fetchHtmlWithRetry(url: string, retries = 3): Promise<{ status: number; html: string }> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0',
          Accept: 'text/html',
        },
        redirect: 'follow',
      });

      if ((response.status === 502 || response.status === 503 || response.status === 504) && attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
        continue;
      }

      const html = await response.text();
      return { status: response.status, html };
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
      }
    }
  }

  throw lastError;
}

function parseChannelsFromMostWatched(html: string): ChannelSeed[] {
  const seeds = new Map<string, ChannelSeed>();

  const anchorRegex = /<a[^>]+href=["']\/channel\/([^\/"']+)(?:\/\d+)?["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = anchorRegex.exec(html))) {
    const login = decodeURIComponent(match[1]).trim();
    const label = stripHtml(match[2]);

    if (!login || /^(games|teams|search)$/i.test(login)) continue;

    const displayMatch = label.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
    const displayName = displayMatch?.[1]?.trim() || label.replace(/\(.+?\)/g, '').trim() || null;

    if (!seeds.has(login)) {
      seeds.set(login, {
        login,
        displayName,
        followersFallback: null,
      });
    }
  }

  return Array.from(seeds.values());
}

async function fetchSullyChannel(login: string, days: number) {
  const url = `https://sullygnome.com/channel/${encodeURIComponent(login)}/${days}`;
  const { status, html } = await fetchHtmlWithRetry(url, 3);
  const text = stripHtml(html);
  const followers = parseFollowers(text);
  const channelDisplayName = parseChannelDisplayName(text, login);
  const parsed = parseStreamRowsFromSullyChannel(html, text);

  return {
    status,
    url,
    followers,
    channelDisplayName,
    rows: parsed.rows.filter((row) => isWithinDays(row.startIso, days)),
    warnings: parsed.warnings,
  };
}

async function fetchAccessToken(clientId: string, clientSecret: string) {
  const params = new URLSearchParams();
  params.append('client_id', clientId);
  params.append('client_secret', clientSecret);
  params.append('grant_type', 'client_credentials');

  const response = await fetch(TOKEN_URL, { method: 'POST', body: params });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Twitch token request failed: ${response.status} ${body}`);
  }

  const data = await response.json();

  if (!data.access_token) {
    throw new Error(`Twitch token response missing access_token: ${JSON.stringify(data)}`);
  }

  return data.access_token as string;
}

async function fetchTwitchUser(clientId: string, accessToken: string, login: string) {
  const url = new URL(USERS_URL);
  url.searchParams.set('login', login);

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Client-Id': clientId,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Twitch user fetch failed for ${login}: ${response.status} ${body}`);
  }

  const data = await response.json();
  const user = Array.isArray(data.data) ? data.data[0] : null;

  if (!user) return null;

  return {
    id: String(user.id),
    login: String(user.login),
    displayName: String(user.display_name || user.login),
  };
}

async function fetchTwitchVideos(clientId: string, accessToken: string, userId: string, days: number): Promise<TwitchVideo[]> {
  const period = days <= 7 ? 'week' : 'month';
  const url = new URL(VIDEOS_URL);
  url.searchParams.set('user_id', userId);
  url.searchParams.set('period', period);
  url.searchParams.set('sort', 'time');
  url.searchParams.set('first', '20');
  url.searchParams.set('type', 'archive');

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Client-Id': clientId,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Twitch videos fetch failed: ${response.status} ${body}`);
  }

  const data = await response.json();
  const videos = Array.isArray(data.data) ? data.data : [];

  return videos.map((video: any) => ({
    id: String(video.id),
    title: String(video.title || ''),
    url: String(video.url || `https://www.twitch.tv/videos/${video.id}`),
    user_id: String(video.user_id || ''),
    user_name: String(video.user_name || ''),
    created_at: String(video.created_at || ''),
    published_at: video.published_at ? String(video.published_at) : null,
    view_count: typeof video.view_count === 'number' ? video.view_count : null,
    duration: typeof video.duration === 'string' ? video.duration : null,
    type: video.type ? String(video.type) : null,
  }));
}

function findMatchingVod(row: StreamRow, videos: TwitchVideo[]): TwitchVideo | null {
  if (!row.startIso) return null;

  const startTime = new Date(row.startIso).getTime();
  if (!Number.isFinite(startTime)) return null;

  let best: { video: TwitchVideo; diff: number } | null = null;

  for (const video of videos) {
    const createdTime = new Date(video.created_at).getTime();
    if (!Number.isFinite(createdTime)) continue;

    const diff = Math.abs(createdTime - startTime);
    const maxDiff = 60 * 60 * 1000;

    if (diff <= maxDiff && (!best || diff < best.diff)) {
      best = { video, diff };
    }
  }

  return best?.video ?? null;
}

async function upsertTwitchContent(item: {
  platform_content_id: string;
  title: string;
  url: string;
  creator: string;
  discovered_at: string;
  followers: number | null;
  peak_viewers: number | null;
  vod_views: number | null;
}) {
  const supabase = createServerSupabaseClient();

  if (!supabase) {
    throw new Error('Supabase 未配置');
  }

  const db = supabase as any;

  const payload = {
    platform: 'Twitch',
    platform_content_id: item.platform_content_id,
    title: item.title,
    url: item.url,
    creator: item.creator,
    source: 'SullyGnome + Twitch VOD',
    discovered_at: item.discovered_at,
    followers: item.followers,
    views: null,
    impressions: null,
    engagements: null,
    peak_viewers: item.peak_viewers,
    vod_views: item.vod_views,
  };

  const existing = await db
    .from('content_items')
    .select('id')
    .eq('platform', 'Twitch')
    .eq('platform_content_id', item.platform_content_id)
    .maybeSingle();

  if (existing.error) {
    throw existing.error;
  }

  const existingId = (existing.data as { id: string } | null)?.id;

  if (existingId) {
    const updated = await db
      .from('content_items')
      .update(payload)
      .eq('id', existingId);

    if (updated.error) {
      throw updated.error;
    }

    return 'updated' as const;
  }

  const inserted = await db.from('content_items').insert(payload);

  if (inserted.error) {
    throw inserted.error;
  }

  return 'inserted' as const;
}

async function parseRequest(request: Request) {
  let days = 3;
  let maxChannels = 20;
  let dryRun = false;

  try {
    const body = await request.json();

    if (body?.days === 7) days = 7;
    if (typeof body?.maxChannels === 'number' && body.maxChannels > 0) {
      maxChannels = Math.min(Math.floor(body.maxChannels), 50);
    }
    if (body?.dryRun === true) dryRun = true;
  } catch {
    // allow empty body
  }

  return { days, maxChannels, dryRun };
}

export async function POST(request: Request) {
  const clientId = String(process.env.TWITCH_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.TWITCH_CLIENT_SECRET || '').trim();

  if (!clientId || !clientSecret) {
    return jsonError('Twitch Client ID / Secret 未配置');
  }

  const { days, maxChannels, dryRun } = await parseRequest(request);
  const warnings: string[] = [];
  const failedChannels: Array<{ login: string; error: string }> = [];
  const processedItems: Array<{
    login: string;
    creator: string;
    title: string;
    url: string;
    followers: number | null;
    peakViewers: number | null;
    vodViews: number | null;
    startIso: string;
    vodCreatedAt: string;
    action: 'inserted' | 'updated' | 'dryRun';
  }> = [];

  let insertedCount = 0;
  let updatedCount = 0;
  let matchedStreams = 0;
  let skippedNoVodMatch = 0;
  let scannedChannels = 0;

  try {
    const mostWatchedUrl = `https://sullygnome.com/game/bidking/${days}/watched`;
    const mostWatched = await fetchHtmlWithRetry(mostWatchedUrl, 3);
    const channelSeeds = parseChannelsFromMostWatched(mostWatched.html).slice(0, maxChannels);

    if (channelSeeds.length === 0) {
      return NextResponse.json({
        ok: false,
        days,
        scannedChannels: 0,
        matchedStreams: 0,
        insertedCount: 0,
        updatedCount: 0,
        skippedNoVodMatch: 0,
        failedChannels: [],
        warnings: ['未能从 SullyGnome Most watched 页面解析出频道列表'],
        items: [],
        message: 'Twitch：SullyGnome 巡查失败，未解析到频道。',
      });
    }

    const accessToken = await fetchAccessToken(clientId, clientSecret);

    for (const seed of channelSeeds) {
      scannedChannels += 1;

      try {
        const sully = await fetchSullyChannel(seed.login, days);

        for (const warning of sully.warnings) {
          warnings.push(`${seed.login}: ${warning}`);
        }

        if (sully.rows.length === 0) {
          warnings.push(`${seed.login}: 未解析到 Bid King stream rows`);
          continue;
        }

        const twitchUser = await fetchTwitchUser(clientId, accessToken, seed.login);

        if (!twitchUser) {
          failedChannels.push({ login: seed.login, error: 'Twitch 用户不存在或无法通过 login 查询' });
          continue;
        }

        const videos = await fetchTwitchVideos(clientId, accessToken, twitchUser.id, days);
        const followers = sully.followers ?? seed.followersFallback ?? null;
        const creator = sully.channelDisplayName || seed.displayName || twitchUser.displayName || seed.login;

        for (const row of sully.rows) {
          const matchedVod = findMatchingVod(row, videos);

          if (!matchedVod) {
            skippedNoVodMatch += 1;
            continue;
          }

          matchedStreams += 1;

          const action = dryRun
            ? 'dryRun'
            : await upsertTwitchContent({
                platform_content_id: matchedVod.id,
                title: matchedVod.title || `${creator} - Bid King stream`,
                url: matchedVod.url || `https://www.twitch.tv/${seed.login}`,
                creator,
                discovered_at: matchedVod.created_at || row.startIso || new Date().toISOString(),
                followers,
                peak_viewers: row.peakViewers,
                vod_views: matchedVod.view_count,
              });

          if (action === 'inserted') insertedCount += 1;
          if (action === 'updated') updatedCount += 1;

          processedItems.push({
            login: seed.login,
            creator,
            title: matchedVod.title || `${creator} - Bid King stream`,
            url: matchedVod.url,
            followers,
            peakViewers: row.peakViewers,
            vodViews: matchedVod.view_count,
            startIso: row.startIso || '',
            vodCreatedAt: matchedVod.created_at,
            action,
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failedChannels.push({ login: seed.login, error: message });
      }
    }

    return NextResponse.json({
      ok: true,
      days,
      dryRun,
      scannedChannels,
      matchedStreams,
      insertedCount,
      updatedCount,
      skippedNoVodMatch,
      failedChannels,
      warnings,
      items: processedItems.slice(0, 50),
      message: dryRun
        ? `Twitch：Dry run 完成，扫描 ${scannedChannels} 个频道，匹配 ${matchedStreams} 条 VOD。`
        : `Twitch：SullyGnome + Twitch VOD 巡查完成，扫描 ${scannedChannels} 个频道，匹配 ${matchedStreams} 条，新增 ${insertedCount} 个，更新 ${updatedCount} 个。`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return NextResponse.json({
      ok: false,
      days,
      dryRun,
      scannedChannels,
      matchedStreams,
      insertedCount,
      updatedCount,
      skippedNoVodMatch,
      failedChannels,
      warnings,
      items: processedItems,
      error: message,
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: 'Use POST /api/scan/twitch with optional body {"days":3,"maxChannels":20,"dryRun":true}',
  });
}
