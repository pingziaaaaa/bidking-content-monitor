import { NextResponse, type NextRequest } from 'next/server';

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

type VisionResponse = {
  responses: Array<{
    textAnnotations?: Array<{
      description?: string;
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
  // 排除常见 UI 文案
  const excludePatterns = [
    /Home/i,
    /Explore/i,
    /Post/i,
    /Reply/i,
    /Show translation/i,
    /Views?/i,
    /Followers?/i,
    /Following/i,
    /Likes?/i,
    /Retweets?/i,
    /Shares?/i,
    /Bookmarks?/i,
    /·/g,
    /\d{1,2}:\d{2}\s*(?:AM|PM)/i,
    /[A-Za-z]{3}\s+\d{1,2},\s*\d{4}/i,
  ];

  let cleaned = text;
  for (const pattern of excludePatterns) {
    cleaned = cleaned.replace(pattern, '');
  }

  // 移除多余空格和换行
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // 如果太短或太长，可能是误识别
  if (cleaned.length < 5 || cleaned.length > 500) {
    return '待补充';
  }

  return cleaned || '待补充';
}

async function performOCR(base64: string): Promise<string> {
  const apiKey = String(process.env.GOOGLE_VISION_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('未配置 GOOGLE_VISION_API_KEY，无法识别截图');
  }

  // 移除 data:image 前缀
  const cleanBase64 = base64.replace(/^data:image\/[a-z]+;base64,/, '');

  const requestBody = {
    requests: [
      {
        image: {
          content: cleanBase64,
        },
        features: [
          {
            type: 'TEXT_DETECTION',
          },
        ],
      },
    ],
  };

  const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Vision OCR 识别失败：${response.status} ${body}`);
  }

  const responseData = (await response.json()) as VisionResponse;
  const text = responseData.responses?.[0]?.textAnnotations?.[0]?.description?.trim();
  if (!text) {
    throw new Error('Vision OCR 未返回有效文本');
  }

  return text;
}

async function recognizeItem(postImageBase64: string, profileImageBase64?: string): Promise<Record<string, unknown>> {
  const postText = await performOCR(postImageBase64);
  let profileText = '';
  if (profileImageBase64) {
    profileText = await performOCR(profileImageBase64);
  }

  const fullText = `${postText}\n${profileText}`;

  const linkInfo = parseXLink(fullText);
  const username = parseUsername(fullText);
  const publishedAt = parsePublishedAt(postText);
  const impressions = parseImpressions(postText);
  const followers = profileImageBase64 ? parseFollowers(profileText) : null;
  const title = extractTitle(postText);

  return {
    url: linkInfo?.normalizedUrl || null,
    platform_content_id: linkInfo?.tweetId || null,
    username,
    name: null,
    title,
    published_at: publishedAt,
    followers,
    impressions,
  };
}

export async function POST(request: NextRequest) {
  const visionKey = String(process.env.GOOGLE_VISION_API_KEY || '').trim();
  if (!visionKey) {
    return NextResponse.json(
      { ok: false, message: '未配置 GOOGLE_VISION_API_KEY，无法识别截图' },
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

  return NextResponse.json({ ok: true, results });
}
