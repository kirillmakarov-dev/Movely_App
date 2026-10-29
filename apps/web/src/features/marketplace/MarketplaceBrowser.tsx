"use client";
import { useCallback, useMemo, useState } from "react";
import Link from "@/components/SafeLink";
import { getLocalities, MovelyApiError, type Locality } from "@/lib/movely-api";
import { getMarketplaceRequests, marketplaceBudgets, marketplaceQuery, parseMarketplaceFilters, type MarketplaceFilters } from "@/lib/marketplace-api";
import { budgetLabels } from "@/lib/presentation";
import RequestCard from "./RequestCard";
import MarketplaceAccessGate, { MarketplaceError } from "./MarketplaceAccessGate";
import useMarketplaceResource from "./useMarketplaceResource";
export default function MarketplaceBrowser({ filters = parseMarketplaceFilters({}), basePath = "/requests" }: { filters?: MarketplaceFilters; basePath?: "/requests" | "/mover/requests" }) {
  return <MarketplaceAccessGate><BrowserContent filters={filters} basePath={basePath} /></MarketplaceAccessGate>;
}
function BrowserContent({ filters, basePath }: { filters: MarketplaceFilters; basePath: "/requests" | "/mover/requests" }) {
  const query = marketplaceQuery(filters);
  const load = useCallback((signal: AbortSignal) => getMarketplaceRequests(parseMarketplaceFilters(Object.fromEntries(new URLSearchParams(query))), signal), [query]);
  const state = useMarketplaceResource(load, query);
  const loadCities = useCallback((signal: AbortSignal) => getLocalities(signal), []);
  const cities = useMarketplaceResource(loadCities, "localities");
  const cityData = cities.kind === "ready" ? cities.data : null;
  const options = useMemo(() => [...(cityData ?? [])].sort((a, b) => a.name.localeCompare(b.name, "he")), [cityData]);
  const pageHref = (page: number) => `${basePath}?${marketplaceQuery({ ...filters, page })}#marketplace-results`;
  const hasFilters = !!(filters.requestType || filters.pickupCityCode || filters.destinationCityCode || filters.moveDate || filters.budgetBand);
  // The count is approximate during concurrent publications/closures. Never
  // display fewer matches than the page we actually received proves exist.
  const effectiveTotalCount = state.kind === "ready" ? state.data.items.length > 0
    ? Math.max(state.data.totalCount, (state.data.page - 1) * state.data.pageSize + state.data.items.length)
    : state.data.totalCount : 0;
  if (state.kind === "error" && state.error instanceof MovelyApiError && [401, 403].includes(state.error.status)) return <MarketplaceError error={state.error} retry={state.retry} />;
  return <div className="min-w-0 space-y-6" dir="rtl">
    <form key={query} action={basePath} method="get" className="filter-shell space-y-5" aria-label="סינון בקשות הובלה">
      <input type="hidden" name="page" value="1" /><input type="hidden" name="pageSize" value={filters.pageSize} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="field-label">סוג הובלה<select name="requestType" className="field-control" defaultValue={filters.requestType ?? ""}><option value="">כל סוגי ההובלה</option><option value="ApartmentMove">הובלת דירה</option><option value="SmallMove">הובלה קטנה</option></select></label>
        {(["pickupCityCode", "destinationCityCode"] as const).map((field) => <CityFilter key={`${query}-${field}`} field={field} initialValue={filters[field] ?? ""} options={options} />)}
        <label className="field-label">תאריך ההובלה<input name="moveDate" type="date" className="field-control" defaultValue={filters.moveDate ?? ""} /></label>
        <label className="field-label">תקציב להובלה<select name="budgetBand" className="field-control" defaultValue={filters.budgetBand ?? ""}><option value="">כל התקציבים</option>{marketplaceBudgets.map((band) => <option value={band} key={band}>{budgetLabels[band]}</option>)}</select></label>
        <label className="field-label">מיון<select name="sort" className="field-control" defaultValue={filters.sort}><option value="Newest">החדשות ביותר</option><option value="MoveDate">תאריך ההובלה</option></select></label>
      </div>
      {cities.kind === "loading" ? <p role="status">טוענים את רשימת היישובים…</p> : cities.kind === "error" ? <div><p role="status">רשימת היישובים אינה זמינה. אפשר להשתמש בשאר המסננים או לנסות לטעון אותה שוב.</p><button type="button" onClick={cities.retry} className="button button-secondary mt-2">טעינת היישובים מחדש</button></div> : <p className="text-sm text-slate-600">מקור שמות היישובים: <a className="underline underline-offset-4" href="https://data.gov.il/he/datasets/population_authority/citiesandsettelments" target="_blank" rel="noopener noreferrer">רשות האוכלוסין וההגירה / data.gov.il (נפתח בלשונית חדשה)</a></p>}
      <div className="flex flex-wrap gap-3"><button className="button button-primary" type="submit">הצגת בקשות</button><Link href={basePath} className="button button-secondary">איפוס מסננים</Link></div>
    </form>
    <div id="marketplace-results" className="scroll-mt-24" aria-busy={state.kind === "loading"}>
      {state.kind === "loading" ? <p role="status" className="rounded-xl border border-slate-200 bg-white p-6">טוענים בקשות הובלה…</p> : state.kind === "error" ? <MarketplaceError error={state.error} retry={state.retry} /> : <>
        <p role="status" className="text-base text-slate-700">{effectiveTotalCount} בקשות מתאימות · עמוד {state.data.page}</p>
        {state.data.items.length ? <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{state.data.items.map((request) => <RequestCard request={request} key={request.id} returnQuery={query} fromMover={basePath === "/mover/requests"} />)}</div> : <section className="mt-5 rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center"><h2 className="text-xl font-bold">{state.data.totalCount > 0 ? "אין בקשות בעמוד הזה" : hasFilters ? "לא נמצאו בקשות למסננים האלה" : "אין כרגע בקשות זמינות"}</h2><p className="mt-3 leading-7 text-slate-700">אפשר לשנות את המסננים או לבדוק שוב מאוחר יותר.</p><Link href={state.data.totalCount > 0 ? pageHref(1) : basePath} className="button button-secondary mt-4">{state.data.totalCount > 0 ? "חזרה לעמוד הראשון" : "חזרה לכל הבקשות"}</Link></section>}
        <nav className="mt-6 flex flex-wrap items-center justify-between gap-3" aria-label="עמודי בקשות">{filters.page > 1 ? <Link href={pageHref(filters.page - 1)} className="button button-secondary">העמוד הקודם</Link> : <span />}{filters.page * filters.pageSize < effectiveTotalCount ? <Link href={pageHref(filters.page + 1)} className="button button-secondary">העמוד הבא</Link> : null}</nav>
      </>}
    </div>
  </div>;
}

function CityFilter({ field, initialValue, options }: { field: "pickupCityCode" | "destinationCityCode"; initialValue: string; options: Locality[] }) {
  const [value, setValue] = useState(initialValue);
  return <label className="field-label">{field === "pickupCityCode" ? "עיר איסוף" : "עיר יעד"}<select name={field} value={value} onChange={(event) => setValue(event.target.value)} className="field-control">
    <option value="">כל היישובים</option>
    {value && !options.some((option) => option.code === value) ? <option value={value}>היישוב שנבחר בקישור</option> : null}
    {options.map((locality) => <option key={locality.code} value={locality.code}>{locality.name}</option>)}
  </select></label>;
}
