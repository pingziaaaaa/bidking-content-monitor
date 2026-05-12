import { NextResponse, type NextRequest } from 'next/server';
import type { AccountItem, Platform } from '@/lib/mock-data';
import { accounts as mockAccounts, contents as mockContents, keywords as mockKeywords, latestScanTime } from '@/lib/mock-data';
import { createServerSupabaseClient, isSupabaseConfigured, mapAccountRowToItem, mapContentRowToItem } from '@/lib/supabase';

type MonitoringPayload = {
  contents: typeof mockContents;
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
  name: string;
  url: string;
  status: AccountItem['status'];
  note: string | null;
  created_at: string;
};

type ContentRow = {
  id: string;
  platform: Platform;
  title: string;
  url: string;
  creator: string;
  source: (typeof mockContents)[number]['source'];
  discovered_at: string;
  views: number | null;
  impressions: number | null;
  engagements: number | null;
  peak_viewers: number | null;
  vod_views: number | null;
  created_at: string;
};

type KeywordInsert = Pick<KeywordRow, 'keyword'>;

type WatchAccountInsert = Pick<WatchAccountRow, 'platform' | 'name' | 'url' | 'status' | 'note'>;

type SupabaseErrorLike = {
  message: string;
};

type SupabaseListResult<Row> = {
  data: Row[] | null;
  error: SupabaseErrorLike | null;
};

type SupabaseSingleResult<Row> = {
  data: Row | null;
  error: SupabaseErrorLike | null;
};

type SupabaseSelectBuilder<Row> = {
  order(column: string, options: { ascending: boolean }): Promise<SupabaseListResult<Row>>;
  single(): Promise<SupabaseSingleResult<Row>>;
};

type SupabaseTableBuilder<Row, Insert> = {
  select(columns: string): SupabaseSelectBuilder<Row>;
  insert(values: Insert): {
    select(columns: string): SupabaseSelectBuilder<Row>;
  };
};

type MonitoringSupabaseClient = {
  from(table: 'content_items'): SupabaseTableBuilder<ContentRow, never>;
  from(table: 'monitor_keywords'): SupabaseTableBuilder<KeywordRow, KeywordInsert>;
  from(table: 'monitored_accounts'): SupabaseTableBuilder<WatchAccountRow, WatchAccountInsert>;
};

type AddKeywordRequest = {
  type: 'keyword';
  keyword: string;
};

type AddAccountRequest = {
  type: 'account';
  platform: Platform;
  url: string;
  name: string;
  note: string;
};

type MonitoringPostRequest = AddKeywordRequest | AddAccountRequest;

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

function rowsFromSupabase<Row>(data: Row[] | null): Row[] {
  return data ?? [];
}

function rowFromSupabase<Row>(data: Row | null, fallbackMessage: string): Row {
  if (!data) {
    throw new Error(fallbackMessage);
  }

  return data;
}

function asMonitoringSupabaseClient(client: unknown): MonitoringSupabaseClient {
  return client as MonitoringSupabaseClient;
}

function parsePostRequest(value: unknown): MonitoringPostRequest | null {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return null;
  }

  if (value.type === 'keyword' && typeof value.keyword === 'string') {
    return {
      type: 'keyword',
      keyword: value.keyword,
    };
  }

  if (value.type === 'account' && isPlatform(value.platform) && typeof value.url === 'string' && typeof value.name === 'string' && typeof value.note === 'string') {
    return {
      type: 'account',
      platform: value.platform,
      url: value.url,
      name: value.name,
      note: value.note,
    };
  }

  return null;
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
    const db = asMonitoringSupabaseClient(supabase);
    const contentsQuery = db
      .from('content_items')
      .select('id, platform, title, url, creator, source, discovered_at, views, impressions, engagements, peak_viewers, vod_views, created_at')
      .order('discovered_at', { ascending: false });
    const keywordsQuery = db.from('monitor_keywords').select('id, keyword, created_at').order('created_at', { ascending: true });
    const accountsQuery = db.from('monitored_accounts').select('id, platform, name, url, status, note, created_at').order('created_at', { ascending: false });

    const [contentsResult, keywordsResult, accountsResult] = await Promise.all([contentsQuery, keywordsQuery, accountsQuery]);

    if (contentsResult.error || keywordsResult.error || accountsResult.error) {
      throw new Error(contentsResult.error?.message || keywordsResult.error?.message || accountsResult.error?.message || 'Supabase 查询失败');
    }

    const contentRows: ContentRow[] = rowsFromSupabase(contentsResult.data);
    const keywordRows: KeywordRow[] = rowsFromSupabase(keywordsResult.data);
    const accountRows: WatchAccountRow[] = rowsFromSupabase(accountsResult.data);

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
    const db = asMonitoringSupabaseClient(supabase);

    if (parsedBody.type === 'keyword') {
      const keyword = parsedBody.keyword.trim();

      if (!keyword) {
        return NextResponse.json({ message: '关键词不能为空' }, { status: 400 });
      }

      const keywordInsert: KeywordInsert = { keyword };
      const { data, error } = await db.from('monitor_keywords').insert(keywordInsert).select('id, keyword, created_at').single();

      if (error) {
        throw new Error(error.message);
      }

      const keywordRow = rowFromSupabase(data, 'Supabase 未返回新增关键词');

      return NextResponse.json({ keyword: keywordRow.keyword, source: 'supabase' });
    }

    const url = parsedBody.url.trim();
    const name = parsedBody.name.trim();

    if (!url || !name) {
      return NextResponse.json({ message: '账号链接和账号名不能为空' }, { status: 400 });
    }

    const accountInsert: WatchAccountInsert = {
      platform: parsedBody.platform,
      name,
      url,
      status: '监控中',
      note: parsedBody.note.trim() || null,
    };

    const { data, error } = await db
      .from('monitored_accounts')
      .insert(accountInsert)
      .select('id, platform, name, url, status, note, created_at')
      .single();

    if (error) {
      throw new Error(error.message);
    }

    const accountRow = rowFromSupabase(data, 'Supabase 未返回新增账号');

    return NextResponse.json({ account: mapAccountRowToItem(accountRow), source: 'supabase' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Supabase 写入失败';

    return NextResponse.json({ message }, { status: 500 });
  }
}
