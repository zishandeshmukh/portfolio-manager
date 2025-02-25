import { Request, Response } from 'express';
import { PrismaClient, AssetType } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

// Get current market data for a symbol
async function getMarketPrice(symbol: string): Promise<number> {
  try {
    // First check if we have recent market data in our database
    const marketData = await prisma.marketData.findUnique({
      where: { symbol }
    });
    
    // If we have data that's less than 5 minutes old, use it
    if (marketData && Date.now() - marketData.updatedAt.getTime() < 5 * 60 * 1000) {
      return marketData.lastPrice;
    }
    
    // Otherwise, fetch from external API (Alpha Vantage in this example)
    const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
    const response = await axios.get(
      `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${apiKey}`
    );
    
    if (response.data && response.data['Global Quote'] && response.data['Global Quote']['05. price']) {
      const price = parseFloat(response.data['Global Quote']['05. price']);
      
      // Update or create market data in our database
      await prisma.marketData.upsert({
        where: { symbol },
        update: {
          lastPrice: price,
          change: parseFloat(response.data['Global Quote']['09. change'] || '0'),
          changePercent: parseFloat(response.data['Global Quote']['10. change percent'].replace('%', '') || '0'),
          updatedAt: new Date()
        },
        create: {
          symbol,
          name: symbol, // We could fetch the actual name in a separate call
          lastPrice: price,
          change: parseFloat(response.data['Global Quote']['09. change'] || '0'),
          changePercent: parseFloat(response.data['Global Quote']['10. change percent'].replace('%', '') || '0')
        }
      });
      
      return price;
    }
    
    // If we can't get current data, return the last known price or throw an error
    if (marketData) {
      return marketData.lastPrice;
    }
    
    throw new Error('Could not retrieve market price');
  } catch (error) {
    console.error(`Error fetching market price for ${symbol}:`, error);
    throw error;
  }
}

// Buy an asset
export const buyAsset = async (req: Request, res: Response) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    const { portfolioId } = req.params;
    const { symbol, name, type, quantity, price } = req.body;
    
    // Validate input
    if (!symbol || !type || !quantity || quantity <= 0) {
      return res.status(400).json({ error: 'Symbol, type, and positive quantity are required' });
    }
    
    // Check if portfolio exists and belongs to user
    const portfolio = await prisma.portfolio.findFirst({
      where: {
        id: portfolioId,
        userId: req.user.id
      }
    });
    
    if (!portfolio) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }
    
    // Get current market price if not provided
    let currentPrice = price;
    if (!currentPrice) {
      try {
        currentPrice = await getMarketPrice(symbol);
      } catch (error) {
        return res.status(400).json({ error: 'Could not retrieve market price. Please provide a price.' });
      }
    }
    
    const totalCost = currentPrice * quantity;
    
    // Check if portfolio has enough cash
    if (portfolio.cash < totalCost) {
      return res.status(400).json({ error: 'Insufficient cash in portfolio' });
    }
    
    // Find if asset already exists in portfolio
    const existingAsset = await prisma.asset.findFirst({
      where: {
        portfolioId,
        symbol
      }
    });
    
    // Start a transaction to ensure data consistency
    const result = await prisma.$transaction(async (prisma) => {
      let asset;
      
      if (existingAsset) {
        // Update existing asset
        const newTotalCost = existingAsset.purchasePrice * existingAsset.quantity + totalCost;
        const newTotalQuantity = existingAsset.quantity + quantity;
        const newAveragePrice = newTotalCost / newTotalQuantity;
        
        asset = await prisma.asset.update({
          where: { id: existingAsset.id },
          data: {
            quantity: newTotalQuantity,
            purchasePrice: newAveragePrice,
            currentPrice
          }
        });
      } else {
        // Create new asset
        asset = await prisma.asset.create({
          data: {
            symbol,
            name: name || symbol,
            type: type as AssetType,
            quantity,
            purchasePrice: currentPrice,
            currentPrice,
            portfolioId
          }
        });
      }
      
      // Update portfolio cash and total value
      const updatedPortfolio = await prisma.portfolio.update({
        where: { id: portfolioId },
        data: {
          cash: { decrement: totalCost }
          // Total value remains the same as we're converting cash to asset
        }
      });
      
      // Create transaction record
      const transaction = await prisma.transaction.create({
        data: {
          type: 'BUY',
          quantity,
          price: currentPrice,
          totalAmount: totalCost,
          userId: req.user!.id,
          portfolioId,
          assetId: asset.id
        }
      });
      
      return { asset, portfolio: updatedPortfolio, transaction };
    });
    
    return res.status(200).json(result);
  } catch (error) {
    console.error('Buy asset error:', error);
    return res.status(500).json({ error: 'Server error buying asset' });
  }
};

