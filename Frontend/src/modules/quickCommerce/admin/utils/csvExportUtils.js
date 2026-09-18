export const downloadCsv = (rows, filename) => {
  if (!rows?.length) return false;

  const csv = rows
    .map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return true;
};

export const formatInr = (value) => `Rs. ${Number(value || 0).toFixed(2)}`;

export const formatOrderDate = (value) => {
  if (!value) return 'N/A';
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const isCancelledOrder = (order) => {
  const status = String(order?.status || order?.orderStatus || '').toLowerCase();
  return status.includes('cancel');
};

const isDeliveredOrder = (order) => {
  const status = String(order?.status || order?.orderStatus || '').toLowerCase();
  return status === 'delivered' || status === 'completed';
};

export const getTransactionBreakdown = (order) => {
  const pricing = order?.pricing || {};
  const platformFee = Number(pricing.platformFee || 0);
  const deliveryFee = Number(pricing.deliveryFee || 0);
  const tax = Number(pricing.tax || pricing.gst || 0);
  const handling = Number(pricing.handlingFee || 0);
  const packingFee = Number(
    pricing.packagingFee ||
      order?.earnings?.packingFee ||
      order?.sellerOrder?.pricing?.packingAmount ||
      0,
  );
  const discount = Math.max(
    0,
    Number(pricing.couponDiscount ?? pricing.discount ?? order?.discount ?? 0),
  );
  const couponSource = String(pricing.couponSource || '').trim();
  const subtotal = Number(
    pricing.subtotal ||
      Math.max(
        0,
        Number(order?.amount || order?.total || pricing.total || 0) -
          platformFee -
          deliveryFee -
          tax -
          handling -
          packingFee +
          discount,
      ),
  );

  // What the customer actually paid / owes (bill total).
  const computedUserPaid = Math.max(
    0,
    Number(
      (
        subtotal +
        packingFee +
        deliveryFee +
        platformFee +
        tax +
        handling -
        discount
      ).toFixed(2),
    ),
  );
  const userPaid = Number(
    order?.amount || order?.total || pricing.total || computedUserPaid || 0,
  );

  const sellerCommission = Number(
    order?.earnings?.sellerCommission ??
      pricing.restaurantCommission ??
      order?.sellerOrder?.pricing?.commission ??
      0,
  );
  const cancelled = isCancelledOrder(order);

  const sellerEarned = cancelled
    ? Number(
        order?.earnings?.sellerReceivable ??
          order?.sellerOrder?.pricing?.receivable ??
          0,
      )
    : Number(
        order?.earnings?.sellerReceivable ??
          order?.sellerOrder?.pricing?.receivable ??
          Math.max(0, subtotal - sellerCommission + packingFee),
      );

  const riderEarned = cancelled
    ? 0
    : Number(order?.earnings?.riderEarned ?? order?.riderEarning ?? 0);

  const adminCouponCut =
    !cancelled && couponSource.toLowerCase() === 'admin' ? discount : 0;
  const adminEarned = cancelled
    ? 0
    : Number(
        order?.earnings?.adminEarned ??
          Math.max(0, platformFee + tax + sellerCommission - adminCouponCut),
      );

  const returnInfo = order?.returnInfo || {};
  const hasReturn = Boolean(
    returnInfo.hasReturn || (order?.returnStatus && order.returnStatus !== 'none'),
  );
  const refundToCustomer = Number(returnInfo.refundAmount || 0);
  const refundedToCustomer = Number(returnInfo.refundedAmount || 0);
  const sellerRecovered = Number(returnInfo.sellerRecovered || 0);
  const returnPickupAdminExpense = Number(returnInfo.pickupFeeAdminExpense || 0);

  return {
    userPaid,
    platformFee,
    deliveryFee,
    tax,
    handling,
    packingFee,
    discount,
    couponSource,
    subtotal,
    sellerCommission,
    sellerEarned,
    riderEarned,
    adminEarned,
    cancelled,
    delivered: isDeliveredOrder(order),
    hasReturn,
    returnStatus: returnInfo.returnStatus || order?.returnStatus || '',
    refundStatus: returnInfo.refundStatus || '',
    refundToCustomer,
    refundedToCustomer,
    sellerRecovered,
    returnPickupAdminExpense,
    // Money that actually stayed with each party after the return settled.
    netUserPaid: Math.max(0, userPaid - refundedToCustomer),
    netSellerEarned: Number((sellerEarned - sellerRecovered).toFixed(2)),
    netAdminEarned: Number((adminEarned - returnPickupAdminExpense).toFixed(2)),
  };
};

export const buildTransactionCsvRows = (orders = []) => {
  const headers = [
    'Order ID',
    'Order Date',
    'Customer',
    'Seller',
    'Delivery Boy',
    'User Paid',
    'Subtotal',
    'Packing Fee',
    'Delivery Fee',
    'Platform Fee',
    'Tax/GST',
    'Discount',
    'Discount Source',
    'Seller Commission',
    'Seller Earned',
    'Rider Earned',
    'Admin Earned',
    'Status',
    'Return Status',
    'Refund Status',
    'Refund To Customer',
    'Refund Paid',
    'Recovered From Seller',
    'Return Pickup Cost (Admin)',
    'Net Seller Earned',
    'Net Admin Earned',
  ];

  const rows = orders.map((order) => {
    const breakdown = getTransactionBreakdown(order);
    const status = order.status === 'delivered' ? 'Completed' : (order.status || 'N/A');

    return [
      order.orderId || order.orderNumber || order._id || order.id || '',
      formatOrderDate(order.createdAt),
      order.customer?.name || 'Guest',
      order.storeName || order.seller?.shopName || order.seller?.name || 'Unknown',
      order.deliveryBoy?.name || order.rider?.name || order.dispatch?.rider?.name || 'N/A',
      formatInr(breakdown.userPaid),
      formatInr(breakdown.subtotal),
      formatInr(breakdown.packingFee),
      formatInr(breakdown.deliveryFee),
      formatInr(breakdown.platformFee),
      formatInr(breakdown.tax),
      formatInr(breakdown.discount),
      breakdown.couponSource || '',
      formatInr(breakdown.sellerCommission),
      formatInr(breakdown.sellerEarned),
      formatInr(breakdown.riderEarned),
      formatInr(breakdown.adminEarned),
      status,
      breakdown.hasReturn ? breakdown.returnStatus : '',
      breakdown.hasReturn ? breakdown.refundStatus : '',
      breakdown.hasReturn ? formatInr(breakdown.refundToCustomer) : '',
      breakdown.hasReturn ? formatInr(breakdown.refundedToCustomer) : '',
      breakdown.hasReturn ? formatInr(breakdown.sellerRecovered) : '',
      breakdown.hasReturn ? formatInr(breakdown.returnPickupAdminExpense) : '',
      formatInr(breakdown.netSellerEarned),
      formatInr(breakdown.netAdminEarned),
    ];
  });

  return [headers, ...rows];
};

export const buildCustomerCsvRows = (customers = []) => {
  const headers = [
    'Customer ID',
    'Name',
    'Email',
    'Phone',
    'Status',
    'Total Orders',
    'Total Spend',
    'Last Order',
    'Joined Date',
  ];

  const rows = customers.map((customer) => [
    customer.id || customer._id || '',
    customer.name || '',
    customer.email || '',
    customer.phone || '',
    customer.status || '',
    Number(customer.totalOrders || 0),
    formatInr(customer.totalSpent),
    formatOrderDate(customer.lastOrderDate),
    formatOrderDate(customer.joinedDate),
  ]);

  return [headers, ...rows];
};
