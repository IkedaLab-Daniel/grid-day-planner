import { NextResponse, type NextRequest } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const supabase = await createServerClient()

  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null

  let error: unknown = new Error('missing code')
  if (code) {
    error = (await supabase.auth.exchangeCodeForSession(code)).error
  } else if (tokenHash && type) {
    error = (await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error
  }

  return NextResponse.redirect(error ? `${origin}/login?error=1` : `${origin}/`)
}
