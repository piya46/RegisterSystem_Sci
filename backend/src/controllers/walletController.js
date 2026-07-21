const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const Wallet = require('../models/wallet');
const Vendor = require('../models/vendor');
const Transaction = require('../models/transaction');
const GuestToken = require('../models/guestToken');
const Participant = require('../models/participant');
const crypto = require('crypto');
const { revealParticipantObject } = require('../utils/fieldEncryption');
const { ensureCertificateVerificationId } = require('../services/certificateVerificationService');
const { buildWalletBalancePayload } = require('../utils/walletResponse');
const { mirrorPaymentStatus } = require('../utils/firestoreMirror');
const { assertParticipantSessionActive, assertParticipantTokenFresh } = require('../utils/participantTokens');

function httpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function extractBearerToken(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim();
}

function hashGuestToken(token) {
  const secret = process.env.SESSION_TOKEN_HASH_SECRET || process.env.JWT_SECRET;
  if (secret) {
    return crypto.createHmac('sha256', secret).update(String(token)).digest('hex');
  }
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function vendorQrSecret() {
  const secret = process.env.VENDOR_QR_SECRET || process.env.SESSION_TOKEN_HASH_SECRET || process.env.JWT_SECRET;
  if (!secret && process.env.NODE_ENV === 'production') {
    throw httpError('Vendor QR secret is not configured', 500);
  }
  return secret || 'dev-vendor-qr-secret';
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function signVendorPayload(payload) {
  return crypto.createHmac('sha256', vendorQrSecret()).update(stableStringify(payload)).digest('base64url');
}

function parseVendorQrCode(raw) {
  const value = String(raw || '').trim();
  if (!value) throw httpError('Vendor QR is required', 400);

  let payload = null;
  try {
    if (value.startsWith('psevent-vendor:')) {
      payload = JSON.parse(Buffer.from(value.slice('psevent-vendor:'.length), 'base64url').toString('utf8'));
    } else if (value.startsWith('{')) {
      payload = JSON.parse(value);
    }
  } catch {
    throw httpError('Vendor QR payload is invalid', 400);
  }

  if (!payload) return { qrCodeId: value, signed: false, menuItemId: null, eventId: null };
  if (payload.type !== 'psevent.vendor' || !payload.qrCodeId || !payload.sig) {
    throw httpError('Vendor QR payload is incomplete', 400);
  }

  const { sig, ...unsignedPayload } = payload;
  const expected = signVendorPayload(unsignedPayload);
  const left = Buffer.from(String(sig));
  const right = Buffer.from(String(expected));
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
    throw httpError('Vendor QR signature is invalid', 403);
  }

  return {
    qrCodeId: String(payload.qrCodeId),
    signed: true,
    menuItemId: payload.menuItemId || null,
    eventId: payload.eventId || null,
    eventYear: payload.eventYear || '',
    payload,
  };
}

function validateIdempotencyKey(raw) {
  if (!raw) return null;
  const value = String(raw).trim();
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(value)) {
    throw httpError('Invalid idempotency key', 400);
  }
  return value;
}

function normalizeIdempotencyKey(req) {
  return validateIdempotencyKey(req.headers['idempotency-key'] || req.body.idempotencyKey);
}

function slipTtlMs() {
  const seconds = Number(process.env.SUCCESS_SLIP_TTL_SECONDS || 180);
  const normalized = Number.isFinite(seconds) ? seconds : 180;
  return Math.min(Math.max(normalized, 30), 300) * 1000;
}

function dayOfYear(date) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 0));
  return Math.floor((date - start) / 86400000);
}

function dailyThemeCode(date = new Date(), eventKey = '') {
  const seed = crypto
    .createHash('sha256')
    .update(`${date.toISOString().slice(0, 10)}:${eventKey}`)
    .digest('hex');
  return `D${dayOfYear(date)}-${seed.slice(0, 4).toUpperCase()}`;
}

