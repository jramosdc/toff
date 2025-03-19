/**
 * Test script for email notifications
 * 
 * Usage:
 * - To test admin notification: node scripts/test-email.js admin your@email.com "Employee Name"
 * - To test employee notification: node scripts/test-email.js employee your@email.com "Employee Name"
 */

// Import required packages
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

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

// Direct implementation of nodemailer for testing
const nodemailer = require('nodemailer');

// Create the transporter with the email server config
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_SERVER_HOST,
  port: parseInt(process.env.EMAIL_SERVER_PORT || '587'),
  secure: parseInt(process.env.EMAIL_SERVER_PORT || '587') === 465,
  auth: {
    user: process.env.EMAIL_SERVER_USER,
    pass: process.env.EMAIL_SERVER_PASSWORD,
  },
  tls: {
    rejectUnauthorized: false
  }
});

// Simplified email sending function
async function sendEmail({ to, subject, html }) {
  console.log(`Sending email to: ${to}`);
  console.log(`Subject: ${subject}`);
  
  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.EMAIL_SERVER_USER,
      to,
      subject,
      html,
    });
    
    console.log('Email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Failed to send email:', error);
    throw error;
  }
}

// Email template functions
async function sendTimeOffRequestSubmittedEmail(
  to, 
  userName, 
  startDate, 
  endDate,
  type,
  reason
) {
  const subject = `Time Off Request Submitted`;
  
  const html = `
    <h1>Time Off Request Submitted</h1>
    <p>Hello ${userName},</p>
    <p>Your time off request has been submitted and is awaiting approval.</p>
    <p><strong>Type:</strong> ${type}</p>
    <p><strong>Start Date:</strong> ${new Date(startDate).toLocaleDateString()}</p>
    <p><strong>End Date:</strong> ${new Date(endDate).toLocaleDateString()}</p>
    ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
    <p>You will be notified when your request is processed.</p>
    <p>Best regards,<br>TOFF Team</p>
  `;
  
  return await sendEmail({ to, subject, html });
}

async function sendTimeOffRequestAdminNotification(
  adminEmail,
  employeeName,
  startDate,
  endDate,
  type,
  requestId,
  reason
) {
  const subject = `[TOFF] New Time Off Request from ${employeeName}`;
  
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const approvalLink = `${appUrl}/admin/requests?request=${requestId}`;
  
  const html = `
    <h2>New Time Off Request</h2>
    <p>A new time off request has been submitted and requires your attention.</p>
    
    <h3>Request Details:</h3>
    <ul>
      <li><strong>Employee:</strong> ${employeeName}</li>
      <li><strong>Type:</strong> ${type}</li>
      <li><strong>Start Date:</strong> ${new Date(startDate).toLocaleDateString()}</li>
      <li><strong>End Date:</strong> ${new Date(endDate).toLocaleDateString()}</li>
      ${reason ? `<li><strong>Reason:</strong> ${reason}</li>` : ''}
    </ul>
    
    <p>
      <a href="${approvalLink}" style="display: inline-block; padding: 10px 20px; background-color: #4f46e5; color: white; text-decoration: none; border-radius: 5px;">
        Review Request
      </a>
    </p>
    
    <p>Or copy this URL into your browser: ${approvalLink}</p>
    
    <hr>
    <p style="color: #6b7280; font-size: 0.875rem;">
      This is an automated message from the TOFF (Time Off) system.
    </p>
  `;
  
  return await sendEmail({ to: adminEmail, subject, html });
}

async function sendTimeOffRequestApprovedEmail(
  to,
  userName,
  startDate,
  endDate,
  type
) {
  const subject = `Time Off Request Approved`;
  
  const html = `
    <h1>Time Off Request Approved</h1>
    <p>Hello ${userName},</p>
    <p>Your time off request has been approved!</p>
    <p><strong>Type:</strong> ${type}</p>
    <p><strong>Start Date:</strong> ${new Date(startDate).toLocaleDateString()}</p>
    <p><strong>End Date:</strong> ${new Date(endDate).toLocaleDateString()}</p>
    <p>Enjoy your time off!</p>
    <p>Best regards,<br>TOFF Team</p>
  `;
  
  return await sendEmail({ to, subject, html });
}

async function sendTimeOffRequestRejectedEmail(
  to,
  userName,
  startDate,
  endDate,
  type,
  rejectionReason
) {
  const subject = `Time Off Request Status Update`;
  
  const html = `
    <h1>Time Off Request Not Approved</h1>
    <p>Hello ${userName},</p>
    <p>Unfortunately, your time off request could not be approved at this time.</p>
    <p><strong>Type:</strong> ${type}</p>
    <p><strong>Start Date:</strong> ${new Date(startDate).toLocaleDateString()}</p>
    <p><strong>End Date:</strong> ${new Date(endDate).toLocaleDateString()}</p>
    ${rejectionReason ? `<p><strong>Reason:</strong> ${rejectionReason}</p>` : ''}
    <p>If you have any questions, please contact your manager.</p>
    <p>Best regards,<br>TOFF Team</p>
  `;
  
  return await sendEmail({ to, subject, html });
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