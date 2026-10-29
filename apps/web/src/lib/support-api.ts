import { MOVELY_API_BASE_URL, MovelyApiError, requestWithCsrf } from "./movely-api";

export const supportTopics = ["General", "PrivacyAccess", "PrivacyCorrection", "PrivacyDeletion"] as const;
export const supportStatuses = ["Open", "InReview", "WaitingForUser", "Resolved", "Cancelled"] as const;
export type SupportTopic = typeof supportTopics[number];
export type SupportStatus = typeof supportStatuses[number];
export type SupportAudience = "owner" | "admin";
export type SupportCapabilities = { requestsEnabled: boolean };
export type SupportSummary = { id: string; type: SupportTopic; subject: string; status: SupportStatus; revisionId: string; createdAt: string; updatedAt: string };
export type SupportEvent = { id: string; clientMutationId: string; sequenceNumber: number; actor: "Owner" | "Support"; kind: "Created" | "Message" | "StatusChanged" | "Cancelled"; body: string | null; previousStatus: SupportStatus | null; status: SupportStatus; revisionId: string; createdAt: string };
export type SupportPage<T> = { items: T[]; page: number; pageSize: number; totalCount: number };
export type SupportDetail = SupportSummary & { clientMutationId: string; history: SupportPage<SupportEvent>; owner?: { id: string; name: string } };
export type SupportSearch = { type?: SupportTopic; status?: SupportStatus; page: number; pageSize: number };
export type SupportCreateInput = { clientMutationId: string; expectedActorUserId: string; type: SupportTopic; subject: string; message: string };
export type SupportCommand = { clientMutationId: string; expectedActorUserId: string; expectedRevisionId: string } & (
  | { kind: "reply"; body: string; status?: Exclude<SupportStatus, "Cancelled"> }
  | { kind: "cancel" }
  | { kind: "status"; status: "InReview" }
);
export type SupportCreateResult = { request: SupportDetail; alreadyCreated: boolean };
export type SupportCommandResult = { request: SupportDetail; alreadyApplied: boolean; eventId: string };
export function parseSupportSearch(params: Record<string, string | string[] | undefined>): { search: SupportSearch; invalid: boolean } {
  const rawType = params.type || undefined, rawStatus = params.status || undefined, rawPage = params.page || "1";
  const validType = !rawType || typeof rawType === "string" && supportTopics.includes(rawType as SupportTopic);
  const validStatus = !rawStatus || typeof rawStatus === "string" && supportStatuses.includes(rawStatus as SupportStatus);
  const validPage = typeof rawPage === "string" && /^[1-9][0-9]{0,7}$/.test(rawPage);
  return { search: { type: validType ? rawType as SupportTopic | undefined : undefined, status: validStatus ? rawStatus as SupportStatus | undefined : undefined, page: validPage ? Number(rawPage) : 1, pageSize: 12 }, invalid: !validType || !validStatus || !validPage };
}
const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : invalidSupportResponse();
const id = (value: unknown): string => typeof value === "string" && guid.test(value) ? value : invalidSupportResponse();
const text = (value: unknown, max: number): string => typeof value === "string" && value.length <= max ? value : invalidSupportResponse();
const date = (value: unknown): string => typeof value === "string" && /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value)) ? value : invalidSupportResponse();
const integer = (value: unknown, minimum = 0): number => typeof value === "number" && Number.isSafeInteger(value) && value >= minimum ? value : invalidSupportResponse();
const boolean = (value: unknown): boolean => typeof value === "boolean" ? value : invalidSupportResponse();
const choice = <T extends string>(value: unknown, choices: readonly T[]): T => choices.includes(value as T) ? value as T : invalidSupportResponse();

