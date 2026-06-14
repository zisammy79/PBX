package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pbx-platform/telephony-controller/internal/calls"
	"github.com/pbx-platform/telephony-controller/internal/config"
	"github.com/pbx-platform/telephony-controller/internal/controller"
	"github.com/pbx-platform/telephony-controller/internal/health"
	"github.com/pbx-platform/telephony-controller/internal/natsbus"
	"github.com/pbx-platform/telephony-controller/internal/repository"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo})))

	cfg, err := config.Load()
	if err != nil {
		slog.Error("config error", "error", err)
		os.Exit(1)
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	checker := health.NewChecker()

	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		slog.Error("database connect failed", "error", err)
		os.Exit(1)
	}
	defer pool.Close()

	repo := repository.New(pool)
	bus, err := natsbus.Connect(cfg.NatsURL)
	if err != nil {
		slog.Error("nats connect failed", "error", err)
		os.Exit(1)
	}
	defer bus.Close()

	registry := calls.NewRegistry()
	ctrl := controller.New(controller.Config{
		AriURL:               cfg.AriURL,
		AriWsURL:             cfg.AriWsURL,
		AriUsername:          cfg.AriUsername,
		AriPassword:          cfg.AriPassword,
		StasisApp:            cfg.StasisApp,
		AiGatewayURL:         cfg.AiGatewayURL,
		InternalServiceToken: cfg.InternalServiceToken,
		ReconnectMin:         cfg.ReconnectMin,
		ReconnectMax:         cfg.ReconnectMax,
	}, repo, registry, bus)

	_ = health.Start(ctx, cfg.Port, checker, ctrl.RegisterInternalRoutes)

	go func() {
		if err := ctrl.Run(ctx); err != nil && ctx.Err() == nil {
			slog.Error("controller stopped", "error", err)
		}
	}()
	ctrl.StartRecordingMaintenance(ctx, time.Minute, 2*time.Minute)

	// Mark ready once dependencies are reachable
	for i := 0; i < 30; i++ {
		if err := pool.Ping(ctx); err == nil && bus.Healthy(ctx) == nil {
			checker.SetReady(true)
			break
		}
		time.Sleep(time.Second)
	}

	<-ctx.Done()
	slog.Info("shutting down telephony-controller")
	ctrl.Close()
	checker.SetReady(false)
}
