import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Check if already completed onboarding
  const { data: tenant } = await supabase
    .from('exo_tenants')
    .select('onboarding_status')
    .eq('id', user.id)
    .single()

  if (tenant?.onboarding_status === 'completed') {
    redirect('/dashboard')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="container mx-auto px-4 py-8 max-w-4xl min-h-screen flex flex-col">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white">ExoSkull</h1>
          <p className="text-slate-400 mt-2">Twój drugi mózg</p>
        </div>

        {/* Content */}
        <div className="flex-1 flex items-center justify-center">
          {children}
        </div>

        {/* Footer */}
        <div className="text-center text-slate-500 text-sm pb-4">
          Wszystko co powiesz zostaje między nami.
        </div>
      </div>
    </div>
  )
}
