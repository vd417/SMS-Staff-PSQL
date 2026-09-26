import { AppError } from './errors';

export interface AuthSnapshot {
  accessToken: string | null;
  tenantId: string | null;
}

export interface HttpClientOptions {
  baseUrl: string;
  getAuth: () => AuthSnapshot;
  fetchImpl?: typeof fetch;
}

export interface HttpClient {
  get<T>(path: string, params?: Record<string, unknown>): Promise<T>;
  post<T>(path: string, body?: unknown): Promise<T>;
  patch<T>(path: string, body?: unknown): Promise<T>;
  delete<T>(path: string): Promise<T>;
}

function buildQuery(params?: Record<string, unknown>): string {
  if (!params) return '';
  const pairs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return pairs.length ? `?${pairs.join('&')}` : '';
}

export function createHttpClient(opts: HttpClientOptions): HttpClient {
  const fetchImpl = opts.fetchImpl ?? fetch;

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const { accessToken, tenantId } = opts.getAuth();
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    if (tenantId) headers['X-Tenant-Id'] = tenantId;

    let res: Response;
    try {
      res = await fetchImpl(`${opts.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      // No response at all (offline, DNS, server down) — typed so screens can say
      // "cannot reach server" instead of surfacing a raw TypeError.
      throw new AppError('network', 0, 'Network request failed');
    }

    let payload: unknown = null;
    try {
      payload = await res.json();
    } catch {
      payload = null;
    }

    // sms-api wraps every body: success as { data: T }, failure as
    // { error: { code, message, details } }. Fall back to a flat body so
    // test doubles / mocks that hand back unwrapped JSON keep working.
    const envelope = (payload ?? {}) as {
      data?: unknown;
      error?: { code?: string; message?: string };
      code?: string;
      message?: string;
    };

    if (!res.ok) {
      const err = envelope.error ?? envelope;
      // sms-api's tenant-header mismatch is a bare 403 with no body.
      const fallbackCode = res.status === 403 ? 'forbidden' : 'http_error';
      throw new AppError(err.code ?? fallbackCode, res.status, err.message ?? `HTTP ${res.status}`);
    }
    return ('data' in envelope ? envelope.data : payload) as T;
  }

  return {
    get: (path, params) => request('GET', `${path}${buildQuery(params)}`),
    post: (path, body) => request('POST', path, body),
    patch: (path, body) => request('PATCH', path, body),
    delete: (path) => request('DELETE', path),
  };
}
