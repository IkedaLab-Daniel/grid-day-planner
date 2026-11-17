const PUBLIC_PREFIXES = ['/auth/', '/icons/']
const PUBLIC_EXACT = ['/login', '/manifest.webmanifest', '/favicon.ico']

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_EXACT.includes(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))
}
