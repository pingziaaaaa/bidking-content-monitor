import type { FormEvent, ReactNode } from 'react';
import { useMemo, useState } from 'react';
import type { AccountItem, ContentItem, Platform } from '@/lib/mock-data';
import { formatNumber, formatOptionalNumber, platformStyles } from '@/components/utils';

type NewAccountInput = {
  platform: Platform;
  url: string;
  note: string;
};

type ConfigSidebarProps = {
  keywords: string[];
  accounts: AccountItem[];
  contents: ContentItem[];
  onAddKeyword: (keyword: string) => void;
  onAddAccount: (account: NewAccountInput) => void;
  onDeleteKeyword: (keyword: string) => void;
  onDeleteAccount: (accountId: string) => void;
};

function parseShanghaiDate(value: string) {
  const match = value.trim().match(/^\s*(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?(.*)$/);

  if (!match) {
    return new Date(value);
  }

  const [, year, month, day, hour = '00', minute = '00', second = '00', rest] = match;
  const timeZoneSuffix = rest.trim() ? rest.trim() : '+08:00';

  return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}${timeZoneSuffix}`);
}

function formatShanghaiDateLabel(date: Date) {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    timeZone: 'Asia/Shanghai',
  }).formatToParts(date);

  const month = parts.find((part) => part.type === 'month')?.value ?? '';
  const day = parts.find((part) => part.type === 'day')?.value ?? '';

  return month && day ? `${month}月${day}日` : new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    timeZone: 'Asia/Shanghai',
  }).format(date);
}

function getShanghaiDateKey(value: string) {
  const date = parseShanghaiDate(value);

  return date.toLocaleDateString('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Shanghai',
  });
}

function sumMetric(contents: ContentItem[], platform: Platform, metric: keyof ContentItem['metrics']) {
  return contents
    .filter((item) => item.platform === platform)
    .reduce((total, item) => total + (item.metrics[metric] ?? 0), 0);
}

function maxMetric(contents: ContentItem[], platform: Platform, metric: keyof ContentItem['metrics']) {
  return contents
    .filter((item) => item.platform === platform)
    .reduce((max, item) => Math.max(max, item.metrics[metric] ?? 0), 0);
}

function aggregateMetric(
  contents: ContentItem[],
  platform: Platform,
  metric: keyof ContentItem['metrics'],
  aggregate: 'sum' | 'max',
) {
  const values = contents
    .filter((item) => item.platform === platform)
    .map((item) => item.metrics[metric])
    .filter((value): value is number => typeof value === 'number');

  if (values.length === 0) {
    return undefined;
  }

  return aggregate === 'max' ? Math.max(...values) : values.reduce((total, value) => total + value, 0);
}

function getDailyMetricRows(
  contents: ContentItem[],
  platform: Platform,
  metric: keyof ContentItem['metrics'],
  aggregate: 'sum' | 'max',
) {
  const bucket: Record<string, { label: string; value: number }> = {};

  contents.forEach((item) => {
    if (item.platform !== platform) {
      return;
    }

    const metricValue = item.metrics[metric];
    if (typeof metricValue !== 'number') {
      return;
    }

    const dateKey = getShanghaiDateKey(item.discoveredAt);
    const current = bucket[dateKey];

    bucket[dateKey] = {
      label: formatShanghaiDateLabel(parseShanghaiDate(item.discoveredAt)),
      value:
        current && aggregate === 'max'
          ? Math.max(current.value, metricValue)
          : aggregate === 'max'
          ? metricValue
          : (current?.value ?? 0) + metricValue,
    };
  });

  return Object.entries(bucket)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, row]) => ({
      key,
      date: row.label,
      value: formatNumber(row.value),
    }));
}

function Card({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-bold text-slate-950">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function AccountRow({ account, onDelete }: { account: AccountItem; onDelete: (id: string) => void }) {
  return (
    <div className="rounded-2xl border border-slate-100 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${platformStyles(account.platform)}`}>{account.platform}</span>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${account.status === '监控中' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
            {account.status}
          </span>
          <button
            className="rounded-full p-1 text-slate-400 hover:text-red-500 transition"
            type="button"
            onClick={() => onDelete(account.id)}
            title="删除账号"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
      <p className="mt-3 font-semibold text-slate-900">{account.name}</p>
      <a className="mt-1 block truncate text-sm text-blue-600 hover:underline" href={account.url}>
        {account.url}
      </a>
      {account.note ? <p className="mt-2 text-xs leading-5 text-slate-500">备注：{account.note}</p> : null}
    </div>
  );
}

