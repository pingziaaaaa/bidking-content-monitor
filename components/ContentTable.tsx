'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import type { ContentItem } from '@/lib/mock-data';
import { formatOptionalNumber, platformStyles } from '@/components/utils';

type ContentTableProps = {
  contents: ContentItem[];
  onExport: () => void;
  onBatchRecognizeX: () => void;
  onDeleteContent: (contentId: string) => void;
  onClearAllContents: () => void;
};

const clampStyles = {
  display: '-webkit-box',
  WebkitBoxOrient: 'vertical' as const,
  overflow: 'hidden',
};

const columns = {
  platform: 90,
  time: 100,
  title: 240,
  link: 130,
  creator: 220,
  followers: 130,
  views: 120,
  impressions: 150,
  peakViewers: 150,
  vodViews: 140,
  source: 230,
  action: 90,
};

const tableWidth = Object.values(columns).reduce((sum, width) => sum + width, 0);

function formatDisplayTime(value: string) {
  if (!value) return '—';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';

  return `${Number(get('month'))}月${Number(get('day'))}日 ${get('hour')}:${get('minute')}`;
}


function HeaderCell({
  children,
  width,
  left,
  className = '',
}: {
  children: ReactNode;
  width: number;
  left?: number;
  className?: string;
}) {
  return (
    <th
      className={`border-b border-slate-200 bg-slate-50 px-5 py-3 font-bold ${left !== undefined ? 'sticky z-30' : ''} ${className}`}
      style={{ width, minWidth: width, left }}
    >
      {children}
    </th>
  );
}

function BodyCell({
  children,
  width,
  left,
  className = '',
}: {
  children: ReactNode;
  width: number;
  left?: number;
  className?: string;
}) {
  return (
    <td
      className={`px-5 py-4 ${left !== undefined ? 'sticky z-10 bg-white group-hover:bg-blue-50' : ''} ${className}`}
      style={{ width, minWidth: width, left }}
    >
      {children}
    </td>
  );
}

