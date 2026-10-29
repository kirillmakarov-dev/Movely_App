import { MOVELY_API_BASE_URL, MovelyApiError, requestWithCsrf, type BusinessStatus, type Locality } from "./movely-api";

export const businessStatuses = ["PendingVerification", "Verified", "Rejected", "Suspended"] as const;
export type BusinessProfile = {
  id: string; name: string | null; registrationNumber: string | null; registeredAddress: string | null; representativeName: string | null;
  serviceAreas: Locality[]; status: BusinessStatus; revisionId: string; createdAt: string; updatedAt: string; representativeConfirmedAt: string | null;
  latestReview: { status: BusinessStatus; reviewedAt: string; ownerMessage: string | null } | null;
};
export type BusinessInput = { name: string; registrationNumber: string; registeredAddress: string; representativeName: string; serviceAreaCodes: string[]; authorizedRepresentative: boolean };
export type BusinessUpdate = BusinessInput & { expectedRevisionId: string; acknowledgeReverification: boolean };
export type ReviewDecision = "Verify" | "Reject" | "Suspend" | "Reopen";
export type BusinessReviewInput = { expectedRevisionId: string; decision: ReviewDecision; ownerMessage: string; internalNotes: string; registryChecked: boolean; representativeChecked: boolean };
export type AdminBusiness = BusinessProfile & {
  hasMoreReviews: boolean;
  owner: { id: string; name: string; phone: string | null; phoneVerified: boolean; status: "Active" | "Suspended" };
  reviews: { id: string; previousStatus: BusinessStatus; status: BusinessStatus; profileRevisionId: string; reviewedAt: string; reviewedByUserId: string; ownerMessage: string | null; internalNotes: string | null; registryChecked: boolean; representativeChecked: boolean }[];
};
export type BusinessSearch = { status?: BusinessStatus; page: number; pageSize: number };
export type BusinessPage = { items: Pick<BusinessProfile, "id" | "name" | "status" | "revisionId" | "updatedAt">[]; page: number; pageSize: number; totalCount: number };
const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function invalid(): never { throw new MovelyApiError("לא ניתן לקרוא את פרטי העסק כרגע.", { status: 0, errorCode: "BUSINESS_INVALID_RESPONSE" }); }
const object = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : invalid();
const string = (v: unknown): string => typeof v === "string" && v.length <= 10_000 ? v : invalid();
const nullableString = (v: unknown): string | null => v === null ? null : string(v);
const id = (v: unknown): string => typeof v === "string" && guid.test(v) ? v : invalid();
const bool = (v: unknown): boolean => typeof v === "boolean" ? v : invalid();
const status = (v: unknown): BusinessStatus => businessStatuses.includes(v as BusinessStatus) ? v as BusinessStatus : invalid();
const date = (v: unknown): string => typeof v === "string" && /^\d{4}-\d\d-\d\dT/.test(v) && Number.isFinite(Date.parse(v)) ? v : invalid();
const integer = (v: unknown, minimum = 0): number => typeof v === "number" && Number.isSafeInteger(v) && v >= minimum ? v : invalid();
function profile(value: unknown): BusinessProfile {
  const r = object(value);
  if (!Array.isArray(r.serviceAreas) || r.serviceAreas.length > 20) invalid();
  const serviceAreas = r.serviceAreas.map((v) => { const l = object(v); const code = string(l.code); const name = string(l.name); if (!/^[1-9][0-9]{0,5}$/.test(code) || !name.trim() || name.length > 120) invalid(); return { code, name }; });
  if (new Set(serviceAreas.map((l) => l.code)).size !== serviceAreas.length) invalid();
  const review = r.latestReview === null ? null : object(r.latestReview);
  return { id: id(r.id), name: nullableString(r.name), registrationNumber: nullableString(r.registrationNumber), registeredAddress: nullableString(r.registeredAddress), representativeName: nullableString(r.representativeName), serviceAreas, status: status(r.status), revisionId: id(r.revisionId), createdAt: date(r.createdAt), updatedAt: date(r.updatedAt), representativeConfirmedAt: r.representativeConfirmedAt === null ? null : date(r.representativeConfirmedAt), latestReview: review && { status: status(review.status), reviewedAt: date(review.reviewedAt), ownerMessage: nullableString(review.ownerMessage) } };
}
function admin(value: unknown, expectedId: string): AdminBusiness {
  const r = object(value), result = profile(r), owner = object(r.owner);
  if (result.id.toLowerCase() !== expectedId.toLowerCase() || !Array.isArray(r.reviews) || !["Active", "Suspended"].includes(string(owner.status))) invalid();
  if (r.reviews.length > 100) invalid();
  return { ...result, hasMoreReviews: bool(r.hasMoreReviews), owner: { id: id(owner.id), name: string(owner.name), phone: nullableString(owner.phone), phoneVerified: bool(owner.phoneVerified), status: owner.status as "Active" | "Suspended" }, reviews: r.reviews.map((v) => { const x = object(v); return { id: id(x.id), previousStatus: status(x.previousStatus), status: status(x.status), profileRevisionId: id(x.profileRevisionId), reviewedAt: date(x.reviewedAt), reviewedByUserId: id(x.reviewedByUserId), ownerMessage: nullableString(x.ownerMessage), internalNotes: nullableString(x.internalNotes), registryChecked: bool(x.registryChecked), representativeChecked: bool(x.representativeChecked) }; }) };
}

