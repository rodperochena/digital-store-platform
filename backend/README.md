## Backend local run

### Default port
Project default backend port is **5000**.

### macOS note (port 5000 + pf)
On some macOS machines, port **5000** may be used by **Control Center (ControlCe)**.
Also, enabling **pf** (packet filter) can interfere with localhost connections.

Recommended macOS local setup:
- Keep pf disabled (`sudo pfctl -d`)
- Run backend on port **5051**

Example:
PORT=5051 HOST=127.0.0.1 npm run dev

Health check:
curl http://127.0.0.1:5051/api/health

### Running backend tests with disposable Docker Postgres
Prerequisite: Docker must be installed and running locally.

Run:
```bash
cd backend && npm run test:docker
```

Notes:
- Uses a disposable local Postgres 16 container on host port `54321` (avoids conflicts with local `5432`).
- Uses temporary local credentials only (`postgres/postgres`) and does not require any real secrets.
- Do not commit any `.env` values for this workflow.
