package aitools

import "testing"

func TestTransferIsolationRejectsOtherAlias(t *testing.T) {
	if _, err := ValidateTransferDestination("tenant_b_extension"); err == nil {
		t.Fatal("expected rejection of arbitrary alias")
	}
}
