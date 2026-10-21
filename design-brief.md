# Everstone Rentals, design brief

**Design read.** Baltimore drivers, 18 and up, who need a reliable car for a week without a franchise counter; the register is calm, local and procedural trust, the feeling of a handshake at the curb.

**Concept spine.** Journey/waypoints: the site is the walk from the curb at Gwynn Oak to the driver's seat. Every section is one step closer to the keys, and the scroll film literally closes the distance to the door handle.

**Delivery tier.** cinema (the animated website is the Tier-1 carrier).

**Locked palette.**
- Ground limestone `#F3F4F1`, surface white `#FFFFFF`, ink `#15181D`, slate text `#5B6270`, line `#D8DBD5`.
- Accent cobalt `#1F3EAE` (hover `#162C7E`). One accent only, 70% saturation.
- Film grade: blue-hour navy shadows `#0F1A33`, cool white highlights.
Defense: cobalt reads as road-sign civic trust in Maryland without the local sports-purple cliche; the cool limestone ground keeps forms and legal text legible and calm. Not a banned family and not the near-black + champagne of the previous build.

**Locked type.** Geist (display and body, `tracking-tighter` display) + Geist Mono (agreement numbers, labels, prices). Sans only; no serif.

Animation mode: animated-website

**Journey shape:** single-shot. One continuous 10s dolly-in (budget-locked at 10s/720p).

**Journey (4 chapters over the one film):**
1. Wide: three cars on wet asphalt. "Rent a car in Baltimore, no runaround." Body: three reliable cars, one pickup spot in Gwynn Oak, booking finished on your phone. Tags: 18 and up, Valid license.
2. Mid: the row resolves. "Three cars. One address." Body: a 2007 Acura TL, a 2008 Hyundai Elantra and a 2009 Subaru Forester, each kept ready. Tags: Acura TL, Elantra, Forester.
3. Close: the sedan fills the frame. "Book it in one sitting." Body: pick dates, enter details once, sign both agreements on screen, pay through Square. Tags: Square checkout, E-sign.
4. Macro: the door handle. "Keys at Gwynn Oak." Body: upload license and selfie before pickup, then the keys are yours. Tags: ID check once.
Spine enactment: the camera walks the visitor from the lot to the door; the page then hands over the keys (fleet, calendar, booking).

**World grammar.** Blue-hour parking lot, wet dark asphalt, three modest everyday cars (dark grey sedan centered, silver compact sedan, green compact SUV) nose-out in a row under one cool streetlamp, soft fog, low-detail dark background, deep navy shadows and cool white highlights, camera at chest height, one continuous slow dolly-in from the wide three-car frame to the dark grey sedan's driver door handle; locked exposure, no cuts, no shake, no on-screen text.

**Mobile framing.** Subject held center-safe; mobile encode capped at 720px height; chapter copy stacks under the film on narrow screens. Delivery budget: desktop clip under 32 MiB, mobile under 16 MiB.

**Section plan (one layout family each).**
1. Journey, image-as-canvas (film, 4 chapters). Anchor: bottom-left over image, alternating sides.
2. Fleet, asymmetric grid (Acura wide, Elantra and Forester stacked). Anchor: top-left lead. Eyebrow 1 of 2.
3. Availability, product UI panel (live month calendar, car filter chips, legend). Anchor: stacked center.
4. How it works, vertical rhythm lines (four numbered steps with generated icons). Anchor: off-grid offset. Eyebrow 2 of 2.
5. Who can rent, oversized numeral as structure (the "18" is the second-read moment) with a divide-y rule list. Anchor: inverted classic.
6. Pickup, color-blocked diptych (asphalt plate left, text right; the one image/text split, mid-page). Anchor: image-as-canvas split.
7. Questions, divide-y accordion. Anchor: centered statement.
8. Footer, single band.

**Asset plan.** Storyboard (6-panel, one move); film (Seedance 2.5, 10s, 720p, no audio) with the storyboard as look reference; three vehicle photos in the film grade; logo monogram (cobalt tag mark, transparent); icon sheet (four 2px-stroke glyphs: calendar, license card, signing pen, key) on white; asphalt section plate; OG scene (three cars under the lamp) composed with the brand lockup; favicon set derived from the mark.

**CTA inventory (bespoke chrome, no shared button class).**
- Book a car: cobalt filled rectangle, white label, arrow slides right on hover, scale 0.98 active. Nav, chapter 1, pickup.
- Reserve: ink label with a 2px cobalt underline bar that grows to full width on hover. Fleet cards.
- Check availability: underlined inline link with a trailing arrow. Chapter 3.
- Continue (booking flow): full-width ink rectangle, white label, thin cobalt top rule. Forms only.

**Corner language.** Sharp, 0px, page-wide (cards, inputs, chips).
