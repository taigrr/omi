package store

import (
	"crypto/rand"
	"encoding/hex"
	"os"
	"path/filepath"
)

type Store struct {
	Root string
}

func New(root string) (*Store, error) {
	if err := os.MkdirAll(root, 0o755); err != nil {
		return nil, err
	}
	return &Store{Root: root}, nil
}

func (s *Store) CreateUploadPath(filename string) (string, string, error) {
	idBytes := make([]byte, 8)
	if _, err := rand.Read(idBytes); err != nil {
		return "", "", err
	}
	id := hex.EncodeToString(idBytes)
	dir := filepath.Join(s.Root, id)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", "", err
	}
	return id, filepath.Join(dir, filename), nil
}
