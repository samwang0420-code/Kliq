/**
 * Kliq — 4 个 auth endpoint 集成测试 (§59-2)
 *
 * 用 in-memory mock D1 (Map-based) 测 register / login / logout / me。
 * 真实 D1 通过 `wrangler d1 execute` 验, 见 migrations/0001_initial.sql。
 */

import { beforeEach, describe, expect, it } from "vitest";
import { onRequestPost as registerHandler } from "./register";
import { onRequestPost as loginHandler } from "./login";
import { onRequestPost as logoutHandler } from "./logout";
import { onRequestGet as meHandler } from "./me";
import type { SubscriptionRow, UserRow } from "../_shared/auth";

/* -------------------------------------------------------------------------- */
/*  Mock D1 (Map-based)                                                       */
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

    const selectFirst = (table: string, col: string): Stmt => ({
      bind: (val: unknown) => {
        const t = table.toLowerCase();
        const c = col.toLowerCase();
        return {
          first: <T>() => this.matchWhere(t, c, val).first<T>(),
          run: async () => ({ success: true }),
          all: <T>() => this.matchWhere(t, c, val).all<T>(),
        };
      },
    });

    // SELECT * FROM <table> WHERE <col> = ?1
    const m = upper.match(/^SELECT \* FROM (\w+) WHERE (\w+) =\s*\?1$/);
    if (m && !upper.includes("ORDER BY")) {
      return selectFirst(m[1] ?? "", m[2] ?? "");
    }

    // SELECT * FROM subscriptions WHERE user_id = ?1 ORDER BY started_at DESC LIMIT 1
    if (upper.startsWith("SELECT * FROM SUBSCRIPTIONS WHERE USER_ID =")) {
      return selectFirst("subscriptions", "user_id");
    }

    // SELECT id FROM subscriptions WHERE waffo_session_id = ?1
    if (upper.startsWith("SELECT ID FROM SUBSCRIPTIONS WHERE WAFFO_SESSION_ID")) {
      return selectFirst("subscriptions", "waffo_session_id");
    }

    // DELETE FROM sessions WHERE token_hash = ?1
    if (upper.startsWith("DELETE FROM SESSIONS WHERE TOKEN_HASH")) {
      return {
        bind: (val: unknown) => ({
          first: async <T>() => null as T | null,
          run: async () => {
            const rows = this.tables.get("sessions") ?? [];
            this.tables.set("sessions", rows.filter((r) => r["token_hash"] !== val));
            return { success: true };
          },
          all: async <T>() => ({ results: [] as T[] }),
        }),
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

    // INSERT INTO users ... RETURNING *
    if (upper.startsWith("INSERT INTO USERS") && upper.includes("RETURNING")) {
      return {
        bind: (email: unknown, hash: unknown, salt: unknown, createdAt: unknown, updatedAt: unknown) => ({
          first: async <T>() => {
            const id = ++this.autoinc;
            const row: UserRow = {
              id,
              email: email as string,
              password_hash: hash as string,
              password_salt: salt as string,
              created_at: createdAt as number,
              updated_at: updatedAt as number,
              tier: "free",
            };
            const rows = this.tables.get("users") ?? [];
            rows.push(row as unknown as D1Row);
            this.tables.set("users", rows);
            return row as unknown as T;
          },
          run: async () => ({ success: true }),
          all: async <T>() => ({ results: [] as T[] }),
        }),
      };
    }

    // INSERT INTO sessions ... RETURNING *
    if (upper.startsWith("INSERT INTO SESSIONS") && upper.includes("RETURNING")) {
      return {
        bind: (tokenHash: unknown, userId: unknown, expiresAt: number, createdAt: number) => ({
          first: async <T>() => {
            const row = {
              token_hash: tokenHash as string,
              user_id: userId as number,
              expires_at: expiresAt,
              created_at: createdAt,
            };
            const rows = this.tables.get("sessions") ?? [];
            rows.push(row);
            this.tables.set("sessions", rows);
            return row as unknown as T;
          },
          run: async () => ({ success: true }),
          all: async <T>() => ({ results: [] as T[] }),
        }),
      };
    }

    // INSERT INTO subscriptions ... RETURNING id
    // bind signature matches real upgradeUserToLifetime: (user.id, now, waffoSessionId) — 3 args.
    // 'lifetime' tier is a SQL literal, NOT a bind param.
    if (upper.startsWith("INSERT INTO SUBSCRIPTIONS") && upper.includes("RETURNING")) {
      return {
        bind: (userId: unknown, startedAt: number, waffoSessionId: unknown) => ({
          first: async <T>() => {
            const id = ++this.autoinc;
            const row: SubscriptionRow = {
              id,
              user_id: userId as number,
              tier: "lifetime",
              started_at: startedAt,
              expires_at: null,
              waffo_session_id: waffoSessionId as string,
            };
            const rows = this.tables.get("subscriptions") ?? [];
            rows.push(row as unknown as D1Row);
            this.tables.set("subscriptions", rows);
            return { id } as unknown as T;
          },
          run: async () => ({ success: true }),
          all: async <T>() => ({ results: [] as T[] }),
        }),
      };
    }

    throw new Error(`MockD1.prepare: unimplemented SQL: ${sql}`);
  }
}

function makeRequest(url: string, init: RequestInit = {}): Request {
  return new Request(url, init);
}

async function readJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

/* -------------------------------------------------------------------------- */
/*  Tests                                                                     */
/* -------------------------------------------------------------------------- */

let db: MockD1;
beforeEach(() => {
  db = new MockD1();
});

