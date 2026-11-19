const SibApiV3Sdk = require("sib-api-v3-sdk");

// Test queue for automated tests
const testEmailQueue = [];

/**
 * Check if Brevo or SMTP credentials are fully provided
 */
const isEmailConfigured = () => {
    return Boolean(
        process.env.BREVO_API_KEY ||
        (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
    );
};

/**
 * Send email via Brevo Official Transactional API (`sib-api-v3-sdk`) or fallback to SMTP nodemailer
 */
const sendMail = async ({ to, subject, html, text }) => {
    // In test environment, record email for verification without making external calls
    if (process.env.NODE_ENV === "test") {
        testEmailQueue.push({ to, subject, html, text, sentAt: new Date() });
        return {
            success: true,
            messageId: `test-email-${Date.now()}`
        };
    }

    const brevoApiKey = process.env.BREVO_API_KEY;

    if (brevoApiKey && brevoApiKey.trim() !== "") {
        try {
            const defaultClient = SibApiV3Sdk.ApiClient.instance;
            const configuredBasePath = process.env.BREVO_API_BASE_PATH && process.env.BREVO_API_BASE_PATH.trim();
            defaultClient.basePath = (configuredBasePath || "https://api.brevo.com/v3").replace(/\/+$/, "");
            const apiKey = defaultClient.authentications["api-key"];
            apiKey.apiKey = brevoApiKey;

            const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi(defaultClient);

            const senderEmail = process.env.BREVO_SENDER_EMAIL || process.env.EMAIL_FROM || "noreply@afc.com";
            const senderName = process.env.BREVO_SENDER_NAME || "AFC - American Fried Chicken";

            const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
            sendSmtpEmail.sender = { email: senderEmail, name: senderName };
            sendSmtpEmail.to = [{ email: to }];
            sendSmtpEmail.subject = subject;
            sendSmtpEmail.htmlContent = html;
            sendSmtpEmail.textContent = text;

            const data = await apiInstance.sendTransacEmail(sendSmtpEmail);
            return {
                success: true,
                messageId: data.messageId || `brevo-${Date.now()}`
            };
        } catch (brevoError) {
            console.error("Brevo API email delivery failed:", brevoError.message || brevoError);
            throw brevoError;
        }
    }

    // Fallback if Brevo API key is absent but SMTP is configured
    const nodemailer = require("nodemailer");
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT, 10) || 587,
            secure: process.env.SMTP_SECURE === "true" || process.env.SMTP_PORT === "465",
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        });

        const fromAddress = process.env.EMAIL_FROM || "AFC E-Commerce <noreply@afc.com>";
        return await transporter.sendMail({
            from: fromAddress,
            to,
            subject,
            html,
            text
        });
    }

    const error = new Error(
        "Email service is not configured. Please set BREVO_API_KEY or SMTP credentials in environment variables."
    );
    error.code = "EMAIL_NOT_CONFIGURED";
    throw error;
};

/**
 * AFC Branded Verification Email
 */
