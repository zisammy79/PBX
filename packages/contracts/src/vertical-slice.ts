/**
 * Acceptance criteria for the first end-to-end vertical slice.
 * Each step maps to integration/e2e tests in apps/api and services.
 */
export const VERTICAL_SLICE_STEPS = [
  'platform_admin_sign_in',
  'admin_creates_tenant',
  'tenant_owner_created',
  'tenant_owner_creates_two_extensions',
  'system_generates_sip_credentials',
  'extensions_register_with_asterisk',
  'extension_calls_extension',
  'call_appears_in_active_call_ui',
  'call_completion_produces_cdr_and_usage',
  'tenant_configures_generic_sip_trunk',
  'trunk_connection_test',
  'tenant_creates_ai_voice_agent',
  'tenant_selects_realtime_ai_provider',
  'call_routes_to_ai_agent',
  'bidirectional_audio_exchange',
  'caller_can_interrupt_agent',
  'agent_transfers_to_extension',
  'call_timing_and_provider_usage_recorded',
  'usage_in_tenant_dashboard',
  'rating_engine_estimated_charge',
  'platform_admin_cost_revenue_margin',
  'tenant_api_retrieves_call_and_usage',
  'signed_call_completed_webhook_delivered',
] as const;

export type VerticalSliceStep = (typeof VERTICAL_SLICE_STEPS)[number];

export type VerticalSliceStepStatus = 'pending' | 'blocked_credentials' | 'passed' | 'failed';

export interface VerticalSliceProgress {
  step: VerticalSliceStep;
  status: VerticalSliceStepStatus;
  notes?: string;
}

/** Foundation stage completes steps 1-5 without live telephony. */
export const FOUNDATION_SLICE_STEPS: VerticalSliceStep[] = [
  'platform_admin_sign_in',
  'admin_creates_tenant',
  'tenant_owner_created',
  'tenant_owner_creates_two_extensions',
  'system_generates_sip_credentials',
];

export const TELEPHONY_SLICE_STEPS: VerticalSliceStep[] = [
  'extensions_register_with_asterisk',
  'extension_calls_extension',
  'call_appears_in_active_call_ui',
  'call_completion_produces_cdr_and_usage',
];

export const AI_SLICE_STEPS: VerticalSliceStep[] = [
  'tenant_creates_ai_voice_agent',
  'tenant_selects_realtime_ai_provider',
  'call_routes_to_ai_agent',
  'bidirectional_audio_exchange',
  'caller_can_interrupt_agent',
  'agent_transfers_to_extension',
];

export const BILLING_SLICE_STEPS: VerticalSliceStep[] = [
  'call_timing_and_provider_usage_recorded',
  'usage_in_tenant_dashboard',
  'rating_engine_estimated_charge',
  'platform_admin_cost_revenue_margin',
  'tenant_api_retrieves_call_and_usage',
  'signed_call_completed_webhook_delivered',
];
