import { describe, expect, test } from "vitest";
import { ARTICLE_DOCUMENT_SCHEMA_VERSION } from "../src/index.js";

describe("content engine package", () => {
  test("exports the current article document schema version", () => {
    expect(ARTICLE_DOCUMENT_SCHEMA_VERSION).toBe(1);
  });
});
