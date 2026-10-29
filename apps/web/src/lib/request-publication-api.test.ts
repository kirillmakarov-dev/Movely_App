import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { publication, acceptedPublication } from "@/features/account/publication.test-fixtures";
import { getRequestPublicationStatus, renewRequestContactSharing } from "./request-publication-api";
import { MOVELY_API_BASE_URL } from "./movely-api";
const csrf = vi.hoisted(() => vi.fn());
vi.mock("./movely-api", async () => ({ ...await vi.importActual("./movely-api"), requestWithCsrf: csrf }));
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const input = { expectedCurrentVersionId: publication.currentVersionId!, contactSharing: { shareContacts: true as const, disclosureVersion: publication.disclosureVersion, maxRecipients: 7 } };
beforeEach(() => vi.resetAllMocks());
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
test("status uses owner endpoint with credentials/no-store and strips unrelated private fields without writing consent", async () => {
  const fetcher = vi.fn().mockResolvedValue(json({ ...publication, phone: "private", objectKey: "private/path", extra: "ignored" })); vi.stubGlobal("fetch", fetcher);
  const result = await getRequestPublicationStatus(publication.requestId.toUpperCase());
  expect(fetcher).toHaveBeenCalledExactlyOnceWith(`${MOVELY_API_BASE_URL}/api/v1/move-requests/${publication.requestId.toUpperCase()}/publication-status`, expect.objectContaining({ method: "GET", credentials: "include", cache: "no-store", signal: expect.any(AbortSignal) }));
  expect(result).toEqual(publication); expect(csrf).not.toHaveBeenCalled();
});
test.each([
  { ...publication, requestId: "cccccccc-1111-4111-8111-111111111111" }, { ...publication, currentVersionId: "wrong" },
  { ...publication, requestStatus: "NewStatus" }, { ...publication, blockers: ["PHONE_NUMBER_PRIVATE"] },
  { ...publication, maxRecipients: null }, { ...publication, maxRecipients: 0 }, { ...publication, requestStatus: "Closed" },
  { ...publication, disclosureVersion: "https://untrusted.test" }, { ...publication, eligibleForMarketplace: true },
])("malformed or contradictory publication status is rejected: %j", async (body) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(body))); await expect(getRequestPublicationStatus(publication.requestId)).rejects.toMatchObject({ errorCode: "PUBLICATION_INVALID_RESPONSE" });
});
test.each([0, -1])("legacy recipient limit %s remains diagnosable when consent is blocked", async (maxRecipients) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ ...publication, maxRecipients, canRenewContactSharing: false, blockers: ["RECIPIENT_LIMIT_INVALID", "CONTACT_SHARING_REQUIRED"] })));
  expect((await getRequestPublicationStatus(publication.requestId)).maxRecipients).toBe(maxRecipients);
});
test.each([401, 403, 404, 429, 503])("HTTP %s is preserved without provider message", async (status) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ errorCode: "UNAVAILABLE", message: "private" }, status)));
  await expect(getRequestPublicationStatus(publication.requestId)).rejects.toMatchObject({ status, message: "לא ניתן לבדוק את מצב הפרסום כרגע." });
});
test("GET deadline and caller cancellation abort the request and reject ignored signals", async () => {
  vi.useFakeTimers(); const fetcher = vi.fn().mockImplementation(() => new Promise(() => {})); vi.stubGlobal("fetch", fetcher);
  const pending = getRequestPublicationStatus(publication.requestId); const assertion = expect(pending).rejects.toMatchObject({ errorCode: "PUBLICATION_STATUS_TIMEOUT" }); await vi.advanceTimersByTimeAsync(10_000); await assertion; expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
  const controller = new AbortController(); const next = getRequestPublicationStatus(publication.requestId, controller.signal); const abort = expect(next).rejects.toMatchObject({ name: "AbortError" }); controller.abort(); await abort;
});
test("renewal sends only the explicitly reviewed version/disclosure/actual limit through shared CSRF", async () => {
  csrf.mockResolvedValue({ publicationStatus: acceptedPublication, alreadyAccepted: true });
  expect(await renewRequestContactSharing(publication.requestId, input)).toEqual({ publicationStatus: acceptedPublication, alreadyAccepted: true });
  expect(csrf).toHaveBeenCalledExactlyOnceWith(`/api/v1/move-requests/${publication.requestId}/contact-sharing`, input, "POST", expect.any(AbortSignal));
});
test.each([null, { publicationStatus: acceptedPublication }, { publicationStatus: { ...acceptedPublication, currentVersionId: "dddddddd-1111-4111-8111-111111111111" }, alreadyAccepted: false }, { publicationStatus: { ...acceptedPublication, maxRecipients: 3 }, alreadyAccepted: false }, { publicationStatus: publication, alreadyAccepted: false }])("ambiguous renewal success is never claimed: %j", async (body) => {
  csrf.mockResolvedValue(body); await expect(renewRequestContactSharing(publication.requestId, input)).rejects.toMatchObject({ status: 0, errorCode: "PUBLICATION_INVALID_RESPONSE" });
});
test("twenty-second write deadline includes CSRF and never retries POST", async () => {
  vi.useFakeTimers(); csrf.mockImplementation(() => new Promise(() => {})); const pending = renewRequestContactSharing(publication.requestId, input); const assertion = expect(pending).rejects.toMatchObject({ errorCode: "CONTACT_SHARING_TIMEOUT" });
  await vi.advanceTimersByTimeAsync(20_000); await assertion; expect(csrf).toHaveBeenCalledTimes(1); expect(csrf.mock.calls[0][3].aborted).toBe(true);
});
test("invalid route IDs cannot reach either transport", async () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  await expect(getRequestPublicationStatus("../owner")).rejects.toMatchObject({ status: 404 }); await expect(renewRequestContactSharing("../owner", input)).rejects.toMatchObject({ status: 404 }); expect(fetcher).not.toHaveBeenCalled(); expect(csrf).not.toHaveBeenCalled();
});
