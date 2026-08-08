"use client";

import Link from "@/components/SafeLink";
import { useLocale } from "@/components/LocaleProvider";
import { useEffect, useMemo, useState } from "react";
import SiteHeader from "@/components/SiteHeader";
import { budgetLabels, formatRequestStatus, formatRequestType } from "@/lib/presentation";
import {
  type CurrentUser,
  type MoveBudgetBand,
  type MoveDateFlexibility,
  type MoveItemDto,
  type MoveLocationDto,
  type MoveRequestResponse,
  type MoveRequestSummaryResponse,
  type MoveRequestType,
  type MoveScheduleDto,
  type PreferredMoveTime,
  type UpdateMoveRequestRequest,
  type ApartmentInventoryItemType,
  type SpecialItemType,
  type SmallMoveItemCategory,
  MovelyApiError,
  createMoveRequest,
  getCurrentUser,
  getMoveRequest,
  getMyMoveRequests,
  logout,
  publishMoveRequest,
  requestPhoneCode,
  signInWithGoogle,
  updateMoveRequest,
  verifyPhoneCode,
} from "@/lib/movely-api";
import {
  APARTMENT_INVENTORY_KIND,
  APARTMENT_INVENTORY_OPTIONS,
  BUDGET_OPTIONS,
  BOX_TYPE_OPTIONS,
  DATE_FLEXIBILITY_OPTIONS,
  MOVE_TYPE_OPTIONS,
  PREFERRED_TIME_OPTIONS,
  ROOM_OPTIONS,
  SMALL_MOVE_CATEGORIES,
  SMALL_MOVE_ITEM_KIND,
  SPECIAL_ITEM_KIND,
  SPECIAL_ITEM_OPTIONS,
} from "./request-flow-data";

type PendingPhoto = {
  id: string;
  name: string;
  sizeLabel: string;
};

type LocalInventoryItem = {
  id: string;
  apartmentInventoryType: ApartmentInventoryItemType;
  name: string;
  description: string;
  quantity: number;
  lengthCm: string;
  widthCm: string;
  heightCm: string;
  approximateWeightKg: string;
};

type LocalSmallMoveItem = {
  id: string;
  smallMoveCategory: SmallMoveItemCategory;
  name: string;
  description: string;
  quantity: number;
  lengthCm: string;
  widthCm: string;
  heightCm: string;
  approximateWeightKg: string;
};

type LocalSpecialItem = {
  id: string;
  specialItemType: SpecialItemType;
  name: string;
  description: string;
  quantity: number;
};

type FormState = {
  requestType: MoveRequestType | null;
  pickup: MoveLocationDto;
  destination: MoveLocationDto;
  apartmentRooms: number | null;
  smallBoxes: number;
  mediumBoxes: number;
  largeBoxes: number;
  apartmentInventory: LocalInventoryItem[];
  specialItems: LocalSpecialItem[];
  smallMoveItems: LocalSmallMoveItem[];
  furnitureDisassembly: boolean;
  furnitureAssembly: boolean;
  packingAssistance: boolean;
  packingMaterials: boolean;
  moveDate: string;
  preferredTime: PreferredMoveTime | null;
  dateFlexibility: MoveDateFlexibility | null;
  budgetBand: MoveBudgetBand | null;
  customerComment: string;
  pendingPhotos: PendingPhoto[];
};

type BannerTone = "info" | "success" | "warning" | "error";

type Banner = {
  tone: BannerTone;
  title: string;
  message: string;
};

type PublishState = {
  moveRequest: MoveRequestResponse;
  potentialDuplicateExists: boolean;
} | null;

type FlowStep = {
  key: string;
  title: string;
  description: string;
};

const currencyFormatter = new Intl.NumberFormat("en-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const dateFormatter = new Intl.DateTimeFormat("en-IL", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function makeLocation(): MoveLocationDto {
  return {
    city: "",
    exactAddress: "",
    floor: null,
    hasElevator: null,
    elevatorFurnitureSuitability: "Unknown",
    stairsInfo: "",
    truckAccessInfo: "",
    parkingDistanceMeters: null,
  };
}

function makeFormState(): FormState {
  return {
    requestType: null,
    pickup: makeLocation(),
    destination: makeLocation(),
    apartmentRooms: null,
    smallBoxes: 0,
    mediumBoxes: 0,
    largeBoxes: 0,
    apartmentInventory: [],
    specialItems: [],
    smallMoveItems: [],
    furnitureDisassembly: false,
    furnitureAssembly: false,
    packingAssistance: false,
    packingMaterials: false,
    moveDate: "",
    preferredTime: null,
    dateFlexibility: null,
    budgetBand: null,
    customerComment: "",
    pendingPhotos: [],
  };
}

