// Keep the development command simple (`node server.js`) while the application
// source remains TypeScript. Production continues to run the compiled build.
require("ts-node/register/transpile-only");
require("./src/index.ts");
