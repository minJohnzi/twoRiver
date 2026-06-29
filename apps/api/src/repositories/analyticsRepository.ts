import type { AnalyticsContentType, Locale } from "@tworiver/shared";
import type { BlogDatabase } from "../db/connection.js";

export interface AnalyticsEventInput {
  eventDate: string;
  minuteBucket: string;
  visitorHash: string;
  path: string;
  contentType: AnalyticsContentType;
  contentId: number | null;
  locale: Locale;
  referrerDomain: string;
  deviceType: string;
  createdAt: string;
}

export interface AnalyticsDailyRow {
  date: string;
  pageViews: number;
  uniqueVisitors: number;
}

export interface AnalyticsSummary {
  totals: {
    pageViews: number;
    uniqueVisitors: number;
  };
  daily: AnalyticsDailyRow[];
  topContent: Array<{
    contentType: string;
    contentId: number | null;
    path: string;
    locale: Locale;
    pageViews: number;
  }>;
  referrers: Array<{
    referrerDomain: string;
    pageViews: number;
  }>;
  devices: Array<{
    deviceType: string;
    pageViews: number;
  }>;
}

interface CountRow {
  count: number;
}

interface DailyRow {
  event_date: string;
  page_views: number;
  unique_visitors: number;
}

export function insertAnalyticsEvent(db: BlogDatabase, input: AnalyticsEventInput): boolean {
  return db.transaction(() => {
    const result = db
      .prepare(
        `INSERT OR IGNORE INTO analytics_events (
           event_date, minute_bucket, visitor_hash, path, content_type, content_id,
           locale, referrer_domain, device_type, created_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.eventDate,
        input.minuteBucket,
        input.visitorHash,
        input.path,
        input.contentType,
        input.contentId,
        input.locale,
        input.referrerDomain,
        input.deviceType,
        input.createdAt
      );
    if (result.changes === 0) {
      return false;
    }

    db.prepare(
      `INSERT INTO analytics_daily (event_date, page_views, unique_visitors)
       VALUES (?, 1, 0)
       ON CONFLICT(event_date) DO UPDATE SET page_views = page_views + 1`
    ).run(input.eventDate);

    const visitorInsert = db
      .prepare("INSERT OR IGNORE INTO analytics_daily_visitors (event_date, visitor_hash) VALUES (?, ?)")
      .run(input.eventDate, input.visitorHash);
    if (visitorInsert.changes > 0) {
      db.prepare("UPDATE analytics_daily SET unique_visitors = unique_visitors + 1 WHERE event_date = ?").run(input.eventDate);
    }

    db.prepare(
      `INSERT INTO analytics_content_daily (event_date, content_type, content_id, path, locale, page_views)
       VALUES (?, ?, ?, ?, ?, 1)
       ON CONFLICT(event_date, content_type, path, locale) DO UPDATE SET page_views = page_views + 1`
    ).run(input.eventDate, input.contentType, input.contentId, input.path, input.locale);

    db.prepare(
      `INSERT INTO analytics_referrer_daily (event_date, referrer_domain, page_views)
       VALUES (?, ?, 1)
       ON CONFLICT(event_date, referrer_domain) DO UPDATE SET page_views = page_views + 1`
    ).run(input.eventDate, input.referrerDomain);

    db.prepare(
      `INSERT INTO analytics_device_daily (event_date, device_type, page_views)
       VALUES (?, ?, 1)
       ON CONFLICT(event_date, device_type) DO UPDATE SET page_views = page_views + 1`
    ).run(input.eventDate, input.deviceType);

    return true;
  })();
}

export function getAnalyticsSummary(db: BlogDatabase, cutoffDate: string): AnalyticsSummary {
  const dailyRows = db
    .prepare(
      `SELECT event_date, page_views, unique_visitors
       FROM analytics_daily
       WHERE event_date >= ?
       ORDER BY event_date ASC`
    )
    .all(cutoffDate) as DailyRow[];
  const totals = dailyRows.reduce(
    (accumulator, row) => ({
      pageViews: accumulator.pageViews + row.page_views,
      uniqueVisitors: accumulator.uniqueVisitors + row.unique_visitors
    }),
    { pageViews: 0, uniqueVisitors: 0 }
  );
  const topContent = db
    .prepare(
      `SELECT content_type AS contentType, MAX(content_id) AS contentId, path, locale, SUM(page_views) AS pageViews
       FROM analytics_content_daily
       WHERE event_date >= ?
       GROUP BY content_type, path, locale
       ORDER BY pageViews DESC, path ASC
       LIMIT 20`
    )
    .all(cutoffDate) as AnalyticsSummary["topContent"];
  const referrers = db
    .prepare(
      `SELECT referrer_domain AS referrerDomain, SUM(page_views) AS pageViews
       FROM analytics_referrer_daily
       WHERE event_date >= ? AND referrer_domain <> ''
       GROUP BY referrer_domain
       ORDER BY pageViews DESC, referrer_domain ASC
       LIMIT 20`
    )
    .all(cutoffDate) as AnalyticsSummary["referrers"];
  const devices = db
    .prepare(
      `SELECT device_type AS deviceType, SUM(page_views) AS pageViews
       FROM analytics_device_daily
       WHERE event_date >= ?
       GROUP BY device_type
       ORDER BY pageViews DESC, device_type ASC`
    )
    .all(cutoffDate) as AnalyticsSummary["devices"];

  return {
    totals,
    daily: dailyRows.map((row) => ({
      date: row.event_date,
      pageViews: row.page_views,
      uniqueVisitors: row.unique_visitors
    })),
    topContent,
    referrers,
    devices
  };
}

export function countAnalyticsEvents(db: BlogDatabase, olderThanDate: string): number {
  return (db.prepare("SELECT COUNT(*) AS count FROM analytics_events WHERE event_date < ?").get(olderThanDate) as CountRow).count;
}
