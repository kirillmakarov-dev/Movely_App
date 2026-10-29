"use client";
import { useCallback } from "react";
import Link from "@/components/SafeLink";
import { businessQuery, businessStatuses, getAdminBusinesses, type BusinessSearch } from "@/lib/business-api";
import { AdminGate, BusinessError, businessStatusLabels, useBusinessResource } from "./business-ui";
export default function AdminBusinesses({ search }: { search: BusinessSearch }) { return <AdminGate><BusinessList search={search} /></AdminGate>; }
function BusinessList({ search }: { search: BusinessSearch }) {
  const query = businessQuery(search);
  const load = useCallback((signal: AbortSignal) => getAdminBusinesses({ status: search.status, page: search.page, pageSize: search.pageSize }, signal), [search.status, search.page, search.pageSize]);
  const state = useBusinessResource(load, query);
  const pageHref = (page: number) => `/admin/businesses?${businessQuery({ ...search, page })}`;
  if (state.kind === "error") return <BusinessError error={state.error} retry={state.retry} />;
  return <div className="space-y-6"><form key={query} method="get" action="/admin/businesses" className="flex flex-wrap items-end gap-4 rounded-xl bg-white p-5"><input type="hidden" name="page" value="1" /><input type="hidden" name="pageSize" value={search.pageSize} /><label className="field-label">מצב העסק<select className="field-control" name="status" defaultValue={search.status ?? ""}><option value="">כל המצבים</option>{businessStatuses.map((s) => <option key={s} value={s}>{businessStatusLabels[s]}</option>)}</select></label><button type="submit" className="button button-primary">סינון עסקים</button><Link href="/admin/businesses" className="button button-secondary">איפוס סינון</Link></form>
    {state.kind === "loading" ? <p role="status">טוענים עסקים…</p> : <><p role="status">{state.data.items.length ? Math.max(state.data.totalCount, (state.data.page - 1) * state.data.pageSize + state.data.items.length) : state.data.totalCount} עסקים · עמוד {state.data.page}</p>{state.data.items.length ? <ul className="grid gap-4 md:grid-cols-2">{state.data.items.map((item) => <li key={item.id} className="min-w-0 rounded-xl border border-slate-200 bg-white p-5"><h2 className="break-words text-xl font-bold">{item.name || "פרופיל עסקי ללא שם"}</h2><p className="mt-2">{businessStatusLabels[item.status]}</p><Link href={`/admin/businesses/${item.id}`} className="button button-secondary mt-4">בדיקת העסק</Link></li>)}</ul> : <section className="rounded-xl bg-white p-5"><h2 className="text-xl font-bold">לא נמצאו עסקים בעמוד הזה</h2><Link href={pageHref(1)} className="button button-secondary mt-3">חזרה לעמוד הראשון</Link></section>}<nav className="flex flex-wrap justify-between gap-3" aria-label="עמודי עסקים">{search.page > 1 ? <Link className="button button-secondary" href={pageHref(search.page - 1)}>העמוד הקודם</Link> : <span />}{search.page * search.pageSize < state.data.totalCount ? <Link className="button button-secondary" href={pageHref(search.page + 1)}>העמוד הבא</Link> : null}</nav></>}
  </div>;
}
