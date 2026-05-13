export type Platform = 'YouTube' | 'X' | 'Twitch';

export type ContentItem = {
  id: string;
  platform: Platform;
  title: string;
  url: string;
  creator: string;
  source: '关键词匹配' | '指定账号';
  discoveredAt: string;
  metrics: {
    followers?: number;
    views?: number;
    impressions?: number;
    engagements?: number;
    peakViewers?: number;
    vodViews?: number;
  };
};

export type AccountItem = {
  id: string;
  platform: Platform;
  name: string;
  url: string;
  status: '监控中' | '待复核';
  note?: string;
};

export const platformFilters = ['全部', 'YouTube', 'X', 'Twitch'] as const;

export type PlatformFilterValue = (typeof platformFilters)[number];

export const contents: ContentItem[] = [
  {
    id: 'yt-001',
    platform: 'YouTube',
    title: 'BID KING new bidder journey and tournament strategy breakdown',
    url: 'https://youtube.com/watch?v=bidking-demo-01',
    creator: 'Global Game Desk',
    source: '关键词匹配',
    discoveredAt: '2026-05-11 18:42',
    metrics: { followers: 128000, views: 48200, engagements: 3210 },
  },
  {
    id: 'x-001',
    platform: 'X',
    title: 'BIDKING overseas launch recap: fastest growing auction game in our feed today.',
    url: 'https://x.com/gamepulse/status/1000000001',
    creator: '@gamepulse',
    source: '指定账号',
    discoveredAt: '2026-05-11 17:55',
    metrics: { followers: 84200, impressions: 126000, engagements: 4380 },
  },
  {
    id: 'tw-001',
    platform: 'Twitch',
    title: 'Late night BIDKING challenge stream with creator squad',
    url: 'https://twitch.tv/videos/bidking-demo-01',
    creator: 'BidArenaTV',
    source: '指定账号',
    discoveredAt: '2026-05-11 16:18',
    metrics: { followers: 56000, peakViewers: 1840, vodViews: 9200 },
  },
  {
    id: 'yt-002',
    platform: 'YouTube',
    title: '#BIDKING reward room reaction and first purchase conversion tips',
    url: 'https://youtube.com/shorts/bidking-demo-02',
    creator: 'Auction Quest Clips',
    source: '关键词匹配',
    discoveredAt: '2026-05-11 14:26',
    metrics: { followers: 34700, views: 15800 },
  },
  {
    id: 'x-002',
    platform: 'X',
    title: 'Creators are testing BID KING themed giveaway posts across SEA communities.',
    url: 'https://x.com/esportswatch/status/1000000002',
    creator: '@esportswatch',
    source: '关键词匹配',
    discoveredAt: '2026-05-11 11:08',
    metrics: { followers: 21900, engagements: 980 },
  },
  {
    id: 'tw-002',
    platform: 'Twitch',
    title: 'BIDKING weekend vod gains from Spanish streamers',
    url: 'https://twitch.tv/videos/bidking-demo-02',
    creator: 'MercadoPlay',
    source: '关键词匹配',
    discoveredAt: '2026-05-10 22:37',
    metrics: { followers: 18800, peakViewers: 760, vodViews: 4100 },
  },
];

export const keywords = ['BID KING', 'BIDKING', '#BIDKING'];

export const accounts: AccountItem[] = [
  {
    id: 'acc-yt-01',
    platform: 'YouTube',
    name: 'Global Game Desk',
    url: 'https://youtube.com/@globalgamedesk',
    status: '监控中',
    note: '英文游戏资讯频道',
  },
  {
    id: 'acc-x-01',
    platform: 'X',
    name: '@gamepulse',
    url: 'https://x.com/gamepulse',
    status: '监控中',
    note: '重点关注发布后 2 小时互动',
  },
  {
    id: 'acc-tw-01',
    platform: 'Twitch',
    name: 'BidArenaTV',
    url: 'https://twitch.tv/bidarenatv',
    status: '待复核',
    note: '西语直播内容待复核',
  },
];

export const todayMetrics = [
  { label: 'YouTube播放量', value: '64,000', trend: '+18.6%' },
  { label: 'X曝光量', value: '126,000', trend: '+24.2%' },
  { label: 'Twitch在线峰值', value: '1,840', trend: '+9.8%' },
  { label: 'Twitch回看播放', value: '13,300', trend: '+12.1%' },
];

export const latestScanTime = '2026-05-11 19:00 北京时间';
