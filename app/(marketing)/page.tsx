export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 px-6 text-white">
      <section className="max-w-3xl text-center">
        <p className="mb-4 text-sm font-medium uppercase tracking-[0.2em] text-neutral-400">
          StoreAgent.si
        </p>

        <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">
          AI Inventory & Buying Agent
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-neutral-400">
          Know what to reorder, reduce and promote before inventory becomes a
          problem.
        </p>

        <div className="mt-10 rounded-xl border border-neutral-800 bg-neutral-900/60 p-5 text-sm text-neutral-400">
          M0 — Architecture Lock
        </div>
      </section>
    </main>
  );
}
