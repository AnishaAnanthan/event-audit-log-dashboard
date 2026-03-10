import nodemailer from "nodemailer";

const RESEND_API_URL = "https://api.resend.com/emails";

const buildTransporter = () => {
  const {
    SMTP_HOST,
    SMTP_PORT,
    SMTP_USER,
    SMTP_PASS,
    SMTP_FROM,
    SMTP_SECURE,
  } = process.env;

  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !SMTP_FROM) {
    throw new Error("SMTP configuration is incomplete");
  }

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: String(SMTP_SECURE || "").toLowerCase() === "true",
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
};

const sendViaResend = async ({ to, subject, text }) => {
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured");

  // Resend requires a verified sender. For testing you can use "onboarding@resend.dev".
  const from = String(process.env.EMAIL_FROM || process.env.SMTP_FROM || "onboarding@resend.dev").trim();
  if (!from) throw new Error("EMAIL_FROM is not configured");

  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      text,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Resend send failed: ${response.status} ${response.statusText}${body ? ` - ${body}` : ""}`);
  }
};

export const sendVerificationEmail = async (email, otp) => {
  const to = email;
  const subject = "Real time Event Tracking Dashboard";
  const text = `Your verification OTP is: ${otp}\nIt will expire in 10 minutes.`;

  // Prefer Resend in production to avoid cloud SMTP egress blocks/timeouts.
  if (String(process.env.RESEND_API_KEY || "").trim()) {
    await sendViaResend({ to, subject, text });
    return;
  }

  const transporter = buildTransporter();
  const from = process.env.SMTP_FROM;
  await transporter.sendMail({ from, to, subject, text });
};