function createSlipProof({ walletId, vendorId, amount, eventId, eventYear, idempotencyKey }) {
  const serverTime = new Date();
  const slipNonce = crypto.randomBytes(10).toString('base64url');
  const secret = process.env.SLIP_PROOF_SECRET || process.env.SESSION_TOKEN_HASH_SECRET || process.env.JWT_SECRET || 'dev-slip-proof-secret';
  const verificationCode = crypto
    .createHmac('sha256', secret)
    .update([walletId, vendorId, amount, eventId || eventYear || '', idempotencyKey || '', slipNonce].join(':'))
    .digest('base64url')
    .replace(/[^A-Z0-9]/gi, '')
    .slice(0, 8)
    .toUpperCase();

  return {
    serverTime,
    slipNonce,
    verificationCode,
    slipExpiresAt: new Date(serverTime.getTime() + slipTtlMs()),
    dailyThemeCode: dailyThemeCode(serverTime, eventId || eventYear || ''),
  };
}

function transactionResponse(transaction, vendor = null) {
  return {
    transactionId: transaction._id,
    idempotencyKey: transaction.idempotencyKey || null,
    status: transaction.status,
    remainingBalance: transaction.balanceAfter,
    vendorName: vendor?.name || transaction.vendorId?.name || '',
    amount: transaction.amount,
    paymentMethod: transaction.paymentMethod || 'coins',
    menuItemId: transaction.menuItemId || null,
    menuItemName: transaction.menuItemName || '',
    eventId: transaction.eventId || null,
    eventYear: transaction.eventYear || '',
    slipNonce: transaction.slipNonce || '',
    verificationCode: transaction.verificationCode || '',
    slipExpiresAt: transaction.slipExpiresAt || null,
    dailyThemeCode: transaction.dailyThemeCode || '',
    serverTime: transaction.serverTime || transaction.createdAt,
  };
}

async function participantFromBearer(req) {
  if (req.participant?._id) return req.participant;

  const token = extractBearerToken(req);
  if (!token) return null;
  if (!process.env.JWT_SECRET) throw httpError('Server authentication secret is not configured', 500);

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    throw httpError('Unauthorized: Token expired or invalid', 401);
  }

  const participantId = payload.id || payload.participantId;
  if (!participantId || (payload.role !== 'participant' && !payload.participantId)) {
    throw httpError('Unauthorized: Invalid participant token', 401);
  }

  const participant = await Participant.findById(participantId);
  if (!participant || participant.isDeleted || participant.isRevoked) {
    throw httpError('Unauthorized: Participant not found', 401);
  }
  assertParticipantTokenFresh(participant, payload);
  const participantSession = await assertParticipantSessionActive(participant, payload, token, req);

  req.participant = participant;
  req.participantAuthPayload = payload;
  req.participantSession = participantSession;
  req.participantToken = token;
  return participant;
}

function walletEventFilter(req, participant) {
  const eventId = req.query.eventId || req.body.eventId || req.participantAuthPayload?.eventId || participant?.eventId;
  if (eventId && mongoose.Types.ObjectId.isValid(String(eventId))) {
    return { eventId };
  }
  const eventYear = req.query.eventYear || req.body.eventYear || participant?.eventYear;
  if (eventYear) return { eventYear };
  return {};
}

function explicitEventRequested(req) {
  return Boolean(req.query.eventId || req.body.eventId || req.query.eventYear || req.body.eventYear);
}

function assertSameEvent(wallet, vendor) {
  if (wallet.eventId && vendor.eventId && String(wallet.eventId) !== String(vendor.eventId)) {
    throw httpError('Vendor does not belong to this wallet event', 403);
  }
  if (wallet.eventYear && vendor.eventYear && String(wallet.eventYear) !== String(vendor.eventYear)) {
    throw httpError('Vendor does not belong to this wallet event year', 403);
  }
}

function assertQrEventScope(qrContext, vendor) {
  if (qrContext.eventId && vendor.eventId && String(qrContext.eventId) !== String(vendor.eventId)) {
    throw httpError('Vendor QR does not belong to this event', 403);
  }
  if (qrContext.eventYear && vendor.eventYear && String(qrContext.eventYear) !== String(vendor.eventYear)) {
    throw httpError('Vendor QR does not belong to this event year', 403);
  }
}

