package config

import "os"

type Config struct {
	Addr      string
	DataDir   string
	PublicURL string
}

func Load() Config {
	addr := os.Getenv("AG_ADDR")
	if addr == "" {
		addr = ":8080"
	}
	dataDir := os.Getenv("AG_DATA_DIR")
	if dataDir == "" {
		dataDir = "./data"
	}
	publicURL := os.Getenv("AG_PUBLIC_URL")
	if publicURL == "" {
		publicURL = "http://127.0.0.1:8080/"
	}
	return Config{Addr: addr, DataDir: dataDir, PublicURL: publicURL}
}
