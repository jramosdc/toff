import nodemailer from 'nodemailer';

// Configure email transporter
// For development, we'll use a test account from Ethereal
// In production, you should use a real SMTP service
let transporter: nodemailer.Transporter;

// Initialize the email transporter
export async function initializeEmailTransporter() {
  if (transporter) return transporter;
  
  // Create a test account for development
  const testAccount = await nodemailer.createTestAccount();
  
  // Create reusable transporter
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.ethereal.email',
    port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER || testAccount.user,
      pass: process.env.SMTP_PASS || testAccount.pass,
    },
  });
  
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
    
    const mailOptions = {
      from: process.env.EMAIL_FROM || '"TOFF System" <notifications@toff.app>',
      to,
      subject,
      html,
    };
    
    const info = await emailTransporter.sendMail(mailOptions);
    
    // For development, log the URL where you can preview the email
    if (!process.env.SMTP_HOST) {
      console.log('Email preview URL: %s', nodemailer.getTestMessageUrl(info));
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

const smtpOptions = {
  host: process.env.EMAIL_SERVER_HOST,
  port: Number(process.env.EMAIL_SERVER_PORT),
  secure: false,
  auth: {
    user: process.env.EMAIL_SERVER_USER || '',
    pass: process.env.EMAIL_SERVER_PASSWORD || '',
  },
};

export const sendEmail = async (data: EmailPayload) => {
  const transporter = nodemailer.createTransport(smtpOptions);
  
  return await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    ...data,
  });
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