import type {
  Customer,
  Expense,
  Gift,
  LoyaltyRewardType,
  CycleStatus,
  CustomerMembership,
  MembershipCycle,
  MembershipModel,
  MembershipStatus,
  MembershipUsage,
  PaymentMethod,
  SalonSettings,
  ServiceItem,
  StaffDocument,
  StaffUser,
  Visit,
  VisitService,
  Voucher,
  WhatsAppMessage,
  WhatsAppTemplate,
} from '../types'
import { normalizeCustomerLocation } from './areas'
import { displayBusinessWhatsApp, isDecorWhatsAppNumber } from './whatsappDisplay'

export function mapRoleToApp(role: string): StaffUser['role'] {
  return role === 'owner' ? 'admin' : 'staff'
}

export function mapRoleToDb(role: StaffUser['role']): 'owner' | 'staff' {
  return role === 'admin' ? 'owner' : 'staff'
}

function doc(raw: unknown): StaffDocument | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const d = raw as Record<string, string>
  if (!d.number && !d.expiryDate && !d.nationality && !d.notes) return undefined
  return {
    number: d.number || undefined,
    expiryDate: d.expiryDate || d.expiry_date || undefined,
    nationality: d.nationality || undefined,
    notes: d.notes || undefined,
  }
}

export function mapProfile(row: Record<string, unknown>): StaffUser {
  return {
    id: String(row.id),
    name: String(row.name),
    email: String(row.email),
    role: mapRoleToApp(String(row.role)),
    status: (row.status as StaffUser['status']) ?? 'active',
    salonId: String(row.salon_id ?? ''),
    phone: (row.phone as string) || undefined,
    jobTitle: (row.job_title as string) || undefined,
    nationality: (row.nationality as string) || undefined,
    joinDate: (row.join_date as string) || undefined,
    salary: row.salary != null ? Number(row.salary) : undefined,
    lastSalaryPaidAt: (row.last_salary_paid_at as string) || undefined,
    notes: (row.notes as string) || undefined,
    passport: doc(row.passport),
    visa: doc(row.visa),
    emiratesId: doc(row.emirates_id),
    createdAt: (row.created_at as string) || undefined,
    updatedAt: (row.updated_at as string) || undefined,
  }
}

export function profileToDb(patch: Partial<StaffUser>) {
  const out: Record<string, unknown> = {}
  if (patch.name != null) out.name = patch.name
  if (patch.email != null) out.email = patch.email
  if (patch.role != null) out.role = mapRoleToDb(patch.role)
  if (patch.status != null) out.status = patch.status
  if (patch.phone !== undefined) out.phone = patch.phone ?? null
  if (patch.jobTitle !== undefined) out.job_title = patch.jobTitle ?? null
  if (patch.nationality !== undefined) out.nationality = patch.nationality ?? null
  if (patch.joinDate !== undefined) out.join_date = patch.joinDate || null
  if (patch.salary !== undefined) out.salary = patch.salary ?? null
  if (patch.lastSalaryPaidAt !== undefined) out.last_salary_paid_at = patch.lastSalaryPaidAt ?? null
  if (patch.notes !== undefined) out.notes = patch.notes ?? null
  if (patch.passport !== undefined) out.passport = patch.passport ?? {}
  if (patch.visa !== undefined) out.visa = patch.visa ?? {}
  if (patch.emiratesId !== undefined) out.emirates_id = patch.emiratesId ?? {}
  out.updated_at = new Date().toISOString()
  return out
}