// Includes CSRF acquisition for mutations and settles even if a transport ignores abort.
export async function boundedBusinessRequest<T>(run: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal, mutation = false): Promise<T> {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: () => void = () => {};
  const boundary = new Promise<never>((_, reject) => {
    abort = () => { controller.abort(); reject(new DOMException("Aborted", "AbortError")); };
    signal?.addEventListener("abort", abort, { once: true });
    timer = setTimeout(() => { controller.abort(); reject(new MovelyApiError("הפעולה נמשכת זמן רב מדי.", { status: 0, errorCode: mutation ? "BUSINESS_WRITE_TIMEOUT" : "BUSINESS_READ_TIMEOUT" })); }, mutation ? 20_000 : 10_000);
  });
  try { return await Promise.race([boundary, run(controller.signal)]); }
  finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); }
}
async function read(path: string, signal?: AbortSignal): Promise<unknown> {
  return boundedBusinessRequest(async (boundedSignal) => {
    const response = await fetch(`${MOVELY_API_BASE_URL}/api/v1${path}`, { credentials: "include", cache: "no-store", signal: boundedSignal });
    if (!response.ok) {
      let code = "BUSINESS_UNAVAILABLE";
      try { const body = object(await response.json()); if (typeof body.errorCode === "string") code = body.errorCode; } catch { /* Keep only a safe local message. */ }
      throw new MovelyApiError("לא ניתן לטעון את פרטי העסק כרגע.", { status: response.status, errorCode: code });
    }
    try { return await response.json(); } catch { return invalid(); }
  }, signal);
}
export async function getMyBusiness(signal?: AbortSignal): Promise<BusinessProfile | null> {
  try { return profile(await read("/businesses/me", signal)); }
  catch (error) { if (error instanceof MovelyApiError && error.status === 404 && error.errorCode === "BUSINESS_NOT_FOUND") return null; throw error; }
}
export async function saveBusiness(input: BusinessInput | BusinessUpdate, existingId?: string, signal?: AbortSignal): Promise<BusinessProfile> {
  const response = await boundedBusinessRequest((boundedSignal) => requestWithCsrf<unknown>(existingId ? "/api/v1/businesses/me" : "/api/v1/businesses", input, existingId ? "PATCH" : "POST", boundedSignal), signal, true);
  const result = profile(response);
  if (result.status !== "PendingVerification" || (existingId && result.id.toLowerCase() !== existingId.toLowerCase())) invalid();
  return result;
}
export function parseBusinessSearch(query: Record<string, string | string[] | undefined>): BusinessSearch {
  const n = (v: unknown, max: number, fallback: number) => typeof v === "string" && /^[1-9][0-9]*$/.test(v) && Number(v) <= max ? Number(v) : fallback;
  return { status: typeof query.status === "string" && businessStatuses.includes(query.status as BusinessStatus) ? query.status as BusinessStatus : undefined, page: n(query.page, 1_000_000, 1), pageSize: n(query.pageSize, 50, 12) };
}
export function businessQuery(search: BusinessSearch) { const q = new URLSearchParams({ page: String(search.page), pageSize: String(search.pageSize) }); if (search.status) q.set("status", search.status); return q.toString(); }
export async function getAdminBusinesses(search: BusinessSearch, signal?: AbortSignal): Promise<BusinessPage> {
  const r = object(await read(`/admin/businesses?${businessQuery(search)}`, signal));
  if (!Array.isArray(r.items)) invalid();
  const result = { items: r.items.map((v) => { const x = object(v); return { id: id(x.id), name: nullableString(x.name), status: status(x.status), revisionId: id(x.revisionId), updatedAt: date(x.updatedAt) }; }), page: integer(r.page, 1), pageSize: integer(r.pageSize, 1), totalCount: integer(r.totalCount) };
  if (result.page !== search.page || result.pageSize !== search.pageSize || result.items.length > search.pageSize || new Set(result.items.map((x) => x.id)).size !== result.items.length) invalid();
  return result;
}
export async function getAdminBusiness(businessId: string, signal?: AbortSignal) {
  if (!guid.test(businessId)) throw new MovelyApiError("העסק לא נמצא.", { status: 404, errorCode: "BUSINESS_NOT_FOUND" });
  return admin(await read(`/admin/businesses/${encodeURIComponent(businessId)}`, signal), businessId);
}
export async function reviewBusiness(businessId: string, input: BusinessReviewInput, signal?: AbortSignal) {
  if (!guid.test(businessId)) invalid();
  const response = await boundedBusinessRequest((boundedSignal) => requestWithCsrf<unknown>(`/api/v1/admin/businesses/${encodeURIComponent(businessId)}/reviews`, input, "POST", boundedSignal), signal, true);
  const result = admin(response, businessId);
  const expected = { Verify: "Verified", Reject: "Rejected", Suspend: "Suspended", Reopen: "PendingVerification" }[input.decision];
  if (result.status !== expected) invalid();
  return result;
}
