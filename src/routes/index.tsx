import { createFileRoute } from "@tanstack/react-router";

import { AvailabilitySection } from "@/components/site/availability";
import { SiteFooter, SiteHeader } from "@/components/site/chrome";
import { FleetSection } from "@/components/site/fleet";
import { HomeHero } from "@/components/site/home-hero";
import { Faq, HowItWorks, Pickup, Requirements } from "@/components/site/info-sections";
import { RoadCourse } from "@/components/site/scroll-road";
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
        <RoadCourse>
          <HomeHero />
          <FleetSection vehicles={data.vehicles} unavailable={data.unavailable} today={data.from} to={data.to} />
          <AvailabilitySection vehicles={data.vehicles} unavailable={data.unavailable} from={data.from} to={data.to} />
          <HowItWorks />
          <Requirements />
          <Pickup />
        </RoadCourse>
        <Faq vehicles={data.vehicles} />
      </main>
      <SiteFooter />
    </>
  );
}
