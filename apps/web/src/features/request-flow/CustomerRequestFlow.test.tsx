import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CustomerRequestFlow from "./CustomerRequestFlow";
import NewRequestPage from "@/app/request/new/page";
import { MovelyApiError, type CurrentUser, type MoveRequestResponse, type MoveRequestType, type MoveRequestVersionResponse, type UpdateMoveRequestRequest } from "@/lib/movely-api";

const apiMocks = vi.hoisted(() => ({
  getLocalities: vi.fn(),
  getCurrentUser: vi.fn(),
  getAuthCapabilities: vi.fn(),
  acceptPolicies: vi.fn(),
  getMyMoveRequests: vi.fn(),
  getMoveRequest: vi.fn(),
  createMoveRequest: vi.fn(),
  updateMoveRequest: vi.fn(),
  publishMoveRequest: vi.fn(),
  signInWithGoogle: vi.fn(),
  requestPhoneCode: vi.fn(),
  verifyPhoneCode: vi.fn(),
  logout: vi.fn(),
}));

const googleMocks = vi.hoisted(() => ({ mount: vi.fn() }));
vi.mock("@/lib/google-identity", () => ({ mountGoogleButton: googleMocks.mount }));

vi.mock("@/lib/movely-api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/movely-api")>(
    "@/lib/movely-api",
  );
  return {
    ...actual,
    ...apiMocks,
  };
});

function makeUser(overrides: Partial<{
  phoneVerified: boolean;
  firstName: string;
  lastName: string;
}> = {}) {
  return {
    id: "user-1",
    firstName: overrides.firstName ?? "Alex",
    lastName: overrides.lastName ?? "Customer",
    email: "customer@example.com",
    phone: "0501234567",
    phoneVerified: overrides.phoneVerified ?? true,
    role: "Customer" as const,
    businessStatus: null,
    subscriptionStatus: null,
    businessId: null,
    hasCurrentPolicyAcceptance: true,
  };
}

function makeApartmentVersion(overrides: Partial<MoveRequestVersionResponse> = {}): MoveRequestVersionResponse {
  return {
    id: "version-1",
    moveRequestId: "request-1",
    versionNumber: 1,
    createdByUserId: "user-1",
    createdAt: "2026-08-08T08:00:00Z",
    requestType: "ApartmentMove" as const,
    pickup: {
      city: "Tel Aviv",
      exactAddress: "Pickup Street 1",
      floor: 2,
      hasElevator: true,
      elevatorFurnitureSuitability: "Yes" as const,
      stairsInfo: "None",
      truckAccessInfo: "Loading bay on street",
      parkingDistanceMeters: 10,
    },
    destination: {
      city: "Ramat Gan",
      exactAddress: "Destination Street 9",
      floor: 4,
      hasElevator: true,
      elevatorFurnitureSuitability: "Yes" as const,
      stairsInfo: "Short stair segment",
      truckAccessInfo: "Easy curb access",
      parkingDistanceMeters: 15,
    },
    apartmentMove: {
      numberOfRooms: 3,
      boxes: { small: 2, medium: 1, large: 1 },
      inventoryItems: [
        {
          kind: "ApartmentInventory" as const,
          apartmentInventoryType: "Sofa" as const,
          specialItemType: null,
          smallMoveCategory: null,
          name: "Living room sofa",
          description: "Three seater",
          quantity: 1,
          lengthCm: 220,
          widthCm: 95,
          heightCm: 85,
          approximateWeightKg: 60,
        },
      ],
      additionalServices: {
        furnitureDisassembly: true,
        furnitureAssembly: false,
        packingAssistance: true,
        packingMaterials: false,
      },
    },
    smallMoveItems: [],
    specialItems: [],
    schedule: {
      moveDate: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
      preferredTime: "Morning" as const,
      dateFlexibility: "Exact" as const,
    },
    budgetBand: "From1000To1500" as const,
    customerComment: "Please call on arrival.",
    photos: [],
    ...overrides,
  };
}

function makeSmallVersion(overrides: Partial<MoveRequestVersionResponse> = {}): MoveRequestVersionResponse {
  return {
    id: "version-1",
    moveRequestId: "request-1",
    versionNumber: 1,
    createdByUserId: "user-1",
    createdAt: "2026-08-08T08:00:00Z",
    requestType: "SmallMove" as const,
    pickup: {
      city: "Tel Aviv",
      exactAddress: "Pickup Street 1",
      floor: 1,
      hasElevator: false,
      elevatorFurnitureSuitability: "Unknown" as const,
      stairsInfo: "One flight",
      truckAccessInfo: "Street parking",
      parkingDistanceMeters: 5,
    },
    destination: {
      city: "Herzliya",
      exactAddress: "Destination Street 9",
      floor: 3,
      hasElevator: true,
      elevatorFurnitureSuitability: "Unknown" as const,
      stairsInfo: "No stairs",
      truckAccessInfo: "Easy access",
      parkingDistanceMeters: 8,
    },
    apartmentMove: null,
    smallMoveItems: [
      {
        kind: "SmallMoveItem" as const,
        apartmentInventoryType: null,
        specialItemType: null,
        smallMoveCategory: "Furniture" as const,
        name: "Desk",
        description: "Office desk",
        quantity: 1,
        lengthCm: 140,
        widthCm: 70,
        heightCm: 75,
        approximateWeightKg: 30,
      },
    ],
    specialItems: [],
    schedule: {
      moveDate: new Date(Date.now() + 31 * 86_400_000).toISOString().slice(0, 10),
      preferredTime: "Flexible" as const,
      dateFlexibility: "PlusMinusOneDay" as const,
    },
    budgetBand: "Unknown" as const,
    customerComment: "Keep it quick.",
    photos: [],
    ...overrides,
  };
}

function makeRequestResponse({
  requestType = "ApartmentMove",
  status = "Draft",
  duplicateRisk = false,
  maxLeadBuyers = 3,
  currentVersion,
}: {
  requestType?: "ApartmentMove" | "SmallMove";
  status?: "Draft" | "Published" | "Active" | "Closed" | "Cancelled" | "Expired";
  duplicateRisk?: boolean;
  maxLeadBuyers?: number;
  currentVersion?: MoveRequestVersionResponse;
} = {}) {
  const version = currentVersion ?? (requestType === "SmallMove" ? makeSmallVersion() : makeApartmentVersion());
  return {
    id: "request-1",
    customerUserId: "user-1",
    requestType,
    status,
    leadSalesStatus: status === "Active" ? "Available" : "Closed",
    duplicateRisk,
    leadPrice: { currency: "ILS", amountMinor: requestType === "SmallMove" ? 500 : 1000 },
    maxLeadBuyers,
    activeBuyerCount: 0,
    createdAt: "2026-08-08T08:00:00Z",
    updatedAt: "2026-08-08T08:10:00Z",
    publishedAt: status === "Active" || status === "Published" ? "2026-08-08T08:10:00Z" : null,
    closedAt: null,
    cancelledAt: null,
    expiredAt: null,
    currentVersion: version,
  };
}