async function resolveVendorFromQr(vendorQrCode, session = null) {
  const qrContext = parseVendorQrCode(vendorQrCode);
  const query = Vendor.findOne({ qrCodeId: qrContext.qrCodeId, isActive: true });
  if (session) query.session(session);
  const vendor = await query;
  if (!vendor) throw httpError('Vendor not found or inactive', 404);
  assertQrEventScope(qrContext, vendor);
  return { vendor, qrContext };
}

function resolveVendorPrice(vendor, { amount, paymentMethod = 'coins', menuItemId, qrContext = null, strictAmount = false } = {}) {
  const numericAmount = Number(amount);
  if (paymentMethod !== 'coins') {
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) throw httpError('Invalid payment amount', 400);
    return {
      amount: numericAmount,
      pricingMode: 'coupon',
      menuItemId: menuItemId || null,
      menuItemName: '',
      requiresAmount: true,
    };
  }

  const pricingMode = vendor.pricingMode || 'variable';
  if (pricingMode === 'fixed') {
    const fixedPrice = Number(vendor.fixedPrice);
    if (!Number.isFinite(fixedPrice) || fixedPrice <= 0) throw httpError('Vendor fixed price is not configured', 400);
    if (strictAmount && Number.isFinite(numericAmount) && numericAmount !== fixedPrice) {
      throw httpError('Payment amount does not match vendor fixed price', 400);
    }
    return {
      amount: fixedPrice,
      pricingMode,
      menuItemId: null,
      menuItemName: '',
      requiresAmount: false,
    };
  }

  if (pricingMode === 'menu') {
    const resolvedItemId = menuItemId || qrContext?.menuItemId;
    if (!resolvedItemId) throw httpError('Menu item is required for this vendor', 400);
    const menuItem = (vendor.menuItems || []).find((item) => item.isActive !== false && item.itemId === resolvedItemId);
    if (!menuItem) throw httpError('Menu item not found or inactive', 404);
    if (strictAmount && Number.isFinite(numericAmount) && numericAmount !== menuItem.price) {
      throw httpError('Payment amount does not match menu item price', 400);
    }
    return {
      amount: menuItem.price,
      pricingMode,
      menuItemId: menuItem.itemId,
      menuItemName: menuItem.name,
      requiresAmount: false,
    };
  }

  if (!Number.isFinite(numericAmount) || numericAmount <= 0) throw httpError('Invalid payment amount', 400);
  const minAmount = Number(vendor.minAmount ?? 1);
  const maxAmount = vendor.maxAmount === null || vendor.maxAmount === undefined ? null : Number(vendor.maxAmount);
  if (Number.isFinite(minAmount) && numericAmount < minAmount) throw httpError('Payment amount is below vendor minimum', 400);
  if (Number.isFinite(maxAmount) && maxAmount > 0 && numericAmount > maxAmount) throw httpError('Payment amount is above vendor maximum', 400);
  return {
    amount: numericAmount,
    pricingMode,
    menuItemId: null,
    menuItemName: '',
    requiresAmount: true,
  };
}

