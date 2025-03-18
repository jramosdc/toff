# TOFF - Time Off Management System

TOFF is a comprehensive time off management system that helps companies track and manage employee vacation days, sick leave, and paid time off.

## Features

- User Authentication (Login/Logout)
- Role-based access (Admin/Employee)
- Time Off Balance Management
- Request Management for Vacation, Sick Days, and Paid Leave
- Overtime Compensation Requests
- Admin Dashboard for managing employees and requests
- Email Notifications for new requests and status changes

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Copy the `.env.example` to `.env.local` and update with your configuration:
   ```
   cp .env.example .env.local
   ```
4. Update the `.env.local` file with your configuration values
5. Initialize the database:
   ```
   node scripts/init-db.js
   ```
6. Start the development server:
   ```
   npm run dev
   ```
7. Open [http://localhost:3000](http://localhost:3000) in your browser

## Email Notifications

The system includes email notifications for:
- New overtime requests (notifies admins)
- Request status changes (notifies employees)

By default, the system uses Ethereal Email for testing in development. You'll see preview links in the console logs when emails are sent.

To configure real email sending, update the following variables in your `.env.local` file:

```
# Admin email for notifications
ADMIN_EMAIL=your-admin-email@example.com

# Email Configuration
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_username
SMTP_PASS=your_password
EMAIL_FROM="TOFF System <notifications@your-domain.com>"

# App URL for email links
NEXT_PUBLIC_APP_URL=https://your-app-url.com
```

## Gmail Email Configuration

TOFF can send email notifications for time off requests using Gmail SMTP. To configure email functionality:

1. **Create an App Password in your Google Account**:
   - Go to your Google Account → Security → 2-Step Verification → App passwords
   - Create a new app password for "TOFF Application"
   - Copy the generated password

2. **Update your `.env.local` file with the following variables**:
   ```
   EMAIL_SERVER_HOST=smtp.gmail.com
   EMAIL_SERVER_PORT=587
   EMAIL_SERVER_USER=your-gmail-address@gmail.com
   EMAIL_SERVER_PASSWORD=your-app-password-from-step-1
   EMAIL_FROM=your-gmail-address@gmail.com
   ```

3. **Email notifications are sent for**:
   - Time off request submission (to employee and administrators)
   - Time off request approval (to employee)
   - Time off request rejection (to employee)

## Important Notes
- Gmail has daily sending limits for regular accounts (around 500 emails/day)
- For production use with high volume, consider using a dedicated email service like SendGrid, Mailgun, etc.
- If you're getting authentication errors, make sure 2FA is enabled and you're using an App Password, not your regular Gmail password

## Troubleshooting
- If emails aren't sending, check your Gmail account for security alerts
- Ensure the port 587 isn't blocked by your firewall or network
- For debugging, check server logs for SMTP connection errors

## License

MIT
