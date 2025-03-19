/**
 * Test script for email notifications
 * 
 * Usage:
 * - To test admin notification: node scripts/test-email.js admin your@email.com "Employee Name"
 * - To test employee notification: node scripts/test-email.js employee your@email.com "Employee Name"
 */

require('dotenv').config({ path: '.env.local' });

const { 
  sendTimeOffRequestSubmittedEmail,
  sendTimeOffRequestAdminNotification,
  sendTimeOffRequestApprovedEmail,
  sendTimeOffRequestRejectedEmail
} = require('../src/lib/email');

// Debug info
console.log('Email Configuration:');
console.log('- HOST:', process.env.EMAIL_SERVER_HOST);
console.log('- PORT:', process.env.EMAIL_SERVER_PORT);
console.log('- USER:', process.env.EMAIL_SERVER_USER ? '✓ Set' : '✗ Not set');
console.log('- PASSWORD:', process.env.EMAIL_SERVER_PASSWORD ? '✓ Set' : '✗ Not set');
console.log('- ADMIN_EMAIL:', process.env.ADMIN_EMAIL);
console.log('- APP_URL:', process.env.NEXT_PUBLIC_APP_URL || 'Not set (will use localhost:3000)');
console.log('---------------------------');

// Set up test data
const testStartDate = new Date();
const testEndDate = new Date();
testEndDate.setDate(testEndDate.getDate() + 5);

const testType = 'VACATION';
const testReason = 'Taking some time off for personal reasons';
const testRequestId = 'test-request-id-123';

// Process command line arguments
const args = process.argv.slice(2);
const notificationType = args[0]; // 'admin' or 'employee'
const emailTo = args[1]; // Email address to send to
const employeeName = args[2] || 'Test Employee'; // Name to use in the email

if (!notificationType || !emailTo) {
  console.error('Usage: node scripts/test-email.js [admin|employee|approved|rejected] your@email.com "Employee Name"');
  process.exit(1);
}

async function runTest() {
  try {
    console.log(`Testing ${notificationType} notification...`);
    
    switch (notificationType) {
      case 'admin':
        // Test admin notification
        await sendTimeOffRequestAdminNotification(
          emailTo,
          employeeName,
          testStartDate.toISOString(),
          testEndDate.toISOString(),
          testType,
          testRequestId,
          testReason
        );
        console.log('✅ Admin notification email sent successfully!');
        break;
        
      case 'employee':
        // Test employee submission notification (this is commented out in the actual code now)
        await sendTimeOffRequestSubmittedEmail(
          emailTo,
          employeeName,
          testStartDate.toISOString(),
          testEndDate.toISOString(),
          testType,
          testReason
        );
        console.log('✅ Employee submission notification email sent successfully!');
        break;
        
      case 'approved':
        // Test approval notification
        await sendTimeOffRequestApprovedEmail(
          emailTo,
          employeeName,
          testStartDate.toISOString(),
          testEndDate.toISOString(),
          testType
        );
        console.log('✅ Approval notification email sent successfully!');
        break;
        
      case 'rejected':
        // Test rejection notification
        await sendTimeOffRequestRejectedEmail(
          emailTo,
          employeeName,
          testStartDate.toISOString(),
          testEndDate.toISOString(),
          testType,
          'Your request conflicts with team availability'
        );
        console.log('✅ Rejection notification email sent successfully!');
        break;
        
      default:
        console.error('Invalid notification type. Use "admin", "employee", "approved", or "rejected"');
        process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ Error sending email:', error);
    if (error.cause) {
      console.error('Cause:', error.cause);
    }
    process.exit(1);
  }
}

runTest(); 