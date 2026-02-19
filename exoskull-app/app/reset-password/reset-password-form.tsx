"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { resetPassword } from "../login/actions";
import { cn } from "@/lib/utils";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const message = searchParams.get("message");
  const [email, setEmail] = useState("");
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isInvalid = touched && email.length > 0 && !EMAIL_REGEX.test(email);
  const canSubmit = EMAIL_REGEX.test(email) && !submitting;

  async function handleSubmit(formData: FormData) {
    setSubmitting(true);
    try {
      await resetPassword(formData);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main
      className="min-h-screen flex items-center justify-center bg-background px-4"
      id="main-content"
    >
      <div className="max-w-md w-full space-y-6 p-8 bg-card/80 border border-border rounded-xl backdrop-blur-sm">
        <div>
          <Link href="/" className="block text-center">
            <h1 className="text-4xl font-bold text-foreground">ExoSkull</h1>
          </Link>
          <p className="text-center text-muted-foreground mt-2">
            Resetowanie hasla
          </p>
        </div>

        {message && (
          <div
            role="status"
            className="p-4 bg-primary/10 border border-primary/30 rounded-lg text-sm text-primary"
          >
            {message}
          </div>
        )}

        <form action={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium mb-2 text-foreground"
            >
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              aria-required="true"
              aria-invalid={isInvalid || undefined}
              aria-describedby={isInvalid ? "email-error" : undefined}
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setTouched(true)}
              className={cn(
                "w-full px-4 py-2 bg-background border rounded-lg text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary focus:border-transparent",
                isInvalid ? "border-destructive" : "border-border",
              )}
              placeholder="twoj@email.pl"
            />
            {isInvalid && (
              <p
                id="email-error"
                className="text-xs mt-1 text-destructive"
                role="alert"
              >
                Podaj prawidlowy adres email
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className={cn(
              "w-full font-medium py-3 px-4 rounded-lg transition-colors",
              canSubmit
                ? "bg-primary hover:bg-primary/90 text-primary-foreground"
                : "bg-muted text-muted-foreground cursor-not-allowed",
            )}
          >
            {submitting ? "Wysylanie..." : "Wyslij link do resetu"}
          </button>
        </form>

        <div className="text-center">
          <Link
            href="/login"
            className="text-sm text-primary hover:text-primary/80 transition-colors"
          >
            Wroc do logowania
          </Link>
        </div>
      </div>
    </main>
  );
}
