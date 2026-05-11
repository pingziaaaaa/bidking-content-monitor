import type { ContentItem, Platform } from '@/lib/mock-data';

function countByPlatform(contents: ContentItem[], platform: Platform) {
  return contents.filter((item) => item.platform === platform).length;
}

type SummaryBannerProps = {
  contents: ContentItem[];
  latestScanTime: string;
};

export function SummaryBanner({ contents, latestScanTime }: SummaryBannerProps) {
  const summaries = [
    { label: '当前共发现', value: contents.length, suffix: '条内容' },
    { label: 'YouTube', value: countByPlatform(contents, 'YouTube'), suffix: '条' },
    { label: 'X', value: countByPlatform(contents, 'X'), suffix: '条' },
    { label: 'Twitch', value: countByPlatform(contents, 'Twitch'), suffix: '条' },
  ];

  return (
    <section className="rounded-3xl border border-blue-100 bg-blue-50 p-5 shadow-sm">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {summaries.map((summary) => (
            <div key={summary.label} className="rounded-2xl bg-white/75 p-4 ring-1 ring-blue-100">
              <p className="text-sm text-blue-700">{summary.label}</p>
              <p className="mt-2 text-2xl font-bold text-blue-950">
                {summary.value}
                <span className="ml-1 text-sm font-medium text-blue-600">{summary.suffix}</span>
              </p>
            </div>
          ))}
        </div>
        <div className="rounded-2xl bg-blue-600 px-5 py-4 text-white shadow-sm shadow-blue-200">
          <p className="text-xs uppercase tracking-[0.2em] text-blue-100">最近一轮巡查时间</p>
          <p className="mt-2 font-semibold">{latestScanTime}</p>
        </div>
      </div>
    </section>
  );
}
