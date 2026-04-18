package main

import (
	"fmt"
	"log"
	"net/http"

	"github.com/taigrr/omi/selfhost/internal/config"
	"github.com/taigrr/omi/selfhost/internal/httpapi"
	"github.com/taigrr/omi/selfhost/internal/store"
)

func main() {
	cfg := config.Load()
	st, err := store.New(cfg.DataDir)
	if err != nil {
		log.Fatalf("store init: %v", err)
	}

	srv := httpapi.New(cfg, st)
	fmt.Printf("selfhost backend listening on %s\n", cfg.Addr)
	log.Fatal(http.ListenAndServe(cfg.Addr, srv.Handler()))
}
