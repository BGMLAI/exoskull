import Link from "next/link";

export default async function ReferralPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full space-y-8 text-center">
        <div>
          <h1 className="text-4xl font-bold">ExoSkull</h1>
          <p className="text-muted-foreground mt-2">Twoj drugi mozg</p>
        </div>

        <div className="bg-card border rounded-xl p-6 space-y-4">
          <h2 className="text-xl font-semibold">Ktos Ci polecil ExoSkull!</h2>
          <p className="text-muted-foreground">
            Dolacz i otrzymaj bonus startowy. ExoSkull to adaptacyjny system
            operacyjny zycia - uczy sie kim jestes i pomaga Ci byc lepszym.
          </p>

          <div className="space-y-3">
            <Link
              href={`/register?ref=${code}`}
              className="block w-full bg-primary text-primary-foreground rounded-lg py-3 px-4 font-medium hover:bg-primary/90 transition-colors"
            >
              Zaloz konto z bonusem
            </Link>
            <Link
              href="/"
              className="block text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Dowiedz sie wiecej
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold">14</div>
            <div className="text-xs text-muted-foreground">Dni trialu</div>
          </div>
          <div>
            <div className="text-2xl font-bold">0 PLN</div>
            <div className="text-xs text-muted-foreground">Na start</div>
          </div>
          <div>
            <div className="text-2xl font-bold">SMS</div>
            <div className="text-xs text-muted-foreground">Bez aplikacji</div>
          </div>
        </div>
      </div>
    </div>
  );
}
