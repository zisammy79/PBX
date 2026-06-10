package controller

import "testing"

func TestParseJoinArgs(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name   string
		args   []string
		callID string
		ok     bool
	}{
		{"split args", []string{"join", "550e8400-e29b-41d4-a716-446655440000"}, "550e8400-e29b-41d4-a716-446655440000", true},
		{"single arg", []string{"join,550e8400-e29b-41d4-a716-446655440000"}, "550e8400-e29b-41d4-a716-446655440000", true},
		{"missing call id", []string{"join,"}, "", false},
		{"not join", []string{"pbx-platform", "1001", "1002"}, "", false},
	}
	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got, ok := parseJoinArgs(tc.args)
			if ok != tc.ok || got != tc.callID {
				t.Fatalf("parseJoinArgs(%v) = (%q, %v), want (%q, %v)", tc.args, got, ok, tc.callID, tc.ok)
			}
		})
	}
}
