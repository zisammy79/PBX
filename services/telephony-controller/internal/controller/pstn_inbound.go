package controller

import (
	"strings"
	"unicode"
)

// isPstnInboundStasis reports whether Stasis args represent an external PSTN inbound call.
// Expected shape: tenant slug, E.164 caller (+...), internal destination extension (digits).
func isPstnInboundStasis(callerNum, destNum string) bool {
	caller := strings.TrimSpace(callerNum)
	dest := strings.TrimSpace(destNum)
	if !strings.HasPrefix(caller, "+") {
		return false
	}
	if dest == "" || strings.HasPrefix(dest, "+") || dest == "ai" {
		return false
	}
	if len(dest) < 3 || len(dest) > 6 {
		return false
	}
	for _, r := range dest {
		if !unicode.IsDigit(r) {
			return false
		}
	}
	return true
}
