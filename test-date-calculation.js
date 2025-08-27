// Simple test script to verify date calculation
function isFederalHoliday(date) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const dateString = `${month}-${day}`;
  
  // Fixed date holidays
  const fixedHolidays = {
    '1-1': ['New Year\'s Day'],
    '6-19': ['Juneteenth'],
    '7-4': ['Independence Day'],
    '11-11': ['Veterans Day'],
    '12-24': ['Christmas Eve'],
    '12-25': ['Christmas Day']
  };
  
  if (fixedHolidays[dateString]) {
    return true;
  }
  
  // 2025 floating holidays
  if (year === 2025) {
    switch (dateString) {
      case '1-20': return true; // MLK Day
      case '2-17': return true; // Presidents Day
      case '4-18': return true; // Good Friday
      case '5-26': return true; // Memorial Day
      case '9-1': return true;  // Labor Day
      case '10-13': return true; // Columbus Day
      case '11-27': return true; // Thanksgiving
      default: return false;
    }
  }
  
  return false;
}

function calculateWorkingDays(start, end) {
  let count = 0;
  const current = new Date(start);
  
  // Set time to start of day to avoid timezone issues
  current.setHours(0, 0, 0, 0);
  const endDate = new Date(end);
  endDate.setHours(23, 59, 59, 999);

  // Include both start and end dates in the calculation
  while (current <= endDate) {
    const dayOfWeek = current.getDay();
    // Skip weekends (0 = Sunday, 6 = Saturday)
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      // Skip holidays (federal holidays and company holidays)
      if (!isFederalHoliday(current)) {
        count++;
      }
    }
    current.setDate(current.getDate() + 1);
  }

  return count;
}

// Test August 5-6, 2025 (Tuesday to Wednesday)
console.log('=== Testing August 5-6, 2025 ===');
const startDate = new Date(2025, 7, 5); // Month is 0-indexed, so 7 = August
const endDate = new Date(2025, 7, 6);

console.log('Start Date:', startDate.toDateString());
console.log('End Date:', endDate.toDateString());
console.log('Day of week (start):', startDate.getDay(), '(0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday)');
console.log('Day of week (end):', endDate.getDay(), '(0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday)');

const workingDays = calculateWorkingDays(startDate, endDate);
console.log('Working days calculated:', workingDays);

// Manual verification
console.log('\n=== Manual verification ===');
let manualCount = 0;
const current = new Date(startDate);
while (current <= endDate) {
  const dayOfWeek = current.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const isHoliday = isFederalHoliday(current);
  const isWorkingDay = !isWeekend && !isHoliday;
  
  console.log('Date:', current.toDateString(), 
              'Day:', dayOfWeek, 
              'Weekend:', isWeekend, 
              'Holiday:', isHoliday, 
              'Working:', isWorkingDay);
  
  if (isWorkingDay) {
    manualCount++;
  }
  current.setDate(current.getDate() + 1);
}
console.log('Manual count:', manualCount);

// Test a longer range
console.log('\n=== Testing August 5-9, 2025 (5 days) ===');
const startDate2 = new Date(2025, 7, 5);
const endDate2 = new Date(2025, 7, 9);
const workingDays2 = calculateWorkingDays(startDate2, endDate2);
console.log('Working days for Aug 5-9, 2025:', workingDays2);

// Test a weekend range
console.log('\n=== Testing August 2-3, 2025 (weekend) ===');
const startDate3 = new Date(2025, 7, 2);
const endDate3 = new Date(2025, 7, 3);
const workingDays3 = calculateWorkingDays(startDate3, endDate3);
console.log('Working days for Aug 2-3, 2025 (weekend):', workingDays3);

// Test with a holiday
console.log('\n=== Testing July 4, 2025 (Independence Day) ===');
const startDate4 = new Date(2025, 6, 4);
const endDate4 = new Date(2025, 6, 4);
const workingDays4 = calculateWorkingDays(startDate4, endDate4);
console.log('Working days for July 4, 2025 (holiday):', workingDays4); 