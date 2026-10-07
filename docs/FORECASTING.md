# StoreAgent Forecast Specification

## Purpose

StoreAgent forecasting estimates future demand using deterministic, versioned and reproducible logic.

Forecasting does not make inventory decisions directly.

Forecast output becomes an input into:

- safety stock
- reorder point
- target stock
- stockout risk
- overstock risk
- inventory actions

AI does not calculate forecast truth.

---

## 1. V1 forecasting philosophy

V1 prioritizes:

- determinism
- explainability
- reproducibility
- low operational complexity
- measurable backtesting
- conservative handling of poor data

StoreAgent will not begin V1 with opaque custom machine-learning models.

The first forecasting system uses:

- weighted moving averages
- robust deterministic trend adjustment
- explicit history sufficiency rules
- stockout censoring
- promotion/event treatment
- confidence classification
- backtesting

More advanced models may be added only after measured evidence shows they materially improve accuracy.

---

## 2. Forecast unit

Forecasting operates at canonical SKU/variant level.

Forecast scope may optionally include location.

Conceptually:

organization
-> store
-> variant
-> optional location
-> daily demand series
-> forecast

---

## 3. Forecast input truth

Forecast input must come from canonical normalized commerce data.

Inputs may include:

- daily net units sold
- returns treatment
- stock availability
- inventory snapshots
- stockout periods
- promotion/event markers
- data-quality issues
- observation dates

Provider-specific payloads are normalized before forecasting.

Forecast logic must not depend directly on Shopify, CSV or any other provider SDK.

---

## 4. Daily demand series

The baseline forecast operates on daily demand observations.

Each day should eventually expose enough metadata to determine whether the observation is:

- usable
- stockout-censored
- promotion-affected
- incomplete
- missing

Zero sales do not automatically mean zero demand.

---

## 5. Supported history windows

Initial candidate lookback windows:

- 7 days
- 14 days
- 30 days
- 90 days

Short windows react quickly.

Long windows provide stability.

V1 combines multiple windows rather than trusting a single horizon.

---

## 6. Weighted moving-average baseline

V1 baseline demand forecast uses deterministic weighted moving averages.

Conceptually:

forecastDailyDemand =
sum(windowVelocity * windowWeight)
/
sum(activeWeights)

Only usable windows participate.

Weights are fixed by algorithm version.

Suggested initial emphasis:

- recent demand receives more weight
- longer history stabilizes noisy short-term movement

Exact weights will be frozen in M0.5.3.

---

## 7. History sufficiency

Forecasting must distinguish:

- sufficient
- limited
- insufficient

Insufficient history must not produce false confidence.

A forecast may still be produced from limited history when explicitly marked low-confidence.

Very short or unusable history may produce no forecast.

Exact thresholds are frozen separately.

---

## 8. Stockout censoring

A stockout period is not equivalent to zero demand.

If inventory availability indicates the SKU could not be purchased, observed zero sales may be censored.

V1 must avoid treating known stockout days as ordinary zero-demand days.

Possible treatment:

- exclude censored days from eligible demand-day denominator
- retain explicit censoring metadata
- reduce confidence when censoring is substantial

Forecasting must never silently infer true lost demand that is not supported by evidence.

---

## 9. Promotion treatment

Promotional demand may not represent normal baseline demand.

Promotion/event observations should be:

- marked explicitly when known
- excluded or downweighted according to versioned rules
- never silently treated as normal baseline demand

Unknown promotion history lowers confidence when material.

---

## 10. Trend adjustment

V1 may adjust the weighted baseline using deterministic recent-vs-prior trend.

Trend adjustment must be bounded.

The model must not allow short-term volatility to multiply forecast demand without limit.

Exact trend rules and maximum adjustment are versioned.

---

## 11. Cold start

Cold-start SKUs have insufficient own sales history.

V1 cold start must fail conservatively.

Possible outcomes:

