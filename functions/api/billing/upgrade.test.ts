/**
 * Kliq — Billing upgrade endpoint tests (§59-4)
 *
 * Mirrors auth-endpoints.test.ts MockD1 pattern. Tests:
 *   - Bridge auth (401/403/500)
 *   - Content-Type / JSON validation
 *   - Triggering events / plan validation
 *   - buyerEmail + sessionId required
 *   - User lookup (404 user_not_found)
 *   - Successful upgrade → tier='lifetime'
 *   - Idempotency on waffo_session_id (same session returns same subscription)
 */

import { beforeEach, describe, expect, it } from "vitest";
import { onRequestPost as upgradeHandler } from "./upgrade";
import { createUser } from "../../_shared/auth";

/* -------------------------------------------------------------------------- */
/*  Mock D1 (Map-based) — same shape as auth-endpoints.test.ts               */
/* -------------------------------------------------------------------------- */

type D1Row = Record<string, unknown>;

type Stmt = {
  bind: (...vals: unknown[]) => {
    first: <T>() => Promise<T | null>;
    run: () => Promise<{ success: boolean }>;
    all: <T>() => Promise<{ results: T[] }>;
  };
};

class MockD1 {
  private tables = new Map<string, D1Row[]>();
  private autoinc = 0;

  private execResult<T>(rows: D1Row[] | null): Promise<T | null> {
    return Promise.resolve((rows?.[0] ?? null) as T | null);
  }

  private matchWhere(
    table: string,
    col: string,
    val: unknown,
  ): { first<T>(): Promise<T | null>; run(): Promise<{ success: boolean }>; all<T>(): Promise<{ results: T[] }> } {
    const rows = this.tables.get(table) ?? [];
    const filtered = rows.filter((r) => r[col] === val);
    return {
      first: <T>() => this.execResult<T>(filtered),
      run: async () => ({ success: true }),
      all: <T>() => Promise.resolve({ results: filtered as T[] }),
    };
  }

