import { useState } from 'react';
import { useSettingsStore } from '../stores/settingsStore';

function proxyBase(wssUrl: string): string {
  return wssUrl
    .replace(/^wss:\/\//, 'https://')
    .replace(/^ws:\/\//, 'http://')
    .replace(/\/$/, '');
}

function proxyLoginUrl(wssUrl: string):    string { return proxyBase(wssUrl) + '/login';      }
function proxySendCodeUrl(wssUrl: string): string { return proxyBase(wssUrl) + '/send-code'; }
function proxyProfileUrl(wssUrl: string):  string { return proxyBase(wssUrl) + '/profile';   }

function tryDecodeJwtUid(token: string): string {
  // Standard JWTs start with "eyJ" (base64 of '{"').  Bambu's opaque tokens
  // (e.g. "AQA...") have no dot separators and cannot be decoded this way.
  if (!token.startsWith('eyJ')) return '';
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(b64));
    return claims.uid != null ? String(claims.uid) : (claims.sub ?? '');
  } catch {
    return '';
  }
}

async function fetchUserIdFromProfile(accessToken: string, wssUrl: string): Promise<string> {
  try {
    const res = await fetch(proxyProfileUrl(wssUrl), {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    if (!res.ok) return '';
    const profile: {
      uid?: number | string;
      userId?: number | string;
      user_id?: number | string;
      id?: number | string;
    } = await res.json();
    const raw = profile.uid ?? profile.userId ?? profile.user_id ?? profile.id;
    return raw != null ? String(raw) : '';
  } catch {
    return '';
  }
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

// ── Manual Token Entry (collapsible fallback) ─────────────────────────────────

function ManualTokenSection() {
  const { bambuAccessToken, bambuUserId, setAccessToken, setUserId } = useSettingsStore();

  const [open, setOpen]             = useState(false);
  const [tokenDraft, setTokenDraft] = useState('');
  const [uidDraft, setUidDraft]     = useState('');
  const [tokenSaved, setTokenSaved] = useState(false);
  const [uidSaved, setUidSaved]     = useState(false);

  function handleSaveToken(e: React.FormEvent) {
    e.preventDefault();
    const t = tokenDraft.trim();
    if (!t) return;
    setAccessToken(t);
    setTokenDraft('');
    setTokenSaved(true);
    setTimeout(() => setTokenSaved(false), 2000);
  }

  function handleSaveUid(e: React.FormEvent) {
    e.preventDefault();
    const id = uidDraft.trim();
    if (!id) return;
    setUserId(id);
    setUidDraft('');
    setUidSaved(true);
    setTimeout(() => setUidSaved(false), 2000);
  }

  return (
    <div className="border-t border-slate-100 pt-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors"
      >
        <span
          className="inline-block transition-transform duration-150 text-[8px]"
          style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}
        >
          ▶
        </span>
        Advanced: Manual Token Entry
      </button>

      {open && (
        <div className="mt-3 rounded-lg bg-slate-50 border border-slate-100 p-4 space-y-4">
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Paste credentials directly if the login flow is unavailable (e.g. OAuth-linked accounts).
            Each field saves independently and overwrites any previously stored value.
          </p>

          {/* Current saved values — truncated for security */}
          {(bambuAccessToken || bambuUserId) && (
            <div className="text-[11px] text-slate-500 space-y-0.5">
              {bambuAccessToken && (
                <p>Token: <span className="font-mono">{bambuAccessToken.slice(0, 14)}…</span></p>
              )}
              {bambuUserId && (
                <p>User ID: <span className="font-mono">{bambuUserId}</span></p>
              )}
            </div>
          )}

          {/* Access token */}
          <form onSubmit={handleSaveToken} className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-600">Access Token</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={tokenDraft}
                onChange={(e) => setTokenDraft(e.currentTarget.value)}
                placeholder="Paste accessToken…"
                className="flex-1 text-xs font-mono border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#f97316]"
              />
              <button
                type="submit"
                disabled={!tokenDraft.trim()}
                className="px-3 py-2 rounded-lg bg-[#1e2a3a] text-white text-xs font-medium hover:bg-[#162030] disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
              >
                {tokenSaved ? 'Saved ✓' : 'Save'}
              </button>
            </div>
          </form>

          {/* User ID */}
          <form onSubmit={handleSaveUid} className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-600">User ID</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={uidDraft}
                onChange={(e) => setUidDraft(e.currentTarget.value)}
                placeholder="Numeric user ID (e.g. 12345678)"
                className="flex-1 text-xs font-mono border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#f97316]"
              />
              <button
                type="submit"
                disabled={!uidDraft.trim()}
                className="px-3 py-2 rounded-lg bg-[#1e2a3a] text-white text-xs font-medium hover:bg-[#162030] disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
              >
                {uidSaved ? 'Saved ✓' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}
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
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [resending, setResending] = useState(false);
  const [resendOk, setResendOk]   = useState(false);
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
        accessToken?: string;
        access_token?: string;
        token?: string;
        jwt?: string;
        auth_token?: string;
        refreshToken?: string;
        refresh_token?: string;
        expiresIn?: number;
        expires_in?: number;
        loginType?: string;
        tfaKey?: string;
        // Bambu status: 0 = success, non-zero = failure (HTTP is always 200)
        code?: number;
        message?: string;
        error?: string;
      } = await res.json();

      // OAuth-linked account (Microsoft/Google/Apple) with no native Bambu password.
      // loginType === 'tfa' with an empty tfaKey is Bambu's response when it cannot
      // service a password login because the account was created via OAuth and has no
      // stored password hash.  There is no programmatic workaround — the user must set
      // a native Bambu password in the mobile app first.
      if (data.loginType === 'tfa' && !data.tfaKey) {
        setError(
          'This account uses Microsoft/Google/Apple login and has no Bambu password set. ' +
          'Open the Bambu mobile app → Account Security → Change Password, set a password, ' +
          'then try again here.',
        );
        setLoading(false);
        return;
      }

      // Email verification code gate (loginType === 'verifyCode').
      // tfaKey is always "" in this flow — that is expected and not an error.
      // A non-empty tfaKey signals authenticator-app TOTP (rare; not handled here).
      if (data.loginType === 'verifyCode' || (data.tfaKey && data.tfaKey.length > 0)) {
        setShowTfa(true);
        setLoading(false);
        return;
      }

      // Bambu signals failure via code != 0 even when HTTP status is 200
      if (data.code !== undefined && data.code !== 0) {
        setError(data.message ?? data.error ?? `Auth failed (Bambu code ${data.code})`);
        setLoading(false);
        return;
      }

      // accessToken confirmed field name; fall back to other variants just in case
      const accessToken =
        data.accessToken ?? data.access_token ?? data.token ?? data.jwt ?? data.auth_token ?? '';

      if (!accessToken) {
        setError(data.message ?? data.error ?? `Login failed (HTTP ${res.status})`);
        setLoading(false);
        return;
      }

      // Try JWT decode first (fast, no extra request).  For opaque tokens like
      // "AQA..." that have no dot separators this returns '' immediately, then
      // we fall back to the profile endpoint.  If that also fails we proceed
      // with an empty userId — the MQTT connection only needs the token.
      let userId = tryDecodeJwtUid(accessToken);
      if (!userId) {
        userId = await fetchUserIdFromProfile(accessToken, proxyUrl);
      }

      const expiresInSec = data.expiresIn ?? data.expires_in ?? 7776000; // 90 days
      setBambuCredentials({
        email,
        userId,
        accessToken,
        refreshToken: data.refreshToken ?? data.refresh_token ?? '',
        tokenExpiry: new Date(Date.now() + expiresInSec * 1000).toISOString(),
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

  async function handleResendCode() {
    if (!email || resending) return;
    setResending(true);
    setResendOk(false);
    try {
      await fetch(proxySendCodeUrl(proxyUrl), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      setResendOk(true);
      setTimeout(() => setResendOk(false), 4000);
    } catch {
      // silent — user will just not see the confirmation
    } finally {
      setResending(false);
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
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs text-amber-800 font-medium">
                  Verification required — check your email for a 6-digit code.
                </p>
                <button
                  type="button"
                  onClick={handleResendCode}
                  disabled={resending}
                  className="shrink-0 text-[11px] text-amber-700 underline hover:text-amber-900 disabled:opacity-50 transition-colors whitespace-nowrap"
                >
                  {resending ? 'Sending…' : resendOk ? 'Sent ✓' : 'Resend code'}
                </button>
              </div>
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

      <ManualTokenSection />

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