async function renderApp({
  user = null,
  drafts = [],
}: {
  user?: CurrentUser | null;
  drafts?: MoveRequestResponse[];
} = {}) {
  apiMocks.getCurrentUser.mockResolvedValue(user);
  apiMocks.getAuthCapabilities.mockResolvedValue({ policyAcceptanceAvailable: true, googleSignInAvailable: false, googleClientId: null, phoneVerificationAvailable: false });
  apiMocks.getMyMoveRequests.mockResolvedValue(drafts);
  apiMocks.getMoveRequest.mockResolvedValue(drafts[0] ?? makeRequestResponse());
  apiMocks.createMoveRequest.mockImplementation(async (requestType: MoveRequestType) =>
    makeRequestResponse({ requestType }),
  );
  apiMocks.updateMoveRequest.mockImplementation(async (_id: string, payload: UpdateMoveRequestRequest) =>
    makeRequestResponse({
      requestType: payload.requestType,
      currentVersion:
        payload.requestType === "SmallMove"
          ? makeSmallVersion({
              pickup: payload.pickup,
              destination: payload.destination,
              smallMoveItems: payload.smallMoveItems ?? [],
              schedule: payload.schedule ?? makeSmallVersion().schedule,
              budgetBand: payload.budgetBand,
              customerComment: payload.customerComment,
            })
          : makeApartmentVersion({
              pickup: payload.pickup,
              destination: payload.destination,
              apartmentMove: payload.apartmentMove,
              specialItems: payload.specialItems ?? [],
              schedule: payload.schedule ?? makeApartmentVersion().schedule,
              budgetBand: payload.budgetBand,
              customerComment: payload.customerComment,
            }),
    }),
  );
  apiMocks.publishMoveRequest.mockResolvedValue({
    moveRequest: makeRequestResponse({
      status: "Active",
      duplicateRisk: false,
    }),
    potentialDuplicateExists: false,
  });
  apiMocks.signInWithGoogle.mockResolvedValue(user ?? makeUser());
  apiMocks.requestPhoneCode.mockResolvedValue({
    normalizedPhone: "0501234567",
    debugCode: "123456",
    expiresAt: "2026-08-08T08:20:00Z",
  });
  apiMocks.verifyPhoneCode.mockResolvedValue({
    phoneVerified: true,
    normalizedPhone: "0501234567",
  });
  apiMocks.logout.mockResolvedValue(undefined);

  render(<CustomerRequestFlow />);
  await waitFor(() => expect(screen.getByRole("button", { name: /^המשך$/ })).toBeEnabled());
}

async function openStep(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
  await user.click(screen.getByText("מעבר לשלב אחר", { exact: true }));
  await user.click(screen.getByRole("button", { name }));
}

async function fillRequiredApartmentFields(user: ReturnType<typeof userEvent.setup>) {
  await openStep(user, /^איסוף ויעד$/);
  for (const [name, value] of [["איסוף עיר", "Haifa"], ["איסוף כתובת מדויקת", "Example 1"], ["יעד עיר", "Tel Aviv"], ["יעד כתובת מדויקת", "Example 2"]]) {
    fireEvent.change(screen.getByRole(name.endsWith("עיר") ? "combobox" : "textbox", { name, exact: true }), { target: { value } });
  }
  await openStep(user, /^תכולת הדירה$/);
  await user.click(screen.getByRole("button", { name: "3 חדרים" }));
  await openStep(user, /^תאריך ותקציב$/);
  const date = screen.getByLabelText(/תאריך הובלה/);
  fireEvent.change(date, { target: { value: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10) } });
  await user.click(screen.getByRole("button", { name: "בוקר", exact: true }));
  await user.click(screen.getByRole("button", { name: "תאריך מדויק", exact: true }));
  await openStep(user, /^איסוף ויעד$/);
}

beforeEach(() => {
  window.sessionStorage.clear();
  Object.values(apiMocks).forEach((mock) => mock.mockReset());
  apiMocks.getLocalities.mockResolvedValue([{ code: "4000", name: "חיפה" }, { code: "5000", name: "תל אביב - יפו" }]);
  googleMocks.mount.mockReset();
});

test("Real sign-in component replaces developer fields and preserves the prepared route", async () => {
  const user = userEvent.setup();
  let credentialCallback!: (credential: string) => void;
  googleMocks.mount.mockImplementation(async (_element, _clientId, callback) => { credentialCallback = callback; return vi.fn(); });
  await renderApp();
  apiMocks.getAuthCapabilities.mockResolvedValue({ policyAcceptanceAvailable: true, googleSignInAvailable: true, googleClientId: "test.apps.googleusercontent.com", phoneVerificationAvailable: false });
  await user.click(screen.getByRole("button", { name: /הובלת דירה הובלה מלאה/ }));
  await openStep(user, /^איסוף ויעד$/);
  fireEvent.change(screen.getByLabelText("איסוף עיר"), { target: { value: "Haifa" } });
  await openStep(user, /אימות ופרסום/);
  await user.click(await screen.findByRole("button", { name: "כבר יש לי חשבון" }));
  await waitFor(() => expect(googleMocks.mount).toHaveBeenCalledOnce());
  expect(screen.queryByLabelText(/פרטי Google/)).not.toBeInTheDocument();
  expect(document.body.textContent).not.toContain("dev-google:");
  await act(async () => credentialCallback("google-id-token"));
  expect(apiMocks.signInWithGoogle).toHaveBeenCalledWith("google-id-token", undefined);
  expect(await screen.findByRole("button", { name: "התנתקות" })).toBeEnabled();
  expect(screen.getByRole("button", { name: /פרסום הבקשה/ })).toBeEnabled();
  await openStep(user, /^איסוף ויעד$/);
  expect(screen.getByLabelText("איסוף עיר")).toHaveValue("Haifa");
});

test("WIZARD-001 Customer can select Apartment Move.", async () => {
  const user = userEvent.setup();
  await renderApp();

  await user.click(screen.getByRole("button", { name: /הובלת דירה הובלה מלאה של בית או דירה/i }));

  expect(screen.getByText(/נבחרה הובלת דירה/i)).toBeInTheDocument();
});

