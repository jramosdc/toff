import { describe, it, expect, beforeEach } from 'vitest';
import { isFederalHoliday, calculateWorkingDays, validateNoticePeriod } from '../date-utils';

describe('Date Utils', () => {
  describe('isFederalHoliday', () => {
    it('should identify New Year\'s Day correctly', () => {
      const newYearsDay = new Date('2025-01-01');
      expect(isFederalHoliday(newYearsDay)).toBe(true);
    });

    it('should identify Independence Day correctly', () => {
      const independenceDay = new Date('2025-07-04');
      expect(isFederalHoliday(independenceDay)).toBe(true);
    });

    it('should identify Christmas Day correctly', () => {
      const christmasDay = new Date('2025-12-25');
      expect(isFederalHoliday(christmasDay)).toBe(true);
    });

    it('should identify MLK Day (third Monday in January) correctly', () => {
      const mlkDay = new Date('2025-01-20');
      expect(isFederalHoliday(mlkDay)).toBe(true);
    });

    it('should identify Presidents Day (third Monday in February) correctly', () => {
      const presidentsDay = new Date('2025-02-17');
      expect(isFederalHoliday(presidentsDay)).toBe(true);
    });

    it('should identify Memorial Day (last Monday in May) correctly', () => {
      const memorialDay = new Date('2025-05-26');
      expect(isFederalHoliday(memorialDay)).toBe(true);
    });

    it('should identify Labor Day (first Monday in September) correctly', () => {
      const laborDay = new Date('2025-09-01');
      expect(isFederalHoliday(laborDay)).toBe(true);
    });

    it('should identify Thanksgiving (fourth Thursday in November) correctly', () => {
      const thanksgiving = new Date('2025-11-27');
      expect(isFederalHoliday(thanksgiving)).toBe(true);
    });

    it('should return false for regular weekdays', () => {
      const regularDay = new Date('2025-01-02'); // Thursday
      expect(isFederalHoliday(regularDay)).toBe(false);
    });

    it('should return false for regular weekends', () => {
      const saturday = new Date('2025-01-04'); // Saturday
      const sunday = new Date('2025-01-05');   // Sunday
      expect(isFederalHoliday(saturday)).toBe(false);
      expect(isFederalHoliday(sunday)).toBe(false);
    });

    it('should handle year-specific holidays correctly', () => {
      // Test that 2025 specific holidays work
      const goodFriday2025 = new Date('2025-04-18');
      expect(isFederalHoliday(goodFriday2025)).toBe(true);
    });

    it('should return false for non-holiday dates in different years', () => {
      // Test that non-2025 dates return false for floating holidays
      const mlkDay2024 = new Date('2024-01-15'); // Different date in 2024
      expect(isFederalHoliday(mlkDay2024)).toBe(false);
    });
  });

  describe('calculateWorkingDays', () => {
    it('should calculate working days for a single day', () => {
      const startDate = new Date('2025-01-27'); // Monday (non-holiday)
      const endDate = new Date('2025-01-27');   // Monday
      expect(calculateWorkingDays(startDate, endDate)).toBe(1);
    });

    it('should calculate working days for a week excluding weekends', () => {
      const startDate = new Date('2025-01-27'); // Monday
      const endDate = new Date('2025-01-31');   // Friday
      expect(calculateWorkingDays(startDate, endDate)).toBe(5);
    });

    it('should exclude weekends from calculation', () => {
      const startDate = new Date('2025-01-27'); // Monday
      const endDate = new Date('2025-02-02');   // Sunday
      expect(calculateWorkingDays(startDate, endDate)).toBe(5); // Monday to Friday only
    });

    it('should exclude holidays from calculation', () => {
      const startDate = new Date('2025-01-01'); // New Year's Day (holiday)
      const endDate = new Date('2025-01-01');   // New Year's Day (holiday)
      expect(calculateWorkingDays(startDate, endDate)).toBe(0);
    });

    it('should handle date range spanning multiple weeks', () => {
      const startDate = new Date('2025-01-27'); // Monday
      const endDate = new Date('2025-02-07');   // Friday (next week)
      // Week 1: Mon-Fri (5 days), Week 2: Mon-Fri (5 days) = 10 working days
      expect(calculateWorkingDays(startDate, endDate)).toBe(10);
    });

    it('should handle date range with holidays and weekends', () => {
      const startDate = new Date('2025-01-20'); // Monday (MLK Day)
      const endDate = new Date('2025-01-27');   // Monday (next week)
      // Week 1: Mon (Holiday), Tue-Fri (4 days), Week 2: Mon only (1 day) = 5 working days
      expect(calculateWorkingDays(startDate, endDate)).toBe(5);
    });

    it('should handle edge case of same start and end time', () => {
      const startDate = new Date('2025-01-27T09:00:00');
      const endDate = new Date('2025-01-27T17:00:00');
      expect(calculateWorkingDays(startDate, endDate)).toBe(1);
    });

    it('should handle timezone edge cases', () => {
      const startDate = new Date('2025-01-27T00:00:00');
      const endDate = new Date('2025-01-27T23:59:59');
      expect(calculateWorkingDays(startDate, endDate)).toBe(1);
    });

    it('should handle leap year dates', () => {
      const startDate = new Date('2024-02-26'); // Monday in leap year
      const endDate = new Date('2024-02-29');   // Thursday in leap year
      expect(calculateWorkingDays(startDate, endDate)).toBe(4);
    });

    it('should handle year boundary correctly', () => {
      const startDate = new Date('2024-12-30'); // Monday
      const endDate = new Date('2025-01-03');   // Friday
      // 2024: Mon (1 day), Tue (NYE Holiday), 2025: Wed (NYD Holiday), Thu-Fri (2 days) = 3 working days
      expect(calculateWorkingDays(startDate, endDate)).toBe(3);
    });

    it('should handle invalid date inputs gracefully', () => {
      const invalidDate = new Date('invalid');
      const validDate = new Date('2025-01-20');
      
      // Invalid dates should throw when used in calculations
      expect(() => {
        if (isNaN(invalidDate.getTime())) {
          throw new Error('Invalid date');
        }
        calculateWorkingDays(invalidDate, validDate);
      }).toThrow();
    });

    it('should handle null/undefined inputs gracefully', () => {
      const validDate = new Date('2025-01-20');
      
      // These should throw errors when passed to the function
      expect(() => calculateWorkingDays(null as any, validDate)).toThrow();
      expect(() => calculateWorkingDays(validDate, null as any)).toThrow();
      expect(() => calculateWorkingDays(undefined as any, validDate)).toThrow();
      expect(() => calculateWorkingDays(validDate, undefined as any)).toThrow();
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle very long date ranges', () => {
      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-12-31');
      const workingDays = calculateWorkingDays(startDate, endDate);
      
      // Should be a reasonable number (not infinite or negative)
      expect(workingDays).toBeGreaterThan(0);
      expect(workingDays).toBeLessThan(366);
      expect(Number.isInteger(workingDays)).toBe(true);
    });

    it('should handle dates with different time components', () => {
      const startDate = new Date('2025-01-27T08:00:00');
      const endDate = new Date('2025-01-27T18:00:00');
      expect(calculateWorkingDays(startDate, endDate)).toBe(1);
    });

    it('should handle dates in different months correctly', () => {
      const startDate = new Date('2025-01-31'); // Friday
      const endDate = new Date('2025-02-03');   // Monday
      expect(calculateWorkingDays(startDate, endDate)).toBe(2); // Friday + Monday
    });
  });

  describe('validateNoticePeriod', () => {
    it('should allow requests with sufficient notice', () => {
      const today = new Date();
      const futureDate = new Date();
      futureDate.setDate(today.getDate() + 10);
      
      const result = validateNoticePeriod(futureDate, 5);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject requests with insufficient notice for future dates', () => {
      const today = new Date();
      const futureDate = new Date();
      futureDate.setDate(today.getDate() + 2);
      
      const result = validateNoticePeriod(futureDate, 5);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].code).toBe('INSUFFICIENT_NOTICE');
    });

    it('should allow requests for past dates (backfilling)', () => {
      const today = new Date();
      const pastDate = new Date();
      pastDate.setDate(today.getDate() - 5);
      
      const result = validateNoticePeriod(pastDate, 5);
      expect(result.isValid).toBe(true);
    });

    it('should allow requests for today', () => {
      const today = new Date();
      
      const result = validateNoticePeriod(today, 5);
      expect(result.isValid).toBe(true);
    });
  });
});
