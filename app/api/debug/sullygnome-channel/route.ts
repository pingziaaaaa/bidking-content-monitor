import { NextResponse } from 'next/server';

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildKeywordContext(text: string, keyword: string, contextLength = 500): string[] {
  const contexts: string[] = [];
  const regex = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text))) {
    const start = Math.max(0, match.index - contextLength);
    const end = Math.min(text.length, match.index + match[0].length + contextLength);
    contexts.push(text.slice(start, end).trim());
    if (contexts.length >= 5) {
      break;
    }
  }
  return contexts;
}

function parseFollowers(text: string): number | null {
  const match = text.match(/Followers\s*[:\s]\s*([\d,]+)/i);
  if (!match) {
    return null;
  }
  return parseInt(match[1].replace(/,/g, ''), 10);
}

function extractStreamRows(text: string): string[] {
  const rows: string[] = [];
  const summaryMatch = text.match(/Stream summary[\s\S]*/i);
  const snippet = summaryMatch ? summaryMatch[0] : text;
  const lines = snippet.split(/[\r\n]+/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines.slice(0, 10)) {
    rows.push(line);
  }
  return rows;
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
      if (response.status === 502 && attempt < retries) {
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
    const containsStreamSummary = /Stream summary|Avg Viewers|Peak Viewers|Watch time/i.test(html) || /Stream summary|Avg Viewers|Peak Viewers|Watch time/i.test(text);
    const containsBidKing = /Bid King|bidking|\/game\/bidking/i.test(html) || /Bid King|bidking|\/game\/bidking/i.test(text);
    const keywords = ['Followers', 'Stream summary', 'Peak Viewers', 'Avg Viewers', 'Watch time', 'Bid King'];
    const keywordContexts: Record<string, string[]> = {};
    for (const keyword of keywords) {
      keywordContexts[keyword] = buildKeywordContext(text, keyword, 500);
    }

    const streamRowsPreview = extractStreamRows(text);

    return NextResponse.json({
      ok: true,
      status,
      url: targetUrl,
      htmlLength: html.length,
      htmlPreview,
      textPreview,
      followers,
      containsStreamSummary,
      containsBidKing,
      keywordContexts,
      streamRowsPreview,
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
      containsStreamSummary: false,
      containsBidKing: false,
      keywordContexts: {},
      streamRowsPreview: [],
      error: message,
    });
  }
}