// Helper to find wallet based on user/participant or guest token
async function resolveWalletFromRequest(req, session = null) {
  // If request contains guestToken, resolve parent wallet
  const tokenString = req.headers['x-guest-token'] || req.body.guestToken;
  if (tokenString) {
    const tokenHash = hashGuestToken(tokenString);
    const query = GuestToken.findOne({
      isActive: true,
      revokedAt: null,
      $or: [
        { tokenHash },
        { token: tokenString },
      ],
    }).populate('parentWalletId');
    if (session) query.session(session);
    const guestToken = await query;

    if (!guestToken || guestToken.expiresAt < new Date()) {
      throw httpError('Guest token is invalid or expired', 403);
    }
    if (!guestToken.parentWalletId || guestToken.parentWalletId.isActive === false) {
      throw httpError('Wallet is inactive or unavailable', 403);
    }
    return { wallet: guestToken.parentWalletId, guestTokenId: guestToken._id, guestToken };
  }

  // Otherwise resolve from logged in participant
  const participant = await participantFromBearer(req);
  if (!participant?._id) throw httpError('Unauthorized', 401);

  const scopedFilter = walletEventFilter(req, participant);
  const query = Wallet.findOne({
    participantId: participant._id,
    isActive: true,
    ...scopedFilter,
  }).sort({ createdAt: -1 });
  if (session) query.session(session);
  let wallet = await query;
  if (!wallet && !explicitEventRequested(req) && scopedFilter.eventId) {
    const legacyQuery = Wallet.findOne({
      participantId: participant._id,
      eventId: null,
      isActive: true,
    }).sort({ createdAt: -1 });
    if (session) legacyQuery.session(session);
    wallet = await legacyQuery;
  }
  if (!wallet) {
    throw httpError('Wallet not found', 404);
  }

  return { wallet, guestTokenId: null, guestToken: null };
}

async function findPaymentByIdempotency(walletId, idempotencyKey, session = null) {
  if (!idempotencyKey) return null;
  const query = Transaction.findOne({ walletId, idempotencyKey }).populate('vendorId', 'name');
  if (session) query.session(session);
  return query;
}

async function recordGuestSpend(guestToken, amount, session) {
  if (!guestToken?._id) return null;

  const filter = {
    _id: guestToken._id,
    isActive: true,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  };
  if (guestToken.limitAmount !== null && guestToken.limitAmount !== undefined) {
    filter.$expr = { $lte: [{ $add: ['$spentAmount', amount] }, '$limitAmount'] };
  }

  const updatedGuestToken = await GuestToken.findOneAndUpdate(
    filter,
    { $inc: { spentAmount: amount }, $set: { lastUsedAt: new Date() } },
    { new: true, session }
  );
  if (!updatedGuestToken) throw httpError('Guest token limit exceeded or revoked', 403);
  return updatedGuestToken;
}

