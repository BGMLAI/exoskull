'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface RegistryItem {
  id: string;
  type: 'mod' | 'rig' | 'quest';
  slug: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  is_builtin: boolean;
  is_premium: boolean;
  requires_rigs?: string[];
  duration_days?: number;
}

interface RegistryResponse {
  grouped: {
    mods: RegistryItem[];
    rigs: RegistryItem[];
    quests: RegistryItem[];
  };
  counts: {
    total: number;
    mods: number;
    rigs: number;
    quests: number;
  };
  categories: string[];
}

export default function MarketplacePage() {
  const [data, setData] = useState<RegistryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'mod' | 'rig' | 'quest'>('all');
  const [category, setCategory] = useState<string>('all');

  useEffect(() => {
    fetch('/api/registry')
      .then((res) => res.json())
      .then((data) => {
        setData(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load registry:', err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse">Loading Exoskulleton...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-8">
        <div className="text-red-500">Failed to load marketplace</div>
      </div>
    );
  }

  // Filter items
  let items: RegistryItem[] = [];
  if (filter === 'all') {
    items = [...data.grouped.rigs, ...data.grouped.mods, ...data.grouped.quests];
  } else if (filter === 'rig') {
    items = data.grouped.rigs;
  } else if (filter === 'mod') {
    items = data.grouped.mods;
  } else if (filter === 'quest') {
    items = data.grouped.quests;
  }

  if (category !== 'all') {
    items = items.filter((item) => item.category === category);
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">Exoskulleton</h1>
      <p className="text-gray-400 mb-8">Browse and install Mods, Rigs, and Quests</p>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-zinc-900 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold">{data.counts.rigs}</div>
          <div className="text-sm text-gray-400">Rigs</div>
        </div>
        <div className="bg-zinc-900 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold">{data.counts.mods}</div>
          <div className="text-sm text-gray-400">Mods</div>
        </div>
        <div className="bg-zinc-900 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold">{data.counts.quests}</div>
          <div className="text-sm text-gray-400">Quests</div>
        </div>
        <div className="bg-zinc-900 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold">{data.counts.total}</div>
          <div className="text-sm text-gray-400">Total</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <div className="flex gap-2">
          {(['all', 'rig', 'mod', 'quest'] as const).map((type) => (
            <button
              key={type}
              onClick={() => setFilter(type)}
              className={`px-4 py-2 rounded-lg transition ${
                filter === type
                  ? 'bg-blue-600 text-white'
                  : 'bg-zinc-800 text-gray-300 hover:bg-zinc-700'
              }`}
            >
              {type === 'all' ? 'All' : type.charAt(0).toUpperCase() + type.slice(1) + 's'}
            </button>
          ))}
        </div>

        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="bg-zinc-800 text-gray-300 px-4 py-2 rounded-lg"
        >
          <option value="all">All Categories</option>
          {data.categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat.charAt(0).toUpperCase() + cat.slice(1)}
            </option>
          ))}
        </select>
      </div>

      {/* Items Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((item) => (
          <Link
            key={item.id}
            href={`/dashboard/marketplace/${item.slug}`}
            className="bg-zinc-900 rounded-lg p-6 hover:bg-zinc-800 transition block"
          >
            <div className="flex items-start gap-4">
              <div className="text-4xl">{item.icon}</div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-lg">{item.name}</h3>
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${
                      item.type === 'rig'
                        ? 'bg-purple-900 text-purple-200'
                        : item.type === 'mod'
                        ? 'bg-green-900 text-green-200'
                        : 'bg-orange-900 text-orange-200'
                    }`}
                  >
                    {item.type}
                  </span>
                </div>
                <p className="text-sm text-gray-400 mt-1">{item.description}</p>
                <div className="flex items-center gap-2 mt-3">
                  <span className="text-xs bg-zinc-700 px-2 py-1 rounded">
                    {item.category}
                  </span>
                  {item.duration_days && (
                    <span className="text-xs bg-zinc-700 px-2 py-1 rounded">
                      {item.duration_days} days
                    </span>
                  )}
                  {item.requires_rigs && item.requires_rigs.length > 0 && (
                    <span className="text-xs text-gray-500">
                      Requires: {item.requires_rigs.join(', ')}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {items.length === 0 && (
        <div className="text-center text-gray-400 py-12">
          No items found for this filter
        </div>
      )}
    </div>
  );
}
