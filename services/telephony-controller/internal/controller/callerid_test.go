package controller

import "testing"

func TestFormatSipCallerID(t *testing.T) {
	t.Parallel()
	got := formatSipCallerID("Desk 100", "100")
	want := "\"Desk 100\" <100>"
	if got != want {
		t.Fatalf("formatSipCallerID() = %q, want %q", got, want)
	}
}

func TestFormatSipCallerIDExternal(t *testing.T) {
	t.Parallel()
	got := formatSipCallerID("+972584848480", "+972584848480")
	want := "\"+972584848480\" <+972584848480>"
	if got != want {
		t.Fatalf("formatSipCallerID() = %q, want %q", got, want)
	}
}

func TestFormatSipCallerIDNumberOnly(t *testing.T) {
	t.Parallel()
	got := formatSipCallerID("", "+972584848480")
	want := "<+972584848480>"
	if got != want {
		t.Fatalf("formatSipCallerID() = %q, want %q", got, want)
	}
}

func TestSanitizeCallerDisplayName(t *testing.T) {
	t.Parallel()
	got := sanitizeCallerDisplayName("  Sales \"Team\"  ")
	if got != "Sales Team" {
		t.Fatalf("sanitizeCallerDisplayName() = %q", got)
	}
}
