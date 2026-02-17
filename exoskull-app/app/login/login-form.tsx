"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn, signUp } from "./actions";
import { SocialLoginButtons } from "./social-login-buttons";

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
}: {
  id: string;
  name: string;
  required?: boolean;
  minLength?: number;
  placeholder?: string;
  showHint?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const [value, setValue] = useState("");

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
          onChange={(e) => setValue(e.target.value)}
          className="w-full px-4 py-2 pr-10 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder={placeholder}
        />
        <button
          type="button"
          onClick={() => setVisible(!visible)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300"
          aria-label={visible ? "Ukryj haslo" : "Pokaz haslo"}
        >
          <EyeIcon open={visible} />
        </button>
      </div>
      {showHint && (
        <p
          className={`text-xs mt-1 ${value.length > 0 && value.length < 6 ? "text-amber-400" : "text-slate-500"}`}
        >
          Minimum 6 znakow{" "}
          {value.length > 0 && value.length < 6 && `(${value.length}/6)`}
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-4">
      <div className="max-w-md w-full space-y-6 p-8 bg-slate-800/50 border border-slate-700 rounded-xl">
        <div>
          <Link href="/" className="block text-center">
            <h1 className="text-4xl font-bold text-white">ExoSkull</h1>
          </Link>
          <p className="text-center text-slate-400 mt-2">
            Adaptive Life Operating System
          </p>
        </div>

        {message && (
          <div className="p-4 bg-blue-900/30 border border-blue-700/50 rounded-lg text-sm text-blue-300">
            {message}
          </div>
        )}

        <SocialLoginButtons />

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-700"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-slate-800/50 text-slate-500">
              Lub uzyj emaila
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex bg-slate-900/50 rounded-lg p-1">
          <button
            type="button"
            onClick={() => setActiveTab("login")}
            className={`flex-1 py-2.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === "login"
                ? "bg-blue-600 text-white"
                : "text-slate-400 hover:text-slate-300"
            }`}
          >
            Zaloguj sie
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("signup")}
            className={`flex-1 py-2.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === "signup"
                ? "bg-blue-600 text-white"
                : "text-slate-400 hover:text-slate-300"
            }`}
          >
            Stworz konto
          </button>
        </div>

        {/* Login Form */}
        {activeTab === "login" && (
          <form action={signIn} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium mb-2 text-slate-300"
              >
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                className="w-full px-4 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="twoj@email.pl"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium mb-2 text-slate-300"
              >
                Haslo
              </label>
              <PasswordInput id="password" name="password" required />
            </div>

            <div className="flex justify-end">
              <Link
                href="/reset-password"
                className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
              >
                Zapomniales hasla?
              </Link>
            </div>

            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition-colors"
            >
              Zaloguj sie
            </button>
          </form>
        )}

        {/* Signup Form */}
        {activeTab === "signup" && (
          <form action={signUp} className="space-y-4">
            <div>
              <label
                htmlFor="signup-name"
                className="block text-sm font-medium mb-2 text-slate-300"
              >
                Imie
              </label>
              <input
                id="signup-name"
                name="name"
                type="text"
                required
                className="w-full px-4 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Jan Kowalski"
              />
            </div>

            <div>
              <label
                htmlFor="signup-email"
                className="block text-sm font-medium mb-2 text-slate-300"
              >
                Email
              </label>
              <input
                id="signup-email"
                name="email"
                type="email"
                required
                className="w-full px-4 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="twoj@email.pl"
              />
            </div>

            <div>
              <label
                htmlFor="signup-password"
                className="block text-sm font-medium mb-2 text-slate-300"
              >
                Haslo
              </label>
              <PasswordInput
                id="signup-password"
                name="password"
                required
                minLength={6}
                showHint
              />
            </div>

            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition-colors"
            >
              Utworz konto
            </button>

            <p className="text-xs text-center text-slate-500">
              Rejestrujac sie akceptujesz{" "}
              <Link href="/terms" className="text-blue-400 hover:text-blue-300">
                regulamin
              </Link>{" "}
              i{" "}
              <Link
                href="/privacy"
                className="text-blue-400 hover:text-blue-300"
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
