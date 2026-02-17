"use client";

import { useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn, signUp } from "./actions";
import { SocialLoginButtons } from "./social-login-buttons";
import { cn } from "@/lib/utils";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />
      <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
      <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" />
      <path d="m2 2 20 20" />
    </svg>
  );
}

function PasswordInput({
  id,
  name,
  required,
  minLength,
  placeholder = "••••••••",
  showHint,
  value,
  onChange,
}: {
  id: string;
  name: string;
  required?: boolean;
  minLength?: number;
  placeholder?: string;
  showHint?: boolean;
  value: string;
  onChange: (val: string) => void;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <div className="relative">
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          required={required}
          minLength={minLength}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-4 py-2 pr-10 bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary focus:border-transparent"
          placeholder={placeholder}
        />
        <button
          type="button"
          onClick={() => setVisible(!visible)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          aria-label={visible ? "Ukryj haslo" : "Pokaz haslo"}
        >
          <EyeIcon open={visible} />
        </button>
      </div>
      {showHint && (
        <p
          className={cn(
            "text-xs mt-1",
            value.length > 0 && value.length < 6
              ? "text-amber-400"
              : "text-muted-foreground",
          )}
        >
          Minimum 6 znakow{" "}
          {value.length > 0 && value.length < 6 && `(${value.length}/6)`}
        </p>
      )}
    </div>
  );
}

function EmailInput({
  id,
  name,
  required,
  placeholder = "twoj@email.pl",
  value,
  onChange,
}: {
  id: string;
  name: string;
  required?: boolean;
  placeholder?: string;
  value: string;
  onChange: (val: string) => void;
}) {
  const [touched, setTouched] = useState(false);

  const isInvalid = touched && value.length > 0 && !EMAIL_REGEX.test(value);

  return (
    <div>
      <input
        id={id}
        name={name}
        type="email"
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setTouched(true)}
        className={cn(
          "w-full px-4 py-2 bg-background border rounded-lg text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary focus:border-transparent",
          isInvalid ? "border-destructive" : "border-border",
        )}
        placeholder={placeholder}
      />
      {isInvalid && (
        <p className="text-xs mt-1 text-destructive">
          Nieprawidlowy format email
        </p>
      )}
    </div>
  );
}

