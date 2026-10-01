const express = require('express');
const router = express.Router();
const {
    loginAdmin,
    getAllAdmins,
    createAdmin,
    deleteAdmin,
    updateAdmin,
    getAllUsers,
    addUser,
    updateUser,
    deleteUser,
    searchUsersByMobile,
    getUserCount,
    sendNotification,
    checkUsername,
    loginAsUser,
    getNotificationTargetCount,
    getTransactions,
    deleteTransaction,
    getCurrentAdmin,
    getDashboardStats
} = require('../controllers/adminController');

const {
    getAdPositions,
    updateAdPosition
} = require('../controllers/adPositionController');
const PromotionPlan = require('../models/PromotionPlan');
const Ad = require('../models/Ad');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { verifyToken, checkPermission } = require('../middleware/auth');
const upload = require('../middleware/upload');

// @route   POST /api/auth/login
// @desc    Admin login
// @access  Public
router.post('/login', loginAdmin);

// @route   GET /api/admins/me
router.get('/me', verifyToken, getCurrentAdmin);
// @route   GET /api/admins/dashboard/stats
router.get('/dashboard/stats', verifyToken, getDashboardStats);


// @route   GET /api/admins
// @desc    Get all admins
router.get('/', verifyToken, checkPermission('Admin Create'), getAllAdmins);

// @route   POST /api/admins
// @desc    Create new admin
router.post('/', verifyToken, checkPermission('Admin Create'), createAdmin);

// @route   DELETE /api/admins/:id
// @desc    Delete admin
router.delete('/:id', verifyToken, checkPermission('Admin Create'), deleteAdmin);

// @route   PUT /api/admins/:id
// @desc    Update admin
router.put('/:id', verifyToken, checkPermission('Admin Create'), updateAdmin);

// User Management Routes (for Admin Panel)
// @route   GET /api/admins/users/search-mobile
router.get('/users/search-mobile', verifyToken, searchUsersByMobile);

// @route   GET /api/admins/users/count
router.get('/users/count', verifyToken, getUserCount);

// @route   GET /api/admins/users
router.get('/users', verifyToken, checkPermission('User'), getAllUsers);

// @route   POST /api/admins/users
router.post('/users', verifyToken, checkPermission('User'), upload.fields([
    { name: 'photo', maxCount: 1 },
    { name: 'storeLogo', maxCount: 1 },
    { name: 'storeBanner', maxCount: 1 }
]), addUser);

// @route   PUT /api/admins/users/:id
router.put('/users/:id', verifyToken, checkPermission('User'), upload.fields([
    { name: 'photo', maxCount: 1 },
    { name: 'storeLogo', maxCount: 1 },
    { name: 'storeBanner', maxCount: 1 }
]), updateUser);

// @route   DELETE /api/admins/users/:id
router.delete('/users/:id', verifyToken, checkPermission('User'), deleteUser);

// @route   POST /api/admins/users/check-username
router.post('/users/check-username', verifyToken, checkUsername);

// @route   POST /api/admins/users/:id/login-as
router.post('/users/:id/login-as', verifyToken, checkPermission('User'), loginAsUser);

// @route   POST /api/admins/notifications/send
router.post('/notifications/send', verifyToken, checkPermission('Notification & Messaging'), sendNotification);

// @route   POST /api/admins/notifications/count
router.post('/notifications/count', verifyToken, checkPermission('Notification & Messaging'), getNotificationTargetCount);

// --- Ad Position Routes ---
// @route   GET /api/admins/ad-positions
router.get('/ad-positions', verifyToken, checkPermission('AD Position (W/A/Q)'), getAdPositions);

// @route   PUT /api/admins/ad-positions/:id
router.put('/ad-positions/:id', verifyToken, checkPermission('AD Position (W/A/Q)'), upload.fields([
    { name: 'imageDesk', maxCount: 1 },
    { name: 'imageMob', maxCount: 1 }
]), updateAdPosition);

// --- Transaction Routes ---
// @route   GET /api/admins/transactions
router.get('/transactions', verifyToken, checkPermission('Transaction Manager'), getTransactions);

