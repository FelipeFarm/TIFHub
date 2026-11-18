import Link from "next/link";
import { requireClient } from "@/lib/auth";
import { getDb } from "@/db";
import { teamMap } from "@/lib/queries";
import { isOfferService, SERVICE_NAMES } from "@/lib/offers";
import { firstName } from "@/lib/sentences";

export default async function Interested({ searchParams }: { searchParams: Promise<{ service?: string }> }) {
  const client = await requireClient();
  const service = (await searchParams).service ?? "";
  const lead = client.leadId ? (await teamMap(await getDb())).get(client.leadId) : undefined;
  const name = isOfferService(service) ? SERVICE_NAMES[service] : "this";
  return (
    <div className="sent">
      <div className="bigcheck">✓</div>
      <h1>Thanks, we&apos;ll be in touch.</h1>
      <p className="sub">
        <b>{firstName(lead?.name) || "Your Idea Farm contact"}</b> will reach out this week to talk about {name}: what it would look
        like for {client.name} and what it costs. No commitment.
      </p>
      <div className="row" style={{ justifyContent: "center" }}>
        <Link className="btn" href="/">
          Back to home
        </Link>
      </div>
    </div>
  );
}
