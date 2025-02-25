import { Server, Socket } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

interface AuthenticatedSocket extends Socket {
  userId?: string;
}

export function setupWebSocketServer(io: Server) {
  // Authentication middleware for Socket.io
  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        return next(new Error('Authentication error: Token required'));
      }
      
      const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as { id: string, email: string };
      
      // Check if user exists in database
      const user = await prisma.user.findUnique({
        where: { id: decoded.id }
      });
      
      if (!user) {
        return next(new Error('Authentication error: User not found'));
      }
      
      // Attach user ID to socket
      socket.userId = decoded.id;
      
      next();
    } catch (error) {
      next(new Error('Authentication error: Invalid token'));
    }
  });
  
  io.on('connection', (socket: AuthenticatedSocket) => {
    console.log(`User connected: ${socket.userId}`);
    
    // Join user-specific room
    if (socket.userId) {
      socket.join(`user:${socket.userId}`);
    }
    
    // Handle subscription to portfolio updates
    socket.on('subscribe:portfolio', (portfolioId: string) => {
      // Verify the user has access to this portfolio before joining the room
      verifyPortfolioAccess(socket.userId!, portfolioId)
        .then(hasAccess => {
          if (hasAccess) {
            socket.join(`portfolio:${portfolioId}`);
            console.log(`User ${socket.userId} subscribed to portfolio ${portfolioId}`);
          } else {
            socket.emit('error', { message: 'Access denied to this portfolio' });
          }
        })
        .catch(error => {
          console.error('Error verifying portfolio access:', error);
          socket.emit('error', { message: 'Server error' });
        });
    });
    
    // Handle unsubscription from portfolio updates
    socket.on('unsubscribe:portfolio', (portfolioId: string) => {
      socket.leave(`portfolio:${portfolioId}`);
      console.log(`User ${socket.userId} unsubscribed from portfolio ${portfolioId}`);
    });
    
    // Handle disconnection
    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.userId}`);
    });
  });
  
  return io;
}

// Helper function to verify user has access to a portfolio
async function verifyPortfolioAccess(userId: string, portfolioId: string): Promise<boolean> {
  try {
    const portfolio = await prisma.portfolio.findFirst({
      where: {
        id: portfolioId,
        userId
      }
    });
    
    return !!portfolio;
  } catch (error) {
    console.error('Error verifying portfolio access:', error);
    return false;
  }
}

// Function to send portfolio update to subscribed clients
export async function emitPortfolioUpdate(portfolioId: string) {
  try {
    const portfolio = await prisma.portfolio.findUnique({
      where: { id: portfolioId },
      include: {
        assets: true
      }
    });
    
    if (portfolio) {
      const io = global.io as Server;
      io.to(`portfolio:${portfolioId}`).emit('portfolio:update', portfolio);
      io.to(`user:${portfolio.userId}`).emit('portfolio:update', portfolio);
    }
  } catch (error) {
    console.error('Error emitting portfolio update:', error);
  }
}

// Function to send notification to a user
export async function sendUserNotification(userId: string, message: string, type: string) {
  try {
    const notification = await prisma.notification.create({
      data: {
        userId,
        message,
        type: type as any,
        read: false
      }
    });
    
    const io = global.io as Server;
    io.to(`user:${userId}`).emit('notification', notification);
    
    return notification;
  } catch (error) {
    console.error('Error sending notification:', error);
    throw error;
  }
}