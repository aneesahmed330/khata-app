"use client";

import { useFormState, useFormStatus } from "react-dom";
import { CircleAlert, Loader2 } from "lucide-react";
import { loginAction, type LoginResult } from "@/actions/auth";
import { ThemeToggle } from "@/components/ThemeToggle";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";

export default function LoginPage() {
  const [state, formAction] = useFormState<LoginResult, FormData>(loginAction, {});

  return (
    <main className="flex min-h-screen flex-col px-5">
      <div
        className="flex justify-end"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 16px)" }}
      >
        <ThemeToggle />
      </div>

      <div className="flex flex-1 flex-col justify-center pb-16">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-9">
            <h1 className="t-balance text-accent-text">Khata</h1>
            <p className="t-body mt-3 text-fg-muted">Speak or type — it keeps the books for you.</p>
          </div>

          <form action={formAction} className="flex flex-col gap-3">
            <Field id="email" label="Email" type="email" autoComplete="email" />
            <Field id="password" label="Password" type="password" autoComplete="current-password" />

            {state.error ? (
              <div className="flex items-start gap-2 pt-1">
                <CircleAlert size={15} strokeWidth={1.75} className="mt-0.5 shrink-0 text-out" aria-hidden />
                <p className="t-label text-out">{state.error}</p>
              </div>
            ) : null}

            <SubmitButton />
          </form>

          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-rule" />
            <span className="t-micro text-fg-faint">or</span>
            <div className="h-px flex-1 bg-rule" />
          </div>

          <GoogleSignInButton />
        </div>
      </div>
    </main>
  );
}

function Field({
  id,
  label,
  type,
  autoComplete,
}: {
  id: string;
  label: string;
  type: string;
  autoComplete: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="t-micro mb-1.5 block text-fg-faint">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        required
        autoComplete={autoComplete}
        className="t-body w-full rounded-chip border border-rule bg-surface-sunk px-4 py-3.5 text-fg outline-none transition-colors duration-200 focus:border-accent"
      />
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-3 flex items-center justify-center gap-2 rounded-chip bg-accent py-3.5 text-[15px] font-medium text-on-accent transition-transform duration-150 active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
    >
      {pending ? (
        <>
          <Loader2 size={16} strokeWidth={2} className="animate-spin" aria-hidden />
          Signing in…
        </>
      ) : (
        "Login"
      )}
    </button>
  );
}
