import type { ContentItem } from '@/lib/mock-data';
import { formatOptionalNumber, platformStyles } from '@/components/utils';

type ContentTableProps = {
  contents: ContentItem[];
  isScanning: boolean;
  onExport: () => void;
  onScan: () => void;
  onDeleteContent: (contentId: string) => void;
  onClearAllContents: () => void;
};

const clampStyles = {
  display: '-webkit-box',
  WebkitBoxOrient: 'vertical' as const,
  overflow: 'hidden',
};

export function ContentTable({ contents, isScanning, onExport, onScan, onDeleteContent, onClearAllContents }: ContentTableProps) {
  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-950">最近24小时内容</h2>
            <p className="mt-1 text-sm text-slate-500">按发现时间倒序展示，命中关键词与指定账号内容统一汇总。</p>
          </div>
          <div className="flex flex-wrap gap-2">
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
            <button
              className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-blue-200 transition hover:bg-blue-700 disabled:cursor-wait disabled:bg-blue-400"
              type="button"
              onClick={onScan}
              disabled={isScanning}
            >
              {isScanning ? '巡查中...' : '立即巡查'}
            </button>
          </div>
        </div>

      <div className="overflow-x-auto">
        <table className="min-w-[1440px] w-full border-separate border-spacing-0 text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              {['平台', '标题/正文', '内容链接', '创作者账号名', 'Followers', 'Views', 'Impressions', 'Peak Viewers', 'VOD Views', '来源', '发现时间', '操作'].map((header) => (
                <th key={header} className="border-b border-slate-200 px-5 py-3 font-bold">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {contents.map((item) => (
              <tr key={item.id} className="align-top transition hover:bg-blue-50/40">
                <td className="px-5 py-4">
                  <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ring-1 ${platformStyles(item.platform)}`}>
                    {item.platform}
                  </span>
                </td>
                <td className="max-w-[420px] px-5 py-4 font-medium leading-6 text-slate-900" style={{ ...clampStyles, WebkitLineClamp: 3 }}>
                  {item.title || '—'}
                </td>
                <td className="min-w-[12rem] px-5 py-4">
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
                </td>
                <td className="max-w-[220px] px-5 py-4 text-slate-700" style={{ ...clampStyles, WebkitLineClamp: 2 }}>
                  {item.creator || '—'}
                </td>
                <td className="whitespace-nowrap px-5 py-4 text-center font-semibold text-slate-950">{formatOptionalNumber(item.metrics.followers)}</td>
                <td className="whitespace-nowrap px-5 py-4 text-center font-semibold text-slate-950">{formatOptionalNumber(item.metrics.views)}</td>
                <td className="whitespace-nowrap px-5 py-4 text-center font-semibold text-slate-950">{formatOptionalNumber(item.metrics.impressions)}</td>
                <td className="whitespace-nowrap px-5 py-4 text-center font-semibold text-slate-950">{formatOptionalNumber(item.metrics.peakViewers)}</td>
                <td className="whitespace-nowrap px-5 py-4 text-center font-semibold text-slate-950">{formatOptionalNumber(item.metrics.vodViews)}</td>
                <td className="px-5 py-4">
                  <span className="inline-flex whitespace-nowrap rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                    {item.source || '—'}
                  </span>
                </td>
                <td className="whitespace-nowrap px-5 py-4 text-slate-500">{item.discoveredAt || '—'}</td>
                <td className="px-5 py-4">
                  <button
                    className="rounded-full p-1 text-slate-400 hover:text-red-500 transition"
                    type="button"
                    onClick={() => onDeleteContent(item.id)}
                    title="删除内容"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {contents.length === 0 ? <div className="px-5 py-10 text-center text-sm text-slate-500">当前筛选条件下暂无内容。</div> : null}
      </div>
    </section>
  );
}
