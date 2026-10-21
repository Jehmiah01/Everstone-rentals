import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { SignFlow } from "@/components/booking/sign-flow";
import { ReservationError } from "@/components/booking/summary";
import { SiteFooter, SiteHeader } from "@/components/site/chrome";
import { getAgreementDocs, getCustomerBooking } from "@/lib/api/booking.functions";

function Page({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
    </>
  );
}

export const Route = createFileRoute("/booking/$id/sign")({
  validateSearch: (s: Record<string, unknown>): { token: string } => ({ token: typeof s.token === "string" ? s.token : "" }),
  loaderDeps: ({ search }) => ({ token: search.token }),
  loader: async ({ params, deps }) => {
    const input = { data: { id: params.id, token: deps.token } };
    const [booking, docs] = await Promise.all([getCustomerBooking(input), getAgreementDocs(input)]);
    return { booking, docs };
  },
  head: () => ({ meta: [{ title: "Sign your rental agreements | Everstone Rentals" }, { name: "robots", content: "noindex" }] }),
  errorComponent: () => (
    <Page>
      <ReservationError />
    </Page>
  ),
  component: SignRoute,
});

function SignRoute() {
  const { booking, docs } = Route.useLoaderData();
  return (
    <Page>
      <SignFlow booking={booking} docs={docs} />
    </Page>
  );
}
