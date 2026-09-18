export const PAYMENT_METHODS = [
  { id: "cash", label: "Cash", subtitle: "Pay partner at pickup", icon: "cash", recommended: true },
  { id: "wallet", label: "Just Order Wallet", subtitle: "Pay from wallet balance", icon: "wallet" },
  { id: "upi", label: "UPI", subtitle: "Google Pay, PhonePe, Paytm", icon: "upi" },
];

export const OFFERS = [
  { id: "o1", title: "Free insurance up to ₹5,000", subtitle: "On all parcel bookings this week", icon: "🛡️" },
  { id: "o2", title: "Zero surge on EV Van", subtitle: "Go green & save on delivery", icon: "⚡" },
  { id: "o3", title: "Refer & earn ₹100", subtitle: "Share Just Order Porter with friends", icon: "🎁" },
];

export const EMERGENCY_CONTACTS = [
  { id: "ec1", name: "Mom", phone: "+91 98765 11111", relation: "Family" },
  { id: "ec2", name: "Office Security", phone: "+91 98765 22222", relation: "Workplace" },
];

export const SOS_OPTIONS = [
  { id: "call_police", label: "Call Police (100)", icon: "🚔", action: "tel:100" },
  { id: "call_ambulance", label: "Call Ambulance (108)", icon: "🚑", action: "tel:108" },
  { id: "share_location", label: "Share live location", icon: "📍", action: "share" },
  { id: "alert_contacts", label: "Alert emergency contacts", icon: "📞", action: "alert" },
  { id: "report_issue", label: "Report safety issue", icon: "⚠️", action: "report" },
];

export const CANCEL_REASONS = [
  "Changed delivery address",
  "Wrong parcel details entered",
  "Found another delivery option",
  "Delivery partner taking too long",
  "Scheduled pickup by mistake",
  "Other reason",
];