export function ContentTable({
  contents,
  onExport,
  onBatchRecognizeX,
  onDeleteContent,
  onClearAllContents,
}: ContentTableProps) {
  const topScrollRef = useRef<HTMLDivElement>(null);
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const bodyScrollRef = useRef<HTMLDivElement>(null);
  const isSyncingScrollRef = useRef(false);

  function syncHorizontalScroll(source: HTMLDivElement | null) {
    if (!source || isSyncingScrollRef.current) return;

    isSyncingScrollRef.current = true;

    const scrollLeft = source.scrollLeft;

    if (topScrollRef.current && topScrollRef.current !== source) {
      topScrollRef.current.scrollLeft = scrollLeft;
    }

    if (headerScrollRef.current && headerScrollRef.current !== source) {
      headerScrollRef.current.scrollLeft = scrollLeft;
    }

    if (bodyScrollRef.current && bodyScrollRef.current !== source) {
      bodyScrollRef.current.scrollLeft = scrollLeft;
    }

    requestAnimationFrame(() => {
      isSyncingScrollRef.current = false;
    });
  }

  useEffect(() => {
    if (!topScrollRef.current || !headerScrollRef.current || !bodyScrollRef.current) return;

    headerScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft;
    bodyScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft;
  }, [contents.length]);

  return (
    <section className="overflow-visible rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="sticky top-[72px] z-40 overflow-hidden rounded-t-3xl border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-950">最近72小时内容</h2>
            <p className="mt-1 text-sm text-slate-500">
              仅展示当前时间往前 72 小时内的内容，按平台优先级展示，平台内按发布时间倒序排列。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700"
              type="button"
              onClick={onBatchRecognizeX}
            >
              批量识别 X
            </button>
            <button
              className="rounded-full border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 transition hover:border-red-300 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
              type="button"
              onClick={onClearAllContents}
              disabled={contents.length === 0}
            >
              清空内容
            </button>
            <button
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              type="button"
              onClick={onExport}
              disabled={contents.length === 0}
            >
              导出当前
            </button>
          </div>
        </div>

        <div
          ref={topScrollRef}
          className="overflow-x-auto border-t border-slate-100 px-5 py-2"
          onScroll={() => syncHorizontalScroll(topScrollRef.current)}
        >
          <div className="h-1" style={{ width: tableWidth }} />
        </div>

        <div
          ref={headerScrollRef}
          className="content-table-scrollbar-hidden overflow-x-auto"
          onScroll={() => syncHorizontalScroll(headerScrollRef.current)}
        >
          <table className="w-full border-separate border-spacing-0 text-left text-xs uppercase tracking-wide text-slate-500" style={{ minWidth: tableWidth, tableLayout: "fixed" }}>
            <thead>
              <tr>
                <HeaderCell width={columns.platform} left={0} className="text-center">平台</HeaderCell>
                <HeaderCell width={columns.time} left={columns.platform} className="!px-3 text-center">发布时间</HeaderCell>
                <HeaderCell width={columns.title} left={columns.platform + columns.time}>标题/正文</HeaderCell>
                <HeaderCell width={columns.link} left={columns.platform + columns.time + columns.title}>内容链接</HeaderCell>
                <HeaderCell width={columns.creator}>创作者账号名</HeaderCell>
                <HeaderCell width={columns.followers}>Followers</HeaderCell>
                <HeaderCell width={columns.views}>Views</HeaderCell>
                <HeaderCell width={columns.impressions}>Impressions</HeaderCell>
                <HeaderCell width={columns.peakViewers}>Peak Viewers</HeaderCell>
                <HeaderCell width={columns.vodViews}>VOD Views</HeaderCell>
                <HeaderCell width={columns.source}>来源</HeaderCell>
                <HeaderCell width={columns.action}>操作</HeaderCell>
              </tr>
            </thead>
          </table>
        </div>
      </div>

      <div
        ref={bodyScrollRef}
        className="content-table-scrollbar-hidden overflow-x-auto"
        onScroll={() => syncHorizontalScroll(bodyScrollRef.current)}
      >
        <table className="w-full border-separate border-spacing-0 text-left text-sm" style={{ minWidth: tableWidth, tableLayout: "fixed" }}>
          <tbody className="divide-y divide-slate-100">
            {contents.map((item) => (
              <tr key={item.id} className="group align-top transition hover:bg-blue-50/40">
                <BodyCell width={columns.platform} left={0} className="text-center">
                  <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ring-1 ${platformStyles(item.platform)}`}>
                    {item.platform}
                  </span>
                </BodyCell>

                <BodyCell width={columns.time} left={columns.platform} className="!px-3 whitespace-nowrap text-center text-slate-500">
                  {formatDisplayTime(item.discoveredAt)}
                </BodyCell>

                <BodyCell width={columns.title} left={columns.platform + columns.time} className="font-medium leading-6 text-slate-900">
                  <div style={{ ...clampStyles, WebkitLineClamp: 3 }}>
                    {item.title || '—'}
                  </div>
                </BodyCell>

                <BodyCell width={columns.link} left={columns.platform + columns.time + columns.title}>
                  {item.url ? (
                    <a
                      className="inline-flex min-w-[6rem] items-center rounded-full bg-slate-50 px-3 py-2 text-sm font-semibold text-blue-600 transition hover:bg-slate-100 hover:text-blue-800"
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      打开链接
                    </a>
                  ) : (
                    <span className="text-slate-500">—</span>
                  )}
                </BodyCell>

                <td className="px-5 py-4 text-slate-700" style={{ width: columns.creator, minWidth: columns.creator }}>
                  <div style={{ ...clampStyles, WebkitLineClamp: 2 }}>
                    {item.creator || '—'}
                  </div>
                </td>

                <td className="whitespace-nowrap px-5 py-4 text-center font-semibold text-slate-950" style={{ width: columns.followers, minWidth: columns.followers }}>
                  {formatOptionalNumber(item.metrics.followers)}
                </td>

                <td className="whitespace-nowrap px-5 py-4 text-center font-semibold text-slate-950" style={{ width: columns.views, minWidth: columns.views }}>
                  {formatOptionalNumber(item.metrics.views)}
                </td>

                <td className="whitespace-nowrap px-5 py-4 text-center font-semibold text-slate-950" style={{ width: columns.impressions, minWidth: columns.impressions }}>
                  {formatOptionalNumber(item.metrics.impressions)}
                </td>

                <td className="whitespace-nowrap px-5 py-4 text-center font-semibold text-slate-950" style={{ width: columns.peakViewers, minWidth: columns.peakViewers }}>
                  {formatOptionalNumber(item.metrics.peakViewers)}
                </td>

                <td className="whitespace-nowrap px-5 py-4 text-center font-semibold text-slate-950" style={{ width: columns.vodViews, minWidth: columns.vodViews }}>
                  {formatOptionalNumber(item.metrics.vodViews)}
                </td>

                <td className="px-5 py-4" style={{ width: columns.source, minWidth: columns.source }}>
                  <span className="inline-flex whitespace-nowrap rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                    {item.source || '—'}
                  </span>
                </td>

                <td className="px-5 py-4" style={{ width: columns.action, minWidth: columns.action }}>
                  <button
                    className="rounded-full p-1 text-slate-400 transition hover:text-red-500"
                    type="button"
                    onClick={() => onDeleteContent(item.id)}
                    title="删除内容"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {contents.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-slate-500">当前筛选条件下暂无内容。</div>
        ) : null}
      </div>
    </section>
  );
}