test("WIZARD-002 Customer can select Small Move.", async () => {
  const user = userEvent.setup();
  await renderApp();

  await user.click(screen.getByRole("button", { name: /הובלה קטנה \/ פריטים בודדים ספה/i }));

  expect(screen.getByText(/נבחרה הובלה קטנה/i)).toBeInTheDocument();
});

test("WIZARD-003 Continue saves current Draft step.", async () => {
  const user = userEvent.setup();
  await renderApp({ user: makeUser(), drafts: [] });

  await user.click(screen.getByRole("button", { name: /הובלת דירה הובלה מלאה של בית או דירה/i }));
  await user.click(screen.getByRole("button", { name: /^המשך$/i }));

  await waitFor(() => expect(apiMocks.createMoveRequest).toHaveBeenCalled());
  expect(apiMocks.updateMoveRequest).toHaveBeenCalled();
  expect(screen.getByRole("heading", { name: /איסוף ויעד/i })).toBeInTheDocument();
});

test("WIZARD-004 Failed save keeps current form values.", async () => {
  const user = userEvent.setup();
  apiMocks.updateMoveRequest.mockResolvedValueOnce(
    makeRequestResponse({
      currentVersion: makeApartmentVersion(),
    }),
  );
  apiMocks.updateMoveRequest.mockResolvedValueOnce(
    makeRequestResponse({
      currentVersion: makeApartmentVersion(),
    }),
  );
  apiMocks.updateMoveRequest.mockRejectedValueOnce(
    new MovelyApiError("Draft save failed", {
      errorCode: "SAVE_FAILED",
      status: 500,
    }),
  );
  await renderApp({ user: makeUser(), drafts: [] });

  await user.click(screen.getByRole("button", { name: /הובלת דירה הובלה מלאה של בית או דירה/i }));
  await user.click(screen.getByRole("button", { name: /^המשך$/i }));
  await screen.findByRole("heading", { name: /איסוף ויעד/i });
  const pickupCity = screen.getByRole("combobox", { name: /^איסוף עיר/i });
  await user.clear(pickupCity);
  await user.type(pickupCity, "Tel Aviv");
  expect(pickupCity).toHaveValue("Tel Aviv");
  await user.click(screen.getByRole("button", { name: /^המשך$/i }));

  expect(screen.getByText(/SAVE_FAILED/i)).toBeInTheDocument();
});

test("WIZARD-005 Back navigation retains saved values.", async () => {
  const user = userEvent.setup();
  await renderApp({ user: makeUser(), drafts: [] });

  await user.click(screen.getByRole("button", { name: /הובלת דירה הובלה מלאה של בית או דירה/i }));
  await user.click(screen.getByRole("button", { name: /^המשך$/i }));
  await waitFor(() => expect(apiMocks.updateMoveRequest).toHaveBeenCalledTimes(2));
  const pickupCity = screen.getByRole("combobox", { name: /^איסוף עיר/i });
  await user.clear(pickupCity);
  await user.type(pickupCity, "Tel Aviv");
  await user.click(screen.getByRole("button", { name: /^המשך$/i }));
  await user.click(screen.getByRole("button", { name: /^חזרה$/i }));
  expect(screen.getByDisplayValue("Tel Aviv")).toBeInTheDocument();
});

test("WIZARD-006 Apartment flow shows apartment-specific fields.", async () => {
  const user = userEvent.setup();
  await renderApp({ user: makeUser(), drafts: [] });

  await user.click(screen.getByRole("button", { name: /הובלת דירה הובלה מלאה של בית או דירה/i }));
  await user.click(screen.getByRole("button", { name: /^המשך$/i }));
  await waitFor(() => expect(apiMocks.updateMoveRequest).toHaveBeenCalledTimes(2));
  await openStep(user, /תכולת הדירה/i);
  expect(screen.getByText(/גודל הדירה/i)).toBeInTheDocument();
  expect(screen.getByText(/^ארגזים$/i)).toBeInTheDocument();
});

test("WIZARD-007 Small Move flow shows item-specific fields.", async () => {
  const user = userEvent.setup();
  await renderApp({ user: makeUser(), drafts: [] });

  await user.click(screen.getByRole("button", { name: /הובלה קטנה \/ פריטים בודדים ספה/i }));
  await user.click(screen.getByRole("button", { name: /^המשך$/i }));
  await screen.findByRole("heading", { name: /^פריטים$/i });
  await user.click(screen.getByRole("button", { name: /הוסיפו פריט נוסף/i }));
  expect(screen.getByText(/הוסיפו פריט נוסף/i)).toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: /קטגוריה/i })).toBeInTheDocument();
});

test("WIZARD-008 Review reflects server-saved current request.", async () => {
  const user = userEvent.setup();
  apiMocks.updateMoveRequest.mockResolvedValueOnce(
    makeRequestResponse({
      currentVersion: makeApartmentVersion({
        pickup: {
          ...makeApartmentVersion().pickup,
          city: "Server City",
        },
      }),
    }),
  );
  await renderApp({ user: makeUser(), drafts: [] });

  await user.click(screen.getByRole("button", { name: /הובלת דירה הובלה מלאה של בית או דירה/i }));
  await user.click(screen.getByRole("button", { name: /^המשך$/i }));
  await screen.findByRole("heading", { name: /איסוף ויעד/i });
  const pickupCity = screen.getByRole("combobox", { name: /^איסוף עיר/i });
  await user.clear(pickupCity);
  await user.type(pickupCity, "Server City");
  await user.click(screen.getByRole("button", { name: /^המשך$/i }));
  await openStep(user, /^בדיקה$/i);

  expect(screen.getAllByText(/Server City/i).length).toBeGreaterThan(0);
});

test("WIZARD-009 Incomplete anonymous request focuses the missing route before auth.", async () => {
  const user = userEvent.setup();
  await renderApp({ user: null, drafts: [] });

  await user.click(screen.getByRole("button", { name: /הובלת דירה הובלה מלאה של בית או דירה/i }));
  await user.click(screen.getByRole("button", { name: /^המשך$/i }));
  await openStep(user, /אימות ופרסום/i);
  await user.click(screen.getByRole("button", { name: /פרסום הבקשה/i }));

  expect(screen.getByRole("combobox", { name: "איסוף עיר" })).toHaveFocus();
  expect(screen.getByRole("combobox", { name: "איסוף עיר" })).toHaveAttribute("aria-invalid", "true");
  expect(apiMocks.publishMoveRequest).not.toHaveBeenCalled();
});

