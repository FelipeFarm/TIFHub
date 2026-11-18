"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({
  children, pendingText = "Sending…", className = "btn", disabled,
}: {
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button className={className} type="submit" disabled={pending || disabled}>
      {pending ? pendingText : children}
    </button>
  );
}

export function FormError({ state }: { state?: { error?: string } }) {
  if (!state?.error) return null;
  return (
    <div className="alert err" role="alert">
      {state.error}
    </div>
  );
}
