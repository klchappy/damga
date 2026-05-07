/**
 * @damga/sdk — Public TypeScript SDK for Damga API
 *
 * Usage:
 *   import { DamgaClient } from '@damga/sdk';
 *
 *   const damga = new DamgaClient({
 *     apiKey: process.env.DAMGA_API_KEY!,
 *     baseUrl: 'https://api.damga.deploi.net/v1',
 *   });
 *
 *   const events = await damga.events.list({ date_from: '2026-05-01' });
 */

export interface DamgaClientOptions {
  apiKey: string;
  baseUrl?: string;
  /** Default timeout: 30s */
  timeoutMs?: number;
  /** 429 response sonrası kaç kez retry. Default 3, exponential backoff */
  maxRetries?: number;
}

export interface CheckInRequest {
  location_id?: string;
  client_time: string;
  latitude?: number;
  longitude?: number;
  gps_accuracy_m?: number;
  nfc_tag_id?: string;
  qr_code_payload?: string;
  wifi_bssid?: string;
  device_id?: string;
  app_version?: string;
}

export interface DamgaEvent {
  id: string;
  user_id: string;
  type: 'check_in' | 'check_out' | 'edit_request' | 'manual_entry' | 'admin_correction' | 'dispute';
  server_time: string;
  client_time: string;
  effective_time: string;
  verification_score: number;
  verification_methods: string[];
  flags: string[];
  evidence_hash: string;
  this_event_hash: string;
  previous_event_hash: string | null;
  latitude: number | null;
  longitude: number | null;
  location_id: string | null;
}

export interface DamgaUser {
  id: string;
  email: string;
  full_name: string;
  role: 'employee' | 'manager' | 'admin' | 'owner';
  department: string | null;
  is_active: boolean;
}

export interface DamgaLeave {
  id: string;
  user_id: string;
  type: 'annual' | 'sick' | 'unpaid' | 'maternity' | 'paternity' | 'compassionate';
  start_date: string;
  end_date: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  reason: string | null;
}

export class DamgaClient {
  readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(opts: DamgaClientOptions) {
    if (!opts.apiKey) throw new Error('DamgaClient: apiKey gerekli');
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? 'https://api.damga.deploi.net/v1').replace(/\/+$/, '');
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.maxRetries = opts.maxRetries ?? 3;
  }

  /* ========== Generic request ========== */
  private async request<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown,
    attempt = 1,
  ): Promise<T> {
    const url = `${this.baseUrl}${path.startsWith('/') ? path : '/' + path}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);

    try {
      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'User-Agent': '@damga/sdk',
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });

      // Rate limit retry
      if (res.status === 429 && attempt <= this.maxRetries) {
        const retryAfter = Number(res.headers.get('retry-after') ?? attempt);
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        return this.request(method, path, body, attempt + 1);
      }

      const contentType = res.headers.get('content-type') ?? '';
      const data = contentType.includes('json') ? await res.json() : await res.text();

      if (!res.ok) {
        const err = new DamgaApiError(
          (data as { error?: string })?.error ?? `HTTP ${res.status}`,
          res.status,
          (data as { code?: string })?.code,
          data,
        );
        throw err;
      }
      return data as T;
    } finally {
      clearTimeout(timer);
    }
  }

  /* ========== Events ========== */
  events = {
    list: (params?: {
      user_id?: string;
      date_from?: string;
      date_to?: string;
      type?: DamgaEvent['type'];
      limit?: number;
      offset?: number;
    }) => {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(params ?? {})) {
        if (v !== undefined) qs.set(k, String(v));
      }
      const suffix = qs.toString() ? `?${qs}` : '';
      return this.request<{ items: DamgaEvent[]; total: number }>('GET', `/events${suffix}`);
    },
    get: (id: string) => this.request<{ event: DamgaEvent }>('GET', `/events/${id}`),
    dispute: (id: string, reason: string) =>
      this.request<{ event: DamgaEvent }>('POST', `/events/${id}/dispute`, { reason }),
    verifyChain: () =>
      this.request<{
        total: number;
        valid: number;
        broken: number;
        first_broken: { event_id: string; chain_position: number } | null;
      }>('GET', '/events/verify-chain'),
  };

  /* ========== Check-in / out ========== */
  checkIn = (input: CheckInRequest) =>
    this.request<{
      event_id: string;
      verification_score: number;
      decision: string;
      flags: string[];
    }>('POST', '/check-in', input);
  checkOut = (input: CheckInRequest) =>
    this.request<{ event_id: string; verification_score: number }>('POST', '/check-out', input);

  /* ========== Leaves ========== */
  leaves = {
    list: (params?: { status?: DamgaLeave['status']; user_id?: string }) => {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(params ?? {})) {
        if (v !== undefined) qs.set(k, String(v));
      }
      const suffix = qs.toString() ? `?${qs}` : '';
      return this.request<{ items: DamgaLeave[] }>('GET', `/leaves${suffix}`);
    },
    create: (input: {
      type: DamgaLeave['type'];
      start_date: string;
      end_date: string;
      reason?: string;
    }) => this.request<{ leave: DamgaLeave }>('POST', '/leaves', input),
    approve: (id: string) =>
      this.request<{ leave: DamgaLeave }>('PATCH', `/leaves/${id}/approve`),
    reject: (id: string, reason: string) =>
      this.request<{ leave: DamgaLeave }>('PATCH', `/leaves/${id}/reject`, {
        rejection_reason: reason,
      }),
  };

  /* ========== Users ========== */
  users = {
    list: () => this.request<{ items: DamgaUser[] }>('GET', '/users'),
  };

  /* ========== Reports / Export ========== */
  reports = {
    attendance: (month: string) =>
      this.request<{ month: string; items: unknown[] }>('GET', `/reports/attendance?month=${month}`),
    payroll: (month: string) =>
      this.request<{ month: string; items: unknown[] }>('GET', `/reports/payroll?month=${month}`),
  };

  export = {
    events: (params?: { date_from?: string }) => {
      const qs = new URLSearchParams();
      if (params?.date_from) qs.set('date_from', params.date_from);
      const suffix = qs.toString() ? `?${qs}` : '';
      return this.request<{ items: DamgaEvent[] }>('GET', `/export/events${suffix}`);
    },
  };
}

export class DamgaApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public data?: unknown,
  ) {
    super(message);
    this.name = 'DamgaApiError';
  }
}

/**
 * Webhook signature doğrulama helper.
 * Üçüncü taraf webhook receiver bunu kullanarak Damga'dan geldiğini garanti eder.
 */
export async function verifyWebhookSignature(args: {
  body: string; // raw request body
  signature: string; // X-Damga-Signature header (sha256=hex format)
  secret: string;
}): Promise<boolean> {
  const sig = args.signature.replace(/^sha256=/, '');
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(args.secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(args.body));
  const expectedHex = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  if (expectedHex.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) {
    diff |= expectedHex.charCodeAt(i) ^ sig.charCodeAt(i);
  }
  return diff === 0;
}
