import type { Order, OrderItem, Product } from '../types';

// ── PKCE ─────────────────────────────────────────────────────────────────────

function randomString(len: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  return Array.from(crypto.getRandomValues(new Uint8Array(len)))
    .map((b) => chars[b % chars.length])
    .join('');
}

async function sha256Base64Url(plain: string): Promise<string> {
  const data = new TextEncoder().encode(plain);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// ── Token storage ─────────────────────────────────────────────────────────────

interface EtsyToken {
  access_token: string;
  refresh_token: string;
  expires_at: number; // ms timestamp
}

const TOKEN_KEY = 'etsy_token';
const SHOP_KEY = 'etsy_shop';
const LAST_SYNC_KEY = 'etsy_last_sync';

export function getToken(): EtsyToken | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    return raw ? (JSON.parse(raw) as EtsyToken) : null;
  } catch {
    return null;
  }
}

function saveToken(t: EtsyToken): void {
  localStorage.setItem(TOKEN_KEY, JSON.stringify(t));
}

export function clearEtsyAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(SHOP_KEY);
}

export function isEtsyConnected(): boolean {
  return getToken() !== null;
}

export function getLastSync(): string | null {
  return localStorage.getItem(LAST_SYNC_KEY);
}

function markLastSync(): void {
  localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
}

// ── OAuth ─────────────────────────────────────────────────────────────────────

const CLIENT_ID = import.meta.env.VITE_ETSY_CLIENT_ID as string | undefined;
const AUTH_URL = 'https://www.etsy.com/oauth/connect';
const TOKEN_URL = 'https://api.etsy.com/v3/public/oauth/token';

function redirectUri(): string {
  return `${window.location.origin}/orders`;
}

export async function startEtsyOAuth(): Promise<void> {
  if (!CLIENT_ID) throw new Error('VITE_ETSY_CLIENT_ID not configured');

  const verifier = randomString(64);
  const challenge = await sha256Base64Url(verifier);
  const state = randomString(32);

  sessionStorage.setItem('etsy_verifier', verifier);
  sessionStorage.setItem('etsy_state', state);

  const params = new URLSearchParams({
    response_type: 'code',
    redirect_uri: redirectUri(),
    scope: 'transactions_r',
    client_id: CLIENT_ID,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });

  window.location.href = `${AUTH_URL}?${params}`;
}

export async function handleEtsyCallback(code: string, state: string): Promise<void> {
  const savedState = sessionStorage.getItem('etsy_state');
  const verifier = sessionStorage.getItem('etsy_verifier');

  if (state !== savedState) throw new Error('OAuth state mismatch — possible CSRF');
  if (!verifier) throw new Error('Missing code verifier');

  sessionStorage.removeItem('etsy_state');
  sessionStorage.removeItem('etsy_verifier');

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID!,
      redirect_uri: redirectUri(),
      code,
      code_verifier: verifier,
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${txt}`);
  }

  const data = await res.json();
  saveToken({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  });
}

async function refreshToken(): Promise<void> {
  const token = getToken();
  if (!token) throw new Error('Not connected');

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: CLIENT_ID!,
      refresh_token: token.refresh_token,
    }),
  });

  if (!res.ok) {
    clearEtsyAuth();
    throw new Error('Token refresh failed — please reconnect Etsy');
  }

  const data = await res.json();
  saveToken({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  });
}

async function getAccessToken(): Promise<string> {
  let token = getToken();
  if (!token) throw new Error('Not connected to Etsy');
  if (Date.now() > token.expires_at - 5 * 60 * 1000) {
    await refreshToken();
    token = getToken()!;
  }
  return token.access_token;
}

// ── API ───────────────────────────────────────────────────────────────────────

const API = 'https://openapi.etsy.com/v3';

async function apiFetch<T>(path: string): Promise<T> {
  const accessToken = await getAccessToken();
  const res = await fetch(`${API}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'x-api-key': CLIENT_ID!,
    },
  });
  if (!res.ok) throw new Error(`Etsy API ${res.status} on ${path}`);
  return res.json();
}

interface EtsyPrice {
  amount: number;
  divisor: number;
}

function toDecimal(p: EtsyPrice): number {
  return p.divisor > 0 ? p.amount / p.divisor : 0;
}

interface EtsyTransaction {
  title: string;
  quantity: number;
  price: EtsyPrice;
}

interface EtsyReceipt {
  receipt_id: number;
  name: string;
  status: string;
  created_timestamp: number;
  transactions: EtsyTransaction[];
  total_shipping_cost: EtsyPrice;
  message_from_buyer: string | null;
}

export interface EtsyShop {
  shop_id: number;
  shop_name: string;
}

export async function getEtsyShop(): Promise<EtsyShop> {
  const cached = localStorage.getItem(SHOP_KEY);
  if (cached) return JSON.parse(cached) as EtsyShop;

  // Ping returns the authenticated user_id
  const ping = await apiFetch<{ user_id: number }>('/application/openapi-ping');
  const data = await apiFetch<{ results: EtsyShop[] }>(
    `/application/users/${ping.user_id}/shops`,
  );
  const shop = data.results[0];
  if (!shop) throw new Error('No Etsy shop found for this account');
  localStorage.setItem(SHOP_KEY, JSON.stringify(shop));
  return shop;
}

async function fetchReceipts(shopId: number): Promise<EtsyReceipt[]> {
  const data = await apiFetch<{ results: EtsyReceipt[] }>(
    `/application/shops/${shopId}/receipts?limit=100&sort_on=created&sort_order=desc&was_paid=true`,
  );
  return data.results;
}

// ── Sync ──────────────────────────────────────────────────────────────────────

function mapStatus(status: string): Order['status'] {
  switch (status.toLowerCase()) {
    case 'completed': return 'shipped';
    case 'unshipped': return 'printed';
    default: return 'new';
  }
}

function matchProduct(title: string, products: Product[]): Product | undefined {
  const t = title.toLowerCase().trim();
  return products.find((p) => {
    const n = p.name.toLowerCase().trim();
    const s = p.sku.toLowerCase().trim();
    return n === t || s === t || t.includes(n) || n.includes(t);
  });
}

export interface SyncResult {
  created: number;
  skipped: number;
}

export async function syncEtsyOrders(
  existingOrders: Order[],
  products: Product[],
  onAdd: (order: Omit<Order, 'id'>) => void,
): Promise<SyncResult> {
  const shop = await getEtsyShop();
  const receipts = await fetchReceipts(shop.shop_id);

  const existingIds = new Set(existingOrders.map((o) => o.etsyReceiptId).filter(Boolean));

  let created = 0;
  let skipped = 0;

  for (const r of receipts) {
    if (r.status.toLowerCase() === 'cancelled') { skipped++; continue; }
    if (existingIds.has(r.receipt_id)) { skipped++; continue; }

    const items: OrderItem[] = r.transactions.map((t) => {
      const matched = matchProduct(t.title, products);
      return {
        productId: matched?.id ?? '',
        quantity: t.quantity,
        unitPrice: toDecimal(t.price),
        etsyTitle: t.title,
      };
    });

    onAdd({
      orderNumber: String(r.receipt_id),
      platform: 'Etsy',
      customerName: r.name ?? '',
      status: mapStatus(r.status),
      items,
      shippingCost: toDecimal(r.total_shipping_cost),
      platformFeePercent: 6.5,
      notes: r.message_from_buyer ?? '',
      createdAt: new Date(r.created_timestamp * 1000).toISOString().slice(0, 10),
      etsyReceiptId: r.receipt_id,
    });
    created++;
  }

  markLastSync();
  return { created, skipped };
}
