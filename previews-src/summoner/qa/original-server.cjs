// Parity test server (local only). Serves the portfolio's public/ folder exactly like a static host
// AND the ORIGINAL Express app (original/app.js, unmodified) at "/", on one port:
//
//   node qa/original-server.cjs [--port 4420]
//   http://127.0.0.1:4420/                    original server-rendered app (2021 code)
//   http://127.0.0.1:4420/previews/summoner/  static preview
//
// app.js calls app.listen(process.env.PORT || 80); here listen() is intercepted so the original
// app can be mounted on 127.0.0.1 instead of binding port 80 on every interface.
"use strict";
const path = require("node:path");
const express = require("express");

const port = Number(process.argv[process.argv.indexOf("--port") + 1]) || 4420;
const original = path.join(__dirname, "..", "original");
const publicDir = path.join(__dirname, "..", "..", "..", "public");

let originalApp;
const listen = express.application.listen;
express.application.listen = function interceptedListen() { originalApp = this; };
process.chdir(original); // Express resolves the default "views" folder from the working directory.
require(path.join(original, "app.js"));
express.application.listen = listen;
if (!originalApp) throw new Error("original app.js did not call app.listen");

const server = express();
server.disable("x-powered-by");
server.use(express.static(publicDir, { extensions: ["html"] }));
server.use(originalApp);
server.listen(port, "127.0.0.1", () => console.log(`original app + public/ on http://127.0.0.1:${port}`));
