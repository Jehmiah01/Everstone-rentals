import { createFileRoute, notFound } from "@tanstack/react-router";

import { BookForm } from "@/components/booking/book-form";
import { SiteFooter, SiteHeader } from "@/components/site/chrome";
import { getVehiclePage } from "@/lib/api/booking.functions";
import { isValidDay } from "@/lib/dates";

export const Route = createFileRoute("/book/$slug")({
  validateSearch: (s: Record<string, unknown>): { start?: string } => ({
    start: typeof s.start === "string" && isValidDay(s.start) ? s.start : undefined,
  }),
  loader: async ({ params }) => {
    const data = await getVehiclePage({ data: { slug: params.slug } });
    if (!data) throw notFound();
    return data;
  },
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData ? `Reserve the ${loaderData.vehicle.year} ${loaderData.vehicle.make} ${loaderData.vehicle.model} | Providence Rentals` : "Reserve | Providence Rentals" }],
  }),
  component: BookRoute,
});

function BookRoute() {
  const data = Route.useLoaderData();
  const { start } = Route.useSearch();
  return (
    <>
      <SiteHeader />
      <main>
        <BookForm vehicle={data.vehicle} unavailable={data.unavailable} from={data.from} to={data.to} start={start} />
      </main>
      <SiteFooter />
    </>
  );
}
