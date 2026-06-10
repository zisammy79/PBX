package aitools

import (
	"fmt"
	"net/url"
	"regexp"
	"strings"
)

const TransferAliasHumanSupport = "human_support"

const (
	toolTransferCall = "transfer_call"
	toolEndCall      = "end_call"
	toolHTTPWebhook  = "http_webhook"
)

func ToolTransferCallName() string { return toolTransferCall }

var sipURIPattern = regexp.MustCompile(`(?i)^sips?:`)

// TransferRequest is the validated server-side transfer intent.
type TransferRequest struct {
	DestinationAlias string
}

func ValidateTransferDestination(raw string) (TransferRequest, error) {
	alias := strings.TrimSpace(raw)
	if alias == "" {
		return TransferRequest{}, fmt.Errorf("destination required")
	}
	if sipURIPattern.MatchString(alias) {
		return TransferRequest{}, fmt.Errorf("raw SIP URIs are not allowed")
	}
	if strings.ContainsAny(alias, "@:/?#") {
		return TransferRequest{}, fmt.Errorf("invalid destination alias")
	}
	for _, r := range alias {
		if (r < 'a' || r > 'z') && (r < '0' || r > '9') && r != '_' {
			return TransferRequest{}, fmt.Errorf("destination alias must be alphanumeric")
		}
	}
	if alias != TransferAliasHumanSupport {
		return TransferRequest{}, fmt.Errorf("unsupported destination alias %q", alias)
	}
	return TransferRequest{DestinationAlias: alias}, nil
}

func ValidateEndCall(sessionActive bool) error {
	if !sessionActive {
		return fmt.Errorf("no active session")
	}
	return nil
}

type WebhookRequest struct {
	URL string
}

func ValidateHTTPWebhook(rawURL string) (WebhookRequest, error) {
	u := strings.TrimSpace(rawURL)
	if u == "" {
		return WebhookRequest{}, fmt.Errorf("url required")
	}
	parsed, err := url.Parse(u)
	if err != nil || parsed.Scheme != "https" {
		return WebhookRequest{}, fmt.Errorf("https url required")
	}
	host := strings.ToLower(parsed.Hostname())
	if host == "localhost" || strings.HasSuffix(host, ".local") {
		return WebhookRequest{}, fmt.Errorf("blocked host")
	}
	for _, blocked := range []string{"127.", "10.", "192.168.", "169.254.", "172.16.", "172.17.", "172.18.", "172.19.", "172.2", "172.30.", "172.31."} {
		if strings.HasPrefix(host, blocked) {
			return WebhookRequest{}, fmt.Errorf("private host blocked")
		}
	}
	return WebhookRequest{URL: parsed.String()}, nil
}
