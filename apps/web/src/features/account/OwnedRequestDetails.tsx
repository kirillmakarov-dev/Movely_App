"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "@/components/SafeLink";
import {
  cancelMoveRequest, closeMoveRequest, getMoveRequest, MovelyApiError,
  type MoveItemDto, type MoveLocationDto, type MoveRequestResponse,
} from "@/lib/movely-api";
import { budgetLabels, formatRequestStatus, formatRequestType } from "@/lib/presentation";
import PublicationStatus from "./PublicationStatus";
import {
  APARTMENT_INVENTORY_OPTIONS, DATE_FLEXIBILITY_OPTIONS, PREFERRED_TIME_OPTIONS,
  SMALL_MOVE_CATEGORIES, SPECIAL_ITEM_OPTIONS,
} from "@/features/request-flow/request-flow-data";

type Failure = "network" | "timeout" | "unauthorized" | "forbidden" | "missing";
type LoadState = { attempt: number } & (
  | { kind: "loading" }
  | { kind: "ready"; request: MoveRequestResponse }
  | { kind: "error"; failure: Failure }
);
type Action = "close" | "cancel";
type ActionState = null | { kind: "confirm" | "busy"; action: Action } | { kind: "uncertain" | "error" };

const failureCopy: Record<Failure, { title: string; message: string }> = {
  network: { title: "לא הצלחנו לטעון את הבקשה", message: "בדקו את החיבור ונסו שוב." },
  timeout: { title: "טעינת הבקשה נמשכת זמן רב מדי", message: "בדקו את החיבור ונסו שוב." },
  unauthorized: { title: "התחברו כדי לצפות בבקשה", message: "יש להיכנס לחשבון שבו יצרתם את הבקשה." },
  forbidden: { title: "אין גישה לבקשה בחשבון הזה", message: "אפשר לצפות רק בבקשות שלכם. בדקו שנכנסתם לחשבון המתאים." },
  missing: { title: "הבקשה לא נמצאה", message: "ייתכן שהקישור אינו תקין או שהבקשה אינה זמינה בחשבון הזה." },
};

function isRequestForRoute(value: unknown, requestId: string): value is MoveRequestResponse {
  if (typeof value !== "object" || value === null) return false;
  const request = value as Partial<MoveRequestResponse>;
  return typeof request.id === "string" && request.id.toLowerCase() === requestId.toLowerCase()
    && typeof request.status === "string" && ["Draft", "Published", "Active", "Closed", "Cancelled", "Expired"].includes(request.status);
}

