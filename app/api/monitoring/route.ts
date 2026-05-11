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
    const [contentsResult, keywordsResult, accountsResult] = await Promise.all([
      supabase.from('content_items').select('*').order('discovered_at', { ascending: false }),
      supabase.from('monitor_keywords').select('keyword').order('created_at', { ascending: true }),
      supabase.from('monitored_accounts').select('*').order('created_at', { ascending: false }),
    ]);

    if (contentsResult.error || keywordsResult.error || accountsResult.error) {
      throw new Error(contentsResult.error?.message || keywordsResult.error?.message || accountsResult.error?.message || 'Supabase 查询失败');
    }

    return NextResponse.json({
      contents: contentsResult.data.map(mapContentRowToItem),
      keywords: keywordsResult.data.map((row) => row.keyword),
      accounts: accountsResult.data.map(mapAccountRowToItem),
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

      const { data, error } = await supabase.from('monitor_keywords').insert({ keyword }).select('keyword').single();

      if (error) {
        throw new Error(error.message);
      }

      return NextResponse.json({ keyword: data.keyword, source: 'supabase' });
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
        name,
        url,
        status: '监控中',
        note: parsedBody.note.trim() || null,
      })
      .select('*')
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ account: mapAccountRowToItem(data), source: 'supabase' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Supabase 写入失败';

    return NextResponse.json({ message }, { status: 500 });
  }
}
