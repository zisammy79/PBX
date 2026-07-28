package controller

import (
	"fmt"
	"strings"
	"unicode"
)

func formatSipCallerID(displayName, number string) string {
	name := sanitizeCallerDisplayName(displayName)
	num := strings.TrimSpace(number)
	if num == "" {
		return name
	}
	if name == "" || name == num {
		return fmt.Sprintf("<%s>", num)
	}
	return fmt.Sprintf("\"%s\" <%s>", name, num)
}

func sanitizeCallerDisplayName(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	var b strings.Builder
	for _, r := range value {
		if unicode.IsControl(r) {
			continue
		}
		switch r {
		case '"', '\\', '\n', '\r':
			continue
		default:
			b.WriteRune(r)
		}
	}
	out := strings.TrimSpace(b.String())
	if out == "" {
		return ""
	}
	if len(out) > 40 {
		out = strings.TrimSpace(out[:40])
	}
	return out
}

func externalCallerDisplayName(e164 string) string {
	e164 = strings.TrimSpace(e164)
	if e164 == "" {
		return "External"
	}
	return e164
}