export function LoginForm() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") === "signup" ? "signup" : "login";
  const message = searchParams.get("message");

  const [activeTab, setActiveTab] = useState<"login" | "signup">(initialTab);
  const [error, setError] = useState<string | null>(null);

  // Login form state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Signup form state
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirmPassword, setSignupConfirmPassword] = useState("");

  const loginDisabled = useMemo(
    () => !loginEmail.trim() || !loginPassword.trim(),
    [loginEmail, loginPassword],
  );

  const signupDisabled = useMemo(() => {
    return (
      !signupName.trim() ||
      !EMAIL_REGEX.test(signupEmail) ||
      signupPassword.length < 6 ||
      signupPassword !== signupConfirmPassword
    );
  }, [signupName, signupEmail, signupPassword, signupConfirmPassword]);

  const confirmPasswordStatus = useMemo(() => {
    if (!signupConfirmPassword) return "empty";
    if (signupPassword === signupConfirmPassword) return "match";
    return "mismatch";
  }, [signupPassword, signupConfirmPassword]);

  const handleLoginSubmit = async (formData: FormData) => {
    setError(null);
    try {
      await signIn(formData);
    } catch (e) {
      // Server action redirects handle errors via URL params,
      // but catch unexpected errors here
      if (e instanceof Error && !e.message.includes("NEXT_REDIRECT")) {
        setError(e.message);
      }
      throw e;
    }
  };

  const handleSignupSubmit = async (formData: FormData) => {
    setError(null);
    try {
      await signUp(formData);
    } catch (e) {
      if (e instanceof Error && !e.message.includes("NEXT_REDIRECT")) {
        setError(e.message);
      }
      throw e;
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-md w-full space-y-6 p-8 bg-card border border-border rounded-xl">
        <div>
          <Link href="/" className="block text-center">
            <h1 className="text-4xl font-bold text-foreground">ExoSkull</h1>
          </Link>
          <p className="text-center text-muted-foreground mt-2">
            Adaptive Life Operating System
          </p>
        </div>

        {message && (
          <div className="p-4 bg-primary/10 border border-primary/30 rounded-lg text-sm text-foreground">
            {message}
          </div>
        )}

        {error && (
          <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-lg text-sm text-destructive">
            {error}
          </div>
        )}

        <SocialLoginButtons />

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-card text-muted-foreground">
              Lub uzyj emaila
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex bg-background rounded-lg p-1">
          <button
            type="button"
            onClick={() => setActiveTab("login")}
            className={cn(
              "flex-1 py-2.5 text-sm font-medium rounded-md transition-colors",
              activeTab === "login"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Zaloguj sie
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("signup")}
            className={cn(
              "flex-1 py-2.5 text-sm font-medium rounded-md transition-colors",
              activeTab === "signup"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Stworz konto
          </button>
        </div>

        {/* Login Form */}
        {activeTab === "login" && (
          <form action={handleLoginSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium mb-2 text-foreground"
              >
                Email
              </label>
              <EmailInput
                id="email"
                name="email"
                required
                value={loginEmail}
                onChange={setLoginEmail}
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium mb-2 text-foreground"
              >
                Haslo
              </label>
              <PasswordInput
                id="password"
                name="password"
                required
                value={loginPassword}
                onChange={setLoginPassword}
              />
            </div>

            <div className="flex justify-end">
              <Link
                href="/reset-password"
                className="text-sm text-primary hover:text-primary/80 transition-colors"
              >
                Zapomniales hasla?
              </Link>
            </div>

            <button
              type="submit"
              disabled={loginDisabled}
              className={cn(
                "w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium py-3 px-4 rounded-lg transition-colors",
                loginDisabled && "opacity-50 cursor-not-allowed",
              )}
            >
              Zaloguj sie
            </button>
          </form>
        )}

        {/* Signup Form */}
        {activeTab === "signup" && (
          <form action={handleSignupSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="signup-name"
                className="block text-sm font-medium mb-2 text-foreground"
              >
                Imie
              </label>
              <input
                id="signup-name"
                name="name"
                type="text"
                required
                value={signupName}
                onChange={(e) => setSignupName(e.target.value)}
                className="w-full px-4 py-2 bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="Jan Kowalski"
              />
            </div>

            <div>
              <label
                htmlFor="signup-email"
                className="block text-sm font-medium mb-2 text-foreground"
              >
                Email
              </label>
              <EmailInput
                id="signup-email"
                name="email"
                required
                value={signupEmail}
                onChange={setSignupEmail}
              />
            </div>

            <div>
              <label
                htmlFor="signup-password"
                className="block text-sm font-medium mb-2 text-foreground"
              >
                Haslo
              </label>
              <PasswordInput
                id="signup-password"
                name="password"
                required
                minLength={6}
                showHint
                value={signupPassword}
                onChange={setSignupPassword}
              />
            </div>

            <div>
              <label
                htmlFor="signup-confirm-password"
                className="block text-sm font-medium mb-2 text-foreground"
              >
                Powtorz haslo
              </label>
              <div className="relative">
                <input
                  id="signup-confirm-password"
                  type="password"
                  required
                  value={signupConfirmPassword}
                  onChange={(e) => setSignupConfirmPassword(e.target.value)}
                  className={cn(
                    "w-full px-4 py-2 pr-10 bg-background border rounded-lg text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary focus:border-transparent",
                    confirmPasswordStatus === "mismatch"
                      ? "border-destructive"
                      : confirmPasswordStatus === "match"
                        ? "border-green-500"
                        : "border-border",
                  )}
                  placeholder="••••••••"
                />
                {confirmPasswordStatus === "match" && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-green-500">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </span>
                )}
                {confirmPasswordStatus === "mismatch" && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-destructive">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </span>
                )}
              </div>
              {confirmPasswordStatus === "mismatch" && (
                <p className="text-xs mt-1 text-destructive">
                  Hasla nie sa identyczne
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={signupDisabled}
              className={cn(
                "w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium py-3 px-4 rounded-lg transition-colors",
                signupDisabled && "opacity-50 cursor-not-allowed",
              )}
            >
              Utworz konto
            </button>

            <p className="text-xs text-center text-muted-foreground">
              Rejestrujac sie akceptujesz{" "}
              <Link
                href="/terms"
                className="text-primary hover:text-primary/80"
              >
                regulamin
              </Link>{" "}
              i{" "}
              <Link
                href="/privacy"
                className="text-primary hover:text-primary/80"
              >
                polityke prywatnosci
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
