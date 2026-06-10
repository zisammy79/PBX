package natsbus

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/nats-io/nats.go"
)

type Publisher struct {
	conn *nats.Conn
	js   nats.JetStreamContext
}

type CallEvent struct {
	TenantID      string         `json:"tenantId"`
	CallID        string         `json:"callId"`
	CorrelationID string         `json:"correlationId"`
	EventType     string         `json:"eventType"`
	OccurredAt    time.Time      `json:"occurredAt"`
	Payload       map[string]any `json:"payload"`
}

func Connect(url string) (*Publisher, error) {
	nc, err := nats.Connect(url)
	if err != nil {
		return nil, err
	}
	js, err := nc.JetStream()
	if err != nil {
		nc.Close()
		return nil, err
	}
	_, _ = js.AddStream(&nats.StreamConfig{
		Name:     "PBX_CALLS",
		Subjects: []string{"tenant.*.calls.>"},
		Storage:  nats.FileStorage,
	})
	return &Publisher{conn: nc, js: js}, nil
}

func (p *Publisher) Close() {
	if p.conn != nil {
		p.conn.Close()
	}
}

func (p *Publisher) PublishCallEvent(ctx context.Context, tenantID, callID, correlationID uuid.UUID, eventType string, payload map[string]any) error {
	subject := fmt.Sprintf("tenant.%s.calls.events", tenantID.String())
	body, err := json.Marshal(CallEvent{
		TenantID:      tenantID.String(),
		CallID:        callID.String(),
		CorrelationID: correlationID.String(),
		EventType:     eventType,
		OccurredAt:    time.Now().UTC(),
		Payload:       payload,
	})
	if err != nil {
		return err
	}
	_, err = p.js.Publish(subject, body, nats.MsgId(fmt.Sprintf("%s:%s", callID.String(), eventType)))
	return err
}

func (p *Publisher) Healthy(ctx context.Context) error {
	if p.conn == nil || !p.conn.IsConnected() {
		return fmt.Errorf("nats disconnected")
	}
	return nil
}
