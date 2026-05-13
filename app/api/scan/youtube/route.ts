import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';

type SupabaseErrorLike = {
  message: string;
};

type SupabaseListResult<Row> = {
  data: Row[] | null;
  error: SupabaseErrorLike | null;
};

type SupabaseSelectBuilder<Row> = {
  order(column: string, options: { ascending: boolean }): Promise<SupabaseListResult<Row>>;
  limit(count: number): Promise<SupabaseListResult<Row>>;
};

type SupabaseTableBuilder<Row, Insert> = {
  select(columns: string): SupabaseSelectBuilder<Row>;
  insert(values: Insert): {
    select(columns: string): SupabaseSelectBuilder<Row>;
  };
  delete(): {
    eq(column: string, value: string): Promise<{ error: SupabaseErrorLike | null }>;
    neq(column: string, value: string): Promise<{ error: SupabaseErrorLike | null }>;
  };
  update(values: Partial<Insert>): {
    eq(column: string, value: string): Promise<{ error: SupabaseErrorLike | null }>;
  };
};

type KeywordRow = {
  id: string;
  keyword: string;
  created_at: string;
};

type ContentRow = {
  id: string;
  platform: string;
  platform_content_id: string | null;
  title: string;
  url: string;
  creator: string;
  source: string;
  discovered_at: string;
  followers: number | null;
  views: number | null;
  impressions: number | null;
  engagements: number | null;
  peak_viewers: number | null;
  vod_views: number | null;
  created_at: string;
};

type MonitoringSupabaseClient = {
  from(table: 'content_items'): any;
  from(table: 'monitor_keywords'): any;
};

function asMonitoringSupabaseClient(client: unknown): MonitoringSupabaseClient {
  return client as MonitoringSupabaseClient;
}

type YouTubeSearchResult = {
  kind: string;
  etag: string;
  id: {
    kind: string;
    videoId: string;
  };
  snippet: {
    publishedAt: string;
    channelId: string;
    title: string;
    description: string;
    thumbnails: Record<string, unknown>;
    channelTitle: string;
    liveBroadcastContent: string;
    publishTime: string;
  };
};

type YouTubeVideoResult = {
  kind: string;
  etag: string;
  id: string;
  snippet: {
    publishedAt: string;
    channelId: string;
    title: string;
    description: string;
    thumbnails: Record<string, unknown>;
    channelTitle: string;
    tags?: string[];
    categoryId: string;
    liveBroadcastContent: string;
    defaultLanguage?: string;
    localized: {
      title: string;
      description: string;
    };
    defaultAudioLanguage?: string;
  };
  statistics: {
    viewCount: string;
    likeCount?: string;
    dislikeCount?: string;
    favoriteCount: string;
    commentCount?: string;
  };
};

type YouTubeChannelResult = {
  kind: string;
  etag: string;
  id: string;
  statistics: {
    viewCount: string;
    subscriberCount: string;
    hiddenSubscriberCount: boolean;
    videoCount: string;
  };
};

type YouTubeSearchResponse = {
  kind: string;
  etag: string;
  nextPageToken?: string;
  regionCode: string;
  pageInfo: {
    totalResults: number;
    resultsPerPage: number;
  };
  items: YouTubeSearchResult[];
};

type YouTubeVideosResponse = {
  kind: string;
  etag: string;
  nextPageToken?: string;
  pageInfo: {
    totalResults: number;
    resultsPerPage: number;
  };
  items: YouTubeVideoResult[];
};

type YouTubeChannelsResponse = {
  kind: string;
  etag: string;
  pageInfo: {
    totalResults: number;
    resultsPerPage: number;
  };
  items: YouTubeChannelResult[];
};

type ScanResult = {
  ok: boolean;
  scannedKeywords: number;
  insertedCount: number;
  updatedCount: number;
  totalFound: number;
  filteredOutCount: number;
  message: string;
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

async function fetchYouTubeSearch(keyword: string, apiKey: string, publishedAfter: string): Promise<YouTubeSearchResult[]> {
  const searchQuery = keyword.trim().startsWith('#')
    ? `#${normalizeKeyword(keyword)}`
    : normalizeKeyword(keyword).includes(' ')
    ? `"${normalizeKeyword(keyword)}"`
    : normalizeKeyword(keyword);

  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('q', searchQuery);
  url.searchParams.set('type', 'video');
  url.searchParams.set('order', 'date');
  url.searchParams.set('maxResults', '10');
  url.searchParams.set('publishedAfter', publishedAfter);
  url.searchParams.set('key', apiKey);

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`YouTube search API error: ${response.status} ${response.statusText}`);
  }

  const data: YouTubeSearchResponse = await response.json();
  return data.items;
}

