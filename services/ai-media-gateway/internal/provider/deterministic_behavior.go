package provider

import (
	"fmt"
	"time"
)

const (
	behaviorLongResponseFrames = 120
	behaviorMinFramesBeforeBargeIn = 8
	behaviorSecondTurnInputFrames = 3
)

type behaviorState struct {
	phase                 string
	turn                  int
	responseID            string
	responseStartedAt     time.Time
	responseTotalFrames   int
	responseSentFrames    int
	inboundDuringResponse int
	interruptionAt        time.Time
	cancelRequestedAt     time.Time
	cancelAckAt           time.Time
	queuedDiscarded       int
	secondTurnStartedAt   time.Time
	inputAfterInterrupt   int
	pendingTool           *ToolInvocation
	toolEmitted           bool
	tenantID              string
	platformSessionID     string
}

func (p *DeterministicProvider) initBehavior(sessionID, tenantID, platformSessionID string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.behavior == nil {
		p.behavior = make(map[string]*behaviorState)
	}
	p.behavior[sessionID] = &behaviorState{
		phase:             SessionPhaseListening,
		tenantID:          tenantID,
		platformSessionID: platformSessionID,
	}
}

func (p *DeterministicProvider) IsBehaviorModel(model string) bool {
	return model == DeterministicBehaviorModel
}

func (p *DeterministicProvider) BeginLongResponse(sessionID string) (responseID string, frames [][]byte) {
	p.mu.Lock()
	defer p.mu.Unlock()
	st, ok := p.behavior[sessionID]
	if !ok {
		return "", nil
	}
	st.phase = SessionPhaseResponding
	st.responseID = fmt.Sprintf("resp-%d", time.Now().UnixNano())
	st.responseStartedAt = time.Now().UTC()
	st.responseTotalFrames = behaviorLongResponseFrames
	st.responseSentFrames = 0
	st.inboundDuringResponse = 0
	frames = make([][]byte, 0, behaviorLongResponseFrames)
	for i := 0; i < behaviorLongResponseFrames; i++ {
		frames = append(frames, p.ulawToneFrame(i))
	}
	return st.responseID, frames
}

func (p *DeterministicProvider) ulawToneFrame(seed int) []byte {
	out := make([]byte, UlawFrameBytes)
	for i := range out {
		out[i] = byte((i + seed) % 256)
	}
	return out
}

func (p *DeterministicProvider) NoteResponseFrameSent(sessionID string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if st, ok := p.behavior[sessionID]; ok && st.phase == SessionPhaseResponding {
		st.responseSentFrames++
	}
}

func (p *DeterministicProvider) NoteInboundDuringResponse(sessionID string) (shouldInterrupt bool) {
	p.mu.Lock()
	defer p.mu.Unlock()
	st, ok := p.behavior[sessionID]
	if !ok || st.phase != SessionPhaseResponding {
		return false
	}
	st.inboundDuringResponse++
	return st.responseSentFrames >= behaviorMinFramesBeforeBargeIn && st.inboundDuringResponse > 0
}

func (p *DeterministicProvider) InterruptResponse(sessionID string, queuedDiscarded int) BehaviorDiagnostics {
	p.mu.Lock()
	defer p.mu.Unlock()
	st, ok := p.behavior[sessionID]
	if !ok {
		return BehaviorDiagnostics{}
	}
	now := time.Now().UTC()
	st.interruptionAt = now
	st.cancelRequestedAt = now
	st.cancelAckAt = now
	st.queuedDiscarded = queuedDiscarded
	st.phase = SessionPhaseInterrupted
	oldSent := st.responseSentFrames
	st.turn = 2
	st.secondTurnStartedAt = now
	st.phase = SessionPhaseResponding
	st.responseID = fmt.Sprintf("resp-second-%d", time.Now().UnixNano())
	st.responseStartedAt = now
	st.responseTotalFrames = 40
	st.responseSentFrames = 0
	st.inboundDuringResponse = 0
	st.inputAfterInterrupt = 0
	if s, ok := p.sessions[sessionID]; ok {
		s.Cancelled = false
	}
	return p.snapshotLocked(st, oldSent)
}

func (p *DeterministicProvider) BeginSecondResponse(sessionID string) [][]byte {
	p.mu.Lock()
	defer p.mu.Unlock()
	st, ok := p.behavior[sessionID]
	if !ok {
		return nil
	}
	frames := make([][]byte, 0, st.responseTotalFrames)
	for i := 0; i < st.responseTotalFrames; i++ {
		frames = append(frames, p.ulawToneFrame(i+100))
	}
	return frames
}

func (p *DeterministicProvider) NoteSecondTurnInput(sessionID string) *ToolInvocation {
	p.mu.Lock()
	defer p.mu.Unlock()
	st, ok := p.behavior[sessionID]
	if !ok || st.toolEmitted {
		return nil
	}
	if st.turn < 1 {
		return nil
	}
	st.inputAfterInterrupt++
	if st.inputAfterInterrupt < behaviorSecondTurnInputFrames {
		return nil
	}
	st.toolEmitted = true
	st.phase = SessionPhaseToolPending
	inv := &ToolInvocation{
		InvocationID:   fmt.Sprintf("tool-%d", time.Now().UnixNano()),
		SessionID:      st.platformSessionID,
		TenantID:       st.tenantID,
		ToolName:       ToolTransferCall,
		Arguments:      map[string]any{"destination": "human_support"},
		IdempotencyKey: fmt.Sprintf("%s:transfer_call:1", st.platformSessionID),
		CreatedAt:      time.Now().UTC(),
	}
	st.pendingTool = inv
	return inv
}

func (p *DeterministicProvider) BehaviorDiagnostics(sessionID string) BehaviorDiagnostics {
	p.mu.Lock()
	defer p.mu.Unlock()
	st, ok := p.behavior[sessionID]
	if !ok {
		return BehaviorDiagnostics{}
	}
	return p.snapshotLocked(st, st.responseSentFrames)
}

func (p *DeterministicProvider) snapshotLocked(st *behaviorState, oldSent int) BehaviorDiagnostics {
	d := BehaviorDiagnostics{
		QueuedFramesDiscarded: st.queuedDiscarded,
		OldResponseFramesSent: oldSent,
		ActiveResponseID:      st.responseID,
		Turn:                  st.turn,
		Phase:                 st.phase,
	}
	if st.pendingTool != nil {
		d.PendingToolName = st.pendingTool.ToolName
	}
	if !st.responseStartedAt.IsZero() {
		d.ResponseStartedAt = st.responseStartedAt.Format(time.RFC3339Nano)
	}
	if !st.interruptionAt.IsZero() {
		d.InterruptionDetectedAt = st.interruptionAt.Format(time.RFC3339Nano)
	}
	if !st.cancelRequestedAt.IsZero() {
		d.CancelRequestedAt = st.cancelRequestedAt.Format(time.RFC3339Nano)
	}
	if !st.cancelAckAt.IsZero() {
		d.CancelAcknowledgedAt = st.cancelAckAt.Format(time.RFC3339Nano)
	}
	if !st.secondTurnStartedAt.IsZero() {
		d.SecondTurnStartedAt = st.secondTurnStartedAt.Format(time.RFC3339Nano)
	}
	return d
}

func (p *DeterministicProvider) TakePendingTool(sessionID string) *ToolInvocation {
	p.mu.Lock()
	defer p.mu.Unlock()
	st, ok := p.behavior[sessionID]
	if !ok || st.pendingTool == nil {
		return nil
	}
	inv := st.pendingTool
	st.pendingTool = nil
	return inv
}

const UlawFrameBytes = 160
