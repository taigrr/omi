package httpapi

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/taigrr/omi/selfhost/internal/config"
	"github.com/taigrr/omi/selfhost/internal/store"
	"github.com/taigrr/omi/selfhost/internal/types"
)

type Server struct {
	cfg   config.Config
	store *store.Store
}

func New(cfg config.Config, st *store.Store) *Server {
	return &Server{cfg: cfg, store: st}
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", s.handleHealth)
	mux.HandleFunc("GET /v1/health", s.handleHealth)
	mux.HandleFunc("GET /v1/config", s.handleConfig)
	mux.HandleFunc("POST /v1/sync-local-files", s.handleSyncLocalFiles)
	mux.HandleFunc("GET /v4/listen", s.handleListenPlaceholder)
	return logging(mux)
}

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleConfig(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"apiBaseUrl":      s.cfg.PublicURL,
		"agentProxyWsUrl": deriveAgentWS(s.cfg.PublicURL),
	})
}

func (s *Server) handleSyncLocalFiles(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(128 << 20); err != nil {
		http.Error(w, fmt.Sprintf("parse multipart: %v", err), http.StatusBadRequest)
		return
	}

	files := r.MultipartForm.File["files"]
	if len(files) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "no files field supplied"})
		return
	}

	newIDs := make([]string, 0, len(files))
	for _, fh := range files {
		src, err := fh.Open()
		if err != nil {
			http.Error(w, fmt.Sprintf("open upload: %v", err), http.StatusInternalServerError)
			return
		}

		safeName := filepath.Base(fh.Filename)
		id, dstPath, err := s.store.CreateUploadPath(safeName)
		if err != nil {
			src.Close()
			http.Error(w, fmt.Sprintf("create upload path: %v", err), http.StatusInternalServerError)
			return
		}

		dst, err := os.Create(dstPath)
		if err != nil {
			src.Close()
			http.Error(w, fmt.Sprintf("create dst: %v", err), http.StatusInternalServerError)
			return
		}

		_, copyErr := io.Copy(dst, src)
		closeErr := dst.Close()
		src.Close()
		if copyErr != nil {
			http.Error(w, fmt.Sprintf("copy upload: %v", copyErr), http.StatusInternalServerError)
			return
		}
		if closeErr != nil {
			http.Error(w, fmt.Sprintf("close dst: %v", closeErr), http.StatusInternalServerError)
			return
		}

		metaPath := dstPath + ".json"
		_ = os.WriteFile(metaPath, mustJSON(map[string]any{
			"originalFilename": fh.Filename,
			"storedPath":       dstPath,
			"size":             fh.Size,
			"formValues":       r.MultipartForm.Value,
		}), 0o644)

		newIDs = append(newIDs, id)
	}

	writeJSON(w, http.StatusOK, types.SyncLocalFilesResponse{
		NewConversationIDs:     newIDs,
		UpdatedConversationIDs: []string{},
	})
}

func (s *Server) handleListenPlaceholder(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusNotImplemented, map[string]any{
		"error": "streaming transcription websocket not implemented yet",
		"hint":  "use this backend first for endpoint config and file ingest, then add websocket streaming",
	})
}

func deriveAgentWS(base string) string {
	base = strings.TrimSpace(base)
	if base == "" {
		return "ws://127.0.0.1:8080/v1/agent/ws"
	}
	base = strings.TrimSuffix(base, "/")
	base = strings.Replace(base, "https://", "wss://", 1)
	base = strings.Replace(base, "http://", "ws://", 1)
	return base + "/v1/agent/ws"
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func mustJSON(v any) []byte {
	b, _ := json.MarshalIndent(v, "", "  ")
	return b
}

func logging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Printf("%s %s\n", r.Method, r.URL.Path)
		next.ServeHTTP(w, r)
	})
}
