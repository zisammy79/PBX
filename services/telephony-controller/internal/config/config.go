package config

import (
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Port                 string
	DatabaseURL          string
	NatsURL              string
	AriURL               string
	AriWsURL             string
	AriUsername          string
	AriPassword          string
	StasisApp            string
	AiGatewayURL         string
	InternalServiceToken string
	LogLevel             string
	ReconnectMin         time.Duration
	ReconnectMax         time.Duration
}

func Load() (Config, error) {
	cfg := Config{
		Port:                 getenv("TELEPHONY_CONTROLLER_PORT", "8090"),
		DatabaseURL:          os.Getenv("DATABASE_URL"),
		NatsURL:              getenv("NATS_URL", "nats://localhost:4222"),
		AriURL:               getenv("ASTERISK_ARI_URL", "http://127.0.0.1:8088/asterisk/ari"),
		AriWsURL:             os.Getenv("ASTERISK_ARI_WSURL"),
		AriUsername:          getenv("ASTERISK_ARI_USERNAME", "pbx_ari"),
		AriPassword:          os.Getenv("ASTERISK_ARI_PASSWORD"),
		StasisApp:            getenv("STASIS_APP", "pbx-platform"),
		AiGatewayURL:         getenv("AI_MEDIA_GATEWAY_URL", "http://127.0.0.1:8091"),
		InternalServiceToken: os.Getenv("INTERNAL_SERVICE_TOKEN"),
		LogLevel:             getenv("LOG_LEVEL", "info"),
		ReconnectMin:         2 * time.Second,
		ReconnectMax:         30 * time.Second,
	}
	if cfg.DatabaseURL == "" {
		return cfg, fmt.Errorf("DATABASE_URL is required")
	}
	if cfg.AriPassword == "" {
		return cfg, fmt.Errorf("ASTERISK_ARI_PASSWORD is required")
	}
	if cfg.AriWsURL == "" {
		cfg.AriWsURL = deriveWebsocketURL(cfg.AriURL)
	}
	return cfg, nil
}

func deriveWebsocketURL(ariURL string) string {
	parsed, err := url.Parse(ariURL)
	if err != nil {
		return strings.Replace(ariURL, "http://", "ws://", 1) + "/events"
	}
	parsed.Scheme = strings.Replace(parsed.Scheme, "https", "wss", 1)
	parsed.Scheme = strings.Replace(parsed.Scheme, "http", "ws", 1)
	parsed.Path = strings.TrimSuffix(parsed.Path, "/") + "/events"
	return parsed.String()
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func ParsePort(port string) int {
	p, err := strconv.Atoi(port)
	if err != nil {
		return 8090
	}
	return p
}
