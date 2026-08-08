import Link from "next/link";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import RequestCard from "@/features/marketplace/RequestCard";
import { mockMarketplaceRequests } from "@/features/marketplace/mock-requests";

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main id="main-content">
        <section className="hero-section">
          <div className="site-container grid items-center gap-12 py-16 lg:grid-cols-[1.08fr_0.92fr] lg:py-24">
            <div>
              <p className="eyebrow">Moving, made clearer</p>
              <h1 className="hero-title">Need something moved?</h1>
              <p className="hero-copy">
                Describe your move once and let suitable movers find the job, without calling dozens of companies.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href="/request/new" className="button button-primary button-large">Create Request</Link>
                <Link href="/requests" className="button button-secondary button-large">Browse Requests</Link>
              </div>
              <p className="mt-5 text-sm text-slate-500">Free to create. Your contact details stay protected.</p>
            </div>
            <div className="route-preview" aria-label="Example move request from Harish to Tel Aviv">
              <div className="route-preview-topline">
                <span>New request</span>
                <span>Apartment Move</span>
              </div>
              <div className="route-line">
                <div><span className="route-dot" /><p>Harish</p><small>Pickup</small></div>
                <span className="route-arrow" aria-hidden="true">&rarr;</span>
                <div><span className="route-dot route-dot-end" /><p>Tel Aviv</p><small>Destination</small></div>
              </div>
              <div className="route-stats">
                <div><strong>3</strong><span>rooms</span></div>
                <div><strong>18</strong><span>boxes</span></div>
                <div><strong>18 Aug</strong><span>move date</span></div>
              </div>
            </div>
          </div>
        </section>

        <section className="section-block">
          <div className="site-container">
            <div className="section-heading">
              <p className="eyebrow">Choose your move</p>
              <h2>What needs moving?</h2>
              <p>Start with the route that fits your job. You can save a draft and finish later.</p>
            </div>
            <div className="mt-10 grid gap-5 md:grid-cols-2">
              <article className="category-card category-card-apartment">
                <span className="category-number">01</span>
                <h3>Apartment Move</h3>
                <p>Full apartment or home relocation including furniture, boxes and appliances.</p>
                <Link href="/request/new/apartment" className="inline-link">Create Apartment Move <span aria-hidden="true">&rarr;</span></Link>
              </article>
              <article className="category-card category-card-small">
                <span className="category-number">02</span>
                <h3>Small Move / Item Transportation</h3>
                <p>Sofa, furniture, appliances, electronics, equipment, boxes and individual items.</p>
                <Link href="/request/new/small-move" className="inline-link">Create Small Move <span aria-hidden="true">&rarr;</span></Link>
              </article>
            </div>
          </div>
        </section>

        <section className="section-block bg-white">
          <div className="site-container">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div className="section-heading mb-0">
                <p className="eyebrow">Fresh opportunities</p>
                <h2>Latest Move Requests</h2>
                <p>Marketplace-safe previews. Personal customer details are never shown here.</p>
              </div>
              <Link href="/requests" className="button button-secondary shrink-0">View All Requests</Link>
            </div>
            <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {mockMarketplaceRequests.slice(0, 3).map((request) => <RequestCard key={request.id} request={request} />)}
            </div>
          </div>
        </section>

        <section id="how-it-works" className="section-block">
          <div className="site-container">
            <div className="section-heading text-center mx-auto">
              <p className="eyebrow">Simple by design</p>
              <h2>How Movely Works</h2>
            </div>
            <ol className="process-grid mt-10">
              <li><span>1</span><h3>Describe your move</h3><p>Add the route, access details, inventory, date and budget.</p></li>
              <li><span>2</span><h3>Movers find relevant requests</h3><p>Your marketplace-safe request helps the right businesses spot a good fit.</p></li>
              <li><span>3</span><h3>Choose the right mover</h3><p>Compare interest and connect with the moving business that works for you.</p></li>
            </ol>
          </div>
        </section>

        <section className="mover-callout">
          <div className="site-container grid gap-8 py-14 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <p className="eyebrow text-sky-300">For moving businesses</p>
              <h2>Are you a mover?</h2>
              <p>Find jobs that match your service area. Purchase only the leads that interest you. Premium movers will be able to submit offers before purchasing contact information.</p>
            </div>
            <Link href="/for-movers" className="button button-light">For Movers <span aria-hidden="true">&rarr;</span></Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
