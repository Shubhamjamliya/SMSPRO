/**
 * Placeholder profile content for Taxi User — no API wiring.
 */

export const PROFILE_USER = {
  name: "Aman Sharma",
  phone: "+91 98765 43210",
  email: "aman.sharma@example.com",
  initials: "AS",
  photoUrl: null,
  memberSince: "Mar 2025",
};

export const SAVED_ADDRESSES = [
  {
    id: "home",
    label: "Home",
    address: "14, Scheme 54, Vijay Nagar, Indore, MP 452010",
    tag: "Home",
  },
  {
    id: "work",
    label: "Work",
    address: "Crystal IT Park, Khandwa Road, Indore, MP 452020",
    tag: "Work",
  },
  {
    id: "other",
    label: "Parents",
    address: "22, Palasia Square, Indore, MP 452001",
    tag: "Other",
  },
];

export const WALLET_BALANCE = 842.5;

export const WALLET_TRANSACTIONS = [
  {
    id: "t1",
    title: "Ride payment",
    subtitle: "Sedan · JO-TX-94821",
    amount: -149,
    date: "Today, 9:42 AM",
    type: "debit",
  },
  {
    id: "t2",
    title: "Wallet top-up",
    subtitle: "UPI · ****4521",
    amount: 500,
    date: "Yesterday, 7:15 PM",
    type: "credit",
  },
  {
    id: "t3",
    title: "Cashback",
    subtitle: "Save with Wallet offer",
    amount: 25,
    date: "22 Jul, 6:02 PM",
    type: "credit",
  },
  {
    id: "t4",
    title: "Ride payment",
    subtitle: "Auto · JO-TX-93102",
    amount: -67,
    date: "21 Jul, 11:20 AM",
    type: "debit",
  },
];

export const SUBSCRIPTION = {
  planName: "Just Ride Plus",
  priceLabel: "₹99 / month",
  status: "Active",
  renewsOn: "12 Aug 2026",
  benefits: [
    "Priority pickup in peak hours",
    "5% wallet cashback on every ride",
    "Free cancellation once a day",
    "Dedicated support lane",
  ],
  upgrades: [
    { id: "plus", name: "Just Ride Plus", price: "₹99/mo", current: true },
    { id: "pro", name: "Just Ride Pro", price: "₹199/mo", current: false },
    { id: "elite", name: "Just Ride Elite", price: "₹399/mo", current: false },
  ],
};

export const REFERRAL = {
  code: "AMANJO50",
  rewardLabel: "₹50 wallet credit",
  friendReward: "₹30 off first ride",
  invited: 4,
  earned: 200,
};

export const NOTIFICATION_GROUPS = [
  {
    id: "rides",
    title: "Ride Updates",
    items: [
      {
        id: "n1",
        title: "Driver arriving soon",
        body: "Rahul is 3 min away in a white Swift · MP09 AB 1234",
        time: "2 min ago",
        unread: true,
      },
      {
        id: "n2",
        title: "Ride completed",
        body: "You paid ₹149 for your trip to Crystal IT Park.",
        time: "Yesterday",
        unread: false,
      },
    ],
  },
  {
    id: "offers",
    title: "Offers",
    items: [
      {
        id: "n3",
        title: "Weekend promo",
        body: "Use TAXI20 for 20% off up to ₹60 this weekend.",
        time: "3h ago",
        unread: true,
      },
    ],
  },
  {
    id: "payments",
    title: "Payments",
    items: [
      {
        id: "n4",
        title: "Wallet topped up",
        body: "₹500 added successfully via UPI.",
        time: "Yesterday",
        unread: false,
      },
    ],
  },
  {
    id: "system",
    title: "System Notifications",
    items: [
      {
        id: "n5",
        title: "App update available",
        body: "New map improvements and faster booking are ready.",
        time: "2 days ago",
        unread: false,
      },
    ],
  },
];

export const SECURITY_DEVICES = [
  {
    id: "d1",
    name: "Pixel 8 · Indore",
    detail: "This device · Active now",
    current: true,
  },
  {
    id: "d2",
    name: "Chrome · Windows",
    detail: "Last active 3 days ago",
    current: false,
  },
];

export const DELETE_REASONS = [
  "I no longer use taxi rides",
  "Too many notifications",
  "Found a better alternative",
  "Privacy concerns",
  "Other",
];

export const POLICY_PRIVACY = {
  title: "Privacy Policy",
  updated: "Last updated: 1 July 2026",
  sections: [
    {
      heading: "Information we collect",
      body: "We collect account details, ride locations, device identifiers, and payment tokens needed to provide taxi booking and support services.",
    },
    {
      heading: "How we use data",
      body: "Data is used to match drivers, calculate fares, improve safety, prevent fraud, and personalise offers. We do not sell personal data.",
    },
    {
      heading: "Sharing",
      body: "Limited trip details are shared with assigned drivers and, when you request SOS, with emergency contacts or authorities.",
    },
    {
      heading: "Your choices",
      body: "You may update profile data, manage notification preferences, request data export, or delete your account from Profile settings.",
    },
  ],
};

export const POLICY_TERMS = {
  title: "Terms & Conditions",
  updated: "Last updated: 1 July 2026",
  sections: [
    {
      heading: "Service",
      body: "Just Order Taxi connects riders with independent driver partners. Fares, ETAs, and availability are estimates and may change with traffic and demand.",
    },
    {
      heading: "User responsibilities",
      body: "Provide accurate pickup/drop details, treat drivers respectfully, and ensure payment methods are valid. Misuse may lead to suspension.",
    },
    {
      heading: "Cancellations",
      body: "Cancellation fees may apply after a driver accepts and travels toward pickup. Fee amounts are shown before you confirm cancel.",
    },
    {
      heading: "Liability",
      body: "To the extent permitted by law, Just Order is not liable for indirect losses arising from delays, traffic, or third-party driver conduct.",
    },
  ],
};

export const POLICY_REFUND = {
  title: "Refund Policy",
  updated: "Last updated: 1 July 2026",
  sections: [
    {
      heading: "Eligible cases",
      body: "Refunds may be issued for failed payments, duplicate charges, verified driver no-shows, or fare errors confirmed by our team.",
    },
    {
      heading: "Timelines",
      body: "Wallet refunds: usually within 24–48 hours after approval. Original payment method: 3–5 bank working days.",
    },
    {
      heading: "How to request",
      body: "Open Support → Refund Request, share Ride ID and screenshots. Incomplete requests may delay review.",
    },
    {
      heading: "Non-refundable",
      body: "Completed rides used as booked, valid cancellation fees, and promotional credits already redeemed are generally non-refundable.",
    },
  ],
};
