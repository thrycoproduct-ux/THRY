/** Shared pooler-safe postgres.js options for Supabase transaction mode (6543). */
export function buildPostgresClientOptions(max: number) {
  return {
    prepare: false,
    max,
    // Supavisor transaction mode (6543) cannot pipeline — required with postgres.js.
    max_pipeline: 0,
    idle_timeout: max === 1 ? 20 : 5,
    connect_timeout: 8,
    max_lifetime: max === 1 ? 60 * 30 : 30,
    connection: {
      statement_timeout: 8000,
    },
  } as const;
}
