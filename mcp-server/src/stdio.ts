#!/usr/bin/env node
// stdio entry point: `node dist/src/stdio.js` (what MCP clients launch locally).
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadCheatsheets } from "./cheatsheets.js";
import { createServer } from "./server.js";

const sheets = loadCheatsheets();
const server = createServer(sheets);
await server.connect(new StdioServerTransport());
// stdout is the protocol channel; log only to stderr.
console.error(`domain-cheatsheets MCP (stdio): ${sheets.length} sheets, ${sheets.reduce((n, s) => n + s.terms.length, 0)} terms`);
