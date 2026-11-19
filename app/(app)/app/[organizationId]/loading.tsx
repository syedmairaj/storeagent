export default function OrganizationOverviewLoading() {
  return (
    <div
      className="animate-pulse space-y-8 py-2"
      data-overview-loading="true"
      role="status"
      aria-live="polite"
      aria-label="Loading overview"
    >
      <div className="space-y-4 border-b border-zinc-200 pb-10">
        <div className="h-8 w-48 rounded-full bg-zinc-100" />
        <div className="h-10 max-w-xl rounded-xl bg-zinc-100" />
        <div className="h-16 max-w-2xl rounded-xl bg-zinc-100" />
        <div className="flex gap-3">
          <div className="h-11 w-48 rounded-full bg-zinc-200" />
          <div className="h-11 w-44 rounded-full bg-zinc-100" />
        </div>
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.45fr_0.7fr]">
        <div className="space-y-5">
          <div className="h-64 rounded-[1.75rem] border border-zinc-200 bg-zinc-50" />
          <div className="h-36 rounded-[1.75rem] border border-zinc-200 bg-zinc-50" />
        </div>
        <div className="h-72 rounded-[1.75rem] border border-zinc-200 bg-zinc-50" />
      </div>
      <span className="sr-only">Loading merchant overview…</span>
    </div>
  );
}
