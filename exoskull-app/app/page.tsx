import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function LandingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // If already logged in, redirect to dashboard
  if (user) {
    redirect('/dashboard')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      {/* Hero */}
      <div className="container mx-auto px-4 py-20 max-w-5xl">
        <nav className="flex justify-between items-center mb-20">
          <h1 className="text-2xl font-bold">ExoSkull</h1>
          <Link
            href="/login"
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors text-sm font-medium"
          >
            Zaloguj się
          </Link>
        </nav>

        <div className="text-center mb-20">
          <h2 className="text-5xl md:text-7xl font-bold mb-6 leading-tight">
            Your Second Brain.
            <br />
            <span className="text-blue-400">Built For You. By AI.</span>
          </h2>
          <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-10">
            ExoSkull to adaptacyjny system operacyjny dla Twojego życia.
            IORS - Twój osobisty AI - uczy się, buduje narzędzia i działa za Ciebie.
          </p>
          <div className="flex gap-4 justify-center">
            <Link
              href="/login"
              className="px-8 py-4 bg-blue-600 hover:bg-blue-700 rounded-xl text-lg font-semibold transition-colors"
            >
              Zacznij za darmo
            </Link>
          </div>
        </div>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20">
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-8">
            <div className="text-3xl mb-4">🎙️</div>
            <h3 className="text-xl font-semibold mb-3">Voice-First</h3>
            <p className="text-slate-400">
              Rozmawiaj głosowo z IORSem. Dodawaj zadania, sprawdzaj sen,
              planuj dzień - po prostu powiedz.
            </p>
          </div>

          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-8">
            <div className="text-3xl mb-4">🧠</div>
            <h3 className="text-xl font-semibold mb-3">Adaptive</h3>
            <p className="text-slate-400">
              IORS uczy się Twoich nawyków, wykrywa emocje, dostosowuje
              styl i kolory UI do Twojego stanu.
            </p>
          </div>

          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-8">
            <div className="text-3xl mb-4">🔧</div>
            <h3 className="text-xl font-semibold mb-3">Proactive Mods</h3>
            <p className="text-slate-400">
              IORS automatycznie buduje mikro-aplikacje dopasowane do
              Twoich celów. Sen, nastrój, finanse, nawyki.
            </p>
          </div>
        </div>

        {/* How it works */}
        <div className="text-center mb-20">
          <h3 className="text-3xl font-bold mb-8">Jak to działa?</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[
              { step: '1', title: 'Rejestracja', desc: '15 pytań, 2 minuty' },
              { step: '2', title: 'IORS się konfiguruje', desc: 'Auto-instaluje Mody na podstawie Twoich celów' },
              { step: '3', title: 'Rozmawiaj', desc: 'Głos lub tekst - IORS zawsze słucha' },
              { step: '4', title: 'Żyj lepiej', desc: 'IORS działa w tle, Ty żyjesz' },
            ].map(item => (
              <div key={item.step} className="text-center">
                <div className="w-12 h-12 bg-blue-600/20 border border-blue-500/30 rounded-full flex items-center justify-center mx-auto mb-3 text-blue-400 font-bold">
                  {item.step}
                </div>
                <h4 className="font-semibold mb-1">{item.title}</h4>
                <p className="text-sm text-slate-500">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="text-center py-12 bg-slate-800/30 rounded-2xl border border-slate-700">
          <h3 className="text-3xl font-bold mb-4">Gotowy?</h3>
          <p className="text-slate-400 mb-6">Twój IORS czeka. Bez karty kredytowej.</p>
          <Link
            href="/login"
            className="inline-block px-10 py-4 bg-blue-600 hover:bg-blue-700 rounded-xl text-lg font-semibold transition-colors"
          >
            Zacznij za darmo
          </Link>
        </div>

        {/* Footer */}
        <footer className="text-center text-slate-600 text-sm py-8 mt-12">
          ExoSkull &copy; {new Date().getFullYear()}. Adaptive Life Operating System.
        </footer>
      </div>
    </div>
  )
}
