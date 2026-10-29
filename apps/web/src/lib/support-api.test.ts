import { MOVELY_API_BASE_URL } from "./movely-api";
import { createSupportRequest, findSupportSubmission, getSupportCapabilities, getSupportRequest, getSupportRequests, parseSupportSearch, sendSupportCommand, supportEffectiveCount, type SupportCommand, type SupportCreateInput } from "./support-api";
import { mutationId, nextSupportRevision, supportDetail, supportEvent, supportId, supportOwnerId, supportRevision } from "@/features/support/support.test-fixtures";
const csrf = vi.hoisted(() => vi.fn());
vi.mock("./movely-api", async () => ({ ...await vi.importActual("./movely-api"), requestWithCsrf: csrf }));
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const create: SupportCreateInput = { clientMutationId: mutationId, expectedActorUserId: supportOwnerId, type: "PrivacyDeletion", subject: supportDetail().subject, message: "מידע פרטי בפנייה" };
const command: SupportCommand = { clientMutationId: mutationId, expectedActorUserId: supportOwnerId, expectedRevisionId: supportRevision, kind: "reply", body: "תשובה חדשה" };
beforeEach(() => vi.resetAllMocks()); afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

test("capability is explicit and defaults cannot be inferred from malformed responses", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json({ requestsEnabled: false, secret: "ignored" })).mockResolvedValueOnce(json({ requestsEnabled: "false" })));
  expect(await getSupportCapabilities()).toEqual({ requestsEnabled: false }); await expect(getSupportCapabilities()).rejects.toMatchObject({ errorCode: "SUPPORT_INVALID_RESPONSE" });
});
test("owner reads include credentials/no-store and strip admin/private extras", async () => {
  const fetcher = vi.fn().mockResolvedValue(json({ ...supportDetail(true), email: "private@example.com", internalNotes: "private", objectKey: "secret/path" })); vi.stubGlobal("fetch", fetcher);
  const result = await getSupportRequest("owner", supportId);
  expect(fetcher).toHaveBeenCalledExactlyOnceWith(`${MOVELY_API_BASE_URL}/api/v1/support/requests/${supportId}?page=1&pageSize=50`, expect.objectContaining({ method: "GET", cache: "no-store", credentials: "include", signal: expect.any(AbortSignal) }));
  expect(result).toEqual(supportDetail()); expect(result).not.toHaveProperty("owner"); expect(result).not.toHaveProperty("internalNotes"); expect(csrf).not.toHaveBeenCalled();
});
test("admin reads use isolated route and only the two declared owner identity fields", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ ...supportDetail(true), owner: { id: supportOwnerId, name: "נועה לוי", phone: "private", email: "private" } })));
  expect((await getSupportRequest("admin", supportId)).owner).toEqual({ id: supportOwnerId, name: "נועה לוי" });
});
test("two actors may share a mutation UUID; event IDs and sequence numbers stay unique", async () => {
  const value = supportDetail(); value.history.items.push({ ...supportEvent(), id: nextSupportRevision, sequenceNumber: 2, actor: "Support", kind: "Message" }); value.history.totalCount = 2;
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(value))); expect((await getSupportRequest("owner", supportId)).history.items).toHaveLength(2);
});
test.each([
  { ...supportDetail(), id: nextSupportRevision }, { ...supportDetail(), type: "Unexpected" }, { ...supportDetail(), status: "Deleted" },
  { ...supportDetail(), revisionId: "not-id" }, { ...supportDetail(), createdAt: "not-date" },
  { ...supportDetail(), history: { ...supportDetail().history, items: [supportEvent(), supportEvent()] } },
  { ...supportDetail(), history: { ...supportDetail().history, totalCount: -1 } },
])("invalid identity/enums/history are rejected: %j", async (value) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(value))); await expect(getSupportRequest("owner", supportId)).rejects.toMatchObject({ errorCode: "SUPPORT_INVALID_RESPONSE" });
});
test("list sends real filters and accepts approximate count under concurrent writes", async () => {
  const fetcher = vi.fn().mockResolvedValue(json({ items: [supportDetail()], page: 2, pageSize: 12, totalCount: 0 })); vi.stubGlobal("fetch", fetcher);
  const result = await getSupportRequests("owner", { type: "PrivacyAccess", status: "WaitingForUser", page: 2, pageSize: 12 });
  expect(fetcher.mock.calls[0][0]).toContain("page=2&pageSize=12&type=PrivacyAccess&status=WaitingForUser"); expect(supportEffectiveCount(result)).toBe(13);
});
test.each([401, 403, 404, 429, 503])("read HTTP%s is preserved without provider message", async (status) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ errorCode: "SUPPORT_UNAVAILABLE", message: "private stack" }, status))); await expect(getSupportRequest("owner", supportId)).rejects.toMatchObject({ status, message: "לא ניתן לטעון את הפניות כרגע." });
});
test("create sends frozen actor and mutation identities with only intended body; duplicate receipt is accepted", async () => {
  csrf.mockResolvedValue({ request: supportDetail(), alreadyCreated: true }); expect(await createSupportRequest(create)).toMatchObject({ alreadyCreated: true });
  expect(csrf).toHaveBeenCalledExactlyOnceWith("/api/v1/support/requests", create, "POST", expect.any(AbortSignal));
});
test("create response cannot claim another intent or changed subject", async () => {
  for (const request of [{ ...supportDetail(), clientMutationId: nextSupportRevision }, { ...supportDetail(), subject: "different" }, { ...supportDetail(), type: "General" }]) {
    csrf.mockResolvedValue({ request, alreadyCreated: false }); await expect(createSupportRequest(create)).rejects.toMatchObject({ errorCode: "SUPPORT_INVALID_RESPONSE" });
  }
});
test("creation lookup is owner scoped; scoped404 is not a definitive failure and a different token is invalid", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(json(supportDetail())).mockResolvedValueOnce(json({ errorCode: "SUPPORT_REQUEST_NOT_FOUND" }, 404)).mockResolvedValueOnce(json({ ...supportDetail(), clientMutationId: nextSupportRevision })); vi.stubGlobal("fetch", fetcher);
  expect((await findSupportSubmission(mutationId))?.id).toBe(supportId); expect(fetcher.mock.calls[0][0]).toContain(`/support/requests/by-client-mutation/${mutationId}`);
  expect(await findSupportSubmission(mutationId)).toBeNull(); await expect(findSupportSubmission(mutationId)).rejects.toMatchObject({ errorCode: "SUPPORT_INVALID_RESPONSE" });
});
test("command posts expected actor/revision and validates event receipt rather than trusting any same-UUID history entry", async () => {
  const event = { ...supportEvent(), id: nextSupportRevision, kind: "Message", body: command.body, revisionId: nextSupportRevision };
  const request = { ...supportDetail(), revisionId: nextSupportRevision, history: { ...supportDetail().history, items: [event] } };
  csrf.mockResolvedValue({ request, alreadyApplied: false, eventId: event.id }); await sendSupportCommand("owner", supportId, command);
  expect(csrf.mock.calls[0]).toEqual([`/api/v1/support/requests/${supportId}/replies`, { clientMutationId: mutationId, expectedActorUserId: supportOwnerId, expectedRevisionId: supportRevision, body: "תשובה חדשה" }, "POST", expect.any(AbortSignal)]);
  csrf.mockResolvedValue({ request: { ...request, history: { ...request.history, items: [{ ...event, actor: "Support" }] } }, alreadyApplied: true, eventId: event.id });
  await expect(sendSupportCommand("owner", supportId, command)).rejects.toMatchObject({ errorCode: "SUPPORT_INVALID_RESPONSE" });
});
test("later state is allowed on alreadyApplied receipt, but a fresh write needs a new revision", async () => {
  csrf.mockResolvedValue({ request: supportDetail(), alreadyApplied: false, eventId: nextSupportRevision }); await expect(sendSupportCommand("owner", supportId, command)).rejects.toMatchObject({ errorCode: "SUPPORT_INVALID_RESPONSE" });
  csrf.mockResolvedValue({ request: { ...supportDetail(), status: "Resolved", history: { ...supportDetail().history, items: [] } }, alreadyApplied: true, eventId: nextSupportRevision }); expect((await sendSupportCommand("owner", supportId, command)).alreadyApplied).toBe(true);
});
test("ten-second read and twenty-second CSRF/write deadlines abort and never replay", async () => {
  vi.useFakeTimers(); const fetcher = vi.fn().mockImplementation(() => new Promise(() => {})); vi.stubGlobal("fetch", fetcher);
  const read = getSupportCapabilities(); const readAssertion = expect(read).rejects.toMatchObject({ errorCode: "SUPPORT_READ_TIMEOUT" }); await vi.advanceTimersByTimeAsync(10_000); await readAssertion; expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
  csrf.mockImplementation(() => new Promise(() => {})); const write = createSupportRequest(create); const writeAssertion = expect(write).rejects.toMatchObject({ errorCode: "SUPPORT_WRITE_TIMEOUT" }); await vi.advanceTimersByTimeAsync(20_000); await writeAssertion; expect(csrf).toHaveBeenCalledTimes(1); expect(csrf.mock.calls[0][3].aborted).toBe(true);
});
test("invalid routes, caller abort and malformed URL filters fail safely", async () => {
  const fetcher = vi.fn().mockImplementation(() => new Promise(() => {})); vi.stubGlobal("fetch", fetcher);
  await expect(getSupportRequest("owner", "../private")).rejects.toMatchObject({ status: 404 }); expect(fetcher).not.toHaveBeenCalled();
  const controller = new AbortController(); const pending = getSupportCapabilities(controller.signal); const assertion = expect(pending).rejects.toMatchObject({ name: "AbortError" }); controller.abort(); await assertion;
  expect(parseSupportSearch({ type: ["General", "PrivacyAccess"] }).invalid).toBe(true); expect(parseSupportSearch({ status: "Deleted" }).invalid).toBe(true); expect(parseSupportSearch({ page: "0" }).invalid).toBe(true); expect(parseSupportSearch({ type: "", status: "", page: "2" })).toEqual({ invalid: false, search: { type: undefined, status: undefined, page: 2, pageSize: 12 } });
});
