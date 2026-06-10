/** Provider adapter interfaces — Stage 8 realtime voice vertical slice. */

export interface ProviderCapabilityManifest {
  providerId: string;
  displayName: string;
  models: string[];
  supportedAudioFormats: string[];
  audioInputFormats: string[];
  audioOutputFormats: string[];
  sampleRates: number[];
  nativeVoiceActivitySupport: boolean;
  interruptionSupport: boolean;
  toolCallingSupport: boolean;
  sessionDurationLimitSeconds?: number;
  usageFields: string[];
  regionRestrictions: string[];
  healthStatus: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  fallbackCapabilities: string[];
}

export interface RealtimeVoiceSessionConfig {
  model: string;
  voice?: string;
  instructions?: string;
  tools?: unknown[];
  sampleRateHz?: number;
}

export interface RealtimeAudioFrame {
  pcm16: Buffer;
  sampleRateHz: number;
  timestampMs: number;
}

export interface RealtimeVoiceEvent {
  type:
    | 'session.created'
    | 'input_audio_buffer.speech_started'
    | 'input_audio_buffer.speech_stopped'
    | 'response.created'
    | 'response.audio.delta'
    | 'response.audio.done'
    | 'response.cancelled'
    | 'transcript.partial'
    | 'transcript.final'
    | 'tool.call'
    | 'error'
    | 'session.closed';
  sessionId: string;
  payload: Record<string, unknown>;
}

export interface RealtimeVoiceProvider {
  readonly manifest: ProviderCapabilityManifest;
  connect(config: RealtimeVoiceSessionConfig): Promise<{ sessionId: string }>;
  disconnect(sessionId: string): Promise<void>;
  sendAudio(sessionId: string, frame: RealtimeAudioFrame): Promise<void>;
  cancelResponse(sessionId: string): Promise<void>;
  events(sessionId: string): AsyncIterable<RealtimeVoiceEvent>;
}

export interface SpeechToTextProvider {
  readonly manifest: ProviderCapabilityManifest;
  transcribe(audio: RealtimeAudioFrame): Promise<{ text: string; language?: string }>;
}

export interface LanguageModelProvider {
  readonly manifest: ProviderCapabilityManifest;
  complete(prompt: string, options?: Record<string, unknown>): Promise<{ text: string }>;
}

export interface TextToSpeechProvider {
  readonly manifest: ProviderCapabilityManifest;
  synthesize(text: string, options?: Record<string, unknown>): Promise<RealtimeAudioFrame>;
}

export interface SipProviderAdapter {
  readonly providerId: string;
  healthCheck(): Promise<{ healthy: boolean; latencyMs?: number }>;
}

export interface BillingProviderAdapter {
  readonly providerId: string;
  reportUsage(event: Record<string, unknown>): Promise<void>;
}

/** Local test-only provider identifier — not a production integration. */
export const DETERMINISTIC_PROVIDER_ID = 'deterministic-test';
