import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { MessageCircle, Search, Send, UserPlus } from 'lucide-react'
import { formatLocalPhone, phoneKey, phonesMatch } from '../lib/phone'
import { isWhatsAppWindowOpen, whatsappWindowRemaining } from '../lib/whatsapp'
import { buildTemplateComponents, templateLanguage } from '../lib/whatsappTemplates'
import { useAuth } from '../context/AuthContext'
import { useData } from '../context/DataContext'
import { supabase } from '../lib/supabase'
import { setOpenWhatsAppConversation } from '../lib/whatsappNotify'
import { customerWalletLink, fillCustomerPlaceholders } from '../lib/customerLinks'
import type { Customer, WhatsAppChatConversation, WhatsAppChatMessage, WhatsAppTemplate } from '../types'
import { Button, cn, EmptyState, Select, Textarea } from '../components/ui'

function ChatMedia({
  msg,
  url,
  mine,
}: {
  msg: WhatsAppChatMessage
  url?: string
  mine: boolean
}) {
  const type = msg.messageType
  const mime = msg.mediaMime || ''
  const showCaption = msg.body && !/^(Photo|Voice note|Video|Sticker|Document)$/i.test(msg.body)

  if (!url) {
    if (type === 'image' || type === 'audio' || type === 'video' || type === 'sticker' || type === 'document') {
      return <p className={cn('text-xs', mine ? 'text-white/80' : 'text-muted')}>{msg.body || 'Media is still downloading…'}</p>
    }
    return null
  }

  if (type === 'image' || type === 'sticker' || mime.startsWith('image/')) {
    return (
      <div className="space-y-1.5">
        <a href={url} target="_blank" rel="noreferrer">
          <img src={url} alt={msg.body || 'Photo'} className="max-h-64 max-w-full rounded-xl object-contain" />
        </a>
        {showCaption ? <p className="whitespace-pre-wrap break-words">{msg.body}</p> : null}
      </div>
    )
  }

  if (type === 'audio' || mime.startsWith('audio/')) {
    return (
      <div className="space-y-1.5">
        <audio controls src={url} className="w-56 max-w-full">
          Your browser cannot play this voice note.
        </audio>
        {showCaption ? <p className="whitespace-pre-wrap break-words">{msg.body}</p> : null}
      </div>
    )
  }

  if (type === 'video' || mime.startsWith('video/')) {
    return (
      <div className="space-y-1.5">
        <video controls src={url} className="max-h-64 max-w-full rounded-xl" />
        {showCaption ? <p className="whitespace-pre-wrap break-words">{msg.body}</p> : null}
      </div>
    )
  }

  if (type === 'document') {
    return (
      <a href={url} target="_blank" rel="noreferrer" className={cn('underline', mine ? 'text-white' : 'text-rose')}>
        {msg.mediaFilename || msg.body || 'Open file'}
      </a>
    )
  }

  return null
}

function mapConversation(row: Record<string, unknown>): WhatsAppChatConversation {
  return {
    id: String(row.id),
    phone: String(row.phone ?? ''),
    phoneKey: String(row.phone_key ?? ''),
    customerId: (row.customer_id as string) || undefined,
    contactName: (row.contact_name as string) || undefined,
    lastMessageAt: String(row.last_message_at ?? ''),
    lastMessagePreview: String(row.last_message_preview ?? ''),
    lastDirection: row.last_direction === 'inbound' ? 'inbound' : 'outbound',
    lastInboundAt: (row.last_inbound_at as string) || undefined,
    unreadCount: Number(row.unread_count ?? 0),
  }
}

