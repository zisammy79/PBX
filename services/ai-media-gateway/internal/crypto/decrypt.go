package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
)

// DecryptSecret decrypts v1 AES-256-GCM ciphertext produced by @pbx/shared encryptSecret.
func DecryptSecret(ciphertext, masterKeyHex string) (string, error) {
	key, err := hex.DecodeString(masterKeyHex)
	if err != nil || len(key) != 32 {
		return "", fmt.Errorf("ENCRYPTION_MASTER_KEY must be 32 bytes (64 hex chars)")
	}
	parts := strings.Split(ciphertext, ":")
	if len(parts) != 4 || parts[0] != "v1" {
		return "", fmt.Errorf("invalid ciphertext format")
	}
	iv, err := hex.DecodeString(parts[1])
	if err != nil {
		return "", err
	}
	tag, err := hex.DecodeString(parts[2])
	if err != nil {
		return "", err
	}
	data, err := hex.DecodeString(parts[3])
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	combined := append(data, tag...)
	plain, err := gcm.Open(nil, iv, combined, nil)
	if err != nil {
		return "", fmt.Errorf("decrypt failed")
	}
	return string(plain), nil
}

// ParseOpenAICredentials extracts apiKey from encrypted provider connection JSON.
func ParseOpenAICredentials(encrypted, masterKeyHex string) (apiKey string, err error) {
	plain, err := DecryptSecret(encrypted, masterKeyHex)
	if err != nil {
		return "", err
	}
	var creds map[string]string
	if err := json.Unmarshal([]byte(plain), &creds); err != nil {
		return "", fmt.Errorf("invalid credentials json")
	}
	apiKey = strings.TrimSpace(creds["apiKey"])
	if apiKey == "" {
		return "", fmt.Errorf("apiKey missing in credentials")
	}
	return apiKey, nil
}
