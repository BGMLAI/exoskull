import { NextResponse } from 'next/server'
import { queryDatabase } from '@/lib/db-direct'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  try {
    const agents = await queryDatabase(
      'exo_agents',
      {
        filter: { is_global: true },
        order: { column: 'tier', ascending: true }
      }
    )

    return NextResponse.json({ data: agents, error: null })
  } catch (error: any) {
    console.error('Direct DB query error:', error)
    return NextResponse.json(
      { data: null, error: { message: error.message, code: 'DB_ERROR' } },
      { status: 500 }
    )
  }
}
