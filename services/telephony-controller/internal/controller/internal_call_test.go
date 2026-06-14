package controller

import "testing"

func TestBuildPjsipEndpointTarget(t *testing.T) {
	t.Parallel()
	cases := []struct {
		in   string
		want string
	}{
		{"demo-company_ext_1004", "PJSIP/demo-company_ext_1004"},
		{"PJSIP/demo-company_ext_1004", "PJSIP/demo-company_ext_1004"},
		{"", ""},
	}
	for _, tc := range cases {
		tc := tc
		t.Run(tc.in, func(t *testing.T) {
			t.Parallel()
			if got := buildPjsipEndpointTarget(tc.in); got != tc.want {
				t.Fatalf("buildPjsipEndpointTarget(%q) = %q, want %q", tc.in, got, tc.want)
			}
		})
	}
}

func TestEndpointStateOnline(t *testing.T) {
	t.Parallel()
	if !endpointStateOnline("online") || !endpointStateOnline("Not In Use") {
		t.Fatal("expected online states")
	}
	if endpointStateOnline("offline") || endpointStateOnline("unavailable") {
		t.Fatal("did not expect offline states to be online")
	}
}

func TestEndpointStateOffline(t *testing.T) {
	t.Parallel()
	if !endpointStateOffline("offline") || !endpointStateOffline("Unavailable") {
		t.Fatal("expected offline states")
	}
	if endpointStateOffline("online") {
		t.Fatal("did not expect online to be offline")
	}
}

func TestEndpointAvailable(t *testing.T) {
	t.Parallel()
	if !endpointAvailable("online") || !endpointAvailable("not in use") || !endpointAvailable("In Use") {
		t.Fatal("expected reachable endpoint states")
	}
	if endpointAvailable("offline") || endpointAvailable("unavailable") || endpointAvailable("unknown") {
		t.Fatal("offline endpoint must not be available for originate")
	}
}