test("WIZARD-010 Unverified phone requires OTP before publish.", async () => {
  const user = userEvent.setup();
  await renderApp({ user: makeUser({ phoneVerified: false }), drafts: [] });

  await user.click(screen.getByRole("button", { name: /הובלת דירה הובלה מלאה של בית או דירה/i }));
  await user.click(screen.getByRole("button", { name: /^המשך$/i }));
  await fillRequiredApartmentFields(user);
  await openStep(user, /אימות ופרסום/i);
  await user.click(screen.getByRole("button", { name: /פרסום הבקשה/i }));

  expect(screen.getByText("נדרש אימות טלפון", { exact: true })).toBeInTheDocument();
  expect(apiMocks.publishMoveRequest).not.toHaveBeenCalled();
});

test("WIZARD-011 Verified customer can publish valid request.", async () => {
  const user = userEvent.setup();
  await renderApp({ user: makeUser({ phoneVerified: true }), drafts: [] });

  await user.click(screen.getByRole("button", { name: /הובלת דירה הובלה מלאה של בית או דירה/i }));
  await user.click(screen.getByRole("button", { name: /^המשך$/i }));
  await fillRequiredApartmentFields(user);
  await openStep(user, /אימות ופרסום/i);
  await user.click(screen.getByRole("checkbox", { name: /אני מאשר \/ מאשרת העברת פרטי קשר/ }));
  await user.click(screen.getByRole("button", { name: /פרסום הבקשה/i }));

  expect(screen.getByRole("heading", { name: /הבקשה פורסמה/i })).toBeInTheDocument();
});

test("WIZARD-012 Server validation error is rendered correctly.", async () => {
  const user = userEvent.setup();
  apiMocks.publishMoveRequest.mockRejectedValueOnce(
    new MovelyApiError("Invalid request state", {
      errorCode: "INVALID_REQUEST_STATE",
      status: 400,
    }),
  );
  await renderApp({ user: makeUser({ phoneVerified: true }), drafts: [] });

  await user.click(screen.getByRole("button", { name: /הובלת דירה הובלה מלאה של בית או דירה/i }));
  await user.click(screen.getByRole("button", { name: /^המשך$/i }));
  await fillRequiredApartmentFields(user);
  await openStep(user, /אימות ופרסום/i);
  await user.click(screen.getByRole("checkbox", { name: /אני מאשר \/ מאשרת העברת פרטי קשר/ }));
  await user.click(screen.getByRole("button", { name: /פרסום הבקשה/i }));

  expect(screen.getByText(/INVALID_REQUEST_STATE/i)).toBeInTheDocument();
});

test("WIZARD-013 Potential duplicate warning is handled.", async () => {
  const user = userEvent.setup();
  apiMocks.publishMoveRequest.mockResolvedValueOnce({
    moveRequest: makeRequestResponse({
      status: "Active",
      duplicateRisk: true,
    }),
    potentialDuplicateExists: true,
  });
  await renderApp({ user: makeUser({ phoneVerified: true }), drafts: [] });

  await user.click(screen.getByRole("button", { name: /הובלת דירה הובלה מלאה של בית או דירה/i }));
  await user.click(screen.getByRole("button", { name: /^המשך$/i }));
  await fillRequiredApartmentFields(user);
  await openStep(user, /אימות ופרסום/i);
  await user.click(screen.getByRole("checkbox", { name: /אני מאשר \/ מאשרת העברת פרטי קשר/ }));
  await user.click(screen.getByRole("button", { name: /פרסום הבקשה/i }));

  expect(screen.getByText(/זוהתה כפילות אפשרית/i)).toBeInTheDocument();
  expect(screen.getByText(/נראה שכבר יש לכם בקשה פעילה דומה/i)).toBeInTheDocument();
});

test("WIZARD-014 Active request limit error is handled.", async () => {
  const user = userEvent.setup();
  apiMocks.publishMoveRequest.mockRejectedValueOnce(
    new MovelyApiError("Customer has reached the active request limit.", {
      errorCode: "ACTIVE_REQUEST_LIMIT_REACHED",
      status: 400,
    }),
  );
  await renderApp({ user: makeUser({ phoneVerified: true }), drafts: [] });

  await user.click(screen.getByRole("button", { name: /הובלת דירה הובלה מלאה של בית או דירה/i }));
  await user.click(screen.getByRole("button", { name: /^המשך$/i }));
  await fillRequiredApartmentFields(user);
  await openStep(user, /אימות ופרסום/i);
  await user.click(screen.getByRole("checkbox", { name: /אני מאשר \/ מאשרת העברת פרטי קשר/ }));
  await user.click(screen.getByRole("button", { name: /פרסום הבקשה/i }));

  expect(screen.getByText(/ACTIVE_REQUEST_LIMIT_REACHED/i)).toBeInTheDocument();
});

test("WIZARD-015 Entry and resume headings remain available after a viewport change.", async () => {
  window.innerWidth = 375;
  window.dispatchEvent(new Event("resize"));
  await renderApp();

  expect(screen.getByText(/יוצרים בקשת הובלה תוך דקות/i)).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: /המשך בקשה/i })).toBeInTheDocument();
});


test("Anonymous draft restores only after the user enables browser saving", async () => {
  const user = userEvent.setup();
  await renderApp();
  await user.click(screen.getByRole("button", { name: /הובלת דירה הובלה מלאה/ }));
  await user.click(screen.getByRole("checkbox", { name: /לשמור טיוטה בכרטיסייה הזאת/ }));
  await user.click(screen.getByRole("button", { name: /^המשך$/ }));
  await user.type(screen.getByRole("combobox", { name: /^איסוף עיר/ }), "Haifa");
  await waitFor(() => expect(window.sessionStorage.getItem("movely.anonymous-draft.v1")).toContain("Haifa"));
  cleanup();
  render(<CustomerRequestFlow />);
  await waitFor(() => expect(screen.getByRole("combobox", { name: /^איסוף עיר/ })).toHaveValue("Haifa"));
  expect(screen.getByRole("checkbox", { name: /לשמור טיוטה בכרטיסייה הזאת/ })).toBeChecked();
  await user.click(screen.getByRole("checkbox", { name: /לשמור טיוטה בכרטיסייה הזאת/ }));
  expect(window.sessionStorage.getItem("movely.anonymous-draft.v1")).toBeNull();
});

