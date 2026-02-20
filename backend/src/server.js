"use strict";

require("dotenv").config({ quiet: true });

const { createApp } = require("./app");

function startServer() {
  const PORT = Number(process.env.PORT || 5051);
  const HOST = process.env.HOST || "127.0.0.1";

  const app = createApp();

  const server = app.listen(PORT, HOST, () => {
    console.log(`[server] running on http://${HOST}:${PORT} pid=${process.pid}`);
  });

  // Graceful shutdown
  function shutdown(signal) {
    console.log(`[server] ${signal} received. Closing HTTP server...`);

    server.close(() => {
      console.log("[server] HTTP server closed.");
      process.exit(0);
    });

    setTimeout(() => {
      console.log("[server] Force exit after 5s");
      process.exit(1);
    }, 5000).unref();
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  // Helpful for nodemon / some dev tools
  process.once("SIGUSR2", () => shutdown("SIGUSR2"));

  return { app, server };
}

// If run directly: `node src/server.js`
if (require.main === module) {
  startServer();
}

module.exports = { startServer };