// @route   DELETE /api/admins/transactions/:id
router.delete('/transactions/:id', verifyToken, checkPermission('Transaction Manager'), deleteTransaction);

// --- Promotion Plan Routes ---

// GET all promotion plans
router.get('/promotion-plans', verifyToken, checkPermission('Promote Management'), async (req, res) => {
    try {
        const plans = await PromotionPlan.find().sort({ createdAt: -1 });
        res.json(plans);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// POST new promotion plan
router.post('/promotion-plans', verifyToken, checkPermission('Promote Management'), async (req, res) => {
    try {
        const plan = new PromotionPlan(req.body);
        const newPlan = await plan.save();
        res.status(201).json(newPlan);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// PUT update promotion plan
router.put('/promotion-plans/:id', verifyToken, checkPermission('Promote Management'), async (req, res) => {
    try {
        const updatedPlan = await PromotionPlan.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(updatedPlan);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// DELETE promotion plan
router.delete('/promotion-plans/:id', verifyToken, checkPermission('Promote Management'), async (req, res) => {
    try {
        await PromotionPlan.findByIdAndDelete(req.params.id);
        res.json({ message: 'Plan deleted' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// POST manual product promote
router.post('/manual-promote', verifyToken, checkPermission('Promote Management'), async (req, res) => {
    const { productId, amount, runTill, sellerId, isVerifyBadge, level, promoteType, trafficLink, labels } = req.body;
    try {
        const hasProductId = Boolean(productId && String(productId).trim());
        const hasSellerId = Boolean(sellerId && String(sellerId).trim());

        if (!hasProductId && !hasSellerId) {
            return res.status(400).json({ message: 'Either Product ID or Seller ID is required' });
        }

        // Seller verification-only flow (no product promotion side effects)
        if (!hasProductId && hasSellerId) {
            if (isVerifyBadge !== 'Yes' && isVerifyBadge !== 'No') {
                return res.status(400).json({ message: 'Verify Badge Yes/No is required' });
            }

            const user = await User.findById(sellerId);
            if (!user) return res.status(404).json({ message: 'User not found' });

            user.mVerified = isVerifyBadge === 'Yes';
            await user.save();

            // Record Transaction for Seller Verification
            const transaction = new Transaction({
                tnxId: `ADMIN-VERIFY-${Date.now()}`,
                mode: 'Admin',
                sellerId: user._id,
                mobileNumber: user.mobile,
                amount: Number(amount) || 0,
                payType: 'Admin',
                payeeName: user.name,
                item: 'Verify Badge',
                status: 'VALID'
            });
            await transaction.save();

            return res.json({
                success: true,
                message: 'Seller verification updated',
                data: null
            });
        }

        let ad = null;
        if (hasProductId) {
            if (amount === undefined || amount === null || String(amount).trim() === '') {
                return res.status(400).json({ message: 'Amount is required when Product ID is provided' });
            }
            if (!runTill || String(runTill).trim() === '') {
                return res.status(400).json({ message: 'Run Till date is required when Product ID is provided' });
            }

            const budgetNumCheck = Number(amount);
            if (!Number.isFinite(budgetNumCheck) || budgetNumCheck < 0) {
                return res.status(400).json({ message: 'Amount must be a valid number' });
            }

            if (promoteType === 'traffic' && (!trafficLink || String(trafficLink).trim() === '')) {
                return res.status(400).json({ message: 'Traffic link is required for Traffic promotion' });
            }

            ad = await Ad.findById(productId);
            if (!ad) return res.status(404).json({ message: 'Product not found' });

            const originalStatus = ad.status;
            const previousAdType = ad.adType;
            const adOwner = ad.user ? await User.findById(ad.user) : null;
            const isTrusted = adOwner && String(adOwner.merchantTrustStatus || '').trim().toLowerCase() === 'trusted';

            // Carry over remaining budget from a running promotion (top-up behavior)
            let carriedOverBudget = 0;
            try {
                const prevTypeLower = String(previousAdType || '').trim().toLowerCase();
                const now = new Date();
                const prevStartMs = ad.promoteStartDate ? new Date(ad.promoteStartDate).getTime() : NaN;
                const prevDuration = Number(ad.promoteDuration) || 0;
                const prevBudget = Number(ad.promoteBudget) || 0;
                const isRunningPrev = (prevTypeLower === 'promoted' || prevTypeLower === 'processing') &&
                    ad.promoteEndDate &&
                    new Date(ad.promoteEndDate) > now;

                if (isRunningPrev && prevDuration > 0 && prevBudget > 0 && Number.isFinite(prevStartMs)) {
                    const MS_PER_DAY = 24 * 60 * 60 * 1000;
                    const daysElapsed = Math.min(prevDuration, Math.max(1, Math.floor((now.getTime() - prevStartMs) / MS_PER_DAY) + 1));
                    const remainingDays = Math.max(0, prevDuration - daysElapsed);
                    carriedOverBudget = Math.round((prevBudget / prevDuration) * remainingDays);
                }
            } catch (_) {
                carriedOverBudget = 0;
            }

            // Archive previous promotion snapshot (so new promotion starts fresh)
            const prevTypeLower = String(previousAdType || '').trim().toLowerCase();
            if (prevTypeLower === 'promoted' || prevTypeLower === 'processing') {
                ad.promotionHistory = ad.promotionHistory || [];
                ad.promotionHistory.push({
                    startDate: ad.promoteStartDate || ad.createdAt,
                    endDate: ad.promoteEndDate || new Date(),
                    adType: previousAdType,
                    promoteType: ad.promoteType,
                    promoteTag: ad.promoteTag,
                    budget: ad.promoteBudget,
                    targetD: ad.targetD,
                    targetValue: ad.targetValue,
                    views: ad.promotedViews || 0,
                    deliveryCount: ad.promotedDeliveryCount || 0,
                    createdAt: new Date()
                });
            }

            // Update Ad promotion details
            const budgetNum = Number(amount);
            const newBudget = isNaN(budgetNum) ? 0 : budgetNum;
            ad.promoteBudget = Math.max(0, Math.round(newBudget + carriedOverBudget));

            // Set Promote Type and Traffic Link
            if (promoteType) ad.promoteType = promoteType;
            if (promoteType === 'traffic') {
                if (trafficLink) ad.trafficLink = trafficLink;
                ad.trafficButtonType = 'Visit';
            } else {
                ad.trafficLink = undefined;
                ad.trafficButtonType = undefined;
            }

            if (runTill) {
                const parsedRunTill = Number(runTill);
                if (!isNaN(parsedRunTill) && parsedRunTill > 0 && String(runTill).indexOf('-') === -1) {
                    ad.promoteDuration = parsedRunTill;
                    const endDate = new Date();
                    endDate.setDate(endDate.getDate() + parsedRunTill);
                    ad.promoteEndDate = endDate;
                    ad.showTill = endDate;
                } else {
                    const targetDate = new Date(runTill);
                    if (targetDate.toString() !== 'Invalid Date') {
                        targetDate.setHours(23, 59, 59, 999);
                        ad.promoteEndDate = targetDate;
                        ad.showTill = targetDate;

                        const now = new Date();
                        const diffTime = targetDate.getTime() - now.getTime();
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                        ad.promoteDuration = diffDays > 0 ? diffDays : 0;
                    }
                }
            }

            let transactionItem = level || 'Manual Promotion';

            // Handle Level/Label(s)
            const incomingLabels = Array.isArray(labels)
                ? labels
                : (labels ? [labels] : (level ? [level] : []));
            const cleanedLabels = (incomingLabels || [])
                .map(l => (typeof l === 'string' ? l.trim() : String(l || '').trim()))
                .filter(Boolean);

            if (cleanedLabels.length > 0) {
                ad.labels = Array.from(new Set(cleanedLabels));
                transactionItem = cleanedLabels.join(', ');

                const primaryLabel = cleanedLabels[0];
                if (['Urgent', 'Discount', 'Offer', 'Highlights'].includes(primaryLabel)) {
                    ad.promoteTag = primaryLabel;
                } else {
                    if (!ad.features) ad.features = {};
                    ad.features.promoteLabel = primaryLabel;
                }
            }

            // Trust gate: if ad is pause/review and owner is untrusted, keep it in review + processing
            if (['pause', 'review'].includes(originalStatus) && !isTrusted) {
                ad.status = 'review';
                ad.adType = 'Processing';
            } else {
                ad.status = 'active';
                ad.adType = 'Promoted';
            }

            // Start new promotion window + reset counters
            ad.promoteStartDate = new Date();
            ad.promotedViews = 0;
            ad.promotedDeliveryCount = 0;

            // Target calculation (Target/D + total Target Value) in performance units (reach/traffic), not money.
            ad.targetD = '0';
            ad.targetValue = 0;
            if (ad.promoteDuration && ad.promoteDuration > 0 && ad.promoteBudget > 0) {
                const dailyBudget = ad.promoteBudget / ad.promoteDuration;

                let plan = null;
                try {
                    plan = await PromotionPlan.findOne({ categories: ad.category }).sort({ createdAt: -1 });
                    if (!plan) {
                        plan = await PromotionPlan.findOne().sort({ createdAt: -1 });
                    }
                } catch (_) {
                    plan = null;
                }

                if (plan) {
                    const planBaseAmount = Number(plan.amount) || 0;
                    const basePerformance = promoteType === 'traffic'
                        ? (Number(plan.traffic) || 0)
                        : (Number(plan.reach) || 0);
                    const ratio = planBaseAmount > 0 ? (dailyBudget / planBaseAmount) : 0;

                    const dailyTarget = Math.max(0, Math.floor(basePerformance * ratio));
                    const totalTarget = dailyTarget * ad.promoteDuration;

                    ad.targetD = String(dailyTarget);
                    ad.targetValue = totalTarget;

                    // Keep estimatedReach consistent for dashboards (min-max for total period)
                    const gapPercent = parseFloat(String(plan.gapAmount || '0')) || 0;
                    const maxTotal = Math.max(totalTarget, Math.floor(totalTarget * (1 + gapPercent / 100)));
                    if (totalTarget > 0) {
                        ad.estimatedReach = `${totalTarget}-${maxTotal}`;
                    }
                }
            }

            await ad.save();

            // Automatically upgrade user to Premium only when ad is actually Promoted
            if (ad.user && (ad.adType || '').toLowerCase() === 'promoted') {
                await User.findByIdAndUpdate(ad.user, { merchantType: 'Premium' });
                console.log(`✅ User ${ad.user} upgraded to Premium via manual ad promotion`);
            }

            // Record Transaction for Ad Promotion
            const transaction = new Transaction({
                tnxId: `ADMIN-AD-${Date.now()}`,
                mode: 'Admin',
                sellerId: ad.user,
                productId: ad._id,
                mobileNumber: adOwner?.mobile || ad.phone,
                amount: Number(amount) || 0,
                payType: 'Admin',
                payeeName: adOwner?.name || 'Admin',
                item: transactionItem,
                status: 'VALID'
            });
            await transaction.save();
        }

        // Optional seller verification alongside product promotion (no trusted/premium side effects)
        if (hasSellerId && (isVerifyBadge === 'Yes' || isVerifyBadge === 'No')) {
            const user = await User.findById(sellerId);
            if (user) {
                user.mVerified = isVerifyBadge === 'Yes';
                await user.save();

                const transaction = new Transaction({
                    tnxId: `ADMIN-VERIFY-${Date.now()}`,
                    mode: 'Admin',
                    sellerId: user._id,
                    mobileNumber: user.mobile,
                    amount: Number(amount) || 0,
                    payType: 'Admin',
                    payeeName: user.name,
                    item: 'Verify Badge',
                    status: 'VALID'
                });
                await transaction.save();
            }
        }

        res.json({
            success: true,
            message: ad ? 'Ad promoted manually' : 'Seller verification updated',
            data: ad
        });
    } catch (err) {
        console.error("Manual promote error:", err);
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
