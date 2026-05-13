import type { Platform } from '@/lib/mock-data';

const numberFormatter = new Intl.NumberFormat('en-US');

export function formatNumber(value: number) {
  return numberFormatter.format(value);
}

export function formatOptionalNumber(value: number | undefined) {
  return value === undefined ? '—' : formatNumber(value);
}

export function platformStyles(platform: Platform) {
  const styles = {
    YouTube: 'bg-red-50 text-red-700 ring-red-100',
    X: 'bg-slate-900 text-white ring-slate-800',
    Twitch: 'bg-violet-50 text-violet-700 ring-violet-100',
  } satisfies Record<Platform, string>;

  return styles[platform];
}
