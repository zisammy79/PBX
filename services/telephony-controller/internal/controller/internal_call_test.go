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

func TestDestroyCallBridgeNoopWithoutBridge(t *testing.T) {
	t.Parallel()
	active := &calls.ActiveCall{}
	ctrl := &Controller{}
	ctrl.destroyCallBridge(active)
}

func TestDestroyCallBridgeNoopWithoutClient(t *testing.T) {
	t.Parallel()
	active := &calls.ActiveCall{BridgeID: "bridge-test"}
	ctrl := &Controller{}
	ctrl.destroyCallBridge(active)
	if active.BridgeID != "bridge-test" {
		t.Fatalf("expected bridge id unchanged without client")
	}
}
