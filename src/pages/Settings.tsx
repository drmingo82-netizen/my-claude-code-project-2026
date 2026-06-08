import { useState } from 'react';
import { useSettingsStore } from '../stores/settingsStore';

const TOKEN_LIFETIME_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

function proxyLoginUrl(wssUrl: string): string {
  return wssUrl
    .replace(/^wss:\/\//, 'https://')
    .replace(/^ws:\/\//, 'http://')
    .replace(/\/$/, '') + '/login';
}

function fmtExpiry(isoDate: string): string {
  if (!isoDate) return '';
  return new Date(isoDate).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function SectionHeading({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-sm font-semibold text-[#1e2a3a]">{title}</h2>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function InputField({
  label, type = 'text', value, onChange, placeholder, disabled,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#f97316] disabled:bg-slate-50 disabled:text-slate-400"
      />
    </div>
  );
}

// ── Bambu Cloud Login Section ─────────────────────────────────────────────────

function BambuCloudSection() {
  const { bambuEmail, bambuUserId, bambuAccessToken, bambuTokenExpiry, proxyUrl,
    setBambuCredentials, clearBambuCredentials, setProxyUrl } = useSettingsStore();

  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const [tfaCode, setTfaCode] = useState('');
  const [showTfa, setShowTfa] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [proxyDraft, setProxyDraft] = useState(proxyUrl);

  const isConnected = Boolean(bambuUserId && bambuAccessToken);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!proxyUrl) {
      setError('Save your proxy URL below before connecting.');
      return;
    }
    setLoading(true);
    try {
      const body: Record<string, string> = { email, password };
      if (showTfa && tfaCode) body.code = tfaCode;

      const res = await fetch(proxyLoginUrl(proxyUrl), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data: {
        token?: string;
        accessToken?: string;
        uid?: number | string;
        loginType?: string;
        tfaKey?: string;
        message?: string;
        error?: string;
      } = await res.json();

      // 2FA gate
      if (data.loginType === 'verifyCode' || data.tfaKey) {
        setShowTfa(true);
        setLoading(false);
        return;
      }

      const token  = data.token ?? data.accessToken ?? '';
      const userId = data.uid != null ? String(data.uid) : '';

      if (!token || !userId) {
        setError(data.message ?? data.error ?? `Login failed (HTTP ${res.status})`);
        setLoading(false);
        return;
      }

      setBambuCredentials({
        email,
        userId,
        accessToken: token,
        tokenExpiry: new Date(Date.now() + TOKEN_LIFETIME_MS).toISOString(),
      });
      setPassword('');
      setTfaCode('');
      setShowTfa(false);
    } catch {
      setError('Network error — check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleDisconnect() {
    clearBambuCredentials();
    setEmail('');
    setPassword('');
    setTfaCode('');
    setShowTfa(false);
    setError('');
  }

  function handleSaveProxyUrl(e: React.FormEvent) {
    e.preventDefault();
    setProxyUrl(proxyDraft.trim());
  }

  return (
    <div className="space-y-6">
      {/* Connection status */}
      {isConnected ? (
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-emerald-800">Connected</p>
            <p className="text-xs text-emerald-700 mt-0.5">{bambuEmail}</p>
            {bambuTokenExpiry && (
              <p className="text-[11px] text-emerald-600 mt-0.5">
                Token expires {fmtExpiry(bambuTokenExpiry)}
              </p>
            )}
          </div>
          <button
            onClick={handleDisconnect}
            className="shrink-0 text-xs px-3 py-1.5 rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-100 transition-colors"
          >
            Disconnect
          </button>
        </div>
      ) : (
        <form onSubmit={handleLogin} className="space-y-3">
          <InputField
            label="Bambu Account Email"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="you@example.com"
            disabled={loading}
          />
          <InputField
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            placeholder="••••••••"
            disabled={loading || showTfa}
          />

          {showTfa && (
            <div className="rounded-lg bg-amber-50 border border-amber-100 p-3 space-y-2">
              <p className="text-xs text-amber-800 font-medium">
                Verification required — check your email for a 6-digit code.
              </p>
              <InputField
                label="Verification Code"
                type="text"
                value={tfaCode}
                onChange={setTfaCode}
                placeholder="123456"
                disabled={loading}
              />
            </div>
          )}

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !email || !password || (showTfa && !tfaCode)}
            className="w-full py-2.5 rounded-lg bg-[#f97316] text-white text-sm font-medium hover:bg-[#ea6d0f] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading
              ? 'Connecting…'
              : showTfa
              ? 'Verify & Connect'
              : 'Connect Bambu Cloud'}
          </button>

          {showTfa && (
            <button
              type="button"
              onClick={() => { setShowTfa(false); setTfaCode(''); setError(''); }}
              className="w-full py-2 text-xs text-slate-400 hover:text-slate-600 transition-colors"
            >
              Back to login
            </button>
          )}
        </form>
      )}

      {/* Proxy URL */}
      <div className="border-t border-slate-100 pt-5">
        <p className="text-xs font-medium text-slate-600 mb-1">Cloud Proxy URL</p>
        <p className="text-[11px] text-slate-400 mb-3">
          WSS address of your Railway proxy server (e.g. wss://your-proxy.up.railway.app)
        </p>
        <form onSubmit={handleSaveProxyUrl} className="flex gap-2">
          <input
            type="url"
            value={proxyDraft}
            onChange={(e) => setProxyDraft(e.currentTarget.value)}
            placeholder="wss://your-proxy.up.railway.app"
            className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#f97316]"
          />
          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-[#1e2a3a] text-white text-sm font-medium hover:bg-[#162030] transition-colors whitespace-nowrap"
          >
            Save
          </button>
        </form>
        {proxyUrl && (
          <p className="text-[11px] text-slate-400 mt-2">Saved: {proxyUrl}</p>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Settings() {
  return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="mb-5">
        <h1 className="hidden lg:block text-xl font-bold text-[#1e2a3a]">Settings</h1>
        <p className="text-xs text-slate-400 lg:mt-0.5">
          App configuration and cloud integrations
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
        <SectionHeading
          title="Bambu Cloud"
          sub="Connect your Bambu account to enable remote monitoring from anywhere."
        />
        <BambuCloudSection />
      </div>
    </div>
  );
}
