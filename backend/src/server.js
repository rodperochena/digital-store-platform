require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { apiRouter } = require("./routes");
const { notFoundHandler, errorHandler } = require("./middleware/error.middleware");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api", apiRouter);

app.use(notFoundHandler);
app.use(errorHandler);

const PORT = Number(process.env.PORT) || 5000;
const HOST = process.env.HOST || "127.0.0.1";

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
