import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { adminBusiness, business, businessInput } from "@/features/businesses/business.test-fixtures";
import { getMyBusiness, getAdminBusiness, getAdminBusinesses, saveBusiness, reviewBusiness, parseBusinessSearch } from "./business-api";
import { MOVELY_API_BASE_URL } from "./movely-api";
const csrf = vi.hoisted(() => vi.fn());
vi.mock("./movely-api", async () => ({ ...await vi.importActual("./movely-api"), requestWithCsrf: csrf }));
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
beforeEach(() => vi.resetAllMocks());
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
test("owner GET uses fixed endpoint, credentials/no-store and projects no admin/private audit fields", async () => {
  const fetcher = vi.fn().mockResolvedValue(json({ ...business, reviews: [{ internalNotes: "secret" }], profileSnapshotJson: "private" })); vi.stubGlobal("fetch", fetcher);
  const controller = new AbortController(); const result = await getMyBusiness(controller.signal);
  expect(fetcher).toHaveBeenCalledWith(`${MOVELY_API_BASE_URL}/api/v1/businesses/me`, expect.objectContaining({ credentials: "include", cache: "no-store", signal: expect.any(AbortSignal) }));
  expect(result).toEqual(business);
});
test.each([401, 403, 503])("owner HTTP %s is not treated as an absent profile and provider messages remain private", async (status) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ errorCode: "LEGAL_NOT_READY", message: "private backend text" }, status)));
  await expect(getMyBusiness()).rejects.toMatchObject({ status, message: "לא ניתן לטעון את פרטי העסק כרגע." });
});
test("only authenticated business-not-found means a new profile; legacy nullable fields are accepted", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json({ errorCode: "BUSINESS_NOT_FOUND" }, 404)).mockResolvedValueOnce(json({ ...business, name: null, registeredAddress: null, registrationNumber: null, representativeName: null, representativeConfirmedAt: null, serviceAreas: [] })));
  expect(await getMyBusiness()).toBeNull(); expect((await getMyBusiness())?.name).toBeNull();
});
test.each([{ ...business, status: "Other" }, { ...business, revisionId: "x" }, { ...business, serviceAreas: [{ code: "script", name: "x" }] }])("malformed owner DTO is rejected", async (body) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(body))); await expect(getMyBusiness()).rejects.toMatchObject({ errorCode: "BUSINESS_INVALID_RESPONSE" });
});
test("create and edit use the shared CSRF helper and preserve explicit revision/consent fields", async () => {
  csrf.mockResolvedValue(business);
  await saveBusiness(businessInput);
  expect(csrf).toHaveBeenCalledWith("/api/v1/businesses", businessInput, "POST", expect.any(AbortSignal));
  const input = { ...businessInput, expectedRevisionId: business.revisionId, acknowledgeReverification: true };
  await saveBusiness(input, business.id);
  expect(csrf).toHaveBeenLastCalledWith("/api/v1/businesses/me", input, "PATCH", expect.any(AbortSignal));
});
test.each([null, { ...business, status: "Verified" }, { ...business, id: "cccccccc-1111-4111-8111-111111111111" }])("ambiguous mutation success is rejected for explicit recovery", async (body) => {
  csrf.mockResolvedValue(body); await expect(saveBusiness(businessInput, business.id)).rejects.toMatchObject({ errorCode: "BUSINESS_INVALID_RESPONSE", status: 0 });
});
test("write timeout covers CSRF and never automatically retries the mutation", async () => {
  vi.useFakeTimers(); csrf.mockImplementation(() => new Promise(() => {}));
  const promise = saveBusiness(businessInput); const assertion = expect(promise).rejects.toMatchObject({ errorCode: "BUSINESS_WRITE_TIMEOUT", status: 0 });
  await vi.advanceTimersByTimeAsync(20_000); await assertion;
  expect(csrf).toHaveBeenCalledTimes(1); expect(csrf.mock.calls[0][3].aborted).toBe(true);
});
test("read timeout and caller abort stop the bounded request", async () => {
  vi.useFakeTimers(); const fetcher = vi.fn().mockImplementation(() => new Promise(() => {})); vi.stubGlobal("fetch", fetcher);
  const promise = getMyBusiness(); const assertion = expect(promise).rejects.toMatchObject({ errorCode: "BUSINESS_READ_TIMEOUT" });
  await vi.advanceTimersByTimeAsync(10_000); await assertion; expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
  const controller = new AbortController(); const aborted = getMyBusiness(controller.signal); const abortedAssertion = expect(aborted).rejects.toMatchObject({ name: "AbortError" }); controller.abort(); await abortedAssertion;
});
test("admin filters sanitize input and list metadata/IDs are validated without brittle count invariants", async () => {
  expect(parseBusinessSearch({ status: ["Verified"], page: "-1", pageSize: "999" })).toEqual({ status: undefined, page: 1, pageSize: 12 });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ items: [business], page: 1, pageSize: 12, totalCount: 0 })));
  expect((await getAdminBusinesses(parseBusinessSearch({}))).items[0]).not.toHaveProperty("registrationNumber");
});
test("admin detail requires the requested ID and strips raw snapshots", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ ...adminBusiness, profileSnapshotJson: "secret" })));
  expect(await getAdminBusiness(business.id)).toEqual(adminBusiness);
  await expect(getAdminBusiness("cccccccc-1111-4111-8111-111111111111")).rejects.toMatchObject({ errorCode: "BUSINESS_INVALID_RESPONSE" });
});
test("review POST is explicit and successful response must match the decision", async () => {
  const input = { expectedRevisionId: business.revisionId, decision: "Verify" as const, ownerMessage: "", internalNotes: "בדיקה ידנית הושלמה", registryChecked: true, representativeChecked: true };
  csrf.mockResolvedValue({ ...adminBusiness, status: "Verified" });
  expect((await reviewBusiness(business.id, input)).status).toBe("Verified");
  expect(csrf).toHaveBeenCalledExactlyOnceWith(`/api/v1/admin/businesses/${business.id}/reviews`, input, "POST", expect.any(AbortSignal));
  csrf.mockResolvedValue(adminBusiness); await expect(reviewBusiness(business.id, input)).rejects.toMatchObject({ errorCode: "BUSINESS_INVALID_RESPONSE" });
});
