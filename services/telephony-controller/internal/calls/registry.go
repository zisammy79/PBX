package calls

import (
	"sync"
	"time"

	"github.com/google/uuid"
)

const (
	StateCreated  = "CREATED"
	StateRinging  = "RINGING"
	StateAnswered = "ANSWERED"
	StateBridged  = "BRIDGED"
	StateComplete = "COMPLETED"
	StateFailed   = "FAILED"
)

var validTransitions = map[string][]string{
	StateCreated:  {StateRinging, StateFailed},
	StateRinging:  {StateAnswered, StateFailed, StateComplete},
	StateAnswered: {StateBridged, StateComplete, StateFailed},
	StateBridged:  {StateComplete, StateFailed},
}

type ActiveCall struct {
	CallID           uuid.UUID
	TenantID         uuid.UUID
	CorrelationID    uuid.UUID
	TenantSlug       string
	CallerNumber     string
	CalleeNumber     string
	State            string
	CallerChannelID         string
	CalleeChannelID         string
	CalleeEndpointID        string
	PendingCalleeChannelIDs []string
	AnsweredCalleeChannelID string
	BridgeID                  string
	HadCalleeLeg              bool
	IsAiCall                  bool
	AiSessionID               uuid.UUID
	AiMediaChannelID          string
	TransferExtensionNumber   string
	TransferInProgress        bool
	TransferInvocationID      string
	TransferIdempotencyKey    string
	FromExtensionID  uuid.UUID
	ToExtensionID    uuid.UUID
	CreatedAt        time.Time
	RingingAt        *time.Time
	AnsweredAt       *time.Time
	BridgedAt        *time.Time
	EndedAt          *time.Time
	HangupCause      string
	ProcessedEvents  map[string]bool
	RecordingID           uuid.UUID
	RecordingStorageKey   string
	LiveRecordingName     string
	RecordingStarted      bool
	RecordingStartedAt    time.Time
}

type Registry struct {
	mu     sync.RWMutex
	active map[uuid.UUID]*ActiveCall
	byChan map[string]uuid.UUID
}

func NewRegistry() *Registry {
	return &Registry{
		active: make(map[uuid.UUID]*ActiveCall),
		byChan: make(map[string]uuid.UUID),
	}
}

func (r *Registry) Put(call *ActiveCall) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.active[call.CallID] = call
	if call.CallerChannelID != "" {
		r.byChan[call.CallerChannelID] = call.CallID
	}
	if call.CalleeChannelID != "" {
		r.byChan[call.CalleeChannelID] = call.CallID
	}
	for _, ch := range call.PendingCalleeChannelIDs {
		if ch != "" {
			r.byChan[ch] = call.CallID
		}
	}
}

func (r *Registry) Get(id uuid.UUID) (*ActiveCall, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	c, ok := r.active[id]
	return c, ok
}

func (r *Registry) ByChannel(channelID string) (*ActiveCall, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	id, ok := r.byChan[channelID]
	if !ok {
		return nil, false
	}
	return r.active[id], true
}

func (r *Registry) Remove(id uuid.UUID) {
	r.mu.Lock()
	defer r.mu.Unlock()
	call, ok := r.active[id]
	if !ok {
		return
	}
	delete(r.active, id)
	if call.CallerChannelID != "" {
		delete(r.byChan, call.CallerChannelID)
	}
	if call.CalleeChannelID != "" {
		delete(r.byChan, call.CalleeChannelID)
	}
	for _, ch := range call.PendingCalleeChannelIDs {
		delete(r.byChan, ch)
	}
}

func (r *Registry) ByBridge(bridgeID string) (*ActiveCall, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	for _, call := range r.active {
		if call.BridgeID == bridgeID {
			return call, true
		}
	}
	return nil, false
}

func (r *Registry) ListActive() []*ActiveCall {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]*ActiveCall, 0, len(r.active))
	for _, c := range r.active {
		if c.State != StateComplete && c.State != StateFailed {
			out = append(out, c)
		}
	}
	return out
}

func (c *ActiveCall) Transition(next string) bool {
	for _, allowed := range validTransitions[c.State] {
		if allowed == next {
			c.State = next
			now := time.Now().UTC()
			switch next {
			case StateRinging:
				c.RingingAt = &now
			case StateAnswered:
				c.AnsweredAt = &now
			case StateBridged:
				c.BridgedAt = &now
			case StateComplete, StateFailed:
				c.EndedAt = &now
			}
			return true
		}
	}
	return false
}

func (c *ActiveCall) MarkEvent(id string) bool {
	if c.ProcessedEvents == nil {
		c.ProcessedEvents = make(map[string]bool)
	}
	if c.ProcessedEvents[id] {
		return false
	}
	c.ProcessedEvents[id] = true
	return true
}
