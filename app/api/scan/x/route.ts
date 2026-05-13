import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';

type XTweet = {
  id: string;
  text: string;
  created_at: string;
  author_id: string;
  lang: string;
  public_metrics: {
    retweet_count: number;
    reply_count: number;
    like_count: number;
    quote_count: number;
    bookmark_count: number;
    impression_count: number;
  };
};

type XUser = {
  id: string;
  name: string;
  username: string;
  public_metrics: {
    followers_count: number;
    following_count: number;
    tweet_count: number;
    listed_count: number;
  };
};

type XSearchResponse = {
  data: XTweet[];
  includes: {
    users: XUser[];
  };
  meta: {
    newest_id: string;
    oldest_id: string;
    result_count: number;
    next_token?: string;
  };
};

type ScanResult = {
  ok: boolean;
  scannedKeywords: number;
  insertedCount: number;
  updatedCount: number;
  totalFound: number;
  filteredOutCount: number;
  message: string;
  debug?: {
    requestUrl: string;
    query: string;
    status: number;
    errorMessage?: string;
    rateLimitLimit?: string;
    rateLimitRemaining?: string;
    rateLimitReset?: string;
    rawFoundCount: number;
  };
};

function normalizeKeyword(raw: string) {
  return raw.toLowerCase().replace(/#/g, '').trim();
}

function normalizeText(text: string | undefined | null) {
  return String(text ?? '').toLowerCase().trim();
}

function matchesBidkingKeyword(keyword: string, text: string) {
  const normalizedKeyword = normalizeKeyword(keyword);
  if (!normalizedKeyword) {
    return false;
  }

  const normalizedText = normalizeText(text);
  const keywordPhrase = normalizedKeyword;
  const hashKeyword = `#${normalizedKeyword}`;

  if (normalizedKeyword === 'king') {
    return normalizedText.includes('bidking') || normalizedText.includes('#bidking');
  }

  return (
    normalizedText.includes(keywordPhrase) ||
    normalizedText.includes('bidking') ||
    normalizedText.includes('#bidking') ||
    normalizedText.includes(hashKeyword)
  );
}

async function fetchXSearch(keyword: string, bearerToken: string, startTime: string): Promise<{ data: XSearchResponse; debug: any }> {
  const searchQuery = keyword.trim().startsWith('#')
    ? `#${normalizeKeyword(keyword)}`
    : normalizeKeyword(keyword).includes(' ')
    ? `"${normalizeKeyword(keyword)}"`
    : normalizeKeyword(keyword);

  const params = new URLSearchParams({
    query: searchQuery,
    max_results: '10',
    start_time: startTime,
    'tweet.fields': 'created_at,public_metrics,author_id,lang',
    expansions: 'author_id',
    'user.fields': 'username,name,public_metrics',
  });

  const url = `https://api.x.com/2/tweets/search/recent?${params}`;
  const debug = {
    requestUrl: url,
    query: searchQuery,
    status: 0,
    errorMessage: '',
    rateLimitLimit: '',
    rateLimitRemaining: '',
    rateLimitReset: '',
  };

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${bearerToken}`,
      'Content-Type': 'application/json',
    },
  });

  debug.status = response.status;
  debug.rateLimitLimit = response.headers.get('x-rate-limit-limit') || '';
  debug.rateLimitRemaining = response.headers.get('x-rate-limit-remaining') || '';
  debug.rateLimitReset = response.headers.get('x-rate-limit-reset') || '';

  if (!response.ok) {
    let errorMessage = `X API error: ${response.status} ${response.statusText}`;
    let userFriendlyMessage = '';

    if (response.status === 403) {
      userFriendlyMessage = 'X API 访问被拒绝，请检查 Bearer Token 权限';
    } else if (response.status === 429) {
      userFriendlyMessage = 'X API 请求频率超限，请稍后再试';
    } else if (response.status === 401) {
      userFriendlyMessage = 'X API 认证失败，请检查 Bearer Token';
    } else if (response.status === 402) {
      userFriendlyMessage = 'X API 需要付费订阅';
    }

    try {
      const errorData = await response.json();
      if (errorData.errors && errorData.errors.length > 0) {
        errorMessage += ` - ${errorData.errors[0].message}`;
        if (!userFriendlyMessage) {
          const errorDetail = errorData.errors[0].message.toLowerCase();
          if (errorDetail.includes('payment required') || errorDetail.includes('insufficient access')) {
            userFriendlyMessage = 'X API 需要付费订阅或权限不足';
          } else if (errorDetail.includes('unsupported authentication')) {
            userFriendlyMessage = 'X API 认证方式不支持';
          }
        }
      }
    } catch {
      // Ignore JSON parse errors
    }

    debug.errorMessage = errorMessage;
    const finalMessage = userFriendlyMessage || errorMessage;
    throw new Error(finalMessage);
  }

  const data = await response.json();
  return { data, debug };
}

export async function POST(request: NextRequest) {
  const bearerToken = process.env.X_BEARER_TOKEN;

  if (!bearerToken) {
    return NextResponse.json({
      ok: false,
      scannedKeywords: 0,
      insertedCount: 0,
      updatedCount: 0,
      totalFound: 0,
      filteredOutCount: 0,
      message: 'X Bearer Token 未配置',
    } satisfies ScanResult);
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      ok: false,
      scannedKeywords: 0,
      insertedCount: 0,
      updatedCount: 0,
      totalFound: 0,
      filteredOutCount: 0,
      message: 'Supabase 未配置',
    } satisfies ScanResult);
  }

  const supabase = createServerSupabaseClient();
  if (!supabase) {
    return NextResponse.json({
      ok: false,
      scannedKeywords: 0,
      insertedCount: 0,
      updatedCount: 0,
      totalFound: 0,
      filteredOutCount: 0,
      message: 'Supabase client 初始化失败',
    } satisfies ScanResult);
  }

  try {
    // 从 Supabase 读取关键词
    const { data: keywordsData, error: keywordsError } = await (supabase as any)
      .from('monitor_keywords')
      .select('keyword')
      .order('created_at', { ascending: true });

    if (keywordsError) {
      throw new Error(`读取关键词失败: ${keywordsError.message}`);
    }

    const keywords = (keywordsData as any)?.map((row: any) => row.keyword) || [];
    if (keywords.length === 0) {
      return NextResponse.json({
        ok: true,
        scannedKeywords: 0,
        insertedCount: 0,
        updatedCount: 0,
        totalFound: 0,
        filteredOutCount: 0,
        message: '没有关键词需要扫描',
      } satisfies ScanResult);
    }

    // 计算最近24小时的时间
    const startTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    let totalFound = 0;
    let insertedCount = 0;
    let updatedCount = 0;
    let filteredOutCount = 0;
    let debugInfo: any = null;

    for (const keyword of keywords) {
      try {
        // 搜索推文
        const { data: searchResponse, debug } = await fetchXSearch(keyword, bearerToken, startTime);
        debugInfo = debug;
        debugInfo.rawFoundCount = searchResponse.data.length;

        if (searchResponse.data.length === 0) continue;

        totalFound += searchResponse.data.length;

        // 创建用户映射
        const userMap = new Map(searchResponse.includes.users.map(user => [user.id, user]));

        // 过滤推文
        const filteredTweets = searchResponse.data.filter((tweet) => {
          const text = normalizeText(tweet.text);
          const keywordText = normalizeKeyword(keyword);

          return matchesBidkingKeyword(keywordText, text);
        });

        filteredOutCount += searchResponse.data.length - filteredTweets.length;
        if (filteredTweets.length === 0) {
          continue;
        }

        // 处理每个过滤后的推文
        for (const tweet of filteredTweets) {
          const user = userMap.get(tweet.author_id);
          if (!user) continue;

          const contentData = {
            platform: 'X' as const,
            platform_content_id: tweet.id,
            title: tweet.text,
            url: `https://x.com/${user.username}/status/${tweet.id}`,
            creator: `@${user.username}`,
            followers: user.public_metrics.followers_count,
            source: '关键词匹配' as const,
            discovered_at: tweet.created_at,
            views: null,
            impressions: tweet.public_metrics.impression_count,
            engagements: tweet.public_metrics.like_count + tweet.public_metrics.reply_count + tweet.public_metrics.retweet_count + tweet.public_metrics.quote_count + tweet.public_metrics.bookmark_count,
            peak_viewers: null,
            vod_views: null,
          };

          // 检查是否已存在
          const { data: existingData } = await (supabase as any)
            .from('content_items')
            .select('id')
            .eq('platform', 'X')
            .eq('platform_content_id', tweet.id)
            .single();

          if (existingData) {
            // 更新现有记录
            const { error: updateError } = await (supabase as any)
              .from('content_items')
              .update(contentData)
              .eq('id', existingData.id);

            if (updateError) {
              console.error(`更新内容失败: ${updateError.message}`);
            } else {
              updatedCount++;
            }
          } else {
            // 插入新记录
            const { error: insertError } = await (supabase as any)
              .from('content_items')
              .insert(contentData);

            if (insertError) {
              console.error(`插入内容失败: ${insertError.message}`);
            } else {
              insertedCount++;
            }
          }
        }
      } catch (error) {
        console.error(`扫描关键词 "${keyword}" 失败:`, error);
        // 继续处理下一个关键词
      }
    }

    return NextResponse.json({
      ok: true,
      scannedKeywords: keywords.length,
      insertedCount,
      updatedCount,
      totalFound,
      filteredOutCount,
      message: `扫描完成，共找到 ${totalFound} 个推文，过滤掉 ${filteredOutCount} 个无关结果，新增 ${insertedCount} 个，更新 ${updatedCount} 个`,
      debug: debugInfo,
    } satisfies ScanResult);
  } catch (error) {
    const message = error instanceof Error ? error.message : '扫描失败';
    let debugInfo: any = null;

    // 尝试从错误中提取 debug 信息
    if (error instanceof Error && error.message.includes('X API error')) {
      // 如果是 API 错误，debug 信息已经在 fetchXSearch 中设置
      debugInfo = {
        requestUrl: '',
        query: '',
        status: 0,
        errorMessage: message,
        rateLimitLimit: '',
        rateLimitRemaining: '',
        rateLimitReset: '',
        rawFoundCount: 0,
      };
    }

    return NextResponse.json({
      ok: false,
      scannedKeywords: 0,
      insertedCount: 0,
      updatedCount: 0,
      totalFound: 0,
      filteredOutCount: 0,
      message,
      debug: debugInfo,
    } satisfies ScanResult, { status: 500 });
  }
}