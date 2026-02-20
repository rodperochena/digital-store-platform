"use strict";

require("dotenv").config({ quiet: true });

const { startServer } = require("./src/server");
startServer();