test("Continue requires choosing a move type and keeps the user on that step", async () => {
  const user = userEvent.setup();
  await renderApp();
  await user.click(screen.getByRole("button", { name: /^המשך$/ }));
  expect(screen.getByText("בחרו סוג הובלה", { exact: true })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "סוג הובלה" })).toBeInTheDocument();
  expect(apiMocks.createMoveRequest).not.toHaveBeenCalled();
});

test("Publish saves the latest edits even when the user jumps directly to the account step", async () => {
  const user = userEvent.setup();
  await renderApp({ user: makeUser() });
  await user.click(screen.getByRole("button", { name: /הובלת דירה הובלה מלאה/ }));
  await user.click(screen.getByRole("button", { name: /^המשך$/ }));
  await fillRequiredApartmentFields(user);
  const city = screen.getByRole("combobox", { name: /^איסוף עיר/ });
  await user.clear(city);
  await user.type(city, "Updated before publishing");
  await openStep(user, /אימות ופרסום/);
  await user.click(screen.getByRole("checkbox", { name: /אני מאשר \/ מאשרת העברת פרטי קשר/ }));
  await user.click(screen.getByRole("button", { name: /פרסום הבקשה/ }));
  await waitFor(() => expect(apiMocks.publishMoveRequest).toHaveBeenCalledTimes(1));
  expect(apiMocks.updateMoveRequest).toHaveBeenLastCalledWith("request-1", expect.objectContaining({ pickup: expect.objectContaining({ city: "Updated before publishing" }) }));
  expect(apiMocks.updateMoveRequest.mock.invocationCallOrder.at(-1)).toBeLessThan(apiMocks.publishMoveRequest.mock.invocationCallOrder[0]);
});


test("Verified phone and accepted terms do not imply contact-sharing consent", async () => {
  const user = userEvent.setup();
  await renderApp({ user: makeUser() });
  await user.click(screen.getByRole("button", { name: /הובלת דירה הובלה מלאה/ }));
  await user.click(screen.getByRole("button", { name: /^המשך$/ }));
  await fillRequiredApartmentFields(user);
  await openStep(user, /אימות ופרסום/);
  const sharing = screen.getByRole("checkbox", { name: /אני מאשר \/ מאשרת העברת פרטי קשר/ });
  expect(sharing).not.toBeChecked();
  await user.click(screen.getByRole("button", { name: /פרסום הבקשה/ }));
  expect(apiMocks.publishMoveRequest).not.toHaveBeenCalled();
  await user.click(sharing);
  await user.click(screen.getByRole("button", { name: /פרסום הבקשה/ }));
  await waitFor(() => expect(apiMocks.publishMoveRequest).toHaveBeenCalledWith("request-1", {
    shareContacts: true, disclosureVersion: "draft-2026-10-29-v2", maxRecipients: 3,
  }));
});

test("A changed recipient limit requires a fresh decision and does not publish", async () => {
  const user = userEvent.setup();
  await renderApp({ user: makeUser() });
  await user.click(screen.getByRole("button", { name: /הובלת דירה הובלה מלאה/ }));
  await user.click(screen.getByRole("button", { name: /^המשך$/ }));
  await fillRequiredApartmentFields(user);
  await openStep(user, /אימות ופרסום/);
  await user.click(screen.getByRole("checkbox", { name: /אני מאשר \/ מאשרת העברת פרטי קשר/ }));
  apiMocks.updateMoveRequest.mockResolvedValueOnce(makeRequestResponse({ maxLeadBuyers: 5 }));
  await user.click(screen.getByRole("button", { name: /פרסום הבקשה/ }));
  expect(apiMocks.publishMoveRequest).not.toHaveBeenCalled();
  expect(screen.getByRole("checkbox", { name: /לעד 5 עסקים/ })).not.toBeChecked();
});


test("WIZARD-021 Both flows expose six form steps and keep confirmation out of navigation.", async () => {
  const user = userEvent.setup();
  await renderApp();
  for (const typeLabel of [/הובלת דירה הובלה מלאה/, /הובלה קטנה \/ פריטים בודדים ספה/]) {
    await user.click(screen.getByRole("button", { name: typeLabel }));
    await user.click(screen.getByText("מעבר לשלב אחר"));
    expect(within(screen.getByRole("navigation", { name: "שלבי הבקשה" })).getAllByRole("button")).toHaveLength(6);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuemax", "6");
    expect(screen.queryByRole("button", { name: "הבקשה פורסמה" })).not.toBeInTheDocument();
    await user.click(screen.getByText("מעבר לשלב אחר"));
  }
});

