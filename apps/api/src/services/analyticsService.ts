import crypto from "node:crypto";
import type { FastifyRequest } from "fastify";
import { PageViewInputSchema, type AnalyticsPeriod, type PageViewInput } from "@tworiver/shared";
import type { AppConfig } from "../config.js";
import type { BlogDatabase } from "../db/connection.js";
import { getAnalyticsSummary, insertAnalyticsEvent } from "../repositories/analyticsRepository.js";

export function getAnalyticsCutoffDate(period: AnalyticsPeriod, now = new Date()): string {
  const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  cutoff.setUTCDate(cutoff.getUTCDate() - period + 1);
  return cutoff.toISOString().slice(0, 10);
}

function getUtcDateParts(now = new Date()): { eventDate: string; minuteBucket: string; createdAt: string } {
  const createdAt = now.toISOString();
  const eventDate = createdAt.slice(0, 10);
  return {
    eventDate,
    minuteBucket: `${createdAt.slice(0, 16)}Z`,
    createdAt
  };
}

function hmacHex(key: crypto.BinaryLike | crypto.KeyObject, value: string): string {
  return crypto.createHmac("sha256", key).update(value).digest("hex");
}

function createVisitorHash(config: AppConfig, eventDate: string, ipAddress: string, userAgent: string): string {
  const secret = config.ANALYTICS_HASH_SECRET ?? config.SESSION_SECRET;
  const dailyKey = crypto.createHmac("sha256", secret).update(eventDate).digest();
  return hmacHex(dailyKey, `${ipAddress}\n${userAgent}`);
}

function getClientIp(request: FastifyRequest): string {
  const forwardedFor = request.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0]?.trim() ?? request.ip;
  }
  return request.ip;
}

function getReferrerDomain(request: FastifyRequest): string {
  const referrer = request.headers.referer ?? request.headers.referrer;
  if (typeof referrer !== "string" || !referrer) {
    return "";
  }

  try {
    return new URL(referrer).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function getDeviceType(userAgent: string): string {
  if (/ipad|tablet/i.test(userAgent)) {
    return "tablet";
  }
  if (/mobile|android|iphone|ipod/i.test(userAgent)) {
    return "mobile";
  }
  return "desktop";
}

function isIgnoredPageView(input: PageViewInput, userAgent: string): boolean {
  return input.path.startsWith("/admin") || input.path.startsWith("/api/admin") || /bot|crawler|spider|preview/i.test(userAgent);
}

export function recordPageView(
  db: BlogDatabase,
  config: AppConfig,
  request: FastifyRequest,
  rawInput: unknown,
  now = new Date()
): "recorded" | "ignored" | "invalid" {
  const parsed = PageViewInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return "invalid";
  }

  const userAgent = request.headers["user-agent"] ?? "";
  const normalizedUserAgent = Array.isArray(userAgent) ? userAgent.join(" ") : userAgent;
  if (isIgnoredPageView(parsed.data, normalizedUserAgent)) {
    return "ignored";
  }

  const { eventDate, minuteBucket, createdAt } = getUtcDateParts(now);
  insertAnalyticsEvent(db, {
    eventDate,
    minuteBucket,
    visitorHash: createVisitorHash(config, eventDate, getClientIp(request), normalizedUserAgent),
    path: parsed.data.path,
    contentType: parsed.data.contentType,
    contentId: parsed.data.contentId ?? null,
    locale: parsed.data.locale,
    referrerDomain: getReferrerDomain(request),
    deviceType: getDeviceType(normalizedUserAgent),
    createdAt
  });

  return "recorded";
}

export function getAnalyticsDashboard(db: BlogDatabase, period: AnalyticsPeriod) {
  return getAnalyticsSummary(db, getAnalyticsCutoffDate(period));
}

export function createAnalyticsCsv(db: BlogDatabase, period: AnalyticsPeriod): string {
  const summary = getAnalyticsDashboard(db, period);
  const rows = ["date,pageViews,uniqueVisitors"];
  for (const row of summary.daily) {
    rows.push(`${row.date},${row.pageViews},${row.uniqueVisitors}`);
  }
  return `${rows.join("\n")}\n`;
}
