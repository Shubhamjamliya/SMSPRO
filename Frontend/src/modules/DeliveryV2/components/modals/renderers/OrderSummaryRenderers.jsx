import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, ArrowRight, Wallet, Star, Package } from 'lucide-react';
import { getFeedEarnings } from '@/modules/DeliveryV2/utils/feedRequestFormatters';
import { isPorterActiveOrder } from '@/modules/DeliveryV2/utils/porterTripFlow';

export const RenderOrderSummary = ({ order, onDone }) => {
  const earnings = getFeedEarnings(order);
  const isPorter = isPorterActiveOrder(order);
  const moduleType = String(
    order?.module || order?.orderType || order?.serviceType || order?.type || order?.jobType || '',
  ).toLowerCase();

  // Default to green (Food)
  let bgColor = 'bg-green-500';
  let textColor = 'text-green-500';
  let btnTextColor = 'text-green-600';
  let referencePrefix = 'FOD';

  if (moduleType === 'taxi' || moduleType === 'ride') {
    bgColor = 'bg-[#FF6A00]';
    textColor = 'text-[#FF6A00]';
    btnTextColor = 'text-[#FF6A00]';
    referencePrefix = 'TXI';
  } else if (isPorter || moduleType === 'parcel' || moduleType === 'porter') {
    bgColor = 'bg-[#2F6BFF]';
    textColor = 'text-[#2F6BFF]';
    btnTextColor = 'text-[#2F6BFF]';
    referencePrefix = 'PAR';
  } else if (moduleType === 'quick' || moduleType === 'quick_commerce') {
    bgColor = 'bg-blue-600';
    textColor = 'text-blue-600';
    btnTextColor = 'text-blue-600';
    referencePrefix = 'QCM';
  }

  const tripRef =
    order?.tripNumber
    || order?.rideNumber
    || order?.orderId
    || order?.displayOrderId
    || `${referencePrefix}-—`;

  const loadingOvertime = Number(order?.fare?.waiting || 0);
  const billableLoadingMin = Number(order?.billableLoadingMin || order?.fare?.billableLoadingMin || 0);
  const fareTotal = Number(order?.fare?.total ?? order?.total ?? 0);
  const paymentMethod = String(order?.payment?.method || order?.paymentMethod || '').toLowerCase();
  const isCash = paymentMethod === 'cash' || paymentMethod === 'cod';

  return (
    <div className={`fixed inset-0 z-[500] ${bgColor} overflow-y-auto`}>
      <div className="flex min-h-full flex-col items-center justify-center p-6 text-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-full max-w-sm"
        >
          <div className="mx-auto mb-8 flex h-24 w-24 items-center justify-center rounded-full bg-white shadow-2xl">
            <CheckCircle className={`h-16 w-16 ${textColor}`} />
          </div>

          <h1 className="mb-2 text-5xl font-bold tracking-tight text-white">Well Done!</h1>
          <p className="mb-10 text-lg text-white/90">
            {isPorter ? 'Parcel delivered successfully.' : 'Trip completed successfully.'}
          </p>

          <div className="mb-8 rounded-3xl border border-white/20 bg-white p-8 text-gray-900 shadow-2xl">
            <div className="mb-2 flex items-center justify-center gap-2">
              <Star className="h-4 w-4 fill-red-400 text-red-400" />
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400">
                Earnings Added
              </p>
              <Star className="h-4 w-4 fill-red-400 text-red-400" />
            </div>

            <p className="mb-4 text-6xl font-bold tracking-tighter text-gray-950">
              ₹{Number(earnings || 0).toFixed(0)}
            </p>

            {isPorter && (loadingOvertime > 0 || billableLoadingMin > 0) ? (
              <div className="mb-4 space-y-1 rounded-2xl bg-[#F8FAFC] px-4 py-3 text-left text-[12px] font-semibold text-[#475569]">
                <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[#94A3B8]">
                  <Package className="h-3.5 w-3.5" />
                  Fare breakdown
                </div>
                <div className="flex justify-between">
                  <span>Trip fare</span>
                  <span>₹{Number(order?.fareEstimateTotal || 0).toFixed(0)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Loading overtime ({billableLoadingMin} min)</span>
                  <span>₹{loadingOvertime.toFixed(0)}</span>
                </div>
                <div className="flex justify-between border-t border-[#E2E8F0] pt-1 font-bold text-[#0F172A]">
                  <span>{isCash ? 'Collected' : 'Total'}</span>
                  <span>₹{fareTotal.toFixed(0)}</span>
                </div>
              </div>
            ) : null}

            <div className="flex items-center justify-center gap-3 rounded-2xl border border-gray-100 bg-gray-50 py-3 text-sm font-bold text-gray-700">
              <Wallet className="h-5 w-5" />
              <span>Transferred to Wallet</span>
            </div>
          </div>

          <button
            type="button"
            onClick={onDone}
            className={`flex h-16 w-full items-center justify-center gap-3 rounded-2xl bg-white text-xl font-bold shadow-xl shadow-black/10 transition-all hover:bg-gray-50 active:scale-95 ${btnTextColor}`}
          >
            Go Back Home <ArrowRight className="h-6 w-6" />
          </button>

          <p className="mt-10 text-[10px] font-bold uppercase tracking-widest text-white/50 opacity-80">
            {isPorter ? 'Trip' : 'Order'} Reference: {tripRef}
          </p>
        </motion.div>
      </div>
    </div>
  );
};
