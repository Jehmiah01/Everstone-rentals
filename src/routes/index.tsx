import { createFileRoute } from "@tanstack/react-router";

import { AvailabilitySection } from "@/components/site/availability";
import { SiteFooter, SiteHeader } from "@/components/site/chrome";
import { FleetSection } from "@/components/site/fleet";
import { HomeHero } from "@/components/site/home-hero";
import { Faq, HowItWorks, Pickup, Requirements } from "@/components/site/info-sections";
import { getHomeData } from "@/lib/api/booking.functions";

export const Route = createFileRoute("/")({
  loader: () => getHomeData(),
  component: Index,
});

function Index() {
  const data = Route.useLoaderData();
  return (
    <>
      <SiteHeader />
      <main>
        <HomeHero />
        <FleetSection vehicles={data.vehicles} />
        <AvailabilitySection vehicles={data.vehicles} unavailable={data.unavailable} from={data.from} to={data.to} />
        <HowItWorks />
        <Requirements />
        <Pickup />
        <Faq vehicles={data.vehicles} />
      </main>
      <SiteFooter />
    </>
  );
}
