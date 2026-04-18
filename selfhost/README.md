# selfhost backend

Pendant-first self-hosted backend for Omi experiments.

Initial scope:
- health check
- configurable base URL target for the RN/Flutter app
- local file ingest endpoint compatible with the app's sync-local-files upload flow
- placeholder websocket endpoint for transcript streaming experiments

This is intentionally narrow and Go-based.

## Run

```bash
cd selfhost
go run ./cmd/server
```

Environment variables:
- `SELFHOST_ADDR` listen address, default `:8080`
- `SELFHOST_DATA_DIR` upload storage directory, default `./data`
- `SELFHOST_PUBLIC_URL` public base URL with trailing slash, default `http://127.0.0.1:8080/`

## Endpoints

- `GET /healthz`
- `GET /v1/health`
- `GET /v1/config`
- `POST /v1/sync-local-files`
- `GET /v4/listen` placeholder only for now