export function mapCustomer(row: Record<string, unknown>): Customer {
  return {
    id: String(row.id),
    fullName: String(row.full_name),
    phone: String(row.phone),
    whatsappPhone: String(row.whatsapp_phone ?? row.phone),
    email: (row.email as string) || undefined,
    birthday: (row.birthday as string) || undefined,
    notes: (row.notes as string) || undefined,
    location: normalizeCustomerLocation(row.location as string) || undefined,
    preferredStaffId: (row.preferred_staff_id as string) || undefined,
    loyaltyTier: (row.loyalty_tier as Customer['loyaltyTier']) ?? 'Regular',
    loyaltyLapsedFrom:
      row.loyalty_lapsed_from === 'Gold' || row.loyalty_lapsed_from === 'Premium'
        ? row.loyalty_lapsed_from
        : undefined,
    lifetimeSpend: Number(row.lifetime_spend ?? 0),
    totalVisits: Number(row.total_visits ?? 0),
    lastVisitAt: (row.last_visit_at as string) || undefined,
    lastServices: (row.last_services as string[]) ?? [],
    walletToken: (row.wallet_token as string) || undefined,
    walletAppleSerial: (row.wallet_apple_serial as string) || undefined,
    walletGoogleObjectId: (row.wallet_google_object_id as string) || undefined,
    lastWhatsappInboundAt: (row.last_whatsapp_inbound_at as string) || undefined,
    profileUpdatedAt: (row.profile_updated_at as string) || undefined,
    createdBy: String(row.created_by ?? ''),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

export function mapMembershipCycle(row: Record<string, unknown>): MembershipCycle {
  return {
    id: String(row.id),
    membershipId: String(row.membership_id),
    cycleIndex: Number(row.cycle_index),
    startDate: String(row.start_date).slice(0, 10),
    endDate: String(row.end_date).slice(0, 10),
    status: row.status as CycleStatus,
    usedAt: (row.used_at as string) || undefined,
    usedBy: (row.used_by as string) || undefined,
  }
}

export function mapMembershipUsage(row: Record<string, unknown>): MembershipUsage {
  return {
    id: String(row.id),
    membershipId: String(row.membership_id),
    cycleId: (row.cycle_id as string) || undefined,
    usedAt: String(row.used_at),
    staffId: String(row.staff_id ?? ''),
    notes: (row.notes as string) || undefined,
  }
}

export function mapCustomerMembership(
  row: Record<string, unknown>,
  cycles: MembershipCycle[] = [],
  usages: MembershipUsage[] = [],
): CustomerMembership {
  return {
    id: String(row.id),
    customerId: String(row.customer_id),
    productId: String(row.product_id),
    productName: String(row.product_name),
    serviceName: String(row.service_name),
    model: row.model as MembershipModel,
    price: Number(row.price ?? 0),
    purchaseDate: String(row.purchase_date).slice(0, 10),
    activationDate: row.activation_date ? String(row.activation_date).slice(0, 10) : undefined,
    expiryDate: row.expiry_date ? String(row.expiry_date).slice(0, 10) : undefined,
    totalSessions: Number(row.total_sessions ?? 0),
    usedSessions: Number(row.used_sessions ?? 0),
    status: (row.status as MembershipStatus) || 'Pending',
    notes: (row.notes as string) || undefined,
    createdBy: String(row.created_by ?? ''),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    cycles: cycles.filter((c) => c.membershipId === String(row.id)).sort((a, b) => a.cycleIndex - b.cycleIndex),
    usages: usages
      .filter((u) => u.membershipId === String(row.id))
      .sort((a, b) => +new Date(b.usedAt) - +new Date(a.usedAt)),
  }
}

export function mapService(row: Record<string, unknown>): ServiceItem {
  return {
    id: String(row.id),
    name: String(row.name),
    category: String(row.category),
    defaultPrice: Number(row.default_price),
    description: (row.description as string) || undefined,
    active: Boolean(row.active),
  }
}

export function mapVisit(row: Record<string, unknown>): Visit {
  return {
    id: String(row.id),
    customerId: String(row.customer_id),
    staffId: String(row.staff_id),
    visitDate: String(row.visit_date),
    services: (row.services as VisitService[]) ?? [],
    subtotal: Number(row.subtotal),
    discount: Number(row.discount ?? 0),
    voucherId: (row.voucher_id as string) || undefined,
    voucherCode: (row.voucher_code as string) || undefined,
    voucherDiscount: row.voucher_discount != null ? Number(row.voucher_discount) : undefined,
    deliveryFee: row.delivery_fee != null ? Number(row.delivery_fee) : undefined,
    customerLocation: normalizeCustomerLocation(row.customer_location as string) || undefined,
    finalTotal: Number(row.final_total),
    paymentMethod: row.payment_method ? String(row.payment_method) : undefined,
    notes: (row.notes as string) || undefined,
    giftPurchaseId: (row.gift_purchase_id as string) || undefined,
    giftRedeemId: (row.gift_redeem_id as string) || undefined,
    loyaltyRewardType: (row.loyalty_reward_type as LoyaltyRewardType) || undefined,
  }
}

export function mapGift(row: Record<string, unknown>): Gift {
  return {
    id: String(row.id),
    code: String(row.code),
    senderCustomerId: String(row.sender_customer_id),
    receiverCustomerId: String(row.receiver_customer_id),
    serviceId: String(row.service_id),
    serviceName: String(row.service_name),
    servicePrice: Number(row.service_price),
    status: row.status as Gift['status'],
    purchaseVisitId: String(row.purchase_visit_id),
    redeemVisitId: (row.redeem_visit_id as string) || undefined,
    purchasedAt: String(row.purchased_at),
    redeemedAt: (row.redeemed_at as string) || undefined,
    notes: (row.notes as string) || undefined,
  }
}

export function mapVoucher(row: Record<string, unknown>): Voucher {
  return {
    id: String(row.id),
    code: String(row.code),
    name: String(row.name),
    type: row.type as Voucher['type'],
    value: Number(row.value),
    minSpend: row.min_spend != null ? Number(row.min_spend) : undefined,
    maxUses: row.max_uses != null ? Number(row.max_uses) : undefined,
    usedCount: Number(row.used_count ?? 0),
    expiresAt: (row.expires_at as string) || undefined,
    active: Boolean(row.active),
    notes: (row.notes as string) || undefined,
    createdAt: String(row.created_at),
  }
}

export function mapExpense(row: Record<string, unknown>): Expense {
  return {
    id: String(row.id),
    title: String(row.title),
    category: row.category as Expense['category'],
    amount: Number(row.amount),
    expenseDate: String(row.expense_date),
    paymentMethod: (row.payment_method as PaymentMethod) || undefined,
    vendor: (row.vendor as string) || undefined,
    notes: (row.notes as string) || undefined,
    staffId: (row.staff_id as string) || undefined,
    recordedBy: String(row.recorded_by),
    createdAt: String(row.created_at),
  }
}

export function mapTemplate(row: Record<string, unknown>): WhatsAppTemplate {
  return {
    id: String(row.id),
    name: String(row.name),
    whatsappTemplateName: String(row.whatsapp_template_name),
    language: String(row.language ?? 'en'),
    category: String(row.category),
    triggerDays: row.trigger_days != null ? Number(row.trigger_days) : undefined,
    description: String(row.description ?? ''),
    body: String(row.body),
    active: Boolean(row.active),
  }
}

export function mapMessage(row: Record<string, unknown>): WhatsAppMessage {
  const sendMode = row.send_mode === 'template' || row.send_mode === 'text' ? row.send_mode : undefined
  return {
    id: String(row.id),
    customerId: (row.customer_id as string) || undefined,
    staffId: (row.staff_id as string) || undefined,
    templateId: String(row.template_id ?? ''),
    phone: String(row.phone),
    triggerType: String(row.trigger_type),
    status: row.status as WhatsAppMessage['status'],
    sentBy: (row.sent_by as string) || undefined,
    sentAt: String(row.sent_at),
    deliveredAt: (row.delivered_at as string) || undefined,
    readAt: (row.read_at as string) || undefined,
    errorMessage: (row.error_message as string) || undefined,
    preview: (row.preview as string) || undefined,
    metaMessageId: (row.meta_message_id as string) || undefined,
    sendMode,
    metaErrorCode: row.meta_error_code != null ? Number(row.meta_error_code) : undefined,
    metaErrorSubcode: row.meta_error_subcode != null ? Number(row.meta_error_subcode) : undefined,
    metaErrorType: (row.meta_error_type as string) || undefined,
  }
}

export function mapSettings(row: Record<string, unknown>): SalonSettings & {
  whatsappPhoneNumberId?: string
  whatsappBusinessAccountId?: string
} {
  return {
    salonName: String(row.salon_name),
    phone: isDecorWhatsAppNumber(String(row.phone)) ? displayBusinessWhatsApp(null) : String(row.phone),
    whatsapp: displayBusinessWhatsApp(String(row.whatsapp)),
    address: String(row.address),
    currency: String(row.currency ?? 'AED'),
    timezone: String(row.timezone ?? 'Asia/Dubai'),
    reminderDays: (row.reminder_days as number[]) ?? [30, 60, 90],
    automationEnabled: Boolean(row.automation_enabled),
    ownerName: String(row.owner_name ?? 'Owner'),
    ownerWhatsapp: String(row.owner_whatsapp),
    staffDocumentReminderDays: Number(row.staff_document_reminder_days ?? 30),
    whatsappPhoneNumberId: (row.whatsapp_phone_number_id as string) || undefined,
    whatsappBusinessAccountId: (row.whatsapp_business_account_id as string) || undefined,
  }
}
