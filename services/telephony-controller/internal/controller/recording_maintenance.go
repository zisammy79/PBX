package controller

import (
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
)

func (c *Controller) RegisterRecordingMaintenanceRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/internal/v1/recordings/reconcile", c.handleRecordingReconcile)
	mux.HandleFunc("/internal/v1/recordings/reconcile/", c.handleRecordingReconcileOne)
}

func (c *Controller) handleRecordingReconcile(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	if !c.authorizeInternal(r) {
		writeJSON(w, http.StatusUnauthorized, map[string]any{"error": "unauthorized"})
		return
	}
	count, err := c.ReconcileStaleRecordings(r.Context(), 2*time.Minute)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "reconcile_failed"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"reconciled": count})
}

func (c *Controller) handleRecordingReconcileOne(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	if !c.authorizeInternal(r) {
		writeJSON(w, http.StatusUnauthorized, map[string]any{"error": "unauthorized"})
		return
	}
	idStr := strings.TrimPrefix(r.URL.Path, "/internal/v1/recordings/reconcile/")
	recordingID, err := uuid.Parse(idStr)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid_recording_id"})
		return
	}
	if err := c.ReconcileRecordingByID(r.Context(), recordingID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "reconcile_failed"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"recordingId": recordingID.String(), "reconciled": true})
}

func (c *Controller) authorizeInternal(r *http.Request) bool {
	if c.cfg.InternalServiceToken == "" {
		return true
	}
	auth := r.Header.Get("Authorization")
	return strings.HasPrefix(auth, "Bearer ") && strings.TrimPrefix(auth, "Bearer ") == c.cfg.InternalServiceToken
}
