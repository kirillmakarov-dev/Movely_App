"use client";

import Link from "@/components/SafeLink";
import { useEffect, useState } from "react";
import { getCurrentUser, getMyMoveRequests, type CurrentUser, type MoveRequestSummaryResponse } from "@/lib/movely-api";
import { formatRequestStatus, formatRequestType } from "@/lib/presentation";

export default function AccountRequests() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [requests, setRequests] = useState<MoveRequestSummaryResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let active = true;
    const timeout = new Promise<never>((_, reject) => {
      window.setTimeout(() => reject(new Error("הבקשות בחשבון פג זמן")), 2500);
    });
    Promise.race([Promise.all([getCurrentUser(), getMyMoveRequests().catch(() => [])]), timeout])
      .then(([currentUser, moveRequests]) => {
        if (!active) return;
        setUser(currentUser);
        setRequests(moveRequests);
      })
      .catch(() => {
        if (active) setUnavailable(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  if (loading) {
    return <div className="rounded-xl border border-slate-200 bg-white p-6" aria-live="polite">טוענים את הבקשות שלכם...</div>;
  }

  if (unavailable || !user) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-7">
        <h1 className="text-2xl font-bold">התחברו כדי לראות את הבקשות שלכם</h1>
        <p className="mt-3 text-slate-600">הטיוטות השמורות והבקשות שפורסמו יופיעו כאן.</p>
        <Link href="/auth" className="button button-primary mt-6">התחברות</Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-slate-500">ברוכים השבים, {user.firstName}</p>
          <h2 className="mt-1 text-2xl font-bold">הבקשות שלי</h2>
        </div>
        <Link href="/request/new" className="button button-primary">יצירת בקשה</Link>
      </div>

      {requests.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {requests.map((request) => {
            const isDraft = request.status === "Draft";
            return (
              <article key={request.id} className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold text-sky-800">{formatRequestType(request.requestType)}</p>
                    <h3 className="mt-2 text-xl font-bold">{formatRequestStatus(request.status)}</h3>
                  </div>
                  <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
                    {isDraft ? "טיוטה" : "בקשת לקוח"}
                  </span>
                </div>
                <p className="mt-5 text-sm text-slate-500">עודכן {new Intl.DateTimeFormat("he", { dateStyle: "medium" }).format(new Date(request.updatedAt))}</p>
                <Link href={isDraft ? "/request/new" : `/requests/${request.id}`} className="request-card-link">
                  {isDraft ? "המשך" : "צפייה בבקשה"} <span aria-hidden="true">&rarr;</span>
                </Link>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <h3 className="text-xl font-bold">עדיין אין בקשות</h3>
          <p className="mt-2 text-slate-600">צרו את בקשת ההובלה הראשונה שלכם ושמרו אותה כטיוטה.</p>
          <Link href="/request/new" className="button button-primary mt-5">יצירת בקשה</Link>
        </div>
      )}
    </div>
  );
}