- no forecast
- limited forecast using available own history
- configured merchant/default estimate in future
- category/peer fallback only in a later explicitly designed version

V1 must not fabricate demand from unrelated SKUs.

---

## 12. Forecast horizon

V1 forecast output should support demand estimates needed by inventory calculations.

Primary horizons include:

- daily demand baseline
- lead-time demand
- review-period demand
- combined replenishment horizon

Forecast horizon must be explicit in stored results.

---

## 13. Confidence

Forecast confidence is deterministic.

Initial confidence vocabulary:

- high
- medium
- low

Confidence is based on evidence such as:

- usable history length
- missing days
- stockout censoring
- promotion contamination
- demand stability
- data-quality state

Confidence does not come from AI opinion.

---

## 14. Forecast runs

Forecasts are versioned and historical.

A ForecastRun identifies:

- organization
- store
- algorithm name
- algorithm version
- run time
- input period
- status

Forecast results belong to a run.

Old forecast runs are preserved.

---

## 15. Reproducibility

Given the same:

- canonical input data
- algorithm version
- configuration
- time window

StoreAgent must produce the same forecast result.

No uncontrolled randomness is allowed in V1 forecasting.

---

## 16. Backtesting

Forecast models must be evaluated against historical known outcomes.

Backtesting should simulate:

train on historical period
-> predict future period
-> compare prediction with actual demand

Initial error metrics may include:

- MAE
- WAPE
- bias

Avoid relying solely on percentage metrics that behave badly around zero demand.

---

## 17. Forecast bias

StoreAgent must measure whether the forecast systematically:

- over-forecasts
- under-forecasts

Bias is commercially important because:

under-forecasting
-> stockout risk

over-forecasting
-> excess inventory risk

---

## 18. Missing data

Missing observations are not automatically zero demand.

The pipeline must distinguish:

- actual zero
- missing day
- censored stockout day
- unavailable provider data

Unknown data must not silently become zero.

---

## 19. Negative demand

Forecast demand may not be negative.

Returns/refunds may affect net demand preparation, but final forecast demand floor is zero.

---

## 20. Forecast provenance

Every stored forecast should eventually expose:

- algorithm name
- algorithm version
- forecast run ID
- input start/end date
- usable observation count
- censored observation count
- promotion-affected count
- forecast horizon
- predicted units
- confidence
- assumptions/defaults
- generated timestamp

---

## 21. Separation from inventory decisions

Forecasting answers:

How much demand is expected?

Inventory logic answers:

What should the merchant do about it?

Forecasting must not directly emit:

- REORDER
- REDUCE
- PROMOTE
- WATCH

Those belong to the decision engine.

---

## 22. Separation from AI

AI may later explain forecast results.

AI may not:

- change predicted demand
- invent confidence
- alter algorithm weights
- infer hidden sales data
- override deterministic backtesting

---

## Initial V1 algorithm vocabulary

Suggested initial versions:

- weighted-demand-v1
- trend-adjustment-v1
- stockout-censoring-v1
- promotion-treatment-v1
- forecast-confidence-v1
- forecast-backtest-v1

Any material rule change that can alter forecast output requires a new algorithm version.

---

## M0.5 gate

Before forecast architecture closes:

- V1 model is deterministic
- usable history rules are explicit
- stockout censoring is explicit
- promotion treatment is explicit
- cold-start behavior is explicit
- trend adjustment is bounded
- confidence is deterministic
- forecast horizon is explicit
- backtesting is defined
- bias is measured
- missing does not equal zero
- negative forecast demand is impossible
- forecast history is versioned
- AI does not own numeric forecast truth


## M0.5.2 frozen history sufficiency

`forecast-history-sufficiency-v1` uses total usable observations:

- 0-6 usable days -> insufficient
- 7-27 usable days -> limited
- 28+ usable days -> sufficient

Usable days exclude observations later classified as unusable because of missing or censored data.

