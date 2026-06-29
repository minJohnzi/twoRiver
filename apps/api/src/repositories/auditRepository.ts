import type { BlogDatabase } from "../db/connection.js";

export interface AuditEventInput {
  userId: number | null;
  action: string;
  targetType?: string;
  targetId?: string;
  outcome: "success" | "failure";
  metadata?: Record<string, unknown>;
}

export function createAuditEvent(db: BlogDatabase, input: AuditEventInput): void {
  db.prepare(
    `INSERT INTO audit_events (user_id, action, target_type, target_id, outcome, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    input.userId,
    input.action,
    input.targetType ?? "",
    input.targetId ?? "",
    input.outcome,
    JSON.stringify(input.metadata ?? {})
  );
}
