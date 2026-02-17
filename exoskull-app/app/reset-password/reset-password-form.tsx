"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { resetPassword } from "../login/actions";

export function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const message = searchParams.get("message");

  return (
    <main
      className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-4"
      id="main-content"
    >
      <div className="max-w-md w-full space-y-6 p-8 bg-slate-800/50 border border-slate-700 rounded-xl">
        <div>
          <Link href="/" className="block text-center">
            <h1 className="text-4xl font-bold text-white">ExoSkull</h1>
          </Link>
          <p className="text-center text-slate-400 mt-2">Resetowanie hasla</p>
        </div>

        {message && (
          <div
            role="status"
            className="p-4 bg-blue-900/30 border border-blue-700/50 rounded-lg text-sm text-blue-300"
          >
            {message}
          </div>
        )}

        <form action={resetPassword} className="space-y-4">
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
              aria-required="true"
              autoComplete="email"
              className="w-full px-4 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="twoj@email.pl"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition-colors"
          >
            Wyslij link do resetu
          </button>
        </form>

        <div className="text-center">
          <Link
            href="/login"
            className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
          >
            Wroc do logowania
          </Link>
        </div>
      </div>
    </main>
  );
}