test("WIZARD-022 Grouped apartment fields and notes survive moving between stages.", async () => {
  const user = userEvent.setup();
  await renderApp();
  await user.click(screen.getByRole("button", { name: /הובלת דירה הובלה מלאה/ }));
  await openStep(user, /תכולת הדירה/);
  await user.click(screen.getByRole("button", { name: "3 חדרים" }));
  await user.click(screen.getByRole("button", { name: /^ספה ספה פינתית/ }));
  const quantity = screen.getAllByRole("spinbutton", { name: /^כמות / })[0];
  await user.clear(quantity);
  await user.type(quantity, "4");
  await user.click(screen.getByText("שירותים נוספים ופריטים מיוחדים (רשות)"));
  await user.click(screen.getByRole("button", { name: "פירוק רהיטים" }));
  await openStep(user, /תאריך ותקציב/);
  await user.type(screen.getByRole("textbox", { name: /הערות/ }), "יש כלב בבית");
  await openStep(user, /תכולת הדירה/);
  expect(screen.getByRole("button", { name: "3 חדרים" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getAllByRole("spinbutton", { name: /^כמות / })[0]).toHaveValue(4);
  expect(screen.getByRole("button", { name: /^ספה ספה פינתית/ })).toHaveAttribute("aria-pressed", "true");
  await user.click(screen.getByText(/שירותים נוספים ופריטים מיוחדים \(רשות\) · 1 בחירות/));
  expect(screen.getByRole("button", { name: "פירוק רהיטים" })).toHaveAttribute("aria-pressed", "true");
  await openStep(user, /תאריך ותקציב/);
  expect(screen.getByRole("textbox", { name: /הערות/ })).toHaveValue("יש כלב בבית");
});


test("Malformed optional access opens its disclosure and focuses the error without saving", async () => {
  const user = userEvent.setup();
  await renderApp();
  await user.click(screen.getByRole("button", { name: /הובלת דירה הובלה מלאה/ }));
  await user.click(screen.getByRole("button", { name: /^המשך$/ }));
  const access = screen.getAllByText("קומה, מעלית וגישה לבניין")[0];
  await user.click(access);
  const floor = screen.getByRole("spinbutton", { name: "איסוף קומה" });
  await user.type(floor, "2.5");
  await user.click(access);
  await user.click(screen.getByRole("button", { name: /^המשך$/ }));
  expect(floor).toHaveFocus();
  expect(floor.closest("details")).toHaveAttribute("open");
  expect(floor).toHaveAttribute("aria-invalid", "true");
  expect(apiMocks.updateMoveRequest).not.toHaveBeenCalled();
  await user.clear(floor);
  await user.type(floor, "2");
  expect(floor).not.toHaveAttribute("aria-invalid");
  await user.click(screen.getByRole("button", { name: /^המשך$/ }));
  expect(screen.getByRole("heading", { name: "תכולת הדירה" })).toHaveFocus();
});

test("Review links navigate to the required field and errors disappear after correction", async () => {
  const user = userEvent.setup();
  await renderApp();
  await user.click(screen.getByRole("button", { name: /הובלת דירה הובלה מלאה/ }));
  await openStep(user, /^בדיקה$/);
  await user.click(screen.getByRole("button", { name: "בחרו תאריך להובלה." }));
  const date = screen.getByLabelText(/תאריך הובלה/);
  expect(date).toHaveFocus();
  expect(date).toHaveAttribute("aria-describedby", "move-error-moveDate");
  await user.type(date, new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10));
  expect(date).not.toHaveAttribute("aria-invalid");
  expect(screen.queryByRole("button", { name: "בחרו תאריך להובלה." })).not.toBeInTheDocument();
});

test("A complete anonymous request still requires authentication", async () => {
  const user = userEvent.setup();
  await renderApp();
  await user.click(screen.getByRole("button", { name: /הובלת דירה הובלה מלאה/ }));
  await fillRequiredApartmentFields(user);
  await openStep(user, /אימות ופרסום/);
  await user.click(screen.getByRole("button", { name: /פרסום הבקשה/ }));
  expect(screen.getByText("נדרשת התחברות", { exact: true })).toBeInTheDocument();
  expect(apiMocks.publishMoveRequest).not.toHaveBeenCalled();
});

test("Small item quantity errors retain input and stop draft progression until corrected", async () => {
  const user = userEvent.setup();
  await renderApp();
  await user.click(screen.getByRole("button", { name: /הובלה קטנה \/ פריטים בודדים ספה/ }));
  await user.click(screen.getByRole("button", { name: /^המשך$/ }));
  await user.click(screen.getByRole("button", { name: /הוסיפו פריט נוסף/ }));
  const quantity = screen.getByRole("spinbutton", { name: /^כמות/ });
  await user.clear(quantity);
  await user.type(quantity, "0");
  await user.click(screen.getByRole("button", { name: /^המשך$/ }));
  expect(quantity).toHaveFocus();
  expect(quantity).toHaveValue(0);
  expect(quantity).toHaveAttribute("aria-invalid", "true");
  await user.clear(quantity);
  await user.type(quantity, "2");
  await user.click(screen.getByRole("button", { name: /^המשך$/ }));
  expect(screen.getByRole("heading", { name: "איסוף ויעד" })).toHaveFocus();
});


test("Special item errors remain editable after changing from apartment to small move", async () => {
  const user = userEvent.setup();
  await renderApp();
  await user.click(screen.getByRole("button", { name: /הובלת דירה הובלה מלאה/ }));
  await openStep(user, /תכולת הדירה/);
  await user.click(screen.getByText("שירותים נוספים ופריטים מיוחדים (רשות)"));
  await user.click(screen.getByRole("button", { name: /^פסנתר/ }));
  const quantity = screen.getByRole("spinbutton", { name: /^כמות פסנתר/ });
  await user.clear(quantity);
  await user.type(quantity, "0");
  await openStep(user, /^סוג הובלה$/);
  await user.click(screen.getByRole("button", { name: /הובלה קטנה \/ פריטים בודדים ספה/ }));
  await openStep(user, /^פריטים$/);
  await user.click(screen.getByRole("button", { name: /^המשך$/ }));
  const retainedQuantity = screen.getByRole("spinbutton", { name: /^כמות פסנתר/ });
  expect(retainedQuantity).toHaveFocus();
  expect(retainedQuantity).toHaveValue(0);
  expect(retainedQuantity.closest("details")).toHaveAttribute("open");
});

const resumeId = "11111111-2222-4333-8444-555555555555";
const otherResumeId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const anonymousDraftKey = "movely.anonymous-draft.v1";

function prepareResume(request: MoveRequestResponse = { ...makeRequestResponse(), id: resumeId }) {
  apiMocks.getCurrentUser.mockResolvedValue(makeUser());
  apiMocks.getMoveRequest.mockResolvedValue(request);
  apiMocks.getMyMoveRequests.mockResolvedValue([]);
  window.sessionStorage.setItem(anonymousDraftKey, "untouched-anonymous-draft");
}

function expectNoResumeMutation() {
  expect(apiMocks.createMoveRequest).not.toHaveBeenCalled();
  expect(apiMocks.updateMoveRequest).not.toHaveBeenCalled();
  expect(apiMocks.publishMoveRequest).not.toHaveBeenCalled();
  expect(window.sessionStorage.getItem(anonymousDraftKey)).toBe("untouched-anonymous-draft");
}

test("Request page passes one exact id and keeps invalid query parameters separate from a new request", async () => {
  const explicit = await NewRequestPage({ searchParams: Promise.resolve({ requestId: resumeId }) });
  expect(explicit.props.initialRequestId).toBe(resumeId);
  const repeated = await NewRequestPage({ searchParams: Promise.resolve({ requestId: [resumeId, otherResumeId] }) });
  expect(repeated.props.initialRequestId).toBe("");
  const empty = await NewRequestPage({ searchParams: Promise.resolve({ requestId: "" }) });
  expect(empty.props.initialRequestId).toBe("");
  const fresh = await NewRequestPage({ searchParams: Promise.resolve({}) });
  expect(fresh.props.initialRequestId).toBeNull();
});

test("Direct resume loads the exact owned draft without creating or autosaving a request", async () => {
  prepareResume();
  const user = userEvent.setup();
  render(<CustomerRequestFlow initialRequestId={resumeId} />);
  expect(screen.getByRole("status")).toHaveTextContent("טוענים את הטיוטה");
  expect(screen.queryByRole("button", { name: /^המשך$/ })).not.toBeInTheDocument();
  await screen.findByText("הטיוטה חודשה");
  expect(apiMocks.getMoveRequest).toHaveBeenCalledWith(resumeId, expect.any(AbortSignal));
  expect(apiMocks.getMyMoveRequests).not.toHaveBeenCalled();
  await openStep(user, /^איסוף ויעד$/);
  expect(screen.getByLabelText("איסוף עיר")).toHaveValue("Tel Aviv");
  expectNoResumeMutation();
  apiMocks.updateMoveRequest.mockResolvedValue({ ...makeRequestResponse(), id: resumeId });
  await user.click(screen.getByRole("button", { name: /^המשך$/ }));
  await waitFor(() => expect(apiMocks.updateMoveRequest).toHaveBeenCalledWith(resumeId, expect.any(Object)));
  expect(apiMocks.createMoveRequest).not.toHaveBeenCalled();
});

test.each(["", "../account", "https://example.com", `${resumeId}/extra`])("Invalid direct resume id %j never calls the API or opens a new form", async (id) => {
  prepareResume();
  render(<CustomerRequestFlow initialRequestId={id} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("הקישור לטיוטה אינו תקין");
  expect(apiMocks.getCurrentUser).not.toHaveBeenCalled();
  expect(apiMocks.getMoveRequest).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: /^המשך$/ })).not.toBeInTheDocument();
  expectNoResumeMutation();
});

