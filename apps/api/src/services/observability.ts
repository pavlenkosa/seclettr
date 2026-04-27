type CounterName =
  | "http_requests_total"
  | "http_request_errors_total"
  | "websocket_connections_total";

const counters: Record<CounterName, number> = {
  http_requests_total: 0,
  http_request_errors_total: 0,
  websocket_connections_total: 0,
};

let websocketConnectionsActive = 0;

const messagesSentByType: Record<"direct" | "group", number> = {
  direct: 0,
  group: 0,
};

const authEventsByType: Record<"login" | "register" | "logout" | "failure", number> = {
  login: 0,
  register: 0,
  logout: 0,
  failure: 0,
};

let otkConsumedTotal = 0;

const retentionDeletedByTable: Record<string, number> = {};

const callEventsByType: Record<"initiated" | "accepted" | "rejected" | "ended" | "missed", number> = {
  initiated: 0,
  accepted: 0,
  rejected: 0,
  ended: 0,
  missed: 0,
};

const attachmentEventsByType: Record<"uploaded" | "downloaded" | "purged", number> = {
  uploaded: 0,
  downloaded: 0,
  purged: 0,
};

let pushNotificationFailuresTotal = 0;

// Cached from /health/ready calls; stale entries are cleared after DEP_HEALTH_CACHE_MS.
let lastDepHealth: { dbOk: boolean; redisOk: boolean; checkedAt: number } | null = null;
const DEP_HEALTH_CACHE_MS = 10_000;

export function cacheDepHealth(dbOk: boolean, redisOk: boolean): void {
  lastDepHealth = { dbOk, redisOk, checkedAt: Date.now() };
}

export function getCachedDepHealth(): { dbOk: boolean; redisOk: boolean } | null {
  if (!lastDepHealth) return null;
  if (Date.now() - lastDepHealth.checkedAt > DEP_HEALTH_CACHE_MS) return null;
  return { dbOk: lastDepHealth.dbOk, redisOk: lastDepHealth.redisOk };
}

export function recordHttpResponse(statusCode: number): void {
  counters.http_requests_total += 1;
  if (statusCode >= 400) {
    counters.http_request_errors_total += 1;
  }
}

export function recordWebSocketConnected(): void {
  counters.websocket_connections_total += 1;
  websocketConnectionsActive += 1;
}

export function recordWebSocketDisconnected(): void {
  websocketConnectionsActive = Math.max(0, websocketConnectionsActive - 1);
}

export function recordMessageSent(type: "direct" | "group"): void {
  messagesSentByType[type] += 1;
}

export function recordAuthEvent(event: "login" | "register" | "logout" | "failure"): void {
  authEventsByType[event] += 1;
}

export function recordOtkConsumed(): void {
  otkConsumedTotal += 1;
}

export function recordRetentionDeleted(table: string, count: number): void {
  if (count <= 0) return;
  retentionDeletedByTable[table] = (retentionDeletedByTable[table] ?? 0) + count;
}

export function recordCallEvent(event: "initiated" | "accepted" | "rejected" | "ended" | "missed"): void {
  callEventsByType[event] += 1;
}

export function recordAttachmentEvent(event: "uploaded" | "downloaded" | "purged"): void {
  attachmentEventsByType[event] += 1;
}

export function recordPushNotificationFailure(): void {
  pushNotificationFailuresTotal += 1;
}

