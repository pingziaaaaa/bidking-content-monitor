'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import { AppHeader } from '@/components/AppHeader';
import { ConfigSidebar } from '@/components/ConfigSidebar';
import { ContentTable } from '@/components/ContentTable';
import { PlatformFilter } from '@/components/PlatformFilter';
import { SummaryBanner } from '@/components/SummaryBanner';
import type { AccountItem, ContentItem, Platform, PlatformFilterValue } from '@/lib/mock-data';
import { accounts as initialAccounts, contents as initialContents, keywords as initialKeywords, latestScanTime as initialLatestScanTime } from '@/lib/mock-data';
import { formatOptionalNumber } from '@/components/utils';

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

type RecognitionResult = {
  id: string;
  url: string | null;
  platform_content_id: string | null;
  creator: string;
  name: string | null;
  username: string | null;
  title: string;
  published_at: string | null;
  followers: number | null;
  impressions: number | null;
  source: string;
  status: 'success' | 'partial' | 'failed';
  warning: string | null;
};

function PasteArea({ label, value, onPaste, onClear, required }: {
  label: string;
  value: string | null;
  onPaste: (base64: string) => void;
  onClear: () => void;
  required?: boolean;
}) {
  const [isFocused, setIsFocused] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePaste = async (event: React.ClipboardEvent) => {
    event.preventDefault();
    const items = event.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.indexOf('image') !== -1) {
        const file = item.getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            onPaste(result);
          };
          reader.readAsDataURL(file);
        }
        break;
      }
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        onPaste(result);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div>
      <label className="block text-sm font-medium text-slate-700">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <div
        className={`mt-1 min-h-[120px] w-full rounded-3xl border-2 border-dashed px-4 py-3 text-sm text-slate-900 transition ${
          isFocused ? 'border-blue-400 bg-blue-50' : value ? 'border-green-400 bg-green-50' : 'border-slate-300 bg-slate-50'
        }`}
        onPaste={handlePaste}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        tabIndex={0}
        role="textbox"
        aria-label={label}
      >
        {value ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src={value} alt="预览" className="h-16 w-16 rounded-lg object-cover" />
              <span className="text-green-700">已粘贴截图</span>
            </div>
            <button
              type="button"
              onClick={onClear}
              className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 transition hover:border-red-300 hover:text-red-600"
            >
              清除
            </button>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-center text-slate-500">
            <div>
              <p>粘贴截图到这里，或选择文件</p>
              <p className="text-xs mt-1">支持 Ctrl+V 粘贴或点击选择文件</p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-2 rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 transition hover:border-blue-300 hover:text-blue-600"
              >
                选择文件
              </button>
            </div>
          </div>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
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
  const headers = ['平台', '标题/正文', '内容链接', '创作者账号名', 'Followers', 'Views', 'Impressions', 'Peak Viewers', 'VOD Views', '来源', '发现时间'];
  const rows = items.map((item) => [
    item.platform,
    item.title,
    item.url,
    item.creator,
    formatOptionalNumber(item.metrics.followers),
    formatOptionalNumber(item.metrics.views),
    formatOptionalNumber(item.metrics.impressions),
    formatOptionalNumber(item.metrics.peakViewers),
    formatOptionalNumber(item.metrics.vodViews),
    item.source,
    item.discoveredAt,
  ]);

  return [headers, ...rows].map((row) => row.map(escapeCsvCell).join(',')).join('\n');
}

const platformSortPriority: Record<Platform, number> = {
  Twitch: 0,
  YouTube: 1,
  X: 2,
};

function getPlatformSortPriority(platform: Platform) {
  return platformSortPriority[platform] ?? 99;
}