These thresholds belong to the V1 algorithm and may change only through versioned revision.

## M0.5.3 frozen weighted-demand baseline

`weighted-demand-v1` uses deterministic window weights:

- 7-day demand -> 0.40
- 14-day demand -> 0.30
- 30-day demand -> 0.20
- 90-day demand -> 0.10

Minimum usable observations for each window:

- 7-day window -> 4
- 14-day window -> 7
- 30-day window -> 15
- 90-day window -> 45

A window with unknown demand or insufficient usable observations does not participate.

When one or more windows are unavailable, remaining configured weights are renormalized to sum to 1.

Known zero demand remains zero demand.

Negative demand is invalid.

If no window is usable, the baseline forecast is unavailable rather than fabricated.


## M0.5.4 frozen trend adjustment

`trend-adjustment-v1` applies deterministic bounded trend to the weighted-demand baseline.

Stable band:

-10% through +10%

Inside that range:

no adjustment

Outside the stable band:

the observed relative change may adjust the baseline.

Maximum adjustment:

- downward cap: -20%
- upward cap: +20%

Examples:

+5% recent trend -> 0% adjustment

+15% recent trend -> +15% adjustment

+80% recent trend -> +20% adjustment

-15% recent trend -> -15% adjustment

-60% recent trend -> -20% adjustment

If both recent and prior comparable demand are zero:

no adjustment

If prior demand is zero and recent demand is positive:

the upward adjustment is capped at +20% rather than treating growth as infinite.

Trend adjustment cannot produce negative forecast demand.

These thresholds belong to `trend-adjustment-v1` and may change only through an explicitly versioned revision supported by backtesting.


## M0.5.5 frozen stockout censoring

`stockout-censoring-v1` classifies daily demand observations before they enter forecast windows.

Rules:

- positive sales -> usable observation
- zero sales + inventory available -> usable zero-demand observation
- zero sales + inventory unavailable -> stockout-censored
- zero sales + availability unknown -> unusable
- incomplete source data -> unusable

Stockout-censored observations do not contribute to the usable-day denominator.

Censored observations remain visible in quality metadata.

V1 does not estimate lost sales for censored days.

Unknown availability must never silently become zero demand.

Positive sales remain usable even if inventory is later observed as unavailable, because the sale itself proves demand occurred during the observation period.

Forecast confidence may be reduced when censoring is substantial.


## M0.5.6 frozen promotion treatment

`promotion-treatment-v1` prevents known promotional periods from contaminating ordinary baseline demand.

Rules:

- normal day -> baseline usable
- known promotion day -> excluded from ordinary baseline
- unknown promotion state -> unusable
- incomplete promotion/source data -> unusable

Promotion observations are not deleted.

They remain available for:

- quality metadata
- later event analysis
- future promotion-aware forecasting

V1 does not attempt to estimate or remove promotional uplift mathematically.

Positive sales on a promotion day still do not enter the ordinary baseline.

Unknown promotion state must not silently be treated as normal demand.

Substantial excluded or unknown promotion history may reduce forecast confidence.


## M0.5.7 frozen cold-start behavior

`cold-start-v1` controls whether an own-SKU baseline may become a published forecast.

Rules:

- insufficient history -> no numeric forecast
- limited history + valid own-SKU baseline -> limited-history forecast
- sufficient history + valid own-SKU baseline -> standard forecast
- unavailable baseline -> no forecast

Known zero demand remains valid zero demand when the history gate allows forecasting.

V1 does not use:

- category-average demand
- peer-SKU demand
- provider-wide averages
- AI-estimated demand
- synthetic demand values

StoreAgent prefers an unavailable forecast over fabricated confidence.

Limited-history forecasts remain explicitly distinguishable from standard forecasts so downstream confidence logic can treat them conservatively.


## M0.5.8 frozen forecast confidence

`forecast-confidence-v1` produces only canonical confidence values:

- high
- medium
- low

Base confidence comes from history sufficiency:

