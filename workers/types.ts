export type StoreAgentJobType =
  | "provider_sync"
  | "provider_reconciliation"
  | "metrics_aggregation"
  | "forecast_generation"
  | "action_generation"
  | "explanation_generation"
  | "notification_delivery";

export type WorkerJobEnvelopeVersion = 1;

/**
 * Stable canonical identifier reference carried by a job.
 *
 * This identifies work to resolve after tenant validation.
 * It is not proof of ownership or authorization.
 */
export interface WorkerJobSubject {
  resourceType: string;
  resourceId: string;
}

/**
 * Infrastructure execution envelope.
 *
 * This is not a replacement for SyncRun, ForecastRun,
 * InventoryAction, or any other canonical domain record.
 */
export interface WorkerJobEnvelopeV1 {
  version: WorkerJobEnvelopeVersion;

  jobType: StoreAgentJobType;

  organizationId: string;
  storeId: string | null;

  /**
   * Retry/deduplication identity for this logical execution request.
   * Exact construction is frozen separately in M0.8.3.
   */
  idempotencyKey: string;

  /**
   * Canonical identifiers the worker may need to resolve.
   *
   * These references are untrusted until canonical ownership
   * is revalidated by worker execution code.
   */
  subjects: readonly WorkerJobSubject[];

  /**
   * UTC ISO timestamp describing when the job intent was created.
   *
   * This is execution provenance, not a business-event timestamp.
   */
  requestedAt: string;
}

export type WorkerJobEnvelope =
  WorkerJobEnvelopeV1;

export type WorkerJobStatus =
  | "queued"
  | "claimed"
  | "running"
  | "retry_wait"
  | "succeeded"
  | "failed"
  | "cancelled";

export type WorkerJobTerminalStatus =
  | "succeeded"
  | "failed"
  | "cancelled";

export interface WorkerJobLifecycleSnapshot {
  status: WorkerJobStatus;

  /**
   * Number of execution attempts that have actually started.
   *
   * Queue delivery alone does not increment this value.
   * Exact attempt semantics are frozen in M0.8.6.
   */
  attemptCount: number;

  /**
   * Infrastructure execution timestamps.
   *
   * They do not replace canonical SyncRun / ForecastRun timestamps.
   */
  queuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface WorkerJobLease {
  /**
   * Infrastructure worker/runtime identity.
   *
   * This is not tenant identity and not job idempotency identity.
   */
  ownerId: string;

  /**
   * Opaque ownership token for this specific claim.
   *
   * A stale worker must not mutate a job after ownership changes.
   */
  claimToken: string;

  claimedAt: string;
  expiresAt: string;
}

export type WorkerLeaseRecoveryDisposition =
  | "none"
  | "requeue"
  | "retry_wait";

export type WorkerFailureClass =
  | "transient_dependency"
  | "rate_limited"
  | "timeout"
  | "lease_expired"
  | "validation"
  | "authorization"
  | "invariant_violation"
  | "unsupported"
  | "unknown";

export interface WorkerRetryPolicy {
  maxAttempts: number;
  baseDelaySeconds: number;
  maxDelaySeconds: number;
}

export type WorkerRetryDisposition =
  | "retry"
  | "fail";

export interface WorkerRetryDecision {
  disposition: WorkerRetryDisposition;

  /**
   * Present only when another execution attempt is permitted.
   */
  delaySeconds: number | null;
}

export type WorkerTerminalFailureReason =
  | "retry_exhausted"
  | "validation_failed"
  | "authorization_failed"
  | "invariant_violation"
  | "unsupported"
  | "unknown_failure";

export interface WorkerTerminalFailureRecord {
  /**
   * Logical job identity.
   */
  idempotencyKey: string;

  jobType: StoreAgentJobType;

  organizationId: string;
  storeId: string | null;

  /**
   * Execution attempts that actually started.
   */
  attemptCount: number;

  reason: WorkerTerminalFailureReason;

  /**
   * Stable technical code suitable for diagnostics.
   *
   * This must not contain secrets or arbitrary raw provider payloads.
   */
  errorCode: string;

  /**
   * Sanitized technical summary.
   */
  errorMessage: string;

