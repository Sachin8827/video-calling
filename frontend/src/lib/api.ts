const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

export function getCsrfToken() {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^| )XSRF-TOKEN=([^;]+)'));
  if (match) return match[2];
  return null;
}

// Internal function to call refresh endpoint
async function refreshAuthToken(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Important: include credentials so HttpOnly cookies are sent cross-origin
      credentials: 'include',
    });
    if (!res.ok) {
      setAccessToken(null);
      return false;
    }
    const data = await res.json();
    setAccessToken(data.accessToken);
    return true;
  } catch (error) {
    console.error('Failed to refresh token', error);
    setAccessToken(null);
    return false;
  }
}

export async function apiFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const url = `${API_URL}${endpoint}`;

  const headers = new Headers(options.headers || {});

  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  const csrfToken = getCsrfToken();
  if (
    csrfToken &&
    ['POST', 'PUT', 'DELETE', 'PATCH'].includes(options.method?.toUpperCase() || 'GET')
  ) {
    headers.set('X-CSRF-Token', csrfToken);
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
      headers.set('Authorization', `Bearer ${accessToken}`);
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
