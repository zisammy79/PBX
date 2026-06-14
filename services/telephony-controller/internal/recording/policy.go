package recording

import (
	"time"

	"github.com/google/uuid"
)

type PolicyMode string

const (
	PolicyInherit PolicyMode = "inherit"
	PolicyOn      PolicyMode = "on"
	PolicyOff     PolicyMode = "off"
)

type Participant struct {
	ExtensionID uuid.UUID
	Mode        PolicyMode
	Active      bool
}

type Decision struct {
	ShouldRecord            bool
	Reason                  string
	ParticipantExtensionIDs []uuid.UUID
	ResolvedAt              time.Time
}

func EffectiveExtension(orgDefault bool, mode PolicyMode) bool {
	switch mode {
	case PolicyOn:
		return true
	case PolicyOff:
		return false
	default:
		return orgDefault
	}
}

func Resolve(orgDefault bool, callAnswered bool, participants []Participant, resolvedAt time.Time) Decision {
	active := make([]Participant, 0, len(participants))
	for _, p := range participants {
		if p.Active {
			active = append(active, p)
		}
	}
	if !callAnswered || len(active) == 0 {
		return Decision{
			ShouldRecord: false,
			Reason:       "call_not_answered",
			ResolvedAt:   resolvedAt,
		}
	}

	enabled := make([]uuid.UUID, 0, len(active))
	for _, p := range active {
		if EffectiveExtension(orgDefault, p.Mode) {
			enabled = append(enabled, p.ExtensionID)
		}
	}
	if len(enabled) == 0 {
		reason := "organization_default_off"
		if orgDefault {
			reason = "all_participants_off"
		}
		return Decision{
			ShouldRecord: false,
			Reason:       reason,
			ResolvedAt:   resolvedAt,
		}
	}

	reason := "multi_participant_policy_on"
	for _, p := range active {
		if p.Mode == PolicyOn {
			reason = "extension_override_on"
			break
		}
	}
	if reason != "extension_override_on" && orgDefault {
		reason = "organization_default_on"
	}

	return Decision{
		ShouldRecord:            true,
		Reason:                  reason,
		ParticipantExtensionIDs: enabled,
		ResolvedAt:              resolvedAt,
	}
}

func BuildStorageKey(tenantID, recordingID uuid.UUID, now time.Time) string {
	return tenantID.String() + "/" + now.UTC().Format("2006/01/") + recordingID.String() + ".wav"
}
