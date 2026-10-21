// Serves stored files. Booking files (agreements, signature, ID photos) require
// the reservation's private token or an admin session; vehicle photos are public.
import { createFileRoute } from "@tanstack/react-router";

import { verifySession } from "@/lib/auth.server";
import { db, storage } from "@/lib/db.server";

const notFound = () => new Response("Not found", { status: 404 });

export const Route = createFileRoute("/api/files/$")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const key = decodeURIComponent(url.pathname.slice("/api/files/".length));
          if (!key || key.includes("..") || key.startsWith("/")) return notFound();

          const isPublic = key.startsWith("vehicles/");
          let allowed = isPublic;
          if (!allowed && key.startsWith("bookings/") && (await verifySession(request))) allowed = true;
          if (!allowed) {
            const b = url.searchParams.get("b") ?? "";
            const t = url.searchParams.get("t") ?? "";
            if (b && t.length >= 16 && key.startsWith(`bookings/${b}/`)) {
              const row = await db().prepare("SELECT token FROM bookings WHERE id = ?1").bind(b).first<{ token: string }>();
              allowed = row?.token === t;
            }
          }
          if (!allowed) return notFound();

          const obj = await storage().get(key);
          if (!obj) return notFound();
          const name = key.split("/").pop() ?? "file";
          const disposition = url.searchParams.get("download") === "1" ? "attachment" : "inline";
          return new Response(await obj.arrayBuffer(), {
            headers: {
              "Content-Type": obj.httpMetadata?.contentType ?? "application/octet-stream",
              "Cache-Control": isPublic ? "public, max-age=86400" : "private, no-store",
              "Content-Disposition": `${disposition}; filename="${name}"`,
            },
          });
        } catch (err) {
          console.error(err);
          return notFound();
        }
      },
    },
  },
});
