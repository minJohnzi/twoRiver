import { createServer as createHttpServer } from "node:http";
import type { IncomingMessage } from "node:http";
import path from "node:path";
import type { FullConfig } from "@playwright/test";
import { buildApp } from "../../apps/api/src/app";
import { loadConfig } from "../../apps/api/src/config";
import { openDatabase } from "../../apps/api/src/db/connection";
import { migrate } from "../../apps/api/src/db/migrate";
import { seedAdmin } from "../../apps/api/src/db/seedAdmin";

const API_PORT = 4100;
const WEB_PORT = 4173;
const AI_PORT = 4010;

async function waitForUrl(url: string): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;

  while (Date.now() - startedAt < 30_000) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for ${url}: ${String(lastError)}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function prefixTranslatedText(value: string, prefix: string): string {
  return value.trim().length > 0 ? `${prefix}${value}` : value;
}

async function readRequestBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function buildFakeAiMessage(rawBody: string): string {
  const requestBody = JSON.parse(rawBody) as { messages?: Array<{ role?: string; content?: string }> };
  const userContent = [...(requestBody.messages ?? [])].reverse().find((message) => message.role === "user")?.content ?? "{}";
  const payload = JSON.parse(userContent) as Record<string, unknown>;

  if (Array.isArray(payload.blocks)) {
    return JSON.stringify({
      title: prefixTranslatedText(typeof payload.title === "string" ? payload.title : "", "[ZH] "),
      summary: prefixTranslatedText(typeof payload.summary === "string" ? payload.summary : "", "[ZH] "),
      blocks: payload.blocks.map((block) => {
        const normalizedBlock = isRecord(block) ? block : {};
        const segments = Array.isArray(normalizedBlock.segments) ? normalizedBlock.segments : [];
        return {
          blockId: typeof normalizedBlock.blockId === "string" ? normalizedBlock.blockId : "",
          segments: segments.map((segment) => {
            const normalizedSegment = isRecord(segment) ? segment : {};
            return {
              segmentId: typeof normalizedSegment.segmentId === "string" ? normalizedSegment.segmentId : "",
              text: prefixTranslatedText(typeof normalizedSegment.text === "string" ? normalizedSegment.text : "", "[ZH] ")
            };
          })
        };
      })
    });
  }

  return JSON.stringify({
    title: prefixTranslatedText(typeof payload.title === "string" ? payload.title : "", "[ZH] "),
    summary: prefixTranslatedText(typeof payload.summary === "string" ? payload.summary : "", "[ZH] "),
    contentMarkdown: prefixTranslatedText(typeof payload.contentMarkdown === "string" ? payload.contentMarkdown : "", "[ZH] ")
  });
}

export default async function globalSetup(_config: FullConfig) {
  process.env.NODE_ENV = "test";
  process.env.PORT = String(API_PORT);
  process.env.TIPTAP_PUBLISH_ENABLED = "true";
  process.env.DATABASE_PATH = path.resolve("tests/e2e/e2e.sqlite");
  process.env.SESSION_SECRET = "e2e-session-secret-at-least-32-chars";
  process.env.ADMIN_USERNAME = "admin";
  process.env.ADMIN_PASSWORD = "secret1234567";
  process.env.CORS_ALLOWED_ORIGINS = `http://127.0.0.1:${WEB_PORT}`;
  process.env.DEEPSEEK_BASE_URL = `http://127.0.0.1:${AI_PORT}`;
  process.env.DEEPSEEK_API_KEY = "e2e-fake-key";
  process.env.VITE_API_BASE_URL = `http://127.0.0.1:${API_PORT}`;
  process.env.VITE_TIPTAP_NEW_ARTICLE_ENABLED = "true";
  process.env.VITE_TIPTAP_PUBLISH_ENABLED = "true";

  const aiServer = createHttpServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/chat/completions") {
      response.writeHead(404, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ message: "Not found" }));
      return;
    }

    const body = await readRequestBody(request);
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify({
        choices: [{ message: { content: buildFakeAiMessage(body) } }]
      })
    );
  });
  await new Promise<void>((resolve, reject) => {
    aiServer.once("error", reject);
    aiServer.listen(AI_PORT, "127.0.0.1", () => resolve());
  });

  migrate(process.env.DATABASE_PATH);
  const db = openDatabase(process.env.DATABASE_PATH);
  await seedAdmin(db, process.env.ADMIN_USERNAME, process.env.ADMIN_PASSWORD);
  const app = buildApp({ config: loadConfig(), db });
  await app.listen({ port: API_PORT, host: "127.0.0.1" });
  await waitForUrl(`http://127.0.0.1:${API_PORT}/api/health`);

  const { createServer } = await import("../../apps/web/node_modules/vite/dist/node/index.js");
  const vite = await createServer({
    configFile: path.resolve("apps/web/vite.config.ts"),
    root: path.resolve("apps/web"),
    server: {
      host: "127.0.0.1",
      port: WEB_PORT,
      strictPort: true
    }
  });
  await vite.listen();
  await waitForUrl(`http://127.0.0.1:${WEB_PORT}`);

  return async () => {
    await vite.close();
    await app.close();
    await new Promise<void>((resolve, reject) => {
      aiServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  };
}