const sendVerificationOtpEmail = async (email, otp, name = "Customer") => {
    const subject = "Your AFC Account Verification Code";
    const expiryMinutes = 10;

    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>AFC Verification Code</title>
        <style>
            body { margin: 0; padding: 0; background-color: #f7f7f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
            .container { max-width: 560px; margin: 40px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08); border: 1px solid #e5e5e5; }
            .header { background-color: #DC2626; padding: 28px 24px; text-align: center; }
            .header h1 { color: #ffffff; margin: 0; font-size: 26px; font-weight: 900; letter-spacing: 1px; }
            .header p { color: #FEE2E2; margin: 6px 0 0 0; font-size: 13px; font-weight: 500; }
            .content { padding: 36px 32px; color: #1c1917; }
            .greeting { font-size: 18px; font-weight: 700; margin-bottom: 16px; color: #1c1917; }
            .instructions { font-size: 14px; line-height: 1.6; color: #44403c; margin-bottom: 28px; }
            .otp-box { background-color: #FFF1F2; border: 2px dashed #DC2626; border-radius: 10px; padding: 20px; text-align: center; margin-bottom: 28px; }
            .otp-code { font-family: 'Courier New', Courier, monospace; font-size: 38px; font-weight: 900; letter-spacing: 10px; color: #DC2626; margin: 0; }
            .otp-caption { font-size: 12px; color: #991B1B; font-weight: 600; margin-top: 8px; text-transform: uppercase; }
            .warning { font-size: 12px; color: #78716c; line-height: 1.5; border-top: 1px solid #f0f0f0; padding-top: 20px; }
            .footer { background-color: #fafaf9; padding: 20px; text-align: center; font-size: 11px; color: #a8a29e; border-top: 1px solid #f5f5f4; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>AFC</h1>
                <p>AMERICAN FRIED CHICKEN</p>
            </div>
            <div class="content">
                <div class="greeting">Hi ${name},</div>
                <div class="instructions">
                    Thank you for creating an account with AFC. Please use the verification code below to verify your email address and activate your account:
                </div>
                <div class="otp-box">
                    <p class="otp-code">${otp}</p>
                    <p class="otp-caption">Valid for ${expiryMinutes} minutes</p>
                </div>
                <div class="warning">
                    <strong>Security Notice:</strong> If you did not create an AFC account, please ignore this email. Never share this code with anyone. AFC staff will never ask for your verification code.
                </div>
            </div>
            <div class="footer">
                &copy; ${new Date().getFullYear()} AFC - American Fried Chicken. All rights reserved.
            </div>
        </div>
    </body>
    </html>
    `;

    const text = `Hi ${name},\n\nYour AFC email verification code is: ${otp}\n\nThis code will expire in ${expiryMinutes} minutes.\n\nIf you did not request this code, please ignore this email.\nNever share this code with anyone.\n\n- AFC Team`;

    return await sendMail({ to: email, subject, html, text });
};

/**
 * AFC Branded Password Reset Email
 */
const sendPasswordResetOtpEmail = async (email, otp, name = "Customer") => {
    const subject = "AFC Password Reset Code";
    const expiryMinutes = 10;

    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>AFC Password Reset</title>
        <style>
            body { margin: 0; padding: 0; background-color: #f7f7f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
            .container { max-width: 560px; margin: 40px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08); border: 1px solid #e5e5e5; }
            .header { background-color: #1E293B; padding: 28px 24px; text-align: center; }
            .header h1 { color: #ffffff; margin: 0; font-size: 26px; font-weight: 900; letter-spacing: 1px; }
            .header p { color: #94A3B8; margin: 6px 0 0 0; font-size: 13px; font-weight: 500; }
            .content { padding: 36px 32px; color: #1c1917; }
            .greeting { font-size: 18px; font-weight: 700; margin-bottom: 16px; color: #1c1917; }
            .instructions { font-size: 14px; line-height: 1.6; color: #44403c; margin-bottom: 28px; }
            .otp-box { background-color: #F1F5F9; border: 2px dashed #475569; border-radius: 10px; padding: 20px; text-align: center; margin-bottom: 28px; }
            .otp-code { font-family: 'Courier New', Courier, monospace; font-size: 38px; font-weight: 900; letter-spacing: 10px; color: #0F172A; margin: 0; }
            .otp-caption { font-size: 12px; color: #475569; font-weight: 600; margin-top: 8px; text-transform: uppercase; }
            .warning { font-size: 12px; color: #78716c; line-height: 1.5; border-top: 1px solid #f0f0f0; padding-top: 20px; }
            .footer { background-color: #fafaf9; padding: 20px; text-align: center; font-size: 11px; color: #a8a29e; border-top: 1px solid #f5f5f4; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>AFC</h1>
                <p>PASSWORD RESET REQUEST</p>
            </div>
            <div class="content">
                <div class="greeting">Hi ${name},</div>
                <div class="instructions">
                    We received a request to reset your AFC account password. Use the verification code below to complete your password reset:
                </div>
                <div class="otp-box">
                    <p class="otp-code">${otp}</p>
                    <p class="otp-caption">Valid for ${expiryMinutes} minutes</p>
                </div>
                <div class="warning">
                    <strong>Security Notice:</strong> If you did not request a password reset, you can safely disregard this email. Your password will not change unless this code is verified.
                </div>
            </div>
            <div class="footer">
                &copy; ${new Date().getFullYear()} AFC - American Fried Chicken. All rights reserved.
            </div>
        </div>
    </body>
    </html>
    `;

    const text = `Hi ${name},\n\nYour AFC password reset code is: ${otp}\n\nThis code will expire in ${expiryMinutes} minutes.\n\nIf you did not request a password reset, please ignore this email.\nNever share this code with anyone.\n\n- AFC Team`;

    return await sendMail({ to: email, subject, html, text });
};

const getTestEmailQueue = () => testEmailQueue;
const clearTestEmailQueue = () => {
    testEmailQueue.length = 0;
};

module.exports = {
    isEmailConfigured,
    sendVerificationOtpEmail,
    sendPasswordResetOtpEmail,
    getTestEmailQueue,
    clearTestEmailQueue
};
