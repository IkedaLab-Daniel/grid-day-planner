import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { ChatConfigError, createChatModel } from '@/lib/chat/model'
import { ChatError, getHistory, sendMessage } from '@/lib/chat/service'

async function signedIn() {
  const sb = await createServerClient()
  const {
    data: { user },
  } = await sb.auth.getUser()
  return user ? { sb, userId: user.id } : null
}

const unauthorized = () => NextResponse.json({ error: 'unauthorized' }, { status: 401 })

export async function GET() {
  const auth = await signedIn()
  if (!auth) return unauthorized()
  const messages = await getHistory(auth.sb)
  return NextResponse.json({
    messages: messages.map((m) => ({ id: m.id, role: m.role, content: m.content, createdAt: m.createdAt.toISOString() })),
  })
}

export async function POST(request: NextRequest) {
  const auth = await signedIn()
  if (!auth) return unauthorized()

  const body = await request.json().catch(() => null)
  if (!body || typeof body.message !== 'string') {
    return NextResponse.json({ error: 'Send a JSON body like {"message": "..."}.' }, { status: 400 })
  }

  let model
  try {
    model = createChatModel()
  } catch (e) {
    if (e instanceof ChatConfigError) {
      return NextResponse.json({ error: 'The chat helper is not configured yet.' }, { status: 503 })
    }
    throw e
  }

  try {
    return NextResponse.json(await sendMessage({ sb: auth.sb, userId: auth.userId, model }, body.message))
  } catch (e) {
    if (e instanceof ChatError) return NextResponse.json({ error: e.message }, { status: e.status })
    throw e
  }
}
