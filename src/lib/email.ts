import nodemailer from 'nodemailer';
import { prisma, isPrismaEnabled } from './db';

// Configure email transporter
// For development, we'll use a test account from Ethereal
// In production, you should use a real SMTP service
let transporter: nodemailer.Transporter;

// Helper to get email settings from DB
async function getEmailSettingsFromDB() {
  if (isPrismaEnabled && prisma) {
    try {
      const row = await (prisma as any).emailSettings?.findFirst?.();
      if (row) return { user: row.userEmail, pass: row.userPass };
    } catch (e) {
      console.error('Error fetching email settings:', e);
    }
  }
  return null;
}

// Initialize the email transporter
export async function initializeEmailTransporter() {
  // Always fetch latest settings in case they changed
  // In a high-load app we might cache this, but for now correctness is priority
  const dbSettings = await getEmailSettingsFromDB();
  
  // Use environment variables for email configuration
  // If running on Vercel or if we have DB settings, use real SMTP
  if (process.env.VERCEL || dbSettings) {
    // For production, use proper SMTP configuration with authentication
    let user = process.env.EMAIL_SERVER_USER;
    let pass = process.env.EMAIL_SERVER_PASSWORD;
    
    if (dbSettings) {
      if (dbSettings.user) user = dbSettings.user;
      if (dbSettings.pass) pass = dbSettings.pass;
    }
    
    // If we have a transporter already configured with the SAME credentials, reuse it
    // But since we can't easily check internal credentials, we'll recreate if settings exist
    // to ensure we use the latest.
    // Optimization: check if global cached user matches.
    
    transporter = nodemailer.createTransport({
      host: process.env.EMAIL_SERVER_HOST,
      port: process.env.EMAIL_SERVER_PORT ? parseInt(process.env.EMAIL_SERVER_PORT) : 587,
      secure: false, // true for 465, false for other ports
      auth: {
        user,
        pass,
      },
    });
    
    console.log('Email transporter configured with host:', process.env.EMAIL_SERVER_HOST);
  } else {
    // For development without DB settings, use Ethereal test account
    if (!transporter) {
      const testAccount = await nodemailer.createTestAccount();
      
      transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
      
      console.log('Email transporter configured for development with Ethereal');
    }
  }
  
  return transporter;
}

