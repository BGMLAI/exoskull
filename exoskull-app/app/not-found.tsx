import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-6xl font-bold text-muted-foreground">404</h1>
        <h2 className="text-xl font-semibold">Strona nie znaleziona</h2>
        <p className="text-muted-foreground">
          Tej strony nie ma lub zostala przeniesiona.
        </p>
        <Link
          href="/dashboard"
          className="inline-block px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:opacity-90 transition"
        >
          Wroc do dashboard
        </Link>
      </div>
    </div>
  );
}