function summary(raw: unknown): SupportSummary {
  const value = object(raw);
  return { id: id(value.id), type: choice(value.type, supportTopics), subject: text(value.subject, 160), status: choice(value.status, supportStatuses), revisionId: id(value.revisionId), createdAt: date(value.createdAt), updatedAt: date(value.updatedAt) };
}
function event(raw: unknown): SupportEvent {
  const value = object(raw);
  return { id: id(value.id), clientMutationId: id(value.clientMutationId), sequenceNumber: integer(value.sequenceNumber, 1), actor: choice(value.actor, ["Owner", "Support"]), kind: choice(value.kind, ["Created", "Message", "StatusChanged", "Cancelled"]), body: value.body === null ? null : text(value.body, 4000), previousStatus: value.previousStatus === null ? null : choice(value.previousStatus, supportStatuses), status: choice(value.status, supportStatuses), revisionId: id(value.revisionId), createdAt: date(value.createdAt) };
}
function page<T extends { id: string }>(raw: unknown, parse: (value: unknown) => T): SupportPage<T> {
  const value = object(raw);
  const pageSize = integer(value.pageSize, 1);
  if (pageSize > 50 || !Array.isArray(value.items) || value.items.length > pageSize) invalidSupportResponse();
  const items = value.items.map(parse);
  if (new Set(items.map((item) => item.id.toLowerCase())).size !== items.length) invalidSupportResponse();
  return { items, page: integer(value.page, 1), pageSize, totalCount: integer(value.totalCount) };
}
function detail(raw: unknown, expectedId: string | undefined, audience: SupportAudience): SupportDetail {
  const value = object(raw), result = summary(value);
  if (expectedId && result.id.toLowerCase() !== expectedId.toLowerCase()) invalidSupportResponse();
  const history = page(value.history, event);
  if (new Set(history.items.map((item) => item.sequenceNumber)).size !== history.items.length) invalidSupportResponse();
  const owner = audience === "admin" ? object(value.owner) : null;
  // Owner responses never retain administrative owner identifiers or unrelated private fields.
  return { ...result, clientMutationId: id(value.clientMutationId), history, ...(owner ? { owner: { id: id(owner.id), name: text(owner.name, 300) } } : {}) };
}
function pathFor(audience: SupportAudience) { return audience === "admin" ? "/admin/support/requests" : "/support/requests"; }
function routeId(value: string) { if (!guid.test(value)) throw new MovelyApiError("הפנייה לא נמצאה.", { status: 404, errorCode: "SUPPORT_REQUEST_NOT_FOUND" }); return encodeURIComponent(value); }
function pagination(page: number, pageSize: number) { if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 50) throw new MovelyApiError("מספר העמוד אינו תקין.", { status: 400, errorCode: "INVALID_SUPPORT_QUERY" }); }
export function supportEffectiveCount(value: SupportPage<{ id: string }>) {
  // Counts and pages may straddle concurrent writes. Display a consistent lower bound.
  return value.items.length ? Math.max(value.totalCount, (value.page - 1) * value.pageSize + value.items.length) : value.totalCount;
}

export async function boundedSupportRequest<T>(run: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal, write = false): Promise<T> {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: () => void = () => {};
  const boundary = new Promise<never>((_, reject) => {
    abort = () => { controller.abort(); reject(new DOMException("Aborted", "AbortError")); };
    signal?.addEventListener("abort", abort, { once: true });
    timer = setTimeout(() => { controller.abort(); reject(new MovelyApiError("הפעולה נמשכת זמן רב מדי.", { status: 0, errorCode: write ? "SUPPORT_WRITE_TIMEOUT" : "SUPPORT_READ_TIMEOUT" })); }, write ? 20_000 : 10_000);
  });
  try { return await Promise.race([boundary, run(controller.signal)]); }
  finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); }
}

async function supportRead(path: string, signal?: AbortSignal): Promise<unknown> {
  return boundedSupportRequest(async (inner) => {
    const response = await fetch(`${MOVELY_API_BASE_URL}/api/v1${path}`, { method: "GET", credentials: "include", cache: "no-store", signal: inner });
    if (!response.ok) {
      let code = "SUPPORT_UNAVAILABLE";
      try { const body: unknown = await response.json(); if (body && typeof body === "object" && "errorCode" in body && typeof body.errorCode === "string") code = body.errorCode; } catch { /* Provider text is never displayed. */ }
      throw new MovelyApiError("לא ניתן לטעון את הפניות כרגע.", { status: response.status, errorCode: code });
    }
    try { return await response.json(); } catch { return invalidSupportResponse(); }
  }, signal);
}

function supportWrite(path: string, body: unknown, signal?: AbortSignal) {
  // One deadline includes CSRF acquisition; no mutation is automatically retried.
  return boundedSupportRequest((inner) => requestWithCsrf<unknown>(`/api/v1${path}`, body, "POST", inner), signal, true);
}
function invalidSupportResponse(): never {
  throw new MovelyApiError("לא ניתן לאמת את פרטי הפנייה כרגע.", { status: 0, errorCode: "SUPPORT_INVALID_RESPONSE" });
}