export function ConfigSidebar({ keywords, accounts, contents, onAddKeyword, onAddAccount, onDeleteKeyword, onDeleteAccount }: ConfigSidebarProps) {
  const [keywordInput, setKeywordInput] = useState('');
  const [accountPlatform, setAccountPlatform] = useState<Platform>('YouTube');
  const [accountUrl, setAccountUrl] = useState('');
  const [accountNote, setAccountNote] = useState('');

  const todayMetrics = useMemo(
    () => [
      {
        label: 'YouTube播放量',
        badge: '72小时',
        totalTitle: '总播放量',
        dailyTitle: '每日播放量',
        totalValue: formatOptionalNumber(aggregateMetric(contents, 'YouTube', 'views', 'sum')),
        dailyRows: getDailyMetricRows(contents, 'YouTube', 'views', 'sum'),
      },
      {
        label: 'X曝光量',
        badge: '72小时',
        totalTitle: '总曝光量',
        dailyTitle: '每日曝光量',
        totalValue: formatOptionalNumber(aggregateMetric(contents, 'X', 'impressions', 'sum')),
        dailyRows: getDailyMetricRows(contents, 'X', 'impressions', 'sum'),
      },
      {
        label: 'Twitch在线峰值',
        badge: '72小时',
        totalTitle: '最高在线峰值',
        dailyTitle: '每日在线峰值',
        totalValue: formatOptionalNumber(aggregateMetric(contents, 'Twitch', 'peakViewers', 'max')),
        dailyRows: getDailyMetricRows(contents, 'Twitch', 'peakViewers', 'max'),
      },
      {
        label: 'Twitch回看播放',
        badge: '72小时',
        totalTitle: '总回看播放',
        dailyTitle: '每日回看播放',
        totalValue: formatOptionalNumber(aggregateMetric(contents, 'Twitch', 'vodViews', 'sum')),
        dailyRows: getDailyMetricRows(contents, 'Twitch', 'vodViews', 'sum'),
      },
    ],
    [contents],
  );

  function handleKeywordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onAddKeyword(keywordInput);
    setKeywordInput('');
  }

  function handleAccountSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onAddAccount({ platform: accountPlatform, url: accountUrl, note: accountNote });
    setAccountUrl('');
    setAccountNote('');
  }

  return (
    <aside className="space-y-5">
      <Card title="监控关键词">
        <div className="flex flex-wrap gap-2">
          {keywords.map((keyword) => (
            <div key={keyword} className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-2">
              <span className="text-sm font-semibold text-slate-700">{keyword}</span>
              <button
                className="ml-1 rounded-full p-0.5 text-slate-400 hover:text-red-500 transition"
                type="button"
                onClick={() => onDeleteKeyword(keyword)}
                title="删除关键词"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
        <form className="mt-4 flex gap-2" onSubmit={handleKeywordSubmit}>
          <input
            className="min-w-0 flex-1 rounded-full border border-slate-200 px-4 py-2 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
            type="text"
            value={keywordInput}
            onChange={(event) => setKeywordInput(event.target.value)}
            placeholder="添加关键词"
          />
          <button className="rounded-full bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-700" type="submit">
            添加
          </button>
        </form>
        <p className="mt-4 text-sm leading-6 text-slate-500">关键词用于 YouTube / X / Twitch 内容标题、正文、标签的每日自动匹配。</p>
      </Card>

      <Card title="指定账号监控">
        <form className="mb-4 space-y-3 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-100" onSubmit={handleAccountSubmit}>
          <select
            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
            value={accountPlatform}
            onChange={(event) => setAccountPlatform(event.target.value as Platform)}
          >
            <option value="YouTube">YouTube</option>
            <option value="X">X</option>
            <option value="Twitch">Twitch</option>
          </select>
          <input
            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
            type="url"
            value={accountUrl}
            onChange={(event) => setAccountUrl(event.target.value)}
            placeholder="账号链接，如 https://x.com/gamepulse"
          />
          <textarea
            className="min-h-20 w-full resize-none rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
            value={accountNote}
            onChange={(event) => setAccountNote(event.target.value)}
            placeholder="备注，如地区、语言、跟进重点"
          />
          <button className="w-full rounded-full bg-slate-950 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-700" type="submit">
            添加账号
          </button>
        </form>
        <div className="space-y-3">
          {accounts.map((account) => (
            <AccountRow key={account.id} account={account} onDelete={onDeleteAccount} />
          ))}
        </div>
      </Card>

      <Card title="重点指标">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          {todayMetrics.map((metric) => (
            <div key={metric.label} className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm text-slate-500">{metric.label}</p>
                <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700">{metric.badge}</span>
              </div>
              <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{metric.totalTitle}</p>
                <p className="mt-2 text-2xl font-bold text-slate-950">{metric.totalValue}</p>
              </div>
              <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{metric.dailyTitle}</p>
                {metric.dailyRows.length > 0 ? (
                  <div className="mt-2 space-y-2 text-sm text-slate-700">
                    {metric.dailyRows.map((row) => (
                      <div key={row.key} className="flex items-center justify-between rounded-2xl bg-white px-3 py-2 ring-1 ring-slate-100">
                        <span>{row.date}</span>
                        <span className="font-semibold">{row.value}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">暂无数据</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </aside>
  );
}