exports.getWalletBalance = async (req, res) => {
  try {
    const { wallet, guestToken } = await resolveWalletFromRequest(req);
    let participant = null;

    // Guest access never loads or returns the wallet owner's PII.
    if (!guestToken) {
      await wallet.populate({
        path: 'participantId',
        select: '+certificateVerificationId fields status qrCode eventId eventYear checkedInAt isRevoked isDeleted',
        populate: {
          path: 'eventId',
          select: 'name eventYear config branding'
        }
      });
      if (wallet.participantId) {
        participant = revealParticipantObject(wallet.participantId);
        const certificateEnabled = wallet.participantId.eventId?.config?.enabledFeatures?.certificate !== false;
        if (wallet.participantId.status === 'checkedIn' && certificateEnabled && !wallet.participantId.isRevoked) {
          participant.certificateVerificationId = await ensureCertificateVerificationId(wallet.participantId);
        } else {
          delete participant.certificateVerificationId;
        }
      }
    }

    res.json({
      success: true,
      data: buildWalletBalancePayload({ wallet, guestToken, participant }),
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
};

exports.createGuestToken = async (req, res) => {
  try {
    if (!req.participant || !req.participant._id) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const scopedFilter = walletEventFilter(req, req.participant);
    let wallet = await Wallet.findOne({
      participantId: req.participant._id,
      isActive: true,
      ...scopedFilter,
    }).sort({ createdAt: -1 });
    if (!wallet && !explicitEventRequested(req) && scopedFilter.eventId) {
      wallet = await Wallet.findOne({
        participantId: req.participant._id,
        eventId: null,
        isActive: true,
      }).sort({ createdAt: -1 });
    }
    if (!wallet) {
      return res.status(404).json({ success: false, message: 'Wallet not found' });
    }

    const requestedHours = Number(req.body.hoursValid ?? 24);
    const hoursValid = Math.min(Math.max(Number.isFinite(requestedHours) ? requestedHours : 24, 1), 72);
    const requestedLimitAmount = req.body.limitAmount === undefined || req.body.limitAmount === null || req.body.limitAmount === ''
      ? null
      : Number(req.body.limitAmount);
    const limitAmount = Number.isFinite(requestedLimitAmount)
      ? Math.min(Math.max(requestedLimitAmount, 0), wallet.coinBalance)
      : null;

    // Create new token
    const token = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + hoursValid);

    const guestToken = await GuestToken.create({
      parentWalletId: wallet._id,
      tokenHash: hashGuestToken(token),
      limitAmount,
      expiresAt
    });
    const frontendBaseUrl = (process.env.FRONTEND_URL || req.get('origin') || '').replace(/\/+$/, '');

    res.json({
      success: true,
      data: {
        token,
        expiresAt: guestToken.expiresAt,
        limitAmount: guestToken.limitAmount,
        shareUrl: frontendBaseUrl ? `${frontendBaseUrl}/guest-wallet/${token}` : `/guest-wallet/${token}`
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getVendorQuote = async (req, res) => {
  try {
    const { vendorQrCode, paymentMethod = 'coins', menuItemId } = req.query;
    const { vendor, qrContext } = await resolveVendorFromQr(vendorQrCode);
    const menuItems = (vendor.menuItems || [])
      .filter((item) => item.isActive !== false)
      .map((item) => ({ itemId: item.itemId, name: item.name, price: item.price }));

    if ((vendor.pricingMode || 'variable') === 'menu' && paymentMethod === 'coins' && !(menuItemId || qrContext.menuItemId)) {
      return res.json({
        success: true,
        data: {
          vendorQrCode,
          vendorName: vendor.name,
          eventId: vendor.eventId,
          eventYear: vendor.eventYear,
          pricingMode: 'menu',
          amount: null,
          menuItemId: null,
          menuItemName: '',
          requiresAmount: false,
          requiresMenuSelection: true,
          menuItems,
          signed: qrContext.signed,
        }
      });
    }

    const quote = resolveVendorPrice(vendor, {
      amount: req.query.amount,
      paymentMethod,
      menuItemId,
      qrContext,
      strictAmount: false,
    });

    res.json({
      success: true,
      data: {
        vendorQrCode,
        vendorName: vendor.name,
        eventId: vendor.eventId,
        eventYear: vendor.eventYear,
        pricingMode: quote.pricingMode,
        amount: quote.amount,
        menuItemId: quote.menuItemId,
        menuItemName: quote.menuItemName,
        requiresAmount: quote.requiresAmount,
        requiresMenuSelection: false,
        menuItems: quote.pricingMode === 'menu' ? menuItems : [],
        signed: qrContext.signed,
      }
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
};

exports.payToVendor = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  let idempotencyKey = null;
  let resolvedWalletId = null;

  try {
    const { vendorQrCode, amount, paymentMethod = 'coins', couponId, menuItemId } = req.body;
    idempotencyKey = normalizeIdempotencyKey(req);

    if (!idempotencyKey) {
      throw httpError('Idempotency key is required', 400);
    }

    if (!vendorQrCode) {
      throw httpError('Invalid payment parameters', 400);
    }

    const { wallet, guestTokenId, guestToken } = await resolveWalletFromRequest(req, session);
    resolvedWalletId = wallet._id;
    const existingPayment = await findPaymentByIdempotency(wallet._id, idempotencyKey, session);
    if (existingPayment) {
      await session.commitTransaction();
      return res.json({
        success: true,
        message: 'Payment already processed',
        data: transactionResponse(existingPayment, existingPayment.vendorId),
      });
    }

    const { vendor, qrContext } = await resolveVendorFromQr(vendorQrCode, session);
    assertSameEvent(wallet, vendor);
    const price = resolveVendorPrice(vendor, {
      amount,
      paymentMethod,
      menuItemId,
      qrContext,
      strictAmount: true,
    });
    const numericAmount = price.amount;

    let updatedWallet;
    let balanceBefore = wallet.coinBalance;
    let itemBalanceBefore = null;
    let itemBalanceAfter = null;
    if (paymentMethod === 'coins') {
      updatedWallet = await Wallet.findOneAndUpdate(
        { _id: wallet._id, isActive: true, coinBalance: { $gte: numericAmount } },
        { $inc: { coinBalance: -numericAmount } },
        { new: true, session }
      );
      if (!updatedWallet) throw httpError('Insufficient coins', 400);
    } else if (paymentMethod === 'coupon') {
      if (!couponId) throw httpError('Coupon ID is required for coupon payments', 400);
      if (!Number.isInteger(numericAmount)) throw httpError('Coupon amount must be an integer', 400);
      const existingCoupon = wallet.coupons.find(c => c.couponId === couponId);
      itemBalanceBefore = existingCoupon?.quantity ?? null;
      updatedWallet = await Wallet.findOneAndUpdate(
        {
          _id: wallet._id,
          isActive: true,
          coupons: { $elemMatch: { couponId, quantity: { $gte: numericAmount } } },
        },
        { $inc: { 'coupons.$.quantity': -numericAmount } },
        { new: true, session }
      );
      if (!updatedWallet) throw httpError('Insufficient coupons', 400);
      const updatedCoupon = updatedWallet.coupons.find(c => c.couponId === couponId);
      itemBalanceAfter = updatedCoupon?.quantity ?? null;
    } else {
      throw httpError('Invalid payment method', 400);
    }
    if (guestTokenId) {
      await recordGuestSpend(guestToken, numericAmount, session);
    }
    const slipProof = createSlipProof({
      walletId: updatedWallet._id,
      vendorId: vendor._id,
      amount: numericAmount,
      eventId: updatedWallet.eventId,
      eventYear: updatedWallet.eventYear,
      idempotencyKey,
    });

    // Record Transaction
    const transaction = await Transaction.create([{
      walletId: updatedWallet._id,
      guestTokenId,
      vendorId: vendor._id,
      type: 'payment',
      idempotencyKey,
      paymentMethod,
      amount: numericAmount,
      couponId,
      menuItemId: price.menuItemId,
      menuItemName: price.menuItemName,
      status: 'success',
      balanceBefore,
      balanceAfter: updatedWallet.coinBalance,
      itemBalanceBefore,
      itemBalanceAfter,
      serverTime: slipProof.serverTime,
      slipNonce: slipProof.slipNonce,
      verificationCode: slipProof.verificationCode,
      slipExpiresAt: slipProof.slipExpiresAt,
      dailyThemeCode: slipProof.dailyThemeCode,
      eventId: updatedWallet.eventId,
      eventYear: updatedWallet.eventYear
    }], { session });

    await session.commitTransaction();
    mirrorPaymentStatus(transaction[0], vendor).catch((mirrorError) => {
      console.warn('Firestore payment status mirror skipped:', mirrorError.message);
    });

    res.json({
      success: true,
      message: 'Payment successful',
      data: transactionResponse(transaction[0], vendor)
    });

  } catch (err) {
    await session.abortTransaction();
    if (err?.code === 11000 && idempotencyKey && resolvedWalletId) {
      const existingPayment = await findPaymentByIdempotency(resolvedWalletId, idempotencyKey);
      if (existingPayment) {
        return res.json({
          success: true,
          message: 'Payment already processed',
          data: transactionResponse(existingPayment, existingPayment.vendorId),
        });
      }
    }
    const statusCode = err.statusCode || (err.message.includes('Insufficient') ? 400 : 500);
    res.status(statusCode).json({ success: false, message: err.message });
  } finally {
    session.endSession();
  }
};

exports.getPaymentStatus = async (req, res) => {
  try {
    const idempotencyKey = validateIdempotencyKey(req.params.idempotencyKey);
    const { wallet } = await resolveWalletFromRequest(req);
    const transaction = await findPaymentByIdempotency(wallet._id, idempotencyKey);
    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    res.json({
      success: true,
      data: transactionResponse(transaction, transaction.vendorId),
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
};
