"use client";

import { useDeferredValue, useState } from "react";
import RequestCard from "./RequestCard";
import { mockMarketplaceRequests } from "./mock-requests";
import type { MoveRequestType } from "@/lib/movely-api";
import { useLocale } from "@/components/LocaleProvider";

type CategoryFilter = "All" | MoveRequestType;

export default function MarketplaceBrowser() {
  const { locale } = useLocale();
  const [category, setCategory] = useState<CategoryFilter>("All");
  const [pickupCity, setPickupCity] = useState("");
  const [destinationCity, setDestinationCity] = useState("");
  const [sort, setSort] = useState("newest");
  const deferredPickup = useDeferredValue(pickupCity.toLowerCase());
  const deferredDestination = useDeferredValue(destinationCity.toLowerCase());

  const visibleRequests = mockMarketplaceRequests
    .filter((request) => category === "All" || request.requestType === category)
    .filter((request) => request.pickupCity.toLowerCase().includes(deferredPickup))
    .filter((request) => request.destinationCity.toLowerCase().includes(deferredDestination))
    .toSorted((a, b) => sort === "move-date" ? a.moveDate.localeCompare(b.moveDate) : a.id.localeCompare(b.id));

  const categories: Array<{ value: CategoryFilter; label: string }> = [
    { value: "All", label: "הכול" },
    { value: "ApartmentMove", label: "הובלות דירה" },
    { value: "SmallMove", label: "הובלות קטנות" },
  ];

  return (
    <div>
      <div className="tab-list" role="tablist" aria-label="קטגוריות בקשות">
        {categories.map((item) => (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={category === item.value}
            className="tab-button"
            onClick={() => setCategory(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="filter-shell mt-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
          <label className="field-label lg:col-span-2">
            עיר איסוף
            <input className="field-control" value={pickupCity} onChange={(event) => setPickupCity(event.target.value)} placeholder="כל עיר" />
          </label>
          <label className="field-label lg:col-span-2">
            עיר יעד
            <input className="field-control" value={destinationCity} onChange={(event) => setDestinationCity(event.target.value)} placeholder="כל עיר" />
          </label>
          <label className="field-label">
            תאריך
            <input className="field-control" type="date" aria-label="תאריך הובלה" />
          </label>
          <label className="field-label">
            תקציב
            <select className="field-control" defaultValue="any" aria-label="טווח תקציב">
              <option value="any">כל תקציב</option>
              <option value="1000">עד 1,000 ₪</option>
              <option value="2000">1,000-2,000 ₪</option>
              <option value="3000">2,000 ₪ ומעלה</option>
            </select>
          </label>
        </div>
      </div>

      <div className="mt-7 flex items-center justify-between gap-4">
        <p className="text-sm text-slate-600">
          <strong className="text-slate-950">{visibleRequests.length}</strong>{" "}
          {locale === "he" ? "בקשות" : "requests"}
        </p>
        <label className="flex items-center gap-2 text-sm font-bold text-slate-600">
          מיון
          <select className="field-control min-w-36" value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="newest">החדשות ביותר</option>
            <option value="move-date">תאריך ההובלה</option>
          </select>
        </label>
      </div>

      {visibleRequests.length ? (
        <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {visibleRequests.map((request) => <RequestCard key={request.id} request={request} />)}
        </div>
      ) : (
        <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <h2 className="text-xl font-bold">לא נמצאו בקשות מתאימות</h2>
          <p className="mt-2 text-slate-600">נסו עיר אחרת או קטגוריית בקשה אחרת.</p>
        </div>
      )}
    </div>
  );
}
