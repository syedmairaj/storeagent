#!/usr/bin/env bash

set -euo pipefail

PROJECT="storeagent"

echo "Creating StoreAgent M0 repository skeleton..."

mkdir -p "$PROJECT"

cd "$PROJECT"

# ------------------------------------------------------------
# App Router structure
# ------------------------------------------------------------
mkdir -p \
  "app/(marketing)" \
  "app/(auth)/login" \
  "app/(auth)/signup" \
  "app/dashboard" \
  "app/dashboard/actions" \
  "app/dashboard/inventory" \
  "app/dashboard/forecast" \
  "app/dashboard/suppliers" \
  "app/dashboard/reports" \
  "app/dashboard/integrations" \
  "app/dashboard/settings" \
  "app/api"

# ------------------------------------------------------------
# Shared UI/components
# ------------------------------------------------------------
mkdir -p \
  "components/ui" \
  "components/layout" \
  "components/dashboard" \
  "components/actions" \
  "components/inventory" \
  "components/forecast" \
  "components/suppliers" \
  "components/data-quality"

# ------------------------------------------------------------
# Core application/domain modules
# ------------------------------------------------------------
mkdir -p \
  "lib/auth" \
  "lib/tenancy" \
  "lib/commerce-domain" \
  "lib/providers" \
  "lib/providers/csv" \
  "lib/providers/shopify" \
  "lib/data-quality" \
  "lib/metrics" \
  "lib/forecasting" \
  "lib/decisions" \
  "lib/actions" \
  "lib/ai" \
  "lib/billing" \
  "lib/notifications" \
  "lib/observability" \
  "lib/config" \
  "lib/utils"

# ------------------------------------------------------------
# Background jobs
# ------------------------------------------------------------
mkdir -p "workers"

touch \
  "workers/sync-store.ts" \
  "workers/aggregate-metrics.ts" \
  "workers/calculate-forecast.ts" \
  "workers/generate-actions.ts" \
  "workers/explain-actions.ts" \
  "workers/weekly-brief.ts"

# ------------------------------------------------------------
# Supabase
# ------------------------------------------------------------
mkdir -p \
  "supabase/migrations" \
  "supabase/seed"

# ------------------------------------------------------------
# Tests
# ------------------------------------------------------------
mkdir -p \
  "tests/unit" \
  "tests/property" \
  "tests/contract" \
  "tests/integration" \
  "tests/security" \
  "tests/e2e" \
  "tests/backtests" \
  "tests/fixtures"

# ------------------------------------------------------------
# Documentation
# ------------------------------------------------------------
mkdir -p "docs/adr"

touch \
  "docs/ARCHITECTURE.md" \
  "docs/DOMAIN_MODEL.md" \
  "docs/FORECASTING.md" \
  "docs/DECISION_ENGINE.md" \
  "docs/SECURITY_AND_TENANCY.md" \
  "docs/PROVIDER_CONTRACT.md" \
  "docs/TESTING_STRATEGY.md" \
  "docs/IMPLEMENTATION_STATUS.md" \
  "docs/DECISIONS.md"

# ------------------------------------------------------------
# Placeholder source files for future M0/M1 ownership
# ------------------------------------------------------------
touch \
  "lib/commerce-domain/types.ts" \
  "lib/providers/types.ts" \
  "lib/metrics/types.ts" \
  "lib/forecasting/types.ts" \
  "lib/decisions/types.ts" \
  "lib/actions/types.ts" \
  "lib/data-quality/types.ts"

# ------------------------------------------------------------
# Root project governance files
# ------------------------------------------------------------
touch \
  "README.md" \
  ".env.example"

cat > README.md <<'README'
# StoreAgent.si

AI Inventory & Buying Agent.

## Product thesis

Data determines reality.

Deterministic forecasting and inventory logic calculate decisions.
AI explains, prioritizes, and communicates those decisions.

Merchants approve actions until automation earns their trust.

## Current milestone

M0 — Architecture Lock

Do not begin product implementation until M0 architecture gates are complete.
README

cat > docs/IMPLEMENTATION_STATUS.md <<'STATUS'
# StoreAgent Implementation Status

## Current milestone

M0 — Architecture Lock

## Current sub-milestone

M0.1 — Repository and engineering conventions

## Status

IN PROGRESS

## M0 scope

- [ ] M0.1 Repository + engineering conventions
- [ ] M0.2 Canonical domain schema
- [ ] M0.3 Tenancy / RLS architecture
- [ ] M0.4 Inventory formula specification
- [ ] M0.5 Forecast specification
- [ ] M0.6 Decision engine rules
- [ ] M0.7 Provider adapter contract
- [ ] M0.8 Background job architecture
- [ ] M0.9 Testing / evaluation architecture
- [ ] M0.10 Architecture gate

## Do not start yet

- Authentication implementation
- Database migrations
- CSV importer
- Shopify connector
- Forecast execution code
- AI integration
- Billing
- Production UI

These begin only after M0 passes.
STATUS

cat > docs/DECISIONS.md <<'DECISIONS'
# StoreAgent Frozen Decisions

These decisions come from the StoreAgent Master Product, Architecture & Delivery Roadmap.

## Product

- Cloud SaaS.
- Initial problem: inventory buying and replenishment decisions.
- CSV first.
- Shopify second.
- Core decisions: REORDER, REDUCE, PROMOTE, WATCH.
- Merchant approval before execution in V1.

## Architecture

- Provider-independent canonical commerce domain.
- Deterministic/statistical code owns numerical truth.
- AI explains and summarizes; AI does not calculate inventory truth.
- Evidence exists before recommendations.
- Derived artifacts are versioned/history-safe.
- Imports and jobs must be idempotent.
- Uncertain data fails closed.
- Data-quality problems must be visible.
- No forced Python or microservices at launch.

## V1 exclusions

- No full ERP.
- No WMS.
- No accounting replacement.
- No automatic purchase ordering.
- No automatic price changes.
- No warehouse picking/packing optimization.
DECISIONS

cat > .gitignore <<'GITIGNORE'
# dependencies
node_modules/

# Next.js
.next/
out/

# environment
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# logs
*.log
npm-debug.log*
yarn-debug.log*
pnpm-debug.log*

# macOS
.DS_Store

# editors
.vscode/
.idea/

# coverage
coverage/

# Playwright
playwright-report/
test-results/

# Supabase local
supabase/.branches/
supabase/.temp/

# build/tool caches
.turbo/
*.tsbuildinfo
GITIGNORE

echo
echo "StoreAgent skeleton created successfully."
echo
echo "Project location:"
pwd
echo
echo "Directory tree:"
find . -maxdepth 3 -type d | sort
echo
echo "M0.1 skeleton complete."