  failedAt: string;
}

export type WorkerEnqueueDisposition =
  | "create"
  | "duplicate_active"
  | "duplicate_terminal";

export interface ExistingWorkerJobIdentity {
  idempotencyKey: string;
  status: WorkerJobStatus;
}

export interface WorkerEnqueueAssessment {
  disposition: WorkerEnqueueDisposition;
  idempotencyKey: string;
}

export type InventoryIntelligencePipelineStage =
  | "metrics"
  | "forecast"
  | "decision"
  | "ai_explanation";

export interface InventoryIntelligencePipelineState {
  /**
   * Canonical provider-independent commerce data has been persisted
   * and is safe for deterministic processing.
   */
  canonicalDataReady: boolean;

  /**
   * The deterministic metrics stage completed.
   *
   * Individual metric values may still be null with explicit reason
   * codes. Completion does not mean every metric is known.
   */
  metricsReady: boolean;

  /**
   * The deterministic forecasting stage completed.
   *
   * Forecast values may legitimately remain unavailable/null.
   */
  forecastReady: boolean;

  /**
   * The deterministic decision engine completed.
   *
   * The result may legitimately be WATCH or HEALTHY.
   */
  decisionReady: boolean;
}

export type PipelineStageBlockReason =
  | "CANONICAL_DATA_NOT_READY"
  | "METRICS_NOT_READY"
  | "FORECAST_NOT_READY"
  | "DECISION_NOT_READY";

export interface PipelineStageReadiness {
  ready: boolean;
  reason: PipelineStageBlockReason | null;
}

export type WorkerTriggerKind =
  | "scheduled"
  | "event";

export type WorkerEventSourceType =
  | "integration"
  | "canonical_entity";

export interface ScheduledWorkerTrigger {
  kind: "scheduled";

  /**
   * Stable scheduler/orchestration identity.
   *
   * This is not tenant authorization.
   */
  triggerKey: string;
}

export interface EventWorkerTrigger {
  kind: "event";

  /**
   * Stable event identity used as part of deterministic logical work.
   */
  triggerKey: string;

  /**
   * The trusted source relationship that must be resolved before
   * worker tenant scope is accepted.
   */
  sourceType: WorkerEventSourceType;
  sourceId: string;
}

export type WorkerTrigger =
  | ScheduledWorkerTrigger
  | EventWorkerTrigger;

export interface WorkerTriggerRequest {
  jobType: StoreAgentJobType;

  trigger: WorkerTrigger;

  /**
   * Stable logical operation identity.
   *
   * Trigger delivery timestamps and queue message IDs are not valid
   * substitutes.
   */
  operationKey: string;

  subjects: readonly WorkerJobSubject[];
}

export interface ResolvedWorkerTriggerScope {
  organizationId: string;
  storeId: string | null;
}

export type WorkerTelemetryLevel =
  | "info"
  | "warn"
  | "error";

export type WorkerTelemetryEventType =
  | "job_enqueued"
  | "job_duplicate"
  | "job_claimed"
  | "job_started"
  | "job_retry_scheduled"
  | "job_succeeded"
  | "job_failed"
  | "job_cancelled"
  | "lease_expired"
  | "scope_denied"
  | "pipeline_blocked";

export interface WorkerTelemetryContext {
  /**
   * Logical job identity.
   */
  idempotencyKey: string;

  jobType: StoreAgentJobType;

  organizationId: string;
  storeId: string | null;

  /**
   * Runtime execution correlation identity.
   *
   * This is infrastructure provenance only.
   */
  executionId: string | null;

  /**
   * Canonical business-run/resource correlation.
   *
   * Examples:
   * - SyncRun ID
   * - ForecastRun ID
   *
   * This remains an identifier only.
   */
  canonicalRunId: string | null;

  attemptCount: number | null;
}

export interface WorkerTelemetryEvent {
  level: WorkerTelemetryLevel;
  eventType: WorkerTelemetryEventType;

  context: WorkerTelemetryContext;

  /**
   * Stable technical reason/error code when relevant.
   */
  code: string | null;

  /**
   * Sanitized diagnostic summary only.
   */
  message: string | null;

  /**
   * Explicit UTC execution timestamp.
   */
  occurredAt: string;
}
