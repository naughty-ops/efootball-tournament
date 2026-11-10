export type TransactionType =
  | 'TOURNAMENT_PRIZE'
  | 'BONUS_REWARD'
  | 'ADMIN_ADJUSTMENT'
  | 'PAYOUT_COMPLETED'
  | 'PAYOUT_REVERSAL';

export type TransactionStatus =
  | 'pending'
  | 'completed'
  | 'cancelled'
  | 'failed'
  | 'reversed';

export type PayoutStatus =
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'PROCESSING'
  | 'PAID'
  | 'REJECTED'
  | 'FAILED'
  | 'PENDING';

export type PaymentMethodType = 'bank_account' | 'upi';

export interface WalletOverview {
  totalEarningsPaise: number;
  totalEarningsInr: number;
  pendingEarningsPaise: number;
  pendingEarningsInr: number;
  availablePayoutPaise: number;
  availablePayoutInr: number;
  processingPayoutPaise: number;
  processingPayoutInr: number;
  totalPaidPaise: number;
  totalPaidInr: number;
  unpaidRewardsPaise: number;
  unpaidRewardsInr: number;
  nextExpectedPayout?: {
    amountInr: number;
    deadlineAt: string;
    tournamentName: string;
    status: PayoutStatus;
    isOverdue: boolean;
  } | null;
}

export interface WalletTransactionItem {
  id: string;
  transactionRef: string;
  walletId: string;
  userId: string;
  transactionType: TransactionType;
  amountPaise: number;
  amountInr: number;
  status: TransactionStatus;
  referenceType: 'prize_distribution' | 'payout' | 'admin_adjustment' | 'other';
  referenceId?: string | null;
  tournamentId?: string | null;
  tournamentName?: string | null;
  description: string;
  idempotencyKey?: string | null;
  createdAt: string;
}

export interface PlayerPaymentMethod {
  id: string;
  userId: string;
  paymentMethodType: PaymentMethodType;
  accountHolderName?: string | null;
  bankName?: string | null;
  maskedAccountNumber?: string | null;
  ifscCode?: string | null;
  upiId?: string | null;
  isPreferred: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DecryptedPaymentDetails {
  id: string;
  paymentMethodType: PaymentMethodType;
  accountHolderName?: string | null;
  bankName?: string | null;
  accountNumber?: string | null;
  maskedAccountNumber?: string | null;
  ifscCode?: string | null;
  upiId?: string | null;
  isPreferred: boolean;
}

export interface PrizeDistributionRecord {
  id: string;
  distributionReference: string;
  tournamentId: string;
  tournamentName?: string;
  playerId: string;
  playerName?: string;
  participantId?: string | null;
  position: number;
  positionTitle: string;
  prizeAmountPaise: number;
  prizeAmountInr: number;
  status: 'pending_approval' | 'awarded' | 'cancelled';
  approvedBy?: string | null;
  approvedAt: string;
  notes?: string | null;
  createdAt: string;
}

export interface PayoutTransactionRecord {
  id: string;
  payoutReference: string;
  playerId: string;
  playerName?: string;
  playerEmail?: string;
  prizeDistributionId?: string | null;
  tournamentName?: string | null;
  positionTitle?: string | null;
  amountPaise: number;
  amountInr: number;
  paymentMethodId?: string | null;
  paymentMethodType?: PaymentMethodType | null;
  payoutStatus: PayoutStatus;
  utrReference?: string | null;
  processedBy?: string | null;
  processedByName?: string | null;
  paidAt?: string | null;
  eligibleAt?: string | null;
  deadlineAt?: string | null;
  receiptUrl?: string | null;
  receiptReference?: string | null;
  failureReason?: string | null;
  createdAt: string;
  updatedAt: string;
  paymentDetails?: DecryptedPaymentDetails | null;
}

export interface FinancialAuditLogRecord {
  id: string;
  actorId?: string | null;
  actorEmail?: string | null;
  action: string;
  targetType: string;
  targetId: string;
  previousState?: any;
  newState?: any;
  metadata?: any;
  createdAt: string;
}

export type PerformancePeriod = 'day' | 'week' | 'month';

export interface PerformanceDataPoint {
  key: string;
  label: string; // e.g. "14:00" for hour, "Mon" for day, "Week 1" or "Nov 01"
  prizesInr: number;
  payoutsInr: number;
}

export interface PerformanceAnalyticsData {
  timeframe: PerformancePeriod;
  totalEarningsInr: number;
  totalPayoutsInr: number;
  dataPoints: PerformanceDataPoint[];
  comparison?: {
    previousEarningsInr: number;
    percentageChange: number | null; // e.g. 15.5 for +15.5%, -8.2 for -8.2%
    isPositive: boolean;
    comparisonLabel: string; // e.g. "vs previous week"
  } | null;
}

export interface MonthlyEarningsPoint {
  month: string; // e.g. "Nov 2026"
  yearMonth: string; // e.g. "2026-11"
  prizesInr: number;
  payoutsInr: number;
}

export interface TournamentPrizePoint {
  tournamentId: string;
  tournamentName: string;
  amountInr: number;
  date: string;
}

export interface PlayerNotificationRecord {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'financial' | 'tournament' | 'system';
  actionUrl?: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface AdminFinancialOverviewStats {
  totalPrizeAwardedPaise: number;
  totalPrizeAwardedInr: number;
  pendingApprovalPaise: number;
  pendingApprovalInr: number;
  approvedUnpaidPaise: number;
  approvedUnpaidInr: number;
  processingPayoutsPaise: number;
  processingPayoutsInr: number;
  totalPaidPaise: number;
  totalPaidInr: number;
  failedPayoutsCount: number;
  overduePayoutsCount: number;
  totalOutstandingPaise: number;
  totalOutstandingInr: number;
  pendingPayoutsCount: number;
  processingPayoutsCount: number;
  paidPayoutsCount: number;
  rejectedPayoutsCount: number;
  dueSoonPayoutsCount: number;
  urgentPayoutsCount: number;
}
