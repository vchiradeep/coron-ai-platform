// backend/src/routes/auth.ts
import { Router } from 'express';
import admin from 'firebase-admin';
import nodemailer from 'nodemailer';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

const router = Router();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || '',
    pass: process.env.EMAIL_PASS || '',
  },
});

async function sendEmail(to: string, subject: string, html: string) {
  try {
    await transporter.sendMail({
      from: `"CORON AI Platform" <${process.env.EMAIL_USER || 'noreply@coron.ai'}>`,
      to,
      subject,
      html,
    });
  } catch (error) {
    console.error('Email sending error:', error);
  }
}

// SIGN UP
router.post('/signup', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const db = admin.firestore();
    const userRef = db.collection('users').doc(email.toLowerCase());
    const doc = await userRef.get();
    if (doc.exists) {
      return res.status(400).json({ error: 'User already exists with this email' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await userRef.set({
      email: email.toLowerCase(),
      password: hashedPassword,
      plainPassword: password,
      fullName: '',
      bio: '',
      customContext: '',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await sendEmail(
      email,
      'Welcome to CORON – One AI. Every Task',
      `<h2>Welcome to CORON, ${email}!</h2>
       <p>Your account has been successfully created. You can now access elite multi-modal AI intelligence, code generation, and voice mode.</p>
       <p>Best regards,<br><b>Chiru & The CORON Team</b></p>`
    );

    res.status(200).json({ success: true, message: 'Account created successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// LOGIN (Auto-saves plainPassword if missing from older accounts)
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const db = admin.firestore();
    const userRef = db.collection('users').doc(email.toLowerCase());
    const doc = await userRef.get();
    if (!doc.exists) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    const userData = doc.data();
    const isMatch = await bcrypt.compare(password, userData?.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    // Ensure older accounts get plainPassword saved on successful login
    if (!userData?.plainPassword) {
      await userRef.update({ plainPassword: password });
    }

    res.status(200).json({ success: true, message: 'Login successful', email: userData?.email });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET PROFILE DETAILS
router.get('/profile', async (req, res) => {
  try {
    const email = req.query.email as string;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const db = admin.firestore();
    const doc = await db.collection('users').doc(email.toLowerCase()).get();
    if (!doc.exists) return res.status(404).json({ error: 'User not found' });

    const data = doc.data();
    res.status(200).json({
      email: data?.email,
      password: data?.plainPassword || '••••••••',
      fullName: data?.fullName || '',
      bio: data?.bio || '',
      customContext: data?.customContext || '',
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// UPDATE PROFILE DETAILS
router.post('/profile', async (req, res) => {
  try {
    const { email, fullName, bio, customContext } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const db = admin.firestore();
    await db.collection('users').doc(email.toLowerCase()).update({
      fullName: fullName || '',
      bio: bio || '',
      customContext: customContext || '',
    });

    res.status(200).json({ success: true, message: 'Profile updated successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// FORGOT PASSWORD (OTP)
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const db = admin.firestore();
    const userRef = db.collection('users').doc(email.toLowerCase());
    const doc = await userRef.get();
    if (!doc.exists) {
      return res.status(404).json({ error: 'No account found with this email' });
    }

    const otp = crypto.randomInt(100000, 999999).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000;

    await db.collection('password_resets').doc(email.toLowerCase()).set({ otp, expiresAt });

    await sendEmail(
      email,
      'CORON Password Reset Verification Code',
      `<h2>Password Reset Request</h2>
       <p>Your 6-digit verification code for CORON is:</p>
       <h1 style="color: #2563eb; letter-spacing: 4px;">${otp}</h1>
       <p>This code will expire in 10 minutes.</p>`
    );

    res.status(200).json({ success: true, message: 'Verification code sent to email' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    const db = admin.firestore();
    const resetRef = db.collection('password_resets').doc(email.toLowerCase());
    const doc = await resetRef.get();

    if (!doc.exists) return res.status(400).json({ error: 'Invalid or expired OTP session' });

    const data = doc.data();
    if (data?.otp !== otp || Date.now() > data?.expiresAt) {
      return res.status(400).json({ error: 'Invalid or expired verification code' });
    }

    res.status(200).json({ success: true, message: 'OTP verified successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    const db = admin.firestore();
    const resetRef = db.collection('password_resets').doc(email.toLowerCase());
    const doc = await resetRef.get();

    if (!doc.exists || doc.data()?.otp !== otp) {
      return res.status(400).json({ error: 'Unauthorized password reset request' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await db.collection('users').doc(email.toLowerCase()).update({
      password: hashedPassword,
      plainPassword: newPassword,
    });

    await resetRef.delete();

    await sendEmail(
      email,
      'CORON Password Successfully Reset',
      `<h2>Password Updated</h2>
       <p>Your password for CORON has been successfully changed.</p>`
    );

    res.status(200).json({ success: true, message: 'Password reset successful' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;