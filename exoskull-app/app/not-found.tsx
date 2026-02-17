import Link from "next/link";

export default function NotFound() {
  return (
    <main
      className="min-h-screen flex items-center justify-center bg-background text-foreground p-6"
      id="main-content"
      role="main"
    >
      <div className="max-w-md text-center space-y-4">
        <p
          className="text-6xl font-bold text-muted-foreground"
          aria-hidden="true"
        >
          404
        </p>
        <h1 className="text-xl font-semibold">Strona nie znaleziona</h1>
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
    </main>
  );
}