describe("POST /api/auth/register", () => {
  it("creates user + returns token + session row in DB", async () => {
    const req = makeRequest("https://example.com/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "alice@example.com", password: "hunter2hunter2" }),
    });
    const res = await registerHandler({ request: req, env: { DB: db as unknown as D1Database } });
    expect(res.status).toBe(200);
    const body = await readJson<{ user: UserRow; token: string }>(res);
    expect(body.user.email).toBe("alice@example.com");
    expect(body.user.tier).toBe("free");
    expect(body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("rejects invalid email (400)", async () => {
    const req = makeRequest("https://example.com/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "not-an-email", password: "hunter2hunter2" }),
    });
    const res = await registerHandler({ request: req, env: { DB: db as unknown as D1Database } });
    expect(res.status).toBe(400);
    const body = await readJson<{ error: string }>(res);
    expect(body.error).toBe("invalid_email");
  });

  it("rejects short password (400)", async () => {
    const req = makeRequest("https://example.com/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "alice@example.com", password: "short" }),
    });
    const res = await registerHandler({ request: req, env: { DB: db as unknown as D1Database } });
    expect(res.status).toBe(400);
    const body = await readJson<{ error: string }>(res);
    expect(body.error).toBe("weak_password");
  });

  it("rejects duplicate email (400)", async () => {
    const env = { DB: db as unknown as D1Database };
    const req1 = makeRequest("https://example.com/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "dup@example.com", password: "hunter2hunter2" }),
    });
    await registerHandler({ request: req1, env });
    const req2 = makeRequest("https://example.com/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "dup@example.com", password: "hunter2hunter2" }),
    });
    const res = await registerHandler({ request: req2, env });
    expect(res.status).toBe(400);
    const body = await readJson<{ error: string }>(res);
    expect(body.error).toBe("email_taken");
  });

  it("lowercases email", async () => {
    const req = makeRequest("https://example.com/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "Alice@Example.COM", password: "hunter2hunter2" }),
    });
    const res = await registerHandler({ request: req, env: { DB: db as unknown as D1Database } });
    const body = await readJson<{ user: UserRow }>(res);
    expect(body.user.email).toBe("alice@example.com");
  });
});

describe("POST /api/auth/login", () => {
  async function registerUser(email: string, password: string) {
    const req = makeRequest("https://example.com/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    await registerHandler({ request: req, env: { DB: db as unknown as D1Database } });
  }

  it("logs in with correct password", async () => {
    await registerUser("alice@example.com", "hunter2hunter2");
    const req = makeRequest("https://example.com/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "alice@example.com", password: "hunter2hunter2" }),
    });
    const res = await loginHandler({ request: req, env: { DB: db as unknown as D1Database } });
    expect(res.status).toBe(200);
    const body = await readJson<{ user: UserRow; token: string }>(res);
    expect(body.user.email).toBe("alice@example.com");
    expect(body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("rejects wrong password (401)", async () => {
    await registerUser("alice@example.com", "hunter2hunter2");
    const req = makeRequest("https://example.com/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "alice@example.com", password: "wrong-password" }),
    });
    const res = await loginHandler({ request: req, env: { DB: db as unknown as D1Database } });
    expect(res.status).toBe(401);
  });

  it("rejects unknown email (401, no enumeration)", async () => {
    const req = makeRequest("https://example.com/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "ghost@example.com", password: "hunter2hunter2" }),
    });
    const res = await loginHandler({ request: req, env: { DB: db as unknown as D1Database } });
    expect(res.status).toBe(401);
  });
});

describe("POST /api/auth/logout", () => {
  it("returns 204 and deletes session", async () => {
    const env = { DB: db as unknown as D1Database };
    const regReq = makeRequest("https://example.com/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "alice@example.com", password: "hunter2hunter2" }),
    });
    const regRes = await registerHandler({ request: regReq, env });
    const { token } = await readJson<{ token: string }>(regRes);

    const logoutReq = makeRequest("https://example.com/api/auth/logout", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const logoutRes = await logoutHandler({ request: logoutReq, env });
    expect(logoutRes.status).toBe(204);

    const meReq = makeRequest("https://example.com/api/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const meRes = await meHandler({ request: meReq, env });
    expect(meRes.status).toBe(401);
  });

  it("returns 401 if missing Authorization", async () => {
    const env = { DB: db as unknown as D1Database };
    const req = makeRequest("https://example.com/api/auth/logout", { method: "POST" });
    const res = await logoutHandler({ request: req, env });
    expect(res.status).toBe(401);
  });
});

describe("GET /api/auth/me", () => {
  it("returns user + null subscription for fresh user", async () => {
    const env = { DB: db as unknown as D1Database };
    const regReq = makeRequest("https://example.com/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "alice@example.com", password: "hunter2hunter2" }),
    });
    const regRes = await registerHandler({ request: regReq, env });
    const { token } = await readJson<{ token: string }>(regRes);

    const meReq = makeRequest("https://example.com/api/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const meRes = await meHandler({ request: meReq, env });
    expect(meRes.status).toBe(200);
    const body = await readJson<{ user: UserRow; subscription: SubscriptionRow | null }>(meRes);
    expect(body.user.email).toBe("alice@example.com");
    expect(body.subscription).toBeNull();
  });

  it("returns 401 for invalid token", async () => {
    const req = makeRequest("https://example.com/api/auth/me", {
      headers: { Authorization: "Bearer this-is-not-a-valid-token" },
    });
    const res = await meHandler({ request: req, env: { DB: db as unknown as D1Database } });
    expect(res.status).toBe(401);
  });
});
