import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { ReservationPage } from "@/components/booking/reservation-page";
import { ReservationError } from "@/components/booking/summary";
import { SiteFooter, SiteHeader } from "@/components/site/chrome";
import { getCustomerBooking } from "@/lib/api/booking.functions";

type Search = { token: string; signed?: boolean; paid?: boolean };
const flag = (v: unknown) => v === "1" || v === 1 || v === true || v === "true";

function Page({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
    </>
  );
}

export const Route = createFileRoute("/booking/$id/")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    token: typeof s.token === "string" ? s.token : "",
    signed: flag(s.signed) || undefined,
    paid: flag(s.paid) || undefined,
  }),
  loaderDeps: ({ search }) => ({ token: search.token }),
  loader: ({ params, deps }) => getCustomerBooking({ data: { id: params.id, token: deps.token } }),
  head: () => ({ meta: [{ title: "Your reservation | Everstone Rentals" }, { name: "robots", content: "noindex" }] }),
  errorComponent: () => (
    <Page>
      <ReservationError />
    </Page>
  ),
  component: ReservationRoute,
});

function ReservationRoute() {
  const b = Route.useLoaderData();
  const { signed, paid } = Route.useSearch();
  return (
    <Page>
      <ReservationPage b={b} justSigned={Boolean(signed)} returnedFromPay={Boolean(paid)} />
    </Page>
  );
}
