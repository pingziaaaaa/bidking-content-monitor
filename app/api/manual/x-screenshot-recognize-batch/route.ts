import { NextResponse, type NextRequest } from 'next/server';

type RecognizeRequestItem = {
  id: string;
  postImageName: string;
  profileImageName?: string;
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

type OpenAIResponse = {
  output?: Array<{
    content?: Array<{
      type: string;
      text?: string;
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

type GeminiResponse = {
  output?: Array<{
    content?: Array<{
      type: string;
      text?: string;
    }>;
  }>;
  candidates?: Array<{
    content?: Array<{
      type: string;
      text?: string;
    }>;
  }>;
};

function extractTextFromModelResponse(response: OpenAIResponse | GeminiResponse | unknown): string {
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
    .filter((contentItem: any) => typeof contentItem.text === 'string')
    .map((contentItem: any) => contentItem.text ?? '')
    .join('\n');
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

function buildPrompt(profileIncluded: boolean) {
  const promptLines = [
    '你是一个结构化信息抽取助手。请从 X 帖子截图和可选的主页截图中提取下面字段。',
    '输出必须是一个单独的 JSON 对象，不要添加任何解释性文字、Markdown、代码块或额外文本。',
    '只使用在截图中可见的信息。',
    '如果截图里有浏览器地址栏，请识别 X 帖子链接和 tweet id；如果没有地址栏，则 url 和 platform_content_id 应为 null。',
    '仍然需要识别标题/正文 title、发布时间 published_at、Views / Impressions、name、username。',
    '如果提供了主页截图，则从主页截图识别 followers。',
    '请返回以下字段：',
    '{',
    '  "url": null 或 "https://x.com/{username}/status/{tweetId}",',
    '  "platform_content_id": null 或 "{tweetId}",',
    '  "username": null 或 "{username}",',
    '  "name": null 或 "作者名称",',
    '  "title": null 或 "帖子正文/标题",',
    '  "published_at": null 或 "发布时间文本",',
    '  "followers": null 或 数字,',
    '  "impressions": null 或 数字',
    '}',
  ];

  if (profileIncluded) {
    promptLines.push('主页截图请用于识别作者粉丝数 followers。');
  }

  return promptLines.join(' ');
}

async function fileToDataUrl(file: File) {
  const arrayBuffer = await file.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString('base64');
  const mimeType = file.type || (() => {
    const extension = String(file.name).split('.').pop()?.toLowerCase();
    if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
    if (extension === 'png') return 'image/png';
    if (extension === 'webp') return 'image/webp';
    if (extension === 'gif') return 'image/gif';
    return 'application/octet-stream';
  })();
  return `data:${mimeType};base64,${base64}`;
}

async function recognizeItemWithOpenAI(postImage: File, profileImage?: File) {
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY 未配置，请在环境变量中设置后重试。');
  }

  const postImageDataUrl = await fileToDataUrl(postImage);
  const inputs: Array<Record<string, unknown>> = [
    { type: 'input_text', text: buildPrompt(Boolean(profileImage)) },
    { type: 'input_image', image_url: postImageDataUrl },
  ];

  if (profileImage) {
    const profileImageDataUrl = await fileToDataUrl(profileImage);
    inputs.push({ type: 'input_image', image_url: profileImageDataUrl });
  }

  const requestBody = {
    model: 'gpt-4.1-mini',
    input: [
      {
        role: 'user',
        content: inputs,
      },
    ],
  };

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI 请求失败：${response.status} ${body}`);
  }

  const responseData = (await response.json()) as OpenAIResponse;
  const text = extractTextFromModelResponse(responseData);
  const parsed = parseJsonFromText(text);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`OpenAI 返回数据无法解析为 JSON。返回内容：${text}`);
  }

  return parsed as Record<string, unknown>;
}

async function recognizeItemWithGemini(postImage: File, profileImage?: File) {
  const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY 未配置，请在环境变量中设置后重试。');
  }

  const postImageDataUrl = await fileToDataUrl(postImage);
  const inputs: Array<Record<string, unknown>> = [
    { type: 'input_text', text: buildPrompt(Boolean(profileImage)) },
    { type: 'input_image', image_url: postImageDataUrl },
  ];

  if (profileImage) {
    const profileImageDataUrl = await fileToDataUrl(profileImage);
    inputs.push({ type: 'input_image', image_url: profileImageDataUrl });
  }

  const requestBody = {
    model: 'gemini-1.5',
    input: [
      {
        role: 'user',
        content: inputs,
      },
    ],
  };

  const response = await fetch('https://gemini.googleapis.com/v1/models/gemini-1.5:generateContent', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gemini 请求失败：${response.status} ${body}`);
  }

  const responseData = (await response.json()) as GeminiResponse;
  const text = extractTextFromModelResponse(responseData);
  const parsed = parseJsonFromText(text);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`Gemini 返回数据无法解析为 JSON。返回内容：${text}`);
  }

  return parsed as Record<string, unknown>;
}

