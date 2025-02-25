import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
const prisma = new PrismaClient();

// Get user profile
export const getUserProfile = async (req: Request, res: Response) => {
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
    
    // Remove password from response
    const { password, ...userWithoutPassword } = user;
    
    return res.status(200).json(userWithoutPassword);
  } catch (error) {
    console.error('Get user profile error:', error);
    return res.status(500).json({ error: 'Server error retrieving user profile' });
  }
};

// Update user profile
export const updateUserProfile = async (req: Request, res: Response) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    const { name, email } = req.body;
    
    // Check if email is already in use (if it's being changed)
    if (email) {
      const existingUser = await prisma.user.findFirst({
        where: {
          email,
          id: { not: req.user.id }
        }
      });
      
      if (existingUser) {
        return res.status(409).json({ error: 'Email already in use' });
      }
    }
    
    // Update user
    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        name: name || undefined,
        email: email || undefined
      }
    });
    
    // Remove password from response
    const { password, ...userWithoutPassword } = updatedUser;
    
    return res.status(200).json({
      message: 'Profile updated successfully',
      user: userWithoutPassword
    });
  } catch (error) {
    console.error('Update user profile error:', error);
    return res.status(500).json({ error: 'Server error updating user profile' });
  }
};

// Change password
export const changePassword = async (req: Request, res: Response) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }
    
    // Get user with password
    const user = await prisma.user.findUnique({
      where: { id: req.user.id }
    });
    
    if (!user || !user.password) {
      return res.status(400).json({ error: 'Cannot change password for OAuth users' });
    }
    
    // Verify current password
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    
    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    
    // Update password
    await prisma.user.update({
      where: { id: req.user.id },
      data: { password: hashedPassword }
    });
    
    return res.status(200).json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    return res.status(500).json({ error: 'Server error changing password' });
  }
};

// Update risk profile
export const updateRiskProfile = async (req: Request, res: Response) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    const { 
      riskTolerance, 
      investmentHorizon, 
      monthlyContribution,
      ageRange,
      incomeLevel
    } = req.body;
    
    // Find existing risk profile
    const existingProfile = await prisma.riskProfile.findUnique({
      where: { userId: req.user.id }
    });
    
    let riskProfile;
    
    if (existingProfile) {
      // Update existing profile
      riskProfile = await prisma.riskProfile.update({
        where: { userId: req.user.id },
        data: {
          riskTolerance: riskTolerance || undefined,
          investmentHorizon: investmentHorizon || undefined,
          monthlyContribution: monthlyContribution || undefined,
          ageRange: ageRange || undefined,
          incomeLevel: incomeLevel || undefined
        }
      });
    } else {
      // Create new profile
      riskProfile = await prisma.riskProfile.create({
        data: {
          userId: req.user.id,
          riskTolerance: riskTolerance || 'MODERATE',
          investmentHorizon: investmentHorizon || 5,
          monthlyContribution: monthlyContribution || 0,
          ageRange: ageRange || '30-40',
          incomeLevel: incomeLevel || 'MEDIUM'
        }
      });
    }
    
    return res.status(200).json({
      message: 'Risk profile updated successfully',
      riskProfile
    });
  } catch (error) {
    console.error('Update risk profile error:', error);
    return res.status(500).json({ error: 'Server error updating risk profile' });
  }
};

// Add or update financial goal
export const manageFinancialGoal = async (req: Request, res: Response) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    const { id, name, targetAmount, targetDate, priority, currentAmount } = req.body;
    
    if (!name || !targetAmount || !targetDate) {
      return res.status(400).json({ error: 'Name, target amount, and target date are required' });
    }
    
    let financialGoal;
    
    if (id) {
      // Check if goal exists and belongs to user
      const existingGoal = await prisma.financialGoal.findFirst({
        where: {
          id,
          userId: req.user.id
        }
      });
      
      if (!existingGoal) {
        return res.status(404).json({ error: 'Financial goal not found' });
      }
      
      // Update existing goal
      financialGoal = await prisma.financialGoal.update({
        where: { id },
        data: {
          name,
          targetAmount,
          currentAmount: currentAmount || undefined,
          targetDate: new Date(targetDate),
          priority: priority || undefined
        }
      });
    } else {
      // Create new goal
      financialGoal = await prisma.financialGoal.create({
        data: {
          userId: req.user.id,
          name,
          targetAmount,
          currentAmount: currentAmount || 0,
          targetDate: new Date(targetDate),
          priority: priority || 'MEDIUM'
        }
      });
    }
    
    return res.status(