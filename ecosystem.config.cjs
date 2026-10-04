const path = require("path");

const root = __dirname;

module.exports = {
  apps: [
    {
      name: "stream-server",
      cwd: path.join(root, "server"),
      script: "src/index.js",
      interpreter: "node",
      exec_mode: "fork",
      instances: 1,
      watch: false,
      max_memory_restart: "1G",
      kill_timeout: 10000,
      env: { NODE_ENV: "production" }
    },
    {
      name: "stream-client",
      cwd: path.join(root, "client"),
      script: "./node_modules/next/dist/bin/next",
      args: "start -p 3000",
      interpreter: "node",
      exec_mode: "fork",
      instances: 1,
      watch: false,
      max_memory_restart: "768M",
      kill_timeout: 10000,
      env: { NODE_ENV: "production" }
    }
  ]
};
