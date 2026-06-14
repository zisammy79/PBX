package controller

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/pbx-platform/telephony-controller/internal/aitools"
	"github.com/pbx-platform/telephony-controller/internal/calls"
)

type toolInvocationRequest struct {
	InvocationID   string         `json:"invocationId"`
	SessionID      string         `json:"sessionId"`
	TenantID       string         `json:"tenantId"`
	CallID         string         `json:"callId"`
	ToolName       string         `json:"toolName"`
	Arguments      map[string]any `json:"arguments"`
	IdempotencyKey string         `json:"idempotencyKey"`
	CreatedAt      string         `json:"createdAt"`
}

func (c *Controller) RegisterInternalRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/internal/v1/ai/tools", c.handleAiToolHTTP)
	c.RegisterRecordingMaintenanceRoutes(mux)
}

func (c *Controller) handleAiToolHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	if c.cfg.InternalServiceToken != "" {
		auth := r.Header.Get("Authorization")
		if !strings.HasPrefix(auth, "Bearer ") || strings.TrimPrefix(auth, "Bearer ") != c.cfg.InternalServiceToken {
			writeJSON(w, http.StatusUnauthorized, map[string]any{"error": "unauthorized"})
			return
		}
	}
	raw, err := io.ReadAll(r.Body)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid_body"})
		return
	}
	var req toolInvocationRequest
	if err := json.Unmarshal(raw, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid_json"})
		return
	}
	result, status, handleErr := c.handleAiTool(r.Context(), req)
	if handleErr != nil {
		writeJSON(w, status, map[string]any{"error": handleErr.Error(), "invocationId": req.InvocationID})
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func (c *Controller) handleAiTool(ctx context.Context, req toolInvocationRequest) (map[string]any, int, error) {
	sessionID, err := uuid.Parse(req.SessionID)
	if err != nil {
		return nil, http.StatusBadRequest, fmt.Errorf("invalid sessionId")
	}
	tenantID, err := uuid.Parse(req.TenantID)
	if err != nil {
		return nil, http.StatusBadRequest, fmt.Errorf("invalid tenantId")
	}
	callID, err := uuid.Parse(req.CallID)
	if err != nil {
		return nil, http.StatusBadRequest, fmt.Errorf("invalid callId")
	}
	active, ok := c.registry.Get(callID)
	if !ok || active == nil || !active.IsAiCall || active.AiSessionID != sessionID {
		return nil, http.StatusNotFound, errors.New("active ai call not found")
	}
	if active.TenantID != tenantID {
		return nil, http.StatusForbidden, errors.New("tenant mismatch")
	}
	dupKey := "tool-invoke:" + req.IdempotencyKey
	if req.IdempotencyKey != "" && !active.MarkEvent(dupKey) {
		return map[string]any{
			"invocationId": req.InvocationID,
			"status":       "duplicate",
		}, http.StatusOK, nil
	}
	_ = c.repo.UpdateAiSessionState(ctx, sessionID, "TOOL_PENDING", "tool_pending", map[string]any{
		"diagnostics": map[string]any{
			"tool": map[string]any{
				"invocationId":   req.InvocationID,
				"toolName":       req.ToolName,
				"idempotencyKey": req.IdempotencyKey,
			},
		},
	})
	switch req.ToolName {
	case aitools.ToolTransferCallName():
		dest, _ := req.Arguments["destination"].(string)
		return c.executeTransferCall(ctx, active, req, dest)
	case "end_call":
		return c.executeEndCall(ctx, active, req)
	default:
		return nil, http.StatusBadRequest, fmt.Errorf("unsupported tool")
	}
}

func (c *Controller) executeEndCall(ctx context.Context, active *calls.ActiveCall, req toolInvocationRequest) (map[string]any, int, error) {
	now := time.Now().UTC()
	_ = c.repo.UpdateAiSessionState(ctx, active.AiSessionID, "COMPLETED", "completed", map[string]any{
		"timing": map[string]any{"completedAt": now.Format(time.RFC3339Nano)},
		"diagnostics": map[string]any{
			"toolResult": map[string]any{"invocationId": req.InvocationID, "status": "completed", "toolName": "end_call"},
		},
	})
	c.finalizeAiCall(ctx, active, calls.StateComplete, "end_call_tool", nil)
	return map[string]any{"invocationId": req.InvocationID, "status": "completed", "completedAt": now.Format(time.RFC3339Nano)}, http.StatusOK, nil
}
