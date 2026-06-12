import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { getScanFiles } from "./check-encoding.mjs";

test("getScanFiles includes root .env.example", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "tworiver-encoding-test-"));

  try {
    await mkdir(path.join(directory, "apps"));
    await writeFile(path.join(directory, ".env.example"), "DATABASE_PATH=./data/blog.sqlite\n");

    const files = getScanFiles(directory).map((filePath) => path.relative(directory, filePath).split(path.sep).join("/"));

    assert.deepEqual(files, [".env.example"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
