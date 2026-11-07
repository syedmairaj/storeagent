import { ArrowRight, ShieldCheck } from "lucide-react";

import { BrandMark } from "@/components/marketing/brand-mark";
import { DecisionStory } from "@/components/marketing/decision-story";
import { FourDecisionsExplorer } from "@/components/marketing/four-decisions-explorer";
import { LandingAuthButton } from "@/components/marketing/landing-auth";
import { MarketingNav } from "@/components/marketing/marketing-nav";
import { ProblemSolutionVisual } from "@/components/marketing/problem-solution-visual";
import { cn } from "@/lib/utils";

function SectionEyebrow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "mb-3 text-[0.7rem] font-bold uppercase tracking-[0.16em] text-[var(--sa-insight)]",
        className,
      )}
    >
      {children}
    </p>
  );
}

function DisplayHeading({
  children,
  className,
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <h2
      id={id}
      className={cn(
        "font-display text-[clamp(1.65rem,2.8vw,2.4rem)] font-semibold leading-[1.12] tracking-[-0.03em] text-[var(--sa-ink)]",
        className,
      )}
    >
      {children}
    </h2>
  );
}

export function LandingPage() {
  return (
    <>
      <MarketingNav />
      <main>
        {/* 1. Hero + animated decision story */}
        <section
          aria-labelledby="hero-heading"
          className="relative overflow-x-clip border-b border-[var(--sa-frame)]"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(165deg,color-mix(in_srgb,var(--sa-stone)_38%,transparent)_0%,transparent_46%)]"
          />
          <div className="relative mx-auto grid max-w-[78rem] items-center gap-6 px-4 pb-9 pt-6 sm:gap-7 sm:px-6 sm:pb-10 sm:pt-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-8 lg:px-8 lg:pb-11 lg:pt-9 xl:gap-10">
            <div className="min-w-0 lg:pr-1">
              <p className="sa-rise sa-d1 mb-3 inline-flex items-center gap-2 rounded-full border border-[var(--sa-frame)] bg-[var(--sa-porcelain)] px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[var(--sa-ink-muted)]">
                <span
                  className="size-1.5 rounded-full bg-[var(--sa-signal)]"
                  aria-hidden="true"
                />
                Quiet Intelligence · .si
              </p>
              <h1
                id="hero-heading"
                className="sa-rise sa-d2 font-display text-[clamp(1.85rem,3.5vw,2.85rem)] font-semibold leading-[1.08] tracking-[-0.035em] text-[var(--sa-ink)]"
              >
                Know what to reorder.
                <br />
                Know what to adjust.
                <br />
                <span className="text-[color-mix(in_srgb,var(--sa-ink)_70%,var(--sa-insight))]">
                  Know why.
                </span>
              </h1>
              <p className="sa-rise sa-d3 mt-3.5 max-w-[30rem] text-[0.98rem] leading-relaxed text-[var(--sa-ink-muted)] sm:text-[1.05rem]">
                StoreAgent turns inventory and sales signals into clear,
                evidence-backed recommendations. Identify risks, understand the
                reasoning, and decide what happens next.
              </p>
              <div className="sa-rise sa-d4 mt-5 flex w-full flex-col gap-2.5 min-[400px]:w-auto min-[400px]:flex-row min-[400px]:flex-wrap min-[400px]:items-center">
                <a
                  href="#demo"
                  className="group inline-flex items-center justify-center gap-2 rounded-full bg-[var(--sa-ink)] px-5 py-2.5 text-sm font-semibold text-[var(--sa-porcelain)] transition-[transform,background,box-shadow] hover:bg-[color-mix(in_srgb,var(--sa-ink)_90%,var(--sa-insight))] hover:shadow-[0_12px_28px_-14px_color-mix(in_srgb,var(--sa-ink)_70%,transparent)] active:translate-y-px"
                >
                  Explore the demo
                  <ArrowRight
                    className="size-4 transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </a>
                <LandingAuthButton className="inline-flex items-center justify-center rounded-full border border-[var(--sa-frame)] bg-[var(--sa-porcelain)] px-5 py-2.5 text-sm font-semibold text-[var(--sa-ink)] transition-colors hover:border-[color-mix(in_srgb,var(--sa-ink)_22%,var(--sa-frame))] hover:bg-[var(--sa-ink-soft)]">
                  Sign In
                </LandingAuthButton>
              </div>
              <p className="sa-rise sa-d5 mt-3 max-w-md text-xs leading-relaxed text-[var(--sa-ink-muted)]">
                Sign in with email to get started. The story uses demo sample
                data — pause, replay, or switch scenarios anytime.
              </p>
            </div>

            <div className="sa-rise sa-d3 min-w-0">
              <DecisionStory id="demo" />
            </div>
          </div>
        </section>

        {/* 2. Problem vs solution */}
        <section
          id="problem"
          aria-labelledby="problem-heading"
          className="border-b border-[var(--sa-frame)] bg-[var(--sa-ink)] text-[var(--sa-porcelain)]"
        >
          <div className="mx-auto max-w-[78rem] px-4 py-11 sm:px-6 sm:py-12 lg:px-8 lg:py-14">
            <div className="max-w-2xl">
              <SectionEyebrow>
                <span className="text-[var(--sa-stone)]">Problem → solution</span>
              </SectionEyebrow>
              <h2
                id="problem-heading"
                className="font-display text-[clamp(1.45rem,2.5vw,2.05rem)] font-semibold leading-[1.15] tracking-[-0.03em]"
              >
                Inventory uncertainty becomes a decision you can act on.
              </h2>
              <p className="mt-3 max-w-xl text-[0.95rem] leading-relaxed text-[color-mix(in_srgb,var(--sa-porcelain)_72%,transparent)]">
                Select a pressure on the left. See the matching recommendation,
                evidence, and review step on the right — using the same demo
                sample data as the story above.
              </p>
            </div>
            <ProblemSolutionVisual />
          </div>
        </section>

        {/* 3. Four Decisions explorer */}
        <section
          id="decisions"
          aria-labelledby="decisions-heading"
          className="border-b border-[var(--sa-frame)]"
        >
          <div className="mx-auto max-w-[78rem] px-4 py-11 sm:px-6 sm:py-12 lg:px-8">
            <div className="max-w-2xl">
              <SectionEyebrow>Compare decisions</SectionEyebrow>
              <DisplayHeading id="decisions-heading">
                Reorder, Reduce, Promote, or Watch — side by side.
              </DisplayHeading>
              <p className="mt-3 text-[1rem] leading-relaxed text-[var(--sa-ink-muted)]">
                Manually switch scenarios to compare evidence. Nothing auto-rotates
                here.
              </p>
            </div>
            <FourDecisionsExplorer />
          </div>
        </section>

        {/* 4. Business impact and evidence */}
        <section
          id="impact"
          aria-labelledby="impact-heading"
          className="border-b border-[var(--sa-frame)] bg-[color-mix(in_srgb,var(--sa-stone)_26%,var(--sa-porcelain))]"
        >
          <div className="mx-auto max-w-[78rem] px-4 py-11 sm:px-6 sm:py-12 lg:px-8">
            <div className="max-w-2xl">
              <SectionEyebrow>Business impact</SectionEyebrow>
              <DisplayHeading id="impact-heading">
                Built from your stock and sales data. You make the final call.
              </DisplayHeading>
              <p className="mt-3 text-[1rem] leading-relaxed text-[var(--sa-ink-muted)]">
                Recommendations explain risk using inventory cover, velocity,
                age, and data quality — not opaque machine learning or invented
                dollar outcomes.
              </p>
            </div>
            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  title: "Sales at risk",
                  body: "Thin cover before lead time arrives shows up as a Reorder call with the stock gap explained.",
                },
                {
                  title: "Capital tied up",
                  body: "High days of stock and aging SKUs surface as Reduce — without fabricated savings figures.",
                },
                {
                  title: "Markdown pressure",
                  body: "Soft demand on seasonal inventory becomes a Promote recommendation you can interrogate.",
                },
                {
                  title: "Why Watch matters",
                  body: "Incomplete signals mean StoreAgent holds — so you are not pushed into a premature buy or cut.",
                },
              ].map((card) => (
                <div
                  key={card.title}
                  className="rounded-xl border border-[var(--sa-frame)] bg-[var(--sa-porcelain)] px-4 py-4"
                >
                  <h3 className="text-sm font-semibold text-[var(--sa-ink)]">
                    {card.title}
                  </h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-[var(--sa-ink-muted)]">
                    {card.body}
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-5 text-xs text-[var(--sa-ink-muted)]">
              Live store connectors and public signup remain on the roadmap.
              What you see here is demo sample data and implemented review flows
              after Sign In.
            </p>
          </div>
        </section>

        {/* 5. Merchant control + CTA */}
        <section
          id="control"
          aria-labelledby="cta-heading"
          className="relative overflow-hidden"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_18%_0%,color-mix(in_srgb,var(--sa-signal)_16%,transparent),transparent_48%),radial-gradient(ellipse_at_92%_85%,color-mix(in_srgb,var(--sa-insight)_12%,transparent),transparent_42%)]"
          />
          <div className="relative mx-auto grid max-w-[78rem] gap-8 px-4 py-12 sm:px-6 sm:py-14 lg:grid-cols-[1fr_1fr] lg:items-center lg:gap-12 lg:px-8">
            <div>
              <SectionEyebrow>You stay in control</SectionEyebrow>
              <h2
                id="cta-heading"
                className="font-display text-[clamp(1.65rem,3vw,2.4rem)] font-semibold leading-[1.1] tracking-[-0.035em]"
              >
                Review every recommendation before anything moves.
              </h2>
              <p className="mt-3 max-w-lg text-[1rem] leading-relaxed text-[var(--sa-ink-muted)]">
                Sign in to open the interactive Actions workspace with the same
                demo sample data. Accept, edit, and defer run there — not as fake
                buttons on this page.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <LandingAuthButton
                  nextPath="/app"
                  className="group inline-flex items-center gap-2 rounded-full bg-[var(--sa-ink)] px-6 py-3.5 text-sm font-semibold text-[var(--sa-porcelain)] transition-[transform,background,box-shadow] hover:bg-[color-mix(in_srgb,var(--sa-ink)_90%,var(--sa-insight))] hover:shadow-[0_14px_32px_-16px_color-mix(in_srgb,var(--sa-ink)_65%,transparent)] active:translate-y-px"
                >
                  Continue to workspace
                  <ArrowRight
                    className="size-4 transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </LandingAuthButton>
                <a
                  href="/login?mode=password"
                  className="inline-flex items-center rounded-full border border-[var(--sa-frame)] px-5 py-3.5 text-sm font-semibold text-[var(--sa-ink-muted)] transition hover:text-[var(--sa-ink)]"
                >
                  Password sign-in
                </a>
              </div>
            </div>
            <div className="rounded-2xl border border-[var(--sa-frame)] bg-[var(--sa-ink)] p-6 text-[var(--sa-porcelain)] sm:p-7">
              <ShieldCheck
                className="size-7 text-[var(--sa-signal)]"
                aria-hidden="true"
              />
              <h3 className="mt-4 font-display text-xl font-semibold tracking-[-0.02em]">
                What this page does not claim
              </h3>
              <ul className="mt-3 space-y-2.5 text-sm leading-relaxed text-[color-mix(in_srgb,var(--sa-porcelain)_78%,transparent)]">
                <li>No invented savings, uplift, or stockout-prevention dollars.</li>
                <li>No continuous learning, autonomous purchasing, or live connectors.</li>
                <li>Demo sample data is labeled — never sold as live results.</li>
              </ul>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--sa-frame)] bg-[color-mix(in_srgb,var(--sa-stone)_22%,var(--sa-porcelain))]">
        <div className="mx-auto flex max-w-[78rem] flex-col gap-6 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div>
            <BrandMark wordmarkClassName="text-base" />
            <p className="mt-2 max-w-sm text-xs leading-relaxed text-[var(--sa-ink-muted)]">
              StoreAgent.si — Super Intelligent inventory decisions for
              merchants who stay in command.
            </p>
          </div>
          <nav
            className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-[var(--sa-ink-muted)]"
            aria-label="Footer"
          >
            <a href="#demo" className="hover:text-[var(--sa-ink)]">
              Demo
            </a>
            <a href="#decisions" className="hover:text-[var(--sa-ink)]">
              Decisions
            </a>
            <a href="#impact" className="hover:text-[var(--sa-ink)]">
              Impact
            </a>
            <LandingAuthButton className="hover:text-[var(--sa-ink)]">
              Sign In
            </LandingAuthButton>
          </nav>
        </div>
        <div className="border-t border-[var(--sa-frame)]">
          <p className="mx-auto max-w-[78rem] px-4 py-4 text-[0.7rem] text-[var(--sa-ink-muted)] sm:px-6 lg:px-8">
            © {new Date().getFullYear()} StoreAgent. Demo with sample data.
            Features reflect what is implemented today.
          </p>
        </div>
      </footer>
    </>
  );
}
