import express from 'express';
import { register, login, googleAuth, getMe } from '../controllers/authController';
import { authenticate } from '../middleware/auth';

const router = express.Router();

// Public routes
router.post('/register', register);
router.post('/login', login);
router.post('/google', googleAuth);

// Protected routes
router.get('/me', authenticate, getMe);

export default router;