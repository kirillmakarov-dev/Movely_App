import { editContext, editId, nextVersionId } from "@/features/request-flow/published-edit.test-fixtures";
import { buildUpdatePayload, hydrateFromRequest } from "@/features/request-flow/request-form-model";
import { boundedEditRequest, loadPublishedEditContext, savePublishedRequest } from "./published-request-api";
const api = vi.hoisted(() => ({ getCurrentUser: vi.fn(), getAuthCapabilities: vi.fn(), getMoveRequest: vi.fn(), requestWithCsrf: vi.fn() }));
const publication = vi.hoisted(() => vi.fn());
vi.mock("./movely-api", async () => ({ ...await vi.importActual("./movely-api"), ...api }));
vi.mock("./request-publication-api", async () => ({ ...await vi.importActual("./request-publication-api"), getRequestPublicationStatus: publication }));
beforeEach(() => { vi.resetAllMocks(); const context = editContext(); api.getCurrentUser.mockResolvedValue(context.user); api.getAuthCapabilities.mockResolvedValue(context.capabilities); api.getMoveRequest.mockResolvedValue(context.request); publication.mockResolvedValue(context.publication); });
afterEach(() => vi.useRealTimers());

test("read binds owner, request and publication snapshots with an abort signal; canRenew=false does not block editing", async () => {
  const result = await loadPublishedEditContext(editId);
  expect(result).toEqual(editContext()); expect(result.publication.canRenewContactSharing).toBe(false);
  expect(api.getMoveRequest).toHaveBeenCalledExactlyOnceWith(editId, expect.any(AbortSignal)); expect(api.requestWithCsrf).not.toHaveBeenCalled();
});
test.each([null, { ...editContext().user, role: "Mover" }, { ...editContext().user, role: "Admin" }])("unauthenticated/wrong-role viewer cannot read owner snapshot: %j", async (user) => {
  api.getCurrentUser.mockResolvedValue(user); await expect(loadPublishedEditContext(editId)).rejects.toMatchObject({ status: user ? 403 : 401 }); expect(api.getMoveRequest).not.toHaveBeenCalled();
});
test("different owner is access loss, while mismatched response ID or malformed versions are invalid responses", async () => {
  api.getCurrentUser.mockResolvedValue({ ...editContext().user, id: "other" }); await expect(loadPublishedEditContext(editId)).rejects.toMatchObject({ status: 403 });
  api.getCurrentUser.mockResolvedValue(editContext().user);
  for (const request of [null, { ...editContext().request, id: nextVersionId }, { ...editContext().request, currentVersion: null }, { ...editContext().request, status: "FutureStatus" }]) {
    api.getMoveRequest.mockResolvedValue(request); await expect(loadPublishedEditContext(editId)).rejects.toMatchObject({ errorCode: "EDIT_INVALID_RESPONSE" });
  }
});
test.each(["version", "status", "limit"])("concurrent %s mismatch between the two reads is never combined", async (field) => {
  const context = editContext(); if (field === "version") context.publication.currentVersionId = nextVersionId; if (field === "status") context.publication.requestStatus = "Closed"; if (field === "limit") context.publication.maxRecipients = 3;
  publication.mockResolvedValue(context.publication); await expect(loadPublishedEditContext(editId)).rejects.toMatchObject({ status: 409, errorCode: "EDIT_SNAPSHOT_CHANGED" });
});
test("write atomically sends full form with reviewed identity and actual contact limit through shared CSRF", async () => {
  const context = editContext(); const payload = buildUpdatePayload(hydrateFromRequest(context.request), context.request.currentVersion); payload.customerComment = "changed";
  api.requestWithCsrf.mockResolvedValue({ ...context.request, currentVersion: { ...context.request.currentVersion, id: nextVersionId, versionNumber: 4, customerComment: "changed" } });
  const result = await savePublishedRequest(context, payload); expect(result.currentVersion.id).toBe(nextVersionId);
  expect(api.requestWithCsrf).toHaveBeenCalledExactlyOnceWith(`/api/v1/move-requests/${editId}`, { ...payload, expectedCurrentVersionId: context.request.currentVersion.id, contactSharing: { shareContacts: true, maxRecipients: 7, disclosureVersion: context.publication.disclosureVersion } }, "PUT", expect.any(AbortSignal));
});
test.each([null, editContext().request, { ...editContext().request, status: "Closed", currentVersion: { ...editContext().request.currentVersion, id: nextVersionId, versionNumber: 4 } }])("ambiguous successful response never confirms a new version: %j", async (response) => {
  const context = editContext(); api.requestWithCsrf.mockResolvedValue(response);
  await expect(savePublishedRequest(context, buildUpdatePayload(hydrateFromRequest(context.request), context.request.currentVersion))).rejects.toMatchObject({ status: 0, errorCode: "EDIT_INVALID_RESPONSE" });
});
test("ten-second read timeout aborts even a transport ignoring cancellation", async () => {
  vi.useFakeTimers(); api.getCurrentUser.mockImplementation(() => new Promise(() => {})); const pending = loadPublishedEditContext(editId); const assertion = expect(pending).rejects.toMatchObject({ errorCode: "EDIT_READ_TIMEOUT" });
  await vi.advanceTimersByTimeAsync(10_000); await assertion; expect(api.getCurrentUser.mock.calls[0][0].aborted).toBe(true); expect(api.getMoveRequest).not.toHaveBeenCalled();
});
test("twenty-second write boundary includes CSRF and never repeats the mutation", async () => {
  vi.useFakeTimers(); const context = editContext(); api.requestWithCsrf.mockImplementation(() => new Promise(() => {}));
  const pending = savePublishedRequest(context, buildUpdatePayload(hydrateFromRequest(context.request), context.request.currentVersion)); const assertion = expect(pending).rejects.toMatchObject({ errorCode: "PUBLISHED_EDIT_TIMEOUT" });
  await vi.advanceTimersByTimeAsync(20_000); await assertion; expect(api.requestWithCsrf).toHaveBeenCalledTimes(1); expect(api.requestWithCsrf.mock.calls[0][3].aborted).toBe(true);
});
test("caller abort rejects promptly and invalid route never reaches transport", async () => {
  const controller = new AbortController(); const pending = boundedEditRequest(() => new Promise(() => {}), controller.signal); const assertion = expect(pending).rejects.toMatchObject({ name: "AbortError" }); controller.abort(); await assertion;
  await expect(loadPublishedEditContext("../foreign")).rejects.toMatchObject({ status: 404 }); expect(api.getCurrentUser).not.toHaveBeenCalled();
});
