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

const currencyFormatter = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const dateFormatter = new Intl.DateTimeFormat("he-IL", {
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

function preferredTimeLabel(value: PreferredMoveTime | null | undefined) {
  if (!value) return "";
  return PREFERRED_TIME_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

function dateFlexibilityLabel(value: MoveDateFlexibility | null | undefined) {
  if (!value) return "";
  return DATE_FLEXIBILITY_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

function flowStepsForType(requestType: MoveRequestType | null): FlowStep[] {
  if (requestType === "SmallMove") {
    return [
      {
        key: "move-type",
        title: "סוג הובלה",
        description: "אשרו את קטגוריית הבקשה.",
      },
      {
        key: "items",
        title: "פריטים",
        description: "הוסיפו פריט אחד או יותר עם כמות ומידות משוערות.",
      },
      {
        key: "route",
        title: "איסוף ויעד",
        description: "הוסיפו ערים, כתובות מדויקות ופרטי גישה.",
      },
      {
        key: "access",
        title: "גישה",
        description: "ציינו קומות, מעלית, מדרגות וגישה למשאית.",
      },
      {
        key: "schedule",
        title: "תאריך ותקציב",
        description: "בחרו תאריך, שעה, גמישות וטווח תקציב.",
      },
      {
        key: "review",
        title: "בדיקה",
        description: "עברו על הבקשה שנשמרה בשרת לפני ההתחברות.",
      },
      {
        key: "account",
        title: "חשבון / אימות טלפון",
        description: "התחברו ואמתו את מספר הטלפון אם צריך.",
      },
      {
        key: "publish",
        title: "פרסום",
        description: "שלחו את הבקשה לפרסום.",
      },
    ];
  }

  return [
    {
      key: "move-type",
      title: "סוג הובלה",
      description: "אשרו את קטגוריית הבקשה.",
    },
    {
      key: "route",
      title: "איסוף ויעד",
      description: "הוסיפו ערים, כתובות מדויקות ופרטי גישה.",
    },
    {
      key: "apartment",
      title: "פרטי הדירה",
      description: "בחרו מספר חדרים וארגזים.",
    },
    {
      key: "inventory",
      title: "ארגזים ותכולה",
      description: "הוסיפו פריטים נפוצים וכמויות.",
    },
    {
      key: "services",
      title: "שירותים ופריטים מיוחדים",
      description: "הוסיפו אריזה, פירוק ופריטים רגישים.",
    },
    {
      key: "schedule",
      title: "תאריך ותקציב",
      description: "בחרו תאריך, שעה, גמישות וטווח תקציב.",
    },
    {
      key: "photos",
      title: "תמונות והערות",
      description: "שמרו את גבול העלאת התמונות מוכן בלי העלאות מדומות.",
    },
    {
      key: "review",
      title: "בדיקה",
      description: "עברו על הבקשה שנשמרה בשרת לפני ההתחברות.",
    },
    {
      key: "account",
      title: "חשבון / אימות טלפון",
      description: "התחברו ואמתו את מספר הטלפון אם צריך.",
    },
    {
      key: "publish",
      title: "פרסום",
      description: "שלחו את הבקשה לפרסום.",
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
    title: "הבקשה נכשלה",
    message: error instanceof Error ? error.message : "משהו השתבש.",
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
      window.setTimeout(() => reject(new Error("שירות החשבון איטי מהצפוי.")), timeoutMs);
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
  const [statusText, setStatusText] = useState("מוכנים להתחיל.");
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
            ? `מחוברים כ-${currentUser.firstName}.`
            : `מחוברים כ-${currentUser.firstName}. עדיין נדרש אימות טלפון.`,
        );
      }
    } catch {
      setBanner({
        tone: "info",
        title: "התחילו את הבקשה",
        message: "אפשר למלא את הפרטים עכשיו. התחברו כשתהיו מוכנים לשמור את הטיוטה.",
      });
      setStatusText("אשף הבקשה פועל במצב מקומי עד שה־API זמין.");
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
      title: requestType === "ApartmentMove" ? "נבחרה הובלת דירה" : "נבחרה הובלה קטנה",
      message:
        user?.id && !activeRequest
          ? "המשיכו לבנות ולשמור את טיוטת הבקשה."
          : "אפשר להמשיך לעצב את הבקשה לפני ההתחברות. טיוטת השרת תיווצר כששומרים.",
    });
  }

  async function ensureSavedDraft() {
    if (!form.requestType) {
      throw new Error("בחרו קודם סוג הובלה.");
    }

    if (activeRequest) {
      return activeRequest;
    }

    if (!user) {
      throw new Error("התחברו כדי ליצור את הטיוטה השמורה.");
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
      setStatusText("המשיכו מקומית ואז התחברו כדי לשמור את הטיוטה.");
      return null;
    }

    if (!form.requestType) {
      throw new Error("בחרו קודם סוג הובלה.");
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
        setStatusText("עובדים מקומית. התחברו כשתהיו מוכנים לשמור.");
      }
      setStepIndex((current) => Math.min(current + 1, publishStepIndex));
      setBanner({
        tone: "success",
        title: "השלב נשמר",
        message:
          user && activeRequest
            ? "הטיוטה נשמרה בשרת."
            : "השלב נשמר מקומית ויישמר ברגע שתתחברו.",
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
      setStatusText(`טיוטה ${request.id.slice(0, 8)} נטענה.`);
      setBanner({
        tone: "info",
        title: "הטיוטה חודשה",
        message: "אפשר להמשיך כעת מהמצב שנשמר בשרת.",
      });
    } catch (error) {
      const normalized = normalizeApiError(error);
      setBanner(normalized);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSignIn() {
    setBusyAction("מתחברים");
    try {
      const signedIn = await signInWithGoogle(pendingGoogleCredential.trim());
      setUser(signedIn);
      setStatusText(`מחוברים כ-${signedIn.firstName}.`);
      setBanner({
        tone: "success",
        title: "התחברות הצליחה",
        message: signedIn.phoneVerified
          ? "מספר הטלפון כבר מאומת."
          : "אמתו את מספר הטלפון לפני הפרסום.",
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
    setBusyAction("מתנתקים");
    try {
      await logout();
      setUser(null);
      setActiveRequest(null);
      setStatusText("התנתקתם.");
      setBanner({
        tone: "info",
        title: "התנתקתם",
        message: "מצב האשף המקומי נשאר בעמוד.",
      });
    } catch (error) {
      const normalized = normalizeApiError(error);
      setBanner(normalized);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleRequestOtp() {
    setBusyAction("מבקשים קוד");
    try {
      const response = await requestPhoneCode(phone);
      setOtpDebugCode(response.debugCode ?? "");
      setStatusText(`קוד האימות נשלח ל-${response.normalizedPhone}.`);
      setBanner({
        tone: "info",
        title: "קוד נשלח",
        message: response.debugCode
          ? `קוד פיתוח: ${response.debugCode}`
          : "בדקו את הטלפון שלכם לקוד האימות.",
      });
    } catch (error) {
      const normalized = normalizeApiError(error);
      setBanner(normalized);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleVerifyOtp() {
    setBusyAction("מאמתים קוד");
    try {
      const response = await verifyPhoneCode(phone, otpCode.trim());
      setStatusText(
        response.phoneVerified
          ? "הטלפון אומת."
          : "התקבלה תשובת האימות, אך הטלפון עדיין לא מאומת.",
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
        title: "הטלפון אומת",
        message: "אפשר לפרסם את הבקשה עכשיו.",
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
    setBusyAction("מפרסמים");
    try {
      if (!user) {
        setStepIndex(accountStepIndex);
        setBanner({
          tone: "warning",
          title: "נדרשת התחברות",
          message: "צרו או אשרו את החשבון לפני פרסום הבקשה.",
        });
        return;
      }

      if (!user.phoneVerified) {
        setStepIndex(accountStepIndex);
        setBanner({
          tone: "warning",
          title: "נדרש אימות טלפון",
          message: "אמתו את מספר הטלפון לפני פרסום הבקשה.",
        });
        return;
      }

      const savedRequest = await ensureSavedDraft();
      const response = await publishMoveRequest(savedRequest.id);
      setPublishState(response);
      setActiveRequest(response.moveRequest);
      setForm(hydrateFromRequest(response.moveRequest));
      setStepIndex(publishStepIndex);
      setStatusText("הבקשה פורסמה.");
      setBanner({
        tone: response.potentialDuplicateExists ? "warning" : "success",
        title: response.potentialDuplicateExists ? "זוהתה כפילות אפשרית" : "פורסם",
        message: response.potentialDuplicateExists
          ? "נראה שכבר יש לכם בקשה פעילה דומה."
          : "בקשת הלקוח שלכם כעת פעילה.",
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
      title: "מוכנים לבקשה חדשה",
      message: "בחרו סוג הובלה והתחילו מחדש.",
    });
    setStatusText("מוכנים להתחיל.");
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
            אפשר לבחור עכשיו סוג הובלה ולהמשיך לעצב את הבקשה מקומית. התחברו כשתהיו מוכנים לשמור
            את הטיוטה בשרת.
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
            {renderInputLabel("עיר", "השתמשו בשם העיר המדויק במסלול ההובלה.")}
            <input
              aria-label={`${title} עיר`}
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
            {renderInputLabel("כתובת מדויקת", "השדה נשאר בתוך תהליך הלקוח עד שניתנת גישת הצגה.")}
            <input
              aria-label={`${title} כתובת מדויקת`}
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
            {renderInputLabel("קומה", "לא חובה, אבל מועיל לתכנון הגישה.")}
            <input
              type="number"
              aria-label={`${title} קומה`}
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
            {renderInputLabel("מעלית", "כן או לא.")}
            <div className="grid grid-cols-2 gap-2">
              {["כן", "לא"].map((value) => (
                <button
                  type="button"
                  key={value}
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      [prefix]: {
                        ...current[prefix],
                        hasElevator: value === "כן",
                      },
                    }))
                  }
                  className={`rounded-2xl border px-4 py-3 text-sm font-medium transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 ${
                    data.hasElevator === (value === "כן")
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
            {renderInputLabel("מעלית מתאימה לרהיטים גדולים", "בחרו את ההתאמה הקרובה ביותר למעלית בבניין.")}
            <div className="grid gap-2 md:grid-cols-3">
              {[
                { value: "Unknown" as const, label: "לא יודע/ת" },
                { value: "Yes" as const, label: "כן" },
                { value: "No" as const, label: "לא" },
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
            {renderInputLabel("מדרגות / הערות גישה", "תארו מדרגות, פניות חדות או מגבלות גישה אחרות.")}
            <textarea
              aria-label={`${title} מדרגות או הערות גישה`}
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
            {renderInputLabel("גישה למשאית / חניה", "תארו את מסלול ההעמסה ואת הגישה מהכביש.")}
            <textarea
              aria-label={`${title} גישה למשאית או חניה`}
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
            {renderInputLabel("מרחק חניה", "כמה רחוקה המשאית מהכניסה?")}
            <input
              type="number"
              aria-label={`${title} מרחק חניה`}
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
                <p className="text-sm font-semibold text-slate-900">פריט {index + 1}</p>
                <div className="grid gap-2 md:grid-cols-2">
                  <label className="space-y-2">
                    {renderInputLabel("קטגוריה", "בחרו את סוג ההובלה.")}
                    <select
                      aria-label="קטגוריה"
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
                    {renderInputLabel("שם / תיאור", "שם ברור של הפריט עוזר למובילים להעריך את המאמץ.")}
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
                    {renderInputLabel("כמות", "השתמשו בכפתורי ההגדלה וההפחתה.")}
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
                    {renderInputLabel("אורך ס\"מ", "מידות אופציונליות.")}
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
                    {renderInputLabel("רוחב ס\"מ", "מידות אופציונליות.")}
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
                    {renderInputLabel("גובה ס\"מ / ק\"ג", "מידות או משקל אופציונליים.")}
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
                  {renderInputLabel("משקל משוער ק\"ג", "אופציונלי אם המוביל צריך עוד פרטי תכנון.")}
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
                הסרה
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
          הוסיפו פריט נוסף
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
                    <p className="text-sm leading-6 text-slate-500">נבחר עבור תכולת הדירה.</p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="space-y-2">
                      {renderInputLabel("שם תצוגה", "שנו את השם אם צריך עוד פירוט.")}
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
                      {renderInputLabel("תיאור", "מידע נוסף אופציונלי.")}
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
                  הסרה
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
          <p className="text-sm font-semibold text-slate-900">שירותים נוספים</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {[
              {
                key: "furnitureDisassembly",
                label: "פירוק רהיטים",
                checked: form.furnitureDisassembly,
              },
              {
                key: "furnitureAssembly",
                label: "הרכבת רהיטים",
                checked: form.furnitureAssembly,
              },
              {
                key: "packingAssistance",
                label: "סיוע באריזה",
                checked: form.packingAssistance,
              },
              {
                key: "packingMaterials",
                label: "חומרי אריזה",
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
                  סמנו כשהמוביל צריך לתכנן טיפול מיוחד.
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
                    <p className="text-sm leading-6 text-slate-500">נבחר כפריט הדורש טיפול מיוחד.</p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="space-y-2">
                      {renderInputLabel("שם תצוגה", "שנו את השם אם צריך עוד פירוט.")}
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
                      {renderInputLabel("תיאור", "מידע נוסף אופציונלי.")}
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
                  הסרה
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
          <legend className="px-2 text-sm font-semibold text-slate-900">גודל הדירה</legend>
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
          <legend className="px-2 text-sm font-semibold text-slate-900">ארגזים</legend>
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
              <p className="text-sm font-semibold text-slate-900">תכולה נפוצה</p>
              <p className="text-sm leading-6 text-slate-500">הוסיפו את הפריטים המשפיעים ביותר על הצעת המחיר.</p>
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
            {renderInputLabel("תאריך הובלה", "בחרו את התאריך המועדף.")}
            <input
              type="date"
              value={form.moveDate}
              onChange={(event) => updateForm({ moveDate: event.target.value })}
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-950/10"
            />
          </label>
          <div className="space-y-2">
            {renderInputLabel("שעה מועדפת", "בחרו את חלון ההגעה.")}
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
            {renderInputLabel("גמישות בתאריך", "ציינו עד כמה התאריך קשיח.")}
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
            {renderInputLabel("טווח תקציב", "בחרו את הטווח הקרוב ביותר לתקציב הלקוח.")}
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
          <p className="text-sm font-semibold text-slate-900">בסיס העלאת התמונות</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            גבול ההעלאה לאחסון האובייקטים מוכן לשלב הבא. כרגע הקבצים שנבחרו נשארים מקומית כדי שלא
            נדמה העלאה מוצלחת לייצור.
          </p>
          <label className="mt-4 block space-y-2">
            {renderInputLabel("בחירת תמונות", "הן יישארו ממתינות עד שיחוברו ההעלאות.")}
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
                  <p className="text-sm text-slate-500">ממתין להעלאה, {photo.sizeLabel}</p>
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
                  הסרה
                </button>
              </div>
            ))
          ) : (
            <div className="rounded-[24px] border border-dashed border-slate-300 p-6 text-sm leading-6 text-slate-500">
              עדיין לא נבחרו תמונות. הוסיפו אותן כשתרצו לתעד את הגודל או הגישה של ההובלה.
            </div>
          )}
        </div>

        <label className="space-y-2 block">
          {renderInputLabel("הערות", "ספרו למובילים על כל דבר שלא נכנס לטופס.")}
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
            התצוגה המקדימה עדיין מקומית. התחברו ושמרו כדי לבדוק את הבקשה שמגובה בשרת.
          </div>
        ) : null}
        <SummarySection
          title="סוג הובלה"
          value={form.requestType ? formatRequestType(form.requestType) : "לא נבחרה הובלה"}
        />
        <SummarySection
          title="מסלול"
          value={`${emptyString(pickup?.city)} → ${emptyString(destination?.city)}`.trim()}
          detail={`איסוף ${emptyString(pickup?.exactAddress)} · יעד ${emptyString(destination?.exactAddress)}`}
        />
        <SummarySection
          title="גישה באיסוף"
          value={[
            pickup?.floor != null ? `קומה ${pickup.floor}` : null,
            pickup?.hasElevator != null ? (pickup.hasElevator ? "מעלית" : "אין מעלית") : null,
            pickup?.parkingDistanceMeters != null ? `${pickup.parkingDistanceMeters} מ' מהחניה` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
          detail={pickup?.stairsInfo ?? "אין עדיין הערות על מדרגות"}
        />
        <SummarySection
          title="גישה ביעד"
          value={[
            destination?.floor != null ? `קומה ${destination.floor}` : null,
            destination?.hasElevator != null ? (destination.hasElevator ? "מעלית" : "אין מעלית") : null,
            destination?.parkingDistanceMeters != null
              ? `${destination.parkingDistanceMeters} מ' מהחניה`
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
          detail={destination?.stairsInfo ?? "אין עדיין הערות על מדרגות"}
        />

        {form.requestType === "ApartmentMove" ? (
          <>
            <SummarySection
              title="פרטי הדירה"
              value={form.apartmentRooms ? `${form.apartmentRooms} חדרים` : "מספר החדרים לא הוגדר"}
              detail={`ארגזים: ${form.smallBoxes} קטנים, ${form.mediumBoxes} בינוניים, ${form.largeBoxes} גדולים`}
            />
            <SummarySection
              title="ארגזים ותכולה"
              value={`${form.apartmentInventory.length} פריטי תכולה`}
              detail={form.apartmentInventory.map((item) => `${item.name} × ${item.quantity}`).join(" · ") || "עדיין לא נוספה תכולה"}
            />
            <SummarySection
              title="שירותים נוספים"
              value={[
                form.furnitureDisassembly ? "פירוק" : null,
                form.furnitureAssembly ? "הרכבה" : null,
                form.packingAssistance ? "עזרה באריזה" : null,
                form.packingMaterials ? "חומרי אריזה" : null,
              ]
                .filter(Boolean)
                .join(" · ") || "לא נבחרו שירותים"}
              detail={form.specialItems.map((item) => item.name).join(" · ") || "עדיין לא נוספו פריטים מיוחדים"}
            />
          </>
        ) : (
          <SummarySection
            title="פריטים"
            value={`${form.smallMoveItems.length} פריטים`}
            detail={form.smallMoveItems.map((item) => `${item.name} × ${item.quantity}`).join(" · ") || "עדיין לא נוספו פריטים"}
          />
        )}

        <SummarySection
          title="תאריך ותקציב"
          value={schedule?.moveDate ? dateFormatter.format(new Date(schedule.moveDate)) : "התאריך לא הוגדר"}
          detail={[
            schedule?.preferredTime ? `שעה מועדפת: ${preferredTimeLabel(schedule.preferredTime)}` : null,
            schedule?.dateFlexibility ? `גמישות: ${dateFlexibilityLabel(schedule.dateFlexibility)}` : null,
            form.budgetBand ? `טווח תקציב: ${budgetLabels[form.budgetBand]}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        />

        <SummarySection
          title="תמונות"
          value={form.pendingPhotos.length ? `${form.pendingPhotos.length} בחירות מקומיות` : "אין עדיין תמונות"}
          detail="גבול ההעלאה נשאר מקומי עד שיחובר אחסון האובייקטים."
        />

        <SummarySection
          title="הערות"
          value={form.customerComment.trim() || "אין עדיין הערות"}
        />

        {publishState?.potentialDuplicateExists || activeRequest?.duplicateRisk ? (
          <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-6 text-amber-950">
            נראה שכבר יש לכם בקשה פעילה דומה.
            <div className="mt-3 flex flex-wrap gap-3">
              <Link
                href="#request-list"
                className="inline-flex items-center rounded-full border border-amber-300 px-4 py-2 font-medium text-amber-950 transition hover:bg-amber-100"
              >
                צפייה בבקשה קיימת
              </Link>
              <button
                type="button"
                onClick={() => setBanner(null)}
                className="inline-flex items-center rounded-full bg-amber-950 px-4 py-2 font-medium text-white transition hover:bg-amber-900 cursor-pointer"
              >
                להמשיך בכל זאת
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
          <p className="text-sm font-semibold text-slate-900">אימות החשבון</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            הפרסום משתמש בתשתית האימות האמיתית. התחברו קודם, ואז אמתו את מספר הטלפון אם צריך.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-[1.4fr_0.8fr]">
            <label className="space-y-2">
              {renderInputLabel("פרטי Google", "פורמט התחברות לפיתוח: dev-google:subject:email:first:last")}
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
                התחברות
              </button>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleLogoutClick}
              className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 cursor-pointer"
            >
              התנתקות
            </button>
            <Link
              href="/auth"
              className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              פתיחת עמוד האימות
            </Link>
          </div>
        </div>

        <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-semibold text-slate-900">אימות טלפון</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            הפרסום חסום עד שמספר הטלפון מאומת.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-[1.2fr_0.8fr]">
            <label className="space-y-2">
              {renderInputLabel("מספר טלפון", "השתמשו באותו מספר שיאומת.")}
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
                בקשת קוד
              </button>
            </div>
            <label className="space-y-2">
              {renderInputLabel("קוד אימות", "הזינו את הקוד שקיבלתם.")}
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
                אימות טלפון
              </button>
            </div>
          </div>
          {otpDebugCode ? (
            <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950">
              קוד פיתוח: {otpDebugCode}
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
              פרסמו עכשיו
            </button>
            {!isVerified ? (
              <span className="text-sm leading-6 text-slate-500">
                כפתור הפרסום יופעל אחרי אימות הטלפון.
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
          <h3 className="text-lg font-semibold">הבקשה פורסמה</h3>
          <p className="mt-2 text-sm leading-6">
            הבקשה פעילה ומוכנה לשלב הבא של המוצר.
          </p>
        </div>
        {publishState?.moveRequest ? (
          <SummarySection
            title="בקשה שפורסמה"
            value={publishState.moveRequest.id}
            detail={`סטטוס: ${formatRequestStatus(publishState.moveRequest.status)}. מובילים יוכלו לאתר את הבקשה הזו כשהגישה לשוק תהיה זמינה.`}
          />
        ) : null}
      </div>
    );
  }

  function renderStepBody() {
    if (!form.requestType && stepIndex > 0) {
      return (
        <div className="rounded-[24px] border border-slate-200 bg-white p-5 text-sm leading-6 text-slate-600 shadow-sm">
          בחרו קודם סוג הובלה כדי שהאשף יטען את השדות המתאימים.
        </div>
      );
    }

    switch (currentStep?.key) {
      case "move-type":
        return renderMoveTypeStep();
      case "route":
        return (
          <div className="space-y-4">
            {renderRouteFields("pickup", "איסוף")}
            {renderRouteFields("destination", "יעד")}
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
            {renderRouteFields("pickup", "איסוף")}
            {renderRouteFields("destination", "יעד")}
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
          <Link href="/" className="inline-link mt-0">&larr; חזרה לדף הבית</Link>
          <p className="eyebrow mt-6">יצירת בקשה</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950 sm:text-5xl">
            יוצרים בקשת הובלה תוך דקות.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
            ספרו למובילים מה צריך להעביר, לאן ומתי. לאחר ההתחברות הטיוטה נשמרת תוך כדי ההתקדמות.
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
                <h2 className="text-xl font-bold text-slate-950">{currentStep?.title ?? "בואו נתחיל"}</h2>
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

            <div className="wizard-step-tabs mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {steps.map((step, index) => (
                <button
                  key={step.key}
                  type="button"
                  onClick={() => setStepIndex(index)}
                  className={`min-h-11 w-full rounded-lg px-4 py-2 text-xs font-semibold transition cursor-pointer ${
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
                חזרה
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
                      ? "פרסום הבקשה"
                      : stepIndex === publishStepIndex
                        ? "בקשה חדשה"
                        : "המשך")}
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
                <h2 className="text-xl font-bold text-slate-950">המשך בקשה</h2>
                <p className="mt-1 text-sm text-slate-500">המשיכו טיוטה שמורה מהמקום שבו עצרתם.</p>
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
                        {draft.currentVersionNumber ? `v${draft.currentVersionNumber}` : "טיוטה"}
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-slate-600">נוצרה {dateFormatter.format(new Date(draft.createdAt))}</p>
                  </button>
                ))
              ) : (
                <div className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-sm leading-6 text-slate-500">
                  עדיין אין בקשה שמורה. התחילו למעלה והטיוטה תופיע כאן לאחר השמירה הראשונה.
                </div>
              )}
            </div>
          </section>
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="eyebrow">הבקשה שלכם</p>
              <h2 className="mt-2 text-xl font-bold text-slate-950">
                {form.requestType ? formatRequestType(form.requestType) : "הובלה חדשה"}
              </h2>
              <dl className="mt-4 space-y-2 text-sm">
                <StatRow
                  label="מסלול"
                  value={
                    form.pickup.city || form.destination.city
                      ? `${emptyString(form.pickup.city)} → ${emptyString(form.destination.city)}`
                      : "הוסיפו מסלול"
                  }
                />
                <StatRow
                  label="תקציב"
                  value={form.budgetBand ? budgetLabels[form.budgetBand] : "הוסיפו תקציב"}
                />
                <StatRow
                  label="התקדמות"
                  value={`${Math.round(progressPercent)}%`}
                />
                <StatRow
                  label="מצב שמירה"
                  value={activeRequest ? "טיוטה נשמרה" : user ? "מוכנים לשמירה" : "התחברו כדי לשמור"}
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
