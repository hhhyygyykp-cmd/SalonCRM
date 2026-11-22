import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type {
  Customer,
  CustomerMembership,
  Expense,
  Gift,
  LoyaltyRewardType,
  SalonSettings,
  ServiceItem,
  StaffUser,
  Visit,
  VisitService,
  Voucher,
  WhatsAppMessage,
  WhatsAppTemplate,
} from '../types'
import { normalizeCustomerLocation } from '../lib/areas'
import { calcVoucherDiscount } from '../lib/vouchers'
import { calcLoyaltyTier, defaultLoyaltyTiers, availableLoyaltyRewards, findClassicManiPedi, earnedNewThousandReward } from '../lib/loyalty'
import { customerLifetimeSpend } from '../lib/revenue'
import {
  mapCustomer,
  mapCustomerMembership,
  mapExpense,
  mapGift,
  mapMembershipCycle,
  mapMembershipUsage,
  mapMessage,
  mapProfile,
  mapService,
  mapSettings,
  mapTemplate,
  mapVisit,
  mapVoucher,
  profileToDb,
} from '../lib/mappers'
import { supabase, supabaseConfigured } from '../lib/supabase'
import { useAuth } from './AuthContext'
import { salonSettings as fallbackSettings } from '../data/mockData'
import { GIFT_RECEIVED_WHATSAPP } from '../lib/giftWhatsapp'
import { phoneKey, phonesMatch, toStoredPhone } from '../lib/phone'
import { publicCrmBase } from '../lib/customerLinks'
import {
  buildMonthlyCycles,
  canDeleteMembership,
  canRecordUsage,
  currentUsableCycle,
  deriveMembershipStatus,
  expiryFromActivation,
  getMembershipProduct,
  refreshCycleStatuses,
  todayYmd,
  withLiveMembership,
} from '../lib/memberships'

interface LiveData {
  customers: Customer[]
  visits: Visit[]
  messages: WhatsAppMessage[]
  services: ServiceItem[]
  staffMembers: StaffUser[]
  settings: SalonSettings & { whatsappPhoneNumberId?: string; whatsappBusinessAccountId?: string }
  vouchers: Voucher[]
  expenses: Expense[]
  whatsappTemplates: WhatsAppTemplate[]
  gifts: Gift[]
  memberships: CustomerMembership[]
  loyaltyTiers: typeof defaultLoyaltyTiers
}

interface DataContextValue extends LiveData {
  loading: boolean
  loadError: string | null
  refresh: () => Promise<void>
  addCustomer: (input: {
    fullName: string
    phone: string
    email?: string
    birthday?: string
    notes?: string
    location?: string
    createdBy: string
  }) => Promise<Customer | { error: string }>
  updateCustomer: (
    id: string,
    patch: {
      fullName: string
      phone: string
      email?: string
      birthday?: string
      notes?: string
      location?: string
    },
  ) => Promise<Customer | { error: string }>
  addMembership: (input: {
    customerId: string
    productId: string
    purchaseDate: string
    activateNow: boolean
    activationDate?: string
    notes?: string
    createdBy: string
  }) => Promise<CustomerMembership | { error: string }>
  activateMembership: (id: string, activationDate: string) => Promise<CustomerMembership | { error: string }>
  setMembershipFrozen: (id: string, frozen: boolean) => Promise<CustomerMembership | { error: string }>
  recordMembershipUsage: (id: string, staffId: string, notes?: string) => Promise<CustomerMembership | { error: string }>
  deleteMembership: (id: string) => Promise<{ ok: true } | { error: string }>
  addVisit: (input: {
    customerId: string
    staffId: string
    visitDate: string
    services: VisitService[]
    discount: number
    voucherId?: string
    deliveryFee: number
    paymentMethod?: Visit['paymentMethod']
    notes?: string
    /** Gift purchase: customerId is the sender (payer) */
    giftPurchase?: {
      receiverCustomerId: string
      serviceId: string
      serviceName: string
      servicePrice: number
    }
    /** Redeem an existing valid gift for this customer (receiver) */
    giftRedeemId?: string
    /** Loyalty free service (Gold / Premium). Cannot combine with gifts. */
    loyaltyRewardType?: LoyaltyRewardType
  }) => Promise<
    | (Visit & {
        thankYou?: 'sent' | 'failed' | 'skipped'
        thankYouError?: string
        walletCard?: 'sent' | 'failed' | 'skipped'
        walletCardError?: string
        giftNotice?: 'sent' | 'failed' | 'skipped'
        giftNoticeError?: string
      })
    | { error: string }
  >
  updateVisit: (
    id: string,
    patch: {
      staffId: string
      visitDate: string
      services: VisitService[]
      discount: number
      voucherId?: string
      deliveryFee: number
      paymentMethod?: Visit['paymentMethod']
      notes?: string
    },
  ) => Promise<Visit | { error: string }>
  addService: (input: Omit<ServiceItem, 'id'>) => Promise<void>
  addMessage: (input: Omit<WhatsAppMessage, 'id'>) => Promise<WhatsAppMessage | { error: string }>
  sendWhatsApp: (input: {
    customerId?: string
    staffId?: string
    templateId: string
    phone: string
    triggerType: string
    preview: string
    sentBy: string
    /** Force Meta template even inside 24h window */
    useTemplate?: boolean
    forceTemplate?: boolean
    forceText?: boolean
    metaTemplateName?: string
    language?: string
    templateComponents?: unknown[]
  }) => Promise<WhatsAppMessage | { error: string }>
  updateMessage: (id: string, patch: Partial<WhatsAppMessage>) => Promise<void>
  updateWhatsAppTemplate: (id: string, patch: Partial<WhatsAppTemplate>) => Promise<void>
  addStaff: (input: Omit<StaffUser, 'id' | 'createdAt' | 'updatedAt'>) => Promise<StaffUser | { error: string }>
  updateStaff: (id: string, patch: Partial<StaffUser>) => Promise<void>
  updateSettings: (patch: Partial<SalonSettings & { whatsappPhoneNumberId?: string; whatsappBusinessAccountId?: string }>) => Promise<void>
  addVoucher: (input: Omit<Voucher, 'id' | 'usedCount' | 'createdAt'>) => Promise<Voucher | { error: string }>
  updateVoucher: (id: string, patch: Partial<Voucher>) => Promise<void>
  addExpense: (input: Omit<Expense, 'id' | 'createdAt'>) => Promise<Expense | { error: string }>
  updateExpense: (id: string, patch: Partial<Expense>) => Promise<void>
  deleteExpense: (id: string) => Promise<void>
  payStaffSalary: (staffId: string, recordedBy: string) => Promise<{ ok: true } | { error: string }>
  sendOwnerDocumentReminders: () => Promise<number>
}

const DataContext = createContext<DataContextValue | null>(null)
const visitSaveLocks = new Set<string>()

const emptyLive: LiveData = {
  customers: [],
  visits: [],
  messages: [],
  services: [],
  staffMembers: [],
  settings: fallbackSettings,
  vouchers: [],
  expenses: [],
  whatsappTemplates: [],
  gifts: [],
  memberships: [],
  loyaltyTiers: defaultLoyaltyTiers,
}

