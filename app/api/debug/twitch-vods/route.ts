import { NextResponse } from 'next/server';

const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const CATEGORY_SEARCH_URL = 'https://api.twitch.tv/helix/search/categories';
const VIDEOS_URL = 'https://api.twitch.tv/helix/videos';

function formatError(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 500 });
}

function buildCandidate(category: any) {
  return {
    id: category.id,
    name: category.name,
    box_art_url: category.box_art_url,
  };
}

function findExactCategory(categories: any[]): any | null {
  if (!Array.isArray(categories)) return null;
  return categories.find((category) => {
    const name = String(category.name || '').trim().toLowerCase();
    return name === 'bid king' || name === 'bidking';
  }) ?? null;
}

async function fetchAccessToken(clientId: string, clientSecret: string) {
  const params = new URLSearchParams();
  params.append('client_id', clientId);
  params.append('client_secret', clientSecret);
  params.append('grant_type', 'client_credentials');

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    body: params,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Twitch token request failed: ${response.status} ${body}`);
  }

  const data = await response.json();
  if (!data.access_token) {
    throw new Error(`Twitch token response missing access_token: ${JSON.stringify(data)}`);
  }

  return data.access_token as string;
}

async function fetchCategories(clientId: string, accessToken: string) {
  const url = new URL(CATEGORY_SEARCH_URL);
  url.searchParams.set('query', 'bidking');

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Client-Id': clientId,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Twitch category search failed: ${response.status} ${body}`);
  }

  return response.json();
}

async function fetchVideos(clientId: string, accessToken: string, gameId: string, period: 'day' | 'week') {
  const url = new URL(VIDEOS_URL);
  url.searchParams.set('game_id', gameId);
  url.searchParams.set('period', period);
  url.searchParams.set('sort', 'time');
  url.searchParams.set('type', 'archive');
  url.searchParams.set('first', '20');

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Client-Id': clientId,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Twitch videos fetch failed: ${response.status} ${body}`);
  }

  return response.json();
}

export async function GET() {
  const clientId = String(process.env.TWITCH_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.TWITCH_CLIENT_SECRET || '').trim();

  if (!clientId || !clientSecret) {
    return formatError('Twitch Client ID / Secret 未配置');
  }

  try {
    const accessToken = await fetchAccessToken(clientId, clientSecret);
    const categoriesData = await fetchCategories(clientId, accessToken);
    const categories = Array.isArray(categoriesData.data) ? categoriesData.data : [];
    const exactCategory = findExactCategory(categories);

    const candidates = categories.map(buildCandidate);

    if (!exactCategory) {
      return NextResponse.json({
        ok: true,
        game: null,
        candidates,
        periodUsed: null,
        count: 0,
        videos: [],
        error: null,
      });
    }

    const game = {
      id: exactCategory.id,
      name: exactCategory.name,
      box_art_url: exactCategory.box_art_url,
    };

    let videosData = await fetchVideos(clientId, accessToken, game.id, 'day');
    let periodUsed: 'day' | 'week' | null = 'day';
    let videos = Array.isArray(videosData.data) ? videosData.data : [];

    if (!videos.length) {
      videosData = await fetchVideos(clientId, accessToken, game.id, 'week');
      periodUsed = 'week';
      videos = Array.isArray(videosData.data) ? videosData.data : [];
    }

    const formattedVideos = videos.map((video: any) => ({
      id: video.id,
      title: video.title,
      url: video.url || `https://www.twitch.tv/videos/${video.id}`,
      user_id: video.user_id,
      user_name: video.user_name,
      created_at: video.created_at,
      published_at: video.published_at,
      view_count: video.view_count,
      duration: video.duration,
      type: video.type,
    }));

    return NextResponse.json({
      ok: true,
      game,
      candidates,
      periodUsed,
      count: formattedVideos.length,
      videos: formattedVideos,
      error: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return formatError(message);
  }
}
