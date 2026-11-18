"use client";

export function AssignSelect({
  requestId, team, action,
}: {
  requestId: number;
  team: { id: string; name: string }[];
  action: (fd: FormData) => Promise<void>;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="requestId" value={requestId} />
      <select
        className="assign"
        name="ownerId"
        defaultValue=""
        aria-label="Assign owner"
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      >
        <option value="" disabled>
          Assign…
        </option>
        {team.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </form>
  );
}
