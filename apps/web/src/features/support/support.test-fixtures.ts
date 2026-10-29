import type { CurrentUser } from "@/lib/movely-api";
import type { SupportDetail, SupportEvent } from "@/lib/support-api";
export const supportId = "aaaaaaaa-1111-4111-8111-111111111111";
export const supportRevision = "bbbbbbbb-1111-4111-8111-111111111111";
export const nextSupportRevision = "cccccccc-1111-4111-8111-111111111111";
export const mutationId = "dddddddd-1111-4111-8111-111111111111";
export const supportOwnerId = "eeeeeeee-1111-4111-8111-111111111111";
export const supportUser: CurrentUser = { id: supportOwnerId, firstName: "נועה", lastName: "לוי", email: "owner@example.com", phone: null, phoneVerified: false, role: "Customer", businessId: null, businessStatus: null, subscriptionStatus: null, hasCurrentPolicyAcceptance: false };
export function supportEvent(): SupportEvent { return { id: "ffffffff-1111-4111-8111-111111111111", clientMutationId: mutationId, sequenceNumber: 1, actor: "Owner", kind: "Created", body: "מידע פרטי בפנייה", previousStatus: null, status: "Open", revisionId: supportRevision, createdAt: "2026-10-29T12:00:00Z" }; }
export function supportDetail(admin = false): SupportDetail {
  return { id: supportId, type: "PrivacyDeletion", subject: "בקשת בדיקה פרטית", status: "Open", revisionId: supportRevision, createdAt: "2026-10-29T12:00:00Z", updatedAt: "2026-10-29T12:00:00Z", clientMutationId: mutationId, history: { items: [supportEvent()], page: 1, pageSize: 50, totalCount: 1 }, ...(admin ? { owner: { id: supportOwnerId, name: "נועה לוי" } } : {}) };
}
