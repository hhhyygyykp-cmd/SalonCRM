import { useMemo, useState } from 'react'
import { Bell, Copy, MessageCircle, Pencil, Send } from 'lucide-react'
import { daysSince } from '../lib/format'
import { formatLocalPhone, phoneDigits } from '../lib/phone'
import { isWhatsAppWindowOpen, whatsappWindowLabel } from '../lib/whatsapp'
import { buildTemplateComponents, templateLanguage } from '../lib/whatsappTemplates'
import { useAuth } from '../context/AuthContext'
import { useData } from '../context/DataContext'
import type { LoyaltyTier, WhatsAppMessage, WhatsAppTemplate } from '../types'
import { Button, Card, EmptyState, Input, Modal, PageHeader, Select, StatusPill, Textarea, Toast } from '../components/ui'
import { WhatsAppConnectPanel } from '../components/WhatsAppConnectPanel'
import { displayBusinessWhatsApp } from '../lib/whatsappDisplay'
import { canonicalArea, formatCustomerArea } from '../lib/areas'
import { WhatsAppInbox } from './WhatsAppInbox'
import { WhatsAppAlertsSettings } from '../components/WhatsAppNotifier'
import { notificationPermission, requestDesktopAlerts } from '../lib/whatsappNotify'
import {
  customerUpdateLink,
  customerWalletLink,
  fillCustomerPlaceholders,
  needsProfileUpdate,
  PROFILE_UPDATE_WHATSAPP,
  publicCrmBase,
} from '../lib/customerLinks'

