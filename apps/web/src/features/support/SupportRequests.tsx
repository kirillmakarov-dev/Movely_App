"use client";
import { useCallback } from "react";
import { localeHref } from "@/lib/locale";
import Link from "@/components/SafeLink";
import { MovelyApiError } from "@/lib/movely-api";
import { getSupportCapabilities, getSupportRequests, supportEffectiveCount, supportStatuses, supportTopics, type SupportAudience, type SupportSearch } from "@/lib/support-api";
import { useSupportResource } from "./useSupportResource";
import SupportError from "./SupportError";
import { SupportReceiptNotice, SupportTime, supportStatusLabels, supportTopicLabels } from "./support-presentation";

export default function SupportRequests({ audience, search, invalid = false }: { audience: SupportAudience; search: SupportSearch; invalid?: boolean }) {
  const base = audience === "admin" ? "/admin/support" : "/account/support";
  const { type, status, page, pageSize } = search;
  const load = useCallback(async (signal: AbortSignal) => {
    if (invalid) throw new MovelyApiError("מספר העמוד או הסינון אינם תקינים.", { status: 400, errorCode: "INVALID_SUPPORT_QUERY" });
    const [requests, capabilities] = await Promise.all([getSupportRequests(audience, { type, status, page, pageSize }, signal), getSupportCapabilities(signal)]);
    return { requests, capabilities };
  }, [audience, type, status, page, pageSize, invalid]);
  const resource = useSupportResource(audience, `${base}-${JSON.stringify(search)}-${invalid}`, load);
  const pageHref = (value: number) => { const query = new URLSearchParams({ page: String(value) }); if (type) query.set("type", type); if (status) query.set("status", status); return `${base}?${query}`; };
  if (resource.view.kind === "loading") return <p role="status" className="text-base leading-7">בודקים את החשבון וטוענים פניות…</p>;
  if (resource.view.kind === "error") return <div className="space-y-4"><SupportError error={resource.view.error} retry={resource.refresh} /><Link href={base} className="button button-secondary">חזרה לרשימת הפניות</Link></div>;
  const { requests, capabilities } = resource.view.data;
  const total = supportEffectiveCount(requests);
  const filtered = Boolean(type || status);
  return <div className="space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-3xl font-bold">{audience === "admin" ? "ניהול פניות" : "הפניות שלי"}</h1><p className="mt-3 text-base leading-7">{audience === "admin" ? "קראו את הפנייה והיסטוריית הטיפול לפני מענה או שינוי מצב." : "כאן נמצאות פניות העזרה והבקשות שלכם בנוגע למידע אישי."}</p></div>{audience === "owner" && capabilities.requestsEnabled && <Link href="/account/support/new" className="button button-primary">פנייה חדשה</Link>}</header>
    {audience === "owner" && <SupportReceiptNotice />}
    <button type="button" className="button button-secondary" onClick={resource.refresh}>רענון הרשימה</button>
    {!capabilities.requestsEnabled && <p role="status" className="rounded-xl border border-amber-200 bg-white p-4 text-base leading-7">שליחת פניות והודעות חדשות אינה זמינה כעת. ההיסטוריה נשארת זמינה.{audience === "owner" ? " אפשר לבטל פנייה פתוחה בעמוד הפנייה." : " אפשר להעביר פנייה פתוחה לבדיקה."}</p>}
    <form action={localeHref(base)} method="get" className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto]">
      <label className="field-label text-base">נושא<select name="type" defaultValue={type ?? ""} className="field-control min-h-12 text-base" style={{ minHeight: 48 }}><option value="">כל הנושאים</option>{supportTopics.map((topic) => <option key={topic} value={topic}>{supportTopicLabels[topic]}</option>)}</select></label>
      <label className="field-label text-base">מצב<select name="status" defaultValue={status ?? ""} className="field-control min-h-12 text-base" style={{ minHeight: 48 }}><option value="">כל המצבים</option>{supportStatuses.map((value) => <option key={value} value={value}>{supportStatusLabels[value]}</option>)}</select></label>
      <div className="flex flex-wrap items-end gap-3"><button type="submit" className="button button-primary">הצגת פניות</button><Link href={base} className="button button-secondary">איפוס סינון</Link></div>
    </form>
    {requests.items.length ? <ul className="grid gap-4 md:grid-cols-2">{requests.items.map((request) => <li key={request.id} className="min-w-0 rounded-xl border border-slate-200 bg-white p-5"><h2 className="break-words text-xl font-bold"><Link href={`${base}/${request.id}`} className="inline-flex min-h-12 items-center underline decoration-slate-300 underline-offset-4">{request.subject}</Link></h2><p className="mt-2 text-base leading-7">{supportTopicLabels[request.type]}</p><p className="mt-2 text-base font-bold">{supportStatusLabels[request.status]}</p><p className="mt-3 text-base text-slate-600">עודכן: <SupportTime value={request.updatedAt} /></p><Link href={`${base}/${request.id}`} className="button button-secondary mt-4">צפייה בפנייה</Link></li>)}</ul>
      : <section className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-base leading-7"><h2 className="text-xl font-bold">{page > 1 && total > 0 ? "אין תוצאות בעמוד הזה" : filtered ? "לא נמצאו פניות לפי הסינון" : "עדיין אין פניות"}</h2><p className="mt-2">{page > 1 ? "הרשימה עשויה להשתנות. אפשר לחזור לעמוד הראשון." : filtered ? "אפשר לשנות את הנושא או המצב ולהציג שוב." : audience === "owner" ? "פניות שיירשמו בחשבון יופיעו כאן." : "פניות שיירשמו באתר יופיעו כאן."}</p>{page > 1 && <Link href={pageHref(1)} className="button button-secondary mt-4">לעמוד הראשון</Link>}</section>}
    <nav aria-label="עמודי פניות" className="flex flex-wrap items-center gap-4 text-base"><span>עמוד {page}</span>{page > 1 && <Link href={pageHref(page - 1)} className="button button-secondary">לעמוד הקודם</Link>}{page * pageSize < total && <Link href={pageHref(page + 1)} className="button button-secondary">לעמוד הבא</Link>}</nav>
  </div>;
}
