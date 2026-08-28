import { buildPostgresClientOptions } from "@/lib/supabase/postgres-client-options";

describe("buildPostgresClientOptions", () => {
  it("disables prepared statements and pipelining for Supabase pooler", () => {
    const options = buildPostgresClientOptions(1);
    expect(options.prepare).toBe(false);
    expect(options.max_pipeline).toBe(0);
    expect(options.max).toBe(1);
  });

  it("uses one connection on Workers request pools", () => {
    expect(buildPostgresClientOptions(1).max).toBe(1);
  });
});
