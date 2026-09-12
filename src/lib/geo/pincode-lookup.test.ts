import {
  clearPincodeR2MemoryCache,
  getLocalPincodeOverrides,
  lookupPincodeInDirectoryMap,
  mapIndiaPostStateToCatalog,
  normalizePincode,
  parseIndiaPostPincodeResponse,
  parsePincodeDirectoryEntry,
  pincodeShardObjectKey,
  resolvePincode,
} from "@/lib/geo/pincode-lookup";

describe("pincode-lookup helpers", () => {
  afterEach(() => {
    clearPincodeR2MemoryCache();
  });

  it("normalizes and validates 6-digit pins", () => {
    expect(normalizePincode("560 001")).toBe("560001");
    expect(normalizePincode("12345")).toBeNull();
    expect(normalizePincode("abcdef")).toBeNull();
  });

  it("maps India Post / GST former names to ISO catalog labels", () => {
    expect(mapIndiaPostStateToCatalog("Orissa")).toBe("Odisha");
    expect(mapIndiaPostStateToCatalog("NCT of Delhi")).toBe("Delhi");
    expect(mapIndiaPostStateToCatalog("Tamilnadu")).toBe("Tamil Nadu");
    expect(mapIndiaPostStateToCatalog("Chattisgarh")).toBe("Chhattisgarh");
    expect(mapIndiaPostStateToCatalog("Pondicherry")).toBe("Puducherry");
    expect(mapIndiaPostStateToCatalog("Uttaranchal")).toBe("Uttarakhand");
    expect(mapIndiaPostStateToCatalog("Andaman & Nicobar")).toBe(
      "Andaman and Nicobar Islands",
    );
    expect(mapIndiaPostStateToCatalog("Dadra & Nagar Haveli")).toBe(
      "Dadra and Nagar Haveli and Daman and Diu",
    );
    expect(mapIndiaPostStateToCatalog("Daman & Diu")).toBe(
      "Dadra and Nagar Haveli and Daman and Diu",
    );
    expect(mapIndiaPostStateToCatalog("Jammu & Kashmir")).toBe(
      "Jammu and Kashmir",
    );
    expect(mapIndiaPostStateToCatalog("Unknownland")).toBeNull();
  });

  it("parses successful India Post payloads", () => {
    const result = parseIndiaPostPincodeResponse("600001", [
      {
        Status: "Success",
        PostOffice: [
          {
            Name: "Chennai GPO",
            District: "Chennai",
            State: "Tamil Nadu",
          },
          {
            Name: "Flower Bazaar",
            District: "Chennai",
            State: "Tamil Nadu",
          },
        ],
      },
    ]);

    expect(result).toEqual({
      pin: "600001",
      state: "Tamil Nadu",
      district: "Chennai",
      city: "Chennai",
      areas: ["Chennai GPO", "Flower Bazaar"],
      localities: [
        {
          name: "Chennai GPO",
          district: "Chennai",
          state: "Tamil Nadu",
        },
        {
          name: "Flower Bazaar",
          district: "Chennai",
          state: "Tamil Nadu",
        },
      ],
    });
  });

  it("rejects failed India Post payloads", () => {
    expect(
      parseIndiaPostPincodeResponse("000000", [
        { Status: "Error", PostOffice: null },
      ]),
    ).toBeNull();
  });

  it("accepts 493221 when India Post spells the state Chattisgarh", () => {
    const result = parseIndiaPostPincodeResponse("493221", [
      {
        Status: "Success",
        PostOffice: [
          {
            Name: "Birgaon",
            District: "Raipur",
            State: "Chattisgarh",
          },
        ],
      },
    ]);

    expect(result?.pin).toBe("493221");
    expect(result?.state).toBe("Chhattisgarh");
    expect(result?.district).toBe("Raipur");
    expect(result?.areas).toEqual(["Birgaon"]);
  });

  it("accepts Andaman PINs when India Post omits Islands", () => {
    const result = parseIndiaPostPincodeResponse("744101", [
      {
        Status: "Success",
        PostOffice: [
          {
            Name: "Marine Jetty",
            District: "South Andaman",
            State: "Andaman & Nicobar",
          },
        ],
      },
    ]);

    expect(result?.state).toBe("Andaman and Nicobar Islands");
  });

  it("maps Leh/Kargil PINs to Ladakh even when India Post still says J&K", () => {
    const result = parseIndiaPostPincodeResponse("194101", [
      {
        Status: "Success",
        PostOffice: [
          {
            Name: "Bazgo",
            District: "Leh",
            State: "Jammu & Kashmir",
          },
        ],
      },
    ]);

    expect(result?.state).toBe("Ladakh");
    expect(result?.district).toBe("Leh");
  });

  it("builds R2 shard object keys from the first three digits", () => {
    expect(pincodeShardObjectKey("560111")).toBe("geo/pincode/560.json");
  });

  it("parses R2 directory entries into catalog results", () => {
    const result = parsePincodeDirectoryEntry("560111", {
      state: "Karnataka",
      district: "Bengaluru Urban",
      office: "Kumaraswamy Layout S.O",
    });

    expect(result).toEqual({
      pin: "560111",
      state: "Karnataka",
      district: "Bengaluru Urban",
      city: "Bengaluru Urban",
      areas: ["Kumaraswamy Layout S.O"],
      localities: [
        {
          name: "Kumaraswamy Layout S.O",
          district: "Bengaluru Urban",
          state: "Karnataka",
        },
      ],
    });
  });

  it("looks up pins in a directory map and seeds 560111 locally", () => {
    const map = {
      "110001": {
        state: "Delhi",
        district: "Central Delhi",
        office: "Connaught Place",
      },
    };
    expect(lookupPincodeInDirectoryMap("110001", map)?.state).toBe("Delhi");
    expect(lookupPincodeInDirectoryMap("999999", map)).toBeNull();

    const seed = getLocalPincodeOverrides();
    expect(seed["560111"]?.state).toBe("Karnataka");
    expect(lookupPincodeInDirectoryMap("560111", seed)?.state).toBe(
      "Karnataka",
    );
  });

  it("uses R2 when India Post misses (560111 → Karnataka)", async () => {
    const result = await resolvePincode("560111", {
      lookupIndiaPost: async () => null,
      lookupR2: async (pin) =>
        lookupPincodeInDirectoryMap(pin, getLocalPincodeOverrides()),
    });

    expect(result?.pin).toBe("560111");
    expect(result?.state).toBe("Karnataka");
    expect(result?.district).toBe("Bengaluru Urban");
    expect(result?.areas).toContain("Kumaraswamy Layout S.O");
  });

  it("skips R2 when India Post succeeds", async () => {
    const r2 = jest.fn(async () => {
      throw new Error("R2 should not be called");
    });
    const result = await resolvePincode("600001", {
      lookupIndiaPost: async () =>
        parseIndiaPostPincodeResponse("600001", [
          {
            Status: "Success",
            PostOffice: [
              {
                Name: "Chennai GPO",
                District: "Chennai",
                State: "Tamil Nadu",
              },
            ],
          },
        ]),
      lookupR2: r2,
    });

    expect(result?.state).toBe("Tamil Nadu");
    expect(r2).not.toHaveBeenCalled();
  });

  it("lets overrides win over a conflicting R2 shard inject", async () => {
    const overrideResult = parsePincodeDirectoryEntry("560111", {
      state: "Karnataka",
      district: "Bengaluru Urban",
      office: "Kumaraswamy Layout S.O",
    });
    const result = await resolvePincode("560111", {
      lookupIndiaPost: async () => null,
      lookupR2: async () => overrideResult,
    });
    expect(result?.state).toBe("Karnataka");
    expect(result?.areas[0]).toBe("Kumaraswamy Layout S.O");
  });

  it("tries R2 first when primary is r2", async () => {
    const indiaPost = jest.fn(async () => null);
    const result = await resolvePincode("560111", {
      primary: "r2",
      lookupIndiaPost: indiaPost,
      lookupR2: async (pin) =>
        lookupPincodeInDirectoryMap(pin, getLocalPincodeOverrides()),
    });
    expect(result?.state).toBe("Karnataka");
    expect(indiaPost).not.toHaveBeenCalled();
  });
});
