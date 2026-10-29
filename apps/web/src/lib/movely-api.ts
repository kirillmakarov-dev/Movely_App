export const MOVELY_API_BASE_URL =
  (process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || (process.env.NODE_ENV === "development" ? "http://localhost:5000" : "")).replace(/\/+$/, "");

export type AuthCapabilities = {
  policyAcceptanceAvailable: boolean;
  googleSignInAvailable: boolean;
  googleClientId: string | null;
  phoneVerificationAvailable: boolean;
};

export async function getAuthCapabilities(signal?: AbortSignal) {
  const result = await requestJson<AuthCapabilities>("/api/v1/auth/capabilities", { method: "GET", signal });
  if (!result || typeof result.policyAcceptanceAvailable !== "boolean" || typeof result.googleSignInAvailable !== "boolean"
    || typeof result.phoneVerificationAvailable !== "boolean" || (result.googleSignInAvailable && (typeof result.googleClientId !== "string" || !result.googleClientId.endsWith(".apps.googleusercontent.com")))) {
    throw new Error("Invalid authentication capabilities response.");
  }
  return result;
}

export type Locality = { code: string; name: string };

export async function getLocalities(signal?: AbortSignal): Promise<Locality[]> {
  const result = await requestJson<unknown>("/api/v1/localities", { method: "GET", signal });
  const codes = new Set<string>();
  if (!Array.isArray(result) || result.length === 0 || result.length > 10_000) {
    throw new MovelyApiError("רשימת היישובים אינה זמינה כרגע.", { errorCode: "LOCALITIES_INVALID_RESPONSE", status: 0 });
  }
  return result.map((value: unknown) => {
    const locality = value as Partial<Locality> | null;
    if (!locality || typeof locality.code !== "string" || !/^[1-9][0-9]{0,5}$/.test(locality.code)
      || codes.has(locality.code) || typeof locality.name !== "string" || !locality.name.trim()
      || locality.name !== locality.name.trim() || locality.name.length > 120 || /[\p{Cc}\p{Cf}]/u.test(locality.name)) {
      throw new MovelyApiError("רשימת היישובים אינה זמינה כרגע.", { errorCode: "LOCALITIES_INVALID_RESPONSE", status: 0 });
    }
    codes.add(locality.code);
    // Suggestions only need these two public fields; never consume URLs or extra payload metadata.
    return { code: locality.code, name: locality.name };
  });
}

type ApiErrorShape = {
  errorCode?: string;
  message?: string;
  details?: Record<string, unknown>;
  correlationId?: string;
};

export class MovelyApiError extends Error {
  errorCode: string;
  status: number;
  details?: Record<string, unknown>;
  correlationId?: string;

  constructor(
    message: string,
    options: {
      errorCode: string;
      status: number;
      details?: Record<string, unknown>;
      correlationId?: string;
    },
  ) {
    super(message);
    this.name = "MovelyApiError";
    this.errorCode = options.errorCode;
    this.status = options.status;
    this.details = options.details;
    this.correlationId = options.correlationId;
  }
}

export type UserRole = "Customer" | "Mover" | "Admin";
export type BusinessStatus =
  | "PendingVerification"
  | "Verified"
  | "Suspended"
  | "Rejected";
export type SubscriptionStatus =
  | "Inactive"
  | "Active"
  | "PastDue"
  | "Cancelled"
  | "Expired";
export type MoveRequestType = "ApartmentMove" | "SmallMove";
export type MoveRequestStatus =
  | "Draft"
  | "Published"
  | "Active"
  | "Closed"
  | "Cancelled"
  | "Expired";
export type LeadSalesStatus = "Available" | "SoldOut" | "Closed";
export type ElevatorFurnitureSuitability = "Unknown" | "Yes" | "No";
export type MoveItemKind = "ApartmentInventory" | "SmallMoveItem" | "SpecialItem";
export type ApartmentInventoryItemType =
  | "Sofa"
  | "Bed"
  | "Mattress"
  | "Wardrobe"
  | "Dresser"
  | "Table"
  | "Chair"
  | "Refrigerator"
  | "WashingMachine"
  | "Dryer"
  | "Oven"
  | "Television"
  | "Desk"
  | "Bookshelf"
  | "Custom";
export type SpecialItemType =
  | "Piano"
  | "Safe"
  | "OversizedRefrigerator"
  | "Glass"
  | "Artwork"
  | "Antique"
  | "HeavyObject"
  | "FragileEquipment"
  | "Other";
export type SmallMoveItemCategory =
  | "Furniture"
  | "Electronics"
  | "Appliance"
  | "Boxes"
  | "Equipment"
  | "Other";
