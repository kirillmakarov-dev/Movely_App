import Link from "@/components/SafeLink";
import type { MarketplaceRequest } from "./mock-requests";
import { formatRequestType } from "@/lib/presentation";

export default function RequestCard({ request }: { request: MarketplaceRequest }) {
  const isApartment = request.requestType === "ApartmentMove";

  return (
    <article className="request-card">
      <div className="flex items-start justify-between gap-4">
        <span className={`category-label ${isApartment ? "category-apartment" : "category-small"}`}>
          {formatRequestType(request.requestType)}
        </span>
        <span className="text-xs text-slate-500">{request.publishedLabel}</span>
      </div>
      <h3 className="mt-5 text-xl font-semibold tracking-tight text-slate-950">
        {request.pickupCity} <span aria-hidden="true">&rarr;</span> {request.destinationCity}
      </h3>
      <p className="mt-2 text-sm font-medium text-slate-700">{request.moveDate}</p>

      <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        {isApartment ? (
          <>
            <div><dt className="text-slate-500">Rooms</dt><dd className="mt-1 font-medium">{request.rooms}</dd></div>
            <div><dt className="text-slate-500">Boxes</dt><dd className="mt-1 font-medium">{request.boxes}</dd></div>
          </>
        ) : (
          <>
            <div><dt className="text-slate-500">Item</dt><dd className="mt-1 font-medium">{request.itemName}</dd></div>
            <div><dt className="text-slate-500">Quantity</dt><dd className="mt-1 font-medium">{request.quantity}</dd></div>
          </>
        )}
        <div><dt className="text-slate-500">Budget</dt><dd className="mt-1 font-medium">{request.budget}</dd></div>
        <div><dt className="text-slate-500">Photos</dt><dd className="mt-1 font-medium">{request.photoCount}</dd></div>
      </dl>

      <Link href={`/requests/${request.id}`} className="request-card-link">
        View Request <span aria-hidden="true">&rarr;</span>
      </Link>
    </article>
  );
}
