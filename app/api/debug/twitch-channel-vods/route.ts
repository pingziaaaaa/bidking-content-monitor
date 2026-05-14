import { NextResponse } from 'next/server';

const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const USERS_URL = 'https://api.twitch.tv/helix/users';
const VIDEOS_URL = 'https://api.twitch.tv/helix/videos';

function formatError(message: string, status = 500) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

async function fetchAccessToken(clientId: string, clientSecret: string) {
  const params = new URLSearchParams();
  params.append('client_id', clientId);
  params.append('client_secret', clientSecret);
  params.append('grant_type', 'client_credentials');

  const response = await fetch(TOKEN_URL, { method: 'POST', body: params });

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

async function fetchUser(clientId: string, accessToken: string, login: string) {
  const url = new URL(USERS_URL);
  url.searchParams.set('login', login);

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Client-Id': clientId,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Twitch user fetch failed: ${response.status} ${body}`);
  }

  const data = await response.json();
  const user = Array.isArray(data.data) ? data.data[0] : null;

  if (!user) return null;

  return {
    id: String(user.id),
    login: String(user.login),
    display_name: String(user.display_name || user.login),
    profile_image_url: String(user.profile_image_url || ''),
  };
}

async function fetchVideosByUser(
  clientId: string,
  accessToken: string,
  userId: string,
  period: string,
  type: string | null
) {
  const url = new URL(VIDEOS_URL);
  url.searchParams.set('user_id', userId);
  url.searchParams.set('period', period);
  url.searchParams.set('sort', 'time');
  url.searchParams.set('first', '20');

  if (type) {
    url.searchParams.set('type', type);
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Client-Id': clientId,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Twitch channel videos fetch failed: ${response.status} ${body}`);
  }

  return response.json();
}

function normalizeVideo(video: any) {
  return {
    id: String(video.id),
    title: String(video.title || ''),
    url: String(video.url || `https://www.twitch.tv/videos/${video.id}`),
    user_id: String(video.user_id || ''),
    user_name: String(video.user_name || ''),
    created_at: String(video.created_at || ''),
    published_at: video.published_at ? String(video.published_at) : null,
    view_count: typeof video.view_count === 'number' ? video.view_count : null,
    duration: typeof video.duration === 'string' ? video.duration : null,
    type: video.type ? String(video.type) : null,
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const login = url.searchParams.get('login')?.trim();

  if (!login) {
    return NextResponse.json({ ok: false, error: 'login 参数必填' }, { status: 400 });
  }

  const clientId = String(process.env.TWITCH_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.TWITCH_CLIENT_SECRET || '').trim();

  if (!clientId || !clientSecret) {
    return formatError('Twitch Client ID / Secret 未配置');
  }

  try {
    const accessToken = await fetchAccessToken(clientId, clientSecret);
    const user = await fetchUser(clientId, accessToken, login);

    if (!user) {
      return NextResponse.json({
        ok: true,
        user: null,
        tests: [],
        firstNonEmptyTest: null,
        error: `未找到 Twitch 用户：${login}`,
      });
    }

    const periods = ['day', 'week', 'month', 'all'];
    const types = ['archive', null, 'highlight', 'upload'] as Array<string | null>;
    const tests = [];

    for (const period of periods) {
      for (const type of types) {
        try {
          const videosData = await fetchVideosByUser(clientId, accessToken, user.id, period, type);
          const videos = Array.isArray(videosData.data) ? videosData.data : [];
          const sampleVideos = videos.slice(0, 10).map(normalizeVideo);

          tests.push({
            period,
            type,
            count: videos.length,
            status: 'ok',
            sampleVideos,
            error: null,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);

          tests.push({
            period,
            type,
            count: 0,
            status: 'error',
            sampleVideos: [],
            error: message,
          });
        }
      }
    }

    const firstNonEmptyTest = tests.find((test) => test.count > 0) ?? null;

    return NextResponse.json({
      ok: true,
      user,
      tests,
      firstNonEmptyTest,
      error: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return formatError(message);
  }
}
