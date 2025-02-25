import express from 'express';
import {
  buyAsset,
  sellAsset,
  updateAssetPrices,
  getPortfolioAssets,
  getAssetDetails
} from '../controllers/assetController';
import { authenticate } from '../middleware/auth';

const router = express.Router();

// All asset routes require authentication
router.use(authenticate);

// Asset routes
router.post('/portfolios/:portfolioId/buy', buyAsset);
router.post('/portfolios/:portfolioId/assets/:assetId/sell', sellAsset);
router.put('/portfolios/:portfolioId/update-prices', updateAssetPrices);
router.get('/portfolios/:portfolioId/assets', getPortfolioAssets);
router.get('/portfolios/:portfolioId/assets/:assetId', getAssetDetails);

export default router;