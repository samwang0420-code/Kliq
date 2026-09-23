/**
 * Kliq — _shared/auth helpers 单元测试 (§59-2)
 *
 * 不依赖 D1 — 只测 PBKDF2 / session token / 编码 / 校验。
 * D1 集成见 auth-endpoints.test.ts (mock D1)。
 */

import { describe, expect, it } from "vitest";
import {
	bytesToHex,
	generateSessionToken,
	hashPassword,
	hashSessionToken,
	hexToBytes,
	isValidEmail,
	isValidPassword,
	PBKDF2_ITERATIONS,
	verifyPassword,
} from "./auth";

describe("PBKDF2 password hashing", () => {
	it("hashPassword produces 64-hex hash + 32-hex salt", async () => {
 const { hash, salt } = await hashPassword("hunter2hunter2");
  expect(hash).toMatch(/^[0-9a-f]{64}$/);
  expect(salt).toMatch(/^[0-9a-f]{32}$/);
 });

 it("verifyPassword accepts the same password with same salt + hash", async () => {
 const { hash, salt } = await hashPassword("correct-horse-battery-staple");
  const ok = await verifyPassword("correct-horse-battery-staple", salt, hash);
  expect(ok).toBe(true);
 });

 it("verifyPassword rejects wrong password", async () => {
 const { hash, salt } = await hashPassword("hunter2hunter2");
  const ok = await verifyPassword("hunter2hunter3", salt, hash);
  expect(ok).toBe(false);
 });

 it("verifyPassword rejects tampered hash", async () => {
 const { salt } = await hashPassword("hunter2hunter2");
  const ok = await verifyPassword("hunter2hunter2", salt, "00".repeat(32));
  expect(ok).toBe(false);
 });

 it("100k iterations per PBKDF2 spec (constant, not regression)", () => {
  expect(PBKDF2_ITERATIONS).toBe(100_000);
 });

 it("two hashes of same password differ (random salt)", async () => {
 const a = await hashPassword("same-password");
  const b = await hashPassword("same-password");
  expect(a.hash).not.toBe(b.hash);
  expect(a.salt).not.toBe(b.salt);
 });
});

describe("session token generation", () => {
 it("generateSessionToken returns 43 chars URL-safe base64", () => {
 const t = generateSessionToken();
  expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
 });

 it("two consecutive tokens differ", () => {
 const a = generateSessionToken();
  const b = generateSessionToken();
  expect(a).not.toBe(b);
 });

 it("hashSessionToken returns 64-hex sha256", async () => {
 const t = generateSessionToken();
  const h = await hashSessionToken(t);
  expect(h).toMatch(/^[0-9a-f]{64}$/);
 });

 it("hashSessionToken is deterministic for same token", async () => {
 const t = generateSessionToken();
  const a = await hashSessionToken(t);
  const b = await hashSessionToken(t);
  expect(a).toBe(b);
 });
});

describe("encoding", () => {
 it("bytesToHex + hexToBytes roundtrip", () => {
 const arr = new Uint8Array([0, 1, 15, 16, 255]);
  const hex = bytesToHex(arr);
  expect(hex).toBe("00010f10ff");
  const back = hexToBytes(hex);
  expect(Array.from(back)).toEqual([0, 1, 15, 16, 255]);
 });

 it("hexToBytes throws on odd-length input", () => {
 expect(() => hexToBytes("abc")).toThrow();
 });
});

describe("input validation", () => {
 it("isValidEmail accepts standard emails", () => {
 expect(isValidEmail("user@example.com")).toBe(true);
  expect(isValidEmail("u.ser+tag@sub.example.co")).toBe(true);
 });

 it("isValidEmail rejects invalid", () => {
 expect(isValidEmail("")).toBe(false);
  expect(isValidEmail("no-at")).toBe(false);
  expect(isValidEmail("a@b")).toBe(false);
  expect(isValidEmail("a @b.com")).toBe(false);
 });

 it("isValidPassword requires >= 8 chars", () => {
 expect(isValidPassword("12345678").ok).toBe(true);
  expect(isValidPassword("1234567").ok).toBe(false);
  expect(isValidPassword("").ok).toBe(false);
 });

 it("isValidPassword caps at 128 chars", () => {
 expect(isValidPassword("a".repeat(129)).ok).toBe(false);
  expect(isValidPassword("a".repeat(128)).ok).toBe(true);
 });
});
