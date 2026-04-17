"use strict";

require("dotenv").config({ path: require("path").join(__dirname, ".env"), quiet: true });

const { startServer } = require("./src/server");
startServer();
