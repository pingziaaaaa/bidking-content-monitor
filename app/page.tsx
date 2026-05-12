'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppHeader } from '@/components/AppHeader';
import { ConfigSidebar } from '@/components/ConfigSidebar';
import { ContentTable } from '@/components/ContentTable';
import { PlatformFilter } from '@/components/PlatformFilter';
import { SummaryBanner } from '@/components/SummaryBanner';
import type { AccountItem, ContentItem, Platform, PlatformFilterValue } from '@/lib/mock-data';
import { accounts as initialAccounts, contents as initialContents, keywords as initialKeywords, latestScanTime as initialLatestScanTime } from '@/lib/mock-data';
import { getPrimaryMetric } from '@/components/utils';

type NewAccountInput = {
  platform: Platform;
  url: string;
  note: string;
};

type MonitoringResponse = {
  contents: ContentItem[];
  keywords: string[];
  accounts: AccountItem[];
  latestScanTime: string;
  source: 'supabase' | 'mock';
  message?: string;
};

type AddKeywordResponse = {
  keyword: string;
  source: 'supabase' | 'mock';
};

type AddAccountResponse = {
  account: AccountItem;
  source: 'supabase' | 'mock';
};

function formatBeijingTime(date: Date) {
  return `${new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date)} 北京时间`;
}

function getAccountNameFromUrl(url: string) {
  try {
    const parsedUrl = new URL(url);
    const cleanPath = parsedUrl.pathname.split('/').filter(Boolean).at(-1);

    return cleanPath ? decodeURIComponent(cleanPath) : parsedUrl.hostname;
  } catch {
    return url;
  }
}

function escapeCsvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function buildContentCsv(items: ContentItem[]) {
  const headers = ['平台', '标题/正文', '链接', '创作者', '核心指标', '来源', '发现时间'];
  const rows = items.map((item) => [item.platform, item.title, item.url, item.creator, getPrimaryMetric(item), item.source, item.discoveredAt]);

  return [headers, ...rows].map((row) => row.map(escapeCsvCell).join(',')).join('\n');
}

