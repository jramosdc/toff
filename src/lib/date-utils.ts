/**
 * Utility functions for date operations and calculations
 */

/**
 * Checks if a date is a US federal holiday in 2025
 * @param date Date to check
 * @returns boolean indicating if the date is a federal holiday
 */
export function isFederalHoliday(date: Date): boolean {
  // Format date as yyyy-mm-dd for easy comparison
  const year = date.getFullYear();
  const month = date.getMonth() + 1; // JavaScript months are 0-indexed
  const day = date.getDate();
  
  // Convert to simple date string format mm-dd for most checks
  const dateString = `${month}-${day}`;
  
  // Fixed date holidays
  const fixedHolidays: Record<string, string[]> = {
    // Format: 'mm-dd': ['Holiday Name', 'Year specific if applicable'] 
    '1-1': ['New Year\'s Day'],
    '6-19': ['Juneteenth'],
    '7-4': ['Independence Day'],
    '11-11': ['Veterans Day'],
    '12-25': ['Christmas Day']
  };
  
  // Check fixed date holidays
  if (fixedHolidays[dateString]) {
    return true;
  }
  
  // Check floating holidays for 2025
  // These are specific to 2025
  if (year === 2025) {
    switch (dateString) {
      // MLK Day - Third Monday in January
      case '1-20': return true;
      // Washington's Birthday/Presidents Day - Third Monday in February
      case '2-17': return true;
      // Memorial Day - Last Monday in May
      case '5-26': return true;
      // Labor Day - First Monday in September  
      case '9-1': return true;
      // Columbus Day - Second Monday in October
      case '10-13': return true;
      // Thanksgiving - Fourth Thursday in November
      case '11-27': return true;
      default: return false;
    }
  }
  
  // For years other than 2025, would need additional logic to calculate floating holidays
  // This is a simplified version that only handles 2025 accurately
  
  return false;
}

/**
 * Calculate working days between two dates, excluding weekends and federal holidays
 * @param start Start date
 * @param end End date
 * @returns Number of working days
 */
export function calculateWorkingDays(start: Date, end: Date): number {
  let count = 0;
  const current = new Date(start);

  while (current <= end) {
    const dayOfWeek = current.getDay();
    // Skip weekends (0 = Sunday, 6 = Saturday)
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      // Skip federal holidays
      if (!isFederalHoliday(current)) {
        count++;
      }
    }
    current.setDate(current.getDate() + 1);
  }

  return count;
} 