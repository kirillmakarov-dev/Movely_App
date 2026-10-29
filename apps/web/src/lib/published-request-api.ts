import { getAuthCapabilities, getCurrentUser, getMoveRequest, MovelyApiError, requestWithCsrf, type AuthCapabilities, type CurrentUser, type MoveRequestResponse, type MoveRequestVersionResponse, type UpdateMoveRequestRequest } from "./movely-api";
import { getRequestPublicationStatus, type RequestPublicationStatus } from "./request-publication-api";

export type EditableRequest = MoveRequestResponse & { currentVersion: MoveRequestVersionResponse };
export type PublishedEditContext = { user: CurrentUser; request: EditableRequest; capabilities: AuthCapabilities; publication: RequestPublicationStatus };
export const isPublishedEditId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
export const isEditableStatus = (status: string) => status === "Active" || status === "Published";
const sameId = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
function invalid(): never { throw new MovelyApiError("לא ניתן לאמת את גרסת הבקשה כרגע.", { status: 0, errorCode: "EDIT_INVALID_RESPONSE" }); }

// The deadline also covers CSRF acquisition; writes are never automatically retried.
export async function boundedEditRequest<T>(run: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal, write = false): Promise<T> {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: () => void = () => {};
  const boundary = new Promise<never>((_, reject) => {
    abort = () => { controller.abort(); reject(new DOMException("Aborted", "AbortError")); };
    signal?.addEventListener("abort", abort, { once: true });
    timer = setTimeout(() => { controller.abort(); reject(new MovelyApiError("הפעולה נמשכת זמן רב מדי.", { status: 0, errorCode: write ? "PUBLISHED_EDIT_TIMEOUT" : "EDIT_READ_TIMEOUT" })); }, write ? 20_000 : 10_000);
  });
  try { return await Promise.race([boundary, run(controller.signal)]); }
  finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); }
}

function validateRequest(value: MoveRequestResponse, requestId: string, userId: string): EditableRequest {
  if (!value || typeof value.id !== "string" || !sameId(value.id, requestId) || typeof value.customerUserId !== "string") invalid();
  if (!sameId(value.customerUserId, userId)) throw new MovelyApiError("אין גישה לבקשה בחשבון הזה.", { status: 403, errorCode: "FORBIDDEN" });
  const version = value.currentVersion;
  if (!["Draft", "Active", "Published", "Closed", "Cancelled", "Expired"].includes(value.status)
    || !["ApartmentMove", "SmallMove"].includes(value.requestType) || !version
    || !isPublishedEditId(version.id) || typeof version.moveRequestId !== "string" || !sameId(version.moveRequestId, requestId) || version.requestType !== value.requestType
    || !Number.isSafeInteger(version.versionNumber) || version.versionNumber < 1
    || !Array.isArray(version.smallMoveItems) || !Array.isArray(version.specialItems) || !Array.isArray(version.photos)
    || !Number.isSafeInteger(value.maxLeadBuyers)) invalid();
  return value as EditableRequest;
}

export async function loadPublishedEditContext(requestId: string, signal?: AbortSignal): Promise<PublishedEditContext> {
  if (!isPublishedEditId(requestId)) throw new MovelyApiError("הקישור לבקשה אינו תקין.", { status: 404, errorCode: "REQUEST_NOT_FOUND" });
  return boundedEditRequest(async (inner) => {
    const user = await getCurrentUser(inner);
    if (!user) throw new MovelyApiError("יש להתחבר לחשבון שבו נוצרה הבקשה.", { status: 401, errorCode: "UNAUTHORIZED" });
    if (user.role !== "Customer") throw new MovelyApiError("אין גישה לעריכת הבקשה בחשבון הזה.", { status: 403, errorCode: "FORBIDDEN" });
    const [rawRequest, capabilities, publication] = await Promise.all([getMoveRequest(requestId, inner), getAuthCapabilities(inner), getRequestPublicationStatus(requestId, inner)]);
    const request = validateRequest(rawRequest, requestId, user.id);
    // The two reads may straddle a concurrent edit. Do not mix their snapshots.
    if (!publication.currentVersionId || !sameId(publication.currentVersionId, request.currentVersion.id)
      || publication.requestStatus !== request.status || publication.maxRecipients !== request.maxLeadBuyers) {
      throw new MovelyApiError("הבקשה השתנתה בזמן הבדיקה. בדקו שוב את הגרסה העדכנית.", { status: 409, errorCode: "EDIT_SNAPSHOT_CHANGED" });
    }
    return { user, request, capabilities, publication };
  }, signal);
}

export async function savePublishedRequest(context: PublishedEditContext, payload: UpdateMoveRequestRequest, signal?: AbortSignal): Promise<EditableRequest> {
  const { request, publication, user } = context;
  if (!isPublishedEditId(request.id) || !isEditableStatus(request.status) || !publication.currentVersionId || publication.maxRecipients < 1) invalid();
  const input: UpdateMoveRequestRequest = { ...payload, expectedCurrentVersionId: request.currentVersion.id,
    contactSharing: { shareContacts: true, disclosureVersion: publication.disclosureVersion, maxRecipients: publication.maxRecipients } };
  const raw = await boundedEditRequest((inner) => requestWithCsrf<MoveRequestResponse>(`/api/v1/move-requests/${encodeURIComponent(request.id)}`, input, "PUT", inner), signal, true);
  const result = validateRequest(raw, request.id, user.id);
  if (result.status !== request.status || result.requestType !== payload.requestType
    || sameId(result.currentVersion.id, request.currentVersion.id) || result.currentVersion.versionNumber <= request.currentVersion.versionNumber) invalid();
  return result;
}