export default function Home() {
  const [activeFilter, setActiveFilter] = useState<PlatformFilterValue>('全部');
  const [contentItems, setContentItems] = useState<ContentItem[]>(initialContents);
  const [keywords, setKeywords] = useState<string[]>(initialKeywords);
  const [accounts, setAccounts] = useState<AccountItem[]>(initialAccounts);
  const [latestScanTime, setLatestScanTime] = useState(initialLatestScanTime);
  const [isScanning, setIsScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState('');
  const [dataMessage, setDataMessage] = useState('');

  useEffect(() => {
    let isMounted = true;

    async function loadMonitoringData() {
      try {
        const response = await fetch('/api/monitoring');

        if (!response.ok) {
          throw new Error('监控数据读取失败');
        }

        const payload = (await response.json()) as MonitoringResponse;

        if (!isMounted) {
          return;
        }

        setContentItems(payload.contents);
        setKeywords(payload.keywords);
        setAccounts(payload.accounts);
        setLatestScanTime(payload.latestScanTime);
        setDataMessage(payload.message || (payload.source === 'supabase' ? '已连接 Supabase，数据来自数据库。' : 'Supabase 未配置，当前使用本地 mock data。'));
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const message = error instanceof Error ? error.message : '监控数据读取失败';
        setDataMessage(`${message}，当前继续使用本地 mock data。`);
      }
    }

    void loadMonitoringData();

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredContents = useMemo(() => {
    if (activeFilter === '全部') {
      return contentItems;
    }

    return contentItems.filter((item) => item.platform === activeFilter);
  }, [activeFilter, contentItems]);

  async function handleAddKeyword(keyword: string) {
    const normalizedKeyword = keyword.trim();

    if (!normalizedKeyword) {
      return;
    }

    const hasKeyword = keywords.some((currentKeyword) => currentKeyword.toLowerCase() === normalizedKeyword.toLowerCase());

    if (hasKeyword) {
      return;
    }

    try {
      const response = await fetch('/api/monitoring', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type: 'keyword', keyword: normalizedKeyword }),
      });

      if (!response.ok) {
        throw new Error('关键词写入失败');
      }

      const payload = (await response.json()) as AddKeywordResponse;
      setKeywords((currentKeywords) => [...currentKeywords, payload.keyword]);
      setDataMessage(payload.source === 'supabase' ? '关键词已写入 Supabase。' : 'Supabase 未配置，关键词已添加到本地状态。');
    } catch (error) {
      const message = error instanceof Error ? error.message : '关键词写入失败';
      setKeywords((currentKeywords) => [...currentKeywords, normalizedKeyword]);
      setDataMessage(`${message}，已临时添加到本地状态。`);
    }
  }

  async function handleAddAccount(account: NewAccountInput) {
    const url = account.url.trim();
    const note = account.note.trim();

    if (!url) {
      return;
    }

    const optimisticAccount: AccountItem = {
      id: `acc-${Date.now()}`,
      platform: account.platform,
      name: getAccountNameFromUrl(url),
      url,
      status: '监控中',
      note,
    };

    try {
      const response = await fetch('/api/monitoring', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type: 'account', platform: optimisticAccount.platform, url: optimisticAccount.url, name: optimisticAccount.name, note: optimisticAccount.note || '' }),
      });

      if (!response.ok) {
        throw new Error('指定账号写入失败');
      }

      const payload = (await response.json()) as AddAccountResponse;
      setAccounts((currentAccounts) => [payload.account, ...currentAccounts]);
      setDataMessage(payload.source === 'supabase' ? '指定账号已写入 Supabase。' : 'Supabase 未配置，指定账号已添加到本地状态。');
    } catch (error) {
      const message = error instanceof Error ? error.message : '指定账号写入失败';
      setAccounts((currentAccounts) => [optimisticAccount, ...currentAccounts]);
      setDataMessage(`${message}，已临时添加到本地状态。`);
    }
  }

  function handleScan() {
    if (isScanning) {
      return;
    }

    setIsScanning(true);
    setScanMessage('正在巡查 YouTube / X / Twitch 三个平台，请稍候...');

    window.setTimeout(() => {
      const nextScanTime = formatBeijingTime(new Date());
      setLatestScanTime(nextScanTime);
      setIsScanning(false);
      setScanMessage(`巡查完成：当前筛选「${activeFilter}」共发现 ${filteredContents.length} 条内容，最近巡查时间已更新。`);
    }, 1000);
  }

  function handleExport() {
    const csv = buildContentCsv(filteredContents);
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = objectUrl;
    link.download = `bidking-content-${activeFilter}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <AppHeader />
      <main className="mx-auto grid max-w-[1440px] gap-6 px-6 py-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="space-y-5">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-blue-600">Content Monitor</p>
                <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950">当前内容监控</h2>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500">
                  自动每天北京时间19:00巡查 YouTube / X / Twitch 三个平台，关键词匹配 + 指定账号双通道发现。右侧可手动巡查。
                </p>
              </div>
              <button
                className="rounded-full bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-sm shadow-blue-200 transition hover:bg-blue-700 disabled:cursor-wait disabled:bg-blue-400"
                type="button"
                onClick={handleScan}
                disabled={isScanning}
              >
                {isScanning ? '巡查中...' : '手动巡查'}
              </button>
            </div>
          </div>

          <SummaryBanner contents={contentItems} latestScanTime={latestScanTime} />
          {dataMessage ? (
            <div className="rounded-2xl border border-blue-100 bg-blue-50 px-5 py-4 text-sm font-semibold text-blue-700 shadow-sm">{dataMessage}</div>
          ) : null}
          {scanMessage ? (
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-5 py-4 text-sm font-semibold text-emerald-700 shadow-sm">{scanMessage}</div>
          ) : null}
          <PlatformFilter activeFilter={activeFilter} onFilterChange={setActiveFilter} />
          <ContentTable contents={filteredContents} isScanning={isScanning} onExport={handleExport} onScan={handleScan} />
        </section>

        <ConfigSidebar keywords={keywords} accounts={accounts} onAddKeyword={handleAddKeyword} onAddAccount={handleAddAccount} />
      </main>
    </div>
  );
}
