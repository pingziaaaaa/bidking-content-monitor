import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';
import type { Database } from '@/lib/supabase';

type FailedLink = {
  link: string;
  reason: string;
};

type XApiResult = {
  success: boolean;
  tweetText?: string;
  createdAt?: string;
  followers?: number | null;
  impressions?: number | null;
  engagements?: number | null;
  error?: string;
};

type ParsedXLink = {
  username: string;
  tweetId: string;
  normalizedUrl: string;
  creator: string;
};

function parseXLink(rawLink: string): ParsedXLink | { error: string } {
  try {
    const parsedUrl = new URL(rawLink.trim());
    const hostname = parsedUrl.hostname.toLowerCase();

    if (!['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'].includes(hostname)) {
      return { error: '不是 X / Twitter 链接' };
    }

    const path = parsedUrl.pathname.replace(/\/+/g, '/').replace(/\/+$|^\//g, '');
    const match = path.match(/^([^/]+)\/status\/(\d+)$/);

    if (!match) {
      return { error: '链接格式不符合 x.com/{username}/status/{tweetId}' };
    }

    const username = match[1];
    const tweetId = match[2];
    const normalizedUrl = `https://x.com/${username}/status/${tweetId}`;

    return {
      username,
      tweetId,
      normalizedUrl,
      creator: `@${username}`,
    };
  } catch {
    return { error: '链接解析失败' };
  }
}

function parseNumberValue(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const cleaned = String(value).replace(/,/g, '').trim();
  if (cleaned === '') {
    return null;
  }

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function sumEngagements(metrics: Record<string, unknown> | undefined): number | null {
  if (!metrics || typeof metrics !== 'object') {
    return null;
  }

  const counts = [
    metrics.like_count,
    metrics.reply_count,
    metrics.retweet_count,
    metrics.quote_count,
    metrics.bookmark_count,
  ]
    .map((value) => parseNumberValue(value))
    .filter((value): value is number => value !== null);

  if (counts.length === 0) {
    return null;
  }

  return counts.reduce((sum, value) => sum + value, 0);
}

async function fetchTweetData(tweetId: string, bearerToken: string): Promise<XApiResult> {
  const url = new URL('https://api.x.com/2/tweets');
  url.searchParams.set('ids', tweetId);
  url.searchParams.set('tweet.fields', 'created_at,public_metrics');
  url.searchParams.set('expansions', 'author_id');
  url.searchParams.set('user.fields', 'username,public_metrics');

  try {
    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      let message = `X API 返回 ${response.status}`;

      try {
        const errorData = await response.json();
        if (errorData?.errors?.length) {
          message += `：${errorData.errors[0].message}`;
        } else if (typeof errorData?.detail === 'string') {
          message += `：${errorData.detail}`;
        }
      } catch {
        // ignore parse error
      }

      return { success: false, error: message };
    }

    const payload = await response.json();
    const tweet = Array.isArray(payload?.data) ? payload.data[0] : payload?.data;

    if (!tweet) {
      return { success: false, error: 'X API 未返回 tweet 数据' };
    }

    const user = Array.isArray(payload?.includes?.users) ? payload.includes.users[0] : undefined;
    const followers = parseNumberValue(user?.public_metrics?.followers_count);
    const impressions = parseNumberValue(tweet.public_metrics?.impression_count);
    const engagements = sumEngagements(tweet.public_metrics);

    return {
      success: true,
      tweetText: typeof tweet.text === 'string' ? tweet.text : '待补充',
      createdAt: typeof tweet.created_at === 'string' ? tweet.created_at : undefined,
      followers,
      impressions,
      engagements,
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'X API 请求失败' };
  }
}

export async function POST(request: NextRequest) {
  const requestBody = await request.json().catch(() => null);
  const links = Array.isArray(requestBody?.links) ? requestBody.links.filter((item: unknown) => typeof item === 'string') as string[] : [];

  if (!links.length) {
    return NextResponse.json(
      {
        ok: false,
        insertedCount: 0,
        updatedCount: 0,
        failedLinks: [],
        apiSuccessCount: 0,
        fallbackCount: 0,
        message: '请求参数不合法，请提供 links 字段。',
      },
      { status: 400 },
    );
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        insertedCount: 0,
        updatedCount: 0,
        failedLinks: [],
        apiSuccessCount: 0,
        fallbackCount: 0,
        message: 'Supabase 未配置，无法写入 content_items。',
      },
      { status: 500 },
    );
  }

  const supabase = createServerSupabaseClient() as any;
  if (!supabase) {
    return NextResponse.json(
      {
        ok: false,
        insertedCount: 0,
        updatedCount: 0,
        failedLinks: [],
        apiSuccessCount: 0,
        fallbackCount: 0,
        message: 'Supabase client 初始化失败。',
      },
      { status: 500 },
    );
  }

  const xBearerToken = String(process.env.X_BEARER_TOKEN || '').trim();
  const now = new Date().toISOString();

  let insertedCount = 0;
  let updatedCount = 0;
  let apiSuccessCount = 0;
  let fallbackCount = 0;
  const failedLinks: FailedLink[] = [];
  const processedTweetIds = new Set<string>();

  for (const link of links) {
    const parsed = parseXLink(link);
    if ('error' in parsed) {
      failedLinks.push({ link, reason: parsed.error });
      continue;
    }

    const { username, tweetId, normalizedUrl, creator } = parsed;
    if (processedTweetIds.has(tweetId)) {
      continue;
    }

    processedTweetIds.add(tweetId);

    let apiResult: XApiResult = { success: false, error: 'X API 未尝试' };
    if (xBearerToken) {
      apiResult = await fetchTweetData(tweetId, xBearerToken);
    } else {
      apiResult = { success: false, error: 'X_BEARER_TOKEN 未配置' };
    }

    const apiSuccess = apiResult.success && apiResult.tweetText;
    const existingResponse = await supabase
      .from('content_items')
      .select('id,source,title,discovered_at,followers,impressions')
      .eq('platform', 'X')
      .eq('platform_content_id', tweetId)
      .maybeSingle();

    if (existingResponse.error) {
      failedLinks.push({ link, reason: `Supabase 查询失败：${existingResponse.error.message}` });
      continue;
    }

    const existingRow = existingResponse.data;

    if (existingRow) {
      if (apiSuccess) {
        const updateData: Database['public']['Tables']['content_items']['Update'] = {
          title: apiResult.tweetText as string,
          url: normalizedUrl,
          creator,
          followers: apiResult.followers ?? null,
          impressions: apiResult.impressions ?? null,
          engagements: apiResult.engagements ?? null,
          discovered_at: apiResult.createdAt ?? now,
          source: '链接识别',
        };

        const updateResponse = await supabase.from('content_items').update(updateData as any).eq('id', existingRow.id);
        if (updateResponse.error) {
          failedLinks.push({ link, reason: `Supabase 更新失败：${updateResponse.error.message}` });
          continue;
        }

        apiSuccessCount += 1;
        updatedCount += 1;
      } else {
        const updateData: Database['public']['Tables']['content_items']['Update'] = {
          url: normalizedUrl,
          creator,
        };

        if (!existingRow.source) {
          updateData.source = '链接导入待补充';
        }

        const updateResponse = await supabase.from('content_items').update(updateData as any).eq('id', existingRow.id);
        if (updateResponse.error) {
          failedLinks.push({ link, reason: `Supabase 更新失败：${updateResponse.error.message}` });
          continue;
        }

        fallbackCount += 1;
        updatedCount += 1;
      }
    } else {
      const insertData: Database['public']['Tables']['content_items']['Insert'] = {
        platform: 'X',
        platform_content_id: tweetId,
        title: apiSuccess ? (apiResult.tweetText as string) : '待补充',
        url: normalizedUrl,
        creator,
        source: apiSuccess ? '链接识别' : '链接导入待补充',
        discovered_at: apiSuccess ? apiResult.createdAt ?? now : now,
        followers: apiSuccess ? apiResult.followers ?? null : null,
        views: null,
        impressions: apiSuccess ? apiResult.impressions ?? null : null,
        engagements: apiSuccess ? apiResult.engagements ?? null : null,
        peak_viewers: null,
        vod_views: null,
      };

      const insertResponse = await supabase.from('content_items').insert(insertData as any);
      if (insertResponse.error) {
        failedLinks.push({ link, reason: `Supabase 写入失败：${insertResponse.error.message}` });
        continue;
      }

      insertedCount += 1;
      if (apiSuccess) {
        apiSuccessCount += 1;
      } else {
        fallbackCount += 1;
      }
    }
  }

  const message = `导入完成：${apiSuccessCount} 条成功补全，${fallbackCount} 条待补充，${failedLinks.length} 条失败。`;

  return NextResponse.json({
    ok: true,
    insertedCount,
    updatedCount,
    failedLinks,
    apiSuccessCount,
    fallbackCount,
    message,
  });
}
