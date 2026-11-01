#!/usr/bin/env node
// Streamable HTTP entry point (stateless): POST /mcp, GET /healthz.
// HOST (default 127.0.0.1) and PORT (default 8787) come from the environment.
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { pathToFileURL } from "node:url";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { loadCheatsheets, type Cheatsheet } from "./cheatsheets.js";
import { createServer, SERVER_VERSION } from "./server.js";

const MAX_BODY = 1024 * 1024;

function json(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { "content-type": "application/json", ...headers }).end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw Object.assign(new Error("payload too large"), { status: 413 });
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("invalid JSON"), { status: 400 });
  }
}

export function startHttpServer(sheets: Cheatsheet[], port: number, host: string): Promise<Server> {
  const terms = sheets.reduce((n, s) => n + s.terms.length, 0);
  const http = createHttpServer(async (req, res) => {
    const path = (req.url ?? "/").split("?")[0];
    try {
      if (path === "/healthz" && req.method === "GET") return json(res, 200, { ok: true, version: SERVER_VERSION, sheets: sheets.length, terms });
      if (path !== "/mcp") return json(res, 404, { error: "not found" });
      if (req.method !== "POST") {
        return json(res, 405, { jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed (stateless server: use POST)" }, id: null }, { allow: "POST" });
      }
      const body = await readBody(req);
      const server = createServer(sheets);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.on("close", () => {
        void transport.close();
        void server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (e) {
      const status = (e as { status?: number }).status ?? 500;
      if (status === 500) console.error(e);
      if (!res.headersSent) json(res, status, { jsonrpc: "2.0", error: { code: -32700, message: (e as Error).message }, id: null });
    }
  });
  return new Promise((resolve) => http.listen(port, host, () => resolve(http)));
}

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const sheets = loadCheatsheets();
  const port = Number(process.env.PORT ?? 8787);
  const host = process.env.HOST ?? "127.0.0.1";
  const http = await startHttpServer(sheets, port, host);
  const addr = http.address();
  console.error(`domain-cheatsheets MCP (http): http://${host}:${typeof addr === "object" && addr ? addr.port : port}/mcp`);
}
