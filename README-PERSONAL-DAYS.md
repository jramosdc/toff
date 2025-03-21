# Personal Days Implementation Guide

This feature adds a new "Personal Days" category to the time off system, with an initial allocation of 3 days per employee.

## Database Migration

Before deploying the updated code, you need to run a database migration:

```bash
# Make sure you have DATABASE_URL set in your .env file
cd toff
npx prisma migrate dev --name add_personal_days
```

This will add the new `personalDays` field to the `TimeOffBalance` model and update the `TimeOffType` enum to include the `PERSONAL` option.

## Changes Summary

The following changes have been made to implement the Personal Days feature:

1. **Schema Changes**:
   - Added `personalDays` field to `TimeOffBalance` model with a default value of 3
   - Added `PERSONAL` to the `TimeOffType` enum

2. **UI Updates**:
   - Added Personal Days to the employee dashboard balance display
   - Added Personal Days to the employee detail page in admin panel
   - Added "Personal Time Off" option to the time off request form dropdown

3. **API Updates**:
   - Updated used-days calculation to include personal days tracking
   - Updated request approval logic to handle personal days when approving requests

## Testing

After deployment, please verify:
1. Each employee has 3 personal days added to their balance for the current year
2. Employees can request time off using the "Personal Time Off" option
3. Admins can approve personal days and the balance is correctly adjusted
4. Used-days calculations include personal days usage 