export type PreferredMoveTime = "Morning" | "Afternoon" | "Evening" | "Flexible";
export type MoveDateFlexibility =
  | "Exact"
  | "PlusMinusOneDay"
  | "PlusMinusThreeDays"
  | "WithinOneWeek";
export type MoveBudgetBand =
  | "UpTo1000"
  | "From1000To1500"
  | "From1500To2000"
  | "From2000To3000"
  | "From3000To5000"
  | "From5000Plus"
  | "Unknown";

export type MoneyDto = {
  currency: string;
  amountMinor: number;
};

export type CurrentUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  phoneVerified: boolean;
  role: UserRole;
  businessStatus: BusinessStatus | null;
  subscriptionStatus: SubscriptionStatus | null;
  businessId: string | null;
  hasCurrentPolicyAcceptance: boolean;
};

export type MoveLocationDto = {
  city: string | null;
  exactAddress: string | null;
  floor: number | null;
  hasElevator: boolean | null;
  elevatorFurnitureSuitability: ElevatorFurnitureSuitability;
  stairsInfo: string | null;
  truckAccessInfo: string | null;
  parkingDistanceMeters: number | null;
};

export type BoxCountsDto = {
  small: number;
  medium: number;
  large: number;
};

export type AdditionalServicesDto = {
  furnitureDisassembly: boolean;
  furnitureAssembly: boolean;
  packingAssistance: boolean;
  packingMaterials: boolean;
};

export type MoveItemDto = {
  kind: MoveItemKind;
  apartmentInventoryType: ApartmentInventoryItemType | null;
  specialItemType: SpecialItemType | null;
  smallMoveCategory: SmallMoveItemCategory | null;
  name: string | null;
  description: string | null;
  quantity: number;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  approximateWeightKg: number | null;
};

export type MoveScheduleDto = {
  moveDate: string | null;
  preferredTime: PreferredMoveTime | null;
  dateFlexibility: MoveDateFlexibility | null;
};

export type MovePhotoDto = {
  objectKey: string;
  originalFileName: string | null;
  contentType: string;
  sizeBytes: number;
  displayOrder: number;
};

export type ApartmentMoveDetailsDto = {
  numberOfRooms: number | null;
  boxes: BoxCountsDto;
  inventoryItems: MoveItemDto[] | null;
  additionalServices: AdditionalServicesDto;
};

export type UpdateMoveRequestRequest = {
  expectedCurrentVersionId?: string | null;
  contactSharing?: { shareContacts: boolean; disclosureVersion: string; maxRecipients: number } | null;
  requestType: MoveRequestType;
  pickup: MoveLocationDto | null;
  destination: MoveLocationDto | null;
  apartmentMove: ApartmentMoveDetailsDto | null;
  smallMoveItems: MoveItemDto[] | null;
  specialItems: MoveItemDto[] | null;
  schedule: MoveScheduleDto | null;
  budgetBand: MoveBudgetBand | null;
  customerComment: string | null;
  photos: MovePhotoDto[] | null;
};

export type CreateMoveRequestRequest = {
  requestType: MoveRequestType;
};

export type MoveRequestVersionResponse = {
  id: string;
  moveRequestId: string;
  versionNumber: number;
  createdByUserId: string;
  createdAt: string;
  requestType: MoveRequestType;
  pickup: MoveLocationDto | null;
  destination: MoveLocationDto | null;
  apartmentMove: ApartmentMoveDetailsDto | null;
  smallMoveItems: MoveItemDto[];
  specialItems: MoveItemDto[];
  schedule: MoveScheduleDto;
  budgetBand: MoveBudgetBand | null;
  customerComment: string | null;
  photos: MovePhotoDto[];
};

export type MoveRequestResponse = {
  id: string;
  customerUserId: string;
  requestType: MoveRequestType;
  status: MoveRequestStatus;
  leadSalesStatus: LeadSalesStatus;
  duplicateRisk: boolean;
  leadPrice: MoneyDto;
  maxLeadBuyers: number;
  activeBuyerCount: number;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  closedAt: string | null;
  cancelledAt: string | null;
  expiredAt: string | null;
  currentVersion: MoveRequestVersionResponse | null;
};

export type MoveRequestSummaryResponse = {
  id: string;
  requestType: MoveRequestType;
  status: MoveRequestStatus;
  leadSalesStatus: LeadSalesStatus;
  duplicateRisk: boolean;
  leadPrice: MoneyDto;
  maxLeadBuyers: number;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  currentVersionNumber: number | null;
};

export type PublishMoveRequestResponse = {
  moveRequest: MoveRequestResponse;
  potentialDuplicateExists: boolean;
};

export type RequestPhoneCodeResponse = {
  normalizedPhone: string;
  debugCode: string | null;
  expiresAt: string;
  resendAvailableAt?: string | null;
};