export function WhatsAppPage() {
  const { user } = useAuth()
  const {
    customers,
    messages,
    services,
    settings,
    whatsappTemplates,
    sendWhatsApp,
    updateWhatsAppTemplate,
    updateMessage,
    updateSettings,
  } = useData()
  const [tab, setTab] = useState<'inbox' | 'compose' | 'templates' | 'messages' | 'settings'>('inbox')
  const [toast, setToast] = useState('')
  const [automation, setAutomation] = useState(settings.automationEnabled)
  const [alertPermission, setAlertPermission] = useState(notificationPermission)
  const [editingTemplate, setEditingTemplate] = useState<WhatsAppTemplate | null>(null)
  const [templateDraft, setTemplateDraft] = useState({
    name: '',
    description: '',
    body: '',
    whatsappTemplateName: '',
    language: 'en',
    category: 'MARKETING',
    triggerDays: '',
    active: true,
  })
  const [editingMessage, setEditingMessage] = useState<WhatsAppMessage | null>(null)
  const [messageDraft, setMessageDraft] = useState({ preview: '', status: 'Sent' as WhatsAppMessage['status'] })

  const [filters, setFilters] = useState({
    location: 'all',
    locationsChecked: [] as string[],
    tier: 'all',
    serviceCategory: 'all',
    inactiveDays: 'all',
    served: 'all',
    profile: 'all',
    search: '',
  })
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [composeTemplateId, setComposeTemplateId] = useState('')
  const [composeBody, setComposeBody] = useState(
    'Hi {{customer_name}}, thank you for choosing {{salon_name}}. We would love to see you again soon.',
  )
  const [sending, setSending] = useState(false)

  const locations = useMemo(() => {
    const set = new Set<string>()
    for (const c of customers) {
      const loc = canonicalArea(c.location?.trim() || '')
      if (loc) set.add(loc)
    }
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [customers])

  const serviceCategories = useMemo(() => {
    return [...new Set(services.map((s) => s.category))].sort((a, b) => a.localeCompare(b))
  }, [services])

  const serviceNameToCategory = useMemo(() => {
    const map = new Map<string, string>()
    for (const s of services) map.set(s.name.toLowerCase(), s.category)
    return map
  }, [services])

  const filteredCustomers = useMemo(() => {
    const q = filters.search.trim().toLowerCase()
    return customers.filter((c) => {
      if (filters.locationsChecked.length > 0) {
        const loc = formatCustomerArea(c.location) || ''
        if (!filters.locationsChecked.includes(loc)) return false
      } else if (filters.location !== 'all' && (formatCustomerArea(c.location) || '') !== filters.location) {
        return false
      }
      if (filters.tier !== 'all' && c.loyaltyTier !== filters.tier) return false
      if (filters.serviceCategory !== 'all') {
        const hit = c.lastServices.some((name) => serviceNameToCategory.get(name.toLowerCase()) === filters.serviceCategory)
        if (!hit) return false
      }
      if (filters.inactiveDays !== 'all') {
        const minDays = Number(filters.inactiveDays)
        const d = daysSince(c.lastVisitAt)
        if (d == null || d < minDays) return false
      }
      if (filters.served === 'served') {
        if (!(c.totalVisits > 0 || c.lastVisitAt)) return false
      }
      if (filters.served === 'never') {
        if (c.totalVisits > 0 || c.lastVisitAt) return false
      }
      if (filters.profile === 'needs' && !needsProfileUpdate(c)) return false
      if (filters.profile === 'updated' && needsProfileUpdate(c)) return false
      if (q) {
        const hay = `${c.fullName} ${formatLocalPhone(c.phone)} ${formatLocalPhone(c.whatsappPhone)} ${phoneDigits(c.phone)} ${c.location ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [customers, filters, serviceNameToCategory])

  const eligible = customers.filter((c) => (daysSince(c.lastVisitAt) ?? 0) >= 30).slice(0, 6)

  const allFilteredSelected =
    filteredCustomers.length > 0 && filteredCustomers.every((c) => selectedIds.includes(c.id))

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      const drop = new Set(filteredCustomers.map((c) => c.id))
      setSelectedIds((prev) => prev.filter((id) => !drop.has(id)))
    } else {
      setSelectedIds((prev) => [...new Set([...prev, ...filteredCustomers.map((c) => c.id)])])
    }
  }

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const applyTemplate = (id: string) => {
    setComposeTemplateId(id)
    const t = whatsappTemplates.find((x) => x.id === id)
    if (t) setComposeBody(t.body)
  }

  const sendToSelected = async () => {
    if (!composeBody.trim()) {
      setToast('Write a message first')
      return
    }
    const targets = customers.filter((c) => selectedIds.includes(c.id))
    if (targets.length === 0) {
      setToast('Select at least one customer')
      return
    }
    setSending(true)
    let ok = 0
    let failed = 0
    const errors: string[] = []
    for (const c of targets) {
      const preview = fillCustomerPlaceholders(composeBody.trim(), c, settings.salonName || 'Belle Beauty Lounge')
      const tpl = whatsappTemplates.find((t) => t.id === composeTemplateId)
      const walletLink = customerWalletLink(c.walletToken)
      const result = await sendWhatsApp({
        customerId: c.id,
        templateId: composeTemplateId || 'manual',
        phone: c.whatsappPhone || c.phone,
        triggerType:
          tpl?.whatsappTemplateName === 'my_belle_launch' ? 'My Belle launch' : 'Bulk / Compose',
        preview,
        sentBy: user?.name ?? 'Staff',
        forceTemplate: Boolean(tpl?.whatsappTemplateName),
        metaTemplateName: tpl?.whatsappTemplateName || undefined,
        language: templateLanguage(tpl),
        templateComponents: buildTemplateComponents(tpl?.whatsappTemplateName, {
          customer: c,
          salonName: settings.salonName || 'Belle Beauty Lounge',
          walletLink,
          templateBody: tpl?.body,
        }),
      })
      if ('error' in result) {
        failed += 1
        errors.push(`${c.fullName}: ${result.error}`)
      } else {
        ok += 1
      }
    }
    setSending(false)
    if (failed && errors[0]) {
      setToast(`Sent ${ok} · ${failed} failed — ${errors[0]}`)
    } else {
      setToast(`Sent ${ok} message${ok === 1 ? '' : 's'}`)
    }
    if (ok > 0 || failed > 0) setTab('messages')
  }

  const openTemplateEdit = (t: WhatsAppTemplate) => {
    setEditingTemplate(t)
    setTemplateDraft({
      name: t.name,
      description: t.description,
      body: t.body,
      whatsappTemplateName: t.whatsappTemplateName,
      language: t.language,
      category: t.category,
      triggerDays: t.triggerDays != null ? String(t.triggerDays) : '',
      active: t.active,
    })
  }

  const saveTemplate = async () => {
    if (!editingTemplate) return
    if (!templateDraft.name.trim() || !templateDraft.body.trim()) {
      setToast('Name and message body are required')
      return
    }
    await updateWhatsAppTemplate(editingTemplate.id, {
      name: templateDraft.name.trim(),
      description: templateDraft.description.trim(),
      body: templateDraft.body,
      whatsappTemplateName: templateDraft.whatsappTemplateName.trim() || editingTemplate.whatsappTemplateName,
      language: templateDraft.language.trim() || 'en',
      category: templateDraft.category.trim() || 'MARKETING',
      triggerDays: templateDraft.triggerDays ? Number(templateDraft.triggerDays) : undefined,
      active: templateDraft.active,
    })
    setEditingTemplate(null)
    setToast('Template saved')
  }

  const openMessageEdit = (m: WhatsAppMessage) => {
    setEditingMessage(m)
    setMessageDraft({
      preview: m.preview ?? '',
      status: m.status,
    })
  }

  const saveMessage = async () => {
    if (!editingMessage) return
    await updateMessage(editingMessage.id, {
      preview: messageDraft.preview.trim() || undefined,
      status: messageDraft.status,
    })
    setEditingMessage(null)
    setToast('Message updated')
  }

  return (
    <div className={tab === 'inbox' ? 'flex h-[calc(100dvh-8.5rem)] min-h-0 flex-col overflow-hidden' : undefined}>
      {tab === 'inbox' ? null : (
      <PageHeader
        title="WhatsApp"
        subtitle={`${displayBusinessWhatsApp(settings.whatsapp)} · staff chat and automations on the same number`}
      />
      )}

      <div className="mb-3 flex shrink-0 flex-wrap gap-2">
        {(
          [
            ['inbox', 'Inbox'],
            ['compose', 'Compose'],
            ['templates', 'Templates'],
            ['messages', 'Message log'],
            ['settings', 'API settings'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              tab === key ? 'bg-rose text-white' : 'bg-white text-muted border border-line hover:text-ink'
            }`}
          >
            {label}
          </button>
        ))}
        {alertPermission === 'default' ? (
          <button
            type="button"
            onClick={async () => {
              const next = await requestDesktopAlerts()
              setAlertPermission(next)
              if (next === 'granted') setToast('Desktop alerts on — you will be pinged for new client messages')
            }}
            className="inline-flex items-center gap-1.5 rounded-full border border-rose/40 bg-blush px-4 py-2 text-sm font-medium text-rose-deep transition hover:bg-rose hover:text-white"
          >
            <Bell className="h-3.5 w-3.5" />
            Allow alerts
          </button>
        ) : null}
      </div>

      {tab === 'inbox' ? (
        <div className="min-h-0 flex-1 overflow-hidden">
          <WhatsAppInbox onToast={setToast} />
        </div>
      ) : null}

      {tab === 'compose' ? (
        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <Card>
            <h3 className="font-display text-2xl">Choose recipients</h3>
            <p className="mt-1 text-sm text-muted">Filter by location, loyalty, last service category, or inactivity.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Select
                label="Location"
                value={filters.location}
                onChange={(e) =>
                  setFilters({
                    ...filters,
                    location: e.target.value,
                    locationsChecked: [],
                  })
                }
              >
                <option value="all">All locations</option>
                {locations.map((loc) => (
                  <option key={loc} value={loc}>
                    {loc}
                  </option>
                ))}
              </Select>
              <Select
                label="Loyalty tier"
                value={filters.tier}
                onChange={(e) => setFilters({ ...filters, tier: e.target.value })}
              >
                <option value="all">All tiers</option>
                {(['Regular', 'Gold', 'Premium'] as LoyaltyTier[]).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
              <div className="sm:col-span-2">
                <p className="mb-1.5 text-sm font-medium text-ink">Multiple locations</p>
                <p className="mb-2 text-xs text-muted">
                  Optional — tick several areas. When any box is checked, it overrides the Location dropdown.
                </p>
                {locations.length === 0 ? (
                  <p className="text-sm text-muted">No locations on customers yet.</p>
                ) : (
                  <div className="max-h-40 space-y-2 overflow-y-auto rounded-xl border border-line bg-white px-3 py-2.5">
                    {locations.map((loc) => {
                      const checked = filters.locationsChecked.includes(loc)
                      return (
                        <label key={loc} className="flex cursor-pointer items-center gap-2.5 text-sm text-ink">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setFilters((prev) => ({
                                ...prev,
                                location: 'all',
                                locationsChecked: checked
                                  ? prev.locationsChecked.filter((x) => x !== loc)
                                  : [...prev.locationsChecked, loc],
                              }))
                            }}
                          />
                          {loc}
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>
              <Select
                label="Last service category"
                value={filters.serviceCategory}
                onChange={(e) => setFilters({ ...filters, serviceCategory: e.target.value })}
              >
                <option value="all">All categories</option>
                {serviceCategories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
              <Select
                label="Visit history"
                value={filters.served}
                onChange={(e) => setFilters({ ...filters, served: e.target.value })}
              >
                <option value="all">All customers</option>
                <option value="served">Already served</option>
                <option value="never">No visits yet</option>
              </Select>
              <Select
                label="Profile details"
                value={filters.profile}
                onChange={(e) => setFilters({ ...filters, profile: e.target.value })}
              >
                <option value="all">All profiles</option>
                <option value="needs">Not updated yet</option>
                <option value="updated">Updated by customer</option>
              </Select>
              <Select
                label="Inactive for"
                value={filters.inactiveDays}
                onChange={(e) => setFilters({ ...filters, inactiveDays: e.target.value })}
              >
                <option value="all">Any activity</option>
                <option value="30">30+ days</option>
                <option value="60">60+ days</option>
                <option value="90">90+ days</option>
              </Select>
              <div className="sm:col-span-2">
                <Input
                  label="Search name or phone"
                  value={filters.search}
                  onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                  placeholder="Optional"
                />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted">
                {filteredCustomers.length} match · {selectedIds.length} selected
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setFilters((prev) => ({ ...prev, served: 'served' }))
                    setSelectedIds(
                      customers
                        .filter((c) => c.totalVisits > 0 || Boolean(c.lastVisitAt))
                        .map((c) => c.id),
                    )
                  }}
                >
                  Select served customers
                </Button>
                <Button size="sm" variant="outline" onClick={toggleSelectAll}>
                  {allFilteredSelected ? 'Clear filtered' : 'Select filtered'}
                </Button>
              </div>
            </div>

            <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
              {filteredCustomers.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted">No customers match these filters.</p>
              ) : (
                filteredCustomers.map((c) => {
                  const checked = selectedIds.includes(c.id)
                  const openWindow = isWhatsAppWindowOpen(c.lastWhatsappInboundAt)
                  return (
                    <label
                      key={c.id}
                      className="flex cursor-pointer items-start gap-3 rounded-xl border border-line px-3 py-2.5 hover:bg-blush/30"
                    >
                      <input type="checkbox" className="mt-1" checked={checked} onChange={() => toggleOne(c.id)} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="font-medium text-ink">{c.fullName}</span>
                          <span
                            className={
                              openWindow
                                ? 'shrink-0 text-[11px] font-medium text-success'
                                : 'shrink-0 text-[11px] font-medium text-warning'
                            }
                          >
                            {whatsappWindowLabel(c.lastWhatsappInboundAt)}
                          </span>
                        </span>
                        <span className="block text-xs text-muted">
                          {c.loyaltyTier}
                          {formatCustomerArea(c.location) ? ` · ${formatCustomerArea(c.location)}` : ''}
                          {c.lastServices[0] ? ` · ${c.lastServices[0]}` : ''}
                        </span>
                      </span>
                    </label>
                  )
                })
              )}
            </div>
          </Card>

          <Card>
            <h3 className="font-display text-2xl">Write message</h3>
            <p className="mt-1 text-sm text-muted">
              Open 24h window → the text you type is sent. Outside the window → pick an approved template; custom wording is blocked by Meta.
            </p>
            <div className="mt-4 rounded-xl border border-line bg-blush/40 p-3">
              <p className="text-sm font-medium text-ink">Details form link</p>
              <p className="mt-1 text-xs text-muted">
                Same link for every customer. They enter their WhatsApp number, then fill name, area, and birthday.
              </p>
              <input
                readOnly
                className="mt-2 w-full rounded-xl border border-line bg-white px-3 py-2 text-xs text-ink"
                value={customerUpdateLink()}
                onFocus={(e) => e.currentTarget.select()}
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(customerUpdateLink())
                      setToast('Form link copied')
                    } catch {
                      setToast(customerUpdateLink())
                    }
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copy link
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setComposeTemplateId('')
                    setComposeBody(PROFILE_UPDATE_WHATSAPP)
                    setToast('Message ready — each selected customer gets their own link')
                  }}
                >
                  Put personal links in the message
                </Button>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              <Select label="Start from template" value={composeTemplateId} onChange={(e) => applyTemplate(e.target.value)}>
                <option value="">Blank / custom</option>
                {whatsappTemplates
                  .filter((t) => t.active)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </Select>
              {whatsappTemplates.find((t) => t.id === composeTemplateId)?.whatsappTemplateName === 'my_belle_launch' ? (
                <p className="rounded-xl border border-line bg-blush/40 px-3 py-2 text-xs text-muted">
                  Sends the approved <code>my_belle_launch</code> template. In Meta, the button{' '}
                  <strong>دخول My Belle</strong> should open <code>{customerUpdateLink()}</code>
                  . The customer enters their WhatsApp number and the form saves into this CRM.
                </p>
              ) : null}
              <Textarea
                label="Message"
                value={composeBody}
                onChange={(e) => setComposeBody(e.target.value)}
                className="min-h-44"
              />
              <p className="text-xs text-muted">
                Placeholders: {'{{customer_name}}'}, {'{{salon_name}}'}, {'{{loyalty_tier}}'}, {'{{location}}'},{' '}
                {'{{days_since_visit}}'}, {'{{wallet_link}}'}, {'{{update_link}}'}
              </p>
              <p className="text-xs text-muted">
                Wallet card for Meta templates (each customer gets their own ending):{' '}
                <code className="break-all">
                  {publicCrmBase() || 'https://bellebeauty-spa.netlify.app'}/w/{'{{1}}'}
                </code>
              </p>
              <Button className="w-full" disabled={sending} onClick={() => void sendToSelected()}>
                <Send className="h-4 w-4" />
                {sending ? 'Sending…' : `Send to ${selectedIds.length || 0} customer${selectedIds.length === 1 ? '' : 's'}`}
              </Button>
              <div className="flex items-start gap-2 rounded-xl bg-blush/60 p-3 text-sm text-muted">
                <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose" />
                Outside Meta’s 24-hour chat window, marketing/utility templates must be approved. Free-form text works
                best for recent conversations.
              </div>
            </div>
          </Card>
        </div>
      ) : null}

      {tab === 'templates' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {whatsappTemplates.map((t) => (
            <Card key={t.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-display text-xl">{t.name}</h3>
                  <p className="text-xs text-muted">
                    {t.whatsappTemplateName} · {t.language.toUpperCase()} · {t.category}
                    {t.triggerDays ? ` · ${t.triggerDays}-day trigger` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusPill status={t.active ? 'active' : 'disabled'} />
                  <Button size="sm" variant="outline" onClick={() => openTemplateEdit(t)}>
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                </div>
              </div>
              <p className="mt-3 text-sm text-muted">{t.description}</p>
              <pre className="mt-4 whitespace-pre-wrap rounded-xl bg-blush/50 p-4 text-sm font-sans">{t.body}</pre>
            </Card>
          ))}
        </div>
      ) : null}

      {tab === 'messages' ? (
        messages.length === 0 ? (
          <EmptyState
            title="No messages yet"
            description="Use Compose to send, or send from a customer profile. Messages appear here."
          />
        ) : (
          <Card padding={false}>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-blush/50 text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-5 py-3">Date</th>
                    <th className="px-5 py-3">Customer</th>
                    <th className="px-5 py-3">Phone</th>
                    <th className="px-5 py-3">Template</th>
                    <th className="px-5 py-3">Message</th>
                    <th className="px-5 py-3">Mode</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Sent by</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {messages.map((m) => (
                    <tr key={m.id} className="border-t border-line/80">
                      <td className="px-5 py-3 whitespace-nowrap">
                        {new Date(m.sentAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </td>
                      <td className="px-5 py-3">{customers.find((c) => c.id === m.customerId)?.fullName ?? '—'}</td>
                      <td className="px-5 py-3 text-muted">{formatLocalPhone(m.phone)}</td>
                      <td className="px-5 py-3">
                        {whatsappTemplates.find((t) => t.id === m.templateId)?.name ?? m.templateId}
                      </td>
                      <td className="max-w-[220px] px-5 py-3 text-muted">
                        <p className="line-clamp-2 whitespace-pre-wrap">{m.preview || '—'}</p>
                        {m.status === 'Failed' && m.errorMessage ? (
                          <p className="mt-1 text-xs text-rose-deep line-clamp-3">
                            {m.errorMessage}
                            {m.metaErrorCode != null ? ` (code ${m.metaErrorCode})` : ''}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-5 py-3 text-xs text-muted capitalize">{m.sendMode || '—'}</td>
                      <td className="px-5 py-3">
                        <div className="flex flex-col gap-1">
                          <StatusPill status={m.status} />
                          {m.readAt ? (
                            <span className="text-[11px] text-muted">
                              Read {new Date(m.readAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          ) : m.deliveredAt ? (
                            <span className="text-[11px] text-muted">
                              Delivered{' '}
                              {new Date(m.deliveredAt).toLocaleString('en-GB', {
                                day: 'numeric',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-5 py-3">{m.sentBy}</td>
                      <td className="px-5 py-3 text-right">
                        <Button size="sm" variant="outline" onClick={() => openMessageEdit(m)}>
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )
      ) : null}

      {tab === 'settings' ? (
        <div className="space-y-4">
          <WhatsAppAlertsSettings />
          <WhatsAppConnectPanel onToast={setToast} />
          <Card>
            <h3 className="font-display text-2xl">Reminders</h3>
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={automation} onChange={(e) => setAutomation(e.target.checked)} />
              Enable automated reminders (30 / 60 / 90-day inactive customers)
            </label>
            <div className="mt-3">
              <Button
                onClick={async () => {
                  await updateSettings({ automationEnabled: automation })
                  setToast('Reminder setting saved')
                }}
              >
                Save reminders
              </Button>
            </div>
          </Card>
          <Card>
            <h3 className="font-display text-2xl">Eligible for reminder</h3>
            <p className="mt-1 text-sm text-muted">Based on last recorded visit only.</p>
            {eligible.length === 0 ? (
              <p className="mt-6 text-sm text-muted">No eligible customers yet — record visits first.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {eligible.map((c) => {
                  const days = daysSince(c.lastVisitAt) ?? 0
                  const bucket = days >= 90 ? '90-day' : days >= 60 ? '60-day' : '30-day'
                  return (
                    <li
                      key={c.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-3"
                    >
                      <div>
                        <p className="font-medium">{c.fullName}</p>
                        <p className="text-xs text-muted">
                          {days} days · {bucket} reminder
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setFilters({
                            location: 'all',
                            locationsChecked: [],
                            tier: 'all',
                            serviceCategory: 'all',
                            inactiveDays: '30',
                            served: 'all',
                            profile: 'all',
                            search: c.fullName,
                          })
                          setSelectedIds([c.id])
                          setTab('compose')
                        }}
                      >
                        <Send className="h-3.5 w-3.5" />
                        Compose
                      </Button>
                    </li>
                  )
                })}
              </ul>
            )}
            <div className="mt-5 flex items-start gap-2 rounded-xl bg-blush/60 p-3 text-sm text-muted">
              <MessageCircle className="mt-0.5 h-4 w-4 text-rose" />
              Use Compose filters for location / tier / category campaigns.
            </div>
          </Card>
        </div>
      ) : null}

      <Modal
        open={!!editingTemplate}
        onClose={() => setEditingTemplate(null)}
        title="Edit WhatsApp template"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditingTemplate(null)}>
              Cancel
            </Button>
            <Button onClick={saveTemplate}>Save template</Button>
          </>
        }
      >
        <div className="max-h-[65vh] space-y-3 overflow-y-auto pr-1">
          <Input
            label="Display name"
            value={templateDraft.name}
            onChange={(e) => setTemplateDraft({ ...templateDraft, name: e.target.value })}
          />
          <Input
            label="Meta template name"
            value={templateDraft.whatsappTemplateName}
            onChange={(e) => setTemplateDraft({ ...templateDraft, whatsappTemplateName: e.target.value })}
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <Input
              label="Language"
              value={templateDraft.language}
              onChange={(e) => setTemplateDraft({ ...templateDraft, language: e.target.value })}
            />
            <Input
              label="Category"
              value={templateDraft.category}
              onChange={(e) => setTemplateDraft({ ...templateDraft, category: e.target.value })}
            />
            <Input
              label="Trigger days"
              type="number"
              value={templateDraft.triggerDays}
              onChange={(e) => setTemplateDraft({ ...templateDraft, triggerDays: e.target.value })}
              placeholder="Optional"
            />
          </div>
          <Input
            label="Description"
            value={templateDraft.description}
            onChange={(e) => setTemplateDraft({ ...templateDraft, description: e.target.value })}
          />
          <Textarea
            label="Message body"
            value={templateDraft.body}
            onChange={(e) => setTemplateDraft({ ...templateDraft, body: e.target.value })}
            className="min-h-36"
          />
          <p className="text-xs text-muted">
            Placeholders: {'{{customer_name}}'}, {'{{salon_name}}'}, {'{{days_since_visit}}'}, {'{{owner_name}}'},{' '}
            {'{{staff_name}}'}, {'{{document_type}}'}, {'{{expiry_date}}'}, {'{{days_remaining}}'}
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={templateDraft.active}
              onChange={(e) => setTemplateDraft({ ...templateDraft, active: e.target.checked })}
            />
            Active template
          </label>
        </div>
      </Modal>

      <Modal
        open={!!editingMessage}
        onClose={() => setEditingMessage(null)}
        title="Edit message"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditingMessage(null)}>
              Cancel
            </Button>
            <Button onClick={saveMessage}>Save message</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Textarea
            label="Message text"
            value={messageDraft.preview}
            onChange={(e) => setMessageDraft({ ...messageDraft, preview: e.target.value })}
            className="min-h-36"
          />
          <Select
            label="Status"
            value={messageDraft.status}
            onChange={(e) => setMessageDraft({ ...messageDraft, status: e.target.value as WhatsAppMessage['status'] })}
          >
            <option value="Queued">Queued</option>
            <option value="Sent">Sent</option>
            <option value="Delivered">Delivered</option>
            <option value="Read">Read</option>
            <option value="Failed">Failed</option>
          </Select>
        </div>
      </Modal>

      {toast ? <Toast message={toast} onClose={() => setToast('')} /> : null}
    </div>
  )
}