function getDiscoveredAtTime(value: string) {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
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
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importLinksText, setImportLinksText] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState('');

  const [isRecognizeModalOpen, setIsRecognizeModalOpen] = useState(false);
  const [recognitionItems, setRecognitionItems] = useState<Array<{
    id: string;
    postImageBase64: string | null;
    profileImageBase64: string | null;
  }>>([]);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [recognitionResults, setRecognitionResults] = useState<RecognitionResult[] | null>(null);
  const [recognitionError, setRecognitionError] = useState('');

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
    const filtered = activeFilter === '全部'
      ? contentItems
      : contentItems.filter((item) => item.platform === activeFilter);

    return [...filtered].sort((a, b) => {
      const platformDiff = getPlatformSortPriority(a.platform) - getPlatformSortPriority(b.platform);

      if (platformDiff !== 0) {
        return platformDiff;
      }

      return getDiscoveredAtTime(b.discoveredAt) - getDiscoveredAtTime(a.discoveredAt);
    });
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

  async function handleScan() {
    if (isScanning) {
      return;
    }

    setIsScanning(true);
    setScanMessage('正在巡查 YouTube、X 和 Twitch，请稍候...');

    try {
      const results = [];

      // 先调用 YouTube
      try {
        const youtubeResponse = await fetch('/api/scan/youtube', {
          method: 'POST',
        });

        if (!youtubeResponse.ok) {
          const errorData = await youtubeResponse.json();
          results.push(`YouTube: ${errorData.message}`);
        } else {
          const result = await youtubeResponse.json();
          results.push(`YouTube: ${result.message}`);
        }
      } catch (error) {
        results.push(`YouTube: ${error instanceof Error ? error.message : '扫描失败'}`);
      }

      // 再调用 X
      try {
        const xResponse = await fetch('/api/scan/x', {
          method: 'POST',
        });

        if (!xResponse.ok) {
          const errorData = await xResponse.json();
          let xMessage = `X: ${errorData.message}`;
          if (errorData.debug) {
            xMessage += ` | Query: ${errorData.debug.query} | Status: ${errorData.debug.status} | Raw: ${errorData.debug.rawFoundCount}`;
            if (errorData.debug.errorMessage) {
              xMessage += ` | Error: ${errorData.debug.errorMessage}`;
            }
            if (errorData.debug.rateLimitRemaining) {
              xMessage += ` | Rate: ${errorData.debug.rateLimitRemaining}/${errorData.debug.rateLimitLimit}`;
            }
          }
          results.push(xMessage);
        } else {
          const result = await xResponse.json();
          let xMessage = `X: ${result.message}`;
          if (result.debug) {
            xMessage += ` | Query: ${result.debug.query} | Status: ${result.debug.status} | Raw: ${result.debug.rawFoundCount} | Filtered: ${result.filteredOutCount}`;
            if (result.debug.rateLimitRemaining) {
              xMessage += ` | Rate: ${result.debug.rateLimitRemaining}/${result.debug.rateLimitLimit}`;
            }
          }
          results.push(xMessage);
        }
      } catch (error) {
        results.push(`X: ${error instanceof Error ? error.message : '扫描失败'}`);
      }

      // 最后调用 Twitch
      try {
        const twitchResponse = await fetch('/api/scan/twitch', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ days: 3, maxChannels: 10 }),
        });

        const twitchResult = await twitchResponse.json();

        if (!twitchResponse.ok || !twitchResult.ok) {
          results.push(`Twitch: ${twitchResult.message || twitchResult.error || '扫描失败'}`);
        } else {
          results.push(`Twitch: ${twitchResult.message}`);
        }
      } catch (error) {
        results.push(`Twitch: ${error instanceof Error ? error.message : '扫描失败'}`);
      }

      // 重新加载数据
      const monitoringResponse = await fetch('/api/monitoring');
      if (monitoringResponse.ok) {
        const payload = await monitoringResponse.json();
        setContentItems(payload.contents);
        setKeywords(payload.keywords);
        setAccounts(payload.accounts);
        setLatestScanTime(payload.latestScanTime);
        setDataMessage(payload.message || '数据已更新');
      }

      setScanMessage(results.join('；'));
    } catch (error) {
      const message = error instanceof Error ? error.message : '巡查失败';
      setScanMessage(`巡查失败：${message}`);
    } finally {
      setIsScanning(false);
    }
  }

  function handleOpenImportModal() {
    setImportLinksText('');
    setImportError('');
    setIsImportModalOpen(true);
  }

  function handleCloseImportModal() {
    setImportLinksText('');
    setImportError('');
    setIsImportModalOpen(false);
  }

  async function handleSubmitImportLinks() {
    if (isImporting) {
      return;
    }

    const links = importLinksText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (links.length === 0) {
      setImportError('请输入一个或多个 X 链接，每行一条。');
      return;
    }

    setIsImporting(true);
    setImportError('');

    try {
      const response = await fetch('/api/manual/x-link-import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ links }),
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.message || '导入失败，请稍后重试。');
      }

      if (result.failedLinks && result.failedLinks.length > 0) {
        const invalidLinks = result.failedLinks
          .map((item: { link: string; reason: string }) => `${item.link}：${item.reason}`)
          .join('；');
        setDataMessage(`已识别 ${result.apiSuccessCount} 条，待补充 ${result.fallbackCount} 条，失败链接 ${result.failedLinks.length} 条：${invalidLinks}`);
      } else {
        setDataMessage(`已识别 ${result.apiSuccessCount} 条，待补充 ${result.fallbackCount} 条，失败链接 0 条。`);
      }

      const monitoringResponse = await fetch('/api/monitoring');
      if (monitoringResponse.ok) {
        const payload = (await monitoringResponse.json()) as MonitoringResponse;
        setContentItems(payload.contents);
        setKeywords(payload.keywords);
        setAccounts(payload.accounts);
        setLatestScanTime(payload.latestScanTime);
      }

      handleCloseImportModal();
    } catch (error) {
      const message = error instanceof Error ? error.message : '导入失败';
      setImportError(message);
    } finally {
      setIsImporting(false);
    }
  }

  function handleOpenRecognizeModal() {
    setRecognitionItems([{ id: `item-${Date.now()}`, postImageBase64: null, profileImageBase64: null }]);
    setRecognitionResults(null);
    setRecognitionError('');
    setIsRecognizeModalOpen(true);
  }

  function handleCloseRecognizeModal() {
    setRecognitionItems([]);
    setRecognitionResults(null);
    setRecognitionError('');
    setIsRecognizeModalOpen(false);
  }

  function handleAddRecognitionItem() {
    setRecognitionItems([...recognitionItems, { id: `item-${Date.now()}`, postImageBase64: null, profileImageBase64: null }]);
  }

  function handleRemoveRecognitionItem(itemId: string) {
    setRecognitionItems(recognitionItems.filter((item) => item.id !== itemId));
  }

  function handlePostImagePaste(itemId: string, base64: string) {
    setRecognitionItems(
      recognitionItems.map((item) =>
        item.id === itemId ? { ...item, postImageBase64: base64 } : item,
      ),
    );
  }

  function handleProfileImagePaste(itemId: string, base64: string) {
    setRecognitionItems(
      recognitionItems.map((item) =>
        item.id === itemId ? { ...item, profileImageBase64: base64 } : item,
      ),
    );
  }

  function handleClearPostImage(itemId: string) {
    setRecognitionItems(
      recognitionItems.map((item) =>
        item.id === itemId ? { ...item, postImageBase64: null } : item,
      ),
    );
  }

  function handleClearProfileImage(itemId: string) {
    setRecognitionItems(
      recognitionItems.map((item) =>
        item.id === itemId ? { ...item, profileImageBase64: null } : item,
      ),
    );
  }

  async function handleBatchRecognize() {
    if (isRecognizing) {
      return;
    }

    const validItems = recognitionItems.filter((item) => item.postImageBase64);
    if (!validItems.length) {
      setRecognitionError('至少需要粘贴一张 Post 截图');
      return;
    }

    setIsRecognizing(true);
    setRecognitionError('');

    try {
      const requestBody = {
        items: validItems.map((item) => ({
          id: item.id,
          postImageBase64: item.postImageBase64,
          profileImageBase64: item.profileImageBase64 || undefined,
        })),
      };

      const response = await fetch('/api/manual/x-screenshot-recognize-batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.message || '识别失败，请稍后重试');
      }

      setRecognitionResults(result.results);
    } catch (error) {
      const message = error instanceof Error ? error.message : '识别失败';
      setRecognitionError(message);
    } finally {
      setIsRecognizing(false);
    }
  }

  function handleUpdateRecognitionResult(itemIdx: number, updates: Record<string, unknown>) {
    if (!recognitionResults) {
      return;
    }

    const updated = [...recognitionResults];
    updated[itemIdx] = { ...updated[itemIdx], ...updates } as RecognitionResult;
    setRecognitionResults(updated);
  }

  async function handleConfirmRecognitionImport() {
    if (!recognitionResults) {
      return;
    }

    setIsRecognizing(true);
    setRecognitionError('');

    try {
      const response = await fetch('/api/manual/x-screenshot-import-batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ items: recognitionResults }),
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.message || '写入失败');
      }

      setDataMessage(
        `截图识别写入完成：成功 ${result.insertedCount + result.updatedCount} 条，失败 ${result.failedCount || 0} 条。`,
      );

      const monitoringResponse = await fetch('/api/monitoring');
      if (monitoringResponse.ok) {
        const payload = (await monitoringResponse.json()) as MonitoringResponse;
        setContentItems(payload.contents);
        setKeywords(payload.keywords);
        setAccounts(payload.accounts);
        setLatestScanTime(payload.latestScanTime);
      }

      handleCloseRecognizeModal();
    } catch (error) {
      const message = error instanceof Error ? error.message : '写入失败';
      setRecognitionError(message);
    } finally {
      setIsRecognizing(false);
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

  async function handleDeleteKeyword(keyword: string) {
    if (keywords.length <= 1) {
      alert('至少保留一个关键词');
      return;
    }

    if (!window.confirm(`确定删除关键词 "${keyword}" 吗？`)) {
      return;
    }

    try {
      const response = await fetch('/api/monitoring', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type: 'keyword', keyword }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || '删除失败');
      }

      const result = await response.json();
      setKeywords((currentKeywords) => currentKeywords.filter((k) => k !== keyword));
      setDataMessage(result.source === 'supabase' ? '关键词已从 Supabase 删除。' : '关键词已从本地状态删除。');
    } catch (error) {
      const message = error instanceof Error ? error.message : '删除失败';
      setDataMessage(`删除失败：${message}`);
    }
  }

  async function handleDeleteAccount(accountId: string) {
    const account = accounts.find((a) => a.id === accountId);
    if (!account) return;

    if (!window.confirm(`确定删除账号 "${account.name}" 吗？`)) {
      return;
    }

    try {
      const response = await fetch('/api/monitoring', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type: 'account', id: accountId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || '删除失败');
      }

      const result = await response.json();
      setAccounts((currentAccounts) => currentAccounts.filter((a) => a.id !== accountId));
      setDataMessage(result.source === 'supabase' ? '账号已从 Supabase 删除。' : '账号已从本地状态删除。');
    } catch (error) {
      const message = error instanceof Error ? error.message : '删除失败';
      setDataMessage(`删除失败：${message}`);
    }
  }

  async function handleDeleteContent(contentId: string) {
    const content = contentItems.find((c) => c.id === contentId);
    if (!content) return;

    if (!window.confirm(`确定删除内容 "${content.title || '无标题'}" 吗？`)) {
      return;
    }

    try {
      const response = await fetch('/api/monitoring', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type: 'content', id: contentId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || '删除失败');
      }

      const result = await response.json();
      setContentItems((currentContents) => currentContents.filter((c) => c.id !== contentId));
      setDataMessage(result.source === 'supabase' ? '内容已从 Supabase 删除。' : '内容已从本地状态删除。');
    } catch (error) {
      const message = error instanceof Error ? error.message : '删除失败';
      setDataMessage(`删除失败：${message}`);
    }
  }

  async function handleClearAllContents() {
    if (!window.confirm('确定清空所有内容记录吗？此操作不可撤销。')) {
      return;
    }

    try {
      const response = await fetch('/api/monitoring', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type: 'content', id: 'all' }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || '清空失败');
      }

      const result = await response.json();
      setContentItems([]);
      setDataMessage(result.source === 'supabase' ? '所有内容已从 Supabase 清空。' : '所有内容已从本地状态清空。');
    } catch (error) {
      const message = error instanceof Error ? error.message : '清空失败';
      setDataMessage(`清空失败：${message}`);
    }
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
          <ContentTable contents={filteredContents} isScanning={isScanning} onExport={handleExport} onScan={handleScan} onBatchRecognizeX={handleOpenRecognizeModal} onDeleteContent={handleDeleteContent} onClearAllContents={handleClearAllContents} />

          {isImportModalOpen ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6">
              <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-slate-200">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-bold text-slate-950">导入 X 链接</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-500">支持单条或批量链接，每行一个。系统会自动解析 username 和 tweet id，并尝试通过 X API 补全数据。</p>
                  </div>
                  <button
                    className="rounded-full border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300"
                    type="button"
                    onClick={handleCloseImportModal}
                  >
                    关闭
                  </button>
                </div>

                <div className="mt-6 space-y-4">
                  <label className="block text-sm font-medium text-slate-700">X 链接</label>
                  <textarea
                    className="min-h-[180px] w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
                    value={importLinksText}
                    onChange={(event) => setImportLinksText(event.target.value)}
                    placeholder="每行输入一个 X 链接，例如：https://x.com/katsu_00/status/123456789"
                  />
                  <p className="text-sm text-slate-500">仅解析链接，不进行网页抓取。若 X API 不可用，将创建待补充记录。</p>
                  {importError ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{importError}</div> : null}
                </div>

                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                  <button
                    className="rounded-full border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300"
                    type="button"
                    onClick={handleCloseImportModal}
                    disabled={isImporting}
                  >
                    取消
                  </button>
                  <button
                    className="rounded-full bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm shadow-blue-200 transition hover:bg-blue-700 disabled:cursor-wait disabled:bg-blue-400"
                    type="button"
                    onClick={handleSubmitImportLinks}
                    disabled={isImporting}
                  >
                    {isImporting ? '导入中...' : '开始导入'}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {isRecognizeModalOpen ? (
            <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/40 px-4 py-6">
              <div className="mx-auto w-full max-w-6xl rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-slate-200">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h3 className="text-xl font-bold text-slate-950">批量识别 X</h3>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                      支持直接复制截图后 Ctrl+V 粘贴，或选择文件上传。Post 截图必填，主页截图选填。系统将从图片中识别 X 链接、username、tweet id、正文、发布时间、Impressions 和 Followers。
                    </p>
                  </div>
                  <button
                    className="rounded-full border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300"
                    type="button"
                    onClick={handleCloseRecognizeModal}
                  >
                    关闭
                  </button>
                </div>

                <div className="mt-6 space-y-6">
                  <div className="space-y-4 rounded-3xl border border-slate-200 bg-slate-50 p-4">
                    {recognitionItems.map((item, index) => (
                      <div key={item.id} className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_auto]">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-slate-900">第 {index + 1} 条</p>
                            <button
                              className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 transition hover:border-red-300 hover:text-red-600"
                              type="button"
                              onClick={() => handleRemoveRecognitionItem(item.id)}
                            >
                              删除
                            </button>
                          </div>
                          <PasteArea
                            label="Post 截图（必填）"
                            value={item.postImageBase64}
                            onPaste={(base64) => handlePostImagePaste(item.id, base64)}
                            onClear={() => handleClearPostImage(item.id)}
                            required
                          />
                          <PasteArea
                            label="主页截图（选填）"
                            value={item.profileImageBase64}
                            onPaste={(base64) => handleProfileImagePaste(item.id, base64)}
                            onClear={() => handleClearProfileImage(item.id)}
                          />
                        </div>
                      </div>
                    ))}
                    <button
                      className="rounded-full border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700"
                      type="button"
                      onClick={handleAddRecognitionItem}
                    >
                      添加一条
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button
                      className="rounded-full bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm shadow-blue-200 transition hover:bg-blue-700 disabled:cursor-wait disabled:bg-blue-400"
                      type="button"
                      onClick={handleBatchRecognize}
                      disabled={isRecognizing}
                    >
                      {isRecognizing ? '识别中...' : '开始识别'}
                    </button>
                    <button
                      className="rounded-full border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300"
                      type="button"
                      onClick={handleCloseRecognizeModal}
                      disabled={isRecognizing}
                    >
                      取消
                    </button>
                  </div>

                  {recognitionError ? (
                    <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {recognitionError}
                    </div>
                  ) : null}

                  {recognitionResults ? (
                    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                      <h4 className="text-lg font-semibold text-slate-900">识别结果预览</h4>
                      <div className="mt-4 overflow-x-auto">
                        <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
                          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                            <tr>
                              {['状态', '链接', 'tweet id', '创作者', '用户名', '标题', '发布时间', 'Followers', 'Impressions', '来源', '说明'].map((header) => (
                                <th key={header} className="border-b border-slate-200 px-3 py-3 font-bold">
                                  {header}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {recognitionResults.map((result, idx) => (
                              <tr key={result.id}>
                                <td className="border-b border-slate-100 px-3 py-3 text-slate-700">{result.status === 'success' ? '成功' : result.status === 'partial' ? '部分' : '失败'}</td>
                                <td className="border-b border-slate-100 px-3 py-3">
                                  <input
                                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                                    type="text"
                                    value={result.url ?? ''}
                                    onChange={(event) => handleUpdateRecognitionResult(idx, { url: event.target.value || null })}
                                    placeholder="https://x.com/..."
                                  />
                                </td>
                                <td className="border-b border-slate-100 px-3 py-3">
                                  <input
                                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                                    type="text"
                                    value={result.platform_content_id ?? ''}
                                    onChange={(event) => handleUpdateRecognitionResult(idx, { platform_content_id: event.target.value || null })}
                                    placeholder="tweet id"
                                  />
                                </td>
                                <td className="border-b border-slate-100 px-3 py-3">
                                  <input
                                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                                    type="text"
                                    value={result.creator}
                                    onChange={(event) => handleUpdateRecognitionResult(idx, { creator: event.target.value })}
                                  />
                                </td>
                                <td className="border-b border-slate-100 px-3 py-3">
                                  <input
                                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                                    type="text"
                                    value={result.username ?? ''}
                                    onChange={(event) => handleUpdateRecognitionResult(idx, { username: event.target.value || null })}
                                  />
                                </td>
                                <td className="border-b border-slate-100 px-3 py-3">
                                  <input
                                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                                    type="text"
                                    value={result.title}
                                    onChange={(event) => handleUpdateRecognitionResult(idx, { title: event.target.value })}
                                  />
                                </td>
                                <td className="border-b border-slate-100 px-3 py-3">
                                  <input
                                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                                    type="text"
                                    value={result.published_at ?? ''}
                                    onChange={(event) => handleUpdateRecognitionResult(idx, { published_at: event.target.value || null })}
                                  />
                                </td>
                                <td className="border-b border-slate-100 px-3 py-3">
                                  <input
                                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                                    type="number"
                                    value={result.followers ?? ''}
                                    onChange={(event) => handleUpdateRecognitionResult(idx, { followers: event.target.value ? Number(event.target.value) : null })}
                                  />
                                </td>
                                <td className="border-b border-slate-100 px-3 py-3">
                                  <input
                                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                                    type="number"
                                    value={result.impressions ?? ''}
                                    onChange={(event) => handleUpdateRecognitionResult(idx, { impressions: event.target.value ? Number(event.target.value) : null })}
                                  />
                                </td>
                                <td className="border-b border-slate-100 px-3 py-3">
                                  <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{result.source}</span>
                                </td>
                                <td className="border-b border-slate-100 px-3 py-3 text-sm text-slate-500">{result.warning ?? '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-end">
                        <button
                          className="rounded-full bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-sm shadow-emerald-200 transition hover:bg-emerald-700 disabled:cursor-wait disabled:bg-emerald-400"
                          type="button"
                          onClick={handleConfirmRecognitionImport}
                          disabled={isRecognizing}
                        >
                          {isRecognizing ? '写入中...' : '确认写入 Supabase'}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </section>

        <ConfigSidebar keywords={keywords} accounts={accounts} onAddKeyword={handleAddKeyword} onAddAccount={handleAddAccount} onDeleteKeyword={handleDeleteKeyword} onDeleteAccount={handleDeleteAccount} />
      </main>
    </div>
  );
}