// Sell an asset
export const sellAsset = async (req: Request, res: Response) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    const { portfolioId, assetId } = req.params;
    const { quantity, price } = req.body;
    
    // Validate input
    if (!quantity || quantity <= 0) {
      return res.status(400).json({ error: 'Positive quantity is required' });
    }
    
    // Check if portfolio exists and belongs to user
    const portfolio = await prisma.portfolio.findFirst({
      where: {
        id: portfolioId,
        userId: req.user.id
      }
    });
    
    if (!portfolio) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }
    
    // Check if asset exists in portfolio
    const asset = await prisma.asset.findFirst({
      where: {
        id: assetId,
        portfolioId
      }
    });
    
    if (!asset) {
      return res.status(404).json({ error: 'Asset not found in portfolio' });
    }
    
    // Check if user has enough of the asset to sell
    if (asset.quantity < quantity) {
      return res.status(400).json({ error: 'Insufficient asset quantity' });
    }
    
    // Get current market price if not provided
    let currentPrice = price;
    if (!currentPrice) {
      try {
        currentPrice = await getMarketPrice(asset.symbol);
      } catch (error) {
        return res.status(400).json({ error: 'Could not retrieve market price. Please provide a price.' });
      }
    }
    
    const totalAmount = currentPrice * quantity;
    
    // Start a transaction to ensure data consistency
    const result = await prisma.$transaction(async (prisma) => {
      let updatedAsset;
      
      if (asset.quantity === quantity) {
        // If selling all, delete the asset
        await prisma.asset.delete({
          where: { id: assetId }
        });
        updatedAsset = { ...asset, quantity: 0 };
      } else {
        // If selling part, update the asset
        updatedAsset = await prisma.asset.update({
          where: { id: assetId },
          data: {
            quantity: { decrement: quantity },
            currentPrice
          }
        });
      }
      
      // Update portfolio cash
      const updatedPortfolio = await prisma.portfolio.update({
        where: { id: portfolioId },
        data: {
          cash: { increment: totalAmount }
          // Total value remains the same as we're converting asset to cash
        }
      });
      
      // Create transaction record
      const transaction = await prisma.transaction.create({
        data: {
          type: 'SELL',
          quantity,
          price: currentPrice,
          totalAmount,
          userId: req.user!.id,
          portfolioId,
          assetId
        }
      });
      
      return { asset: updatedAsset, portfolio: updatedPortfolio, transaction };
    });
    
    return res.status(200).json(result);
  } catch (error) {
    console.error('Sell asset error:', error);
    return res.status(500).json({ error: 'Server error selling asset' });
  }
};

// Update asset prices
export const updateAssetPrices = async (req: Request, res: Response) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    const { portfolioId } = req.params;
    
    // Check if portfolio exists and belongs to user
    const portfolio = await prisma.portfolio.findFirst({
      where: {
        id: portfolioId,
        userId: req.user.id
      },
      include: {
        assets: true
      }
    });
    
    if (!portfolio) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }
    
    // Update prices for all assets in portfolio
    const updatedAssets = await Promise.all(
      portfolio.assets.map(async (asset) => {
        try {
          const currentPrice = await getMarketPrice(asset.symbol);
          
          return await prisma.asset.update({
            where: { id: asset.id },
            data: { currentPrice }
          });
        } catch (error) {
          console.error(`Error updating price for ${asset.symbol}:`, error);
          return asset; // Return unchanged if update fails
        }
      })
    );
    
    // Calculate new total portfolio value
    const assetValue = updatedAssets.reduce(
      (sum, asset) => sum + asset.currentPrice * asset.quantity, 
      0
    );
    const totalValue = assetValue + portfolio.cash;
    
    // Update portfolio total value
    const updatedPortfolio = await prisma.portfolio.update({
      where: { id: portfolioId },
      data: { totalValue }
    });
    
    return res.status(200).json({
      portfolio: updatedPortfolio,
      assets: updatedAssets
    });
  } catch (error) {
    console.error('Update asset prices error:', error);
    return res.status(500).json({ error: 'Server error updating asset prices' });
  }
};

// Get all assets in a portfolio
export const getPortfolioAssets = async (req: Request, res: Response) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    const { portfolioId } = req.params;
    
    // Check if portfolio exists and belongs to user
    const portfolio = await prisma.portfolio.findFirst({
      where: {
        id: portfolioId,
        userId: req.user.id
      }
    });
    
    if (!portfolio) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }
    
    // Get all assets in portfolio
    const assets = await prisma.asset.findMany({
      where: { portfolioId }
    });
    
    return res.status(200).json(assets);
  } catch (error) {
    console.error('Get portfolio assets error:', error);
    return res.status(500).json({ error: 'Server error retrieving assets' });
  }
};

// Get asset details
export const getAssetDetails = async (req: Request, res: Response) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    const { portfolioId, assetId } = req.params;
    
    // Check if portfolio exists and belongs to user
    const portfolio = await prisma.portfolio.findFirst({
      where: {
        id: portfolioId,
        userId: req.user.id
      }
    });
    
    if (!portfolio) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }
    
    // Get asset details
    const asset = await prisma.asset.findFirst({
      where: {
        id: assetId,
        portfolioId
      }
    });
    
    if (!asset) {
      return res.status(404).json({ error: 'Asset not found' });
    }
    
    // Get asset transactions
    const transactions = await prisma.transaction.findMany({
      where: {
        assetId,
        portfolioId
      },
      orderBy: {
        timestamp: 'desc'
      }
    });
    
    return res.status(200).json({
      asset,
      transactions
    });
  } catch (error) {
    console.error('Get asset details error:', error);
    return res.status(500).json({ error: 'Server error retrieving asset details' });
  }
};