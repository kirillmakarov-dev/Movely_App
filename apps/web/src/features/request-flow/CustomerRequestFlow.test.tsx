import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CustomerRequestFlow from "./CustomerRequestFlow";
import { MovelyApiError } from "@/lib/movely-api";

const apiMocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
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

vi.mock("@/lib/movely-api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/movely-api")>(
    "@/lib/movely-api",
  );
  return {
    ...actual,
    ...apiMocks,
  };
});

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={typeof href === "string" ? href : String(href)} {...props}>
      {children}
    </a>
  ),
}));

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
  };
}

function makeApartmentVersion(overrides: Partial<Record<string, unknown>> = {}) {
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
      moveDate: "2026-08-20",
      preferredTime: "Morning" as const,
      dateFlexibility: "Exact" as const,
    },
    budgetBand: "From1000To1500" as const,
    customerComment: "Please call on arrival.",
    photos: [],
    ...overrides,
  };
}

function makeSmallVersion(overrides: Partial<Record<string, unknown>> = {}) {
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
      moveDate: "2026-08-21",
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
  currentVersion,
}: {
  requestType?: "ApartmentMove" | "SmallMove";
  status?: "Draft" | "Published" | "Active" | "Closed" | "Cancelled" | "Expired";
  duplicateRisk?: boolean;
  currentVersion?: any;
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
    maxLeadBuyers: 3,
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
  user?: any;
  drafts?: any[];
} = {}) {
  window.localStorage.setItem("movely-language", "en");
  apiMocks.getCurrentUser.mockResolvedValue(user);
  apiMocks.getMyMoveRequests.mockResolvedValue(drafts);
  apiMocks.getMoveRequest.mockResolvedValue(drafts[0] ?? makeRequestResponse());
  apiMocks.createMoveRequest.mockImplementation(async (requestType: string) =>
    makeRequestResponse({ requestType: requestType as any }),
  );
  apiMocks.updateMoveRequest.mockImplementation(async (_id: string, payload: any) =>
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
  await waitFor(() => expect(apiMocks.getCurrentUser).toHaveBeenCalled());
}

async function goToAccountStep(user = userEvent.setup()) {
  await user.click(screen.getByRole("button", { name: /Apartment Move Full home or apartment relocation with route, access, inventory, and services\./i }));
  await user.click(screen.getByRole("button", { name: /^Continue$/i }));
  await user.click(screen.getByRole("button", { name: /Account \/ phone verification/i }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

test("WIZARD-001 Customer can select Apartment Move.", async () => {
  const user = userEvent.setup();
  await renderApp();

  await user.click(screen.getByRole("button", { name: /Apartment Move Full home or apartment relocation with route, access, inventory, and services\./i }));

  expect(screen.getByText(/Apartment move selected/i)).toBeInTheDocument();
});

test("WIZARD-002 Customer can select Small Move.", async () => {
  const user = userEvent.setup();
  await renderApp();

  await user.click(screen.getByRole("button", { name: /Small Move \/ Individual Items A sofa, appliance, boxes, electronics, equipment, or a few items together\./i }));

  expect(screen.getByText(/Small move selected/i)).toBeInTheDocument();
});

test("WIZARD-003 Continue saves current Draft step.", async () => {
  const user = userEvent.setup();
  await renderApp({ user: makeUser(), drafts: [] });

  await user.click(screen.getByRole("button", { name: /Apartment Move Full home or apartment relocation with route, access, inventory, and services\./i }));
  await user.click(screen.getByRole("button", { name: /^Continue$/i }));

  await waitFor(() => expect(apiMocks.createMoveRequest).toHaveBeenCalled());
  expect(apiMocks.updateMoveRequest).toHaveBeenCalled();
  expect(screen.getByRole("heading", { name: /Pickup and destination/i })).toBeInTheDocument();
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

  await user.click(screen.getByRole("button", { name: /Apartment Move Full home or apartment relocation with route, access, inventory, and services\./i }));
  await user.click(screen.getByRole("button", { name: /^Continue$/i }));
  await screen.findByRole("heading", { name: /Pickup and destination/i });
  const pickupCity = screen.getByRole("textbox", { name: /^Pickup city/i });
  await user.clear(pickupCity);
  await user.type(pickupCity, "Tel Aviv");
  expect(pickupCity).toHaveValue("Tel Aviv");
  await user.click(screen.getByRole("button", { name: /^Continue$/i }));

  expect(screen.getByText(/SAVE_FAILED/i)).toBeInTheDocument();
});

test("WIZARD-005 Back navigation retains saved values.", async () => {
  const user = userEvent.setup();
  await renderApp({ user: makeUser(), drafts: [] });

  await user.click(screen.getByRole("button", { name: /Apartment Move Full home or apartment relocation with route, access, inventory, and services\./i }));
  await user.click(screen.getByRole("button", { name: /^Continue$/i }));
  await waitFor(() => expect(apiMocks.updateMoveRequest).toHaveBeenCalledTimes(2));
  const pickupCity = screen.getByRole("textbox", { name: /^Pickup city/i });
  await user.clear(pickupCity);
  await user.type(pickupCity, "Tel Aviv");
  await user.click(screen.getByRole("button", { name: /^Continue$/i }));
  await user.click(screen.getByRole("button", { name: /^Back$/i }));
  expect(screen.getByDisplayValue("Tel Aviv")).toBeInTheDocument();
});

test("WIZARD-006 Apartment flow shows apartment-specific fields.", async () => {
  const user = userEvent.setup();
  await renderApp({ user: makeUser(), drafts: [] });

  await user.click(screen.getByRole("button", { name: /Apartment Move Full home or apartment relocation with route, access, inventory, and services\./i }));
  await user.click(screen.getByRole("button", { name: /^Continue$/i }));
  await waitFor(() => expect(apiMocks.updateMoveRequest).toHaveBeenCalledTimes(2));
  await user.click(screen.getByRole("button", { name: /Apartment details/i }));
  expect(screen.getByText(/Apartment size/i)).toBeInTheDocument();
  expect(screen.getByText(/^Boxes$/i)).toBeInTheDocument();
});

test("WIZARD-007 Small Move flow shows item-specific fields.", async () => {
  const user = userEvent.setup();
  await renderApp({ user: makeUser(), drafts: [] });

  await user.click(screen.getByRole("button", { name: /Small Move \/ Individual Items A sofa, appliance, boxes, electronics, equipment, or a few items together\./i }));
  await user.click(screen.getByRole("button", { name: /^Continue$/i }));
  await screen.findByRole("heading", { name: /Items/i });
  await user.click(screen.getByRole("button", { name: /Add another item/i }));
  expect(screen.getByText(/Add another item/i)).toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: /Category/i })).toBeInTheDocument();
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

  await user.click(screen.getByRole("button", { name: /Apartment Move Full home or apartment relocation with route, access, inventory, and services\./i }));
  await user.click(screen.getByRole("button", { name: /^Continue$/i }));
  await screen.findByRole("heading", { name: /Pickup and destination/i });
  const pickupCity = screen.getByRole("textbox", { name: /^Pickup city/i });
  await user.clear(pickupCity);
  await user.type(pickupCity, "Server City");
  await user.click(screen.getByRole("button", { name: /^Continue$/i }));
  await user.click(screen.getByRole("button", { name: /Review/i }));

  expect(screen.getAllByText(/Server City/i).length).toBeGreaterThan(0);
});

test("WIZARD-009 Anonymous user is sent through auth before publish.", async () => {
  const user = userEvent.setup();
  await renderApp({ user: null, drafts: [] });

  await user.click(screen.getByRole("button", { name: /Apartment Move Full home or apartment relocation with route, access, inventory, and services\./i }));
  await user.click(screen.getByRole("button", { name: /^Continue$/i }));
  await user.click(screen.getByRole("button", { name: /Account \/ phone verification/i }));
  await user.click(screen.getByRole("button", { name: /Publish request/i }));

  expect(screen.getByText(/Sign in required/i)).toBeInTheDocument();
});

test("WIZARD-010 Unverified phone requires OTP before publish.", async () => {
  const user = userEvent.setup();
  await renderApp({ user: makeUser({ phoneVerified: false }), drafts: [] });

  await user.click(screen.getByRole("button", { name: /Apartment Move Full home or apartment relocation with route, access, inventory, and services\./i }));
  await user.click(screen.getByRole("button", { name: /^Continue$/i }));
  await user.click(screen.getByRole("button", { name: /Account \/ phone verification/i }));
  await user.click(screen.getByRole("button", { name: /Publish request/i }));

  expect(screen.getByText(/Phone verification required/i)).toBeInTheDocument();
});

test("WIZARD-011 Verified customer can publish valid request.", async () => {
  const user = userEvent.setup();
  await renderApp({ user: makeUser({ phoneVerified: true }), drafts: [] });

  await user.click(screen.getByRole("button", { name: /Apartment Move Full home or apartment relocation with route, access, inventory, and services\./i }));
  await user.click(screen.getByRole("button", { name: /^Continue$/i }));
  await user.click(screen.getByRole("button", { name: /Account \/ phone verification/i }));
  await user.click(screen.getByRole("button", { name: /Publish request/i }));

  expect(screen.getByRole("heading", { name: /Request published/i })).toBeInTheDocument();
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

  await user.click(screen.getByRole("button", { name: /Apartment Move Full home or apartment relocation with route, access, inventory, and services\./i }));
  await user.click(screen.getByRole("button", { name: /^Continue$/i }));
  await user.click(screen.getByRole("button", { name: /Account \/ phone verification/i }));
  await user.click(screen.getByRole("button", { name: /Publish request/i }));

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

  await user.click(screen.getByRole("button", { name: /Apartment Move Full home or apartment relocation with route, access, inventory, and services\./i }));
  await user.click(screen.getByRole("button", { name: /^Continue$/i }));
  await user.click(screen.getByRole("button", { name: /Account \/ phone verification/i }));
  await user.click(screen.getByRole("button", { name: /Publish request/i }));

  expect(screen.getByText(/Potential duplicate detected/i)).toBeInTheDocument();
  expect(screen.getByText(/may already have a similar active request/i)).toBeInTheDocument();
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

  await user.click(screen.getByRole("button", { name: /Apartment Move Full home or apartment relocation with route, access, inventory, and services\./i }));
  await user.click(screen.getByRole("button", { name: /^Continue$/i }));
  await user.click(screen.getByRole("button", { name: /Account \/ phone verification/i }));
  await user.click(screen.getByRole("button", { name: /Publish request/i }));

  expect(screen.getByText(/ACTIVE_REQUEST_LIMIT_REACHED/i)).toBeInTheDocument();
});

test("WIZARD-015 Wizard layout works at mobile viewport.", async () => {
  window.innerWidth = 375;
  window.dispatchEvent(new Event("resize"));
  await renderApp();

  expect(screen.getByText(/Request a move in minutes/i)).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: /Continue request/i })).toBeInTheDocument();
});
