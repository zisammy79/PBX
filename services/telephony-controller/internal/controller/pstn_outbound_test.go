package controller

import "testing"

func TestIsPstnOutboundStasis(t *testing.T) {
	t.Parallel()
	cases := []struct {
		args []string
		want bool
	}{
		{[]string{"rls-a-2433f849", "100", "outbound", "+972501234567"}, true},
		{[]string{"rls-a-2433f849", "rls-a-2433f849_100", "outbound", "+972501234567"}, true},
		{[]string{"rls-a-2433f849", "100", "1005"}, false},
		{[]string{"rls-a-2433f849", "+972584848480", "100"}, false},
		{[]string{"rls-a-2433f849", "100", "outbound", "0581234567"}, false},
		{[]string{"rls-a-2433f849", "100", "outbound"}, false},
	}
	for _, tc := range cases {
		tc := tc
		t.Run(stringsJoin(tc.args), func(t *testing.T) {
			t.Parallel()
			if got := isPstnOutboundStasis(tc.args); got != tc.want {
				t.Fatalf("isPstnOutboundStasis(%v) = %v, want %v", tc.args, got, tc.want)
			}
		})
	}
}

func TestBuildPjsipTrunkDialTarget(t *testing.T) {
	t.Parallel()
	got := buildPjsipTrunkDialTarget("+972501234567", "rls-a-2433f849_trunk_twilio-production")
	want := "PJSIP/+972501234567@rls-a-2433f849_trunk_twilio-production"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func stringsJoin(parts []string) string {
	out := ""
	for i, p := range parts {
		if i > 0 {
			out += ","
		}
		out += p
	}
	return out
}
