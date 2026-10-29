import { afterEach, expect, test, vi } from "vitest";
import { detailFixture } from "@/features/marketplace/marketplace.test-fixtures";
import { MOVELY_API_BASE_URL } from "./movely-api";
import { getMarketplaceRequest, getMarketplaceRequests, marketplaceQuery, parseMarketplaceFilters } from "./marketplace-api";
afterEach(() => vi.unstubAllGlobals());
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const filters = parseMarketplaceFilters({});
test("query parsing allowlists values and ignores repeated, invalid, and executable input", () => {
  expect(parseMarketplaceFilters({ requestType: ["ApartmentMove", "SmallMove"], pickupCityCode: "javascript:alert(1)", destinationCityCode: "5000", moveDate: "2026-02-30", sort: "invalid", page: "-1", pageSize: "1000" })).toEqual({ requestType: undefined, pickupCityCode: undefined, destinationCityCode: "5000", moveDate: undefined, budgetBand: undefined, sort: "Newest", page: 1, pageSize: 12 });
});
test("list uses fixed safe API, credentials, no-store and the caller's abort signal; strips noncontract extras", async () => {
  const request = { ...detailFixture, unused: "never rendered" };
  const fetchMock = vi.fn().mockResolvedValue(json({ items: [request], page: 2, pageSize: 12, totalCount: 20 }));
  vi.stubGlobal("fetch", fetchMock);
  const search = parseMarketplaceFilters({ requestType: "ApartmentMove", pickupCityCode: "4000", destinationCityCode: "5000", moveDate: "2026-12-15", budgetBand: "From2000To3000", sort: "MoveDate", page: "2" });
  const controller = new AbortController();
  const result = await getMarketplaceRequests(search, controller.signal);
  expect(fetchMock).toHaveBeenCalledExactlyOnceWith(`${MOVELY_API_BASE_URL}/api/v1/marketplace/requests?${marketplaceQuery(search)}`, expect.objectContaining({ credentials: "include", cache: "no-store", signal: controller.signal }));
  expect(result.items[0]).not.toHaveProperty("unused");
  expect(result.items[0]).not.toHaveProperty("items");
  expect(result.totalCount).toBe(20);
});
test.each([
  null, { ...detailFixture, requestType: "not an enum" }, { ...detailFixture, moveDate: "2026-02-30" }, { ...detailFixture, itemCount: -1 },
  { ...detailFixture, phone: "private" }, { ...detailFixture, pickupCity: { code: "4000", name: "חיפה", exactAddress: "private" } },
  { ...detailFixture, leadSalesStatus: "Closed" }, { ...detailFixture, publishedAt: "yesterday" },
])("malformed or protected card is rejected rather than rendered: %j", async (item) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ items: [item], page: 1, pageSize: 12, totalCount: 1 })));
  await expect(getMarketplaceRequests(filters)).rejects.toMatchObject({ errorCode: "MARKETPLACE_INVALID_RESPONSE" });
});
test.each([401, 403, 404, 429, 503])("HTTP %s retains status but never exposes the backend's message", async (status) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ message: "private data and stack", errorCode: "POLICY_ACCEPTANCE_REQUIRED" }, status)));
  await expect(getMarketplaceRequests(filters)).rejects.toMatchObject({ status, errorCode: "POLICY_ACCEPTANCE_REQUIRED", message: "לא ניתן לטעון את הבקשות כרגע." });
});
test("HTML fallback and wrong page metadata are errors", async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(new Response("<html>app</html>")).mockResolvedValueOnce(json({ items: [], page: 2, pageSize: 12, totalCount: 0 }));
  vi.stubGlobal("fetch", fetchMock);
  await expect(getMarketplaceRequests(filters)).rejects.toMatchObject({ errorCode: "MARKETPLACE_INVALID_RESPONSE" });
  await expect(getMarketplaceRequests(filters)).rejects.toMatchObject({ errorCode: "MARKETPLACE_INVALID_RESPONSE" });
});

test("a concurrent publication can make a valid page larger than the separately read count", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ items: [detailFixture], page: 1, pageSize: 12, totalCount: 0 })));
  const result = await getMarketplaceRequests(filters);
  expect(result.items).toHaveLength(1);
  expect(result.totalCount).toBe(0);
});

test.each([null, -1, 1.5])("invalid count %j is still rejected", async (totalCount) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ items: [detailFixture], page: 1, pageSize: 12, totalCount })));
  await expect(getMarketplaceRequests(filters)).rejects.toMatchObject({ errorCode: "MARKETPLACE_INVALID_RESPONSE" });
});
test("detail projects only typed safe fields and requires the matching request", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ ...detailFixture, items: [{ ...detailFixture.items[0], name: "private free text" }] })));
  const result = await getMarketplaceRequest(detailFixture.id.toUpperCase());
  expect(result.items[0]).not.toHaveProperty("name");
  expect(result.pickupAccess?.floor).toBe(0);
  await expect(getMarketplaceRequest("bbbbbbbb-1111-4111-8111-111111111111")).rejects.toMatchObject({ errorCode: "MARKETPLACE_INVALID_RESPONSE" });
});
test("invalid detail ID never reaches fetch and unknown item enums are rejected", async () => {
  const fetchMock = vi.fn().mockResolvedValue(json({ ...detailFixture, items: [{ ...detailFixture.items[0], apartmentInventoryType: "phone-number" }] }));
  vi.stubGlobal("fetch", fetchMock);
  await expect(getMarketplaceRequest("../../account")).rejects.toMatchObject({ status: 404 });
  expect(fetchMock).not.toHaveBeenCalled();
  await expect(getMarketplaceRequest(detailFixture.id)).rejects.toMatchObject({ errorCode: "MARKETPLACE_INVALID_RESPONSE" });
});
