"use client";

import Link from "@/components/SafeLink";
import { useEffect, useState } from "react";
import { getCurrentUser, getMyMoveRequests, MovelyApiError, type CurrentUser, type MoveRequestSummaryResponse } from "@/lib/movely-api";
import { formatRequestStatus, formatRequestType } from "@/lib/presentation";

type LoadState = "loading" | "signed-out" | "forbidden" | "error" | "ready";
type Filter = "all" | "drafts" | "active" | "finished";
const filters: { value: Filter; label: string }[] = [
  { value: "all", label: "הכול" }, { value: "drafts", label: "טיוטות" },
  { value: "active", label: "בקשות פעילות" }, { value: "finished", label: "בקשות שהסתיימו" },
];

export default function AccountRequests() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [requests, setRequests] = useState<MoveRequestSummaryResponse[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [attempt, setAttempt] = useState(0);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => { controller.abort(); setState("error"); }, 10_000);
    async function load() {
      try {
        const currentUser = await getCurrentUser(controller.signal);
        if (controller.signal.aborted) return;
        if (!currentUser) { setState("signed-out"); return; }
        if (currentUser.role !== "Customer") { setState("forbidden"); return; }
        const result = await getMyMoveRequests(controller.signal);
        if (controller.signal.aborted) return;
        if (!Array.isArray(result)) throw new Error("Invalid request list response.");
        setUser(currentUser); setRequests(result); setState("ready");
      } catch (error) {
        if (controller.signal.aborted) return;
        setState(error instanceof MovelyApiError && error.status === 401 ? "signed-out"
          : error instanceof MovelyApiError && error.status === 403 ? "forbidden" : "error");
      } finally { clearTimeout(timeout); }
    }
    void load();
    return () => { controller.abort(); clearTimeout(timeout); };
  }, [attempt]);

  if (state !== "ready") {
    return <div className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8" aria-busy={state === "loading"}>
      <h1 className="text-2xl font-bold">הבקשות שלי</h1>
      {state === "loading" ? <p role="status" className="mt-4 text-base leading-7">טוענים את הבקשות שלכם…</p>
        : state === "signed-out" ? <>
          <p className="mt-4 text-base leading-7">התחברו כדי לראות את הטיוטות והבקשות שלכם.</p>
          <Link href="/auth" className="button button-primary mt-6">התחברות</Link>
        </> : state === "forbidden" ? <>
          <p role="status" className="mt-4 text-base leading-7">העמוד מיועד לחשבון לקוח. בקשות של לקוח אחר אינן מוצגות כאן.</p>
          <Link href="/auth" className="button button-secondary mt-6">מעבר לחשבון המתאים</Link>
        </> : <>
          <p role="alert" className="mt-4 text-base leading-7">לא הצלחנו לטעון את הבקשות. בדקו את החיבור ונסו שוב. הבקשות השמורות לא השתנו.</p>
          <button type="button" onClick={() => { setState("loading"); setAttempt((value) => value + 1); }} className="button button-primary mt-6">ניסיון נוסף</button>
        </>}
    </div>;
  }

  const visible = requests.filter((request) => filter === "all" || (filter === "drafts" ? request.status === "Draft"
    : filter === "active" ? ["Active", "Published"].includes(request.status)
      : ["Closed", "Cancelled", "Expired"].includes(request.status)));
  return <div className="min-w-0">
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="break-words text-base text-slate-600">ברוכים השבים, {user?.firstName}</p>
        <h1 className="mt-1 text-3xl font-bold">הבקשות שלי</h1>
        <p className="mt-3 text-base leading-7 text-slate-600">כאן אפשר להמשיך טיוטה, לבדוק בקשה ולעצור את החיפוש.</p>
      </div>
      <Link href="/request/new" className="button button-primary shrink-0">יצירת בקשה</Link>
    </div>
    {requests.length > 0 && <>
      <div className="flex flex-wrap gap-2" role="group" aria-label="סינון הבקשות">
        {filters.map((option) => <button key={option.value} type="button" aria-pressed={filter === option.value}
          onClick={() => setFilter(option.value)} className={`button ${filter === option.value ? "button-primary" : "button-secondary"}`}>{option.label}</button>)}
      </div>
      <p role="status" className="mt-4 text-base text-slate-600">{visible.length} בקשות מוצגות</p>
    </>}
    {visible.length ? <div className="mt-5 grid gap-4 md:grid-cols-2">
      {visible.map((request) => {
        const updated = new Date(request.updatedAt);
        return <article key={request.id} className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
          <p className="text-base font-bold text-sky-800">{formatRequestType(request.requestType)}</p>
          <h2 className="mt-2 text-xl font-bold">{formatRequestStatus(request.status)}</h2>
          <p className="mt-3 text-base text-slate-600">מספר בקשה: <bdi dir="ltr">{request.id.slice(0, 8)}</bdi></p>
          {Number.isFinite(updated.getTime()) && <p className="mt-2 text-base text-slate-600">עודכן <time dateTime={request.updatedAt}>{new Intl.DateTimeFormat("he", { dateStyle: "medium" }).format(updated)}</time></p>}
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href={`/account/requests/${encodeURIComponent(request.id)}`} className="button button-secondary">צפייה בבקשה</Link>
            {request.status === "Draft" && <Link href={`/request/new?requestId=${encodeURIComponent(request.id)}`} className="button button-primary">המשך הטיוטה</Link>}
          </div>
        </article>;
      })}
    </div> : <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center sm:p-8">
      <h2 className="text-xl font-bold">{requests.length ? "אין בקשות בקטגוריה הזאת" : "עדיין אין בקשות"}</h2>
      <p className="mt-3 text-base leading-7 text-slate-600">{requests.length ? "אפשר להציג שוב את כל הבקשות." : "צרו בקשת הובלה ושמרו אותה כטיוטה. תוכלו לחזור אליה מכאן."}</p>
      {requests.length ? <button type="button" onClick={() => setFilter("all")} className="button button-secondary mt-5">הצגת כל הבקשות</button>
        : <Link href="/request/new" className="button button-primary mt-5">יצירת בקשה</Link>}
    </div>}
  </div>;
}
