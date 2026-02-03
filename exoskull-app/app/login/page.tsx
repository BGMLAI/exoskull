import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { message?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    // Check if user needs onboarding
    const { data: tenant } = await supabase
      .from('exo_tenants')
      .select('onboarding_status')
      .eq('id', user.id)
      .single()

    const needsOnboarding = !tenant?.onboarding_status ||
      tenant.onboarding_status === 'pending' ||
      tenant.onboarding_status === 'in_progress'

    redirect(needsOnboarding ? '/onboarding' : '/dashboard')
  }

  async function signIn(formData: FormData) {
    'use server'

    const email = formData.get('email') as string
    const password = formData.get('password') as string
    const supabase = await createClient()

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      redirect('/login?message=Invalid credentials')
    }

    redirect('/dashboard')
  }

  async function signUp(formData: FormData) {
    'use server'

    const email = formData.get('email') as string
    const password = formData.get('password') as string
    const name = formData.get('name') as string
    const supabase = await createClient()

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
        },
      },
    })

    if (authError) {
      console.error('Auth error:', authError)
      redirect(`/login?message=${encodeURIComponent(authError.message)}`)
    }

    // Create tenant record
    if (authData.user) {
      const { error: tenantError } = await supabase
        .from('exo_tenants')
        .insert({
          id: authData.user.id,
          email: authData.user.email!,
          name: name,
        })

      if (tenantError) {
        console.error('Tenant creation error:', tenantError)
      }
    }

    redirect('/login?message=Check your email to confirm your account')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-md w-full space-y-8 p-8 bg-slate-800/50 border border-slate-700 rounded-xl">
        <div>
          <Link href="/" className="block text-center">
            <h1 className="text-4xl font-bold text-white">ExoSkull</h1>
          </Link>
          <p className="text-center text-slate-400 mt-2">
            Adaptive Life Operating System
          </p>
        </div>

        {searchParams.message && (
          <div className="p-4 bg-blue-900/30 border border-blue-700/50 rounded-lg text-sm text-blue-300">
            {searchParams.message}
          </div>
        )}

        <div className="space-y-6">
          <form action={signIn} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-2 text-slate-300">
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
              <label htmlFor="password" className="block text-sm font-medium mb-2 text-slate-300">
                Haslo
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="w-full px-4 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition-colors"
            >
              Zaloguj sie
            </button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-700"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-slate-800/50 text-slate-500">Lub</span>
            </div>
          </div>

          <form action={signUp} className="space-y-4">
            <div>
              <label htmlFor="signup-name" className="block text-sm font-medium mb-2 text-slate-300">
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
              <label htmlFor="signup-email" className="block text-sm font-medium mb-2 text-slate-300">
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
              <label htmlFor="signup-password" className="block text-sm font-medium mb-2 text-slate-300">
                Haslo
              </label>
              <input
                id="signup-password"
                name="password"
                type="password"
                required
                minLength={6}
                className="w-full px-4 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-slate-600 hover:bg-slate-500 text-white font-medium py-3 px-4 rounded-lg transition-colors"
            >
              Utworz konto
            </button>
          </form>
        </div>

        <p className="text-xs text-center text-slate-600 mt-4">
          Rejestrujac sie akceptujesz nasze warunki uzytkowania
        </p>
      </div>
    </div>
  )
}