function emptyString(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function parseOptionalNumber(value: string) {
  if (!value.trim()) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function moneyLabel(money: { currency: string; amountMinor: number }) {
  if (money.currency === "ILS") {
    return currencyFormatter.format(money.amountMinor / 100);
  }

  return `${money.currency} ${(money.amountMinor / 100).toFixed(0)}`;
}

function flowStepsForType(requestType: MoveRequestType | null): FlowStep[] {
  if (requestType === "SmallMove") {
    return [
      {
        key: "move-type",
        title: "Move type",
        description: "Confirm the request category.",
      },
      {
        key: "items",
        title: "Items",
        description: "Add one or more items with quantity and rough dimensions.",
      },
      {
        key: "route",
        title: "Pickup and destination",
        description: "Add cities, exact addresses, and access details.",
      },
      {
        key: "access",
        title: "Access",
        description: "Capture floors, elevator, stairs, and truck access.",
      },
      {
        key: "schedule",
        title: "Date and budget",
        description: "Pick the move date, time, flexibility, and budget band.",
      },
      {
        key: "review",
        title: "Review",
        description: "Read back the server-backed request before sign-in.",
      },
      {
        key: "account",
        title: "Account / phone verification",
        description: "Sign in and verify the phone number if needed.",
      },
      {
        key: "publish",
        title: "Publish",
        description: "Send the request live.",
      },
    ];
  }

  return [
    {
      key: "move-type",
      title: "Move type",
      description: "Confirm the request category.",
    },
    {
      key: "route",
      title: "Pickup and destination",
      description: "Add cities, exact addresses, and access details.",
    },
    {
      key: "apartment",
      title: "Apartment details",
      description: "Choose room count and boxes.",
    },
    {
      key: "inventory",
      title: "Boxes and inventory",
      description: "Add common items and quantities.",
    },
    {
      key: "services",
      title: "Services and special items",
      description: "Add packing, assembly, and sensitive items.",
    },
    {
      key: "schedule",
      title: "Date and budget",
      description: "Pick the move date, time, flexibility, and budget band.",
    },
    {
      key: "photos",
      title: "Photos and comments",
      description: "Keep the photo upload boundary ready without fake uploads.",
    },
    {
      key: "review",
      title: "Review",
      description: "Read back the server-backed request before sign-in.",
    },
    {
      key: "account",
      title: "Account / phone verification",
      description: "Sign in and verify the phone number if needed.",
    },
    {
      key: "publish",
      title: "Publish",
      description: "Send the request live.",
    },
  ];
}

function hydrateFromRequest(request: MoveRequestResponse): FormState {
  const version = request.currentVersion;
  const form = makeFormState();
  form.requestType = request.requestType;

  if (!version) {
    return form;
  }

  form.requestType = version.requestType;
  form.pickup = version.pickup ?? makeLocation();
  form.destination = version.destination ?? makeLocation();
  form.apartmentRooms = version.apartmentMove?.numberOfRooms ?? null;
  form.smallBoxes = version.apartmentMove?.boxes.small ?? 0;
  form.mediumBoxes = version.apartmentMove?.boxes.medium ?? 0;
  form.largeBoxes = version.apartmentMove?.boxes.large ?? 0;
  form.furnitureDisassembly = version.apartmentMove?.additionalServices.furnitureDisassembly ?? false;
  form.furnitureAssembly = version.apartmentMove?.additionalServices.furnitureAssembly ?? false;
  form.packingAssistance = version.apartmentMove?.additionalServices.packingAssistance ?? false;
  form.packingMaterials = version.apartmentMove?.additionalServices.packingMaterials ?? false;
  form.moveDate = version.schedule.moveDate ?? "";
  form.preferredTime = version.schedule.preferredTime;
  form.dateFlexibility = version.schedule.dateFlexibility;
  form.budgetBand = version.budgetBand;
  form.customerComment = version.customerComment ?? "";

  form.apartmentInventory = (version.apartmentMove?.inventoryItems ?? []).map((item, index) => ({
    id: `${index}-${item.name ?? item.apartmentInventoryType ?? "inventory"}`,
    apartmentInventoryType: item.apartmentInventoryType ?? "Custom",
    name: item.name ?? "",
    description: item.description ?? "",
    quantity: item.quantity,
    lengthCm: item.lengthCm?.toString() ?? "",
    widthCm: item.widthCm?.toString() ?? "",
    heightCm: item.heightCm?.toString() ?? "",
    approximateWeightKg: item.approximateWeightKg?.toString() ?? "",
  }));

  form.smallMoveItems = version.smallMoveItems.map((item, index) => ({
    id: `${index}-${item.name ?? item.smallMoveCategory ?? "small"}`,
    smallMoveCategory: item.smallMoveCategory ?? "Other",
    name: item.name ?? "",
    description: item.description ?? "",
    quantity: item.quantity,
    lengthCm: item.lengthCm?.toString() ?? "",
    widthCm: item.widthCm?.toString() ?? "",
    heightCm: item.heightCm?.toString() ?? "",
    approximateWeightKg: item.approximateWeightKg?.toString() ?? "",
  }));

  form.specialItems = version.specialItems.map((item, index) => ({
    id: `${index}-${item.name ?? item.specialItemType ?? "special"}`,
    specialItemType: item.specialItemType ?? "Other",
    name: item.name ?? "",
    description: item.description ?? "",
    quantity: item.quantity,
  }));

  return form;
}

function buildUpdatePayload(form: FormState): UpdateMoveRequestRequest {
  const apartmentMove =
    form.requestType === "ApartmentMove"
      ? {
          numberOfRooms: form.apartmentRooms,
          boxes: {
            small: form.smallBoxes,
            medium: form.mediumBoxes,
            large: form.largeBoxes,
          },
          inventoryItems: form.apartmentInventory.map((item) => ({
            kind: APARTMENT_INVENTORY_KIND,
            apartmentInventoryType: item.apartmentInventoryType,
            specialItemType: null,
            smallMoveCategory: null,
            name: item.name || item.apartmentInventoryType,
            description: item.description || null,
            quantity: item.quantity,
            lengthCm: parseOptionalNumber(item.lengthCm),
            widthCm: parseOptionalNumber(item.widthCm),
            heightCm: parseOptionalNumber(item.heightCm),
            approximateWeightKg: parseOptionalNumber(item.approximateWeightKg),
          })),
          additionalServices: {
            furnitureDisassembly: form.furnitureDisassembly,
            furnitureAssembly: form.furnitureAssembly,
            packingAssistance: form.packingAssistance,
            packingMaterials: form.packingMaterials,
          },
        }
      : null;

  const smallMoveItems =
    form.requestType === "SmallMove"
      ? form.smallMoveItems.map((item) => ({
          kind: SMALL_MOVE_ITEM_KIND,
          apartmentInventoryType: null,
          specialItemType: null,
          smallMoveCategory: item.smallMoveCategory,
          name: item.name,
          description: item.description || null,
          quantity: item.quantity,
          lengthCm: parseOptionalNumber(item.lengthCm),
          widthCm: parseOptionalNumber(item.widthCm),
          heightCm: parseOptionalNumber(item.heightCm),
          approximateWeightKg: parseOptionalNumber(item.approximateWeightKg),
        }))
      : null;

  const specialItems = form.specialItems.map((item) => ({
    kind: SPECIAL_ITEM_KIND,
    apartmentInventoryType: null,
    specialItemType: item.specialItemType,
    smallMoveCategory: null,
    name: item.name,
    description: item.description || null,
    quantity: item.quantity,
    lengthCm: null,
    widthCm: null,
    heightCm: null,
    approximateWeightKg: null,
  }));

  const pickup = form.pickup.city || form.pickup.exactAddress ? form.pickup : null;
  const destination = form.destination.city || form.destination.exactAddress ? form.destination : null;

  const schedule: MoveScheduleDto | null =
    form.moveDate || form.preferredTime || form.dateFlexibility
      ? {
          moveDate: form.moveDate || null,
          preferredTime: form.preferredTime,
          dateFlexibility: form.dateFlexibility,
        }
      : null;

  return {
    requestType: form.requestType ?? "ApartmentMove",
    pickup,
    destination,
    apartmentMove,
    smallMoveItems,
    specialItems,
    schedule,
    budgetBand: form.budgetBand,
    customerComment: form.customerComment.trim() || null,
    photos: [],
  };
}

function normalizeApiError(error: unknown) {
  if (error instanceof MovelyApiError) {
    return {
      tone: "error" as const,
      title: error.errorCode,
      message: error.message,
    };
  }

  return {
    tone: "error" as const,
    title: "Request failed",
    message: error instanceof Error ? error.message : "Something went wrong.",
  };
}

function stepCountForType(requestType: MoveRequestType | null) {
  return flowStepsForType(requestType).length;
}

function inferStepIndex(request: MoveRequestResponse) {
  const version = request.currentVersion;
  if (!version) {
    return 0;
  }

  if (request.status === "Active" || request.status === "Published") {
    return stepCountForType(request.requestType) - 1;
  }

  if (request.requestType === "SmallMove") {
    if (version.smallMoveItems.length === 0) {
      return 1;
    }
    if (!version.pickup || !version.destination) {
      return 2;
    }
    if (!version.schedule.moveDate) {
      return 4;
    }
    return 5;
  }

  if (!version.pickup || !version.destination) {
    return 1;
  }
  if (!version.apartmentMove?.numberOfRooms) {
    return 2;
  }
  if ((version.apartmentMove.inventoryItems?.length ?? 0) === 0) {
    return 3;
  }
  if (!version.schedule.moveDate) {
    return 5;
  }

  return 7;
}

function LoadingState() {
  return (
    <div className="rounded-[28px] border border-white/60 bg-white/80 p-6 shadow-[0_18px_60px_rgba(30,58,138,0.08)] backdrop-blur-xl">
      <div className="space-y-3">
        <div className="h-4 w-28 animate-pulse rounded-full bg-slate-200" />
        <div className="h-10 w-3/4 animate-pulse rounded-2xl bg-slate-200" />
        <div className="h-5 w-full max-w-3xl animate-pulse rounded-full bg-slate-200" />
        <div className="h-5 w-5/6 animate-pulse rounded-full bg-slate-200" />
      </div>
    </div>
  );
}

function withUiTimeout<T>(promise: Promise<T>, timeoutMs = 2500) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error("The account service is taking longer than expected.")), timeoutMs);
    }),
  ]);
}

