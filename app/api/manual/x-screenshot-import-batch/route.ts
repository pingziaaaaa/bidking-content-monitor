import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';
import type { Database } from '@/lib/supabase';

type ImportItem = {
  id: string;
  url: string | null;
  platform_content_id: string | null;
  creator: string;
  name: string | null;
  username: string | null;
  title: string;
  published_at: string | null;
  followers: number | null;
  impressions: number | null;
  source: string;
};

type FailedItem = {
  id: string;
  reason: string;
};

function parseXLink(rawLink: string): { username: string; tweetId: string; normalizedUrl: string } | null {
  try {
    const parsedUrl = new URL(rawLink.trim());
    const hostname = parsedUrl.hostname.toLowerCase();
    if (!['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'].includes(hostname)) {
      return null;
    }

    const path = parsedUrl.pathname.replace(/\/+/g, '/').replace(/\/$|^\//g, '');
    const match = path.match(/^([^/]+)\/status\/(\d+)/);
    if (!match) {
      return null;
    }

    const username = match[1];
    const tweetId = match[2];
    const normalizedUrl = `https://x.com/${username}/status/${tweetId}`;

    return { username, tweetId, normalizedUrl };
  } catch {
    return null;
  }
}


function normalizeUsernameValue(value: string | null | undefined): string | null {
  if (!value) return null;

  const cleaned = value
    .trim()
    .replace(/^@+/, '')
    .replace(/^https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\//i, '')
    .split(/[/?#]/)[0]
    .trim()
    .toLowerCase();

  if (!/^[a-z0-9_]{2,30}$/i.test(cleaned)) {
    return null;
  }

  return cleaned;
}

async function fetchHistoricalFollowers(
  supabase: any,
  username: string | null,
  creator: string,
) {
  const normalizedUsername = username || normalizeUsernameValue(creator);

  if (!normalizedUsername) {
    return null;
  }

  const creatorCandidates = [`@${normalizedUsername}`, normalizedUsername];

  for (const candidate of creatorCandidates) {
    const response = await supabase
      .from('content_items')
      .select('followers, discovered_at, created_at')
      .eq('platform', 'X')
      .eq('creator', candidate)
      .not('followers', 'is', null)
      .order('discovered_at', { ascending: false })
      .limit(1);

    if (!response.error && Array.isArray(response.data) && response.data[0]?.followers) {
      const followers = Number(response.data[0].followers);

      if (Number.isFinite(followers) && followers > 0) {
        return followers;
      }
    }
  }

  return null;
}


function toBeijingDisplayIso(year: number, month: number, day: number, hour: number, minute: number) {
  // 截图里的 X 时间按北京时间展示时间处理。
  // Supabase 存 timestamptz，所以这里转成 UTC ISO；前端按北京时间显示时会还原为截图时间。
  const utcTime = Date.UTC(year, month - 1, day, hour - 8, minute, 0);
  return new Date(utcTime).toISOString();
}

function monthNameToNumber(value: string) {
  const map: Record<string, number> = {
    jan: 1,
    january: 1,
    feb: 2,
    february: 2,
    mar: 3,
    march: 3,
    apr: 4,
    april: 4,
    may: 5,
    jun: 6,
    june: 6,
    jul: 7,
    july: 7,
    aug: 8,
    august: 8,
    sep: 9,
    sept: 9,
    september: 9,
    oct: 10,
    october: 10,
    nov: 11,
    november: 11,
    dec: 12,
    december: 12,
  };

  return map[value.toLowerCase()] ?? 0;
}

function parseDateString(value: string | null): string {
  if (!value) {
    return new Date().toISOString();
  }

  const raw = value.trim();

  if (!raw) {
    return new Date().toISOString();
  }

  const cleaned = raw
    .replace(/[\u3000]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/・/g, '·')
    .replace(/•/g, '·')
    .replace(/\s+Views?.*$/i, '')
    .replace(/\s+Impressions?.*$/i, '')
    .trim();

  // X 英文格式：6:37 PM · May 13, 2026
  const englishXMatch = cleaned.match(/(\d{1,2}):(\d{2})\s*(AM|PM)\s*·\s*([A-Za-z]{3,9})\s+(\d{1,2}),\s*(\d{4})/i);
  if (englishXMatch) {
    let hour = Number(englishXMatch[1]);
    const minute = Number(englishXMatch[2]);
    const ampm = englishXMatch[3].toUpperCase();
    const month = monthNameToNumber(englishXMatch[4]);
    const day = Number(englishXMatch[5]);
    const year = Number(englishXMatch[6]);

    if (ampm === 'PM' && hour < 12) hour += 12;
    if (ampm === 'AM' && hour === 12) hour = 0;

    if (month) {
      return toBeijingDisplayIso(year, month, day, hour, minute);
    }
  }

  // X 英文格式反向：May 13, 2026 · 6:37 PM
  const englishReverseMatch = cleaned.match(/([A-Za-z]{3,9})\s+(\d{1,2}),\s*(\d{4})\s*·\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (englishReverseMatch) {
    const month = monthNameToNumber(englishReverseMatch[1]);
    const day = Number(englishReverseMatch[2]);
    const year = Number(englishReverseMatch[3]);
    let hour = Number(englishReverseMatch[4]);
    const minute = Number(englishReverseMatch[5]);
    const ampm = englishReverseMatch[6].toUpperCase();

    if (ampm === 'PM' && hour < 12) hour += 12;
    if (ampm === 'AM' && hour === 12) hour = 0;

    if (month) {
      return toBeijingDisplayIso(year, month, day, hour, minute);
    }
  }

  // 中文 / 日文格式：2026年5月14日 17:21、5月14日 17:21、2026年5月14日 下午5:21
  const cjkMatch = cleaned.match(/(?:(\d{4})年)?\s*(\d{1,2})月\s*(\d{1,2})日(?:[^\d]*(上午|下午|午前|午後))?\s*(\d{1,2}):(\d{2})/);
  if (cjkMatch) {
    const now = new Date();
    const year = Number(cjkMatch[1] || now.getFullYear());
    const month = Number(cjkMatch[2]);
    const day = Number(cjkMatch[3]);
    const period = cjkMatch[4] || '';
    let hour = Number(cjkMatch[5]);
    const minute = Number(cjkMatch[6]);

    if ((period === '下午' || period === '午後') && hour < 12) hour += 12;
    if ((period === '上午' || period === '午前') && hour === 12) hour = 0;

    return toBeijingDisplayIso(year, month, day, hour, minute);
  }

  // 数字格式：2026-05-14 17:21、2026/05/14 17:21
  const numericMatch = cleaned.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})\s+(\d{1,2}):(\d{2})/);
  if (numericMatch) {
    const [, y, m, d, h, min] = numericMatch;
    return toBeijingDisplayIso(Number(y), Number(m), Number(d), Number(h), Number(min));
  }

  const directParsed = Date.parse(cleaned);
  if (Number.isFinite(directParsed)) {
    return new Date(directParsed).toISOString();
  }

  return new Date().toISOString();
}


export async function POST(request: NextRequest) {
  const requestBody = await request.json().catch(() => null);
  const items = Array.isArray(requestBody?.items) ? requestBody.items as ImportItem[] : [];

  if (!items.length) {
    return NextResponse.json(
      { ok: false, message: '请求参数不合法，请提供 items 列表。' },
      { status: 400 },
    );
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, insertedCount: 0, updatedCount: 0, failedCount: items.length, message: 'Supabase 未配置，无法写入 content_items。' },
      { status: 500 },
    );
  }

  const supabase = createServerSupabaseClient() as any;
  if (!supabase) {
    return NextResponse.json(
      { ok: false, insertedCount: 0, updatedCount: 0, failedCount: items.length, message: 'Supabase client 初始化失败。' },
      { status: 500 },
    );
  }

  let insertedCount = 0;
  let updatedCount = 0;
  let failedCount = 0;
  const failedItems: FailedItem[] = [];
  const now = new Date().toISOString();

  for (const item of items) {
    const originalUrl = item.url?.trim() || '';
    const linkInfo = originalUrl ? parseXLink(originalUrl) : null;
    const url = linkInfo?.normalizedUrl ?? '';
    const platformContentId = linkInfo?.tweetId ?? null;
    const creator = item.creator?.trim() || (item.username ? `@${item.username.replace(/^@+/, '')}` : item.name || '未知创作者');
    const title = item.title?.trim() || item.name || creator || '待补充';
    const source = url ? '截图识别' : '截图识别缺链接';
    const discoveredAt = parseDateString(item.published_at);
    const normalizedUsername = normalizeUsernameValue(item.username) || normalizeUsernameValue(linkInfo?.username ?? null) || normalizeUsernameValue(creator);
    const followers = item.followers ?? await fetchHistoricalFollowers(supabase, normalizedUsername, creator);

    if (platformContentId) {
      const existingResponse = await supabase
        .from('content_items')
        .select('id')
        .eq('platform', 'X')
        .eq('platform_content_id', platformContentId)
        .maybeSingle();

      if (existingResponse.error) {
        failedCount += 1;
        failedItems.push({ id: item.id, reason: `Supabase 查询失败：${existingResponse.error.message}` });
        continue;
      }

      const existingRow = existingResponse.data;
      const updateData: Database['public']['Tables']['content_items']['Update'] = {
        platform: 'X',
        platform_content_id: platformContentId,
        title,
        url,
        creator,
        source,
        discovered_at: discoveredAt,
        followers: followers ?? null,
        impressions: item.impressions ?? null,
      };

      if (existingRow) {
        const updateResponse = await supabase.from('content_items').update(updateData as any).eq('id', existingRow.id);
        if (updateResponse.error) {
          failedCount += 1;
          failedItems.push({ id: item.id, reason: `Supabase 更新失败：${updateResponse.error.message}` });
          continue;
        }

        updatedCount += 1;
        continue;
      }

      const insertData: Database['public']['Tables']['content_items']['Insert'] = {
        platform: 'X',
        platform_content_id: platformContentId,
        title,
        url,
        creator,
        source,
        discovered_at: discoveredAt,
        followers: followers ?? null,
        impressions: item.impressions ?? null,
        views: null,
        engagements: null,
        peak_viewers: null,
        vod_views: null,
      };

      const insertResponse = await supabase.from('content_items').insert(insertData as any);
      if (insertResponse.error) {
        failedCount += 1;
        failedItems.push({ id: item.id, reason: `Supabase 写入失败：${insertResponse.error.message}` });
        continue;
      }

      insertedCount += 1;
      continue;
    }

    const insertData: Database['public']['Tables']['content_items']['Insert'] = {
      platform: 'X',
      platform_content_id: null,
      title,
      url: '',
      creator,
      source,
      discovered_at: discoveredAt,
      followers: followers ?? null,
      impressions: item.impressions ?? null,
      views: null,
      engagements: null,
      peak_viewers: null,
      vod_views: null,
    };

    const insertResponse = await supabase.from('content_items').insert(insertData as any);
    if (insertResponse.error) {
      failedCount += 1;
      failedItems.push({ id: item.id, reason: `Supabase 写入失败：${insertResponse.error.message}` });
      continue;
    }

    insertedCount += 1;
  }

  return NextResponse.json({ ok: true, insertedCount, updatedCount, failedCount, failedItems, message: '批量截图识别写入完成。'});
}
