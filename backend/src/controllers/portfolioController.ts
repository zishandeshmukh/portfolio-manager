import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

// Get all portfolios for the authenticated user
export const getUserPortfolios = async (req: Request, res: Response) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    const portfolios = await prisma.portfolio.findMany({
      where: { userId: req.user.id },
      include: {
        assets: true
      }
    });
    
    return res.status(200).json(portfolios);
  } catch (error) {
    console.error('Get portfolios error:', error);
    return res.status(500).json({ error: 'Server error retrieving portfolios' });
  }
};

// Get a single portfolio by ID
export const getPortfolioById = async (req: Request, res: Response) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    const { portfolioId } = req.params;
    
    const portfolio = await prisma.portfolio.findFirst({
      where: {
        id: portfolioId,
        userId: req.user.id
      },
      include: {
        assets: true,
        transactions: {
          orderBy: {
            timestamp: 'desc'
          },
          take: 20
        }
      }
    });
    
    if (!portfolio) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }
    
    return res.status(200).json(portfolio);
  } catch (error) {
    console.error('Get portfolio error:', error);
    return res.status(500).json({ error: 'Server error retrieving portfolio' });
  }
};

// Create a new portfolio
export const createPortfolio = async (req: Request, res: Response) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    const { name, description, cash } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Portfolio name is required' });
    }
    
    const newPortfolio = await prisma.portfolio.create({
      data: {
        name,
        description: description || null,
        cash: cash || 0,
        totalValue: cash || 0,
        userId: req.user.id
      }
    });
    
    // If initial cash is provided, create a deposit transaction
    if (cash && cash > 0) {
      await prisma.transaction.create({
        data: {
          type: 'DEPOSIT',
          quantity: 1,
          price: cash,
          totalAmount: cash,
          userId: req.user.id,
          portfolioId: newPortfolio.id
        }
      });
    }
    
    return res.status(201).json(newPortfolio);
  } catch (error) {
    console.error('Create portfolio error:', error);
    return res.status(500).json({ error: 'Server error creating portfolio' });
  }
};

// Update a portfolio
export const updatePortfolio = async (req: Request, res: Response) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    const { portfolioId } = req.params;
    const { name, description } = req.body;
    
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
    
    // Update portfolio
    const updatedPortfolio = await prisma.portfolio.update({
      where: { id: portfolioId },
      data: {
        name: name || undefined,
        description: description !== undefined ? description : undefined
      }
    });
    
    return res.status(200).json(updatedPortfolio);
  } catch (error) {
    console.error('Update portfolio error:', error);
    return res.status(500).json({ error: 'Server error updating portfolio' });
  }
};

// Delete a portfolio
export const deletePortfolio = async (req: Request, res: Response) => {
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
    
    // Delete portfolio
    await prisma.portfolio.delete({
      where: { id: portfolioId }
    });
    
    return res.status(200).json({ message: 'Portfolio deleted successfully' });
  } catch (error) {
    console.error('Delete portfolio error:', error);
    return res.status(500).json({ error: 'Server error deleting portfolio' });
  }
};

// Add cash to portfolio
export const addCashToPortfolio = async (req: Request, res: Response) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    const { portfolioId } = req.params;
    const { amount } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valid amount is required' });
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
    
    // Update portfolio cash and total value
    const updatedPortfolio = await prisma.portfolio.update({
      where: { id: portfolioId },
      data: {
        cash: { increment: amount },
        totalValue: { increment: amount }
      }
    });
    
    // Create deposit transaction
    await prisma.transaction.create({
      data: {
        type: 'DEPOSIT',
        quantity: 1,
        price: amount,
        totalAmount: amount,
        userId: req.user.id,
        portfolioId
      }
    });
    
    return res.status(200).json(updatedPortfolio);
  } catch (error) {
    console.error('Add cash error:', error);
    return res.status(500).json({ error: 'Server error adding cash' });
  }
};

// Withdraw cash from portfolio
export const withdrawCashFromPortfolio = async (req: Request, res: Response) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    const { portfolioId } = req.params;
    const { amount } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valid amount is required' });
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
    
    if (portfolio.cash < amount) {
      return res.status(400).json({ error: 'Insufficient cash balance' });
    }
    
    // Update portfolio cash and total value
    const updatedPortfolio = await prisma.portfolio.update({
      where: { id: portfolioId },
      data: {
        cash: { decrement: amount },
        totalValue: { decrement: amount }
      }
    });
    
    // Create withdrawal transaction
    await prisma.transaction.create({
      data: {
        type: 'WITHDRAWAL',
        quantity: 1,
        price: amount,
        totalAmount: amount,
        userId: req.user.id,
        portfolioId
      }
    });
    
    return res.status(200).json(updatedPortfolio);
  } catch (error) {
    console.error('Withdraw cash error:', error);
    return res.status(500).json({ error: 'Server error withdrawing cash' });
  }
};