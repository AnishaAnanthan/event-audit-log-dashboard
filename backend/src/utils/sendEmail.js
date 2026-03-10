import nodemailer from "nodemailer";

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

export const sendVerificationEmail = async (email, otp) => {
  const transporter = buildTransporter();
  const from = process.env.SMTP_FROM;

  await transporter.sendMail({
    from,
    to: email,
    subject: "Real time Event Tracking Dashboard",
    text: `Your verification OTP is: ${otp}\nIt will expire in 10 minutes.`,
  });
};
