export function isLocalSupabaseDevelopment(): boolean {
  if (process.env.NODE_ENV !== 'development') return false

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl) return false

  try {
    const hostname = new URL(supabaseUrl).hostname
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
  } catch {
    return false
  }
}
