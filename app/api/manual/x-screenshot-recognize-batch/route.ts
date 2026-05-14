import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';

type RecognizeRequestItem = {
  id: string;
  postImageBase64: string;
  profileImageBase64?: string;
};

type RecognizeResult = {
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
  status: 'success' | 'partial' | 'failed';
  warning: string | null;
};

type GeminiResponse = {
  output?: Array<{
    content?: Array<{
      text?: string;
      parts?: Array<{
        text?: string;
      }>;
    }>;
  }>;
  candidates?: Array<{
    content?: Array<{
      text?: string;
      parts?: Array<{
        text?: string;
      }>;
    }>;
  }>;
};

function parseNumberValue(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const raw = String(value).trim();
  if (raw === '') {
    return null;
  }

  const normalized = raw
    .replace(/，/g, ',')
    .replace(/\s+/g, '')
    .replace(/K$/i, '000')
    .replace(/M$/i, '000000')
    .replace(/B$/i, '000000000')
    .replace(/万$/i, '0000')
    .replace(/千$/i, '000')
    .replace(/亿$/i, '00000000');

  const digits = normalized.replace(/[+,]/g, '');
  const parsed = Number(digits);

  return Number.isFinite(parsed) ? parsed : null;
}

function parseXLink(text: string): { username: string; tweetId: string; normalizedUrl: string } | null {
  const urlRegex = /(?:https?:\/\/)?(?:www\.)?(?:x\.com|twitter\.com)\/([^\/\s]+)\/status\/(\d+)/i;
  const match = text.match(urlRegex);
  if (!match) {
    return null;
  }

  const username = match[1];
  const tweetId = match[2];
  const normalizedUrl = `https://x.com/${username}/status/${tweetId}`;

  return { username, tweetId, normalizedUrl };
}

function parseUsername(text: string): string | null {
  const linkMatch = parseXLink(text);
  if (linkMatch) {
    return linkMatch.username;
  }

  const usernameRegex = /@([a-zA-Z0-9_]+)/;
  const match = text.match(usernameRegex);
  return match ? match[1] : null;
}

function parsePublishedAt(text: string): string | null {
  const timeRegex = /(\d{1,2}:\d{2}\s*(?:AM|PM))\s*·\s*([A-Za-z]{3}\s+\d{1,2},\s*\d{4})/i;
  const match = text.match(timeRegex);
  if (!match) {
    return null;
  }

  const timeStr = match[1];
  const dateStr = match[2];
  const dateTimeStr = `${dateStr} ${timeStr}`;

  try {
    const date = new Date(dateTimeStr);
    return date.toISOString();
  } catch {
    return null;
  }
}

function parseImpressions(text: string): number | null {
  const viewsRegex = /(\d+(?:\.\d+)?[KMB]?)\s*Views?/i;
  const match = text.match(viewsRegex);
  if (!match) {
    return null;
  }

  return parseNumberValue(match[1]);
}

function parseFollowers(text: string): number | null {
  const followersRegex = /(\d+(?:\.\d+)?[KMB]?)\s*Followers?/i;
  const match = text.match(followersRegex);
  if (!match) {
    return null;
  }

  return parseNumberValue(match[1]);
}

function extractTitle(text: string): string {
  const excludePatterns = [
    /Home/i,
    /Explore/i,
    /Notifications/i,
    /Follow/i,
    /Chat/i,
    /Grok/i,
    /Bookmarks/i,
    /Creator Studio/i,
    /Post/i,
    /Reply/i,
    /Show translation/i,
    /Views?/i,
    /Followers?/i,
    /Following/i,
    /Likes?/i,
    /Retweets?/i,
    /Shares?/i,
    /·/g,
    /\d{1,2}:\d{2}\s*(?:AM|PM)/i,
    /[A-Za-z]{3}\s+\d{1,2},\s*\d{4}/i,
  ];

  let cleaned = text;
  for (const pattern of excludePatterns) {
    cleaned = cleaned.replace(pattern, '');
  }

  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  if (cleaned.length < 5 || cleaned.length > 500) {
    return '待补充';
  }

  return cleaned || '待补充';
}

