const productionApiBaseUrl = 'https://api.prod.admin-service.epocketshop.store';

export function apiUrl(path) {
  if (!path.startsWith('/')) {
    throw new Error('API paths must start with "/".');
  }

  if (import.meta.env.DEV) return path;

  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, '') || productionApiBaseUrl;
  return `${apiBaseUrl}${path}`;
}