export function DataProvider({ children }: { children: ReactNode }) {
  const { user, configured } = useAuth()
  const [data, setData] = useState<LiveData>(emptyLive)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const templateSyncRef = useRef<{ salonId: string; syncedAt: number } | null>(null)

  const refresh = useCallback(async () => {
    if (!configured || !supabaseConfigured || !user) {
      setData(emptyLive)
      setLoadError(null)
      setLoading(false)
      return
    }
    const salonId = user.salonId
    if (!salonId) {
      setData(emptyLive)
      setLoadError('This account is not assigned to a salon.')
      setLoading(false)
      return
    }
    setLoading(true)
    const lastTemplateSync = templateSyncRef.current
    const shouldSyncTemplates =
      lastTemplateSync?.salonId !== salonId || Date.now() - lastTemplateSync.syncedAt >= 5 * 60 * 1000
    if (shouldSyncTemplates) {
      templateSyncRef.current = { salonId, syncedAt: Date.now() }
      await supabase.functions.invoke('send-whatsapp', {
        body: { action: 'sync_templates' },
      })
    }

    const scoped = (table: string) => supabase.from(table).select('*').eq('salon_id', salonId)
    const [
      customersRes,
      visitsRes,
      messagesRes,
      servicesRes,
      profilesRes,
      settingsRes,
      vouchersRes,
      expensesRes,
      templatesRes,
      giftsRes,
      membershipsRes,
      cyclesRes,
      usagesRes,
    ] = await Promise.all([
      scoped('customers').order('full_name'),
      scoped('visits').order('visit_date', { ascending: false }),
      scoped('whatsapp_messages').order('sent_at', { ascending: false }),
      scoped('services').order('category'),
      scoped('profiles').order('name'),
      supabase.from('salon_settings').select('*').eq('salon_id', salonId).maybeSingle(),
      scoped('vouchers').order('created_at', { ascending: false }),
      scoped('expenses').order('expense_date', { ascending: false }),
      scoped('whatsapp_templates').order('name'),
      scoped('gifts').order('purchased_at', { ascending: false }),
      scoped('customer_memberships').order('created_at', { ascending: false }),
      scoped('membership_cycles').order('cycle_index'),
      scoped('membership_usages').order('used_at', { ascending: false }),
    ])

    const firstError =
      customersRes.error?.message ||
      visitsRes.error?.message ||
      messagesRes.error?.message ||
      servicesRes.error?.message ||
      profilesRes.error?.message ||
      settingsRes.error?.message ||
      vouchersRes.error?.message ||
      expensesRes.error?.message ||
      templatesRes.error?.message ||
      (giftsRes.error && !/does not exist|schema cache/i.test(giftsRes.error.message)
        ? giftsRes.error.message
        : null) ||
      (membershipsRes.error && !/does not exist|schema cache/i.test(membershipsRes.error.message)
        ? membershipsRes.error.message
        : null) ||
      (cyclesRes.error && !/does not exist|schema cache/i.test(cyclesRes.error.message)
        ? cyclesRes.error.message
        : null) ||
      (usagesRes.error && !/does not exist|schema cache/i.test(usagesRes.error.message)
        ? usagesRes.error.message
        : null) ||
      null

    if (firstError) {
      setLoadError(firstError)
      setLoading(false)
      return
    }

    setLoadError(null)
    setData({
      customers: (customersRes.data ?? []).map((r) => mapCustomer(r as Record<string, unknown>)),
      visits: (visitsRes.data ?? []).map((r) => mapVisit(r as Record<string, unknown>)),
      messages: (messagesRes.data ?? []).map((r) => mapMessage(r as Record<string, unknown>)),
      services: (servicesRes.data ?? []).map((r) => mapService(r as Record<string, unknown>)),
      staffMembers: (profilesRes.data ?? []).map((r) => mapProfile(r as Record<string, unknown>)),
      settings: settingsRes.data
        ? mapSettings(settingsRes.data as Record<string, unknown>)
        : { ...emptyLive.settings, salonName: 'Salon' },
      vouchers: (vouchersRes.data ?? []).map((r) => mapVoucher(r as Record<string, unknown>)),
      expenses: (expensesRes.data ?? []).map((r) => mapExpense(r as Record<string, unknown>)),
      whatsappTemplates: (templatesRes.data ?? []).map((r) => mapTemplate(r as Record<string, unknown>)),
      gifts: (giftsRes.data ?? []).map((r) => mapGift(r as Record<string, unknown>)),
      memberships: (membershipsRes.data ?? []).map((r) =>
        withLiveMembership(
          mapCustomerMembership(
            r as Record<string, unknown>,
            (cyclesRes.data ?? []).map((c) => mapMembershipCycle(c as Record<string, unknown>)),
            (usagesRes.data ?? []).map((u) => mapMembershipUsage(u as Record<string, unknown>)),
          ),
        ),
      ),
      loyaltyTiers: defaultLoyaltyTiers,
    })
    setLoading(false)
  }, [configured, user])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const value = useMemo<DataContextValue>(() => {
    return {
      ...data,
      loading,
      loadError,
      refresh,
      addCustomer: async (input) => {
        const phone = toStoredPhone(input.phone)
        if (!phoneKey(phone) || phoneKey(phone).length < 8) {
          return { error: 'Enter a valid mobile number, e.g. 0501234567.' }
        }
        const duplicate = data.customers.find(
          (c) => phonesMatch(c.phone, phone) || phonesMatch(c.whatsappPhone, phone),
        )
        if (duplicate) return { error: `A customer with this phone already exists: ${duplicate.fullName}` }
        const now = new Date().toISOString()
        const id = `c${Date.now()}`
        const row = {
          id,
          full_name: input.fullName.trim(),
          phone,
          whatsapp_phone: phone,
          email: input.email || null,
          birthday: input.birthday || null,
          notes: input.notes || null,
          location: normalizeCustomerLocation(input.location) || null,
          loyalty_tier: 'Regular',
          lifetime_spend: 0,
          total_visits: 0,
          last_services: [],
          created_by: input.createdBy || user?.id || null,
          created_at: now,
          updated_at: now,
          salon_id: user?.salonId || null,
        }
        const { data: inserted, error } = await supabase.from('customers').insert(row).select('*').single()
        if (error || !inserted) return { error: error?.message ?? 'Failed to create customer' }
        const customer = mapCustomer(inserted as Record<string, unknown>)
        setData((prev) => ({ ...prev, customers: [customer, ...prev.customers] }))
        return customer
      },
      updateCustomer: async (id, patch) => {
        const phone = toStoredPhone(patch.phone)
        if (!phoneKey(phone) || phoneKey(phone).length < 8) {
          return { error: 'Enter a valid mobile number, e.g. 0501234567.' }
        }
        const duplicate = data.customers.find(
          (c) => c.id !== id && (phonesMatch(c.phone, phone) || phonesMatch(c.whatsappPhone, phone)),
        )
        if (duplicate) {
          return { error: `A customer with this phone already exists: ${duplicate.fullName}` }
        }
        const now = new Date().toISOString()
        const row = {
          full_name: patch.fullName.trim(),
          phone,
          whatsapp_phone: phone,
          email: patch.email?.trim() || null,
          birthday: patch.birthday?.trim() || null,
          notes: patch.notes?.trim() || null,
          location: normalizeCustomerLocation(patch.location) || null,
          updated_at: now,
        }
        const { data: updated, error } = await supabase.from('customers').update(row).eq('id', id).select('*').single()
        if (error || !updated) return { error: error?.message ?? 'Failed to update customer' }
        const customer = mapCustomer(updated as Record<string, unknown>)
        setData((prev) => ({
          ...prev,
          customers: prev.customers.map((c) => (c.id === id ? customer : c)),
        }))
        return customer
      },
      addMembership: async (input) => {
        const product = getMembershipProduct(input.productId)
        if (!product) return { error: 'Choose a Belle subscription package.' }
        const customer = data.customers.find((c) => c.id === input.customerId)
        if (!customer) return { error: 'Select an existing customer.' }
        if (!input.purchaseDate) return { error: 'Purchase date is required.' }

        const now = new Date().toISOString()
        const id = `cm${Date.now()}`
        const activateNow = Boolean(input.activateNow)
        const activationDate = activateNow ? input.activationDate || input.purchaseDate || todayYmd() : undefined
        const expiryDate = activationDate ? expiryFromActivation(activationDate, product.validityMonths) : undefined
        const status = activationDate ? 'Active' : 'Pending'

        const row = {
          id,
          customer_id: input.customerId,
          product_id: product.id,
          product_name: product.name,
          service_name: product.serviceName,
          model: product.model,
          price: product.price,
          purchase_date: input.purchaseDate,
          activation_date: activationDate ?? null,
          expiry_date: expiryDate ?? null,
          total_sessions: product.totalSessions,
          used_sessions: 0,
          status,
          notes: input.notes?.trim() || null,
          created_by: input.createdBy || user?.id || null,
          created_at: now,
          updated_at: now,
        }

        const { data: inserted, error } = await supabase.from('customer_memberships').insert(row).select('*').single()
        if (error || !inserted) return { error: error?.message ?? 'Failed to add package.' }

        let cycles = [] as ReturnType<typeof mapMembershipCycle>[]
        if (product.model === 'monthly_cycle' && activationDate) {
          const built = refreshCycleStatuses(
            buildMonthlyCycles(activationDate, id).map((c) => ({ ...c, id: `cyc${id}-${c.cycleIndex}` })),
          )
          const { data: cycleRows, error: cycleError } = await supabase
            .from('membership_cycles')
            .insert(
              built.map((c) => ({
                id: c.id,
                membership_id: id,
                cycle_index: c.cycleIndex,
                start_date: c.startDate,
                end_date: c.endDate,
                status: c.status,
              })),
            )
            .select('*')
          if (cycleError) return { error: cycleError.message }
          cycles = (cycleRows ?? []).map((c) => mapMembershipCycle(c as Record<string, unknown>))
        }

        const membership = withLiveMembership(mapCustomerMembership(inserted as Record<string, unknown>, cycles, []))

        const lifetimeSpend = customer.lifetimeSpend + product.price
        const loyaltyTier = calcLoyaltyTier(lifetimeSpend, data.loyaltyTiers)
        const { data: updatedCustomer } = await supabase
          .from('customers')
          .update({
            lifetime_spend: lifetimeSpend,
            loyalty_tier: loyaltyTier,
            updated_at: now,
          })
          .eq('id', customer.id)
          .select('*')
          .single()

        const mappedCustomer = updatedCustomer
          ? mapCustomer(updatedCustomer as Record<string, unknown>)
          : { ...customer, lifetimeSpend, loyaltyTier }

        setData((prev) => ({
          ...prev,
          memberships: [membership, ...prev.memberships],
          customers: prev.customers.map((c) => (c.id === customer.id ? mappedCustomer : c)),
        }))
        return membership
      },
      activateMembership: async (id, activationDate) => {
        const current = data.memberships.find((m) => m.id === id)
        if (!current) return { error: 'Membership not found.' }
        if (current.activationDate) return { error: 'This package is already activated.' }
        if (!activationDate) return { error: 'Activation date is required.' }

        const now = new Date().toISOString()
        const product = getMembershipProduct(current.productId)
        const validityMonths = product?.validityMonths ?? (current.model === 'monthly_cycle' ? 12 : 4)
        const expiryDate = expiryFromActivation(activationDate, validityMonths)

        let cycles = current.cycles
        if (current.model === 'monthly_cycle' && cycles.length === 0) {
          const built = refreshCycleStatuses(
            buildMonthlyCycles(activationDate, id).map((c) => ({ ...c, id: `cyc${id}-${c.cycleIndex}` })),
          )
          const { data: cycleRows, error: cycleError } = await supabase
            .from('membership_cycles')
            .insert(
              built.map((c) => ({
                id: c.id,
                membership_id: id,
                cycle_index: c.cycleIndex,
                start_date: c.startDate,
                end_date: c.endDate,
                status: c.status,
              })),
            )
            .select('*')
          if (cycleError) return { error: cycleError.message }
          cycles = (cycleRows ?? []).map((c) => mapMembershipCycle(c as Record<string, unknown>))
        }

        const { data: updated, error } = await supabase
          .from('customer_memberships')
          .update({
            activation_date: activationDate,
            expiry_date: expiryDate,
            status: 'Active',
            updated_at: now,
          })
          .eq('id', id)
          .select('*')
          .single()
        if (error || !updated) return { error: error?.message ?? 'Failed to activate package.' }

        const membership = withLiveMembership(
          mapCustomerMembership(updated as Record<string, unknown>, cycles, current.usages),
        )
        setData((prev) => ({
          ...prev,
          memberships: prev.memberships.map((m) => (m.id === id ? membership : m)),
        }))
        return membership
      },
      setMembershipFrozen: async (id, frozen) => {
        const current = data.memberships.find((m) => m.id === id)
        if (!current) return { error: 'Membership not found.' }
        if (!current.activationDate) return { error: 'Activate the package before freezing it.' }
        const live = withLiveMembership(current)
        if (live.status === 'Completed' || live.status === 'Expired') {
          return { error: 'Completed or expired packages cannot be frozen.' }
        }
        const now = new Date().toISOString()
        const nextStatus = frozen ? 'Frozen' : deriveMembershipStatus({ ...current, status: 'Active' })
        const { data: updated, error } = await supabase
          .from('customer_memberships')
          .update({ status: nextStatus, updated_at: now })
          .eq('id', id)
          .select('*')
          .single()
        if (error || !updated) return { error: error?.message ?? 'Failed to update package.' }
        const membership = withLiveMembership(
          mapCustomerMembership(updated as Record<string, unknown>, current.cycles, current.usages),
        )
        setData((prev) => ({
          ...prev,
          memberships: prev.memberships.map((m) => (m.id === id ? membership : m)),
        }))
        return membership
      },
      recordMembershipUsage: async (id, staffId, notes) => {
        const current = data.memberships.find((m) => m.id === id)
        if (!current) return { error: 'Membership not found.' }
        const membership = withLiveMembership(current)
        if (!canRecordUsage(membership)) {
          if (membership.model === 'monthly_cycle') {
            return { error: 'No session available this month. Unused months do not carry forward.' }
          }
          return { error: 'This package cannot be used right now.' }
        }

        const now = new Date().toISOString()
        const usageId = `mu${Date.now()}`
        let cycleId: string | undefined
        let nextCycles = membership.cycles
        const usedSessions = membership.usedSessions + 1

        if (membership.model === 'monthly_cycle') {
          const cycle = currentUsableCycle(membership)
          if (!cycle) return { error: 'No session available this month. Unused months do not carry forward.' }
          cycleId = cycle.id
          const { error: cycleError } = await supabase
            .from('membership_cycles')
            .update({ status: 'Used', used_at: now, used_by: staffId })
            .eq('id', cycle.id)
          if (cycleError) return { error: cycleError.message }
          nextCycles = membership.cycles.map((c) =>
            c.id === cycle.id ? { ...c, status: 'Used' as const, usedAt: now, usedBy: staffId } : c,
          )
        }

        const expiredToPersist = refreshCycleStatuses(nextCycles).filter(
          (c) => c.status === 'Expired' && nextCycles.find((x) => x.id === c.id)?.status !== 'Expired',
        )
        if (expiredToPersist.length) {
          await Promise.all(
            expiredToPersist.map((c) => supabase.from('membership_cycles').update({ status: 'Expired' }).eq('id', c.id)),
          )
          nextCycles = refreshCycleStatuses(nextCycles)
        }

        const { error: usageError } = await supabase.from('membership_usages').insert({
          id: usageId,
          membership_id: id,
          cycle_id: cycleId ?? null,
          used_at: now,
          staff_id: staffId,
          notes: notes?.trim() || null,
        })
        if (usageError) return { error: usageError.message }

        const next = withLiveMembership({
          ...membership,
          usedSessions,
          cycles: nextCycles,
          usages: [
            {
              id: usageId,
              membershipId: id,
              cycleId,
              usedAt: now,
              staffId,
              notes: notes?.trim() || undefined,
            },
            ...membership.usages,
          ],
          updatedAt: now,
        })

        const { error: memError } = await supabase
          .from('customer_memberships')
          .update({
            used_sessions: usedSessions,
            status: next.status,
            updated_at: now,
          })
          .eq('id', id)
        if (memError) return { error: memError.message }

        setData((prev) => ({
          ...prev,
          memberships: prev.memberships.map((m) => (m.id === id ? next : m)),
        }))
        return next
      },
      deleteMembership: async (id) => {
        const current = data.memberships.find((m) => m.id === id)
        if (!current) return { error: 'Membership not found.' }
        if (!canDeleteMembership(current)) {
          return { error: 'This package cannot be deleted because a session has already been used.' }
        }

        const { error } = await supabase.from('customer_memberships').delete().eq('id', id)
        if (error) return { error: error.message }

        const remaining = data.memberships.filter((m) => m.id !== id)
        const lifetimeSpend = customerLifetimeSpend(data.visits, remaining, current.customerId)
        const loyaltyTier = calcLoyaltyTier(lifetimeSpend, data.loyaltyTiers)
        const now = new Date().toISOString()
        const { data: updatedCustomer } = await supabase
          .from('customers')
          .update({
            lifetime_spend: lifetimeSpend,
            loyalty_tier: loyaltyTier,
            updated_at: now,
          })
          .eq('id', current.customerId)
          .select('*')
          .single()

        setData((prev) => ({
          ...prev,
          memberships: prev.memberships.filter((m) => m.id !== id),
          customers: updatedCustomer
            ? prev.customers.map((c) =>
                c.id === current.customerId ? mapCustomer(updatedCustomer as Record<string, unknown>) : c,
              )
            : prev.customers,
        }))
        return { ok: true }
      },
      addVisit: async (input) => {
        if (input.giftPurchase && input.giftRedeemId) {
          return { error: 'Choose either gift purchase or gift redeem, not both.' }
        }
        if (input.loyaltyRewardType && (input.giftPurchase || input.giftRedeemId)) {
          return { error: 'Loyalty rewards cannot be combined with a gift on the same visit.' }
        }

        let services = [...input.services]
        let redeemGift: Gift | undefined

        const customer = data.customers.find((c) => c.id === input.customerId)
        if (!customer) return { error: 'Customer not found.' }
        if (visitSaveLocks.has(customer.id)) {
          return { error: 'This visit is already being saved. Wait a moment.' }
        }
        visitSaveLocks.add(customer.id)
        try {

        if (input.loyaltyRewardType) {
          const available = availableLoyaltyRewards(customer, data.visits)
          const reward = available.find((r) => r.type === input.loyaltyRewardType)
          if (!reward) return { error: 'This loyalty reward is not available for this customer.' }
          if (reward.locksToManiPedi) {
            const mp = findClassicManiPedi(data.services)
            if (!mp) return { error: 'Classic Mani & Pedi is not in the menu.' }
            const idx = services.findIndex((s) => s.serviceId === mp.id)
            if (idx >= 0) {
              services = services.map((s, i) => (i === idx ? { ...s, price: 0, serviceName: mp.name, quantity: Math.max(1, s.quantity) } : s))
            } else {
              services = [{ serviceId: mp.id, serviceName: mp.name, price: 0, quantity: 1 }, ...services]
            }
          } else {
            if (!services[0]?.serviceId) return { error: 'Choose the free service to redeem.' }
            services = services.map((s, i) => (i === 0 ? { ...s, price: 0 } : s))
          }
        }

        if (input.giftRedeemId) {
          redeemGift = data.gifts.find((g) => g.id === input.giftRedeemId)
          if (!redeemGift || redeemGift.status !== 'valid') {
            return { error: 'Selected gift is not valid.' }
          }
          if (redeemGift.receiverCustomerId !== input.customerId) {
            return { error: 'This gift belongs to a different customer.' }
          }
          const existingIdx = services.findIndex((s) => s.serviceId === redeemGift!.serviceId)
          if (existingIdx >= 0) {
            services = services.map((s, i) =>
              i === existingIdx
                ? { ...s, price: 0, serviceName: redeemGift!.serviceName, quantity: Math.max(1, s.quantity) }
                : s,
            )
          } else {
            services = [
              ...services,
              {
                serviceId: redeemGift.serviceId,
                serviceName: redeemGift.serviceName,
                price: 0,
                quantity: 1,
              },
            ]
          }
        }

        if (input.giftPurchase) {
          if (input.giftPurchase.receiverCustomerId === input.customerId) {
            return { error: 'Sender and receiver must be different customers.' }
          }
          if (!data.customers.some((c) => c.id === input.giftPurchase!.receiverCustomerId)) {
            return { error: 'Gift receiver not found.' }
          }
          if (!services.some((s) => s.serviceId === input.giftPurchase!.serviceId)) {
            return { error: 'Gift service must be included on this visit.' }
          }
        }

        const subtotal = services.reduce((sum, line) => sum + line.price * line.quantity, 0)
        const manualDiscount = Math.max(0, input.discount)
        const voucher = input.voucherId ? data.vouchers.find((v) => v.id === input.voucherId) : undefined
        const voucherDiscount = calcVoucherDiscount(voucher, subtotal)
        if (input.voucherId && voucherDiscount <= 0) {
          return { error: 'This voucher cannot be applied to this visit (min spend, expired, or used up).' }
        }
        const totalDiscount = Math.min(subtotal, manualDiscount + voucherDiscount)
        const deliveryFee = [0, 30, 50].includes(input.deliveryFee) ? input.deliveryFee : 0
        const finalTotal = Math.max(subtotal - totalDiscount, 0) + deliveryFee

        const visitId = `v${Date.now()}`
        const giftId = input.giftPurchase ? `gf${Date.now()}` : undefined
        const visitRow = {
          id: visitId,
          customer_id: input.customerId,
          staff_id: input.staffId,
          visit_date: input.visitDate,
          services,
          subtotal,
          discount: manualDiscount,
          voucher_id: voucher?.id ?? null,
          voucher_code: voucher?.code ?? null,
          voucher_discount: voucherDiscount || null,
          delivery_fee: deliveryFee,
          customer_location: normalizeCustomerLocation(customer.location) ?? null,
          final_total: finalTotal,
          payment_method: input.paymentMethod ?? null,
          notes: input.notes ?? null,
          gift_purchase_id: giftId ?? null,
          gift_redeem_id: input.giftRedeemId ?? null,
          loyalty_reward_type: input.loyaltyRewardType ?? null,
        }

        const lifetimeSpend = customer.lifetimeSpend + finalTotal
        const totalVisits = customer.totalVisits + 1
        const loyaltyTier = calcLoyaltyTier(lifetimeSpend, data.loyaltyTiers)

        const { data: savedVisit, error: visitError } = await supabase.rpc('complete_visit', {
          p_visit: visitRow,
          p_customer_id: input.customerId,
          p_lifetime_spend: lifetimeSpend,
          p_total_visits: totalVisits,
          p_last_visit_at: input.visitDate,
          p_last_services: services.map((s) => s.serviceName),
          p_loyalty_tier: loyaltyTier,
          p_voucher_id: voucher?.id ?? null,
        })
        if (visitError) return { error: visitError.message }
        if (!savedVisit) return { error: 'Visit could not be saved.' }

        if (input.giftPurchase && giftId) {
          const code = `GF${Math.random().toString(36).slice(2, 8).toUpperCase()}`
          const { error: giftError } = await supabase.from('gifts').insert({
            id: giftId,
            code,
            sender_customer_id: input.customerId,
            receiver_customer_id: input.giftPurchase.receiverCustomerId,
            service_id: input.giftPurchase.serviceId,
            service_name: input.giftPurchase.serviceName,
            service_price: input.giftPurchase.servicePrice,
            status: 'valid',
            purchase_visit_id: visitId,
            purchased_at: new Date().toISOString(),
            notes: input.notes ?? null,
          })
          if (giftError) return { error: `Visit saved but gift failed: ${giftError.message}` }

          const giftedPackage = getMembershipProduct(input.giftPurchase.serviceId)
          if (giftedPackage) {
            const membershipId = `cm${Date.now()}`
            const senderName = customer.fullName.split(' ')[0] || customer.fullName
            const { error: packageError } = await supabase.from('customer_memberships').insert({
              id: membershipId,
              customer_id: input.giftPurchase.receiverCustomerId,
              product_id: giftedPackage.id,
              product_name: giftedPackage.name,
              service_name: giftedPackage.serviceName,
              model: giftedPackage.model,
              price: giftedPackage.price,
              purchase_date: todayYmd(new Date(input.visitDate)),
              activation_date: null,
              expiry_date: null,
              total_sessions: giftedPackage.totalSessions,
              used_sessions: 0,
              status: 'Pending',
              notes: `[gift] From ${senderName}`,
              created_by: input.staffId || user?.id || null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            if (packageError) {
              return { error: `Gift saved, but the package could not be added to the receiver: ${packageError.message}` }
            }
          }
        }

        if (redeemGift) {
          const { error: redeemError } = await supabase
            .from('gifts')
            .update({
              status: 'used',
              redeem_visit_id: visitId,
              redeemed_at: new Date().toISOString(),
            })
            .eq('id', redeemGift.id)
            .eq('status', 'valid')
          if (redeemError) return { error: `Visit saved but gift redeem failed: ${redeemError.message}` }
        }

        // Always mint wallet token + send after-service WhatsApp
        const { data: custRow } = await supabase
          .from('customers')
          .select('wallet_token, whatsapp_phone, phone, full_name, loyalty_tier')
          .eq('id', input.customerId)
          .maybeSingle()

        let walletToken = String(custRow?.wallet_token || '')
        if (!walletToken) {
          walletToken = crypto.randomUUID()
          const { error: walletTokenError } = await supabase
            .from('customers')
            .update({ wallet_token: walletToken })
            .eq('id', input.customerId)
          if (walletTokenError) return { error: `Visit saved but wallet link failed: ${walletTokenError.message}` }
        }

        const phone = String(custRow?.whatsapp_phone || custRow?.phone || customer.whatsappPhone || '')
        let thankYou: 'sent' | 'failed' | 'skipped' = 'skipped'
        let thankYouError: string | undefined
        let walletCard: 'sent' | 'failed' | 'skipped' = 'skipped'
        let walletCardError: string | undefined
        let giftNotice: 'sent' | 'failed' | 'skipped' = 'skipped'
        let giftNoticeError: string | undefined

        if (phone) {
          const thankYouTpl =
            data.whatsappTemplates.find((t) => t.whatsappTemplateName === 'service_feedback') ||
            data.whatsappTemplates.find((t) => t.id === 'wt6')
          const preview =
            thankYouTpl?.body ||
            'شكراً لاختيارك Belle 💚\n\nنتمنى إن تجربتك اليوم كانت مثل ما تحبين ✨\n\nرأيك يهمنا ويساعدنا نقدم لِك تجربة أجمل في كل مرة.'
          try {
            const { data: fnData, error: fnError } = await supabase.functions.invoke('send-whatsapp', {
              body: {
                customerId: input.customerId,
                staffId: input.staffId,
                templateId: thankYouTpl?.id || 'wt6',
                phone,
                triggerType: 'After service',
                preview,
                sentBy: user?.name || user?.email || 'Staff',
                // Use free-form text inside the customer's open 24h window.
                // Outside it, send-whatsapp automatically uses this approved template.
                forceTemplate: false,
                metaTemplateName: 'service_feedback',
                language: thankYouTpl?.language || 'ar',
                templateComponents: [],
              },
            })
            if (fnError || fnData?.error || fnData?.ok === false) {
              thankYou = 'failed'
              thankYouError = String(fnData?.error || fnError?.message || 'WhatsApp send failed')
            } else {
              thankYou = 'sent'
            }
          } catch (e) {
            thankYou = 'failed'
            thankYouError = e instanceof Error ? e.message : 'WhatsApp send failed'
          }

          const walletTpl = data.whatsappTemplates.find(
            (template) => template.whatsappTemplateName === 'my_belle_card_ready',
          )
          if (walletTpl) {
            const walletLink = `${publicCrmBase()}/w/${walletToken}`
            try {
              const { data: walletData, error: walletError } = await supabase.functions.invoke('send-whatsapp', {
                body: {
                  customerId: input.customerId,
                  staffId: input.staffId,
                  templateId: walletTpl.id,
                  phone,
                  triggerType: 'Wallet card after service',
                  preview: `${walletTpl.body}\n\n${walletLink}`,
                  sentBy: user?.name || user?.email || 'Staff',
                  forceTemplate: true,
                  metaTemplateName: 'my_belle_card_ready',
                  language: walletTpl.language || 'ar',
                  templateComponents: [
                    {
                      type: 'button',
                      sub_type: 'url',
                      index: '0',
                      parameters: [{ type: 'text', text: walletToken }],
                    },
                  ],
                },
              })
              if (walletError || walletData?.error || walletData?.ok === false) {
                walletCard = 'failed'
                walletCardError = String(walletData?.error || walletError?.message || 'Wallet WhatsApp failed')
              } else {
                walletCard = 'sent'
              }
            } catch (e) {
              walletCard = 'failed'
              walletCardError = e instanceof Error ? e.message : 'Wallet WhatsApp failed'
            }
          }

          if (customer.loyaltyTier !== loyaltyTier && (loyaltyTier === 'Gold' || loyaltyTier === 'Premium')) {
            const restoring = Boolean(customer.loyaltyLapsedFrom)
            if (restoring) {
              await supabase.from('customers').update({ loyalty_lapsed_from: null }).eq('id', input.customerId)
            }
            const restoreName =
              loyaltyTier === 'Premium' ? 'membership_premium_restored' : 'membership_gold_restored'
            const upgradeName =
              loyaltyTier === 'Premium' ? 'membership_upgrade_premium' : 'membership_upgrade_gold'
            const metaName = restoring ? restoreName : upgradeName
            const tpl = data.whatsappTemplates.find((t) => t.whatsappTemplateName === metaName)
            const triggerType = restoring
              ? loyaltyTier === 'Premium'
                ? 'Premium restored'
                : 'Gold restored'
              : loyaltyTier === 'Premium'
                ? 'Upgrade to Premium'
                : 'Upgrade to Gold'
            try {
              await supabase.functions.invoke('send-whatsapp', {
                body: {
                  customerId: input.customerId,
                  staffId: input.staffId,
                  templateId:
                    tpl?.id ||
                    (restoring
                      ? loyaltyTier === 'Premium'
                        ? 'wt22'
                        : 'wt21'
                      : loyaltyTier === 'Premium'
                        ? 'wt17'
                        : 'wt16'),
                  phone,
                  triggerType,
                  preview: tpl?.body || '',
                  sentBy: user?.name || user?.email || 'Staff',
                  forceTemplate: true,
                  metaTemplateName: metaName,
                  language: 'ar',
                  templateComponents: [],
                },
              })
            } catch {
              // Visit still saved if restore/upgrade WhatsApp fails
            }
          }

          if (earnedNewThousandReward(customer.lifetimeSpend, lifetimeSpend, loyaltyTier)) {
            const rewardTpl =
              data.whatsappTemplates.find((t) => t.whatsappTemplateName === 'spending_reward_1000') ||
              data.whatsappTemplates.find((t) => t.id === 'wt18')
            try {
              await supabase.functions.invoke('send-whatsapp', {
                body: {
                  customerId: input.customerId,
                  staffId: input.staffId,
                  templateId: rewardTpl?.id || 'wt18',
                  phone,
                  triggerType: 'AED 1,000 reward',
                  preview:
                    rewardTpl?.body ||
                    'لديك مكافأة جديدة من Belle 💚\n\nوصل إنفاقك المؤهل إلى 1,000 درهم، واستحقيتِ خدمة واحدة مجانية من اختيارك ✨\n\nاختاري خدمتك واستمتعي بمكافأتك.',
                  sentBy: user?.name || user?.email || 'Staff',
                  forceTemplate: true,
                  metaTemplateName: 'spending_reward_1000',
                  language: 'ar',
                  templateComponents: [],
                },
              })
            } catch {
              // Visit still saved if reward WhatsApp fails
            }
          }
        }

        if (input.giftPurchase) {
          const { data: recvRow } = await supabase
            .from('customers')
            .select('whatsapp_phone, phone')
            .eq('id', input.giftPurchase.receiverCustomerId)
            .maybeSingle()
          const recvPhone = String(recvRow?.whatsapp_phone || recvRow?.phone || '')
          if (!recvPhone) {
            giftNotice = 'failed'
            giftNoticeError = 'Gift receiver has no phone number'
          } else {
            const giftTpl = data.whatsappTemplates.find(
              (t) => t.id === 'wt7' || t.whatsappTemplateName === 'gift_received',
            )
            try {
              const { data: fnData, error: fnError } = await supabase.functions.invoke('send-whatsapp', {
                body: {
                  customerId: input.giftPurchase.receiverCustomerId,
                  staffId: input.staffId,
                  templateId: giftTpl?.id || 'wt7',
                  phone: recvPhone,
                  triggerType: 'Gift received',
                  preview: giftTpl?.body || GIFT_RECEIVED_WHATSAPP,
                  sentBy: user?.name || user?.email || 'Staff',
                  metaTemplateName: 'gift_received',
                  language: giftTpl?.language || 'ar',
                  templateComponents: [],
                },
              })
              if (fnError || fnData?.error || fnData?.ok === false) {
                giftNotice = 'failed'
                giftNoticeError = String(fnData?.error || fnError?.message || 'WhatsApp send failed')
              } else {
                giftNotice = 'sent'
              }
            } catch (e) {
              giftNotice = 'failed'
              giftNoticeError = e instanceof Error ? e.message : 'WhatsApp send failed'
            }
          }
        }

        await refresh()
        const visit = mapVisit(savedVisit as Record<string, unknown>)
        return {
          ...visit,
          thankYou,
          thankYouError,
          walletCard,
          walletCardError,
          giftNotice,
          giftNoticeError,
        }
        } finally {
          visitSaveLocks.delete(input.customerId)
        }
      },
      updateVisit: async (id, patch) => {
        const existing = data.visits.find((v) => v.id === id)
        if (!existing) return { error: 'Visit not found.' }
        const customer = data.customers.find((c) => c.id === existing.customerId)
        if (!customer) return { error: 'Customer not found.' }
        if (!patch.staffId) return { error: 'Staff is required.' }
        if (!patch.services.length) return { error: 'Add at least one service.' }

        const services = patch.services
          .map((s) => ({
            serviceId: s.serviceId,
            serviceName: s.serviceName.trim(),
            price: Math.max(0, Number(s.price) || 0),
            quantity: Math.max(1, Math.round(Number(s.quantity) || 1)),
          }))
          .filter((s) => s.serviceName)
        if (!services.length) return { error: 'Each service needs a name.' }

        const subtotal = services.reduce((sum, line) => sum + line.price * line.quantity, 0)
        const manualDiscount = Math.max(0, patch.discount)
        const sameVoucher = Boolean(patch.voucherId && patch.voucherId === existing.voucherId)
        const voucher = patch.voucherId ? data.vouchers.find((v) => v.id === patch.voucherId) : undefined
        const voucherDiscount = patch.voucherId
          ? voucher
            ? calcVoucherDiscount(voucher, subtotal, { ignoreUsage: sameVoucher, ignoreActive: sameVoucher })
            : existing.voucherId === patch.voucherId
              ? existing.voucherDiscount ?? 0
              : 0
          : 0
        if (patch.voucherId && voucher && !sameVoucher && voucherDiscount <= 0) {
          return { error: 'This voucher cannot be applied to this visit (min spend, expired, or used up).' }
        }
        const totalDiscount = Math.min(subtotal, manualDiscount + voucherDiscount)
        const deliveryFee = [0, 30, 50].includes(patch.deliveryFee) ? patch.deliveryFee : 0
        const finalTotal = Math.max(subtotal - totalDiscount, 0) + deliveryFee
        const voucherCode = voucher?.code ?? (sameVoucher ? existing.voucherCode : undefined)

        const row = {
          staff_id: patch.staffId,
          visit_date: patch.visitDate,
          services,
          subtotal,
          discount: manualDiscount,
          voucher_id: patch.voucherId || null,
          voucher_code: voucherCode || null,
          voucher_discount: voucherDiscount || null,
          delivery_fee: deliveryFee,
          final_total: finalTotal,
          payment_method: patch.paymentMethod ?? null,
          notes: patch.notes?.trim() || null,
        }

        const { data: updated, error } = await supabase.from('visits').update(row).eq('id', id).select('*').single()
        if (error || !updated) return { error: error?.message ?? 'Failed to update visit' }
        const visit = mapVisit(updated as Record<string, unknown>)

        const oldVoucherId = existing.voucherId
        const newVoucherId = patch.voucherId || undefined
        if (oldVoucherId && oldVoucherId !== newVoucherId) {
          const old = data.vouchers.find((v) => v.id === oldVoucherId)
          if (old) {
            await supabase
              .from('vouchers')
              .update({ used_count: Math.max(0, old.usedCount - 1) })
              .eq('id', oldVoucherId)
          }
        }
        if (newVoucherId && newVoucherId !== oldVoucherId) {
          const current = data.vouchers.find((v) => v.id === newVoucherId)
          await supabase
            .from('vouchers')
            .update({ used_count: (current?.usedCount ?? 0) + 1 })
            .eq('id', newVoucherId)
        }

        const customerVisits = data.visits
          .map((v) => (v.id === id ? visit : v))
          .filter((v) => v.customerId === existing.customerId)
        const lifetimeSpend = customerLifetimeSpend(customerVisits, data.memberships, existing.customerId)
        const totalVisits = customerVisits.length
        const latest = [...customerVisits].sort((a, b) => +new Date(b.visitDate) - +new Date(a.visitDate))[0]
        const loyaltyTier = calcLoyaltyTier(lifetimeSpend, data.loyaltyTiers)
        const now = new Date().toISOString()
        const { error: custError } = await supabase
          .from('customers')
          .update({
            lifetime_spend: lifetimeSpend,
            total_visits: totalVisits,
            last_visit_at: latest?.visitDate ?? null,
            last_services: latest?.services.map((s) => s.serviceName) ?? [],
            loyalty_tier: loyaltyTier,
            updated_at: now,
          })
          .eq('id', existing.customerId)
        if (custError) return { error: `Visit saved but loyalty totals failed: ${custError.message}` }

        await refresh()
        return visit
      },
      addService: async (input) => {
        const id = `s${Date.now()}`
        const { error } = await supabase.from('services').insert({
          id,
          name: input.name,
          category: input.category,
          default_price: input.defaultPrice,
          description: input.description ?? null,
          active: input.active,
        })
        if (error) throw new Error(error.message)
        await refresh()
      },
      addMessage: async (input) => {
        const id = `wm${Date.now()}`
        const row = {
          id,
          customer_id: input.customerId ?? null,
          staff_id: input.staffId ?? user?.id ?? null,
          template_id: input.templateId,
          phone: input.phone,
          trigger_type: input.triggerType,
          status: input.status,
          sent_by: input.sentBy ?? null,
          sent_at: input.sentAt || new Date().toISOString(),
          delivered_at: input.deliveredAt ?? null,
          error_message: input.errorMessage ?? null,
          preview: input.preview ?? null,
        }
        const { data: inserted, error } = await supabase.from('whatsapp_messages').insert(row).select('*').single()
        if (error || !inserted) return { error: error?.message ?? 'Failed to save message' }
        const message = mapMessage(inserted as Record<string, unknown>)
        setData((prev) => ({ ...prev, messages: [message, ...prev.messages] }))
        return message
      },
      sendWhatsApp: async (input) => {
        const { useTemplate, forceTemplate, ...rest } = input
        const { data: fnData, error } = await supabase.functions.invoke('send-whatsapp', {
          body: {
            ...rest,
            forceTemplate: Boolean(forceTemplate || useTemplate),
          },
        })
        if (error) {
          let detail = error.message
          try {
            const ctx = (error as { context?: Response }).context
            if (ctx) {
              const body = await ctx.json()
              if (body?.error) detail = String(body.error)
            }
          } catch {
            // keep default message
          }
          await refresh()
          return { error: detail }
        }
        if (fnData?.error) {
          await refresh()
          const meta = fnData?.meta as
            | {
                metaError?: { message?: string; code?: number; type?: string }
                tokenPresent?: boolean
                tokenLooksLikeMeta?: boolean
                phoneNumberIdUsed?: string
                sendMode?: string
                inWindow?: boolean
              }
            | undefined
          const bits = [String(fnData.error)]
          if (meta?.metaError?.code != null) bits.push(`code ${meta.metaError.code}`)
          if (meta?.metaError?.type) bits.push(String(meta.metaError.type))
          if (meta?.sendMode) bits.push(`via ${meta.sendMode}`)
          if (meta && meta.inWindow === false) bits.push('outside 24h window')
          if (meta && meta.tokenPresent === false) bits.push('WHATSAPP_TOKEN missing')
          if (meta?.phoneNumberIdUsed) bits.push(`phoneId ${meta.phoneNumberIdUsed}`)
          return { error: bits.join(' · ') }
        }
        await refresh()
        if (fnData?.message) return mapMessage(fnData.message as Record<string, unknown>)
        return { error: 'WhatsApp send failed' }
      },
      updateMessage: async (id, patch) => {
        const row: Record<string, unknown> = {}
        if (patch.preview !== undefined) row.preview = patch.preview
        if (patch.status !== undefined) row.status = patch.status
        if (patch.errorMessage !== undefined) row.error_message = patch.errorMessage
        const { error } = await supabase.from('whatsapp_messages').update(row).eq('id', id)
        if (error) throw new Error(error.message)
        await refresh()
      },
      updateWhatsAppTemplate: async (id, patch) => {
        const row: Record<string, unknown> = {}
        if (patch.name != null) row.name = patch.name
        if (patch.description != null) row.description = patch.description
        if (patch.body != null) row.body = patch.body
        if (patch.whatsappTemplateName != null) row.whatsapp_template_name = patch.whatsappTemplateName
        if (patch.language != null) row.language = patch.language
        if (patch.category != null) row.category = patch.category
        if (patch.triggerDays !== undefined) row.trigger_days = patch.triggerDays ?? null
        if (patch.active != null) row.active = patch.active
        const { error } = await supabase.from('whatsapp_templates').update(row).eq('id', id)
        if (error) throw new Error(error.message)
        await refresh()
      },
      addStaff: async (_input) => {
        return {
          error:
            'Create staff accounts in Supabase Auth (Dashboard → Authentication → Users), then set their profile role/name.',
        }
      },
      updateStaff: async (id, patch) => {
        const { error } = await supabase.from('profiles').update(profileToDb(patch)).eq('id', id)
        if (error) throw new Error(error.message)
        await refresh()
      },
      updateSettings: async (patch) => {
        const row: Record<string, unknown> = { updated_at: new Date().toISOString() }
        if (patch.salonName != null) row.salon_name = patch.salonName
        if (patch.phone != null) row.phone = patch.phone
        if (patch.whatsapp != null) row.whatsapp = patch.whatsapp
        if (patch.address != null) row.address = patch.address
        if (patch.currency != null) row.currency = patch.currency
        if (patch.timezone != null) row.timezone = patch.timezone
        if (patch.reminderDays != null) row.reminder_days = patch.reminderDays
        if (patch.automationEnabled != null) row.automation_enabled = patch.automationEnabled
        if (patch.ownerName != null) row.owner_name = patch.ownerName
        if (patch.ownerWhatsapp != null) row.owner_whatsapp = patch.ownerWhatsapp
        if (patch.staffDocumentReminderDays != null) row.staff_document_reminder_days = patch.staffDocumentReminderDays
        if (patch.whatsappPhoneNumberId !== undefined) row.whatsapp_phone_number_id = patch.whatsappPhoneNumberId ?? null
        if (patch.whatsappBusinessAccountId !== undefined) {
          row.whatsapp_business_account_id = patch.whatsappBusinessAccountId ?? null
        }
        const salonId = user?.salonId
        const query = salonId
          ? supabase.from('salon_settings').update(row).eq('salon_id', salonId)
          : supabase.from('salon_settings').update(row)
        const { error } = await query
        if (error) throw new Error(error.message)
        await refresh()
      },
      addVoucher: async (input) => {
        const code = input.code.trim().toUpperCase()
        if (!code) return { error: 'Voucher code is required.' }
        const id = `vc${Date.now()}`
        const { data: inserted, error } = await supabase
          .from('vouchers')
          .insert({
            id,
            code,
            name: input.name,
            type: input.type,
            value: input.value,
            min_spend: input.minSpend ?? null,
            max_uses: input.maxUses ?? null,
            used_count: 0,
            expires_at: input.expiresAt || null,
            active: input.active,
            notes: input.notes ?? null,
          })
          .select('*')
          .single()
        if (error || !inserted) return { error: error?.message ?? 'Failed to create voucher' }
        const voucher = mapVoucher(inserted as Record<string, unknown>)
        setData((prev) => ({ ...prev, vouchers: [voucher, ...prev.vouchers] }))
        return voucher
      },
      updateVoucher: async (id, patch) => {
        const row: Record<string, unknown> = {}
        if (patch.active != null) row.active = patch.active
        if (patch.name != null) row.name = patch.name
        if (patch.value != null) row.value = patch.value
        if (patch.usedCount != null) row.used_count = patch.usedCount
        const { error } = await supabase.from('vouchers').update(row).eq('id', id)
        if (error) throw new Error(error.message)
        await refresh()
      },
      addExpense: async (input) => {
        if (!input.title.trim()) return { error: 'Title is required.' }
        if (!input.amount || input.amount <= 0) return { error: 'Amount must be greater than zero.' }
        const id = `ex${Date.now()}`
        const { data: inserted, error } = await supabase
          .from('expenses')
          .insert({
            id,
            title: input.title.trim(),
            category: input.category,
            amount: input.amount,
            expense_date: input.expenseDate,
            payment_method: input.paymentMethod ?? null,
            vendor: input.vendor ?? null,
            notes: input.notes ?? null,
            staff_id: input.staffId ?? null,
            recorded_by: input.recordedBy,
          })
          .select('*')
          .single()
        if (error || !inserted) return { error: error?.message ?? 'Failed to save expense' }
        const expense = mapExpense(inserted as Record<string, unknown>)
        setData((prev) => ({ ...prev, expenses: [expense, ...prev.expenses] }))
        return expense
      },
      updateExpense: async (id, patch) => {
        const row: Record<string, unknown> = {}
        if (patch.title != null) row.title = patch.title
        if (patch.amount != null) row.amount = patch.amount
        if (patch.category != null) row.category = patch.category
        const { error } = await supabase.from('expenses').update(row).eq('id', id)
        if (error) throw new Error(error.message)
        await refresh()
      },
      deleteExpense: async (id) => {
        const { error } = await supabase.from('expenses').delete().eq('id', id)
        if (error) throw new Error(error.message)
        setData((prev) => ({ ...prev, expenses: prev.expenses.filter((e) => e.id !== id) }))
      },
      payStaffSalary: async (staffId, recordedBy) => {
        const person = data.staffMembers.find((s) => s.id === staffId)
        if (!person) return { error: 'Staff member not found.' }
        if (person.status !== 'active') return { error: 'Cannot pay salary for a disabled staff member.' }
        if (!person.salary || person.salary <= 0) return { error: 'Set a monthly salary for this staff member first.' }

        const now = new Date()
        const monthLabel = now.toLocaleString('en-GB', { month: 'long', year: 'numeric' })
        const paidKey = `${now.getFullYear()}-${now.getMonth()}`
        const alreadyPaidThisMonth = data.expenses.some((e) => {
          if (e.staffId !== staffId || e.category !== 'Salary') return false
          const d = new Date(e.expenseDate)
          return `${d.getFullYear()}-${d.getMonth()}` === paidKey
        })
        if (alreadyPaidThisMonth) {
          return { error: `${person.name}'s salary is already marked paid for ${monthLabel}.` }
        }

        const expenseId = `ex${Date.now()}`
        const { error: exError } = await supabase.from('expenses').insert({
          id: expenseId,
          title: `Salary — ${person.name}`,
          category: 'Salary',
          amount: person.salary,
          expense_date: now.toISOString().slice(0, 10),
          payment_method: 'Transfer',
          vendor: person.name,
          notes: `Monthly salary for ${monthLabel}`,
          staff_id: person.id,
          recorded_by: recordedBy,
        })
        if (exError) return { error: exError.message }

        const { error: profileError } = await supabase
          .from('profiles')
          .update({ last_salary_paid_at: now.toISOString(), updated_at: now.toISOString() })
          .eq('id', staffId)
        if (profileError) return { error: profileError.message }

        await refresh()
        return { ok: true }
      },
      sendOwnerDocumentReminders: async () => 0,
    }
  }, [data, loading, loadError, refresh, user])

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used within DataProvider')
  return ctx
}
