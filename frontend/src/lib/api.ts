const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
  console.log(typeof window, '***here', token);
  if (typeof window !== 'undefined') {
    if (token) {
      localStorage.setItem('accessToken', token);
    } else {
      localStorage.removeItem('accessToken');
    }
  }
}

export function getAccessToken() {
  if (accessToken) return accessToken;
  if (typeof window !== 'undefined') {
    return localStorage.getItem('accessToken');
  }
  return null;
}

export function setRefreshToken(token: string | null) {
  if (typeof window !== 'undefined') {
    if (token) {
      localStorage.setItem('refreshToken', token);
    } else {
      localStorage.removeItem('refreshToken');
    }
  }
}

export function getRefreshToken() {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('refreshToken');
  }
  return null;
}

export function getCsrfToken() {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^| )XSRF-TOKEN=([^;]+)'));

  console.log(match, 'match', document.cookie);
  if (match) return match[2];
  return null;
}

export async function refreshAuthToken(): Promise<boolean> {
  try {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return false;

    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) {
      setAccessToken(null);
      setRefreshToken(null);
      return false;
    }
    const data = await res.json();
    setAccessToken(data.accessToken);
    setRefreshToken(data.refreshToken);
    return true;
  } catch (error) {
    console.error('Failed to refresh token', error);
    setAccessToken(null);
    setRefreshToken(null);
    return false;
  }
}

export async function apiFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const url = `${API_URL}${endpoint}`;

  const headers = new Headers(options.headers || {});
  headers.set('ngrok-skip-browser-warning', 'true');

  const currentAccessToken = getAccessToken();
  console.log('[apiFetch] Executing:', endpoint, 'Token present:', !!currentAccessToken);

  if (currentAccessToken) {
    headers.set('Authorization', `Bearer ${currentAccessToken}`);
  }

  const csrfToken = getCsrfToken();
  if (
    csrfToken &&
    ['POST', 'PUT', 'DELETE', 'PATCH'].includes(options.method?.toUpperCase() || 'GET')
  ) {
    headers.set('X-CSRF-Token', csrfToken);
  }

  // Automatically set Content-Type for JSON bodies if not explicitly set
  if (options.body && typeof options.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  // Ensure cookies are sent
  const config: RequestInit = {
    ...options,
    headers,
    credentials: 'include',
  };

  let response = await fetch(url, config);

  // If unauthorized, try to refresh
  if (response.status === 401 && endpoint !== '/auth/refresh' && endpoint !== '/auth/login') {
    const refreshed = await refreshAuthToken();
    if (refreshed) {
      // Retry request with new token
      headers.set('Authorization', `Bearer ${getAccessToken()}`);
      response = await fetch(url, { ...config, headers });
    } else {
      // Dispatch a custom event to signal unauthenticated state
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('auth:unauthorized'));
      }
    }
  }

  return response;
}
