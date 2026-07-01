package controller

import "testing"

func TestIsPstnInboundStasis(t *testing.T) {
	t.Parallel()
	cases := []struct {
		caller string
		dest   string
		want   bool
	}{
		{"+972584848480", "100", true},
		{"+15551234567", "1001", true},
		{"100", "1002", false},
		{"+972584848480", "+97233820386", false},
		{"+972584848480", "ai", false},
		{"+972584848480", "12", false},
		{"anonymous", "100", false},
	}
	for _, tc := range cases {
		tc := tc
		t.Run(tc.caller+"->"+tc.dest, func(t *testing.T) {
			t.Parallel()
			if got := isPstnInboundStasis(tc.caller, tc.dest); got != tc.want {
				t.Fatalf("isPstnInboundStasis(%q, %q) = %v, want %v", tc.caller, tc.dest, got, tc.want)
			}
		})
	}
}

func TestPstnInboundBuildsCorrectEndpointTarget(t *testing.T) {
	t.Parallel()
	got := buildPjsipEndpointTarget("rls-a-2433f849_ext_100")
	want := "PJSIP/rls-a-2433f849_ext_100"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}