function mapChatMessage(row: Record<string, unknown>): WhatsAppChatMessage {
  return {
    id: String(row.id),
    conversationId: String(row.conversation_id),
    customerId: (row.customer_id as string) || undefined,
    staffId: (row.staff_id as string) || undefined,
    direction: row.direction === 'inbound' ? 'inbound' : 'outbound',
    messageType: String(row.message_type ?? 'text'),
    body: String(row.body ?? ''),
    status: (row.status as string) || undefined,
    sendMode: row.send_mode === 'template' || row.send_mode === 'text' ? row.send_mode : undefined,
    templateId: (row.template_id as string) || undefined,
    triggerType: (row.trigger_type as string) || undefined,
    sentBy: (row.sent_by as string) || undefined,
    metaMessageId: (row.meta_message_id as string) || undefined,
    errorMessage: (row.error_message as string) || undefined,
    createdAt: String(row.created_at ?? ''),
    mediaId: (row.media_id as string) || undefined,
    mediaMime: (row.media_mime as string) || undefined,
    mediaPath: (row.media_path as string) || undefined,
    mediaFilename: (row.media_filename as string) || undefined,
  }
}

function formatChatTime(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) {
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function conversationTitle(conv: WhatsAppChatConversation, customers: Customer[]) {
  if (conv.customerId) {
    const c = customers.find((x) => x.id === conv.customerId)
    if (c) return c.fullName
  }
  return conv.contactName || formatLocalPhone(conv.phone) || 'WhatsApp chat'
}

function lastInboundFor(conv: WhatsAppChatConversation | null, customer?: Customer) {
  return conv?.lastInboundAt || customer?.lastWhatsappInboundAt
}

export function WhatsAppInbox({
  onToast,
}: {
  onToast: (message: string) => void
}) {
  const { user } = useAuth()
  const salonId = user?.salonId
  const { customers, settings, whatsappTemplates, sendWhatsApp } = useData()
  const [params, setParams] = useSearchParams()
  const [conversations, setConversations] = useState<WhatsAppChatConversation[]>([])
  const [messages, setMessages] = useState<WhatsAppChatMessage[]>([])
  const [search, setSearch] = useState('')
  const [draft, setDraft] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [sending, setSending] = useState(false)
  const [loadingThread, setLoadingThread] = useState(false)
  const [newChatQuery, setNewChatQuery] = useState('')
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({})
  const bottomRef = useRef<HTMLDivElement | null>(null)

  const requestedCustomerId = params.get('chat') || ''
  const requestedConvId = params.get('conv') || ''

  const loadConversations = useCallback(async () => {
    if (!salonId) {
      setConversations([])
      return
    }
    const { data, error } = await supabase
      .from('whatsapp_conversations')
      .select('*')
      .eq('salon_id', salonId)
      .order('last_message_at', { ascending: false })
      .limit(400)
    if (error) {
      onToast(error.message)
      return
    }
    setConversations((data ?? []).map((row) => mapConversation(row as Record<string, unknown>)))
  }, [onToast, salonId])

  useEffect(() => {
    void loadConversations()
    const channel = supabase
      .channel('whatsapp-inbox-list')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'whatsapp_conversations' },
        () => {
          void loadConversations()
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [loadConversations])

  const selected = useMemo(() => {
    if (requestedConvId) return conversations.find((c) => c.id === requestedConvId) ?? null
    if (requestedCustomerId) {
      const byCustomer = conversations.find((c) => c.customerId === requestedCustomerId)
      if (byCustomer) return byCustomer
      const customer = customers.find((c) => c.id === requestedCustomerId)
      if (!customer) return null
      const key = phoneKey(customer.whatsappPhone || customer.phone)
      return conversations.find((c) => c.phoneKey === key || phonesMatch(c.phone, customer.whatsappPhone || customer.phone)) ?? null
    }
    return conversations[0] ?? null
  }, [conversations, customers, requestedConvId, requestedCustomerId])

  const selectedCustomer = useMemo(() => {
    if (selected?.customerId) return customers.find((c) => c.id === selected.customerId)
    if (requestedCustomerId) return customers.find((c) => c.id === requestedCustomerId)
    if (!selected) return undefined
    return customers.find((c) => phonesMatch(c.whatsappPhone || c.phone, selected.phone))
  }, [customers, requestedCustomerId, selected])

  const threadId = selected?.id ?? (selectedCustomer ? `wc${phoneKey(selectedCustomer.whatsappPhone || selectedCustomer.phone)}` : '')

  const loadThread = useCallback(async (conversationId: string) => {
    if (!conversationId) {
      setMessages([])
      return
    }
    setLoadingThread(true)
    const { data, error } = await supabase
      .from('whatsapp_chat_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(500)
    setLoadingThread(false)
    if (error) {
      onToast(error.message)
      return
    }
    setMessages((data ?? []).map((row) => mapChatMessage(row as Record<string, unknown>)))
  }, [onToast])

  useEffect(() => {
    if (!threadId) {
      setMessages([])
      return
    }
    void loadThread(threadId)
    const channel = supabase
      .channel(`whatsapp-thread-${threadId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'whatsapp_chat_messages', filter: `conversation_id=eq.${threadId}` },
        () => {
          void loadThread(threadId)
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [loadThread, threadId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, threadId])

  useEffect(() => {
    const paths = [...new Set(messages.map((m) => m.mediaPath).filter((p): p is string => Boolean(p)))]
    if (paths.length === 0) {
      setMediaUrls({})
      return
    }
    let cancelled = false
    void (async () => {
      const next: Record<string, string> = {}
      await Promise.all(
        paths.map(async (path) => {
          const { data } = await supabase.storage.from('whatsapp-media').createSignedUrl(path, 60 * 60)
          if (data?.signedUrl) next[path] = data.signedUrl
        }),
      )
      if (!cancelled) setMediaUrls(next)
    })()
    return () => {
      cancelled = true
    }
  }, [messages])

  useEffect(() => {
    setOpenWhatsAppConversation(selected?.id ?? null)
    return () => setOpenWhatsAppConversation(null)
  }, [selected?.id])

  useEffect(() => {
    if (!selected?.id || selected.unreadCount <= 0) return
    const conversationId = selected.id
    const timer = window.setTimeout(() => {
      void supabase.functions.invoke('send-whatsapp', {
        body: { action: 'mark_read', conversationId },
      })
    }, 400)
    return () => window.clearTimeout(timer)
  }, [selected?.id, selected?.unreadCount])

  const filteredConversations = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return conversations
    return conversations.filter((conv) => {
      const name = conversationTitle(conv, customers).toLowerCase()
      const phone = formatLocalPhone(conv.phone).toLowerCase()
      return name.includes(q) || phone.includes(q) || conv.lastMessagePreview.toLowerCase().includes(q)
    })
  }, [conversations, customers, search])

  const customerHits = useMemo(() => {
    const q = newChatQuery.trim().toLowerCase()
    if (q.length < 2) return []
    return customers
      .filter((c) => {
        const hay = `${c.fullName} ${formatLocalPhone(c.phone)} ${formatLocalPhone(c.whatsappPhone)}`.toLowerCase()
        return hay.includes(q)
      })
      .slice(0, 8)
  }, [customers, newChatQuery])

  const openConversation = (conv: WhatsAppChatConversation) => {
    const next = new URLSearchParams(params)
    next.set('conv', conv.id)
    if (conv.customerId) next.set('chat', conv.customerId)
    else next.delete('chat')
    setParams(next, { replace: true })
  }

  const openCustomerChat = (customer: Customer) => {
    const next = new URLSearchParams(params)
    next.set('chat', customer.id)
    const existing = conversations.find(
      (c) => c.customerId === customer.id || phonesMatch(c.phone, customer.whatsappPhone || customer.phone),
    )
    if (existing) next.set('conv', existing.id)
    else next.delete('conv')
    setParams(next, { replace: true })
    setNewChatQuery('')
  }

  const lastInbound = lastInboundFor(selected, selectedCustomer)
  const windowOpen = isWhatsAppWindowOpen(lastInbound)
  const remaining = whatsappWindowRemaining(lastInbound)
  const phone = selectedCustomer?.whatsappPhone || selectedCustomer?.phone || selected?.phone || ''
  const activeTemplates = whatsappTemplates.filter((t) => t.active)

  const applyTemplate = (id: string) => {
    setTemplateId(id)
    const t = whatsappTemplates.find((x) => x.id === id)
    if (!t || !selectedCustomer) {
      if (t) setDraft(t.body)
      return
    }
    setDraft(fillCustomerPlaceholders(t.body, selectedCustomer, settings.salonName))
  }

  const sendReply = async () => {
    if (!phone) {
      onToast('No WhatsApp number on this chat')
      return
    }
    if (!draft.trim()) {
      onToast('Write a message first')
      return
    }
    const tpl = whatsappTemplates.find((t) => t.id === templateId) as WhatsAppTemplate | undefined
    if (!windowOpen && !tpl?.whatsappTemplateName) {
      onToast('This customer is outside the 24-hour window. Pick an approved template to message them.')
      return
    }
    setSending(true)
    const walletLink = customerWalletLink(selectedCustomer?.walletToken)
    const result = await sendWhatsApp({
      customerId: selectedCustomer?.id,
      templateId: templateId || 'manual',
      phone,
      triggerType: 'Inbox reply',
      preview: draft.trim(),
      sentBy: user?.name ?? 'Staff',
      forceText: windowOpen && !tpl?.whatsappTemplateName,
      forceTemplate: Boolean(!windowOpen || tpl?.whatsappTemplateName),
      metaTemplateName: tpl?.whatsappTemplateName || undefined,
      language: templateLanguage(tpl),
      templateComponents: selectedCustomer
        ? buildTemplateComponents(tpl?.whatsappTemplateName, {
            customer: selectedCustomer,
            salonName: settings.salonName || 'Belle Beauty Lounge',
            walletLink,
            templateBody: tpl?.body,
          })
        : undefined,
    })
    setSending(false)
    if ('error' in result) {
      onToast(result.error)
      return
    }
    setDraft('')
    setTemplateId('')
    if (threadId) void loadThread(threadId)
    void loadConversations()
  }

  const title = selected
    ? conversationTitle(selected, customers)
    : selectedCustomer
      ? selectedCustomer.fullName
      : 'Select a chat'

  return (
    <div className="grid h-full min-h-0 grid-rows-[minmax(10rem,34%)_minmax(0,1fr)] overflow-hidden rounded-2xl border border-line/80 bg-white shadow-[0_8px_30px_rgba(42,36,33,0.04)] lg:grid-cols-[320px_minmax(0,1fr)] lg:grid-rows-none">
      <aside className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-b border-line lg:border-b-0 lg:border-r">
        <div className="shrink-0 border-b border-line p-3">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search chats"
              className="w-full rounded-xl border border-line bg-cream/60 py-2 pl-9 pr-3 text-sm outline-none focus:border-rose/50 focus:ring-2 focus:ring-rose/15"
            />
          </label>
          <label className="relative mt-2 block">
            <UserPlus className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted" />
            <input
              value={newChatQuery}
              onChange={(e) => setNewChatQuery(e.target.value)}
              placeholder="Start a chat with a customer"
              className="w-full rounded-xl border border-line bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-rose/50 focus:ring-2 focus:ring-rose/15"
            />
          </label>
          {customerHits.length > 0 ? (
            <div className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-line bg-white">
              {customerHits.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => openCustomerChat(c)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-blush/60"
                >
                  <span className="font-medium text-ink">{c.fullName}</span>
                  <span className="text-xs text-muted">{formatLocalPhone(c.whatsappPhone || c.phone)}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {filteredConversations.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted">
              No chats yet. When a customer messages Belle, or you send from here, the thread appears here.
            </p>
          ) : (
            filteredConversations.map((conv) => {
              const active = conv.id === selected?.id
              return (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() => openConversation(conv)}
                  className={cn(
                    'flex w-full gap-3 border-b border-line/70 px-4 py-3 text-left transition',
                    active ? 'bg-blush' : 'hover:bg-cream/80',
                  )}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose/15 text-sm font-medium text-rose-deep">
                    {conversationTitle(conv, customers).slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium text-ink">{conversationTitle(conv, customers)}</p>
                      <span className="shrink-0 text-[11px] text-muted">{formatChatTime(conv.lastMessageAt)}</span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <p className="truncate text-xs text-muted">{conv.lastMessagePreview || ' '}</p>
                      {conv.unreadCount > 0 ? (
                        <span className="rounded-full bg-rose px-1.5 py-0.5 text-[10px] font-semibold text-white">
                          {conv.unreadCount}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </aside>

      <section className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-[#f7f4ef]">
        {selected || selectedCustomer ? (
          <>
            <header className="shrink-0 flex items-center justify-between gap-3 border-b border-line bg-white px-4 py-3">
              <div>
                <p className="font-display text-xl text-ink">{title}</p>
                <p className="text-xs text-muted">
                  {formatLocalPhone(phone)}
                  {selectedCustomer?.loyaltyTier ? ` · ${selectedCustomer.loyaltyTier}` : ''}
                  {windowOpen ? ` · ${remaining}` : ' · Template required until she messages Belle'}
                </p>
              </div>
              {selectedCustomer ? (
                <Link to={`/customers/${selectedCustomer.id}`} className="text-sm text-rose hover:underline">
                  Customer profile
                </Link>
              ) : null}
            </header>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-4 py-4">
              {loadingThread && messages.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted">Loading messages…</p>
              ) : messages.length === 0 ? (
                <EmptyState
                  title="No messages in this thread yet"
                  description="Send a template or wait for her reply. Automations from Belle will also appear here."
                />
              ) : (
                messages.map((msg) => {
                  const mine = msg.direction === 'outbound'
                  return (
                    <div key={msg.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                      <div
                        dir="auto"
                        className={cn(
                          'max-w-[85%] rounded-2xl px-3.5 py-2 text-sm shadow-sm',
                          mine ? 'bg-rose text-white' : 'bg-white text-ink',
                          msg.status === 'Failed' && 'ring-1 ring-danger/50',
                        )}
                      >
                        {['image', 'audio', 'video', 'sticker', 'document'].includes(msg.messageType) ? (
                          <ChatMedia msg={msg} url={msg.mediaPath ? mediaUrls[msg.mediaPath] : undefined} mine={mine} />
                        ) : (
                          <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                        )}
                        <p className={cn('mt-1 text-[10px]', mine ? 'text-white/75' : 'text-muted')}>
                          {mine ? msg.sentBy || 'Belle' : 'Customer'} · {formatChatTime(msg.createdAt)}
                          {msg.sendMode === 'template' ? ' · template' : ''}
                          {msg.status === 'Failed' ? ' · failed' : msg.status === 'Read' ? ' · read' : msg.status === 'Delivered' ? ' · delivered' : ''}
                        </p>
                        {msg.errorMessage ? <p className="mt-1 text-[10px] text-white/90">{msg.errorMessage}</p> : null}
                      </div>
                    </div>
                  )
                })
              )}
              <div ref={bottomRef} />
            </div>

            <footer className="shrink-0 border-t border-line bg-white p-3">
              <div className="mb-2">
                <Select
                  label=""
                  value={templateId}
                  onChange={(e) => applyTemplate(e.target.value)}
                >
                  <option value="">{windowOpen ? 'Free-form reply (or pick a template)' : 'Pick an approved template'}</option>
                  {activeTemplates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder={windowOpen ? 'Type a reply…' : 'Choose a template, then send'}
                    className="min-h-[72px]"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        void sendReply()
                      }
                    }}
                  />
                </div>
                <Button onClick={() => void sendReply()} disabled={sending || !draft.trim()}>
                  <Send className="h-4 w-4" />
                  Send
                </Button>
              </div>
            </footer>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
            <MessageCircle className="h-10 w-10 text-rose/40" />
            <p className="mt-3 font-display text-2xl text-ink">WhatsApp inbox</p>
            <p className="mt-1 max-w-sm text-sm text-muted">
              Staff chat from here on {formatLocalPhone(settings.whatsapp)}. Automatic messages use the same number and appear in the thread.
            </p>
          </div>
        )}
      </section>
    </div>
  )
}
