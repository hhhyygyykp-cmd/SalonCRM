export type Role = 'admin' | 'staff'

export type LoyaltyTier = 'Regular' | 'Gold' | 'Premium'
export type LoyaltyRewardType = 'gold_mani_pedi' | 'premium_monthly_service' | 'premium_thousand_mani_pedi'

export type PaymentMethod = 'Cash' | 'Card' | 'Tabby' | 'Transfer' | 'Other'
export const PAYMENT_METHODS: PaymentMethod[] = ['Cash', 'Card', 'Tabby', 'Transfer', 'Other']

export type MembershipModel = 'monthly_cycle' | 'session_balance'
export type MembershipStatus = 'Pending' | 'Active' | 'Frozen' | 'Expired' | 'Completed'
export type CycleStatus = 'Upcoming' | 'Available' | 'Used' | 'Expired'

export interface MembershipProduct {
  id: string
  name: string
  price: number
  validityMonths: number
  model: MembershipModel
  totalSessions: number
  serviceName: string
}

export interface MembershipCycle {
  id: string
  membershipId: string
  cycleIndex: number
  startDate: string
  endDate: string
  status: CycleStatus
  usedAt?: string
  usedBy?: string
}

export interface MembershipUsage {
  id: string
  membershipId: string
  cycleId?: string
  usedAt: string
  staffId: string
  notes?: string
}

export interface CustomerMembership {
  id: string
  customerId: string
  productId: string
  productName: string
  serviceName: string
  model: MembershipModel
  price: number
  purchaseDate: string
  activationDate?: string
  expiryDate?: string
  totalSessions: number
  usedSessions: number
  status: MembershipStatus
  notes?: string
  createdBy: string
  createdAt: string
  updatedAt: string
  cycles: MembershipCycle[]
  usages: MembershipUsage[]
}

export type MessageStatus = 'Queued' | 'Sent' | 'Delivered' | 'Failed' | 'Read'

export type StaffDocumentType = 'passport' | 'visa' | 'emiratesId'

export interface StaffDocument {
  number?: string
  expiryDate?: string
  nationality?: string
  notes?: string
}

export interface StaffUser {
  id: string
  name: string
  email: string
  role: Role
  status: 'active' | 'disabled'
  /** Tenant salon — users only see this salon's customers, costs, revenue, etc. */
  salonId: string
  phone?: string
  jobTitle?: string
  nationality?: string
  joinDate?: string
  /** Monthly salary in AED */
  salary?: number
  /** When salary was last marked as paid */
  lastSalaryPaidAt?: string
  notes?: string
  passport?: StaffDocument
  visa?: StaffDocument
  emiratesId?: StaffDocument
  createdAt?: string
  updatedAt?: string
}

/** Seeded empty salon for a second owner (see migration 029). */
export const EMPTY_SALON_ID = 'a0000000-0000-4000-8000-000000000002'
export const BELLE_SALON_ID = 'a0000000-0000-4000-8000-000000000001'