- sufficient -> HIGH
- limited -> MEDIUM
- insufficient -> LOW

If the deterministic baseline is unavailable:

confidence -> LOW

Quality degradation thresholds:

Unusable observations:

- >= 10% -> degrade one level
- >= 25% -> LOW

Stockout-censored observations:

- >= 20% -> degrade one level
- >= 40% -> LOW

Promotion-excluded observations:

- >= 20% -> degrade one level
- >= 40% -> LOW

A moderate quality issue degrades confidence by one level only.

A severe quality issue forces LOW confidence.

Confidence is monotonic:

worse data may keep confidence unchanged or lower it.

Worse data must never increase confidence.

AI cannot assign, raise, or override forecast confidence.

These thresholds belong specifically to `forecast-confidence-v1` and may change only through an explicitly versioned revision supported by backtesting.


## M0.5.9 frozen forecast horizons

`forecast-horizon-v1` converts expected daily demand into explicit forecast horizons.

Outputs:

- daily demand
- lead-time demand
- review-period demand
- combined replenishment-horizon demand

Formulas:

leadTimeDemand =
dailyDemand * leadTimeDays

reviewPeriodDemand =
dailyDemand * reviewPeriodDays

replenishmentHorizonDays =
leadTimeDays + reviewPeriodDays

replenishmentDemand =
dailyDemand * replenishmentHorizonDays

Forecast horizon values may remain fractional.

Forecasting does not round expected demand upward merely because physical inventory uses whole units.

Inventory formulas decide later where conservative whole-unit rounding is necessary.

Known zero remains zero.

Unknown daily demand does not become zero.

If one horizon configuration is unavailable, independent horizons may still be calculated when their required inputs are known.

Forecast horizon logic does not calculate:

- safety stock
- reorder quantity
- MOQ
- pack-size rounding
- REORDER / REDUCE / PROMOTE / WATCH

Those belong to later inventory and decision layers.


## M0.5.10 frozen backtesting and error metrics

`forecast-backtest-v1` evaluates deterministic predictions against known historical demand.

Primary V1 metrics:

### MAE

Mean absolute error:

sum(abs(predicted - actual))
/
observation count

MAE remains valid when actual demand is zero.

### WAPE

Weighted absolute percentage error:

sum(abs(predicted - actual))
/
sum(actual)

If total actual demand is zero:

WAPE is unavailable.

StoreAgent does not persist Infinity or fabricate a zero percentage error.

### Forecast bias

Normalized bias:

sum(predicted - actual)
/
sum(actual)

Interpretation:

- positive -> systematic over-forecasting
- negative -> systematic under-forecasting
- zero -> signed errors balance

If total actual demand is zero:

normalized bias is unavailable.

### Backtesting principles

Backtesting must preserve:

- algorithm version
- observation count
- total actual demand
- total predicted demand
- total absolute error
- total signed error

Percentage metrics must never divide by zero.

Backtesting compares historical forecast outputs with subsequently known actual demand.

AI does not score or modify forecast accuracy.


## M0.5.11 frozen versioning and reproducibility

Forecast output must be reproducible.

Given identical:

- canonical normalized inputs
- algorithm versions
- forecast configuration version
- input start date
- input end date

StoreAgent must produce identical deterministic forecast behavior.

V1 forecast pipeline versions:

- weighted-demand-v1
- trend-adjustment-v1
- stockout-censoring-v1
- promotion-treatment-v1
- cold-start-v1
- forecast-confidence-v1
- forecast-horizon-v1
- forecast-backtest-v1

A reproducibility fingerprint may be stored with forecast provenance.

The fingerprint changes when material canonical inputs or configuration change.

No uncontrolled randomness is allowed in V1 forecasting.

A formula or policy change capable of altering commercial output requires a new explicit algorithm version.

Historical forecast runs retain their original algorithm versions and must not be silently rewritten when newer versions are introduced.
