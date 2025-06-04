// Unified TimeOffBalance interface that works with both old and new schemas
export interface UnifiedTimeOffBalance {
  id: string;
  userId: string;
  year: number;
  vacationDays: number;
  sickDays: number;
  paidLeave: number;
  personalDays: number;
  createdAt?: Date;
  updatedAt?: Date;
}

// Legacy SQLite format (current dev format)
export interface LegacyTimeOffBalance {
  id: string;
  user_id: string;
  vacation_days: number;
  sick_days: number;
  paid_leave: number;
  personal_days: number;
  year: number;
  created_at?: string;
  updated_at?: string;
}

// Modern Prisma format (current production format)
export interface ModernTimeOffBalance {
  id: string;
  userId: string;
  year: number;
  type: 'VACATION' | 'SICK' | 'PAID_LEAVE' | 'PERSONAL';
  totalDays: number;
  usedDays: number;
  remainingDays: number;
  createdAt: Date;
  updatedAt: Date;
}

// Conversion utilities
export function legacyToUnified(legacy: LegacyTimeOffBalance): UnifiedTimeOffBalance {
  return {
    id: legacy.id,
    userId: legacy.user_id,
    year: legacy.year,
    vacationDays: legacy.vacation_days,
    sickDays: legacy.sick_days,
    paidLeave: legacy.paid_leave,
    personalDays: legacy.personal_days,
    createdAt: legacy.created_at ? new Date(legacy.created_at) : undefined,
    updatedAt: legacy.updated_at ? new Date(legacy.updated_at) : undefined,
  };
}

export function modernToUnified(modernBalances: ModernTimeOffBalance[]): UnifiedTimeOffBalance {
  // Group the separate type records into one combined record
  const baseRecord = modernBalances[0];
  if (!baseRecord) {
    throw new Error('No balance records found');
  }

  const unified: UnifiedTimeOffBalance = {
    id: baseRecord.userId + '_' + baseRecord.year, // Create composite ID
    userId: baseRecord.userId,
    year: baseRecord.year,
    vacationDays: 0,
    sickDays: 0,
    paidLeave: 0,
    personalDays: 0,
    createdAt: baseRecord.createdAt,
    updatedAt: baseRecord.updatedAt,
  };

  // Aggregate the remaining days from each type
  modernBalances.forEach(balance => {
    switch (balance.type) {
      case 'VACATION':
        unified.vacationDays = balance.remainingDays;
        break;
      case 'SICK':
        unified.sickDays = balance.remainingDays;
        break;
      case 'PAID_LEAVE':
        unified.paidLeave = balance.remainingDays;
        break;
      case 'PERSONAL':
        unified.personalDays = balance.remainingDays;
        break;
    }
  });

  return unified;
}

export function unifiedToModern(unified: UnifiedTimeOffBalance): Omit<ModernTimeOffBalance, 'id' | 'createdAt' | 'updatedAt'>[] {
  const baseData = {
    userId: unified.userId,
    year: unified.year,
    usedDays: 0, // Calculate from approved requests separately
  };

  return [
    {
      ...baseData,
      type: 'VACATION' as const,
      totalDays: unified.vacationDays,
      remainingDays: unified.vacationDays,
    },
    {
      ...baseData,
      type: 'SICK' as const,
      totalDays: unified.sickDays,
      remainingDays: unified.sickDays,
    },
    {
      ...baseData,
      type: 'PAID_LEAVE' as const,
      totalDays: unified.paidLeave,
      remainingDays: unified.paidLeave,
    },
    {
      ...baseData,
      type: 'PERSONAL' as const,
      totalDays: unified.personalDays,
      remainingDays: unified.personalDays,
    },
  ];
} 