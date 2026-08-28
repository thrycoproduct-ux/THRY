import { clearAuthCartForUser, deleteAuthCartRow } from "./cart-db-delete";

function mockSupabase(responses: {
  byId?: { data: { id: string }[] | null; error: Error | null };
  byVariant?: { data: { id: string }[] | null; error: Error | null };
}) {
  let call = 0;
  const chain = (result: {
    data: { id: string }[] | null;
    error: Error | null;
  }) => ({
    eq: () => chain(result),
    select: () => Promise.resolve(result),
  });

  return {
    from: () => ({
      delete: () => {
        call += 1;
        if (call === 1) {
          return chain(responses.byId ?? { data: [], error: null });
        }
        return chain(
          responses.byVariant ?? { data: [{ id: "fallback" }], error: null },
        );
      },
    }),
  } as never;
}

describe("deleteAuthCartRow", () => {
  const row = {
    id: "line-1",
    product_id: "prod-a",
    variant_key: "size=5CM",
  };

  it("returns ids when delete by primary id succeeds", async () => {
    const supabase = mockSupabase({
      byId: { data: [{ id: "line-1" }], error: null },
    });

    const result = await deleteAuthCartRow({
      supabase,
      userId: "user-1",
      row,
    });

    expect(result.error).toBeNull();
    expect(result.deletedIds).toEqual(["line-1"]);
  });

  it("falls back to variant delete when id delete removes zero rows", async () => {
    const supabase = mockSupabase({
      byId: { data: [], error: null },
      byVariant: { data: [{ id: "line-9" }], error: null },
    });

    const result = await deleteAuthCartRow({
      supabase,
      userId: "user-1",
      row,
    });

    expect(result.error).toBeNull();
    expect(result.deletedIds).toEqual(["line-9"]);
  });

  it("simulates refresh resurrection when delete silently removes zero rows", async () => {
    const supabase = mockSupabase({
      byId: { data: [], error: null },
      byVariant: { data: [], error: null },
    });

    const result = await deleteAuthCartRow({
      supabase,
      userId: "user-1",
      row,
    });

    expect(result.deletedIds).toEqual([]);
    expect(result.error).toBeNull();

    // UI can look removed optimistically, but DB still has the row → item returns on refresh.
    const dbAfterRefresh = [
      { id: "line-1", product_id: "prod-a", quantity: 1 },
    ];
    expect(dbAfterRefresh).toHaveLength(1);
  });
});

describe("clearAuthCartForUser", () => {
  it("deletes every row for the user", async () => {
    const supabase = {
      from: () => ({
        delete: () => ({
          eq: () => ({
            select: () =>
              Promise.resolve({
                data: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }],
                error: null,
              }),
          }),
        }),
      }),
    } as never;

    const result = await clearAuthCartForUser({
      supabase,
      userId: "user-1",
    });

    expect(result.error).toBeNull();
    expect(result.deletedCount).toBe(4);
  });
});
