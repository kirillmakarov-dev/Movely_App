"use client";
import { useCallback, useMemo, useState } from "react";
import { getLocalities, type Locality } from "@/lib/movely-api";
import { useBusinessResource } from "./business-ui";
export default function ServiceAreas({ value, onChange, disabled }: { value: Locality[]; onChange: (value: Locality[]) => void; disabled: boolean }) {
  const load = useCallback((signal: AbortSignal) => getLocalities(signal), []);
  const state = useBusinessResource(load, "business-localities");
  const [search, setSearch] = useState(""); const [selected, setSelected] = useState("");
  const data = state.kind === "ready" ? state.data : null;
  const options = useMemo(() => [...(data ?? [])].sort((a, b) => a.name.localeCompare(b.name, "he")), [data]);
  const matches = options.filter((l) => l.name.includes(search.trim()) && !value.some((v) => v.code === l.code));
  return <fieldset className="space-y-3 rounded-xl border border-slate-200 p-4" disabled={disabled}><legend className="px-2 font-bold">אזורי שירות</legend><p id="service-area-help" className="text-sm leading-6">בחרו בין יישוב אחד ל־20 יישובים שבהם העסק נותן שירות. אפשר לחפש שם ולהוסיף כמה יישובים.</p>
    <label className="field-label">חיפוש יישוב<input className="field-control" value={search} onChange={(e) => { setSearch(e.target.value); setSelected(""); }} aria-describedby="service-area-help" /></label>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end"><label className="field-label min-w-0 flex-1">יישוב להוספה<select className="field-control" value={selected} onChange={(e) => setSelected(e.target.value)}><option value="">בחרו יישוב</option>{matches.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}</select></label><button type="button" className="button button-secondary" disabled={!selected || value.length >= 20} onClick={() => { const locality = options.find((l) => l.code === selected); if (locality && value.length < 20) onChange([...value, locality]); setSelected(""); }}>הוספת יישוב</button></div>
    {state.kind === "loading" ? <p role="status">טוענים יישובים…</p> : state.kind === "error" ? <div><p role="status">לא הצלחנו לטעון את היישובים. הבחירות שלכם נשמרו.</p><button type="button" className="button button-secondary" onClick={state.retry}>טעינת יישובים מחדש</button></div> : <p className="text-sm text-slate-600">מקור שמות היישובים: <a className="underline" href="https://data.gov.il/he/datasets/population_authority/citiesandsettelments" target="_blank" rel="noopener noreferrer">רשות האוכלוסין וההגירה / data.gov.il (נפתח בלשונית חדשה)</a></p>}
    <p aria-live="polite">נבחרו {value.length} מתוך 20 יישובים</p><ul className="flex flex-wrap gap-2">{value.map((l) => <li key={l.code} className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white ps-3"><span>{l.name}</span><button type="button" className="min-h-11 min-w-11 px-3 underline" aria-label={`הסרת ${l.name}`} onClick={() => onChange(value.filter((v) => v.code !== l.code))}>הסרה</button></li>)}</ul>
  </fieldset>;
}
