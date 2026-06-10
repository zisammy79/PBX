package crypto

import (
	"encoding/hex"
	"testing"
)

func TestDecryptSecretInvalidKey(t *testing.T) {
	_, err := DecryptSecret("v1:00112233445566778899aabb:00112233445566778899aabbcc:001122", "short")
	if err == nil {
		t.Fatal("expected error for short key")
	}
}

func TestParseOpenAICredentialsMissingKey(t *testing.T) {
	key := hex.EncodeToString(make([]byte, 32))
	// Cannot test full round-trip without TS encrypt; contract test validates format errors.
	_, err := ParseOpenAICredentials("not-valid", key)
	if err == nil {
		t.Fatal("expected error for invalid ciphertext")
	}
}
