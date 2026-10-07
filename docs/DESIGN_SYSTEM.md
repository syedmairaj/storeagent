# StoreAgent Design System

## Design objective

StoreAgent must feel like a modern AI-era inventory operating system, not a generic admin dashboard.

The product should be:
- dynamic
- spacious
- premium
- decision-first
- data-rich without feeling dense
- visually confident
- responsive
- accessible
- fast

## Core visual principles

1. Decision first, evidence second, charts third.
2. Never cram cards, tables or controls into tight layouts.
3. Use strong typography hierarchy and generous spacing.
4. Prefer progressive disclosure over showing everything at once.
5. Motion should explain state or hierarchy, not decorate randomly.
6. AI features should feel integrated into the workflow, not bolted on.
7. Avoid generic SaaS-template layouts.
8. Avoid excessive glassmorphism.
9. Avoid rainbow AI gradients as the primary visual language.
10. Avoid giant empty hero sections with little product substance.
11. Avoid tiny labels and compressed card layouts.
12. Financial impact and inventory risk should be visually prominent.
13. Evidence must always remain visually connected to a recommendation.
14. Desktop is the primary buying/operations workspace.
15. Mobile should remain excellent for alerts, review and decisions.

## Interaction principles

- Important actions should normally be reachable within three clicks.
- Primary actions should be obvious.
- Secondary detail should be progressively disclosed.
- Loading, empty, error and stale-data states are first-class UX states.
- Hover and motion effects must never hide information.
- Keyboard and focus behavior must be preserved.
- Color may not be the only status indicator.

## Motion principles

Use motion for:
- panel transitions
- action-state changes
- metric changes
- loading/progress
- recommendation priority
- drill-down context
- onboarding progress

Do not use motion for:
- continuous distracting animation
- unnecessary bouncing
- decorative motion without product meaning

## Dashboard quality bar

StoreAgent should visually compete with high-quality 2026 AI SaaS products.

### UX release gate

- Desktop visual quality: >= 9/10
- Mobile visual quality: >= 9/10
- Information hierarchy: >= 9/10
- Responsive spacing: PASS
- Accessibility: PASS
- Keyboard navigation: PASS
- Empty states: PASS
- Error states: PASS
- Loading states: PASS
- No horizontal overflow: PASS
- No cramped cards/tables: PASS
- No generic dashboard-template appearance: PASS

## Product-specific UX

### Overview
Show:
- inventory opportunities
- stockout risk
- overstock cash
- reorder opportunities
- promotion opportunities
- top priority actions
- data quality

The screen should tell the merchant what matters before showing deep analytics.

### Actions
Primary operating workspace.

Action cards/rows must make these immediately clear:
- what StoreAgent recommends
- why
- confidence
- financial/inventory impact
- what the merchant can do next

### Inventory
Dense data is acceptable, but it must remain readable.

Use:
- strong column hierarchy
- filtering
- sticky context when useful
- compact-but-not-cramped rows
- detail inspectors instead of overcrowding the table

### SKU inspector
Prefer side panel or focused detail workspace instead of navigating through many disconnected pages.

### Forecasting
Forecast charts support decisions; charts are not the product.

### AI
AI-generated copy should explain deterministic StoreAgent facts.
It must never visually imply that AI invented the underlying inventory numbers.
