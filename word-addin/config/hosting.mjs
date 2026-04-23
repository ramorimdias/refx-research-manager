export const hostingConfig = {
  development: {
    origin: 'https://localhost:5174',
    basePath: '/word/',
    supportUrl: 'https://localhost:5174',
    privacyUrl: 'https://localhost:5174/privacy',
    termsUrl: 'https://localhost:5174/terms',
  },
  production: {
    origin: 'https://refx.667764.xyz',
    basePath: '/word/',
    supportUrl: 'https://refx.667764.xyz/support',
    privacyUrl: 'https://refx.667764.xyz/privacy',
    termsUrl: 'https://refx.667764.xyz/terms',
  },
}

export function normalizeBasePath(basePath) {
  if (!basePath || basePath === '/') return '/'
  return `/${basePath.replace(/^\/+|\/+$/g, '')}/`
}

export function hostedUrl({ origin, basePath }, path = '') {
  const normalizedBase = normalizeBasePath(basePath)
  const normalizedPath = path.replace(/^\/+/, '')
  return new URL(`${normalizedBase}${normalizedPath}`, origin).toString()
}
