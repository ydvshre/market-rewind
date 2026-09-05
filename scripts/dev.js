const { spawn } = require("child_process");
const path = require("path");

const root = path.resolve(__dirname, "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

const server = spawn(npm, ["run", "server:dev"], { cwd: root, stdio: "inherit" });
const client = spawn(npm, ["run", "client:dev"], { cwd: root, stdio: "inherit" });

function shutdown() {
  server.kill();
  client.kill();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
