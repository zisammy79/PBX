// AI Media Gateway — bidirectional realtime audio bridge (Stage 8).
package main

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/pbx-platform/ai-media-gateway/internal/provider"
	"github.com/pbx-platform/ai-media-gateway/internal/session"
)

func main() {
	port := os.Getenv("AI_MEDIA_GATEWAY_PORT")
	if port == "" {
		port = "8091"
	}
	token := os.Getenv("INTERNAL_SERVICE_TOKEN")
	mgr := session.NewManager(token)
	mux := http.NewServeMux()

	mux.HandleFunc("/health/live", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"status": "healthy"})
	})
	mux.HandleFunc("/health/ready", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"ready": true, "transport": "ari_external_media_rtp"})
	})

	mux.HandleFunc("/internal/v1/sessions", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		if !mgr.Authorize(r.Header.Get("Authorization")) {
			writeJSON(w, http.StatusUnauthorized, map[string]any{"error": "unauthorized"})
			return
		}
		req, err := session.DecodeCreateRequest(r.Body)
		if err != nil {
			var verr *session.ValidationError
			if errors.As(err, &verr) {
				writeJSON(w, http.StatusBadRequest, map[string]any{
					"error":  "validation_failed",
					"fields": verr.Fields,
				})
				return
			}
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid_json"})
			return
		}
		resp, err := mgr.Create(r.Context(), req)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, resp)
	})

	mux.HandleFunc("/internal/v1/sessions/", func(w http.ResponseWriter, r *http.Request) {
		if !mgr.Authorize(r.Header.Get("Authorization")) {
			writeJSON(w, http.StatusUnauthorized, map[string]any{"error": "unauthorized"})
			return
		}
		path := strings.TrimPrefix(r.URL.Path, "/internal/v1/sessions/")
		parts := strings.Split(strings.Trim(path, "/"), "/")
		if len(parts) == 0 || parts[0] == "" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		sessionID := parts[0]
		switch {
		case len(parts) == 2 && parts[1] == "peer" && r.Method == http.MethodPost:
			var req struct {
				AsteriskMediaAddress string `json:"asteriskMediaAddress"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.AsteriskMediaAddress == "" {
				writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid_peer"})
				return
			}
			if err := mgr.SetPeer(sessionID, req.AsteriskMediaAddress); err != nil {
				writeJSON(w, http.StatusNotFound, map[string]any{"error": err.Error()})
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{"sessionId": sessionID, "peer": req.AsteriskMediaAddress})
		case len(parts) == 2 && parts[1] == "stats" && r.Method == http.MethodGet:
			stats, ok := mgr.Stats(sessionID)
			if !ok {
				writeJSON(w, http.StatusNotFound, map[string]any{"error": "session_not_found"})
				return
			}
			writeJSON(w, http.StatusOK, stats)
		case r.Method == http.MethodDelete:
			mgr.Close(sessionID)
			writeJSON(w, http.StatusOK, map[string]any{"closed": true, "sessionId": sessionID})
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	})

	mux.HandleFunc("/internal/v1/test/conversation", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		var req struct {
			Provider             string `json:"provider"`
			Turns                int    `json:"turns"`
			SimulateInterruption bool   `json:"simulateInterruption"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"pass": false})
			return
		}
		det := provider.NewDeterministicProvider()
		s, err := det.Connect(r.Context(), "deterministic-v1")
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"pass": false})
			return
		}
		defer det.Disconnect(s.ID)
		interrupted := false
		for i := 0; i < max(req.Turns, 1); i++ {
			frame := provider.AudioFrame{PCM16: make([]byte, 160), SampleRateHz: 8000}
			_, _, err := det.SendAudio(s.ID, frame)
			if err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]any{"pass": false, "error": err.Error()})
				return
			}
			if req.SimulateInterruption && i == 0 {
				interrupted = det.CancelResponse(s.ID)
			}
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"pass":    true,
			"summary": map[string]any{"sessionId": s.ID, "interruptionCancelled": interrupted},
		})
	})

	srv := &http.Server{Addr: ":" + port, Handler: mux, ReadHeaderTimeout: 5 * time.Second}
	go func() {
		slog.Info("ai-media-gateway listening", "port", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("server failed", "error", err)
			os.Exit(1)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
