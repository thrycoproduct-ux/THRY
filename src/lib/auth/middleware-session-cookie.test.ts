import type { NextRequest } from "next/server";
import {
  classifyAuthCookieState,
  classifyAuthCookies,
} from "./middleware-session-cookie";

function makeRequest(cookies: Record<string, string>): NextRequest {
  return {
    cookies: {
      getAll: () =>
        Object.entries(cookies).map(([name, value]) => ({ name, value })),
      get: (name: string) => {
        const value = cookies[name];
        return value ? { name, value } : undefined;
      },
    },
  } as unknown as NextRequest;
}

function encodeSession(session: Record<string, unknown>) {
  return JSON.stringify(session);
}

function makeJwt(payload: Record<string, unknown>) {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = btoa(JSON.stringify(payload))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return `${header}.${body}.signature`;
}

describe("classifyAuthCookieState", () => {
  it("returns absent when no auth cookie exists", () => {
    expect(classifyAuthCookieState(makeRequest({}))).toBe("absent");
  });

  it("returns invalid for malformed session JSON", () => {
    expect(
      classifyAuthCookieState(
        makeRequest({ "sb-test-auth-token": "not-json" }),
      ),
    ).toBe("invalid");
  });

  it("returns invalid when access token is missing sub claim", () => {
    const token = makeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 });
    expect(
      classifyAuthCookieState(
        makeRequest({
          "sb-test-auth-token": encodeSession({ access_token: token }),
        }),
      ),
    ).toBe("invalid");
  });

  it("returns refreshable for a valid access token", () => {
    const token = makeJwt({
      sub: "user-123",
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    expect(
      classifyAuthCookieState(
        makeRequest({
          "sb-test-auth-token": encodeSession({ access_token: token }),
        }),
      ),
    ).toBe("refreshable");
  });

  it("returns refreshable when access token expired but refresh token exists", () => {
    const token = makeJwt({
      sub: "user-123",
      exp: Math.floor(Date.now() / 1000) - 3600,
    });
    expect(
      classifyAuthCookieState(
        makeRequest({
          "sb-test-auth-token": encodeSession({
            access_token: token,
            refresh_token: "refresh-token",
          }),
        }),
      ),
    ).toBe("refreshable");
  });
});

describe("classifyAuthCookies", () => {
  it("returns absent for a signed-out visitor with only unrelated cookies", () => {
    expect(classifyAuthCookies([{ name: "cart", value: "{}" }])).toBe("absent");
  });

  it("returns invalid for an expired token without a refresh token", () => {
    const token = makeJwt({
      sub: "user-123",
      exp: Math.floor(Date.now() / 1000) - 3600,
    });
    expect(
      classifyAuthCookies([
        {
          name: "sb-test-auth-token",
          value: encodeSession({ access_token: token }),
        },
      ]),
    ).toBe("invalid");
  });

  it("reassembles chunked session cookies", () => {
    const value = encodeSession({
      access_token: makeJwt({
        sub: "user-123",
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    });
    const mid = Math.floor(value.length / 2);
    expect(
      classifyAuthCookies([
        { name: "sb-test-auth-token.1", value: value.slice(mid) },
        { name: "sb-test-auth-token.0", value: value.slice(0, mid) },
      ]),
    ).toBe("refreshable");
  });
});