  prepare(sql: string): Stmt {
    const upper = sql.trim().toUpperCase();

    // SELECT * FROM users WHERE email = ?1
    const selectByEmail = upper.match(/^SELECT \* FROM USERS WHERE EMAIL =\s*\?1$/);
    if (selectByEmail) {
      return {
        bind: (val: unknown) => ({
          first: <T>() => this.matchWhere("users", "email", val).first<T>(),
          run: async () => ({ success: true }),
          all: <T>() => this.matchWhere("users", "email", val).all<T>(),
        }),
      };
    }

    // SELECT * FROM users WHERE id = ?1
    const selectById = upper.match(/^SELECT \* FROM USERS WHERE ID =\s*\?1$/);
    if (selectById) {
      return {
        bind: (val: unknown) => ({
          first: <T>() => this.matchWhere("users", "id", val).first<T>(),
          run: async () => ({ success: true }),
          all: <T>() => this.matchWhere("users", "id", val).all<T>(),
        }),
      };
    }

    // SELECT id FROM subscriptions WHERE waffo_session_id = ?1
    if (upper.startsWith("SELECT ID FROM SUBSCRIPTIONS WHERE WAFFO_SESSION_ID")) {
      return {
        bind: (val: unknown) => {
          const rows = this.tables.get("subscriptions") ?? [];
          const filtered = rows.filter((r) => r["waffo_session_id"] === val);
          return {
            first: <T>() => this.execResult<T>(filtered),
            run: async () => ({ success: true }),
            all: <T>() => Promise.resolve({ results: filtered as T[] }),
          };
        },
      };
    }

    // UPDATE users SET tier = 'lifetime', updated_at = ?1 WHERE id = ?2
    // bind signature matches real upgradeUserToLifetime: (now, user.id) — 2 args.
    // 'lifetime' tier is a SQL literal, NOT a bind param.
    if (upper.startsWith("UPDATE USERS SET TIER")) {
      return {
        bind: (updatedAt: unknown, id: unknown) => ({
          first: async <T>() => null as T | null,
          run: async () => {
            const rows = this.tables.get("users") ?? [];
            const idx = rows.findIndex((r) => r["id"] === id);
            if (idx >= 0) {
              const row = rows[idx];
              if (row) {
                row["tier"] = "lifetime";
                row["updated_at"] = updatedAt;
              }
            }
            return { success: true };
          },
          all: async <T>() => ({ results: [] as T[] }),
        }),
      };
    }

    // INSERT INTO subscriptions ... RETURNING id
    // bind signature matches real upgradeUserToLifetime: (user.id, now, waffoSessionId) — 3 args
    // 'lifetime' tier is a SQL literal, NOT a bind param.
    if (upper.startsWith("INSERT INTO SUBSCRIPTIONS") && upper.includes("RETURNING")) {
      return {
        bind: (userId: unknown, startedAt: number, waffoSessionId: unknown) => ({
          first: async <T>() => {
            const id = ++this.autoinc;
            const row = {
              id,
              user_id: userId as number,
              tier: "lifetime",
              started_at: startedAt,
              expires_at: null,
              waffo_session_id: waffoSessionId as string,
            };
            const rows = this.tables.get("subscriptions") ?? [];
            rows.push(row);
            this.tables.set("subscriptions", rows);
            return { id } as unknown as T;
          },
          run: async () => ({ success: true }),
          all: async <T>() => ({ results: [] as T[] }),
        }),
      };
    }

    // INSERT INTO users ... RETURNING *
    if (upper.startsWith("INSERT INTO USERS") && upper.includes("RETURNING")) {
      return {
        bind: (email: unknown, hash: unknown, salt: unknown, createdAt: unknown, updatedAt: unknown) => ({
          first: async <T>() => {
            const id = ++this.autoinc;
            const row = {
              id,
              email: email as string,
              password_hash: hash as string,
              password_salt: salt as string,
              created_at: createdAt as number,
              updated_at: updatedAt as number,
              tier: "free",
            };
            const rows = this.tables.get("users") ?? [];
            rows.push(row);
            this.tables.set("users", rows);
            return row as unknown as T;
          },
          run: async () => ({ success: true }),
          all: async <T>() => ({ results: [] as T[] }),
        }),
      };
    }


  }
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

interface TestEnv {
  DB: D1Database;
  KLQ_BILLING_BRIDGE_SECRET?: string;
}

function makeEnv(overrides: Partial<TestEnv> = {}): TestEnv {
  return {
    DB: new MockD1() as unknown as D1Database,
    KLQ_BILLING_BRIDGE_SECRET: "test-bridge-secret",
    ...overrides,
  };
}

function makeRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://example.com/api/billing/upgrade", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-klq-bridge-secret": "test-bridge-secret",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

async function readJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

async function seedUser(db: D1Database, email: string): Promise<{ id: number; email: string }> {
  const now = Date.now();
  const user = await createUser(db, email, "hash", "salt");
  void now; // silence unused
  return { id: user.id, email: user.email };
}

/* -------------------------------------------------------------------------- */
/*  Tests                                                                     */
/* -------------------------------------------------------------------------- */

let env: TestEnv;
beforeEach(() => {
  env = makeEnv();
});

describe("POST /api/billing/upgrade — bridge auth", () => {
  it("returns 500 when bridge secret not configured", async () => {
    const e = makeEnv({ KLQ_BILLING_BRIDGE_SECRET: "" });
    const req = makeRequest({ event: "order.completed", plan: "lifetime", buyerEmail: "x@y.com", sessionId: "s1" });
    const res = await upgradeHandler({ request: req, env: e });
    expect(res.status).toBe(500);
    const body = await readJson<{ error: string }>(res);
    expect(body.error).toBe("bridge_secret_not_configured");
  });

  it("returns 401 when header missing", async () => {
    const req = new Request("https://example.com/api/billing/upgrade", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event: "order.completed", plan: "lifetime", buyerEmail: "x@y.com", sessionId: "s1" }),
    });
    const res = await upgradeHandler({ request: req, env });
    expect(res.status).toBe(401);
    const body = await readJson<{ error: string }>(res);
    expect(body.error).toBe("missing_bridge_secret");
  });

  it("returns 403 when secret wrong", async () => {
    const req = new Request("https://example.com/api/billing/upgrade", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-klq-bridge-secret": "wrong-secret",
      },
      body: JSON.stringify({ event: "order.completed", plan: "lifetime", buyerEmail: "x@y.com", sessionId: "s1" }),
    });
    const res = await upgradeHandler({ request: req, env });
    expect(res.status).toBe(403);
    const body = await readJson<{ error: string }>(res);
    expect(body.error).toBe("invalid_bridge_secret");
  });
});

describe("POST /api/billing/upgrade — content type / json", () => {
  it("returns 415 for non-JSON content type", async () => {
    const req = new Request("https://example.com/api/billing/upgrade", {
      method: "POST",
      headers: {
        "content-type": "text/plain",
        "x-klq-bridge-secret": "test-bridge-secret",
      },
      body: "not json",
    });
    const res = await upgradeHandler({ request: req, env });
    expect(res.status).toBe(415);
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new Request("https://example.com/api/billing/upgrade", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-klq-bridge-secret": "test-bridge-secret",
      },
      body: "this is not json",
    });
    const res = await upgradeHandler({ request: req, env });
    expect(res.status).toBe(400);
    const body = await readJson<{ error: string }>(res);
    expect(body.error).toBe("invalid_json");
  });
});

