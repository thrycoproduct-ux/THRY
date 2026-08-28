import {
  buildSupabasePoolerUrl,
  resolveDatabaseUrl,
  resolveSessionDatabaseUrl,
} from "@/lib/supabase/resolve-database-url";

describe("resolveSessionDatabaseUrl", () => {
  it("rewrites transaction pooler port 6543 to session port 5432", () => {
    const txUrl =
      "postgresql://postgres.abc:secret@aws-0-ap-south-1.pooler.supabase.com:6543/postgres";
    expect(resolveSessionDatabaseUrl(txUrl)).toBe(
      "postgresql://postgres.abc:secret@aws-0-ap-south-1.pooler.supabase.com:5432/postgres",
    );
  });

  it("prefers SUPABASE_DB_SESSION_URL override", () => {
    const prev = process.env.SUPABASE_DB_SESSION_URL;
    process.env.SUPABASE_DB_SESSION_URL =
      "postgresql://session-only.example/db";
    try {
      expect(
        resolveSessionDatabaseUrl(
          "postgresql://postgres.abc:secret@aws-0-ap-south-1.pooler.supabase.com:6543/postgres",
        ),
      ).toBe("postgresql://session-only.example/db");
    } finally {
      if (prev === undefined) delete process.env.SUPABASE_DB_SESSION_URL;
      else process.env.SUPABASE_DB_SESSION_URL = prev;
    }
  });

  it("leaves direct non-pooler URLs unchanged", () => {
    const direct = "postgresql://user:pass@localhost:5432/mydb";
    expect(resolveSessionDatabaseUrl(direct)).toBe(direct);
  });
});

describe("resolveDatabaseUrl", () => {
  it("builds pooler URL with default port 6543", () => {
    const url = buildSupabasePoolerUrl({
      projectRef: "abc",
      password: "pw",
    });
    expect(url).toContain(":6543/postgres");
  });
});
