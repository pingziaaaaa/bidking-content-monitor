import { NextResponse } from 'next/server';

type MatchedBidKingRow = {
  startText: string;
  startIso: string | null;
  streamLengthHours: number | null;
  avgViewers: number | null;
  peakViewers: number | null;
  watchTimeHours: number | null;
  followersDelta: number | null;
  gamesText: string;
  containsBidKing: boolean;
  rawText: string;
};

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function stripHtml(html: string): string {
  return decodeEntities(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseNumber(value?: string | null): number | null {
  if (!value) return null;
  const normalized = value.replace(/,/g, '').trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildKeywordContext(text: string, keyword: string, contextLength = 500): string[] {
  const contexts: string[] = [];
  const regex = new RegExp(escapeRegExp(keyword), 'gi');
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text))) {
    const start = Math.max(0, match.index - contextLength);
    const end = Math.min(text.length, match.index + match[0].length + contextLength);
    contexts.push(text.slice(start, end).trim());

    if (contexts.length >= 5) break;
  }

  return contexts;
}

function parseFollowers(text: string): number | null {
  const match = text.match(/Followers\s*[:\s]\s*([\d,]+)/i);
  return parseNumber(match?.[1] ?? null);
}

function parseChannelDisplayName(text: string, login: string): string | null {
  const loginRegex = escapeRegExp(login);
  const match = text.match(new RegExp(`([^\\s()]{1,80})\\s*\\(${loginRegex}\\)`, 'i'));

  if (!match?.[1]) return null;

  const candidate = match[1].trim();

  if (
    /SullyGnome|Twitch|Summary|Streams|Games|Search|Home|Channels/i.test(candidate)
  ) {
    return null;
  }

  return candidate;
}

function parseSullyStartToIso(startText: string): string | null {
  const match = startText.match(
    /\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+([A-Z][a-z]{2})\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\d{1,2}):(\d{2})\b/
  );

  if (!match) return null;

  const monthMap: Record<string, number> = {
    Jan: 0,
    Feb: 1,
    Mar: 2,
    Apr: 3,
    May: 4,
    Jun: 5,
    Jul: 6,
    Aug: 7,
    Sep: 8,
    Oct: 9,
    Nov: 10,
    Dec: 11,
  };

  const month = monthMap[match[1]];
  const day = Number(match[2]);
  const hour = Number(match[3]);
  const minute = Number(match[4]);

  if (month === undefined || !Number.isFinite(day) || !Number.isFinite(hour) || !Number.isFinite(minute)) {
    return null;
  }

  const now = new Date();
  let year = now.getUTCFullYear();
  const candidate = new Date(Date.UTC(year, month, day, hour, minute, 0));

  // 如果解析出来的日期比当前时间晚很多，说明可能是上一年。
  if (candidate.getTime() - now.getTime() > 1000 * 60 * 60 * 24 * 30) {
    year -= 1;
  }

  return new Date(Date.UTC(year, month, day, hour, minute, 0)).toISOString();
}

function rowContainsBidKing(rowHtml: string, rowText: string): boolean {
  return /Bid\s*King|bidking|\/game\/bidking|458263763/i.test(rowHtml) || /Bid\s*King|bidking/i.test(rowText);
}

