import type { ContentItem } from '@/lib/mock-data';
import { getPrimaryMetric, platformStyles } from '@/components/utils';

type ContentTableProps = {
  contents: ContentItem[];
  isScanning: boolean;
  onExport: () => void;
  onScan: () => void;
};

export function ContentTable({ contents, isScanning, onExport, onScan }: ContentTableProps) {
  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-950">最近24小时内容</h2>
          <p className="mt-1 text-sm text-slate-500">按发现时间倒序展示，命中关键词与指定账号内容统一汇总。</p>
        </div>
        <div className="flex flex-wrap gap-2">
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
        <table className="min-w-[980px] w-full border-separate border-spacing-0 text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              {['平台', '标题/正文', '链接', '创作者', '核心指标', '来源', '发现时间'].map((header) => (
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
                <td className="max-w-[300px] px-5 py-4 font-medium leading-6 text-slate-900">{item.title}</td>
                <td className="px-5 py-4">
                  <a className="text-blue-600 hover:text-blue-800 hover:underline" href={item.url}>
                    打开链接
                  </a>
                </td>
                <td className="px-5 py-4 text-slate-700">{item.creator}</td>
                <td className="px-5 py-4 font-semibold text-slate-950">{getPrimaryMetric(item)}</td>
                <td className="px-5 py-4">
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{item.source}</span>
                </td>
                <td className="whitespace-nowrap px-5 py-4 text-slate-500">{item.discoveredAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {contents.length === 0 ? <div className="px-5 py-10 text-center text-sm text-slate-500">当前筛选条件下暂无内容。</div> : null}
      </div>
    </section>
  );
}
