package recording

import (
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestResolveOrganizationOffInherit(t *testing.T) {
	t.Parallel()
	decision := Resolve(false, true, []Participant{{ExtensionID: uuid.MustParse("11111111-1111-1111-1111-111111111111"), Mode: PolicyInherit, Active: true}}, testTime())
	if decision.ShouldRecord {
		t.Fatal("expected no recording")
	}
}

func TestResolveExtensionOn(t *testing.T) {
	t.Parallel()
	decision := Resolve(false, true, []Participant{{ExtensionID: uuid.MustParse("11111111-1111-1111-1111-111111111111"), Mode: PolicyOn, Active: true}}, testTime())
	if !decision.ShouldRecord || decision.Reason != "extension_override_on" {
		t.Fatalf("unexpected decision: %+v", decision)
	}
}

func TestResolveBothOff(t *testing.T) {
	t.Parallel()
	decision := Resolve(true, true, []Participant{
		{ExtensionID: uuid.MustParse("11111111-1111-1111-1111-111111111111"), Mode: PolicyOff, Active: true},
		{ExtensionID: uuid.MustParse("22222222-2222-2222-2222-222222222222"), Mode: PolicyOff, Active: true},
	}, testTime())
	if decision.ShouldRecord {
		t.Fatal("expected no recording")
	}
}

func testTime() time.Time { return time.Date(2026, 6, 14, 0, 0, 0, 0, time.UTC) }