function parseStreamRow(rowText: string, rowHtml = ''): MatchedBidKingRow | null {
  const cleaned = stripHtml(rowText || rowHtml);

  const match = cleaned.match(
    /\b((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+[A-Z][a-z]{2}\s+\d{1,2}(?:st|nd|rd|th)?\s+\d{1,2}:\d{2})\s+([\d.]+)\s*hrs\s+([\d,]+)\s+([\d,]+)\s+([\d.]+)\s*hrs\s+(-?[\d,]+)/i
  );

  if (!match) return null;

  const containsBidKing = rowContainsBidKing(rowHtml, cleaned);

  return {
    startText: match[1],
    startIso: parseSullyStartToIso(match[1]),
    streamLengthHours: parseNumber(match[2]),
    avgViewers: parseNumber(match[3]),
    peakViewers: parseNumber(match[4]),
    watchTimeHours: parseNumber(match[5]),
    followersDelta: parseNumber(match[6]),
    gamesText: containsBidKing ? 'Bid King' : '',
    containsBidKing,
    rawText: cleaned,
  };
}

function parseRowsFromHtml(html: string, text: string): {
  allRows: MatchedBidKingRow[];
  rowsPreview: string[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const allRows: MatchedBidKingRow[] = [];
  const rowsPreview: string[] = [];

  const trMatches = html.match(/<tr[\s\S]*?<\/tr>/gi) ?? [];

  for (const rowHtml of trMatches) {
    const rowText = stripHtml(rowHtml);
    if (!/(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+[A-Z][a-z]{2}/.test(rowText)) continue;

    rowsPreview.push(rowText.slice(0, 500));

    const row = parseStreamRow(rowText, rowHtml);
    if (row) {
      allRows.push(row);
    }
  }

  if (allRows.length > 0) {
    return { allRows, rowsPreview: rowsPreview.slice(0, 20), warnings };
  }

  warnings.push('HTML table row parsing found no structured stream rows; falling back to plain-text parsing.');

  const textPattern =
    /\b((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+[A-Z][a-z]{2}\s+\d{1,2}(?:st|nd|rd|th)?\s+\d{1,2}:\d{2}\s+[\d.]+\s*hrs\s+[\d,]+\s+[\d,]+\s+[\d.]+\s*hrs\s+-?[\d,]+)/gi;

  const plainRows = text.match(textPattern) ?? [];

  for (const plainRow of plainRows) {
    rowsPreview.push(plainRow.slice(0, 500));

    const row = parseStreamRow(plainRow, '');
    if (row) {
      allRows.push(row);
    }
  }

  return { allRows, rowsPreview: rowsPreview.slice(0, 20), warnings };
}

async function fetchWithRetry(url: string, headers: Record<string, string>, retries = 3) {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers,
        redirect: 'follow',
      });

      if ((response.status === 502 || response.status === 503 || response.status === 504) && attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
        continue;
      }

      return response;
    } catch (error) {
      lastError = error;

      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
      }
    }
  }

  throw lastError;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const login = url.searchParams.get('login')?.trim();
  const daysParam = url.searchParams.get('days')?.trim();
  const days = daysParam === '7' ? 7 : 3;

  if (!login) {
    return NextResponse.json({ ok: false, error: 'login 参数必填' }, { status: 400 });
  }

  const targetUrl = `https://sullygnome.com/channel/${encodeURIComponent(login)}/${days}`;
  const headers = {
    'User-Agent': 'Mozilla/5.0',
    Accept: 'text/html',
  };

  try {
    const response = await fetchWithRetry(targetUrl, headers, 3);
    const status = response.status;
    const html = await response.text();
    const htmlPreview = html.slice(0, 3000);
    const text = stripHtml(html);
    const textPreview = text.slice(0, 3000);

    const followers = parseFollowers(text);
    const channelDisplayName = parseChannelDisplayName(text, login);
    const containsStreamSummary =
      /Stream summary|Avg Viewers|Peak Viewers|Watch time/i.test(html) ||
      /Stream summary|Avg Viewers|Peak Viewers|Watch time/i.test(text);
    const containsBidKing =
      /Bid\s*King|bidking|\/game\/bidking|458263763/i.test(html) ||
      /Bid\s*King|bidking/i.test(text);

    const keywords = ['Followers', 'Stream summary', 'Peak Viewers', 'Avg Viewers', 'Watch time', 'Bid King'];
    const keywordContexts: Record<string, string[]> = {};

    for (const keyword of keywords) {
      keywordContexts[keyword] = buildKeywordContext(text, keyword, 500);
    }

    const { allRows, rowsPreview, warnings } = parseRowsFromHtml(html, text);
    let matchedBidKingRows = allRows.filter((row) => row.containsBidKing);

    if (matchedBidKingRows.length === 0 && allRows.length > 0 && containsBidKing) {
      warnings.push('Page contains Bid King but row-level game detection failed; returning parsed rows as potential Bid King rows for debugging.');
      matchedBidKingRows = allRows.map((row) => ({
        ...row,
        containsBidKing: true,
        gamesText: row.gamesText || 'Bid King?',
      }));
    }

    return NextResponse.json({
      ok: true,
      status,
      url: targetUrl,
      htmlLength: html.length,
      htmlPreview,
      textPreview,
      followers,
      channelLogin: login,
      channelDisplayName,
      containsStreamSummary,
      containsBidKing,
      keywordContexts,
      matchedBidKingRows,
      allStreamRowsPreview: rowsPreview,
      warnings,
      error: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return NextResponse.json({
      ok: false,
      status: null,
      url: targetUrl,
      htmlLength: 0,
      htmlPreview: '',
      textPreview: '',
      followers: null,
      channelLogin: login,
      channelDisplayName: null,
      containsStreamSummary: false,
      containsBidKing: false,
      keywordContexts: {},
      matchedBidKingRows: [],
      allStreamRowsPreview: [],
      warnings: [],
      error: message,
    });
  }
}