async function fetchYouTubeVideos(videoIds: string[], apiKey: string): Promise<YouTubeVideoResult[]> {
  if (videoIds.length === 0) return [];

  const url = new URL('https://www.googleapis.com/youtube/v3/videos');
  url.searchParams.set('part', 'snippet,statistics');
  url.searchParams.set('id', videoIds.join(','));
  url.searchParams.set('key', apiKey);

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`YouTube videos API error: ${response.status} ${response.statusText}`);
  }

  const data: YouTubeVideosResponse = await response.json();
  return data.items;
}

async function fetchYouTubeChannels(channelIds: string[], apiKey: string): Promise<YouTubeChannelResult[]> {
  if (channelIds.length === 0) return [];

  const url = new URL('https://www.googleapis.com/youtube/v3/channels');
  url.searchParams.set('part', 'statistics');
  url.searchParams.set('id', channelIds.join(','));
  url.searchParams.set('key', apiKey);

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`YouTube channels API error: ${response.status} ${response.statusText}`);
  }

  const data: YouTubeChannelsResponse = await response.json();
  return data.items;
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.YOUTUBE_API_KEY;

  if (!apiKey) {
    return NextResponse.json({
      ok: false,
      scannedKeywords: 0,
      insertedCount: 0,
      updatedCount: 0,
      totalFound: 0,
      filteredOutCount: 0,
      message: 'YouTube API Key 未配置',
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
    const publishedAfter = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    let totalFound = 0;
    let insertedCount = 0;
    let updatedCount = 0;
    let filteredOutCount = 0;

    for (const keyword of keywords) {
      try {
        // 搜索视频
        const searchResults = await fetchYouTubeSearch(keyword, apiKey, publishedAfter);
        if (searchResults.length === 0) continue;

        totalFound += searchResults.length;

        const filteredResults = searchResults.filter((searchItem) => {
          const title = normalizeText(searchItem.snippet.title);
          const description = normalizeText(searchItem.snippet.description);
          const keywordText = normalizeKeyword(keyword);

          return (
            matchesBidkingKeyword(keywordText, title) ||
            matchesBidkingKeyword(keywordText, description)
          );
        });

        filteredOutCount += searchResults.length - filteredResults.length;
        if (filteredResults.length === 0) {
          continue;
        }

        // 提取 videoIds 和 channelIds
        const videoIds = filteredResults.map(item => item.id.videoId);
        const channelIds = [...new Set(filteredResults.map(item => item.snippet.channelId))];

        // 获取视频详情
        const videoResults = await fetchYouTubeVideos(videoIds, apiKey);
        const videoMap = new Map(videoResults.map(video => [video.id, video]));

        // 获取频道详情
        const channelResults = await fetchYouTubeChannels(channelIds, apiKey);
        const channelMap = new Map(channelResults.map(channel => [channel.id, channel]));

        // 处理每个搜索结果
        for (const searchItem of filteredResults) {
          const videoId = searchItem.id.videoId;
          const video = videoMap.get(videoId);
          if (!video) continue;

          const channel = channelMap.get(searchItem.snippet.channelId);

          const contentData = {
            platform: 'YouTube' as const,
            platform_content_id: videoId,
            title: video.snippet.title,
            url: `https://www.youtube.com/watch?v=${videoId}`,
            creator: video.snippet.channelTitle,
            followers: channel?.statistics.subscriberCount ? parseInt(channel.statistics.subscriberCount) : null,
            source: '关键词匹配' as const,
            discovered_at: video.snippet.publishedAt,
            views: video.statistics.viewCount ? parseInt(video.statistics.viewCount) : null,
            impressions: null,
            engagements: null,
            peak_viewers: null,
            vod_views: null,
          };

          // 检查是否已存在
          const { data: existingData } = await (supabase as any)
            .from('content_items')
            .select('id')
            .eq('platform', 'YouTube')
            .eq('platform_content_id', videoId)
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
      message: `扫描完成，共找到 ${totalFound} 个视频，过滤掉 ${filteredOutCount} 个无关结果，新增 ${insertedCount} 个，更新 ${updatedCount} 个`,
    } satisfies ScanResult);
  } catch (error) {
    const message = error instanceof Error ? error.message : '扫描失败';
    return NextResponse.json({
      ok: false,
      scannedKeywords: 0,
      insertedCount: 0,
      updatedCount: 0,
      totalFound: 0,
      filteredOutCount: 0,
      message,
    } satisfies ScanResult, { status: 500 });
  }
}