test("Unauthenticated direct resume keeps its URL and reloads the exact draft after login", async () => {
  prepareResume();
  apiMocks.getCurrentUser.mockResolvedValueOnce(null);
  const user = userEvent.setup();
  render(<CustomerRequestFlow initialRequestId={resumeId} />);
  const link = await screen.findByRole("link", { name: "כניסה לחשבון (בכרטיסייה חדשה)" });
  expect(link).toHaveAttribute("href", "/auth");
  expect(link).toHaveAttribute("target", "_blank");
  expect(apiMocks.getMoveRequest).not.toHaveBeenCalled();
  expectNoResumeMutation();
  await user.click(screen.getByRole("button", { name: "בדיקה מחדש לאחר התחברות" }));
  await screen.findByText("הטיוטה חודשה");
  expect(apiMocks.getMoveRequest).toHaveBeenCalledWith(resumeId, expect.any(AbortSignal));
  expectNoResumeMutation();
});

test.each([401, 403, 404, 500])("Direct resume HTTP %i stays blocked and offers account access/retry", async (status) => {
  prepareResume();
  apiMocks.getMoveRequest.mockRejectedValue(new MovelyApiError("test error", { errorCode: "TEST", status }));
  render(<CustomerRequestFlow initialRequestId={resumeId} />);
  await screen.findByRole("alert");
  expect(screen.getByRole("link", { name: "חזרה לחשבון" })).toHaveAttribute("href", "/account");
  expect(screen.getByRole("button", { name: status === 401 ? "בדיקה מחדש לאחר התחברות" : "נסו שוב" })).toBeEnabled();
  expect(screen.queryByRole("button", { name: /^המשך$/ })).not.toBeInTheDocument();
  expectNoResumeMutation();
});