describe("POST /api/billing/upgrade — payload validation", () => {
  beforeEach(async () => {
    await seedUser(env.DB, "alice@example.com");
  });

  it("returns 400 when event not in triggering set", async () => {
    const req = makeRequest({ event: "unknown.event", plan: "lifetime", buyerEmail: "alice@example.com", sessionId: "s1" });
    const res = await upgradeHandler({ request: req, env });
    expect(res.status).toBe(400);
    const body = await readJson<{ error: string; event: string }>(res);
    expect(body.error).toBe("event_not_triggering");
    expect(body.event).toBe("unknown.event");
  });

  it("returns 400 when plan is not lifetime", async () => {
    const req = makeRequest({ event: "order.completed", plan: "pro_yearly", buyerEmail: "alice@example.com", sessionId: "s1" });
    const res = await upgradeHandler({ request: req, env });
    expect(res.status).toBe(400);
    const body = await readJson<{ error: string; plan: string }>(res);
    expect(body.error).toBe("plan_not_lifetime");
  });

  it("returns 400 when buyerEmail missing", async () => {
    const req = makeRequest({ event: "order.completed", plan: "lifetime", sessionId: "s1" });
    const res = await upgradeHandler({ request: req, env });
    expect(res.status).toBe(400);
    const body = await readJson<{ error: string }>(res);
    expect(body.error).toBe("missing_buyer_email");
  });

  it("returns 400 when sessionId missing", async () => {
    const req = makeRequest({ event: "order.completed", plan: "lifetime", buyerEmail: "alice@example.com" });
    const res = await upgradeHandler({ request: req, env });
    expect(res.status).toBe(400);
    const body = await readJson<{ error: string }>(res);
    expect(body.error).toBe("missing_session_id");
  });

  it("returns 404 when user not in D1", async () => {
    const req = makeRequest({ event: "order.completed", plan: "lifetime", buyerEmail: "ghost@example.com", sessionId: "s1" });
    const res = await upgradeHandler({ request: req, env });
    expect(res.status).toBe(404);
    const body = await readJson<{ error: string }>(res);
    expect(body.error).toBe("user_not_found");
  });
});

describe("POST /api/billing/upgrade — successful upgrade", () => {
  it("upgrades user to lifetime with order.completed event", async () => {
    await seedUser(env.DB, "alice@example.com");
    const req = makeRequest({
      event: "order.completed",
      plan: "lifetime",
      buyerEmail: "alice@example.com",
      sessionId: "waffo_sess_abc123",
    });
    const res = await upgradeHandler({ request: req, env });
    expect(res.status).toBe(200);
    const body = await readJson<{
      ok: boolean;
      subscriptionId: number;
      tier: string;
      user: { tier: string; email: string } | null;
    }>(res);
    expect(body.ok).toBe(true);
    expect(body.tier).toBe("lifetime");
    expect(body.user?.tier).toBe("lifetime");
    expect(body.user?.email).toBe("alice@example.com");
    expect(body.subscriptionId).toBeGreaterThan(0);
  });

  it("upgrades user with subscription.activated event", async () => {
    await seedUser(env.DB, "bob@example.com");
    const req = makeRequest({
      event: "subscription.activated",
      plan: "lifetime",
      buyerEmail: "bob@example.com",
      sessionId: "waffo_sess_xyz789",
    });
    const res = await upgradeHandler({ request: req, env });
    expect(res.status).toBe(200);
    const body = await readJson<{ tier: string }>(res);
    expect(body.tier).toBe("lifetime");
  });

  it("is idempotent on waffo_session_id (returns same subscription)", async () => {
    await seedUser(env.DB, "carol@example.com");
    const payload = {
      event: "order.completed",
      plan: "lifetime",
      buyerEmail: "carol@example.com",
      sessionId: "waffo_sess_idempotent",
    };
    const res1 = await upgradeHandler({ request: makeRequest(payload), env });
    const res2 = await upgradeHandler({ request: makeRequest(payload), env });
    const body1 = await readJson<{ subscriptionId: number }>(res1);
    const body2 = await readJson<{ subscriptionId: number }>(res2);
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(body1.subscriptionId).toBe(body2.subscriptionId);
  });

  it("accepts waffoSessionId as alternative to sessionId", async () => {
    await seedUser(env.DB, "dan@example.com");
    const req = makeRequest({
      event: "order.completed",
      plan: "lifetime",
      buyerEmail: "dan@example.com",
      waffoSessionId: "waffo_sess_dan",
    });
    const res = await upgradeHandler({ request: req, env });
    expect(res.status).toBe(200);
  });
});
