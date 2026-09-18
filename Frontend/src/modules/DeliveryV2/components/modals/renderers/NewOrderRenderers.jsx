import React, { useEffect, useMemo, useState } from 'react';
import { MapPin, ChefHat, Package, Clock, Hash, CreditCard } from 'lucide-react';
import { formatDeliveryAddressText, isMixedOrder, normalizePickupPoints, isReturnPickupTrip, getReturnPickupStopLabels } from '@/modules/DeliveryV2/utils/orderRouting';

const BaseOrderHeader = ({ title, subtitle, badges, earnings, earningsLabel, timeLeft, bgColor = 'bg-[#FF6A00]' }) => (
  <div className={`${bgColor} p-5 flex justify-between items-center text-white border-b border-black/10 shrink-0`}>
    <div className="min-w-0 pr-3">
      <p className="text-white/80 text-[10px] font-bold uppercase tracking-widest mb-0.5">{title}</p>
      {subtitle && (
        <div className="mb-2 inline-flex items-center rounded-full border border-white/30 bg-white/15 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-white">
          {subtitle}
        </div>
      )}
      {badges && badges.map((badge, idx) => (
        <div key={idx} className="mb-2 ml-1 inline-flex items-center rounded-full border border-white/30 bg-white/15 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-white">
          {badge}
        </div>
      ))}
      <h2 className="text-3xl font-extrabold tracking-tight">
        {earningsLabel || `₹${Number(earnings || 0).toFixed(2)}`}
      </h2>
    </div>
    <div className="bg-white/20 border border-white/30 rounded-2xl px-4 py-2 text-white font-bold text-xl shadow-inner tabular-nums shrink-0">
      {timeLeft}s
    </div>
  </div>
);

const formatLeg = (leg) => {
  if (!leg || !Number.isFinite(Number(leg.distanceKm))) return null;
  const km = Number(leg.distanceKm);
  const dist = km >= 1 ? `${km.toFixed(1)} km` : `${Math.round(km * 1000)} m`;
  return leg.durationMinutes ? `${dist} • ${leg.durationMinutes} min` : dist;
};

const formatMoney = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return `₹${n.toFixed(n % 1 === 0 ? 0 : 2)}`;
};

const formatClock = (isoOrDate) => {
  if (!isoOrDate) return null;
  const d = new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
};

function usePrepCountdown(order) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  return useMemo(() => {
    const status = String(order?.orderStatus || order?.status || '').toLowerCase();
    const prepMins = Number(order?.preparationTime);
    const startedAt = order?.preparationStartedAt || order?.updatedAt || order?.createdAt;
    const expectedReadyAt =
      order?.expectedReadyAt ||
      (Number.isFinite(prepMins) && prepMins > 0 && startedAt
        ? new Date(new Date(startedAt).getTime() + prepMins * 60 * 1000).toISOString()
        : null);

    if (status === 'ready_for_pickup' || status === 'ready') {
      return {
        label: 'Ready for Pickup',
        tone: 'ready',
        remainingSec: 0,
        prepMins: Number.isFinite(prepMins) ? prepMins : null,
        readyBy: formatClock(expectedReadyAt) || formatClock(now),
        expectedReadyAt,
      };
    }

    if (!Number.isFinite(prepMins) || prepMins <= 0 || !expectedReadyAt) {
      return {
        label: status === 'preparing' ? 'Preparing' : 'Awaiting kitchen',
        tone: 'preparing',
        remainingSec: null,
        prepMins: Number.isFinite(prepMins) ? prepMins : null,
        readyBy: null,
        expectedReadyAt,
      };
    }

    const remainingSec = Math.floor((new Date(expectedReadyAt).getTime() - now) / 1000);
    if (remainingSec <= 0) {
      return {
        label: 'Delayed',
        tone: 'delayed',
        remainingSec: Math.abs(remainingSec),
        prepMins,
        readyBy: formatClock(expectedReadyAt),
        expectedReadyAt,
        overdue: true,
      };
    }

    return {
      label: 'Preparing',
      tone: 'preparing',
      remainingSec,
      prepMins,
      readyBy: formatClock(expectedReadyAt),
      expectedReadyAt,
      overdue: false,
    };
  }, [order, now]);
}