async function recognizeItemWithFallback(postImage: File, profileImage?: File) {
  const openAiKey = String(process.env.OPENAI_API_KEY || '').trim();
  const geminiKey = String(process.env.GEMINI_API_KEY || '').trim();

  if (!openAiKey && !geminiKey) {
    throw new Error('OPENAI_API_KEY 和 GEMINI_API_KEY 均未配置，请先设置其中一个环境变量。');
  }

  let openAiError: Error | null = null;

  if (openAiKey) {
    try {
      return await recognizeItemWithOpenAI(postImage, profileImage);
    } catch (error) {
      openAiError = error instanceof Error ? error : new Error(String(error));
      if (!geminiKey) {
        throw openAiError;
      }
    }
  }

  if (geminiKey) {
    try {
      return await recognizeItemWithGemini(postImage, profileImage);
    } catch (error) {
      const geminiError = error instanceof Error ? error : new Error(String(error));
      if (openAiError) {
        throw new Error(`OpenAI 识别失败：${openAiError.message}；Gemini 备用方案也失败：${geminiError.message}`);
      }
      throw geminiError;
    }
  }

  throw new Error(openAiError?.message ?? '没有可用的识别服务。');
}

export async function POST(request: NextRequest) {
  const openAiKey = String(process.env.OPENAI_API_KEY || '').trim();
  const geminiKey = String(process.env.GEMINI_API_KEY || '').trim();
  if (!openAiKey && !geminiKey) {
    return NextResponse.json(
      { ok: false, message: 'OPENAI_API_KEY 和 GEMINI_API_KEY 均未配置，请先设置其中一个环境变量。' },
      { status: 500 },
    );
  }

  const formData = await request.formData();
  const rawItems = formData.getAll('items');
  const items: RecognizeRequestItem[] = rawItems
    .map((value) => (typeof value === 'string' ? value : ''))
    .filter(Boolean)
    .map((value) => {
      try {
        return JSON.parse(value) as RecognizeRequestItem;
      } catch {
        return null;
      }
    })
    .filter((item): item is RecognizeRequestItem => item !== null && typeof item.id === 'string' && typeof item.postImageName === 'string');

  if (items.length === 0) {
    return NextResponse.json(
      { ok: false, message: '请求参数不合法，请提供 items 列表和上传的图片。' },
      { status: 400 },
    );
  }

  const fileEntries = formData.getAll('file');
  const fileMap = new Map<string, File>();
  fileEntries.forEach((entry) => {
    if (entry instanceof File) {
      fileMap.set(entry.name, entry);
    }
  });

  const results: RecognizeResult[] = [];

  for (const item of items) {
    const postImage = fileMap.get(item.postImageName);
    const profileImage = item.profileImageName ? fileMap.get(item.profileImageName) : undefined;

    if (!postImage) {
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
        warning: '未上传有效的 Post 截图。',
      });
      continue;
    }

    try {
      const responseItem = await recognizeItemWithFallback(postImage, profileImage);
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

      const creator = username ? `@${username.replace(/^@+/, '')}` : name ? String(name) : '';
      const hasUrl = Boolean(normalizedUrl);
      const status = hasUrl ? 'success' : 'partial';
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
