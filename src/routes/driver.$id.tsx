// An additional driver's own ID check page, opened from the private link the renter sends them.
import { createFileRoute, useRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { IdPhotoForm } from "@/components/booking/id-photo-form";
import { SiteFooter, SiteHeader } from "@/components/site/chrome";
import { getDriverPage } from "@/lib/api/booking.functions";
import { BRAND } from "@/lib/brand";
import { prettyDay } from "@/lib/dates";

type Search = { token: string };

function Page({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
    </>
  );
}

function DriverError() {
  return (
    <div className="mx-auto max-w-xl px-5 py-20">
      <h1 className="text-3xl font-semibold tracking-tight">We couldn't open this ID check.</h1>
      <p className="mt-3 leading-relaxed text-subtle">
        Use the exact link the renter sent you; it includes a private code. If it still doesn't open, ask them to send it again.
      </p>
      <a href="/" className="mt-6 inline-flex h-11 items-center bg-cobalt px-5 font-medium text-surface hover:bg-cobalt-deep">
        Back to {BRAND.name}
      </a>
    </div>
  );
}

export const Route = createFileRoute("/driver/$id")({
  validateSearch: (s: Record<string, unknown>): Search => ({ token: typeof s.token === "string" ? s.token : "" }),
  loaderDeps: ({ search }) => ({ token: search.token }),
  loader: ({ params, deps }) => getDriverPage({ data: { id: params.id, token: deps.token } }),
  head: () => ({ meta: [{ title: `Driver ID check | ${BRAND.name}` }, { name: "robots", content: "noindex, nofollow" }] }),
  errorComponent: () => (
    <Page>
      <DriverError />
    </Page>
  ),
  component: DriverRoute,
});

function DriverRoute() {
  const d = Route.useLoaderData();
  const router = useRouter();
  const first = d.fullName.split(" ")[0] || d.fullName;
  const cleared = d.verificationStatus === "approved" || d.verificationStatus === "not_required";

  return (
    <Page>
      <div className="mx-auto max-w-2xl px-5 py-10 md:py-14">
        <p className="font-mono text-sm text-subtle">Driver ID check</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tighter md:text-4xl">Hi {first}.</h1>
        <p className="mt-4 leading-relaxed text-subtle">
          {d.renterName} listed you as a driver for the {d.vehicleName}, {prettyDay(d.pickupDate)} to {prettyDay(d.returnDate)}. Before you can drive it, upload a photo of your driver's license and a selfie holding it. It takes about a minute.
        </p>

        <div className="mt-8 border-t border-line pt-8">
          {cleared ? (
            <p role="status" className="border border-ok bg-ok-tint p-4 text-ok">
              {d.verificationStatus === "not_required" ? "Your license is already verified from an earlier rental. You're all set." : "Your license was approved. You're all set."}
            </p>
          ) : d.verificationStatus === "submitted" ? (
            <p role="status" className="border border-line bg-surface p-4">Thanks. Your photos are uploaded and being reviewed. You don't need to do anything else.</p>
          ) : !d.open ? (
            <p role="status" className="border border-line bg-surface p-4">This reservation is closed, so no photos are needed.</p>
          ) : (
            <>
              {d.verificationStatus === "rejected" ? (
                <p className="mb-5 border border-danger bg-danger-tint p-4 text-sm text-danger">We need clearer photos. Please upload them again.</p>
              ) : null}
              <IdPhotoForm endpoint="/api/verify-driver" fields={{ driverId: d.driverId, token: d.token }} subject="you" idPrefix="driver" onDone={() => void router.invalidate()} />
            </>
          )}
        </div>

        <p className="mt-10 text-sm text-subtle">Your photos are only used to check your license for this rental. Keep this link private.</p>
      </div>
    </Page>
  );
}