export type VerifyPhoneCodeResponse = {
  phoneVerified: boolean;
  normalizedPhone: string;
};

let csrfTokenCache: string | null = null;
let csrfGeneration = 0;
let observedIdentity: string | null | undefined;
function clearCsrfIdentity() {
  csrfTokenCache = null;
  csrfGeneration += 1;
  observedIdentity = undefined;
}
function observeIdentity(id: string | null) {
  if (observedIdentity !== id) {
    clearCsrfIdentity();
    observedIdentity = id;
  }
}

async function readJson(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return null;
  }

  return (await response.json()) as unknown;
}

function toApiError(status: number, payload: unknown, fallbackMessage: string) {
  const shape = (payload ?? {}) as ApiErrorShape;
  const consentMessages: Record<string, string> = {
    POLICY_ACCEPTANCE_REQUIRED: "אשרו גיל 18 ומעלה ואת תנאי השימוש לאחר קריאת הודעת הפרטיות.",
    POLICY_VERSION_CHANGED: "המסמכים השתנו. רעננו את העמוד לאחר שמירת הטיוטה, קראו ואשרו שוב.",
    CONTACT_SHARING_REQUIRED: "נדרש אישור נפרד להעברת פרטי הקשר לפני הפרסום.",
    RECIPIENT_LIMIT_CHANGED: "מגבלת המובילים השתנתה. בדקו את המגבלה החדשה ואשרו שוב.",
    LEGAL_NOT_READY: "ההרשמה והפרסום לציבור עדיין אינם פתוחים. המסמכים נמצאים בהכנה.",
    AUTH_NOT_CONFIGURED: "הכניסה לחשבון עדיין אינה זמינה. אפשר להמשיך לערוך את הטיוטה.",
    AUTH_PROVIDER_UNAVAILABLE: "שירות הכניסה אינו זמין כרגע. נסו שוב בעוד כמה דקות.",
    INVALID_AUTH_CREDENTIAL: "לא הצלחנו לאמת את הכניסה. נסו שוב דרך Google.",
    ACCOUNT_UNAVAILABLE: "הכניסה לחשבון הזה אינה זמינה.",
    SMS_NOT_CONFIGURED: "אימות טלפון עדיין אינו זמין. אפשר להמשיך לערוך את הטיוטה.",
    INVALID_PHONE_NUMBER: "בדקו את מספר הטלפון, כולל קידומת.",
    OTP_RESEND_COOLDOWN: "המתינו לפני בקשת קוד נוסף.",
    OTP_ATTEMPT_LIMIT_REACHED: "הגעתם למספר הניסיונות המותר. נסו שוב מאוחר יותר.",
    OTP_NOT_FOUND: "בקשו קוד חדש למספר הטלפון הזה.",
    OTP_EXPIRED: "תוקף הקוד פג. בקשו קוד חדש.",
    OTP_CODE_INVALID: "הקוד אינו תקין. בדקו את הקוד שקיבלתם ונסו שוב.",
    REQUEST_VERSION_CONFLICT: "הבקשה השתנתה מאז שנפתחה. שמרו עותק של השינויים שלא נשמרו ורעננו את הבקשה לפני ניסיון נוסף.",
  };
  return new MovelyApiError(consentMessages[shape.errorCode ?? ""] ?? shape.message ?? fallbackMessage, {
    errorCode: shape.errorCode ?? "HTTP_ERROR",
    status,
    details: shape.details,
    correlationId: shape.correlationId,
  });
}

