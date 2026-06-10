package provider

import "time"

const (
	DeterministicBehaviorModel = "deterministic-behavior-v1"
	ToolTransferCall           = "transfer_call"
	ToolEndCall                = "end_call"
	ToolHTTPWebhook            = "http_webhook"
)

// ToolInvocation is a provider-emitted tool request in trusted session context.
type ToolInvocation struct {
	InvocationID   string         `json:"invocationId"`
	SessionID      string         `json:"sessionId"`
	TenantID       string         `json:"tenantId"`
	ToolName       string         `json:"toolName"`
	Arguments      map[string]any `json:"arguments"`
	IdempotencyKey string         `json:"idempotencyKey"`
	CreatedAt      time.Time      `json:"createdAt"`
}

// ToolResult records tool execution outcome.
type ToolResult struct {
	InvocationID string         `json:"invocationId"`
	Status       string         `json:"status"`
	Result       map[string]any `json:"result,omitempty"`
	Failure      string         `json:"failure,omitempty"`
	CompletedAt  time.Time      `json:"completedAt"`
}

const (
	SessionPhaseListening    = "LISTENING"
	SessionPhaseResponding   = "RESPONDING"
	SessionPhaseInterrupted  = "INTERRUPTED"
	SessionPhaseToolPending  = "TOOL_PENDING"
)

// BehaviorDiagnostics exposes barge-in and response lifecycle evidence.
type BehaviorDiagnostics struct {
	ResponseStartedAt        string `json:"responseStartedAt,omitempty"`
	InterruptionDetectedAt     string `json:"interruptionDetectedAt,omitempty"`
	CancelRequestedAt          string `json:"cancelRequestedAt,omitempty"`
	CancelAcknowledgedAt       string `json:"cancelAcknowledgedAt,omitempty"`
	QueuedFramesDiscarded      int    `json:"queuedFramesDiscarded,omitempty"`
	OldResponseFramesSent      int    `json:"oldResponseFramesSent,omitempty"`
	SecondTurnStartedAt        string `json:"secondTurnStartedAt,omitempty"`
	ActiveResponseID           string `json:"activeResponseId,omitempty"`
	Turn                       int    `json:"turn,omitempty"`
	Phase                      string `json:"phase,omitempty"`
	PendingToolName            string `json:"pendingToolName,omitempty"`
}
