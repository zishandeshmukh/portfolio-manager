import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Extend Express Request interface to include user data
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
      };
    }
  }
}

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized - No token provided' });
    }
    
    const token = authHeader.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized - Invalid token format' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as { id: string, email: string };
    
    // Check if user exists in database
    const user = await prisma.user.findUnique({
      where: { id: decoded.id }
    });
    
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized - User not found' });
    }
    
    // Add user data to request object
    req.user = {
      id: decoded.id,
      email: decoded.email
    };
    
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ error: 'Unauthorized - Invalid token' });
    }
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ error: 'Unauthorized - Token expired' });
    }
    return res.status(500).json({ error: 'Server error during authentication' });
  }
};