async function requestJson<TResponse>(
  path: string,
  init: RequestInit = {},
): Promise<TResponse> {
  const response = await fetch(`${MOVELY_API_BASE_URL}${path}`, {
    credentials: "include",
    cache: "no-store",
    ...init,
    headers: {
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    const payload = await readJson(response);
    throw toApiError(response.status, payload, `Request failed with ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as TResponse;
  }

  const payload = await readJson(response);
  return payload as TResponse;
}

async function ensureCsrfToken(signal?: AbortSignal) {
  if (csrfTokenCache) {
    return csrfTokenCache;
  }

  const generation = csrfGeneration;
  const payload = await requestJson<{ requestToken: string }>("/api/v1/auth/csrf", {
    method: "GET",
    signal,
  });
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  if (generation !== csrfGeneration) throw new MovelyApiError("מצב החיבור השתנה. בדקו את החשבון לפני ניסיון נוסף.", { status: 400, errorCode: "CSRF_CONTEXT_CHANGED" });
  csrfTokenCache = payload.requestToken;
  return payload.requestToken;
}

export async function requestWithCsrf<TResponse>(
  path: string,
  body: unknown,
  method: "POST" | "PUT" | "PATCH" | "DELETE" = "POST",
  signal?: AbortSignal,
): Promise<TResponse> {
  const token = await ensureCsrfToken(signal);
  return await requestJson<TResponse>(path, {
    method,
    signal,
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-TOKEN": token,
    },
    body: JSON.stringify(body),
  });
}

async function requestAuthWithCsrf<TResponse>(path: string, body: unknown): Promise<TResponse> {
  // One deadline covers both the CSRF fetch and the mutation. Never retry a
  // mutation automatically: the server may have completed it before timing out.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    return await requestWithCsrf<TResponse>(path, body, "POST", controller.signal);
  } catch (error) {
    if (controller.signal.aborted) {
      throw new MovelyApiError("לא התקבלה תשובה בזמן. בדקו את החיבור ונסו שוב.", {
        errorCode: "AUTH_REQUEST_TIMEOUT",
        status: 0,
      });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getCurrentUser(signal?: AbortSignal) {
  try {
    const user = await requestJson<CurrentUser>("/api/v1/auth/me", { method: "GET", signal });
    if (!signal?.aborted) observeIdentity(user.id);
    return user;
  } catch (error) {
    if (error instanceof MovelyApiError && error.status === 401) {
      if (!signal?.aborted) observeIdentity(null);
      return null;
    }

    throw error;
  }
}

export type PolicyAcceptance = { adultConfirmed: boolean; acceptTerms: boolean; termsVersion: string; privacyVersion: string };
export async function acceptPolicies(acceptance: PolicyAcceptance) {
  return await requestAuthWithCsrf<void>("/api/v1/auth/consents", acceptance);
}

export async function signInWithGoogle(credential: string, acceptance?: PolicyAcceptance) {
  try {
    return await requestAuthWithCsrf<CurrentUser>("/api/v1/auth/google/sign-in", { credential, acceptance });
  } finally {
    // Antiforgery tokens are bound to the authenticated identity. The session may
    // also have changed if the response was lost after the server issued it.
    clearCsrfIdentity();
  }
}

export async function requestPhoneCode(phone: string) {
  return await requestAuthWithCsrf<RequestPhoneCodeResponse>("/api/v1/auth/phone/request-code", {
    phone,
  });
}

export async function verifyPhoneCode(phone: string, code: string) {
  return await requestAuthWithCsrf<VerifyPhoneCodeResponse>("/api/v1/auth/phone/verify-code", {
    phone,
    code,
  });
}

export async function logout() {
  clearCsrfIdentity();
  try {
    return await requestAuthWithCsrf<void>("/api/v1/auth/logout", {});
  } finally {
    clearCsrfIdentity();
  }
}

export async function getMyMoveRequests(signal?: AbortSignal) {
  return await requestJson<MoveRequestSummaryResponse[]>("/api/v1/me/move-requests", {
    method: "GET",
    signal,
  });
}

export async function createMoveRequest(requestType: MoveRequestType) {
  return await requestWithCsrf<MoveRequestResponse>("/api/v1/move-requests", { requestType });
}

export async function getMoveRequest(requestId: string, signal?: AbortSignal) {
  return await requestJson<MoveRequestResponse>(`/api/v1/move-requests/${encodeURIComponent(requestId)}`, {
    method: "GET",
    signal,
  });
}

async function changeMoveRequestStatus(requestId: string, action: "close" | "cancel") {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    return await requestWithCsrf<MoveRequestResponse>(`/api/v1/move-requests/${encodeURIComponent(requestId)}/${action}`, {}, "POST", controller.signal);
  } catch (error) {
    if (controller.signal.aborted) {
      throw new MovelyApiError("לא התקבלה תשובה בזמן. ייתכן שהפעולה בוצעה. רעננו את הבקשה כדי לבדוק את מצבה.", { errorCode: "REQUEST_ACTION_TIMEOUT", status: 0 });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function closeMoveRequest(requestId: string) {
  return await changeMoveRequestStatus(requestId, "close");
}

export async function cancelMoveRequest(requestId: string) {
  return await changeMoveRequestStatus(requestId, "cancel");
}

export async function updateMoveRequest(
  requestId: string,
  request: UpdateMoveRequestRequest,
) {
  return await requestWithCsrf<MoveRequestResponse>(
    `/api/v1/move-requests/${requestId}`,
    request,
    "PUT",
  );
}

export async function publishMoveRequest(requestId: string, acceptance: { shareContacts: boolean; disclosureVersion: string; maxRecipients: number }) {
  return await requestWithCsrf<PublishMoveRequestResponse>(
    `/api/v1/move-requests/${requestId}/publish`,
    acceptance,
  );
}
