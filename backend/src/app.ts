import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import { errorHandler } from './middleware/errorHandler';
import { rateLimit } from 'express-rate-limit';

// Import routes
import authRoutes from './routes/authRoutes';
import portfolioRoutes from './routes/portfolioRoutes';
import assetRoutes from './routes/assetRoutes';
import marketDataRoutes from './routes/marketDataRoutes';
import userRoutes from './routes/userRoutes';
import { setupWebSocketServer } from './services/websocketService';

// Load environment variables
dotenv.config();

// Initialize express app
const app = express();
const httpServer = createServer(app);

// Setup Socket.io
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Initialize WebSocket service
setupWebSocketServer(io);

// Configure middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN,
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Apply rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/portfolios', portfolioRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/market', marketDataRoutes);
app.use('/api/users', userRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use(errorHandler);

export { app, httpServer };