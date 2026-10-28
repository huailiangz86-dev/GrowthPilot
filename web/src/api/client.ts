const BASE_URL = '/api/v1';  // Vite proxy handles forwarding to backend

interface ApiResponse<T = unknown> {
  success: boolean;
  data: T | null;
  error: string | null;
  code?: string | null;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) { super(message); this.status = status; this.code = code; }
}

export async function request<T>(
  url: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'GET',
  data?: unknown,
  options?: Pick<RequestInit, 'signal'>,
): Promise<T> {
  const token = localStorage.getItem('gp_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const config: RequestInit = { method, headers, ...options };

  if (data && method !== 'GET') {
    config.body = JSON.stringify(data);
  }

  // For GET with query params, append to URL
  let fullUrl = `${BASE_URL}${url}`;
  if (data && method === 'GET') {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      if (v !== undefined && v !== null) params.append(k, String(v));
    }
    const qs = params.toString();
    if (qs) fullUrl += `${url.includes('?') ? '&' : '?'}${qs}`;
  }

  const response = await fetch(fullUrl, config);

  if (response.status === 401) {
    localStorage.removeItem('gp_token');
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    return undefined as unknown as T;
  }

  const body = (await response.json()) as ApiResponse<T>;

  if (!body.success) {
    throw new ApiError(typeof body.error === 'string' ? body.error : 'Request failed', response.status, body.code ?? undefined);
  }

  return body.data as T;
}

export const api = {
  get: <T>(url: string, params?: Record<string, unknown>, options?: Pick<RequestInit, 'signal'>) => request<T>(url, 'GET', params, options),
  post: <T>(url: string, data?: unknown, options?: Pick<RequestInit, 'signal'>) => request<T>(url, 'POST', data, options),
  put: <T>(url: string, data?: unknown) => request<T>(url, 'PUT', data),
  patch: <T>(url: string, data?: unknown) => request<T>(url, 'PATCH', data),
  delete: <T>(url: string) => request<T>(url, 'DELETE'),
};