export async function getSupportCapabilities(signal?: AbortSignal): Promise<SupportCapabilities> {
  return { requestsEnabled: boolean(object(await supportRead("/support/capabilities", signal)).requestsEnabled) };
}
export async function getSupportRequests(audience: SupportAudience, search: SupportSearch, signal?: AbortSignal): Promise<SupportPage<SupportSummary>> {
  pagination(search.page, search.pageSize);
  const query = new URLSearchParams({ page: String(search.page), pageSize: String(search.pageSize) });
  if (search.type) query.set("type", choice(search.type, supportTopics));
  if (search.status) query.set("status", choice(search.status, supportStatuses));
  const result = page(await supportRead(`${pathFor(audience)}?${query}`, signal), summary);
  if (result.page !== search.page || result.pageSize !== search.pageSize) invalidSupportResponse();
  return result;
}
export async function getSupportRequest(audience: SupportAudience, requestId: string, historyPage = 1, signal?: AbortSignal): Promise<SupportDetail> {
  pagination(historyPage, 50);
  const result = detail(await supportRead(`${pathFor(audience)}/${routeId(requestId)}?page=${historyPage}&pageSize=50`, signal), requestId, audience);
  if (result.history.page !== historyPage || result.history.pageSize !== 50) invalidSupportResponse();
  return result;
}
export async function findSupportSubmission(clientMutationId: string, signal?: AbortSignal): Promise<SupportDetail | null> {
  try {
    const result = detail(await supportRead(`/support/requests/by-client-mutation/${routeId(clientMutationId)}`, signal), undefined, "owner");
    if (result.clientMutationId.toLowerCase() !== clientMutationId.toLowerCase()) invalidSupportResponse();
    return result;
  } catch (error) {
    if (error instanceof MovelyApiError && error.status === 404 && error.errorCode === "SUPPORT_REQUEST_NOT_FOUND") return null;
    throw error;
  }
}
export async function createSupportRequest(input: SupportCreateInput, signal?: AbortSignal): Promise<SupportCreateResult> {
  routeId(input.clientMutationId); routeId(input.expectedActorUserId);
  const value = object(await supportWrite("/support/requests", input, signal));
  const request = detail(value.request, undefined, "owner");
  if (request.clientMutationId.toLowerCase() !== input.clientMutationId.toLowerCase() || request.type !== input.type || request.subject !== input.subject.trim()) invalidSupportResponse();
  return { request, alreadyCreated: boolean(value.alreadyCreated) };
}
export async function sendSupportCommand(audience: SupportAudience, requestId: string, command: SupportCommand, signal?: AbortSignal): Promise<SupportCommandResult> {
  const requestPath = `${pathFor(audience)}/${routeId(requestId)}`;
  routeId(command.clientMutationId); routeId(command.expectedRevisionId); routeId(command.expectedActorUserId);
  if (audience === "owner" && command.kind === "status" || audience === "admin" && command.kind === "cancel") invalidSupportResponse();
  const { kind, ...body } = command;
  const value = object(await supportWrite(`${requestPath}/${kind === "reply" ? "replies" : kind}`, body, signal));
  const request = detail(value.request, requestId, audience);
  const eventId = id(value.eventId);
  const receipt = request.history.items.find((item) => item.id.toLowerCase() === eventId.toLowerCase());
  if (receipt && !matchesSupportCommandEvent(audience, command, receipt)) invalidSupportResponse();
  const alreadyApplied = boolean(value.alreadyApplied);
  if (!alreadyApplied && request.revisionId.toLowerCase() === command.expectedRevisionId.toLowerCase()) invalidSupportResponse();
  return { request, alreadyApplied, eventId };
}
export function matchesSupportCommandEvent(audience: SupportAudience, command: SupportCommand, receipt: SupportEvent) {
  return receipt.clientMutationId.toLowerCase() === command.clientMutationId.toLowerCase()
    && receipt.actor === (audience === "admin" ? "Support" : "Owner")
    && receipt.kind === (command.kind === "reply" ? "Message" : command.kind === "cancel" ? "Cancelled" : "StatusChanged")
    && (command.kind !== "reply" || receipt.body === command.body.trim())
    && (command.kind !== "cancel" || receipt.status === "Cancelled")
    && (!("status" in command) || !command.status || receipt.status === command.status);
}
