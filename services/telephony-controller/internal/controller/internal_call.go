package controller

import (
	"fmt"
	"strings"
)

func buildPjsipEndpointTarget(endpointID string) string {
	if endpointID == "" {
		return ""
	}
	if strings.HasPrefix(endpointID, "PJSIP/") {
		return endpointID
	}
	return fmt.Sprintf("PJSIP/%s", endpointID)
}

func endpointStateOnline(state string) bool {
	switch strings.ToLower(strings.TrimSpace(state)) {
	case "online", "not in use", "in use":
		return true
	default:
		return false
	}
}

func endpointStateOffline(state string) bool {
	switch strings.ToLower(strings.TrimSpace(state)) {
	case "offline", "unavailable", "unknown":
		return true
	default:
		return false
	}
}

func endpointAvailable(state string) bool {
	return endpointStateOnline(state)
}

func containsString(values []string, target string) bool {
	for _, v := range values {
		if v == target {
			return true
		}
	}
	return false
}
