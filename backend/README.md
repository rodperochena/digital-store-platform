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
