'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export interface ChatMessageView {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

export interface ChatSheetProps {
  open: boolean
  onClose(): void
  onChanged(): void
  send(message: string): Promise<{ reply: string; changed: boolean }>
  loadHistory(): Promise<ChatMessageView[]>
}

const OPENING_LINE = 'What are you doing now, and when did you start?'
const RECENT_MS = 2 * 3600_000
const FALLBACK_ERROR = 'Could not reach the helper. Your message is still here; try again.'

export function ChatSheet({ open, onClose, onChanged, send, loadHistory }: ChatSheetProps) {
  // Loaded history and this opening's own messages are kept apart so a slow history load can
  // never overwrite a message the user has just sent. The launcher mounts a fresh sheet per opening.
  const [history, setHistory] = useState<ChatMessageView[]>([])
  const [local, setLocal] = useState<ChatMessageView[]>([])
  const [showOpening, setShowOpening] = useState(false)
  const [text, setText] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastText, setLastText] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    let alive = true
    loadHistory()
      .then((loaded) => {
        if (!alive) return
        setHistory(loaded)
        const last = loaded.at(-1)
        setShowOpening(!last || Date.now() - new Date(last.createdAt).getTime() > RECENT_MS)
      })
      .catch(() => alive && setShowOpening(true))
    return () => {
      alive = false
    }
  }, [open, loadHistory])

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' })
  }, [history, local, pending])

  async function submit(raw: string) {
    const value = raw.trim()
    if (!value || pending) return
    setPending(true)
    setError(null)
    setLastText(value)
    setText('')
    const bubble: ChatMessageView = {
      id: `local-${Date.now()}`,
      role: 'user',
      content: value,
      createdAt: new Date().toISOString(),
    }
    setLocal((m) => [...m, bubble])
    try {
      const result = await send(value)
      setLocal((m) => [
        ...m,
        { id: `reply-${Date.now()}`, role: 'assistant', content: result.reply, createdAt: new Date().toISOString() },
      ])
      if (result.changed) onChanged()
    } catch (e) {
      setLocal((m) => m.filter((x) => x.id !== bubble.id))
      setText(value)
      setError(e instanceof Error && e.message ? e.message : FALLBACK_ERROR)
    } finally {
      setPending(false)
    }
  }

  if (!open) return null

  const messages = [...history, ...local]

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 md:pointer-events-none md:items-stretch md:justify-end md:bg-transparent"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Chat helper"
        className="flex h-[85dvh] w-full flex-col rounded-t-lg border bg-background shadow-lg md:pointer-events-auto md:h-auto md:w-96 md:rounded-none"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <div className="flex items-center justify-between border-b px-3 py-2">
          <h2 className="font-medium">Chat helper</h2>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3" aria-live="polite">
          {showOpening && <p className="max-w-[85%] self-start rounded-lg bg-muted px-3 py-2 text-sm">{OPENING_LINE}</p>}
          {messages.map((m) => (
            <p
              key={m.id}
              className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
                m.role === 'user' ? 'self-end bg-foreground text-background' : 'self-start bg-muted'
              }`}
            >
              {m.content}
            </p>
          ))}
          {pending && <p className="self-start text-sm text-muted-foreground">Thinking…</p>}
          <div ref={endRef} />
        </div>

        {error && (
          <div role="alert" className="flex items-center justify-between gap-2 border-t bg-red-50 px-3 py-2 text-sm text-red-800">
            <span>{error}</span>
            <Button type="button" size="sm" variant="outline" onClick={() => submit(lastText)}>
              Retry
            </Button>
          </div>
        )}

        <form
          className="flex gap-2 border-t p-3"
          onSubmit={(e) => {
            e.preventDefault()
            void submit(text)
          }}
        >
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. I started CS50 at 4:10"
            aria-label="Message"
            maxLength={1000}
            autoFocus
          />
          <Button type="submit" disabled={pending || !text.trim()}>
            Send
          </Button>
        </form>
      </div>
    </div>
  )
}
