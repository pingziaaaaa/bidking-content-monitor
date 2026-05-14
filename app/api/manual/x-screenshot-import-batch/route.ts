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


function parseDateString(value: string | null): string {
  if (!value) {
    return new Date().toISOString();
  }

  const parsed = Date.parse(value);
  if (Number.isFinite(parsed)) {
    return new Date(parsed).toISOString();
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
