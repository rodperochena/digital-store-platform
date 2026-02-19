"use strict";

require("dotenv").config();

const { createApp } = require("./app");

const PORT = Number(process.env.PORT) || 5000;
const HOST = process.env.HOST || "127.0.0.1";

const app = createApp();

const server = app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT} pid=${process.pid}`);
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
process.once("SIGUSR2", () => shutdown("SIGUSR2"));

module.exports = { app, server };