function displayDate(value: string | null | undefined, dateOnly = false) {
  if (!value) return "לא צוין";
  const date = new Date(dateOnly ? `${value.slice(0, 10)}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return "לא צוין";
  return new Intl.DateTimeFormat("he-IL", { dateStyle: "long", timeZone: dateOnly ? "UTC" : "Asia/Jerusalem" }).format(date);
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return <div className="min-w-0"><dt className="text-sm text-slate-600">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words font-medium text-slate-950">{children ?? "לא צוין"}</dd></div>;
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 sm:p-6"><h2 className="text-xl font-bold text-slate-950">{title}</h2><div className="mt-5">{children}</div></section>;
}

function LocationDetails({ title, location }: { title: string; location: MoveLocationDto | null }) {
  return <Panel title={title}><dl className="grid gap-4 sm:grid-cols-2">
    <Detail label="עיר">{location?.city || "לא צוינה"}</Detail>
    <Detail label="כתובת מדויקת">{location?.exactAddress || "לא צוינה"}</Detail>
    <Detail label="קומה">{location?.floor === 0 ? "קומת קרקע" : location?.floor}</Detail>
    <Detail label="מעלית">{location?.hasElevator == null ? "לא צוין" : location.hasElevator ? "יש מעלית" : "אין מעלית"}</Detail>
    <Detail label="התאמת המעלית לרהיטים">{location?.elevatorFurnitureSuitability === "Yes" ? "מתאימה" : location?.elevatorFurnitureSuitability === "No" ? "אינה מתאימה" : "לא ידוע"}</Detail>
    <Detail label="מדרגות">{location?.stairsInfo || "לא צוין"}</Detail>
    <Detail label="גישה למשאית">{location?.truckAccessInfo || "לא צוין"}</Detail>
    <Detail label="מרחק מהחניה">{location?.parkingDistanceMeters == null ? "לא צוין" : `${location.parkingDistanceMeters} מטרים`}</Detail>
  </dl></Panel>;
}

function itemName(item: MoveItemDto) {
  return item.name?.trim()
    || APARTMENT_INVENTORY_OPTIONS.find((option) => option.value === item.apartmentInventoryType)?.label
    || SPECIAL_ITEM_OPTIONS.find((option) => option.value === item.specialItemType)?.label
    || SMALL_MOVE_CATEGORIES.find((option) => option.value === item.smallMoveCategory)?.label
    || "פריט";
}

function Items({ title, items }: { title: string; items: MoveItemDto[] }) {
  return <Panel title={title}>{items.length ? <ul className="space-y-4">{items.map((item, index) => <li key={index} className="min-w-0 rounded-lg border border-slate-200 p-4">
    <h3 className="break-words text-lg font-bold">{itemName(item)}</h3>
    {item.description ? <p className="mt-2 whitespace-pre-wrap break-words leading-7 text-slate-700">{item.description}</p> : null}
    <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
      <Detail label="כמות">{item.quantity}</Detail>
      {item.lengthCm != null ? <Detail label='אורך (ס״מ)'>{item.lengthCm}</Detail> : null}
      {item.widthCm != null ? <Detail label='רוחב (ס״מ)'>{item.widthCm}</Detail> : null}
      {item.heightCm != null ? <Detail label='גובה (ס״מ)'>{item.heightCm}</Detail> : null}
      {item.approximateWeightKg != null ? <Detail label='משקל משוער (ק״ג)'>{item.approximateWeightKg}</Detail> : null}
    </dl>
  </li>)}</ul> : <p className="text-slate-600">לא נוספו פריטים.</p>}</Panel>;
}

export default function OwnedRequestDetails({ requestId }: { requestId: string }) {
  // A new route never renders the previous owner's request while its GET starts.
  return <OwnedRequestContent key={requestId} requestId={requestId} />;
}

function OwnedRequestContent({ requestId }: { requestId: string }) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<LoadState>({ kind: "loading", attempt: 0 });
  const [actionState, setActionState] = useState<ActionState>(null);
  const [notice, setNotice] = useState("");
  const mounted = useRef(false);
  const mutationPending = useRef(false);
  const generation = useRef(0);
  const [mutationBusy, setMutationBusy] = useState(false);
  const [publicationBusy, setPublicationBusy] = useState(false);
  const confirmationHeading = useRef<HTMLHeadingElement>(null);
  const actionTrigger = useRef<HTMLButtonElement | null>(null);
  const view: LoadState = state.attempt === attempt ? state : { kind: "loading", attempt };
  const refresh = useCallback(() => {
    generation.current += 1;
    setActionState(null);
    setNotice("");
    setPublicationBusy(false);
    setAttempt((value) => value + 1);
  }, []);
  const publicationAccessDenied = useCallback((status: number) => {
    generation.current += 1;
    setState({ kind: "error", attempt, failure: status === 401 ? "unauthorized" : status === 403 ? "forbidden" : "missing" });
    setActionState(null); setNotice("");
  }, [attempt]);

  useEffect(() => {
    let foreground = document.visibilityState === "visible" && document.hasFocus();
    const focus = () => { if (document.visibilityState === "visible" && !foreground) { foreground = true; refresh(); } };
    const blur = () => { foreground = false; };
    const visibility = () => { if (document.visibilityState === "hidden") blur(); else focus(); };
    const restored = (event: PageTransitionEvent) => { if (event.persisted) { blur(); focus(); } };
    window.addEventListener("focus", focus); window.addEventListener("blur", blur); window.addEventListener("pageshow", restored); document.addEventListener("visibilitychange", visibility);
    return () => { window.removeEventListener("focus", focus); window.removeEventListener("blur", blur); window.removeEventListener("pageshow", restored); document.removeEventListener("visibilitychange", visibility); };
  }, [refresh]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let active = true;
    let settled = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      if (!active || settled) return;
      settled = true;
      controller.abort();
      setState({ kind: "error", failure: "timeout", attempt });
    }, 10_000);
    void getMoveRequest(requestId, controller.signal).then((request) => {
      if (!active || settled) return;
      settled = true;
      clearTimeout(timeout);
      if (!isRequestForRoute(request, requestId)) {
        setState({ kind: "error", failure: "network", attempt });
        return;
      }
      setState({ kind: "ready", request, attempt });
    }).catch((error: unknown) => {
      if (!active || settled) return;
      settled = true;
      clearTimeout(timeout);
      const status = error instanceof MovelyApiError ? error.status : 0;
      const failure: Failure = status === 401 ? "unauthorized" : status === 403 ? "forbidden" : status === 404 ? "missing" : "network";
      setState({ kind: "error", failure, attempt });
    });
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [requestId, attempt]);

  useEffect(() => {
    if (actionState?.kind === "confirm") confirmationHeading.current?.focus();
    else if (actionState === null) actionTrigger.current?.focus();
  }, [actionState]);

  async function confirmAction(action: Action) {
    if (mutationPending.current || publicationBusy) return;
    mutationPending.current = true;
    setMutationBusy(true);
    const startedGeneration = generation.current;
    setActionState({ kind: "busy", action });
    try {
      const request = await (action === "close" ? closeMoveRequest(requestId) : cancelMoveRequest(requestId));
      if (!mounted.current || generation.current !== startedGeneration) return;
      if (!isRequestForRoute(request, requestId) || request.status !== (action === "close" ? "Closed" : "Cancelled")) {
        setActionState({ kind: "uncertain" });
        return;
      }
      setState({ kind: "ready", request, attempt });
      setActionState(null);
      setNotice(action === "close" ? "חיפוש המוביל נסגר. פרטי הבקשה נשארים זמינים כאן." : "הבקשה בוטלה. פרטי הבקשה נשארים זמינים כאן.");
    } catch (error) {
      if (!mounted.current || generation.current !== startedGeneration) return;
      if (error instanceof MovelyApiError && [401, 403, 404].includes(error.status)) {
        const failure = error.status === 401 ? "unauthorized" : error.status === 403 ? "forbidden" : "missing";
        setState({ kind: "error", failure, attempt });
        setActionState(null);
        return;
      }
      setActionState({ kind: error instanceof MovelyApiError && error.status > 0 ? "error" : "uncertain" });
    } finally {
      mutationPending.current = false;
      if (mounted.current) setMutationBusy(false);
    }
  }

  const request = view.kind === "ready" ? view.request : null;
  const version = request?.currentVersion;
  const canClose = request?.status === "Active";
  const canCancel = request && ["Draft", "Published", "Active"].includes(request.status);
  const services = version?.apartmentMove?.additionalServices;
  const selectedServices = services ? [
    services.furnitureDisassembly && "פירוק רהיטים", services.furnitureAssembly && "הרכבת רהיטים",
    services.packingAssistance && "סיוע באריזה", services.packingMaterials && "חומרי אריזה",
  ].filter(Boolean) : [];

  return <div className="min-w-0 space-y-6" dir="rtl">
    <Link href="/account/requests" className="button button-secondary">חזרה לבקשות שלי</Link>
    <header>
      <p className="eyebrow">הבקשה בחשבון שלכם</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">פרטי הבקשה שלי</h1>
      {request ? <div className="mt-4 flex flex-wrap items-center gap-3"><span className="category-label category-apartment">{formatRequestType(request.requestType)}</span><span className="rounded-lg bg-slate-100 px-3 py-2 font-bold text-slate-900">{formatRequestStatus(request.status)}</span></div> : null}
    </header>

    {view.kind === "loading" ? <div role="status" aria-busy="true" className="rounded-xl border border-slate-200 bg-white p-6">טוענים את פרטי הבקשה…</div> : null}
    {view.kind === "error" ? <section role="alert" className="rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="text-xl font-bold">{failureCopy[view.failure].title}</h2><p className="mt-3 leading-7 text-slate-700">{failureCopy[view.failure].message}</p>
      <div className="mt-5 flex flex-wrap gap-3">
        {view.failure === "unauthorized" || view.failure === "forbidden" ? <Link href="/auth" className="button button-primary">כניסה לחשבון</Link> : null}
        <button type="button" className="button button-secondary" onClick={refresh}>ניסיון נוסף</button>
      </div>
    </section> : null}

    {request ? <>
      {notice ? <p role="status" className="rounded-xl border border-teal-200 bg-teal-50 p-4 leading-7 text-teal-950">{notice}</p> : null}
      {request.status === "Draft" || canClose || canCancel ? <Panel title="ניהול הבקשה">
        <div hidden={!!actionState} className={actionState ? "hidden" : "flex flex-wrap gap-3"}>
          {request.status === "Draft" ? <Link href={`/request/new?requestId=${encodeURIComponent(request.id)}`} className="button button-primary">המשך עריכת הטיוטה</Link> : null}
          {canClose ? <button type="button" className="button button-primary" disabled={mutationBusy || publicationBusy} onClick={(event) => { actionTrigger.current = event.currentTarget; setActionState({ kind: "confirm", action: "close" }); }}>סיום חיפוש מוביל</button> : null}
          {canCancel ? <button type="button" className="button button-secondary" disabled={mutationBusy || publicationBusy} onClick={(event) => { actionTrigger.current = event.currentTarget; setActionState({ kind: "confirm", action: "cancel" }); }}>ביטול הבקשה</button> : null}
        </div>
        {actionState?.kind === "confirm" || actionState?.kind === "busy" ? <div role="group" aria-labelledby="request-action-heading" aria-busy={actionState.kind === "busy"}>
          <h3 id="request-action-heading" ref={confirmationHeading} tabIndex={-1} className="text-lg font-bold">{actionState.action === "close" ? "לסיים את חיפוש המוביל?" : "לבטל את הבקשה?"}</h3>
          <p className="mt-3 leading-7 text-slate-700">{actionState.action === "close" ? "הבקשה תיסגר וחיפוש המוביל יסתיים. פרטי הבקשה יישמרו בחשבון. לא ניתן לפתוח אותה מחדש." : "הבקשה תבוטל ולא תהיה זמינה לפעילות חדשה. הפרטים יישמרו בחשבון. לא ניתן להחזיר אותה למצב פעיל."}</p>
          <p className="mt-3 leading-7 text-slate-700">הפעולה באתר אינה מוחקת פרטי קשר שכבר שותפו ואינה מבטלת סיכום נפרד עם מוביל.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" className="button button-secondary" disabled={actionState.kind === "busy"} onClick={() => setActionState(null)}>חזרה ללא שינוי</button>
            <button type="button" className="button button-primary" disabled={actionState.kind === "busy"} onClick={() => void confirmAction(actionState.action)}>{actionState.kind === "busy" ? "מעדכנים את הבקשה…" : actionState.action === "close" ? "אישור סיום החיפוש" : "אישור ביטול הבקשה"}</button>
          </div>
        </div> : null}
        {actionState?.kind === "uncertain" || actionState?.kind === "error" ? <div role="alert">
          <h3 className="text-lg font-bold">{actionState.kind === "uncertain" ? "לא התקבל אישור על הפעולה" : "לא ניתן להשלים את הפעולה כרגע"}</h3>
          <p className="mt-3 leading-7 text-slate-700">{actionState.kind === "uncertain" ? "ייתכן שהפעולה בוצעה למרות שלא התקבלה תשובה. בדקו את מצב הבקשה לפני פעולה נוספת." : "ייתכן שמצב הבקשה השתנה. רעננו את הפרטים כדי לראות את המצב הנוכחי."}</p>
          <button type="button" className="button button-secondary mt-4" onClick={refresh}>בדיקת מצב הבקשה</button>
        </div> : null}
      </Panel> : null}

      <PublicationStatus key={`${request.currentVersion?.id ?? "empty"}-${request.status}-${attempt}`} requestId={request.id} reviewedVersionId={request.currentVersion?.id ?? null} requestStatus={request.status} disabled={mutationBusy || publicationBusy || !!actionState} onRefreshRequest={refresh} onAccessDenied={publicationAccessDenied} onBusyChange={setPublicationBusy} />

      <Panel title="מצב הבקשה"><dl className="grid gap-4 sm:grid-cols-2">
        <Detail label="נוצרה בתאריך">{displayDate(request.createdAt)}</Detail><Detail label="עודכנה בתאריך">{displayDate(request.updatedAt)}</Detail>
        {request.publishedAt ? <Detail label="פורסמה בתאריך">{displayDate(request.publishedAt)}</Detail> : null}
        {request.closedAt ? <Detail label="נסגרה בתאריך">{displayDate(request.closedAt)}</Detail> : null}
        {request.cancelledAt ? <Detail label="בוטלה בתאריך">{displayDate(request.cancelledAt)}</Detail> : null}
      </dl></Panel>

      {version ? <div id="owned-request-content" tabIndex={-1} className="scroll-mt-24 space-y-6">
        <div className="grid min-w-0 gap-6 xl:grid-cols-2"><LocationDetails title="מאיפה מובילים" location={version.pickup} /><LocationDetails title="לאן מובילים" location={version.destination} /></div>
        <Panel title="מועד ותקציב"><dl className="grid gap-4 sm:grid-cols-2">
          <Detail label="תאריך ההובלה">{displayDate(version.schedule?.moveDate, true)}</Detail>
          <Detail label="שעה מועדפת">{PREFERRED_TIME_OPTIONS.find((option) => option.value === version.schedule?.preferredTime)?.label ?? "לא צוינה"}</Detail>
          <Detail label="גמישות בתאריך">{DATE_FLEXIBILITY_OPTIONS.find((option) => option.value === version.schedule?.dateFlexibility)?.label ?? "לא צוינה"}</Detail>
          <Detail label="תקציב להובלה">{version.budgetBand ? budgetLabels[version.budgetBand] : "לא צוין"}</Detail>
        </dl></Panel>
        {version.apartmentMove ? <Panel title="הדירה והארגזים"><dl className="grid grid-cols-2 gap-4">
          <Detail label="מספר חדרים">{version.apartmentMove.numberOfRooms}</Detail>
          <Detail label="ארגזים קטנים">{version.apartmentMove.boxes?.small}</Detail>
          <Detail label="ארגזים בינוניים">{version.apartmentMove.boxes?.medium}</Detail>
          <Detail label="ארגזים גדולים">{version.apartmentMove.boxes?.large}</Detail>
        </dl></Panel> : null}
        <Items title="תכולת ההובלה" items={[...(version.apartmentMove?.inventoryItems ?? []), ...(version.smallMoveItems ?? [])]} />
        <Items title="פריטים מיוחדים" items={version.specialItems ?? []} />
        <Panel title="שירותים נוספים">{selectedServices.length ? <ul className="list-inside list-disc space-y-2 text-slate-700">{selectedServices.map((service) => <li key={String(service)}>{service}</li>)}</ul> : <p className="text-slate-600">לא נבחרו שירותים נוספים.</p>}</Panel>
        <Panel title="הערות שלכם"><p className="whitespace-pre-wrap break-words leading-7 text-slate-700">{version.customerComment || "לא נוספו הערות."}</p></Panel>
      </div> : <Panel title="פרטי ההובלה"><p className="leading-7 text-slate-700">עדיין לא נשמרו פרטי הובלה בבקשה הזאת.</p></Panel>}
      <Panel title="תמונות"><p className="leading-7 text-slate-600">הצגת תמונות אינה זמינה כרגע.</p></Panel>
    </> : null}
  </div>;
}
