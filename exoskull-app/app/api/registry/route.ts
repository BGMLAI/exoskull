import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// GET /api/registry - List all available Mods, Rigs, and Quests
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);

    // Query params
    const type = searchParams.get('type'); // 'mod', 'rig', 'quest', or null for all
    const category = searchParams.get('category'); // 'health', 'productivity', etc.
    const search = searchParams.get('search'); // search term

    // Build query
    let query = supabase
      .from('exo_registry')
      .select('*')
      .order('name');

    // Apply filters
    if (type) {
      query = query.eq('type', type);
    }

    if (category) {
      query = query.eq('category', category);
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[Registry] Error fetching registry:', error);
      return NextResponse.json(
        { error: 'Failed to fetch registry' },
        { status: 500 }
      );
    }

    // Group by type for easier frontend consumption
    const grouped = {
      mods: data?.filter((item) => item.type === 'mod') || [],
      rigs: data?.filter((item) => item.type === 'rig') || [],
      quests: data?.filter((item) => item.type === 'quest') || [],
    };

    // Get counts
    const counts = {
      total: data?.length || 0,
      mods: grouped.mods.length,
      rigs: grouped.rigs.length,
      quests: grouped.quests.length,
    };

    // Get unique categories
    const categories = [...new Set(data?.map((item) => item.category) || [])];

    return NextResponse.json({
      items: data,
      grouped,
      counts,
      categories,
    });
  } catch (error) {
    console.error('[Registry] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
