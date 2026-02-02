'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';

interface RegistryItem {
  id: string;
  type: 'mod' | 'rig' | 'quest';
  slug: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  version: string;
  config_schema: Record<string, unknown>;
  requires_rigs?: string[];
  duration_days?: number;
  is_builtin: boolean;
  is_premium: boolean;
}

interface Connection {
  id: string;
  rig_slug: string;
  last_sync_at: string | null;
  sync_status: string;
  sync_error: string | null;
  metadata: Record<string, unknown>;
}

interface Installation {
  id: string;
  enabled: boolean;
  config: Record<string, unknown>;
  installed_at: string;
}

interface ItemResponse {
  item: RegistryItem;
  required_rigs_info?: { slug: string; name: string; icon: string }[];
  user_status: {
    is_authenticated: boolean;
    installation: Installation | null;
    connection: Connection | null;
  };
}

export default function ItemDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = params.slug as string;

  const [data, setData] = useState<ItemResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Check for OAuth callback params
  useEffect(() => {
    const connected = searchParams.get('connected');
    const error = searchParams.get('error');

    if (connected === 'true') {
      setMessage({ type: 'success', text: 'Successfully connected!' });
    } else if (error) {
      setMessage({ type: 'error', text: `Connection failed: ${error}` });
    }
  }, [searchParams]);

  useEffect(() => {
    fetch(`/api/registry/${slug}`)
      .then((res) => res.json())
      .then((data) => {
        setData(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load item:', err);
        setLoading(false);
      });
  }, [slug]);

  const handleInstall = async () => {
    setInstalling(true);
    try {
      const res = await fetch('/api/installations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      });

      const result = await res.json();

      if (res.ok) {
        setMessage({ type: 'success', text: result.message });
        // Refresh data
        const refreshed = await fetch(`/api/registry/${slug}`).then((r) => r.json());
        setData(refreshed);
      } else {
        setMessage({ type: 'error', text: result.error || result.message });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to install' });
    } finally {
      setInstalling(false);
    }
  };

  const handleUninstall = async () => {
    if (!data?.user_status.installation) return;

    try {
      const res = await fetch(`/api/installations/${data.user_status.installation.id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setMessage({ type: 'success', text: 'Uninstalled successfully' });
        // Refresh data
        const refreshed = await fetch(`/api/registry/${slug}`).then((r) => r.json());
        setData(refreshed);
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to uninstall' });
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse">Loading...</div>
      </div>
    );
  }

  if (!data || !data.item) {
    return (
      <div className="p-8">
        <div className="text-red-500">Item not found</div>
        <Link href="/dashboard/marketplace" className="text-blue-400 mt-4 block">
          ← Back to Marketplace
        </Link>
      </div>
    );
  }

  const { item, user_status } = data;
  const isRig = item.type === 'rig';
  const isConnected = isRig && user_status.connection?.sync_status === 'success';
  const isInstalled = !!user_status.installation;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <Link href="/dashboard/marketplace" className="text-gray-400 hover:text-white mb-6 block">
        ← Back to Exoskulleton
      </Link>

      {/* Message */}
      {message && (
        <div
          className={`mb-6 p-4 rounded-lg ${
            message.type === 'success' ? 'bg-green-900 text-green-200' : 'bg-red-900 text-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start gap-6 mb-8">
        <div className="text-6xl">{item.icon}</div>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">{item.name}</h1>
            <span
              className={`text-sm px-3 py-1 rounded ${
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
          <p className="text-gray-400 mt-2 text-lg">{item.description}</p>
          <div className="flex items-center gap-3 mt-4">
            <span className="text-sm bg-zinc-700 px-3 py-1 rounded">{item.category}</span>
            <span className="text-sm text-gray-500">v{item.version}</span>
            {item.duration_days && (
              <span className="text-sm bg-zinc-700 px-3 py-1 rounded">
                {item.duration_days} days
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Status & Actions */}
      <div className="bg-zinc-900 rounded-lg p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4">Status</h2>

        {!user_status.is_authenticated ? (
          <div>
            <p className="text-gray-400 mb-4">Please log in to install this {item.type}.</p>
            <Link
              href="/login"
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg inline-block"
            >
              Log In
            </Link>
          </div>
        ) : isRig ? (
          <div>
            {/* Rig: Show connection status */}
            <div className="flex items-center gap-3 mb-4">
              <div
                className={`w-3 h-3 rounded-full ${
                  isConnected ? 'bg-green-500' : 'bg-gray-500'
                }`}
              />
              <span className={isConnected ? 'text-green-400' : 'text-gray-400'}>
                {isConnected ? 'Connected' : 'Not connected'}
              </span>
              {user_status.connection?.last_sync_at && (
                <span className="text-sm text-gray-500">
                  Last sync: {new Date(user_status.connection.last_sync_at).toLocaleString()}
                </span>
              )}
            </div>

            {user_status.connection?.sync_error && (
              <p className="text-red-400 text-sm mb-4">{user_status.connection.sync_error}</p>
            )}

            <div className="flex gap-3">
              {!isConnected ? (
                <a
                  href={`/api/rigs/${slug}/connect`}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg inline-block"
                >
                  Connect {item.name}
                </a>
              ) : (
                <>
                  <a
                    href={`/api/rigs/${slug}/connect`}
                    className="bg-zinc-700 hover:bg-zinc-600 text-white px-6 py-3 rounded-lg inline-block"
                  >
                    Reconnect
                  </a>
                  <button
                    onClick={() => {
                      // TODO: Implement sync trigger
                      setMessage({ type: 'success', text: 'Sync triggered!' });
                    }}
                    className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg"
                  >
                    Sync Now
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
          <div>
            {/* Mod/Quest: Show install status */}
            <div className="flex items-center gap-3 mb-4">
              <div
                className={`w-3 h-3 rounded-full ${
                  isInstalled ? 'bg-green-500' : 'bg-gray-500'
                }`}
              />
              <span className={isInstalled ? 'text-green-400' : 'text-gray-400'}>
                {isInstalled ? 'Installed' : 'Not installed'}
              </span>
            </div>

            <div className="flex gap-3">
              {!isInstalled ? (
                <button
                  onClick={handleInstall}
                  disabled={installing}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-6 py-3 rounded-lg"
                >
                  {installing ? 'Installing...' : 'Install'}
                </button>
              ) : (
                <>
                  <button
                    onClick={handleUninstall}
                    className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg"
                  >
                    Uninstall
                  </button>
                  {user_status.installation?.enabled && (
                    <span className="bg-green-900 text-green-200 px-4 py-3 rounded-lg">
                      Active
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Required Rigs (for Mods) */}
      {data.required_rigs_info && data.required_rigs_info.length > 0 && (
        <div className="bg-zinc-900 rounded-lg p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Required Rigs</h2>
          <p className="text-gray-400 text-sm mb-4">
            This mod requires at least one of these Rigs to be connected:
          </p>
          <div className="flex gap-3 flex-wrap">
            {data.required_rigs_info.map((rig) => (
              <Link
                key={rig.slug}
                href={`/dashboard/marketplace/${rig.slug}`}
                className="bg-zinc-800 hover:bg-zinc-700 px-4 py-2 rounded-lg flex items-center gap-2"
              >
                <span>{rig.icon}</span>
                <span>{rig.name}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Configuration Schema */}
      {item.config_schema && Object.keys(item.config_schema).length > 0 && (
        <div className="bg-zinc-900 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Configuration</h2>
          <pre className="bg-zinc-800 p-4 rounded-lg text-sm overflow-auto">
            {JSON.stringify(item.config_schema, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
