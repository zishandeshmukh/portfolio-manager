import { app, httpServer } from './app';
import { PrismaClient } from '@prisma/client';
import { startMarketDataUpdates } from './services/marketDataService';

const prisma = new PrismaClient();
const PORT = process.env.PORT || 3001;

async function startServer() {
  try {
    // Connect to database
    await prisma.$connect();
    console.log('Connected to PostgreSQL database');
    
    // Start the server
    httpServer.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
    
    // Start market data update service
    startMarketDataUpdates();
    
  } catch (error) {
    console.error('Failed to start server:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await prisma.$disconnect();
  process.exit(0);
});

startServer();