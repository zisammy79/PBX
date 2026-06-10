package health

import (
	"context"
	"encoding/json"
	"net/http"
	"sync/atomic"
)

type Checker struct {
	ready atomic.Bool
}

func NewChecker() *Checker {
	return &Checker{}
}

func (c *Checker) SetReady(v bool) {
	c.ready.Store(v)
}

func (c *Checker) Handler() http.Handler {
	mux := http.NewServeMux()
	c.registerRoutes(mux)
	return mux
}

func (c *Checker) registerRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/health/live", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "healthy"})
	})
	mux.HandleFunc("/health/ready", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if !c.ready.Load() {
			w.WriteHeader(http.StatusServiceUnavailable)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"status": "unhealthy",
				"ready":  false,
			})
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"status": "healthy",
			"ready":  true,
		})
	})
}

func Start(ctx context.Context, port string, checker *Checker, extra func(mux *http.ServeMux)) *http.Server {
	mux := http.NewServeMux()
	checker.registerRoutes(mux)
	if extra != nil {
		extra(mux)
	}
	srv := &http.Server{
		Addr:    ":" + port,
		Handler: mux,
	}
	go func() {
		_ = srv.ListenAndServe()
	}()
	go func() {
		<-ctx.Done()
		_ = srv.Shutdown(context.Background())
	}()
	return srv
}
