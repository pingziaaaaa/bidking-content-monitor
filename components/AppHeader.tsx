export function AppHeader() {
  return (
    <header className="sticky top-0 z-[100] border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-lg font-black text-white shadow-sm shadow-blue-200">
            BK
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-slate-950">BIDKING的海外内容监控</h1>
            <p className="text-sm text-slate-500">BIDKING · 海外内容声量追踪</p>
          </div>
        </div>
        <nav className="flex items-center gap-3 text-sm font-medium">
          <a className="rounded-full border border-slate-200 px-4 py-2 text-slate-700 transition hover:border-blue-200 hover:text-blue-700" href="#">
            独立站点
          </a>
          <a className="rounded-full bg-slate-950 px-4 py-2 text-white transition hover:bg-blue-700" href="#">
            退出
          </a>
        </nav>
      </div>
    </header>
  );
}
