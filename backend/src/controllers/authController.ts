import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';

const prisma = new PrismaClient();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export const register = async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body;
    
    // Validate input
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });
    
    if (existingUser) {
      return res.status(409).json({ error: 'User already exists' });
    }
    
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name: name || null
      }
    });
    
    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET as string,
      { expiresIn: '24h' }
    );
    
    // Return user data without password
    const { password: _, ...userData } = user;
    
    return res.status(201).json({
      message: 'User registered successfully',
      user: userData,
      token
    });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({ error: 'Server error during registration' });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    
    // Validate input
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    // Find user
    const user = await prisma.user.findUnique({
      where: { email }
    });
    
    // Check if user exists and password is correct
    if (!user || !user.password) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const isPasswordValid = await bcrypt.compare(password, user.password);
    
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET as string,
      { expiresIn: '24h' }
    );
    
    // Return user data without password
    const { password: _, ...userData } = user;
    
    return res.status(200).json({
      message: 'Login successful',
      user: userData,
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Server error during login' });
  }
};

export const googleAuth = async (req: Request, res: Response) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ error: 'Google token is required' });
    }
    
    // Verify Google token
    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID
    });
    
    const payload = ticket.getPayload();
    
    if (!payload || !payload.email) {
      return res.status(400).json({ error: 'Invalid Google token' });
    }
    
    // Find or create user
    let user = await prisma.user.findUnique({
      where: { email: payload.email }
    });
    
    if (!user) {
      // Create new user with Google OAuth data
      user = await prisma.user.create({
        data: {
          email: payload.email,
          name: payload.name || null,
          oauth: true,
          oauthProvider: 'google',
          oauthId: payload.sub
        }
      });
    } else if (!user.oauth) {
      // Update existing user with OAuth info
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          oauth: true,
          oauthProvider: 'google',
          oauthId: payload.sub
        }
      });
    }
    
    // Generate JWT token
    const jwtToken = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET as string,
      { expiresIn: '24h' }
    );
    
    // Return user data
    const { password: _, ...userData } = user;
    
    return res.status(200).json({
      message: 'Google authentication successful',
      user: userData,
      token: jwtToken
    });
  } catch (error) {
    console.error('Google auth error:', error);
    return res.status(500).json({ error: 'Server error during Google authentication' });
  }
};

export const getMe = async (req: Request, res: Response) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        riskProfile: true,
        financialGoals: true
      }
    });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Return user data without password
    const { password: _, ...userData } = user;
    
    return res.status(200).json(userData);
  } catch (error) {
    console.error('Get user profile error:', error);
    return res.status(500).json({ error: 'Server error retrieving user profile' });
  }
};