"use client";

import { useEffect, useState } from "react";
import { getLocalities, type Locality } from "@/lib/movely-api";

type State = { attempt: number } & (
  | { kind: "loading" | "unavailable" }
  | { kind: "ready"; localities: Locality[] }
);

/** One native suggestion list can serve multiple independently controlled city inputs. */
export default function LocalitySuggestions({ id }: { id: string }) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<State>({ kind: "loading", attempt: 0 });
  const view: State = state.attempt === attempt ? state : { kind: "loading", attempt };

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let settled = false;
    const timeout = setTimeout(() => {
      if (!active || settled) return;
      settled = true;
      controller.abort();
      setState({ kind: "unavailable", attempt });
    }, 10_000);
    void getLocalities(controller.signal).then((localities) => {
      if (!active || settled) return;
      settled = true;
      clearTimeout(timeout);
      setState({ kind: "ready", localities: [...localities].sort((a, b) => a.name.localeCompare(b.name, "he")), attempt });
    }).catch(() => {
      if (!active || settled) return;
      settled = true;
      clearTimeout(timeout);
      setState({ kind: "unavailable", attempt });
    });
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [attempt]);

  return <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-base leading-7 text-slate-700">
    <p id={`${id}-hint`}>הקלידו שם עיר או יישוב. אפשר לבחור מההצעות או להמשיך בהקלדה חופשית.</p>
    <datalist id={id}>
      {view.kind === "ready" ? view.localities.map((locality) => <option key={locality.code} value={locality.name} />) : null}
    </datalist>
    {view.kind === "ready" ? <p className="mt-2 text-sm"><a href="https://data.gov.il/he/datasets/population_authority/citiesandsettelments" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">מקור שמות היישובים: רשות האוכלוסין וההגירה / data.gov.il (נפתח בלשונית חדשה)</a></p> : null}
    {view.kind === "loading" ? <p role="status" className="mt-2 text-sm">טוענים הצעות ליישובים… אפשר להמשיך להקליד.</p> : null}
    {view.kind === "unavailable" ? <div className="mt-2">
      <p role="status">לא הצלחנו לטעון את ההצעות. אפשר להקליד את שם העיר או היישוב בעצמכם.</p>
      <button type="button" className="button button-secondary mt-3" onClick={() => setAttempt((value) => value + 1)}>טעינת ההצעות מחדש</button>
    </div> : null}
  </div>;
}