export default function CustomerRequestFlow({
  initialRequestType = null,
}: {
  initialRequestType?: MoveRequestType | null;
}) {
  const { locale } = useLocale();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [drafts, setDrafts] = useState<MoveRequestSummaryResponse[]>([]);
  const [activeRequest, setActiveRequest] = useState<MoveRequestResponse | null>(null);
  const [form, setForm] = useState<FormState>(() => ({
    ...makeFormState(),
    requestType: initialRequestType,
  }));
  const [stepIndex, setStepIndex] = useState(0);
  const [pendingGoogleCredential, setPendingGoogleCredential] = useState(
    "dev-google:demo-subject:customer@example.com:Alex:Customer",
  );
  const [phone, setPhone] = useState("050-123-4567");
  const [otpCode, setOtpCode] = useState("");
  const [otpDebugCode, setOtpDebugCode] = useState("");
  const [banner, setBanner] = useState<Banner | null>(null);
  const [statusText, setStatusText] = useState("Ready to start.");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [publishState, setPublishState] = useState<PublishState>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);

  const steps = useMemo(() => flowStepsForType(form.requestType), [form.requestType]);
  const reviewStepIndex = Math.max(0, steps.findIndex((step) => step.key === "review"));
  const accountStepIndex = Math.max(0, steps.findIndex((step) => step.key === "account"));
  const publishStepIndex = Math.max(0, steps.findIndex((step) => step.key === "publish"));
  const currentStep = steps[stepIndex] ?? steps[0];

  useEffect(() => {
    void bootstrap();
  }, []);

  useEffect(() => {
    if (stepIndex >= steps.length) {
      setStepIndex(steps.length - 1);
    }
  }, [steps.length, stepIndex]);

  async function bootstrap() {
    try {
      const [currentUser, requestList] = await withUiTimeout(Promise.all([
        getCurrentUser(),
        getMyMoveRequests().catch(() => [] as MoveRequestSummaryResponse[]),
      ]));
      setUser(currentUser);
      setDrafts(requestList);
      if (currentUser) {
        setStatusText(
          currentUser.phoneVerified
            ? `Signed in as ${currentUser.firstName}.`
            : `Signed in as ${currentUser.firstName}. Phone verification is still required.`,
        );
      }
    } catch {
      setBanner({
        tone: "info",
        title: "Start your request",
        message: "You can fill in the details now. Sign in when you are ready to save your draft.",
      });
      setStatusText("Using the request wizard in local mode until the API is reachable.");
    } finally {
      setIsBootstrapping(false);
    }
  }

  async function refreshDrafts() {
    try {
      const requestList = await getMyMoveRequests();
      setDrafts(requestList);
    } catch {
      // Keep the current list if refresh fails.
    }
  }

  function updateForm(patch: Partial<FormState>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  function selectRequestType(requestType: MoveRequestType) {
    updateForm({ requestType });
    setBanner({
      tone: "info",
      title: `${requestType === "ApartmentMove" ? "Apartment move" : "Small move"} selected`,
      message:
        user?.id && !activeRequest
          ? "Continue to create and save your draft request."
          : "You can keep shaping the request before sign-in. The server draft will be created when you save.",
    });
  }

  async function ensureSavedDraft() {
    if (!form.requestType) {
      throw new Error("Choose a move type first.");
    }

    if (activeRequest) {
      return activeRequest;
    }

    if (!user) {
      throw new Error("Sign in to create the saved draft.");
    }

    const created = await createMoveRequest(form.requestType);
    const updated = await updateMoveRequest(created.id, buildUpdatePayload(form));
    setActiveRequest(updated);
    setForm(hydrateFromRequest(updated));
    setStepIndex((current) => Math.min(current, stepCountForType(updated.requestType) - 1));
    await refreshDrafts();
    return updated;
  }

  async function saveCurrentStep() {
    if (!user) {
      setStatusText("Keep going locally, then sign in to save this draft.");
      return null;
    }

    if (!form.requestType) {
      throw new Error("Choose a move type first.");
    }

    const savedRequest = await ensureSavedDraft();
    const updated = await updateMoveRequest(savedRequest.id, buildUpdatePayload(form));
    setActiveRequest(updated);
    setForm(hydrateFromRequest(updated));
    await refreshDrafts();
    return updated;
  }

  async function handleContinue() {
    if (stepIndex === publishStepIndex) {
      await handlePublish();
      return;
    }

    if (stepIndex === accountStepIndex) {
      setStepIndex((current) => Math.min(current + 1, publishStepIndex));
      return;
    }

    setBusyAction("Saving step");
    try {
      if (user && form.requestType) {
        await saveCurrentStep();
      } else {
        setStatusText("Drafting locally. Sign in when you are ready to save.");
      }
      setStepIndex((current) => Math.min(current + 1, publishStepIndex));
      setBanner({
        tone: "success",
        title: "Step captured",
        message:
          user && activeRequest
            ? "The draft was saved to the server."
            : "The step is preserved locally and will be saved once you sign in.",
      });
    } catch (error) {
      const normalized = normalizeApiError(error);
      setBanner(normalized);
      setStatusText(normalized.message);
    } finally {
      setBusyAction(null);
    }
  }

  function handleBack() {
    setStepIndex((current) => Math.max(current - 1, 0));
  }

  async function handleResumeDraft(requestId: string) {
    setBusyAction("Loading draft");
    try {
      const request = await getMoveRequest(requestId);
      setActiveRequest(request);
      setForm(hydrateFromRequest(request));
      setStepIndex(inferStepIndex(request));
      setStatusText(`Draft ${request.id.slice(0, 8)} loaded.`);
      setBanner({
        tone: "info",
        title: "Draft resumed",
        message: "You can continue from the saved server state now.",
      });
    } catch (error) {
      const normalized = normalizeApiError(error);
      setBanner(normalized);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSignIn() {
    setBusyAction("Signing in");
    try {
      const signedIn = await signInWithGoogle(pendingGoogleCredential.trim());
      setUser(signedIn);
      setStatusText(`Signed in as ${signedIn.firstName}.`);
      setBanner({
        tone: "success",
        title: "Signed in",
        message: signedIn.phoneVerified
          ? "Your phone is already verified."
          : "Verify the phone number before publishing.",
      });
      await refreshDrafts();
    } catch (error) {
      const normalized = normalizeApiError(error);
      setBanner(normalized);
      setStatusText(normalized.message);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleLogoutClick() {
    setBusyAction("Signing out");
    try {
      await logout();
      setUser(null);
      setActiveRequest(null);
      setStatusText("Signed out.");
      setBanner({
        tone: "info",
        title: "Signed out",
        message: "Your local wizard state stays on the page.",
      });
    } catch (error) {
      const normalized = normalizeApiError(error);
      setBanner(normalized);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleRequestOtp() {
    setBusyAction("Requesting code");
    try {
      const response = await requestPhoneCode(phone);
      setOtpDebugCode(response.debugCode ?? "");
      setStatusText(`OTP sent to ${response.normalizedPhone}.`);
      setBanner({
        tone: "info",
        title: "OTP requested",
        message: response.debugCode
          ? `Development code: ${response.debugCode}`
          : "Check your phone for the verification code.",
      });
    } catch (error) {
      const normalized = normalizeApiError(error);
      setBanner(normalized);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleVerifyOtp() {
    setBusyAction("Verifying code");
    try {
      const response = await verifyPhoneCode(phone, otpCode.trim());
      setStatusText(
        response.phoneVerified
          ? "Phone verified."
          : "Verification response received, but the phone is still unverified.",
      );
      setUser((current) =>
        current
          ? {
              ...current,
              phone: response.normalizedPhone,
              phoneVerified: response.phoneVerified,
            }
          : current,
      );
      setBanner({
        tone: "success",
        title: "Phone verified",
        message: "You can publish this request now.",
      });
      await refreshDrafts();
    } catch (error) {
      const normalized = normalizeApiError(error);
      setBanner(normalized);
    } finally {
      setBusyAction(null);
    }
  }

  async function handlePublish() {
    setBusyAction("Publishing");
    try {
      if (!user) {
        setStepIndex(accountStepIndex);
        setBanner({
          tone: "warning",
          title: "Sign in required",
          message: "Create or confirm your account before publishing the request.",
        });
        return;
      }

      if (!user.phoneVerified) {
        setStepIndex(accountStepIndex);
        setBanner({
          tone: "warning",
          title: "Phone verification required",
          message: "Verify the phone number before publishing the request.",
        });
        return;
      }

      const savedRequest = await ensureSavedDraft();
      const response = await publishMoveRequest(savedRequest.id);
      setPublishState(response);
      setActiveRequest(response.moveRequest);
      setForm(hydrateFromRequest(response.moveRequest));
      setStepIndex(publishStepIndex);
      setStatusText("Request published.");
      setBanner({
        tone: response.potentialDuplicateExists ? "warning" : "success",
        title: response.potentialDuplicateExists ? "Potential duplicate detected" : "Published",
        message: response.potentialDuplicateExists
          ? "It looks like you may already have a similar active request."
          : "Your customer request is now live.",
      });
      await refreshDrafts();
    } catch (error) {
      const normalized = normalizeApiError(error);
      setBanner(normalized);
      setStatusText(normalized.message);
    } finally {
      setBusyAction(null);
    }
  }

  function handleStartNewRequest() {
    setActiveRequest(null);
    setPublishState(null);
    setForm(makeFormState());
    setStepIndex(0);
    setBanner({
      tone: "info",
      title: "Ready for a new request",
      message: "Choose a move type and start again.",
    });
    setStatusText("Ready to start.");
  }

  function renderBanner() {
    if (!banner) {
      return null;
    }

    const toneClasses: Record<BannerTone, string> = {
      info: "border-sky-200 bg-sky-50 text-sky-950",
      success: "border-emerald-200 bg-emerald-50 text-emerald-950",
      warning: "border-amber-200 bg-amber-50 text-amber-950",
      error: "border-rose-200 bg-rose-50 text-rose-950",
    };

    return (
      <div className={`rounded-[24px] border px-4 py-4 shadow-sm ${toneClasses[banner.tone]}`}>
        <p className="text-sm font-semibold">{banner.title}</p>
        <p className="mt-1 text-sm leading-6">{banner.message}</p>
      </div>
    );
  }

  function renderInputLabel(label: string, hint?: string) {
    return (
      <div className="space-y-1">
        <span className="block text-sm font-semibold text-slate-900">{label}</span>
        {hint ? <span className="block text-sm leading-6 text-slate-500">{hint}</span> : null}
      </div>
    );
  }

  function renderMoveTypeStep() {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          {MOVE_TYPE_OPTIONS.map((option) => {
            const selected = form.requestType === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => selectRequestType(option.value)}
                className={`rounded-[24px] border p-4 text-left transition duration-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 ${
                  selected
                    ? "border-slate-900 bg-slate-950 text-white shadow-[0_20px_50px_rgba(15,23,42,0.18)]"
                    : "border-slate-200 bg-white text-slate-900 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <p className="text-lg font-semibold">{option.title}</p>
                <p className={`mt-2 text-sm leading-6 ${selected ? "text-slate-200" : "text-slate-600"}`}>
                  {option.description}
                </p>
              </button>
            );
          })}
        </div>
        {!user ? (
          <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
            You can choose a move type now and keep shaping the request locally. Sign in when you
            are ready to save the draft to the server.
          </div>
        ) : null}
      </div>
    );
  }

  function renderRouteFields(prefix: "pickup" | "destination", title: string) {
    const data = form[prefix];
    return (
      <fieldset className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
        <legend className="px-2 text-sm font-semibold text-slate-900">{title}</legend>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            {renderInputLabel("City", "Use the exact city from the move route.")}
            <input
              aria-label={`${title} city`}
              value={data.city ?? ""}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  [prefix]: { ...current[prefix], city: event.target.value },
                }))
              }
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-950/10"
            />
          </label>
          <label className="space-y-2">
            {renderInputLabel("Exact address", "This stays inside the customer flow until access is granted.")}
            <input
              aria-label={`${title} exact address`}
              value={data.exactAddress ?? ""}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  [prefix]: { ...current[prefix], exactAddress: event.target.value },
                }))
              }
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-950/10"
            />
          </label>
          <label className="space-y-2">
            {renderInputLabel("Floor", "Optional, but useful for access planning.")}
            <input
              type="number"
              aria-label={`${title} floor`}
              value={data.floor ?? ""}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  [prefix]: { ...current[prefix], floor: event.target.value ? Number(event.target.value) : null },
                }))
              }
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-950/10"
            />
          </label>
          <div className="space-y-2">
            {renderInputLabel("Elevator", "Yes or no.")}
            <div className="grid grid-cols-2 gap-2">
              {["Yes", "No"].map((value) => (
                <button
                  type="button"
                  key={value}
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      [prefix]: {
                        ...current[prefix],
                        hasElevator: value === "Yes",
                      },
                    }))
                  }
                  className={`rounded-2xl border px-4 py-3 text-sm font-medium transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 ${
                    data.hasElevator === (value === "Yes")
                      ? "border-slate-900 bg-slate-950 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2 md:col-span-2">
            {renderInputLabel("Elevator suitable for large furniture", "Choose the closest match for the building elevator.")}
            <div className="grid gap-2 md:grid-cols-3">
              {[
                { value: "Unknown" as const, label: "Don't know" },
                { value: "Yes" as const, label: "Yes" },
                { value: "No" as const, label: "No" },
              ].map((option) => (
                <button
                  type="button"
                  key={option.value}
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      [prefix]: {
                        ...current[prefix],
                        elevatorFurnitureSuitability: option.value,
                      },
                    }))
                  }
                  className={`rounded-2xl border px-4 py-3 text-sm font-medium transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 ${
                    data.elevatorFurnitureSuitability === option.value
                      ? "border-slate-900 bg-slate-950 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <label className="space-y-2">
            {renderInputLabel("Stairs / access notes", "Describe steps, tight turns, or other access limits.")}
            <textarea
              aria-label={`${title} stairs or access notes`}
              value={data.stairsInfo ?? ""}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  [prefix]: { ...current[prefix], stairsInfo: event.target.value },
                }))
              }
              rows={3}
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-950/10"
            />
          </label>
          <label className="space-y-2">
            {renderInputLabel("Truck / parking access", "Describe the loading path and curb access.")}
            <textarea
              aria-label={`${title} truck or parking access`}
              value={data.truckAccessInfo ?? ""}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  [prefix]: { ...current[prefix], truckAccessInfo: event.target.value },
                }))
              }
              rows={3}
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-950/10"
            />
          </label>
          <label className="space-y-2">
            {renderInputLabel("Parking distance", "How far is the truck from the entrance?")}
            <input
              type="number"
              aria-label={`${title} parking distance`}
              value={data.parkingDistanceMeters ?? ""}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  [prefix]: {
                    ...current[prefix],
                    parkingDistanceMeters: event.target.value ? Number(event.target.value) : null,
                  },
                }))
              }
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-950/10"
            />
          </label>
        </div>
      </fieldset>
    );
  }

  function renderSmallMoveItems() {
    return (
      <div className="space-y-4">
        {form.smallMoveItems.map((item, index) => (
          <div key={item.id} className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-900">Item {index + 1}</p>
                <div className="grid gap-2 md:grid-cols-2">
                  <label className="space-y-2">
                    {renderInputLabel("Category", "Choose the transport type.")}
                    <select
                      aria-label="Category"
                      value={item.smallMoveCategory}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          smallMoveItems: current.smallMoveItems.map((row) =>
                            row.id === item.id
                              ? { ...row, smallMoveCategory: event.target.value as SmallMoveItemCategory }
                              : row,
                          ),
                        }))
                      }
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-950/10"
                    >
                      {SMALL_MOVE_CATEGORIES.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-2">
                    {renderInputLabel("Name / description", "A clear item name helps movers estimate effort.")}
                    <input
                      value={item.name}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          smallMoveItems: current.smallMoveItems.map((row) =>
                            row.id === item.id ? { ...row, name: event.target.value } : row,
                          ),
                        }))
                      }
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-950/10"
                    />
                  </label>
                </div>
                <div className="grid gap-2 md:grid-cols-4">
                  <label className="space-y-2">
                    {renderInputLabel("Quantity", "Use the stepper.")}
                    <input
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          smallMoveItems: current.smallMoveItems.map((row) =>
                            row.id === item.id ? { ...row, quantity: Number(event.target.value) } : row,
                          ),
                        }))
                      }
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-950/10"
                    />
                  </label>
                  <label className="space-y-2">
                    {renderInputLabel("Length cm", "Optional dimensions.")}
                    <input
                      type="number"
                      min={0}
                      value={item.lengthCm}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          smallMoveItems: current.smallMoveItems.map((row) =>
                            row.id === item.id ? { ...row, lengthCm: event.target.value } : row,
                          ),
                        }))
                      }
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-950/10"
                    />
                  </label>
                  <label className="space-y-2">
                    {renderInputLabel("Width cm", "Optional dimensions.")}
                    <input
                      type="number"
                      min={0}
                      value={item.widthCm}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          smallMoveItems: current.smallMoveItems.map((row) =>
                            row.id === item.id ? { ...row, widthCm: event.target.value } : row,
                          ),
                        }))
                      }
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-950/10"
                    />
                  </label>
                  <label className="space-y-2">
                    {renderInputLabel("Height cm / kg", "Optional size or weight values.")}
                    <input
                      type="number"
                      min={0}
                      value={item.heightCm}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          smallMoveItems: current.smallMoveItems.map((row) =>
                            row.id === item.id ? { ...row, heightCm: event.target.value } : row,
                          ),
                        }))
                      }
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-950/10"
                    />
                  </label>
                </div>
                <label className="space-y-2">
                  {renderInputLabel("Approx. weight kg", "Optional if the mover needs more planning detail.")}
                  <input
                    type="number"
                    min={0}
                    value={item.approximateWeightKg}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        smallMoveItems: current.smallMoveItems.map((row) =>
                          row.id === item.id ? { ...row, approximateWeightKg: event.target.value } : row,
                        ),
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-950/10"
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={() =>
                  setForm((current) => ({
                    ...current,
                    smallMoveItems: current.smallMoveItems.filter((row) => row.id !== item.id),
                  }))
                }
                className="rounded-full border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 cursor-pointer"
              >
                Remove
              </button>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={() =>
            setForm((current) => ({
              ...current,
              smallMoveItems: [
                ...current.smallMoveItems,
                {
                  id: crypto.randomUUID(),
                  smallMoveCategory: "Furniture",
                  name: "",
                  description: "",
                  quantity: 1,
                  lengthCm: "",
                  widthCm: "",
                  heightCm: "",
                  approximateWeightKg: "",
                },
              ],
            }))
          }
          className="rounded-full border border-dashed border-slate-300 px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 cursor-pointer"
        >
          Add another item
        </button>
      </div>
    );
  }

  function renderApartmentInventory() {
    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {APARTMENT_INVENTORY_OPTIONS.map((option) => {
            const selected = form.apartmentInventory.some((item) => item.apartmentInventoryType === option.value);
            return (
              <button
                key={option.value}
                type="button"
                onClick={() =>
                  setForm((current) => {
                    const alreadySelected = current.apartmentInventory.some(
                      (item) => item.apartmentInventoryType === option.value,
                    );
                    if (alreadySelected) {
                      return {
                        ...current,
                        apartmentInventory: current.apartmentInventory.filter(
                          (item) => item.apartmentInventoryType !== option.value,
                        ),
                      };
                    }

                    return {
                      ...current,
                      apartmentInventory: [
                        ...current.apartmentInventory,
                        {
                          id: crypto.randomUUID(),
                          apartmentInventoryType: option.value,
                          name: option.label,
                          description: "",
                          quantity: 1,
                          lengthCm: "",
                          widthCm: "",
                          heightCm: "",
                          approximateWeightKg: "",
                        },
                      ],
                    };
                  })
                }
                className={`rounded-[20px] border p-4 text-left transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 ${
                  selected
                    ? "border-slate-900 bg-slate-950 text-white"
                    : "border-slate-200 bg-white text-slate-900 hover:bg-slate-50"
                }`}
              >
                <p className="font-semibold">{option.label}</p>
                <p className={`mt-1 text-sm leading-6 ${selected ? "text-slate-200" : "text-slate-500"}`}>
                  {option.hint}
                </p>
              </button>
            );
          })}
        </div>
        <div className="space-y-3">
          {form.apartmentInventory.map((item) => (
            <div key={item.id} className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{item.apartmentInventoryType}</p>
                    <p className="text-sm leading-6 text-slate-500">Selected for the apartment inventory.</p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="space-y-2">
                      {renderInputLabel("Display name", "Rename if the item needs more detail.")}
                      <input
                        value={item.name}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            apartmentInventory: current.apartmentInventory.map((row) =>
                              row.id === item.id ? { ...row, name: event.target.value } : row,
                            ),
                          }))
                        }
                        className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-950/10"
                      />
                    </label>
                    <label className="space-y-2">
                      {renderInputLabel("Description", "Optional extra context.")}
                      <input
                        value={item.description}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            apartmentInventory: current.apartmentInventory.map((row) =>
                              row.id === item.id ? { ...row, description: event.target.value } : row,
                            ),
                          }))
                        }
                        className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-950/10"
                      />
                    </label>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      apartmentInventory: current.apartmentInventory.filter((row) => row.id !== item.id),
                    }))
                  }
                  className="rounded-full border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 cursor-pointer"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderSpecialItems() {
    return (
      <div className="space-y-4">
        <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-semibold text-slate-900">Additional services</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {[
              {
                key: "furnitureDisassembly",
                label: "Furniture disassembly",
                checked: form.furnitureDisassembly,
              },
              {
                key: "furnitureAssembly",
                label: "Furniture assembly",
                checked: form.furnitureAssembly,
              },
              {
                key: "packingAssistance",
                label: "Packing assistance",
                checked: form.packingAssistance,
              },
              {
                key: "packingMaterials",
                label: "Packing materials",
                checked: form.packingMaterials,
              },
            ].map((option) => (
              <button
                type="button"
                key={option.key}
                onClick={() =>
                  setForm((current) => ({
                    ...current,
                    [option.key]: !current[option.key as keyof FormState],
                  }))
                }
                className={`rounded-[20px] border px-4 py-3 text-left text-sm font-medium transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 ${
                  option.checked
                    ? "border-slate-900 bg-slate-950 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {SPECIAL_ITEM_OPTIONS.map((option) => {
            const selected = form.specialItems.some((item) => item.specialItemType === option.value);
            return (
              <button
                type="button"
                key={option.value}
                onClick={() =>
                  setForm((current) => {
                    const selectedAlready = current.specialItems.some(
                      (item) => item.specialItemType === option.value,
                    );
                    if (selectedAlready) {
                      return {
                        ...current,
                        specialItems: current.specialItems.filter((item) => item.specialItemType !== option.value),
                      };
                    }

                    return {
                      ...current,
                      specialItems: [
                        ...current.specialItems,
                        {
                          id: crypto.randomUUID(),
                          specialItemType: option.value,
                          name: option.label,
                          description: "",
                          quantity: 1,
                        },
                      ],
                    };
                  })
                }
                className={`rounded-[20px] border p-4 text-left transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 ${
                  selected
                    ? "border-slate-900 bg-slate-950 text-white"
                    : "border-slate-200 bg-white text-slate-900 hover:bg-slate-50"
                }`}
              >
                <p className="font-semibold">{option.label}</p>
                <p className={`mt-1 text-sm leading-6 ${selected ? "text-slate-200" : "text-slate-500"}`}>
                  Mark it when the mover should plan extra handling.
                </p>
              </button>
            );
          })}
        </div>

        <div className="space-y-3">
          {form.specialItems.map((item) => (
            <div key={item.id} className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{item.specialItemType}</p>
                    <p className="text-sm leading-6 text-slate-500">Selected as a special handling item.</p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="space-y-2">
                      {renderInputLabel("Display name", "Rename if the item needs more detail.")}
                      <input
                        value={item.name}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            specialItems: current.specialItems.map((row) =>
                              row.id === item.id ? { ...row, name: event.target.value } : row,
                            ),
                          }))
                        }
                        className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-950/10"
                      />
                    </label>
                    <label className="space-y-2">
                      {renderInputLabel("Description", "Optional extra context.")}
                      <input
                        value={item.description}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            specialItems: current.specialItems.map((row) =>
                              row.id === item.id ? { ...row, description: event.target.value } : row,
                            ),
                          }))
                        }
                        className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-950/10"
                      />
                    </label>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      specialItems: current.specialItems.filter((row) => row.id !== item.id),
                    }))
                  }
                  className="rounded-full border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 cursor-pointer"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderApartmentStep() {
    const boxKeys = {
      small: "smallBoxes",
      medium: "mediumBoxes",
      large: "largeBoxes",
    } as const;

    return (
      <div className="space-y-4">
        <fieldset className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
          <legend className="px-2 text-sm font-semibold text-slate-900">Apartment size</legend>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {ROOM_OPTIONS.map((rooms) => (
              <button
                type="button"
                key={rooms}
                onClick={() => updateForm({ apartmentRooms: rooms })}
                className={`rounded-2xl border px-4 py-3 text-sm font-medium transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 ${
                  form.apartmentRooms === rooms
                    ? "border-slate-900 bg-slate-950 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {rooms}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
          <legend className="px-2 text-sm font-semibold text-slate-900">Boxes</legend>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {BOX_TYPE_OPTIONS.map((option) => (
              <div key={option.key} className="rounded-[20px] border border-slate-200 p-4">
                <p className="text-sm font-semibold text-slate-900">{option.label}</p>
                <div className="mt-3 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        [boxKeys[option.key]]: Math.max(
                          0,
                          current[boxKeys[option.key]] - 1,
                        ),
                      }))
                    }
                    className="h-11 w-11 rounded-full border border-slate-300 text-lg font-semibold text-slate-700 transition hover:bg-slate-50 cursor-pointer"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min={0}
                    value={form[boxKeys[option.key]]}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        [boxKeys[option.key]]: Number(event.target.value),
                      }))
                    }
                    className="w-20 rounded-2xl border border-slate-300 px-3 py-2 text-center text-base outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-950/10"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        [boxKeys[option.key]]: current[boxKeys[option.key]] + 1,
                      }))
                    }
                    className="h-11 w-11 rounded-full border border-slate-300 text-lg font-semibold text-slate-700 transition hover:bg-slate-50 cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>
        </fieldset>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">Common inventory</p>
              <p className="text-sm leading-6 text-slate-500">
                Add the items that matter most for the moving estimate.
              </p>
            </div>
          </div>
          {renderApartmentInventory()}
        </div>
      </div>
    );
  }

  function renderScheduleStep() {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            {renderInputLabel("Move date", "Pick the preferred date.")}
            <input
              type="date"
              value={form.moveDate}
              onChange={(event) => updateForm({ moveDate: event.target.value })}
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-950/10"
            />
          </label>
          <div className="space-y-2">
            {renderInputLabel("Preferred time", "Choose the arrival window.")}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {PREFERRED_TIME_OPTIONS.map((option) => (
                <button
                  type="button"
                  key={option.value}
                  onClick={() => updateForm({ preferredTime: option.value })}
                  className={`rounded-2xl border px-4 py-3 text-sm font-medium transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 ${
                    form.preferredTime === option.value
                      ? "border-slate-900 bg-slate-950 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2 md:col-span-2">
            {renderInputLabel("Date flexibility", "Tell movers how strict the date is.")}
            <div className="grid gap-2 md:grid-cols-4">
              {DATE_FLEXIBILITY_OPTIONS.map((option) => (
                <button
                  type="button"
                  key={option.value}
                  onClick={() => updateForm({ dateFlexibility: option.value })}
                  className={`rounded-2xl border px-4 py-3 text-sm font-medium transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 ${
                    form.dateFlexibility === option.value
                      ? "border-slate-900 bg-slate-950 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2 md:col-span-2">
            {renderInputLabel("Budget band", "Choose the closest match for the customer budget.")}
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {BUDGET_OPTIONS.map((option) => (
                <button
                  type="button"
                  key={option.value}
                  onClick={() => updateForm({ budgetBand: option.value })}
                  className={`rounded-[20px] border p-4 text-left transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 ${
                    form.budgetBand === option.value
                      ? "border-slate-900 bg-slate-950 text-white"
                      : "border-slate-200 bg-white text-slate-900 hover:bg-slate-50"
                  }`}
                >
                  <p className="text-sm font-semibold">{option.label}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderPhotosStep() {
    return (
      <div className="space-y-4">
        <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-semibold text-slate-900">Photo upload foundation</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            The object storage upload boundary is ready for the next phase. For now, selected files
            stay local so we do not fake a successful production upload.
          </p>
          <label className="mt-4 block space-y-2">
            {renderInputLabel("Select photos", "They will remain pending until uploads are connected.")}
            <input
              type="file"
              multiple
              accept="image/*"
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []).map((file) => ({
                  id: crypto.randomUUID(),
                  name: file.name,
                  sizeLabel: `${Math.max(1, Math.round(file.size / 1024))} KB`,
                }));
                updateForm({
                  pendingPhotos: [...form.pendingPhotos, ...files],
                });
              }}
              className="block w-full text-sm text-slate-600 file:mr-4 file:cursor-pointer file:rounded-full file:border-0 file:bg-slate-950 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-800"
            />
          </label>
        </div>

        <div className="space-y-3">
          {form.pendingPhotos.length ? (
            form.pendingPhotos.map((photo) => (
              <div
                key={photo.id}
                className="flex items-center justify-between rounded-[20px] border border-slate-200 bg-white px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">{photo.name}</p>
                  <p className="text-sm text-slate-500">Pending upload, {photo.sizeLabel}</p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    updateForm({
                      pendingPhotos: form.pendingPhotos.filter((item) => item.id !== photo.id),
                    })
                  }
                  className="rounded-full border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 cursor-pointer"
                >
                  Remove
                </button>
              </div>
            ))
          ) : (
            <div className="rounded-[24px] border border-dashed border-slate-300 p-6 text-sm leading-6 text-slate-500">
              No photos selected yet. Add them when you want to capture the size or access of the
              move.
            </div>
          )}
        </div>

        <label className="space-y-2 block">
          {renderInputLabel("Comments", "Tell movers about anything that does not fit the form.")}
          <textarea
            value={form.customerComment}
            onChange={(event) => updateForm({ customerComment: event.target.value })}
            rows={5}
            className="w-full rounded-[24px] border border-slate-300 bg-white px-4 py-3 text-base outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-950/10"
          />
        </label>
      </div>
    );
  }

  function renderReviewStep() {
    const source = activeRequest?.currentVersion;
    const isSaved = Boolean(source);

    const pickup = source?.pickup ?? form.pickup;
    const destination = source?.destination ?? form.destination;
    const schedule = source?.schedule ?? {
      moveDate: form.moveDate || null,
      preferredTime: form.preferredTime,
      dateFlexibility: form.dateFlexibility,
    };

    return (
      <div className="space-y-4">
        {!isSaved ? (
          <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-6 text-amber-950">
            This preview is still local. Sign in and save to review the server-backed request.
          </div>
        ) : null}
        <SummarySection
          title="Move type"
          value={form.requestType === "SmallMove" ? "Small Move / Individual Items" : "Apartment Move"}
        />
        <SummarySection
          title="Route"
          value={`${emptyString(pickup?.city)} to ${emptyString(destination?.city)}`.trim()}
          detail={`Pickup ${emptyString(pickup?.exactAddress)} · Destination ${emptyString(destination?.exactAddress)}`}
        />
        <SummarySection
          title="Pickup access"
          value={[
            pickup?.floor != null ? `Floor ${pickup.floor}` : null,
            pickup?.hasElevator != null ? (pickup.hasElevator ? "Elevator" : "No elevator") : null,
            pickup?.parkingDistanceMeters != null ? `${pickup.parkingDistanceMeters}m parking distance` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
          detail={pickup?.stairsInfo ?? "No stairs note yet"}
        />
        <SummarySection
          title="Destination access"
          value={[
            destination?.floor != null ? `Floor ${destination.floor}` : null,
            destination?.hasElevator != null ? (destination.hasElevator ? "Elevator" : "No elevator") : null,
            destination?.parkingDistanceMeters != null
              ? `${destination.parkingDistanceMeters}m parking distance`
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
          detail={destination?.stairsInfo ?? "No stairs note yet"}
        />

        {form.requestType === "ApartmentMove" ? (
          <>
            <SummarySection
              title="Apartment details"
              value={form.apartmentRooms ? `${form.apartmentRooms} rooms` : "Room count not set"}
              detail={`Boxes: ${form.smallBoxes} small, ${form.mediumBoxes} medium, ${form.largeBoxes} large`}
            />
            <SummarySection
              title="Boxes and inventory"
              value={`${form.apartmentInventory.length} inventory items`}
              detail={form.apartmentInventory.map((item) => `${item.name} x${item.quantity}`).join(" · ") || "No inventory added yet"}
            />
            <SummarySection
              title="Additional services"
              value={[
                form.furnitureDisassembly ? "Disassembly" : null,
                form.furnitureAssembly ? "Assembly" : null,
                form.packingAssistance ? "Packing help" : null,
                form.packingMaterials ? "Packing materials" : null,
              ]
                .filter(Boolean)
                .join(" · ") || "No services selected"}
              detail={form.specialItems.map((item) => item.name).join(" · ") || "No special items added"}
            />
          </>
        ) : (
          <SummarySection
            title="Items"
            value={`${form.smallMoveItems.length} small move items`}
            detail={form.smallMoveItems.map((item) => `${item.name} x${item.quantity}`).join(" · ") || "No items added yet"}
          />
        )}

        <SummarySection
          title="Date and budget"
          value={schedule?.moveDate ? dateFormatter.format(new Date(schedule.moveDate)) : "Date not set"}
          detail={[
            schedule?.preferredTime ? `Preferred time: ${schedule.preferredTime}` : null,
            schedule?.dateFlexibility ? `Flexibility: ${schedule.dateFlexibility}` : null,
            form.budgetBand ? `Budget band: ${form.budgetBand}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        />

        <SummarySection
          title="Photos"
          value={form.pendingPhotos.length ? `${form.pendingPhotos.length} local selections` : "No photos yet"}
          detail="The upload boundary stays local until object storage is connected."
        />

        <SummarySection
          title="Comments"
          value={form.customerComment.trim() || "No comments yet"}
        />

        {publishState?.potentialDuplicateExists || activeRequest?.duplicateRisk ? (
          <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-6 text-amber-950">
            It looks like you may already have a similar active request.
            <div className="mt-3 flex flex-wrap gap-3">
              <Link
                href="#request-list"
                className="inline-flex items-center rounded-full border border-amber-300 px-4 py-2 font-medium text-amber-950 transition hover:bg-amber-100"
              >
                View existing request
              </Link>
              <button
                type="button"
                onClick={() => setBanner(null)}
                className="inline-flex items-center rounded-full bg-amber-950 px-4 py-2 font-medium text-white transition hover:bg-amber-900 cursor-pointer"
              >
                Continue anyway
              </button>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  function renderAccountStep() {
    const isVerified = Boolean(user?.phoneVerified);
    return (
      <div className="space-y-6">
        <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-semibold text-slate-900">Account confirmation</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Publish uses the real auth foundation. Sign in first, then verify the phone number if
            required.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-[1.4fr_0.8fr]">
            <label className="space-y-2">
              {renderInputLabel("Google credential", "Development sign-in format: dev-google:subject:email:first:last")}
              <input
                value={pendingGoogleCredential}
                onChange={(event) => setPendingGoogleCredential(event.target.value)}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-950/10"
              />
            </label>
            <div className="flex items-end">
              <button
                type="button"
                onClick={handleSignIn}
                className="w-full rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 cursor-pointer"
              >
                Sign in
              </button>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleLogoutClick}
              className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 cursor-pointer"
            >
              Log out
            </button>
            <Link
              href="/auth"
              className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Open auth page
            </Link>
          </div>
        </div>

        <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-semibold text-slate-900">Phone verification</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Publish is blocked until the phone number is verified.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-[1.2fr_0.8fr]">
            <label className="space-y-2">
              {renderInputLabel("Phone number", "Use the same number that will be verified.")}
              <input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-950/10"
              />
            </label>
            <div className="flex items-end">
              <button
                type="button"
                onClick={handleRequestOtp}
                className="w-full rounded-full border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 cursor-pointer"
              >
                Request OTP
              </button>
            </div>
            <label className="space-y-2">
              {renderInputLabel("OTP code", "Enter the code you receive.")}
              <input
                value={otpCode}
                onChange={(event) => setOtpCode(event.target.value)}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-950/10"
              />
            </label>
            <div className="flex items-end">
              <button
                type="button"
                onClick={handleVerifyOtp}
                className="w-full rounded-full bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 cursor-pointer"
              >
                Verify phone
              </button>
            </div>
          </div>
          {otpDebugCode ? (
            <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950">
              Development OTP: {otpDebugCode}
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handlePublish}
              disabled={!isVerified}
              className={`rounded-full px-5 py-3 text-sm font-semibold transition cursor-pointer ${
                isVerified
                  ? "bg-slate-950 text-white hover:bg-slate-800"
                  : "cursor-not-allowed bg-slate-200 text-slate-500"
              }`}
            >
              Publish now
            </button>
            {!isVerified ? (
              <span className="text-sm leading-6 text-slate-500">
                The publish button activates after phone verification.
              </span>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  function renderPublishStep() {
    return (
      <div className="space-y-4">
        <div className="rounded-[28px] border border-emerald-200 bg-emerald-50 px-5 py-5 text-emerald-950">
          <h3 className="text-lg font-semibold">Request published</h3>
          <p className="mt-2 text-sm leading-6">
            The request is live and ready for the next phase of the product.
          </p>
        </div>
        {publishState?.moveRequest ? (
          <SummarySection
            title="Published request"
            value={publishState.moveRequest.id}
            detail={`Status: ${formatRequestStatus(publishState.moveRequest.status)}. Movers can now discover this request when marketplace access is available.`}
          />
        ) : null}
      </div>
    );
  }

  function renderStepBody() {
    if (!form.requestType && stepIndex > 0) {
      return (
        <div className="rounded-[24px] border border-slate-200 bg-white p-5 text-sm leading-6 text-slate-600 shadow-sm">
          Choose a move type first so the wizard can load the right fields.
        </div>
      );
    }

    switch (currentStep?.key) {
      case "move-type":
        return renderMoveTypeStep();
      case "route":
        return (
          <div className="space-y-4">
            {renderRouteFields("pickup", "Pickup")}
            {renderRouteFields("destination", "Destination")}
          </div>
        );
      case "apartment":
        return renderApartmentStep();
      case "inventory":
        return renderApartmentInventory();
      case "services":
        return renderSpecialItems();
      case "items":
        return renderSmallMoveItems();
      case "access":
        return (
          <div className="space-y-4">
            {renderRouteFields("pickup", "Pickup")}
            {renderRouteFields("destination", "Destination")}
          </div>
        );
      case "schedule":
        return renderScheduleStep();
      case "photos":
        return renderPhotosStep();
      case "review":
        return renderReviewStep();
      case "account":
        return renderAccountStep();
      case "publish":
        return renderPublishStep();
      default:
        return renderMoveTypeStep();
    }
  }

  const progressPercent = Math.max(0, Math.min(100, ((stepIndex + 1) / steps.length) * 100));

  return (
    <>
      <SiteHeader />
      <main id="main-content" className="site-container py-8 sm:py-12">
        <header className="mb-8 max-w-3xl">
          <Link href="/" className="inline-link mt-0">&larr; Back to home</Link>
          <p className="eyebrow mt-6">Create a request</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950 sm:text-5xl">
            Request a move in minutes.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
            Tell movers what needs moving, where it is going and when. Your draft is saved as you progress after sign-in.
          </p>
        </header>

      <section className="grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-6">
          <div
            id="wizard"
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-7"
          >
            <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-sky-800">
                  {locale === "he" ? `שלב ${stepIndex + 1} מתוך ${steps.length}` : `Step ${stepIndex + 1} of ${steps.length}`}
                </p>
                <h2 className="text-xl font-bold text-slate-950">{currentStep?.title ?? "Get started"}</h2>
                <p className="text-sm leading-6 text-slate-500">{currentStep?.description}</p>
              </div>
              <div className="text-sm font-medium text-slate-600">
                {locale === "he" ? `${Math.round(progressPercent)}% הושלמו` : `${Math.round(progressPercent)}% complete`}
              </div>
            </div>

            <div className="mt-4">
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-sky-700 transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            <div className="wizard-step-tabs mt-5 flex max-w-full gap-2 overflow-x-auto pb-2">
              {steps.map((step, index) => (
                <button
                  key={step.key}
                  type="button"
                  onClick={() => setStepIndex(index)}
                  className={`min-h-11 shrink-0 rounded-lg px-4 py-2 text-xs font-semibold transition cursor-pointer ${
                    index === stepIndex
                      ? "bg-slate-950 text-white"
                      : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {step.title}
                </button>
              ))}
            </div>

            <div className="mt-6 space-y-5">
              {isBootstrapping ? <LoadingState /> : renderBanner()}
              {renderStepBody()}
            </div>

            <div className="mt-6 flex flex-col gap-4 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={handleBack}
                disabled={stepIndex === 0}
                className={`button ${
                  stepIndex === 0
                    ? "cursor-not-allowed bg-slate-200 text-slate-400"
                    : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                Back
              </button>
              <div className="flex flex-col gap-2 sm:items-end">
                <button
                  type="button"
                  onClick={
                    stepIndex === accountStepIndex
                      ? handlePublish
                      : stepIndex === publishStepIndex
                        ? handleStartNewRequest
                        : handleContinue
                  }
                  disabled={busyAction !== null}
                  className="button button-primary disabled:cursor-wait disabled:opacity-70"
                >
                  {busyAction ??
                    (stepIndex === accountStepIndex
                      ? "Publish request"
                      : stepIndex === publishStepIndex
                        ? "Start new request"
                        : "Continue")}
                </button>
                <span className="max-w-sm text-sm text-slate-500 sm:text-right" aria-live="polite">{statusText}</span>
              </div>
            </div>
          </div>

          <section
            id="request-list"
            className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-slate-950">Continue request</h2>
                <p className="mt-1 text-sm text-slate-500">Pick up a saved draft where you left off.</p>
              </div>
              <div className="text-sm text-slate-500">
                {locale === "he" ? `${drafts.length} נשמרו` : `${drafts.length} saved`}
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {drafts.length ? (
                drafts.map((draft) => (
                  <button
                    key={draft.id}
                    type="button"
                    onClick={() => handleResumeDraft(draft.id)}
                    className="min-h-32 rounded-lg border border-slate-200 bg-white p-4 text-left transition hover:border-slate-400 hover:bg-slate-50 cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {formatRequestType(draft.requestType)}
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          {formatRequestStatus(draft.status)}
                        </p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                        {draft.currentVersionNumber ? `v${draft.currentVersionNumber}` : "Draft"}
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-slate-600">Created {dateFormatter.format(new Date(draft.createdAt))}</p>
                  </button>
                ))
              ) : (
                <div className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-sm leading-6 text-slate-500">
                  No saved request yet. Start above and your draft will appear here after the first save.
                </div>
              )}
            </div>
          </section>
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="eyebrow">Your Request</p>
              <h2 className="mt-2 text-xl font-bold text-slate-950">
                {form.requestType ? formatRequestType(form.requestType) : "New move"}
              </h2>
              <dl className="mt-4 space-y-2 text-sm">
                <StatRow
                  label="Route"
                  value={
                    form.pickup.city || form.destination.city
                      ? `${emptyString(form.pickup.city)} to ${emptyString(form.destination.city)}`
                      : "Add your route"
                  }
                />
                <StatRow
                  label="Budget"
                  value={form.budgetBand ? budgetLabels[form.budgetBand] : "Add a budget"}
                />
                <StatRow
                  label="Progress"
                  value={`${Math.round(progressPercent)}%`}
                />
                <StatRow
                  label="Save status"
                  value={activeRequest ? "Draft saved" : user ? "Ready to save" : "Sign in to save"}
                />
              </dl>
            </div>

          </div>
        </aside>
      </section>
      </main>
    </>
  );
}

function SummarySection({
  title,
  value,
  detail,
}: {
  title: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-semibold text-slate-500">{title}</p>
      <p className="mt-2 text-base font-semibold text-slate-950">{value || "Not set"}</p>
      {detail ? <p className="mt-1 text-sm leading-6 text-slate-600">{detail}</p> : null}
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-3 last:border-0">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-sm font-semibold text-slate-950">{value}</dd>
    </div>
  );
}
