import mongoose from 'mongoose';
import { SellerNotification } from '../models/sellerNotification.model.js';

/**
 * Upsert one seller in-app notification by unique (sellerId, key).
 * Never throws — notification failure must not break the calling action.
 */
export const upsertSellerNotification = async (sellerId, notification = {}) => {
  const id = String(sellerId || '');
  const key = String(notification.key || '').trim();
  const title = String(notification.title || '').trim();
  const message = String(notification.message || '').trim();
  const link = String(notification.link || '').trim();

  if (!mongoose.Types.ObjectId.isValid(id) || !key || !title || !message) return null;

  try {
    const baseMeta =
      notification.metadata && typeof notification.metadata === 'object' && !Array.isArray(notification.metadata)
        ? notification.metadata
        : {};
    const metadata = {
      ...baseMeta,
      ...(link ? { link } : {}),
    };

    const saved = await SellerNotification.findOneAndUpdate(
      { sellerId: new mongoose.Types.ObjectId(id), key },
      {
        $set: {
          type: notification.type || 'system',
          title,
          message,
          metadata,
          isRead: false,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );

    try {
      const { getIO, rooms } = await import('../../../../config/socket.js');
      const io = getIO();
      if (io) {
        io.to(rooms.seller(id)).emit('seller_notification', {
          type: notification.type || 'system',
          title,
          message,
          key,
        });
      }
    } catch (_) {
      /* non-blocking */
    }

    return saved;
  } catch (error) {
    console.error('upsertSellerNotification failed:', error?.message || error);
    return null;
  }
};