function parseJsonFromText(rawText: string): unknown | null {
  const trimmed = rawText.trim();
  const jsonMatch = trimmed.match(/```json\s*([\s\S]*?)\s*```/i);
  const candidate = jsonMatch ? jsonMatch[1].trim() : trimmed;

  if (!candidate) {
    return null;
  }

  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

function extractTextFromGeminiResponse(response: GeminiResponse | unknown): string {
  if (!response || typeof response !== 'object') {
    return '';
  }

  const entries = Array.isArray((response as any).output)
    ? (response as any).output
    : Array.isArray((response as any).candidates)
    ? (response as any).candidates
    : [];

  return entries
    .flatMap((item: any) => item.content ?? [])
    .flatMap((content: any) => {
      if (typeof content.text === 'string') {
        return [content.text];
      }
      if (Array.isArray(content.parts)) {
        return content.parts.map((part: any) => part.text ?? '');
      }
      return [];
    })
    .join('\n');
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

function getUsernameFromRecognizeResult(result: RecognizeResult): string | null {
  const username = normalizeUsernameValue(result.username);
  if (username) return username;

  const creator = normalizeUsernameValue(result.creator);
  if (creator) return creator;

  if (result.url) {
    return normalizeUsernameValue(parseXLink(result.url)?.username ?? null);
  }

  return null;
}

function appendWarning(warning: string | null, extra: string) {
  return warning ? `${warning}；${extra}` : extra;
}

function buildBatchFollowersCache(results: RecognizeResult[]) {
  const cache = new Map<string, number>();

  for (const result of results) {
    const username = getUsernameFromRecognizeResult(result);

    if (username && typeof result.followers === 'number' && result.followers > 0) {
      cache.set(username, result.followers);
    }
  }

  return cache;
}

async function fetchHistoricalFollowersFromSupabase(usernames: string[]) {
  const cache = new Map<string, number>();

  if (!isSupabaseConfigured() || usernames.length === 0) {
    return cache;
  }

  const supabase = createServerSupabaseClient() as any;

  if (!supabase) {
    return cache;
  }

  const uniqueUsernames = Array.from(new Set(usernames.map((username) => username.toLowerCase())));

  for (const username of uniqueUsernames) {
    const creatorCandidates = [`@${username}`, username];

    for (const creator of creatorCandidates) {
      const response = await supabase
        .from('content_items')
        .select('followers, discovered_at, created_at')
        .eq('platform', 'X')
        .eq('creator', creator)
        .not('followers', 'is', null)
        .order('discovered_at', { ascending: false })
        .limit(1);

      if (!response.error && Array.isArray(response.data) && response.data[0]?.followers) {
        const followers = Number(response.data[0].followers);

        if (Number.isFinite(followers) && followers > 0) {
          cache.set(username, followers);
          break;
        }
      }
    }
  }

  return cache;
}

async function completeFollowersFromBatchAndSupabase(results: RecognizeResult[]) {
  const batchCache = buildBatchFollowersCache(results);
  const missingUsernames = results
    .filter((result) => result.followers === null || result.followers === undefined)
    .map(getUsernameFromRecognizeResult)
    .filter((username): username is string => Boolean(username));

  const historicalCache = await fetchHistoricalFollowersFromSupabase(missingUsernames);

  return results.map((result) => {
    if (typeof result.followers === 'number' && result.followers > 0) {
      return result;
    }

    const username = getUsernameFromRecognizeResult(result);

    if (!username) {
      return result;
    }

    const batchFollowers = batchCache.get(username);
    if (batchFollowers) {
      return {
        ...result,
        followers: batchFollowers,
        warning: appendWarning(result.warning, 'Followers 已复用本次批量中的同账号主页截图。'),
      };
    }

    const historicalFollowers = historicalCache.get(username);
    if (historicalFollowers) {
      return {
        ...result,
        followers: historicalFollowers,
        warning: appendWarning(result.warning, 'Followers 已从 Supabase 历史数据复用。'),
      };
    }

    return result;
  });
}


function normalizeBase64DataUrl(dataUrl: string): string {
  return dataUrl.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '');
}

function detectMimeType(dataUrl: string): string {
  const match = dataUrl.match(/^data:image\/(png|jpeg|jpg|webp);base64,/i);
  if (!match) {
    return 'image/png';
  }

  const type = match[1].toLowerCase();
  return type === 'jpg' ? 'image/jpeg' : `image/${type}`;
}

function buildPrompt(profileIncluded: boolean): string {
  const lines = [
    '你是一个结构化信息抽取助手。请从 X 帖子截图和可选的主页截图中提取字段。',
    '只输出一个 JSON 对象，不要添加解释性文字、Markdown、代码块或额外文本。',
    '如果截图中包含浏览器地址栏，请识别 X 链接和 tweet id；如果没有地址栏，则 url 和 platform_content_id 应为 null。',
    '请返回以下字段：',
    '{',
    '  "url": null 或 "https://x.com/{username}/status/{tweetId}",',
    '  "platform_content_id": null 或 "{tweetId}",',
    '  "username": null 或 "{username}",',
    '  "name": null 或 "作者名称",',
    '  "title": null 或 "帖子正文/标题",',
    '  "published_at": null 或 "发布时间文本",',
    'published_at 必须优先读取帖子底部的完整发布时间行，例如 "12:29 AM · May 14, 2026"；不要使用当前识别时间，不要自行换算时区。',
    '  "followers": null 或 数字,',
    '  "impressions": null 或 数字',
    '}',
  ];

  if (profileIncluded) {
    lines.push('如果提供了主页截图，请用于识别作者粉丝数 followers。');
  }

  return lines.join(' ');
}

async function recognizeItem(postImageBase64: string, profileImageBase64?: string): Promise<Record<string, unknown>> {
  const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('未配置 GEMINI_API_KEY，无法识别截图');
  }

  const postImageData = normalizeBase64DataUrl(postImageBase64);
  const postMimeType = detectMimeType(postImageBase64);

  const parts: Array<Record<string, unknown>> = [
    {
      inline_data: {
        mime_type: postMimeType,
        data: postImageData,
      },
    },
  ];

  if (profileImageBase64) {
    const profileImageData = normalizeBase64DataUrl(profileImageBase64);
    const profileMimeType = detectMimeType(profileImageBase64);
    parts.push({
      inline_data: {
        mime_type: profileMimeType,
        data: profileImageData,
      },
    });
  }

  parts.push({ text: buildPrompt(Boolean(profileImageBase64)) });

  const requestBody = {
    contents: [
      {
        parts,
      },
    ],
    generationConfig: {
      response_mime_type: 'application/json',
    },
  };

  const response = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(requestBody),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gemini 识别失败：${response.status} ${body}`);
  }

  const responseData = (await response.json()) as GeminiResponse;
  const text = extractTextFromGeminiResponse(responseData);
  const parsed = parseJsonFromText(text);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Gemini 未返回有效识别结果');
  }

  return parsed as Record<string, unknown>;
}

export async function POST(request: NextRequest) {
  const geminiKey = String(process.env.GEMINI_API_KEY || '').trim();
  if (!geminiKey) {
    return NextResponse.json(
      { ok: false, message: '未配置 GEMINI_API_KEY，无法识别截图' },
      { status: 500 },
    );
  }

  const body = await request.json();
  const items: RecognizeRequestItem[] = Array.isArray(body.items) ? body.items : [];

  if (items.length === 0) {
    return NextResponse.json(
      { ok: false, message: '请求参数不合法，请提供 items 列表。' },
      { status: 400 },
    );
  }

  const results: RecognizeResult[] = [];

  for (const item of items) {
    if (!item.postImageBase64) {
      results.push({
        id: item.id,
        url: null,
        platform_content_id: null,
        creator: '',
        name: null,
        username: null,
        title: '',
        published_at: null,
        followers: null,
        impressions: null,
        source: '截图识别缺链接',
        status: 'failed',
        warning: '未提供有效的 Post 截图 base64。',
      });
      continue;
    }

    try {
      const responseItem = await recognizeItem(item.postImageBase64, item.profileImageBase64);
      const rawUrl = responseItem.url === null || responseItem.url === undefined ? null : String(responseItem.url).trim();
      const parsedLink = rawUrl ? parseXLink(rawUrl) : null;
      const normalizedUrl = parsedLink?.normalizedUrl ?? null;
      const contentId = parsedLink?.tweetId ?? null;
      const username = responseItem.username === null || responseItem.username === undefined ? null : String(responseItem.username).trim();
      const name = responseItem.name === null || responseItem.name === undefined ? null : String(responseItem.name).trim();
      const title = responseItem.title === null || responseItem.title === undefined ? '' : String(responseItem.title).trim();
      const publishedAt = responseItem.published_at === null || responseItem.published_at === undefined ? null : String(responseItem.published_at).trim();
      const followers = parseNumberValue(responseItem.followers);
      const impressions = parseNumberValue(responseItem.impressions);

      const creator = username ? `@${username.replace(/^@+/, '')}` : name ? String(name) : '待补充';
      const hasUrl = Boolean(normalizedUrl);
      const hasContent = Boolean(title && title !== '待补充') || Boolean(impressions) || Boolean(publishedAt) || Boolean(followers);
      const status = hasUrl ? 'success' : hasContent ? 'partial' : 'failed';
      const source = hasUrl ? '截图识别' : '截图识别缺链接';

      results.push({
        id: item.id,
        url: normalizedUrl,
        platform_content_id: contentId,
        creator: creator || '',
        name: name || null,
        username: username || null,
        title: title || '',
        published_at: publishedAt || null,
        followers,
        impressions,
        source,
        status,
        warning: hasUrl ? null : '未识别到 X 链接，按缺链接内容处理。',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '识别失败';
      results.push({
        id: item.id,
        url: null,
        platform_content_id: null,
        creator: '',
        name: null,
        username: null,
        title: '',
        published_at: null,
        followers: null,
        impressions: null,
        source: '截图识别缺链接',
        status: 'failed',
        warning: message,
      });
    }
  }

  const completedResults = await completeFollowersFromBatchAndSupabase(results);

  return NextResponse.json({ ok: true, results: completedResults });
}
