import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { fetchMarketData, fetchAllMarketData } from '../services/marketDataService';

const prisma = new PrismaClient();

// Get all market data
export const getAllMarketData = async (req: Request, res: Response) => {
  try {
    const marketData = await prisma.marketData.findMany({
      orderBy: { symbol: 'asc' }
    });
    
    return res.status(200).json(marketData);
  } catch (error) {
    console.error('Get market data error:', error);
    return res.status(500).json({ error: 'Server error retrieving market data' });
  }
};

// Get market data for a specific symbol
export const getMarketDataBySymbol = async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    
    const marketData = await prisma.marketData.findUnique({
      where: { symbol }
    });
    
    if (!marketData) {
      return res.status(404).json({ error: 'Market data not found for symbol' });
    }
    
    return res.status(200).json(marketData);
  } catch (error) {
    console.error('Get market data error:', error);
    return res.status(500).json({ error: 'Server error retrieving market data' });
  }
};

// Trigger an immediate refresh of market data
export const refreshMarketData = async (req: Request, res: Response) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    // Check if the user has admin privileges (optional)
    // This could be a premium feature or admin-only feature
    
    // Trigger a market data update
    const result = await fetchAllMarketData();
    
    return res.status(200).json({ 
      message: 'Market data refresh initiated', 
      updatedSymbols: result.length 
    });
  } catch (error) {
    console.error('Refresh market data error:', error);
    return res.status(500).json({ error: 'Server error refreshing market data' });
  }
};

// Get market data for a list of symbols
export const getMarketDataForSymbols = async (req: Request, res: Response) => {
  try {
    const { symbols } = req.body;
    
    if (!symbols || !Array.isArray(symbols)) {
      return res.status(400).json({ error: 'Valid symbols array is required' });
    }
    
    const marketData = await prisma.marketData.findMany({
      where: {
        symbol: { in: symbols }
      }
    });
    
    return res.status(200).json(marketData);
  } catch (error) {
    console.error('Get market data error:', error);
    return res.status(500).json({ error: 'Server error retrieving market data' });
  }
};

// Search for market data by symbol or name
export const searchMarketData = async (req: Request, res: Response) => {
  try {
    const { query } = req.query;
    
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Valid search query is required' });
    }
    
    const marketData = await prisma.marketData.findMany({
      where: {
        OR: [
          { symbol: { contains: query, mode: 'insensitive' } },
          { name: { contains: query, mode: 'insensitive' } }
        ]
      },
      take: 10
    });
    
    return res.status(200).json(marketData);
  } catch (error) {
    console.error('Search market data error:', error);
    return res.status(500).json({ error: 'Server error searching market data' });
  }
};