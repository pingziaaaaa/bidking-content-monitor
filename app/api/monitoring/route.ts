import { NextResponse, type NextRequest } from 'next/server';
import type { AccountItem, ContentItem, Platform } from '@/lib/mock-data';
import { accounts as mockAccounts, contents as mockContents, keywords as mockKeywords, latestScanTime } from '@/lib/mock-data';
import { createServerSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';

type MonitoringPayload = {
  contents: ContentItem[];
  keywords: string[];
  accounts: AccountItem[];
  latestScanTime: string;
  source: 'supabase' | 'mock';
  message?: string;
};

type KeywordRow = {
  id: string;
  keyword: string;
  created_at: string;
};

type WatchAccountRow = {
  id: string;
  platform: Platform;
  account_name: string;
  account_url: string;
  note: string | null;
  status: AccountItem['status'];
  created_at: string;
};

type ContentRow = {
  id: string;
  platform: Platform;
  title: string;
  body: string | null;
  creator_name: string;
  url: string;
  metric_value: number | null;
  metric_label: string | null;
  source: ContentItem['source'];
  found_at: string;
  created_at: string;
};

type AddKeywordRequest = {
  action: 'add';
  type: 'keyword';
  keyword: string;
};

type AddAccountRequest = {
  action: 'add';
  type: 'account';
  platform: Platform;
  url: string;
  name: string;
  note: string;
};

type DeleteKeywordRequest = {
  action: 'delete';
  type: 'keyword';
  keyword: string;
};

type DeleteAccountRequest = {
  action: 'delete';
  type: 'account';
  id: string;
};

type MonitoringPostRequest = AddKeywordRequest | AddAccountRequest;
type MonitoringDeleteRequest = DeleteKeywordRequest | DeleteAccountRequest;

const platforms: Platform[] = ['YouTube', 'X', 'Twitch'];

function createMockPayload(message?: string): MonitoringPayload {
  return {
    contents: mockContents,
    keywords: mockKeywords,
    accounts: mockAccounts,
    latestScanTime,
    source: 'mock',
    message,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPlatform(value: unknown): value is Platform {
  return typeof value === 'string' && platforms.includes(value as Platform);
}

function parsePostRequest(value: unknown): MonitoringPostRequest | null {
  if (!isRecord(value) || value.action !== 'add' || typeof value.type !== 'string') {
    return null;
  }

  if (value.type === 'keyword' && typeof value.keyword === 'string') {
    return {
      action: 'add',
      type: 'keyword',
      keyword: value.keyword,
    };
  }

  if (value.type === 'account' && isPlatform(value.platform) && typeof value.url === 'string' && typeof value.name === 'string' && typeof value.note === 'string') {
    return {
      action: 'add',
      type: 'account',
      platform: value.platform,
      url: value.url,
      name: value.name,
      note: value.note,
    };
  }

  return null;
}

function parseDeleteRequest(value: unknown): MonitoringDeleteRequest | null {
  if (!isRecord(value) || value.action !== 'delete' || typeof value.type !== 'string') {
    return null;
  }

  if (value.type === 'keyword' && typeof value.keyword === 'string') {
    return {
      action: 'delete',
      type: 'keyword',
      keyword: value.keyword,
    };
  }

  if (value.type === 'account' && typeof value.id === 'string') {
    return {
      action: 'delete',
      type: 'account',
      id: value.id,
    };
  }

  return null;
}

function rowsFromSupabase<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : [];
}

function rowFromSupabase<T>(data: unknown): T {
  return data as T;
}

function mapContentRowToItem(row: ContentRow): ContentItem {
  const metricLabel = row.metric_label?.toLowerCase() ?? '';
  const metricValue = row.metric_value ?? undefined;

  return {
    id: row.id,
    platform: row.platform,
    title: row.title || row.body || '未命名内容',
    url: row.url,
    creator: row.creator_name,
    source: row.source,
    discoveredAt: row.found_at,
    metrics: {
      views: metricLabel.includes('view') && row.platform === 'YouTube' ? metricValue : undefined,
      impressions: metricLabel.includes('impression') ? metricValue : undefined,
      engagements: metricLabel.includes('engagement') || metricLabel.includes('互动') ? metricValue : undefined,
      peakViewers: metricLabel.includes('peak') ? metricValue : undefined,
      vodViews: metricLabel.includes('vod') ? metricValue : undefined,
    },
  };
}

function mapAccountRowToItem(row: WatchAccountRow): AccountItem {
  return {
    id: row.id,
    platform: row.platform,
    name: row.account_name,
    url: row.account_url,
    status: row.status,
    note: row.note ?? undefined,
  };
}

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(createMockPayload('Supabase 环境变量不存在，当前使用本地 mock data。'));
  }

  const supabase = createServerSupabaseClient();

  if (!supabase) {
    return NextResponse.json(createMockPayload('Supabase client 初始化失败，当前使用本地 mock data。'));
  }

  try {
    const contentsQuery = supabase
      .from('content_items')
      .select('id, platform, title, body, creator_name, url, metric_value, metric_label, source, found_at, created_at')
      .order('found_at', { ascending: false });
    const keywordsQuery = supabase
      .from('monitor_keywords')
      .select('id, keyword, created_at')
      .order('created_at', { ascending: true });
    const accountsQuery = supabase
      .from('monitored_accounts')
      .select('id, platform, account_name, account_url, note, status, created_at')
      .order('created_at', { ascending: false });

    const [contentsResult, keywordsResult, accountsResult] = await Promise.all([contentsQuery, keywordsQuery, accountsQuery]);

    if (contentsResult.error || keywordsResult.error || accountsResult.error) {
      throw new Error(contentsResult.error?.message || keywordsResult.error?.message || accountsResult.error?.message || 'Supabase 查询失败');
    }

    const contentRows = rowsFromSupabase<ContentRow>(contentsResult.data);
    const keywordRows = rowsFromSupabase<KeywordRow>(keywordsResult.data);
    const accountRows = rowsFromSupabase<WatchAccountRow>(accountsResult.data);

    return NextResponse.json({
      contents: contentRows.map(mapContentRowToItem),
      keywords: keywordRows.map((row) => row.keyword),
      accounts: accountRows.map(mapAccountRowToItem),
      latestScanTime,
      source: 'supabase',
    } satisfies MonitoringPayload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Supabase 查询失败';

    return NextResponse.json(createMockPayload(`Supabase 读取失败，已回退到 mock data：${message}`));
  }
}

export async function POST(request: NextRequest) {
  const parsedBody = parsePostRequest(await request.json());

  if (!parsedBody) {
    return NextResponse.json({ message: '请求参数不合法' }, { status: 400 });
  }

  if (!isSupabaseConfigured()) {
    if (parsedBody.type === 'keyword') {
      return NextResponse.json({ keyword: parsedBody.keyword.trim(), source: 'mock' });
    }

    return NextResponse.json({
      account: {
        id: `acc-${Date.now()}`,
        platform: parsedBody.platform,
        name: parsedBody.name,
        url: parsedBody.url,
        status: '监控中',
        note: parsedBody.note,
      } satisfies AccountItem,
      source: 'mock',
    });
  }

  const supabase = createServerSupabaseClient();

  if (!supabase) {
    return NextResponse.json({ message: 'Supabase client 初始化失败' }, { status: 500 });
  }

  try {
    if (parsedBody.type === 'keyword') {
      const keyword = parsedBody.keyword.trim();

      if (!keyword) {
        return NextResponse.json({ message: '关键词不能为空' }, { status: 400 });
      }

      const { data, error } = await supabase.from('monitor_keywords').insert({ keyword }).select('id, keyword, created_at').single();

      if (error) {
        throw new Error(error.message);
      }

      const keywordRow = rowFromSupabase<KeywordRow>(data);

      return NextResponse.json({ keyword: keywordRow.keyword, source: 'supabase' });
    }

    const url = parsedBody.url.trim();
    const name = parsedBody.name.trim();

    if (!url || !name) {
      return NextResponse.json({ message: '账号链接和账号名不能为空' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('monitored_accounts')
      .insert({
        platform: parsedBody.platform,
        account_name: name,
        account_url: url,
        status: '监控中',
        note: parsedBody.note.trim() || null,
      })
      .select('id, platform, account_name, account_url, note, status, created_at')
      .single();

    if (error) {
      throw new Error(error.message);
    }

    const accountRow = rowFromSupabase<WatchAccountRow>(data);

    return NextResponse.json({ account: mapAccountRowToItem(accountRow), source: 'supabase' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Supabase 写入失败';

    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const parsedBody = parseDeleteRequest(await request.json());

  if (!parsedBody) {
    return NextResponse.json({ message: '请求参数不合法' }, { status: 400 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ source: 'mock' });
  }

  const supabase = createServerSupabaseClient();

  if (!supabase) {
    return NextResponse.json({ message: 'Supabase client 初始化失败' }, { status: 500 });
  }

  try {
    if (parsedBody.type === 'keyword') {
      const keyword = parsedBody.keyword.trim();

      if (!keyword) {
        return NextResponse.json({ message: '关键词不能为空' }, { status: 400 });
      }

      const { error } = await supabase.from('monitor_keywords').delete().eq('keyword', keyword);

      if (error) {
        throw new Error(error.message);
      }

      return NextResponse.json({ source: 'supabase' });
    }

    const { error } = await supabase.from('monitored_accounts').delete().eq('id', parsedBody.id);

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ source: 'supabase' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Supabase 删除失败';

    return NextResponse.json({ message }, { status: 500 });
  }
}
