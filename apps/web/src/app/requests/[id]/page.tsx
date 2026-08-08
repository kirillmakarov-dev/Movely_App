import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import { formatRequestType } from "@/lib/presentation";
import { getMockMarketplaceRequest } from "@/features/marketplace/mock-requests";

type RequestDetailsPageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: RequestDetailsPageProps): Promise<Metadata> {
  const { id } = await params;
  const request = getMockMarketplaceRequest(id);
  return { title: request ? `${request.pickupCity} to ${request.destinationCity}` : "Request" };
}

export default async function RequestDetailsPage({ params }: RequestDetailsPageProps) {
  const { id } = await params;
  const request = getMockMarketplaceRequest(id);
  if (!request) notFound();

  return (
    <>
      <SiteHeader />
      <main id="main-content">
        <header className="page-hero">
          <div className="site-container">
            <Link href="/requests" className="inline-link mt-0">&larr; Back to requests</Link>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <span className={`category-label ${request.requestType === "ApartmentMove" ? "category-apartment" : "category-small"}`}>
                {formatRequestType(request.requestType)}
              </span>
              <span className="text-sm text-slate-500">Published {request.publishedLabel}</span>
            </div>
            <h1 className="page-title mt-5">{request.pickupCity} <span aria-hidden="true">&rarr;</span> {request.destinationCity}</h1>
            <p className="page-lead">Move date: <strong className="text-slate-900">{request.moveDate}</strong></p>
          </div>
        </header>

        <section className="section-block pt-10!">
          <div className="site-container grid gap-8 lg:grid-cols-[1fr_360px]">
            <div className="space-y-6">
              <section className="rounded-xl border border-slate-200 bg-white p-6">
                <h2 className="text-xl font-bold">Move overview</h2>
                <dl className="mt-5 grid gap-5 sm:grid-cols-2">
                  <div><dt className="text-sm text-slate-500">Pickup access</dt><dd className="mt-1 font-medium">{request.pickupAccess}</dd></div>
                  <div><dt className="text-sm text-slate-500">Destination access</dt><dd className="mt-1 font-medium">{request.destinationAccess}</dd></div>
                  {request.rooms ? <div><dt className="text-sm text-slate-500">Rooms</dt><dd className="mt-1 font-medium">{request.rooms}</dd></div> : null}
                  {request.boxes ? <div><dt className="text-sm text-slate-500">Boxes</dt><dd className="mt-1 font-medium">{request.boxes}</dd></div> : null}
                  {request.itemName ? <div><dt className="text-sm text-slate-500">Item</dt><dd className="mt-1 font-medium">{request.itemName}</dd></div> : null}
                  {request.quantity ? <div><dt className="text-sm text-slate-500">Quantity</dt><dd className="mt-1 font-medium">{request.quantity}</dd></div> : null}
                  <div><dt className="text-sm text-slate-500">Budget</dt><dd className="mt-1 font-medium">{request.budget}</dd></div>
                  <div><dt className="text-sm text-slate-500">Photos</dt><dd className="mt-1 font-medium">{request.photoCount}</dd></div>
                </dl>
              </section>
              <section className="rounded-xl border border-slate-200 bg-white p-6">
                <h2 className="text-xl font-bold">Inventory</h2>
                <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                  {request.inventory.map((item) => <li key={item} className="border-l-2 border-sky-600 pl-3 text-slate-700">{item}</li>)}
                </ul>
              </section>
              {request.services.length ? (
                <section className="rounded-xl border border-slate-200 bg-white p-6">
                  <h2 className="text-xl font-bold">Additional services</h2>
                  <ul className="mt-4 space-y-2 text-slate-700">{request.services.map((service) => <li key={service}>{service}</li>)}</ul>
                </section>
              ) : null}
            </div>

            <aside className="h-fit rounded-xl border border-slate-300 bg-white p-6 lg:sticky lg:top-24">
              <p className="eyebrow">Customer contact</p>
              <h2 className="mt-2 text-2xl font-bold">Locked</h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">Contact information is protected. Lead purchasing will be introduced with the Phase 5 marketplace backend.</p>
              <button type="button" className="button mt-6 w-full cursor-not-allowed border-slate-200 bg-slate-100 text-slate-500" disabled>
                Buy Lead - Coming Later
              </button>
            </aside>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
