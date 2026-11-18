import { getDb } from "@/db";
import { rememberedName, requireClient } from "@/lib/auth";
import { teamMap } from "@/lib/queries";
import { firstName } from "@/lib/sentences";
import { NewRequestForm } from "./NewRequestForm";

export default async function NewRequest() {
  const client = await requireClient();
  const people = await teamMap(await getDb());
  const names = [client.leadId, client.backupId].map((id) => (id ? firstName(people.get(id)?.name) : "")).filter(Boolean);
  return (
    <div className="narrow">
      <h1>What do you need?</h1>
      <p className="sub">A few quick questions so the right person gets it.</p>
      <NewRequestForm defaultName={await rememberedName()} teamNames={names.join(" and ") || "Your team"} />
    </div>
  );
}