test.each([
  { customerUserId: "someone-else" },
  { id: otherResumeId },
])("Direct resume rejects a mismatched owner or response id: %j", async (override) => {
  prepareResume({ ...makeRequestResponse(), id: resumeId, ...override });
  render(<CustomerRequestFlow initialRequestId={resumeId} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("הטיוטה לא נמצאה או שאינה שייכת לחשבון הזה");
  expect(screen.queryByText("Pickup Street 1")).not.toBeInTheDocument();
  expectNoResumeMutation();
});

test.each(["Published", "Active", "Closed", "Cancelled", "Expired"] as const)("Direct resume never edits a %s request", async (status) => {
  prepareResume({ ...makeRequestResponse({ status }), id: resumeId });
  render(<CustomerRequestFlow initialRequestId={resumeId} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("כבר אינה טיוטה");
  expect(screen.queryByRole("button", { name: /^המשך$/ })).not.toBeInTheDocument();
  expectNoResumeMutation();
});

test("Direct resume retries a temporary failure without substituting another draft", async () => {
  prepareResume();
  apiMocks.getMoveRequest.mockRejectedValueOnce(new Error("offline"));
  const user = userEvent.setup();
  render(<CustomerRequestFlow initialRequestId={resumeId} />);
  await screen.findByRole("alert");
  expectNoResumeMutation();
  await user.click(screen.getByRole("button", { name: "נסו שוב" }));
  await screen.findByText("הטיוטה חודשה");
  expect(apiMocks.getMoveRequest.mock.calls.map(([id]) => id)).toEqual([resumeId, resumeId]);
  expectNoResumeMutation();
});

test("Direct resume times out after ten seconds and ignores a late success", async () => {
  vi.useFakeTimers();
  try {
    prepareResume();
    let resolveRequest!: (request: MoveRequestResponse) => void;
    apiMocks.getMoveRequest.mockImplementation(() => new Promise((resolve) => { resolveRequest = resolve; }));
    render(<CustomerRequestFlow initialRequestId={resumeId} />);
    await act(async () => {});
    const signal = apiMocks.getMoveRequest.mock.calls[0][1] as AbortSignal;
    await act(async () => { vi.advanceTimersByTime(10_000); });
    expect(signal.aborted).toBe(true);
    expect(screen.getByRole("alert")).toHaveTextContent("לא הצלחנו לטעון את הטיוטה");
    await act(async () => { resolveRequest({ ...makeRequestResponse(), id: resumeId }); });
    expect(screen.queryByText("הטיוטה חודשה")).not.toBeInTheDocument();
    expectNoResumeMutation();
  } finally {
    cleanup();
    vi.useRealTimers();
  }
});

test("Changing a resume id aborts the old request and prevents its late response replacing the new draft", async () => {
  prepareResume();
  let resolveOld!: (request: MoveRequestResponse) => void;
  apiMocks.getMoveRequest.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
  const view = render(<CustomerRequestFlow initialRequestId={resumeId} />);
  await waitFor(() => expect(apiMocks.getMoveRequest).toHaveBeenCalledOnce());
  const oldSignal = apiMocks.getMoveRequest.mock.calls[0][1] as AbortSignal;
  apiMocks.getMoveRequest.mockResolvedValue({ ...makeRequestResponse({ requestType: "SmallMove" }), id: otherResumeId });
  view.rerender(<CustomerRequestFlow initialRequestId={otherResumeId} />);
  await screen.findByText("הטיוטה חודשה");
  expect(oldSignal.aborted).toBe(true);
  await act(async () => { resolveOld({ ...makeRequestResponse(), id: resumeId }); });
  expect(screen.getByText(`טיוטה ${otherResumeId.slice(0, 8)} נטענה.`)).toBeInTheDocument();
  expectNoResumeMutation();
});

test("Unmounting while checking authentication aborts direct resume and prevents the detail request", async () => {
  prepareResume();
  let resolveUser!: (user: CurrentUser) => void;
  apiMocks.getCurrentUser.mockImplementation(() => new Promise((resolve) => { resolveUser = resolve; }));
  const view = render(<CustomerRequestFlow initialRequestId={resumeId} />);
  const signal = apiMocks.getCurrentUser.mock.calls[0][0] as AbortSignal;
  view.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => { resolveUser(makeUser()); });
  expect(apiMocks.getMoveRequest).not.toHaveBeenCalled();
  expectNoResumeMutation();
});

function makeDetailedResume() {
  return {
    ...makeRequestResponse({ currentVersion: makeApartmentVersion({
      specialItems: [
        { kind: "SpecialItem", apartmentInventoryType: null, specialItemType: "Piano", smallMoveCategory: null,
          name: "Special object", description: "First item", quantity: 1,
          lengthCm: 123.5, widthCm: 45.25, heightCm: null, approximateWeightKg: 200.75 },
        { kind: "SpecialItem", apartmentInventoryType: null, specialItemType: "Safe", smallMoveCategory: null,
          name: "Special object", description: "Second item", quantity: 2,
          lengthCm: 55, widthCm: null, heightCm: 80.5, approximateWeightKg: 300 },
      ],
      photos: [
        { objectKey: "private/request/photo-b", originalFileName: "do-not-render-b.jpg", contentType: "image/jpeg", sizeBytes: 2048, displayOrder: 1 },
        { objectKey: "private/request/photo-a", originalFileName: null, contentType: "image/png", sizeBytes: 1024, displayOrder: 0 },
      ],
    }) }),
    id: resumeId,
  };
}

function echoResumeUpdates(request: MoveRequestResponse) {
  apiMocks.updateMoveRequest.mockImplementation(async (_id: string, payload: UpdateMoveRequestRequest) => ({
    ...request,
    currentVersion: makeApartmentVersion({
      ...request.currentVersion,
      ...payload,
      smallMoveItems: payload.smallMoveItems ?? [],
      specialItems: payload.specialItems ?? [],
      schedule: payload.schedule ?? makeApartmentVersion().schedule,
      photos: payload.photos ?? [],
    }),
  }));
}

test("Editing a resumed route retains existing special-item measurements and photo metadata across saves", async () => {
  const request = makeDetailedResume();
  prepareResume(request);
  echoResumeUpdates(request);
  // The hidden draft list must not block successful saves, even if its API never responds.
  apiMocks.getMyMoveRequests.mockImplementation(() => new Promise(() => {}));
  const user = userEvent.setup();
  render(<CustomerRequestFlow initialRequestId={resumeId} />);
  await screen.findByText("הטיוטה חודשה");
  expectNoResumeMutation();
  await openStep(user, /^איסוף ויעד$/);
  fireEvent.change(screen.getByLabelText("איסוף עיר"), { target: { value: "Updated route" } });
  await user.click(screen.getByRole("button", { name: /^המשך$/ }));
  await waitFor(() => expect(apiMocks.updateMoveRequest).toHaveBeenCalledOnce());
  await waitFor(() => expect(screen.getByRole("button", { name: /^המשך$/ })).toBeEnabled());
  expect(apiMocks.updateMoveRequest).toHaveBeenLastCalledWith(resumeId, expect.objectContaining({
    pickup: expect.objectContaining({ city: "Updated route" }),
    specialItems: request.currentVersion!.specialItems,
    photos: request.currentVersion!.photos,
  }));
  // Hydration after a successful save must retain the same data for the next edit.
  await openStep(user, /^איסוף ויעד$/);
  await user.click(screen.getByRole("button", { name: /^המשך$/ }));
  await waitFor(() => expect(apiMocks.updateMoveRequest).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.getByRole("button", { name: /^המשך$/ })).toBeEnabled());
  expect(apiMocks.updateMoveRequest.mock.calls[1][1]).toEqual(expect.objectContaining({
    specialItems: request.currentVersion!.specialItems,
    photos: request.currentVersion!.photos,
  }));
  expect(apiMocks.getMyMoveRequests).not.toHaveBeenCalled();
  expect(apiMocks.createMoveRequest).not.toHaveBeenCalled();
  expect(window.sessionStorage.getItem(anonymousDraftKey)).toBe("untouched-anonymous-draft");
  expect(document.body.textContent).not.toContain("private/request/photo");
  expect(document.body.textContent).not.toContain("do-not-render-b.jpg");
});

test("Removing and readding a resumed special item does not restore or transfer its measurements", async () => {
  const request = makeDetailedResume();
  prepareResume(request);
  echoResumeUpdates(request);
  const user = userEvent.setup();
  render(<CustomerRequestFlow initialRequestId={resumeId} />);
  await screen.findByText("הטיוטה חודשה");
  await openStep(user, /תכולת הדירה/);
  await user.click(screen.getByText(/^שירותים נוספים ופריטים מיוחדים/));
  await user.click(screen.getByRole("button", { name: /^פסנתר/ }));
  await user.click(screen.getByRole("button", { name: /^המשך$/ }));
  await waitFor(() => expect(apiMocks.updateMoveRequest).toHaveBeenCalledOnce());
  const retainedSafe = request.currentVersion!.specialItems[1];
  expect(apiMocks.updateMoveRequest.mock.calls[0][1].specialItems).toEqual([retainedSafe]);
  await waitFor(() => expect(screen.getByRole("button", { name: /^המשך$/ })).toBeEnabled());
  await openStep(user, /תכולת הדירה/);
  await user.click(screen.getByText(/^שירותים נוספים ופריטים מיוחדים/));
  await user.click(screen.getByRole("button", { name: /^פסנתר/ }));
  await user.click(screen.getByRole("button", { name: /^המשך$/ }));
  await waitFor(() => expect(apiMocks.updateMoveRequest).toHaveBeenCalledTimes(2));
  expect(apiMocks.updateMoveRequest.mock.calls[1][1].specialItems).toEqual([
    retainedSafe,
    expect.objectContaining({ specialItemType: "Piano", lengthCm: null, widthCm: null, heightCm: null, approximateWeightKg: null }),
  ]);
  expect(apiMocks.updateMoveRequest.mock.calls[1][1].photos).toEqual(request.currentVersion!.photos);
  expect(window.sessionStorage.getItem(anonymousDraftKey)).toBe("untouched-anonymous-draft");
});
