'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ChatSheet, type ChatMessageView } from '@/components/chat/ChatSheet'

export function ChatLauncher() {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  const send = useCallback(async (message: string) => {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'The helper could not answer.')
    return data as { reply: string; changed: boolean }
  }, [])

  const loadHistory = useCallback(async (): Promise<ChatMessageView[]> => {
    const res = await fetch('/api/chat')
    if (!res.ok) return []
    return ((await res.json()) as { messages: ChatMessageView[] }).messages
  }, [])

  return (
    <>
      <Button
        type="button"
        className="fixed right-4 bottom-4 z-40 rounded-full shadow-lg"
        onClick={() => setOpen(true)}
      >
        Chat
      </Button>
      {open && (
        <ChatSheet
          open
          onClose={() => setOpen(false)}
          onChanged={() => router.refresh()}
          send={send}
          loadHistory={loadHistory}
        />
      )}
    </>
  )
}
