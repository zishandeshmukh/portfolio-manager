import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import { io } from '../app';

const prisma = new PrismaClient();

// List of symbols to track (can be expanded or made dynamic)
const TRACKED_SYMBOLS = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'NVDA', 'BTC-USD', 'ETH-USD'
];

// Fetch market data for a single symbol
export async function fetchMarketData(symbol: string) {
  try {
    const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
    const response = await axios.get(
      `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${apiKey}`
    );
    
    if (response.data && response.data['Global Quote'] && response.data['Global Quote']['05. price']) {
      const price = parseFloat(response.data['Global Quote']['05. price']);
      const change = parseFloat(response.data['Global Quote']['09. change'] || '0');
      const changePercent = parseFloat(response.data['Global Quote']['10. change percent'].replace('%', '') || '0');
      
      // Update or create market data in database
      const marketData = await prisma.marketData.upsert({
        where: { symbol },
        update: {
          lastPrice: price,
          change,
          changePercent,
          updatedAt: new Date()
        },
        create: {
          symbol,
          name: symbol, // We could fetch the actual company name in a separate call
          lastPrice: price,
          change,
          changePercent
        }
      });
      
      // Emit updated market data to connected clients
      io.emit('marketUpdate', marketData);
      
      return marketData;
    }
    
    throw new Error(`Invalid data format for symbol ${symbol}`);
  } catch (error) {
    console.error(`Error fetching market data for ${symbol}:`, error);
    throw error;
  }
}

// Fetch market data for all tracked symbols
export async function fetchAllMarketData() {
  try {
    const results = [];
    
    // To avoid API rate limits, fetch one at a time with delay
    for (const symbol of TRACKED_SYMBOLS) {
      try {
        const data = await fetchMarketData(symbol);
        results.push(data);
        
        // Delay to respect API rate limits
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`Error fetching data for ${symbol}:`, error);
      }
    }
    
    return results;
  } catch (error) {
    console.error('Error fetching all market data:', error);
    throw error;
  }
}

// Start periodic market data updates
let updateInterval: NodeJS.Timeout;

export function startMarketDataUpdates() {
  // Clear any existing interval
  if (updateInterval) {
    clearInterval(updateInterval);
  }
  
  // Initial fetch
  fetchAllMarketData()
    .then(() => console.log('Initial market data fetch complete'))
    .catch(error => console.error('Initial market data fetch failed:', error));
  
  // Set up periodic updates (every 5 minutes)
  updateInterval = setInterval(async () => {
    try {
      await fetchAllMarketData();
      console.log('Market data updated successfully');
    } catch (error) {
      console.error('Market data update failed:', error);
    }
  }, 5 * 60 * 1000); // 5 minutes
  
  return updateInterval;
}

// Stop market data updates
export function stopMarketDataUpdates() {
  if (updateInterval) {
    clearInterval(updateInterval);
    console.log('Market data updates stopped');
  }
}