export function renderPrometheusMetrics(health: {
  dbOk: boolean;
  redisOk: boolean;
}): string {
  const lines: string[] = [
    "# HELP seclettr_http_requests_total Total completed HTTP requests.",
    "# TYPE seclettr_http_requests_total counter",
    `seclettr_http_requests_total ${counters.http_requests_total}`,

    "# HELP seclettr_http_request_errors_total Total HTTP requests completed with 4xx/5xx responses.",
    "# TYPE seclettr_http_request_errors_total counter",
    `seclettr_http_request_errors_total ${counters.http_request_errors_total}`,

    "# HELP seclettr_websocket_connections_total Total accepted websocket connections.",
    "# TYPE seclettr_websocket_connections_total counter",
    `seclettr_websocket_connections_total ${counters.websocket_connections_total}`,

    "# HELP seclettr_websocket_connections_active Currently active websocket connections.",
    "# TYPE seclettr_websocket_connections_active gauge",
    `seclettr_websocket_connections_active ${websocketConnectionsActive}`,

    "# HELP seclettr_messages_sent_total Total messages persisted to the server.",
    "# TYPE seclettr_messages_sent_total counter",
    `seclettr_messages_sent_total{type="direct"} ${messagesSentByType.direct}`,
    `seclettr_messages_sent_total{type="group"} ${messagesSentByType.group}`,

    "# HELP seclettr_auth_events_total Authentication lifecycle events.",
    "# TYPE seclettr_auth_events_total counter",
    `seclettr_auth_events_total{event="login"} ${authEventsByType.login}`,
    `seclettr_auth_events_total{event="register"} ${authEventsByType.register}`,
    `seclettr_auth_events_total{event="logout"} ${authEventsByType.logout}`,
    `seclettr_auth_events_total{event="failure"} ${authEventsByType.failure}`,

    "# HELP seclettr_otk_consumed_total One-time prekeys consumed in X3DH key exchanges.",
    "# TYPE seclettr_otk_consumed_total counter",
    `seclettr_otk_consumed_total ${otkConsumedTotal}`,

    "# HELP seclettr_call_events_total Call lifecycle events by outcome.",
    "# TYPE seclettr_call_events_total counter",
    `seclettr_call_events_total{event="initiated"} ${callEventsByType.initiated}`,
    `seclettr_call_events_total{event="accepted"} ${callEventsByType.accepted}`,
    `seclettr_call_events_total{event="rejected"} ${callEventsByType.rejected}`,
    `seclettr_call_events_total{event="ended"} ${callEventsByType.ended}`,
    `seclettr_call_events_total{event="missed"} ${callEventsByType.missed}`,

    "# HELP seclettr_attachment_events_total Attachment lifecycle events.",
    "# TYPE seclettr_attachment_events_total counter",
    `seclettr_attachment_events_total{event="uploaded"} ${attachmentEventsByType.uploaded}`,
    `seclettr_attachment_events_total{event="downloaded"} ${attachmentEventsByType.downloaded}`,
    `seclettr_attachment_events_total{event="purged"} ${attachmentEventsByType.purged}`,

    "# HELP seclettr_push_notification_failures_total Push notifications that failed to deliver.",
    "# TYPE seclettr_push_notification_failures_total counter",
    `seclettr_push_notification_failures_total ${pushNotificationFailuresTotal}`,
  ];

  if (Object.keys(retentionDeletedByTable).length > 0) {
    lines.push(
      "# HELP seclettr_retention_rows_deleted_total Rows removed by the periodic retention job.",
      "# TYPE seclettr_retention_rows_deleted_total counter"
    );
    for (const [table, count] of Object.entries(retentionDeletedByTable)) {
      lines.push(`seclettr_retention_rows_deleted_total{table="${table}"} ${count}`);
    }
  }

  lines.push(
    "# HELP seclettr_api_health Database and Redis readiness probe.",
    "# TYPE seclettr_api_health gauge",
    `seclettr_api_health{dependency="db"} ${health.dbOk ? 1 : 0}`,
    `seclettr_api_health{dependency="redis"} ${health.redisOk ? 1 : 0}`,

    "# HELP seclettr_process_uptime_seconds Node.js process uptime in seconds.",
    "# TYPE seclettr_process_uptime_seconds gauge",
    `seclettr_process_uptime_seconds ${process.uptime()}`,
    ""
  );

  return lines.join("\n");
}
