import express from 'express';
import { 
  getUserPortfolios, 
  getPortfolioById, 
  createPortfolio, 
  updatePortfolio, 
  deletePortfolio,
  addCashToPortfolio,
  withdrawCashFromPortfolio
} from '../controllers/portfolioController';
import { authenticate } from '../middleware/auth';

const router = express.Router();

// All portfolio routes require authentication
router.use(authenticate);

// Portfolio routes
router.get('/', getUserPortfolios);
router.get('/:portfolioId', getPortfolioById);
router.post('/', createPortfolio);
router.put('/:portfolioId', updatePortfolio);
router.delete('/:portfolioId', deletePortfolio);
router.post('/:portfolioId/deposit', addCashToPortfolio);
router.post('/:portfolioId/withdraw', withdrawCashFromPortfolio);

export default router;