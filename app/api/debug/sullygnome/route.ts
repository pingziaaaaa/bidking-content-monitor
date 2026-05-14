import { NextResponse } from 'next/server';

const TARGET_URL = 'https://sullygnome.com/game/bidking/watched';

function extractTableRows(html: string): string[] {
  const rows: string[] = [];
  const tableMatch = html.match(/<table[\s\S]*?<\/table>/i);
  if (!tableMatch) {
    return rows;
  }

  const tableHtml = tableMatch[0];
  const rowMatches = tableHtml.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  for (const rowHtml of rowMatches.slice(0, 10)) {
    const cellText = rowHtml
      .replace(/<\/td>/gi, '\t')
      .replace(/<\/th>/gi, '\t')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (cellText) {
      rows.push(cellText);
    }
  }

  return rows;
}

export async function GET() {
  try {
    const response = await fetch(TARGET_URL, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
      redirect: 'follow',
    });

    const finalUrl = response.url || TARGET_URL;
    const status = response.status;
    const html = await response.text();
    const htmlPreview = html.slice(0, 3000);

    const containsPeakViewers = /Peak viewers|Peak Viewers|peak viewers/i.test(html);
    const containsFollowers = /Followers|followers/i.test(html);
    const containsAverageViewers = /Average viewers|Average Viewers/i.test(html);
    const containsHoursWatched = /Hours watched|Hours Watched/i.test(html);
    const rowsPreview = extractTableRows(html);

    return NextResponse.json({
      ok: response.ok,
      status,
      finalUrl,
      htmlLength: html.length,
      htmlPreview,
      containsPeakViewers,
      containsFollowers,
      containsAverageViewers,
      containsHoursWatched,
      rowsPreview,
      error: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({
      ok: false,
      status: null,
      finalUrl: TARGET_URL,
      htmlLength: 0,
      htmlPreview: '',
      containsPeakViewers: false,
      containsFollowers: false,
      containsAverageViewers: false,
      containsHoursWatched: false,
      rowsPreview: [],
      error: message,
    });
  }
}
