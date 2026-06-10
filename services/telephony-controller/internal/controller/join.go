package controller

import "strings"

func parseJoinArgs(args []string) (callID string, ok bool) {
	if len(args) >= 2 && args[0] == "join" {
		return args[1], true
	}
	if len(args) == 1 {
		parts := strings.SplitN(args[0], ",", 2)
		if len(parts) == 2 && parts[0] == "join" && parts[1] != "" {
			return parts[1], true
		}
	}
	return "", false
}
