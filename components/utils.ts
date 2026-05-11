import type { ContentItem, Platform } from '@/lib/mock-data';

const numberFormatter = new Intl.NumberFormat('en-US');

export function formatNumber(value: number) {
  return numberFormatter.format(value);
}

export function platformStyles(platform: Platform) {
  const styles = {
    YouTube: 'bg-red-50 text-red-700 ring-red-100',
    X: 'bg-slate-900 text-white ring-slate-800',
    Twitch: 'bg-violet-50 text-violet-700 ring-violet-100',
  } satisfies Record<Platform, string>;

  return styles[platform];
}

export function getPrimaryMetric(item: ContentItem) {
  if (item.platform === 'YouTube') {
    return item.metrics.views !== undefined ? `Views ${formatNumber(item.metrics.views)}` : 'Views -';
  }

  if (item.platform === 'X') {
    if (item.metrics.impressions !== undefined) {
      return `Impressions ${formatNumber(item.metrics.impressions)}`;
    }

    return item.metrics.engagements !== undefined ? `互动 ${formatNumber(item.metrics.engagements)}` : '互动 -';
  }

  const peakViewers = item.metrics.peakViewers !== undefined ? formatNumber(item.metrics.peakViewers) : '-';
  const vodViews = item.metrics.vodViews !== undefined ? formatNumber(item.metrics.vodViews) : '-';

  return `Peak Viewers ${peakViewers} · VOD Views ${vodViews}`;
}
