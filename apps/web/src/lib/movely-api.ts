export const MOVELY_API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5000";

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
};

export type VerifyPhoneCodeResponse = {
  phoneVerified: boolean;
  normalizedPhone: string;
};

let csrfTokenCache: string | null = null;

async function readJson(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return null;
  }

  return (await response.json()) as unknown;
}

function toApiError(status: number, payload: unknown, fallbackMessage: string) {
  const shape = (payload ?? {}) as ApiErrorShape;
  return new MovelyApiError(shape.message ?? fallbackMessage, {
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

async function ensureCsrfToken() {
  if (csrfTokenCache) {
    return csrfTokenCache;
  }

  const payload = await requestJson<{ requestToken: string }>("/api/v1/auth/csrf", {
    method: "GET",
  });
  csrfTokenCache = payload.requestToken;
  return payload.requestToken;
}

async function requestWithCsrf<TResponse>(
  path: string,
  body: unknown,
  method: "POST" | "PUT" | "PATCH" | "DELETE" = "POST",
): Promise<TResponse> {
  const token = await ensureCsrfToken();
  return await requestJson<TResponse>(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-TOKEN": token,
    },
    body: JSON.stringify(body),
  });
}

export async function getCurrentUser() {
  try {
    return await requestJson<CurrentUser>("/api/v1/auth/me", { method: "GET" });
  } catch (error) {
    if (error instanceof MovelyApiError && error.status === 401) {
      return null;
    }

    throw error;
  }
}

export async function signInWithGoogle(credential: string) {
  return await requestWithCsrf<CurrentUser>("/api/v1/auth/google/sign-in", {
    credential,
  });
}

export async function requestPhoneCode(phone: string) {
  return await requestWithCsrf<RequestPhoneCodeResponse>("/api/v1/auth/phone/request-code", {
    phone,
  });
}

export async function verifyPhoneCode(phone: string, code: string) {
  return await requestWithCsrf<VerifyPhoneCodeResponse>("/api/v1/auth/phone/verify-code", {
    phone,
    code,
  });
}

export async function logout() {
  csrfTokenCache = null;
  return await requestWithCsrf<void>("/api/v1/auth/logout", {}, "POST");
}

export async function getMyMoveRequests() {
  return await requestJson<MoveRequestSummaryResponse[]>("/api/v1/me/move-requests", {
    method: "GET",
  });
}

export async function createMoveRequest(requestType: MoveRequestType) {
  return await requestWithCsrf<MoveRequestResponse>("/api/v1/move-requests", { requestType });
}

export async function getMoveRequest(requestId: string) {
  return await requestJson<MoveRequestResponse>(`/api/v1/move-requests/${requestId}`, {
    method: "GET",
  });
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

export async function publishMoveRequest(requestId: string) {
  return await requestWithCsrf<PublishMoveRequestResponse>(
    `/api/v1/move-requests/${requestId}/publish`,
    {},
  );
}
