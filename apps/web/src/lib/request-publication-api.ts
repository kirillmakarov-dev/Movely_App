import { MOVELY_API_BASE_URL, MovelyApiError, requestWithCsrf, type MoveRequestStatus, type LeadSalesStatus } from "./movely-api";
export const publicationBlockers = ["REQUEST_NOT_ACTIVE", "SALES_UNAVAILABLE", "PUBLICATION_MISSING", "RECIPIENT_LIMIT_INVALID", "CUSTOMER_NOT_ELIGIBLE", "PHONE_NOT_VERIFIED", "POLICY_ACCEPTANCE_REQUIRED", "LEGAL_NOT_READY", "REQUEST_VERSION_INVALID", "MOVE_DATE_INVALID", "REQUEST_INCOMPLETE", "CONTACT_SHARING_REQUIRED", "CONTACT_SHARING_HISTORY_CONFLICT"] as const;
export type PublicationBlocker = typeof publicationBlockers[number];
export type RequestPublicationStatus = { requestId: string; currentVersionId: string | null; requestStatus: MoveRequestStatus; leadSalesStatus: LeadSalesStatus; maxRecipients: number; disclosureVersion: string; isTestOnly: boolean; checkedAt: string; eligibleForMarketplace: boolean; hasCurrentContactSharing: boolean; contactSharingAcceptedAt: string | null; canRenewContactSharing: boolean; blockers: PublicationBlocker[] };
export type RenewContactSharingInput = { expectedCurrentVersionId: string; contactSharing: { shareContacts: true; disclosureVersion: string; maxRecipients: number } };
export type RenewContactSharingResult = { publicationStatus: RequestPublicationStatus; alreadyAccepted: boolean };
const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function invalid(): never { throw new MovelyApiError("לא ניתן לקרוא את מצב הפרסום כרגע.", { status: 0, errorCode: "PUBLICATION_INVALID_RESPONSE" }); }
function object(v: unknown): Record<string, unknown> { return v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : invalid(); }
function id(v: unknown): string { return typeof v === "string" && guid.test(v) ? v : invalid(); }
function boolean(v: unknown): boolean { return typeof v === "boolean" ? v : invalid(); }
function date(v: unknown): string { return typeof v === "string" && /^\d{4}-\d\d-\d\dT/.test(v) && Number.isFinite(Date.parse(v)) ? v : invalid(); }
function choice<T extends string>(v: unknown, values: readonly T[]): T { return values.includes(v as T) ? v as T : invalid(); }
function status(value: unknown, requestId: string): RequestPublicationStatus {
  const r = object(value);
  if (id(r.requestId).toLowerCase() !== requestId.toLowerCase() || !Array.isArray(r.blockers) || r.blockers.length > publicationBlockers.length || typeof r.maxRecipients !== "number" || !Number.isSafeInteger(r.maxRecipients)
    || typeof r.disclosureVersion !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(r.disclosureVersion)) invalid();
  const result: RequestPublicationStatus = { requestId: id(r.requestId), currentVersionId: r.currentVersionId === null ? null : id(r.currentVersionId), requestStatus: choice(r.requestStatus, ["Draft", "Published", "Active", "Closed", "Cancelled", "Expired"]), leadSalesStatus: choice(r.leadSalesStatus, ["Available", "SoldOut", "Closed"]), maxRecipients: r.maxRecipients, disclosureVersion: r.disclosureVersion, isTestOnly: boolean(r.isTestOnly), checkedAt: date(r.checkedAt), eligibleForMarketplace: boolean(r.eligibleForMarketplace), hasCurrentContactSharing: boolean(r.hasCurrentContactSharing), contactSharingAcceptedAt: r.contactSharingAcceptedAt === null ? null : date(r.contactSharingAcceptedAt), canRenewContactSharing: boolean(r.canRenewContactSharing), blockers: r.blockers.map((v) => choice(v, publicationBlockers)) };
  if (new Set(result.blockers).size !== result.blockers.length) invalid();
  if (result.canRenewContactSharing && (result.requestStatus !== "Active" || result.leadSalesStatus === "Closed" || !result.currentVersionId || result.maxRecipients < 1 || result.hasCurrentContactSharing || result.eligibleForMarketplace || result.blockers.length !== 1 || result.blockers[0] !== "CONTACT_SHARING_REQUIRED")) invalid();
  if (result.eligibleForMarketplace && (result.requestStatus !== "Active" || result.leadSalesStatus === "Closed" || !result.currentVersionId || result.maxRecipients < 1 || !result.hasCurrentContactSharing || result.blockers.length > 0)) invalid();
  return result;
}
async function bounded<T>(run: (signal: AbortSignal) => Promise<T>, signal: AbortSignal | undefined, mutation: boolean): Promise<T> {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined; let abort: () => void = () => {};
  const boundary = new Promise<never>((_, reject) => {
    abort = () => { controller.abort(); reject(new DOMException("Aborted", "AbortError")); }; signal?.addEventListener("abort", abort, { once: true });
    timer = setTimeout(() => { controller.abort(); reject(new MovelyApiError("הפעולה נמשכת זמן רב מדי.", { status: 0, errorCode: mutation ? "CONTACT_SHARING_TIMEOUT" : "PUBLICATION_STATUS_TIMEOUT" })); }, mutation ? 20_000 : 10_000);
  });
  try { return await Promise.race([boundary, run(controller.signal)]); } finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); }
}
function route(requestId: string) { if (!guid.test(requestId)) throw new MovelyApiError("הבקשה לא נמצאה.", { status: 404, errorCode: "REQUEST_NOT_FOUND" }); return `/api/v1/move-requests/${encodeURIComponent(requestId)}`; }
export async function getRequestPublicationStatus(requestId: string, signal?: AbortSignal): Promise<RequestPublicationStatus> {
  const path = `${route(requestId)}/publication-status`;
  return bounded(async (inner) => {
    const response = await fetch(`${MOVELY_API_BASE_URL}${path}`, { method: "GET", credentials: "include", cache: "no-store", signal: inner });
    if (!response.ok) {
      let errorCode = "PUBLICATION_STATUS_UNAVAILABLE";
      try { const payload = object(await response.json()); if (typeof payload.errorCode === "string") errorCode = payload.errorCode; } catch { /* Never show provider text. */ }
      throw new MovelyApiError("לא ניתן לבדוק את מצב הפרסום כרגע.", { status: response.status, errorCode });
    }
    let payload: unknown; try { payload = await response.json(); } catch { return invalid(); }
    return status(payload, requestId);
  }, signal, false);
}
export async function renewRequestContactSharing(requestId: string, input: RenewContactSharingInput, signal?: AbortSignal): Promise<RenewContactSharingResult> {
  const path = `${route(requestId)}/contact-sharing`;
  const r = object(await bounded((inner) => requestWithCsrf<unknown>(path, input, "POST", inner), signal, true));
  const result = { publicationStatus: status(r.publicationStatus, requestId), alreadyAccepted: boolean(r.alreadyAccepted) };
  const current = result.publicationStatus;
  if (current.currentVersionId?.toLowerCase() !== input.expectedCurrentVersionId.toLowerCase() || current.disclosureVersion !== input.contactSharing.disclosureVersion || current.maxRecipients !== input.contactSharing.maxRecipients || !current.hasCurrentContactSharing || !current.contactSharingAcceptedAt || current.canRenewContactSharing) invalid();
  return result;
}
