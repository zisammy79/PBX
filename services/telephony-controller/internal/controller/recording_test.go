package controller

import (
	"os"
	"path/filepath"
	"testing"
)

func TestSafeJoinRejectsTraversal(t *testing.T) {
	root := t.TempDir()
	cases := []string{
		"..",
		"../secret",
	}
	for _, key := range cases {
		if _, err := safeJoin(root, key); err == nil {
			t.Fatalf("expected error for key %q", key)
		}
	}
}

func TestSafeJoinAllowsNestedKey(t *testing.T) {
	root := t.TempDir()
	key := filepath.Join("tenant-a", "2026", "06", "recording.wav")
	got, err := safeJoin(root, key)
	if err != nil {
		t.Fatalf("safeJoin: %v", err)
	}
	want := filepath.Join(root, key)
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestRecordingLocalRootDefault(t *testing.T) {
	t.Setenv("CALL_RECORDING_LOCAL_ROOT", "")
	if got := recordingLocalRoot(); got != "/var/lib/pbx/recordings" {
		t.Fatalf("default root = %q", got)
	}
}

func TestRecordingLocalRootOverride(t *testing.T) {
	t.Setenv("CALL_RECORDING_LOCAL_ROOT", "/tmp/custom")
	if got := recordingLocalRoot(); got != "/tmp/custom" {
		t.Fatalf("override root = %q", got)
	}
}

func TestCopyFile(t *testing.T) {
	dir := t.TempDir()
	src := filepath.Join(dir, "src.wav")
	dest := filepath.Join(dir, "nested", "dest.wav")
	if err := os.WriteFile(src, []byte("wav-bytes"), 0o640); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Dir(dest), 0o750); err != nil {
		t.Fatal(err)
	}
	if err := copyFile(src, dest); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(dest)
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != "wav-bytes" {
		t.Fatalf("unexpected payload %q", string(data))
	}
}
