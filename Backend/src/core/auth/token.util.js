import jwt from "jsonwebtoken";
import { config } from "../../config/env.js";

export const signAccessToken = (payload) => {
  return jwt.sign(payload, config.jwtAccessSecret, {
    expiresIn: config.jwtAccessExpiresIn,
  });
};

export const signRefreshToken = (payload) => {
  return jwt.sign(payload, config.jwtRefreshSecret, {
    expiresIn: config.jwtRefreshExpiresIn,
  });
};

/** Short-lived token proving OTP was verified for document re-upload */
export const signDeliveryDocsResubmitToken = (phone) => {
  const normalized = String(phone || "")
    .replace(/\D/g, "")
    .slice(-10);
  return jwt.sign(
    { purpose: "delivery_docs_resubmit", phone: normalized },
    config.jwtAccessSecret,
    { expiresIn: "30m" },
  );
};

export const verifyDeliveryDocsResubmitToken = (token, phone) => {
  if (!token || typeof token !== "string") {
    throw new Error("Resubmit token is required");
  }
  const payload = jwt.verify(token, config.jwtAccessSecret);
  if (payload?.purpose !== "delivery_docs_resubmit") {
    throw new Error("Invalid resubmit token");
  }
  const expected = String(phone || "")
    .replace(/\D/g, "")
    .slice(-10);
  const tokenPhone = String(payload.phone || "")
    .replace(/\D/g, "")
    .slice(-10);
  if (!expected || expected !== tokenPhone) {
    throw new Error("Resubmit token does not match phone");
  }
  return payload;
};

/** Restricted driver token for onboarding/status/resubmit before first approval */
export const signDriverOnboardingToken = (userId) => {
  return jwt.sign(
    {
      userId: String(userId),
      role: "DELIVERY_PARTNER",
      scope: "onboarding",
    },
    config.jwtAccessSecret,
    { expiresIn: config.jwtAccessExpiresIn || "1d" },
  );
};

export const verifyAccessToken = (token) => {
  return jwt.verify(token, config.jwtAccessSecret);
};

export const verifyRefreshToken = (token) => {
  return jwt.verify(token, config.jwtRefreshSecret);
};