const formatCountdown = (sec) => {
  if (sec == null || !Number.isFinite(sec)) return '--:--';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

const PrepStatusCard = ({ order }) => {
  const prep = usePrepCountdown(order);
  if (!prep.prepMins && prep.tone !== 'ready') return null;

  const toneClass =
    prep.tone === 'ready'
      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
      : prep.tone === 'delayed'
        ? 'bg-amber-50 border-amber-200 text-amber-900'
        : 'bg-orange-50 border-orange-200 text-[#C2410C]';

  return (
    <div className={`rounded-2xl border p-4 ${toneClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest opacity-70">Kitchen status</p>
          <p className="text-base font-extrabold mt-0.5">{prep.label}</p>
          {prep.prepMins ? (
            <p className="text-xs font-medium mt-1 leading-relaxed">
              Restaurant will prepare this order in {prep.prepMins} minute{prep.prepMins === 1 ? '' : 's'}.
            </p>
          ) : null}
          {prep.readyBy ? (
            <p className="text-xs font-semibold mt-1">
              {prep.overdue ? 'Was ready by' : 'Ready by'} {prep.readyBy}
            </p>
          ) : null}
        </div>
        <div className="text-right shrink-0">
          <p className="text-[10px] font-bold uppercase tracking-widest opacity-70">
            {prep.overdue ? 'Overdue' : 'Countdown'}
          </p>
          <p className="text-2xl font-black tabular-nums mt-0.5">
            {prep.tone === 'ready' ? 'Ready' : formatCountdown(prep.remainingSec)}
          </p>
        </div>
      </div>
    </div>
  );
};

const DetailSection = ({ title, children }) => (
  <div className="rounded-2xl border border-gray-100 bg-white p-4 space-y-2.5">
    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{title}</p>
    {children}
  </div>
);

const DetailRow = ({ icon: Icon, label, value }) => {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2.5">
      {Icon ? <Icon className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" /> : null}
      <div className="min-w-0 flex-1">
        {label ? <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</p> : null}
        <p className="text-sm font-semibold text-gray-900 break-words whitespace-pre-wrap">{value}</p>
      </div>
    </div>
  );
};

const OrderItemsBlock = ({ items = [] }) => {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <DetailSection title="Items">
      <div className="space-y-3">
        {items.map((item, idx) => {
          const variant = item.variantName || item.variant || item.size || '';
          const addons = Array.isArray(item.addons)
            ? item.addons
            : Array.isArray(item.addOns)
              ? item.addOns
              : [];
          const qty = Number(item.quantity || 1);
          const price = Number(item.price || 0);
          return (
            <div key={idx} className="border-b border-gray-50 last:border-0 pb-2 last:pb-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-900 break-words">
                    {qty} × {item.name || 'Item'}
                  </p>
                  {variant ? (
                    <p className="text-[11px] text-gray-500 font-medium mt-0.5">Variant: {variant}</p>
                  ) : null}
                </div>
                <p className="text-sm font-bold text-gray-900 shrink-0">
                  {formatMoney(price * qty) || `₹${price}`}
                </p>
              </div>
              {addons.length > 0 ? (
                <div className="mt-1.5 pl-2 space-y-1 border-l-2 border-gray-100">
                  {addons.map((addon, aIdx) => (
                    <div key={aIdx} className="flex justify-between gap-2 text-[11px] text-gray-600">
                      <span className="break-words">
                        + {addon.name || addon.title || 'Add-on'}
                        {addon.quantity ? ` × ${addon.quantity}` : ''}
                      </span>
                      <span className="shrink-0 font-semibold">
                        {formatMoney(addon.price) || ''}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </DetailSection>
  );
};

const PricingBlock = ({ pricing = {}, total }) => {
  const riderBase = Number(pricing.riderBaseDeliveryFee || 0);
  const deliveryExtra = Number(pricing.deliveryExtraFee || 0);
  const deliveryLine =
    riderBase > 0 && deliveryExtra > 0
      ? `${formatMoney(riderBase)} + ${formatMoney(deliveryExtra)} extra`
      : pricing.deliveryFee ?? pricing.userDeliveryFee;

  const rows = [
    ['Item Subtotal', pricing.subtotal],
    ['Add-on Total', pricing.addonTotal || pricing.addOnTotal],
    ['Coupon Discount', pricing.discount || pricing.couponDiscount],
    ['Packaging', pricing.packagingFee],
    ['Delivery', deliveryLine],
    ['Taxes', pricing.tax],
    ['Platform Fee', pricing.platformFee],
  ];
  const grand = total ?? pricing.total;
  const hasAny = rows.some(([, v]) => Number(v) > 0) || Number(grand) > 0;
  if (!hasAny) return null;

  return (
    <DetailSection title="Pricing">
      <div className="space-y-1.5">
        {rows.map(([label, value]) => {
          const formatted =
            typeof value === 'string' ? value : formatMoney(value);
          if (!formatted || (typeof value !== 'string' && Number(value) === 0)) return null;
          return (
            <div key={label} className="flex justify-between text-xs text-gray-600">
              <span>{label}</span>
              <span className="font-semibold text-gray-900">{formatted}</span>
            </div>
          );
        })}
        {formatMoney(grand) ? (
          <div className="flex justify-between text-sm font-extrabold text-gray-950 pt-2 border-t border-gray-100">
            <span>Grand Total</span>
            <span>{formatMoney(grand)}</span>
          </div>
        ) : null}
      </div>
    </DetailSection>
  );
};

const DistanceGrid = ({ distanceKm, etaMins, pickupLeg, dropLeg, isReturnPickup }) => {
  const pickupText = formatLeg(pickupLeg) || (distanceKm != null ? `${distanceKm} KM • ${etaMins} MIN` : null);
  const dropText = formatLeg(dropLeg);
  const totalKm =
    Number(pickupLeg?.distanceKm || 0) + Number(dropLeg?.distanceKm || 0) ||
    (Number.isFinite(Number(distanceKm)) ? Number(distanceKm) : null);
  const totalMins =
    Number(pickupLeg?.durationMinutes || 0) + Number(dropLeg?.durationMinutes || 0) ||
    (Number.isFinite(Number(etaMins)) ? Number(etaMins) : null);

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 flex items-center gap-3">
        <Clock className="w-4 h-4 text-gray-500 shrink-0" />
        <div className="flex flex-col min-w-0">
          <span className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">
            {isReturnPickup ? 'You → Pickup' : 'You → Restaurant'}
          </span>
          <span className="text-xs font-bold text-gray-900 break-words">
            {pickupText || 'Calculating…'}
          </span>
        </div>
      </div>
      <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 flex items-center gap-3">
        <MapPin className="w-4 h-4 text-gray-400 shrink-0" />
        <div className="flex flex-col min-w-0">
          <span className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">
            {isReturnPickup ? 'Pickup → Drop' : 'Restaurant → Customer'}
          </span>
          <span className="text-xs font-bold text-gray-900 break-words">
            {dropText || 'Calculating…'}
          </span>
        </div>
      </div>
      {(totalKm || totalMins) ? (
        <div className="col-span-2 p-3 bg-[#FF6A00]/5 rounded-xl border border-[#FF6A00]/15 flex items-center justify-between gap-3">
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#C2410C]">Total trip</span>
          <span className="text-sm font-extrabold text-gray-950">
            {Number.isFinite(totalKm) ? `${totalKm.toFixed(1)} km` : '—'}
            {Number.isFinite(totalMins) ? ` • ~${Math.ceil(totalMins)} min` : ''}
          </span>
        </div>
      ) : null}
    </div>
  );
};

const BaseOrderBody = ({
  pickupStops,
  dropPoint,
  customerAddress,
  mapsLink,
  distanceKm,
  etaMins,
  pickupLeg,
  dropLeg,
  isReturnPickup,
  returnLabels,
  pickupIcon: PickupIcon = ChefHat,
  order,
}) => (
  <div className="p-5 space-y-4 overflow-y-auto min-h-0 flex-1">
    <PrepStatusCard order={order} />

    <div className="flex gap-4">
      <div className="flex flex-col items-center gap-1 mt-1.5 py-0.5">
        <div className="w-4 h-4 rounded-full bg-black border-[3px] border-gray-100 shadow-lg" />
        <div className={`w-0.5 ${pickupStops.length > 1 ? 'h-24' : 'h-14'} bg-dashed border-l-2 border-gray-100`} />
        <div className="w-4 h-4 rounded-full bg-blue-500 border-[3px] border-blue-50 shadow-lg shadow-blue-500/20" />
      </div>
      <div className="flex-1 space-y-6 min-w-0">
        <div className="space-y-4">
          {pickupStops.map((pickup, index) => (
            <div key={pickup.id || index}>
              <div className="flex items-center gap-2 mb-1.5 font-bold text-[9px] uppercase tracking-widest text-gray-500">
                <PickupIcon className="w-3.5 h-3.5" />
                <span>{pickupStops.length > 1 ? `Pickup ${index + 1}` : 'Pickup Location'}</span>
              </div>
              <p className="text-gray-950 font-bold text-lg leading-tight break-words">{pickup.sourceName}</p>
              {pickup.outletName && pickup.outletName !== pickup.sourceName ? (
                <p className="text-gray-600 text-xs font-semibold break-words">Outlet: {pickup.outletName}</p>
              ) : null}
              {pickup.phone && <p className="text-gray-600 text-xs font-semibold">{pickup.phone}</p>}
              <p className="text-gray-500 text-xs font-medium leading-relaxed break-words whitespace-pre-wrap">
                {pickup.address}
              </p>
            </div>
          ))}
        </div>
        <div>
          <div className="flex items-center gap-2 mb-1.5 font-bold text-[9px] uppercase tracking-widest text-blue-600">
            <MapPin className="w-3.5 h-3.5" />
            <span>{isReturnPickup ? returnLabels.dropLabel : 'Customer Drop'}</span>
          </div>
          <p className="text-gray-950 font-bold text-lg leading-tight break-words">{dropPoint.name}</p>
          {dropPoint.phone && <p className="text-gray-600 text-xs font-semibold">{dropPoint.phone}</p>}
          <p className="text-gray-500 text-xs font-medium break-words whitespace-pre-wrap">{customerAddress}</p>
          {mapsLink && (
            <a href={mapsLink} target="_blank" rel="noreferrer" className="inline-flex mt-1 text-[9px] font-bold uppercase tracking-widest text-blue-600 hover:text-blue-700">
              Open in Google Maps
            </a>
          )}
        </div>
      </div>
    </div>

    <DistanceGrid
      distanceKm={distanceKm}
      etaMins={etaMins}
      pickupLeg={pickupLeg}
      dropLeg={dropLeg}
      isReturnPickup={isReturnPickup}
    />

    {(order?.note || order?.deliveryInstructions) ? (
      <DetailSection title="Delivery Instructions">
        <p className="text-sm text-gray-800 font-medium break-words whitespace-pre-wrap">
          {order.note || order.deliveryInstructions}
        </p>
      </DetailSection>
    ) : null}

    <DetailSection title="Order Information">
      <DetailRow icon={Hash} label="Order ID" value={order?.orderId || order?.orderMongoId} />
      <DetailRow
        icon={Clock}
        label="Order Time"
        value={
          order?.createdAt
            ? new Date(order.createdAt).toLocaleString('en-GB', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })
            : null
        }
      />
      <DetailRow
        icon={CreditCard}
        label="Payment"
        value={[
          order?.paymentMethod || order?.payment?.method,
          order?.paymentStatus || order?.payment?.status,
        ]
          .filter(Boolean)
          .join(' • ')}
      />
      <DetailRow
        icon={Package}
        label="Delivery Type"
        value={order?.orderType || order?.deliveryType || 'Home Delivery'}
      />
    </DetailSection>

    <OrderItemsBlock items={order?.items} />
    <PricingBlock pricing={order?.pricing || {}} total={order?.total} />
  </div>
);

const FoodOrderRenderer = ({ order, distanceKm, etaMins, pickupLeg, dropLeg, timeLeft }) => {
  const isReturnPickup = isReturnPickupTrip(order);
  const returnLabels = getReturnPickupStopLabels();
  const pickupPoints = normalizePickupPoints(order);
  const riderBase = Number(
    order.riderBaseDeliveryFee ?? order.pricing?.riderBaseDeliveryFee ?? 0,
  );
  const deliveryExtra = Number(
    order.deliveryExtraFee ?? order.pricing?.deliveryExtraFee ?? 0,
  );
  const riderTotal = riderBase + deliveryExtra;
  const earnings =
    riderTotal > 0
      ? riderTotal
      : order.earnings ||
        order.riderEarning ||
        order.tripEarning ||
        order.walletEarning ||
        (order.orderAmount ? order.orderAmount * 0.1 : 0);
  const earningsLabel =
    deliveryExtra > 0 && riderBase > 0
      ? `${formatMoney(riderBase)} + ${formatMoney(deliveryExtra)} extra`
      : null;

  const restaurantName = order?.restaurantName || order?.restaurant_name || order?.restaurantId?.restaurantName || order?.restaurantId?.name || 'Restaurant';
  const outletName = order?.outletName || order?.branchName || restaurantName;
  const restaurantAddress = order?.restaurantAddress || order?.restaurant_address || order?.restaurantId?.location?.address || 'Address not available';
  const restaurantPhone = order?.restaurantPhone || order?.restaurantId?.phone || '';

  const pickupStops = pickupPoints.length ? pickupPoints.map((p) => ({
    ...p,
    sourceName: p.sourceName || restaurantName,
    outletName: p.outletName || outletName,
    phone: p.phone || restaurantPhone,
    address: p.address || restaurantAddress,
  })) : [{
    id: 'food:primary',
    pickupType: 'food',
    sourceName: restaurantName,
    outletName,
    address: restaurantAddress,
    phone: restaurantPhone,
  }];

  const deliveryAddress = order?.deliveryAddress || {};
  const customerName = order?.customerName || order?.userName || deliveryAddress?.name || 'Customer';
  const customerPhone = order?.customerPhone || order?.userPhone || deliveryAddress?.phone || '';
  const customerAddress = formatDeliveryAddressText(deliveryAddress, order.customerAddress || order.customer_address || '') || 'Location not available';

  return (
    <>
      <BaseOrderHeader
        title={isReturnPickup ? (order.tripLabel || 'Return Pickup') : 'Incoming Food Order'}
        subtitle={isReturnPickup ? 'Customer → Seller' : null}
        badges={isMixedOrder(order) ? ['Mixed Order'] : []}
        earnings={earnings}
        earningsLabel={earningsLabel}
        timeLeft={timeLeft}
        bgColor="bg-[#FF6A00]"
      />
      <BaseOrderBody
        order={order}
        pickupStops={pickupStops}
        dropPoint={{
          name: isReturnPickup ? order?.storeName || 'Seller' : customerName,
          phone: isReturnPickup ? order?.storePhone || order?.sellerPhone : customerPhone,
        }}
        customerAddress={customerAddress}
        distanceKm={distanceKm}
        etaMins={etaMins}
        pickupLeg={pickupLeg}
        dropLeg={dropLeg}
        isReturnPickup={isReturnPickup}
        returnLabels={returnLabels}
        pickupIcon={ChefHat}
      />
    </>
  );
};

const QuickCommerceOrderRenderer = ({ order, distanceKm, etaMins, pickupLeg, dropLeg, timeLeft }) => {
  const pickupPoints = normalizePickupPoints(order);
  const earnings = order.earnings || order.riderEarning || order.tripEarning || order.walletEarning || 0;
  const storeName = order?.storeName || order?.sellerName || order?.seller?.shopName || 'Seller Store';
  const storeAddress = order?.storeAddress || order?.sellerAddress || order?.seller?.location?.address || 'Address not available';

  const pickupStops = pickupPoints.length ? pickupPoints : [{
    id: 'quick:primary',
    pickupType: 'quick',
    sourceName: storeName,
    address: storeAddress,
    phone: order?.storePhone || order?.sellerPhone,
  }];

  const deliveryAddress = order?.deliveryAddress || {};
  const customerAddress = formatDeliveryAddressText(deliveryAddress, order.customerAddress || order.customer_address || '') || 'Location not available';

  return (
    <>
      <BaseOrderHeader
        title="Quick Commerce Order"
        earnings={earnings}
        timeLeft={timeLeft}
        bgColor="bg-blue-600"
      />
      <BaseOrderBody
        order={order}
        pickupStops={pickupStops}
        dropPoint={{
          name: order?.customerName || order?.userName || 'Customer Location',
          phone: order?.customerPhone || order?.userPhone,
        }}
        customerAddress={customerAddress}
        distanceKm={distanceKm}
        etaMins={etaMins}
        pickupLeg={pickupLeg}
        dropLeg={dropLeg}
        pickupIcon={Package}
      />
    </>
  );
};

const ParcelOrderRenderer = ({ order, distanceKm, etaMins, pickupLeg, dropLeg, timeLeft }) => {
  const earnings = order.earnings || order.riderEarning || order.tripEarning || order.walletEarning || 0;

  const pickupStops = [{
    id: 'parcel:pickup',
    pickupType: 'parcel',
    sourceName: order?.senderName || 'Sender',
    address: order?.pickupAddress || 'Pickup Address',
    phone: order?.senderPhone,
  }];

  return (
    <>
      <BaseOrderHeader
        title="Parcel Request"
        earnings={earnings}
        timeLeft={timeLeft}
        bgColor="bg-[#10B981]"
      />
      <BaseOrderBody
        order={order}
        pickupStops={pickupStops}
        dropPoint={{
          name: order?.receiverName || 'Receiver',
          phone: order?.receiverPhone,
        }}
        customerAddress={order?.dropAddress || 'Drop Address'}
        distanceKm={distanceKm}
        etaMins={etaMins}
        pickupLeg={pickupLeg}
        dropLeg={dropLeg}
        pickupIcon={Package}
      />
    </>
  );
};

export const RenderNewOrder = (props) => {
  const { order } = props;
  const moduleType = String(order?.module || order?.orderType || order?.serviceType || order?.type || '').toLowerCase();

  if (moduleType === 'parcel') return <ParcelOrderRenderer {...props} />;
  if (moduleType === 'quick' || moduleType === 'quick_commerce') return <QuickCommerceOrderRenderer {...props} />;
  return <FoodOrderRenderer {...props} />;
};
