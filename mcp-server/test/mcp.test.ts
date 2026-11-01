import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Server } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { loadCheatsheets } from "../src/cheatsheets.js";
import { startHttpServer } from "../src/http.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = resolve(here, "../../test/fixtures/repo");
const repoRoot = resolve(here, "../../..");

type TextResult = { content: { type: string; text: string }[]; isError?: boolean };
const textOf = (r: unknown) => (r as TextResult).content.map((c) => c.text).join("\n");

async function exercise(client: Client) {
  const tools = (await client.listTools()).tools.map((t) => t.name).sort();
  assert.deepEqual(tools, ["get_cheatsheet", "get_term", "list_domains", "search_terms"]);
  for (const t of (await client.listTools()).tools) assert.equal(t.annotations?.readOnlyHint, true, t.name);

  assert.match(textOf(await client.callTool({ name: "list_domains", arguments: {} })), /\*\*sample\*\* — 샘플 · Sample: 시험용 시트/);

  const search = textOf(await client.callTool({ name: "search_terms", arguments: { query: "도시락" } }));
  assert.match(search, /Bento Grid · 벤토 그리드\*\* \(`sample\/bento-grid`/);

  const term = textOf(await client.callTool({ name: "get_term", arguments: { domain: "sample", term: "히어로 섹션" } }));
  assert.match(term, /- 확인 질문: 배경은 이미지인가요 단색인가요\?/);
  assert.match(term, /- image: https:\/\/raw\.githubusercontent\.com\/mafianacho\/domain-cheatsheets\/main\/assets\/sample\/hero-section\.svg/);
  assert.match(term, /- page: https:\/\/github\.com\/mafianacho\/domain-cheatsheets\/blob\/main\/cheatsheets\/sample\.md#hero-section--/);

  const missing = (await client.callTool({ name: "get_term", arguments: { domain: "sample", term: "hero" } })) as TextResult;
  assert.equal(missing.isError, true);
  assert.match(textOf(missing), /Did you mean: hero-section/);

  const unknown = (await client.callTool({ name: "get_cheatsheet", arguments: { domain: "nope" } })) as TextResult;
  assert.equal(unknown.isError, true);
  assert.match(textOf(unknown), /Available: sample/);

  const sheet = textOf(await client.callTool({ name: "get_cheatsheet", arguments: { domain: "sample" } }));
  assert.ok(!sheet.includes("overview:start"), "generated HTML grid is stripped");
  assert.ok(!sheet.startsWith("---"), "front matter is stripped");
  assert.match(sheet, /src="https:\/\/raw\.githubusercontent\.com\/mafianacho\/domain-cheatsheets\/main\/assets\/sample\/hero-section\.svg"/);

  const part = textOf(await client.callTool({ name: "get_cheatsheet", arguments: { domain: "sample", category: "계약" } }));
  assert.match(part, /### 해지 · Termination/);
  assert.ok(!part.includes("Hero Section"));

  const resources = await client.listResources();
  assert.deepEqual(resources.resources.map((r) => r.uri), ["cheatsheet://sample"]);
  const res = await client.readResource({ uri: "cheatsheet://sample" });
  assert.match(String((res.contents[0] as { text: string }).text), /# 샘플 치트시트/);

  const prompt = await client.getPrompt({ name: "sync_up", arguments: { domain: "sample", task: "첫 화면 크게" } });
  const msg = (prompt.messages[0]!.content as { text: string }).text;
  assert.match(msg, /내 요청: 첫 화면 크게/);
  assert.match(msg, /확인 질문/);
}

test("stdio transport serves the fixture repo", async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [resolve(here, "../src/stdio.js")],
    env: { PATH: process.env.PATH ?? "", CHEATSHEETS_ROOT: fixtureRoot },
    stderr: "pipe",
  });
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(transport);
  try {
    assert.match(client.getInstructions() ?? "", /sync up/);
    await exercise(client);
  } finally {
    await client.close();
  }
});

let http: Server;
let base: string;
before(async () => {
  http = await startHttpServer(loadCheatsheets(fixtureRoot), 0, "127.0.0.1");
  const addr = http.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});
after(() => new Promise<void>((r) => http.close(() => r())));

test("streamable HTTP transport serves the same tools (stateless)", async () => {
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
  try {
    await exercise(client);
  } finally {
    await client.close();
  }
});

test("HTTP edges: healthz, GET /mcp 405, bad JSON 400, unknown path 404", async () => {
  const health = await fetch(`${base}/healthz`);
  assert.deepEqual(await health.json(), { ok: true, version: "0.1.0", sheets: 1, terms: 3 });
  assert.equal((await fetch(`${base}/mcp`)).status, 405);
  const bad = await fetch(`${base}/mcp`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: "{" });
  assert.equal(bad.status, 400);
  assert.equal((await fetch(`${base}/nope`)).status, 404);
  const big = await fetch(`${base}/mcp`, { method: "POST", headers: { "content-type": "application/json" }, body: "x".repeat(1024 * 1024 + 10) });
  assert.equal(big.status, 413);
});

test("every real sheet is reachable through the MCP tools", async () => {
  const sheets = loadCheatsheets(repoRoot);
  const server = await startHttpServer(sheets, 0, "127.0.0.1");
  const addr = server.address();
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}/mcp`)));
  try {
    const list = textOf(await client.callTool({ name: "list_domains", arguments: {} }));
    for (const s of sheets) {
      assert.ok(list.includes(`**${s.id}**`), s.id);
      const first = s.terms[0]!;
      const card = textOf(await client.callTool({ name: "get_term", arguments: { domain: s.id, term: first.id } }));
      assert.ok(card.includes(first.definition), `${s.id}/${first.id}`);
      const hit = textOf(await client.callTool({ name: "search_terms", arguments: { query: first.names[0]!, domain: s.id } }));
      assert.ok(hit.includes(`${s.id}/${first.id}`), `search ${s.id}/${first.id}`);
    }
  } finally {
    await client.close();
    await new Promise<void>((r) => server.close(() => r()));
  }
});