// Function to send notification emails
export async function sendNotificationEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) {
  try {
    const emailTransporter = await initializeEmailTransporter();
    const dbSettings = await getEmailSettingsFromDB();
    
    // Determine 'from' address
    // If DB settings exist, use that email. Otherwise fallback to env var.
    let from = process.env.EMAIL_FROM || '"TOFF System" <notifications@toff.app>';
    if (dbSettings?.user) {
      // Use the configured email as the sender
      // We can add a display name if desired, e.g. "TOFF System" <email>
      from = `"TOFF System" <${dbSettings.user}>`;
    }
    
    const mailOptions = {
      from,
      to,
      subject,
      html,
    };
    
    console.log('Sending email to:', to, 'from:', from, 'with subject:', subject);
    const info = await emailTransporter.sendMail(mailOptions);
    
    // For development, log the URL where you can preview the email
    if (!process.env.VERCEL && !dbSettings) {
      console.log('Email preview URL: %s', nodemailer.getTestMessageUrl(info));
    } else {
      console.log('Email sent successfully:', info.messageId);
    }
    
    return info;
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
}

// Helper to send overtime request notification
export async function sendOvertimeRequestNotification({
  employeeName,
  employeeEmail,
  hours,
  requestDate,
  notes,
  adminEmail,
  requestId,
}: {
  employeeName: string;
  employeeEmail: string;
  hours: number;
  requestDate: string;
  notes?: string;
  adminEmail: string;
  requestId: string;
}) {
  const subject = `[TOFF] New Overtime Request from ${employeeName}`;
  
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const approvalLink = `${appUrl}/admin?request=${requestId}`;
  
  const html = `
    <h2>New Overtime Request</h2>
    <p>A new overtime request has been submitted and requires your attention.</p>
    
    <h3>Request Details:</h3>
    <ul>
      <li><strong>Employee:</strong> ${employeeName} (${employeeEmail})</li>
      <li><strong>Hours:</strong> ${hours} (${(hours / 8).toFixed(2)} days)</li>
      <li><strong>Date:</strong> ${new Date(requestDate).toLocaleDateString()}</li>
      ${notes ? `<li><strong>Notes:</strong> ${notes}</li>` : ''}
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
  
  return sendNotificationEmail({
    to: adminEmail,
    subject,
    html,
  });
}

// Helper to send request status notification to employee
export async function sendRequestStatusNotification({
  employeeName,
  employeeEmail,
  requestType,
  status,
}: {
  employeeName: string;
  employeeEmail: string;
  requestType: string;
  status: 'APPROVED' | 'REJECTED';
}) {
  const subject = `[TOFF] Your ${requestType} Request has been ${status}`;
  
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const dashboardLink = `${appUrl}/dashboard`;
  
  const html = `
    <h2>Request ${status}</h2>
    <p>Hello ${employeeName},</p>
    <p>Your ${requestType} request has been <strong>${status.toLowerCase()}</strong>.</p>
    
    <p>
      <a href="${dashboardLink}" style="display: inline-block; padding: 10px 20px; background-color: #4f46e5; color: white; text-decoration: none; border-radius: 5px;">
        View Dashboard
      </a>
    </p>
    
    <hr>
    <p style="color: #6b7280; font-size: 0.875rem;">
      This is an automated message from the TOFF (Time Off) system.
    </p>
  `;
  
  return sendNotificationEmail({
    to: employeeEmail,
    subject,
    html,
  });
}

interface EmailPayload {
  to: string;
  subject: string;
  html: string;
}

// Helper to send email with custom transporter options
export const sendEmail = async (data: EmailPayload) => {
  try {
    const emailTransporter = await initializeEmailTransporter();
    const dbSettings = await getEmailSettingsFromDB();
    
    // Determine 'from' address
    let from = process.env.EMAIL_FROM || '"TOFF System" <notifications@toff.app>';
    if (dbSettings?.user) {
      from = `"TOFF System" <${dbSettings.user}>`;
    }

    // Merge computed 'from' with data (data.from takes precedence if set, though usually it isn't)
    const mailOptions = {
      from, 
      ...data,
    };
    
    console.log('Sending email to:', data.to, 'from:', mailOptions.from, 'with subject:', data.subject);
    
    const info = await emailTransporter.sendMail(mailOptions);
      
    // For development, log the URL where you can preview the email
    if (!process.env.VERCEL && !dbSettings) {
      console.log('Email preview URL: %s', nodemailer.getTestMessageUrl(info));
    } else {
      console.log('Email sent successfully:', info.messageId);
    }
    return info;
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
};

export const sendTimeOffRequestApprovedEmail = async (
  to: string, 
  userName: string, 
  startDate: string, 
  endDate: string,
  type: string
) => {
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
};

export const sendTimeOffRequestRejectedEmail = async (
  to: string, 
  userName: string, 
  startDate: string, 
  endDate: string,
  type: string,
  reason?: string
) => {
  const subject = `Time Off Request Rejected`;
  
  const html = `
    <h1>Time Off Request Rejected</h1>
    <p>Hello ${userName},</p>
    <p>Unfortunately, your time off request has been rejected.</p>
    <p><strong>Type:</strong> ${type}</p>
    <p><strong>Start Date:</strong> ${new Date(startDate).toLocaleDateString()}</p>
    <p><strong>End Date:</strong> ${new Date(endDate).toLocaleDateString()}</p>
    ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
    <p>Please contact your manager if you have any questions.</p>
    <p>Best regards,<br>TOFF Team</p>
  `;
  
  return await sendEmail({ to, subject, html });
};

export const sendTimeOffRequestSubmittedEmail = async (
  to: string, 
  userName: string, 
  startDate: string, 
  endDate: string,
  type: string,
  reason?: string
) => {
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
};

// Adding new function for admin notification
export const sendTimeOffRequestAdminNotification = async (
  adminEmail: string,
  employeeName: string,
  startDate: string,
  endDate: string,
  type: string,
  requestId: string,
  reason?: string
) => {
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
}; 