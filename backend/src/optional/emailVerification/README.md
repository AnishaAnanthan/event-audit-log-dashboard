Email Verification (Optional Module)

This project previously used OTP-based email verification for user/admin registration.
It is currently disabled (no routes wired, no emailVerified gate in login).

To re-enable in the future:

1) Backend routes
   - Import and mount the router:
     - In `backend/src/app.js` add:
       - `import emailVerificationRouter from "./optional/emailVerification/emailVerification.routes.js";`
       - `app.use("/api/auth", emailVerificationRouter);`

2) Backend auth flow
   - In `backend/src/controllers/auth.controller.js`:
     - During `register` / `adminRegister`, set:
       - `emailVerified: false`
       - `emailVerificationOtp: <generated OTP>`
       - `otpExpiresAt: <expiry date>`
     - In `login` / `adminLogin`, block unverified users:
       - `if (!user.emailVerified) return res.status(403)...`

3) Frontend
   - Re-add the `/verify-email` route and wire registration to navigate there.
   - Reference implementation lives in:
     - `frontend/admin-dashboard/src/optional/emailVerification/VerifyEmail.jsx`
     - `frontend/user-app/src/optional/emailVerification/VerifyEmail.jsx`

