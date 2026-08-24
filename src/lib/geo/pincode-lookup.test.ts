import {
  mapIndiaPostStateToCatalog,
  normalizePincode,
  parseIndiaPostPincodeResponse,
} from "@/lib/geo/pincode-lookup";

describe("pincode-lookup helpers", () => {
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
});
