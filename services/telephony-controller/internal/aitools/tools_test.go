package aitools

import "testing"

func TestValidateTransferDestinationAlias(t *testing.T) {
	req, err := ValidateTransferDestination("human_support")
	if err != nil || req.DestinationAlias != TransferAliasHumanSupport {
		t.Fatalf("unexpected: %v %+v", err, req)
	}
}

func TestValidateTransferRejectsSIPURI(t *testing.T) {
	if _, err := ValidateTransferDestination("sip:1002@evil.example"); err == nil {
		t.Fatal("expected sip uri rejection")
	}
}

func TestValidateTransferRejectsArbitraryExtension(t *testing.T) {
	if _, err := ValidateTransferDestination("1002"); err == nil {
		t.Fatal("expected arbitrary extension rejection")
	}
}

func TestValidateHTTPWebhookBlocksPrivate(t *testing.T) {
	if _, err := ValidateHTTPWebhook("https://127.0.0.1/hook"); err == nil {
		t.Fatal("expected private host block")
	}
}

func TestValidateHTTPWebhookAllowsPublicHTTPS(t *testing.T) {
	if _, err := ValidateHTTPWebhook("https://example.com/hook"); err != nil {
		t.Fatalf("expected public https allowed: %v", err)
	}
}