export interface Customer {
  id: string
  fullName: string
  phone: string
  whatsappPhone: string
  email?: string
  birthday?: string
  notes?: string
  location?: string
  preferredStaffId?: string
  loyaltyTier: LoyaltyTier
  /** Last Gold/Premium tier before a 45-day inactivity lapse. Cleared on the next visit. */
  loyaltyLapsedFrom?: 'Gold' | 'Premium'
  lifetimeSpend: number
  totalVisits: number
  lastVisitAt?: string
  lastServices: string[]
  walletToken?: string
  walletAppleSerial?: string
  walletGoogleObjectId?: string
  /** Last inbound WhatsApp from this customer (opens Meta 24h service window) */
  lastWhatsappInboundAt?: string
  /** When the customer last submitted the public update form */
  profileUpdatedAt?: string
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface ServiceItem {
  id: string
  name: string
  category: string
  defaultPrice: number
  description?: string
  active: boolean
}

export interface VisitService {
  serviceId: string
  serviceName: string
  price: number
  quantity: number
}

export interface Visit {
  id: string
  customerId: string
  staffId: string
  visitDate: string
  services: VisitService[]
  subtotal: number
  discount: number
  voucherId?: string
  voucherCode?: string
  voucherDiscount?: number
  /** 50, 30, or 0 (free delivery) */
  deliveryFee?: number
  /** Customer area at time of visit */
  customerLocation?: string
  finalTotal: number
  /** One method, or several joined as "Card + Cash" */
  paymentMethod?: string
  notes?: string
  giftPurchaseId?: string
  giftRedeemId?: string
  loyaltyRewardType?: LoyaltyRewardType
}

export type GiftStatus = 'valid' | 'used' | 'cancelled'

export interface Gift {
  id: string
  code: string
  senderCustomerId: string
  receiverCustomerId: string
  serviceId: string
  serviceName: string
  servicePrice: number
  status: GiftStatus
  purchaseVisitId: string
  redeemVisitId?: string
  purchasedAt: string
  redeemedAt?: string
  notes?: string
}

export type VoucherType = 'fixed' | 'percent'

export interface Voucher {
  id: string
  code: string
  name: string
  type: VoucherType
  value: number
  minSpend?: number
  maxUses?: number
  usedCount: number
  expiresAt?: string
  active: boolean
  notes?: string
  createdAt: string
}

export type ExpenseCategory =
  | 'Supplies'
  | 'Products'
  | 'Car / Transport'
  | 'Rent'
  | 'Utilities'
  | 'Salary'
  | 'Maintenance'
  | 'Marketing'
  | 'Other'

export interface Expense {
  id: string
  title: string
  category: ExpenseCategory
  amount: number
  expenseDate: string
  paymentMethod?: PaymentMethod
  vendor?: string
  notes?: string
  /** Set when this expense is a staff salary payment */
  staffId?: string
  recordedBy: string
  createdAt: string
}

export interface WhatsAppTemplate {
  id: string
  name: string
  whatsappTemplateName: string
  language: string
  category: string
  triggerDays?: number
  description: string
  body: string
  active: boolean
}

export interface WhatsAppChatConversation {
  id: string
  phone: string
  phoneKey: string
  customerId?: string
  contactName?: string
  lastMessageAt: string
  lastMessagePreview: string
  lastDirection: 'inbound' | 'outbound'
  lastInboundAt?: string
  unreadCount: number
}

export interface WhatsAppChatMessage {
  id: string
  conversationId: string
  customerId?: string
  staffId?: string
  direction: 'inbound' | 'outbound'
  messageType: string
  body: string
  status?: MessageStatus | string
  sendMode?: 'text' | 'template'
  templateId?: string
  triggerType?: string
  sentBy?: string
  metaMessageId?: string
  errorMessage?: string
  createdAt: string
  mediaId?: string
  mediaMime?: string
  mediaPath?: string
  mediaFilename?: string
  origin?: 'customer' | 'crm' | 'business_app' | 'automation'
}

export interface WhatsAppMessage {
  id: string
  customerId?: string
  staffId?: string
  templateId: string
  phone: string
  triggerType: string
  status: MessageStatus
  sentBy?: string
  sentAt: string
  deliveredAt?: string
  readAt?: string
  errorMessage?: string
  preview?: string
  metaMessageId?: string
  /** How the Cloud API payload was sent */
  sendMode?: 'text' | 'template'
  metaErrorCode?: number
  metaErrorSubcode?: number
  metaErrorType?: string
}

export interface LoyaltyTierConfig {
  id: string
  name: LoyaltyTier
  minimumSpend: number
  maximumSpend: number | null
  benefits: string
  badgeStyle: 'regular' | 'gold' | 'premium'
}

export interface SalonSettings {
  salonName: string
  phone: string
  whatsapp: string
  address: string
  currency: string
  timezone: string
  reminderDays: number[]
  automationEnabled: boolean
  ownerName: string
  ownerWhatsapp: string
  staffDocumentReminderDays: number
  whatsappPhoneNumberId?: string
  whatsappBusinessAccountId?: string
}

export interface TimelineEvent {
  id: string
  type: 'visit' | 'whatsapp' | 'created'
  date: string
  title: string
  subtitle?: string
  amount?: number
  status?: string
}

export interface StaffDocumentAlert {
  staffId: string
  staffName: string
  documentType: StaffDocumentType
  label: string
  number?: string
  expiryDate: string
  daysRemaining: number
  status: 'expired' | 'expiring' | 'ok'
}
