import express from 'express';
import { protect, admin } from '../middlewares/auth.middleware.js';
import { 
    getAdminStats, 
    getAllEvents, 
    getEventVolume,
    getEventDistribution,
    getDashboardStats,
    getRecentActivity,
    getUserEvents,
    getGeoHeatmap,
    getUsageMetrics,
    getUserSecurityInsights,
    getImportedSessionProfile
} from '../controllers/event.controller.js';
import { importFromCollectedLogFolder, importFromUploadedLogFile } from "../controllers/logImport.controller.js";
import { validateDateRangeQuery } from '../middlewares/validation.middleware.js';

const router = express.Router();

/* --- Admin Routes --- */
router.get('/admin/stats', protect, admin, getAdminStats);
router.get('/admin/stats/volume', protect, admin, validateDateRangeQuery, getEventVolume);
router.get('/admin/stats/distribution', protect, admin, getEventDistribution);
router.get('/admin/stats/heatmap', protect, admin, validateDateRangeQuery, getGeoHeatmap);
router.get('/admin/stats/usage', protect, admin, getUsageMetrics);
router.get('/admin/all', protect, admin, validateDateRangeQuery, getAllEvents);
router.get('/admin/import-profile', protect, admin, validateDateRangeQuery, getImportedSessionProfile);
router.post('/admin/import-logfiles', protect, admin, importFromCollectedLogFolder);
router.post('/admin/import-uploaded-log', protect, admin, importFromUploadedLogFile);

/* --- User Dashboard Routes --- */
router.get("/stats", protect, getDashboardStats);
router.get("/recent", protect, getRecentActivity);
router.get("/history", protect, validateDateRangeQuery, getUserEvents);
router.get("/security-insights", protect, getUserSecurityInsights);

export default router;
