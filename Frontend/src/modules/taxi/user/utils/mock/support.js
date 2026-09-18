/**
 * Placeholder support content for Taxi User — no API wiring.
 */

export const SUPPORT_QUICK_ACTIONS = [
  {
    id: "chat",
    title: "Live Chat",
    description: "Chat with an agent now",
    tone: "orange",
    pathKey: "chat",
  },
  {
    id: "call",
    title: "Call Support",
    description: "Speak to customer care",
    tone: "blue",
    pathKey: "call",
  },
  {
    id: "sos",
    title: "Emergency SOS",
    description: "Get help immediately",
    tone: "red",
    pathKey: "sos",
  },
  {
    id: "email",
    title: "Email Support",
    description: "Write to us anytime",
    tone: "green",
    pathKey: "email",
  },
];

export const SUPPORT_TOPICS = [
  {
    slug: "driver-didnt-arrive",
    title: "Driver Didn't Arrive",
    summary: "Your driver is late or never showed up at the pickup point.",
    icon: "Car",
  },
  {
    slug: "safety-concern",
    title: "Safety Concern",
    summary: "Report unsafe driving, behaviour, or vehicle issues.",
    icon: "Shield",
  },
  {
    slug: "lost-item",
    title: "I Lost an Item",
    summary: "Something was left behind in a recent taxi ride.",
    icon: "Package",
  },
  {
    slug: "payment-failed",
    title: "Payment Failed",
    summary: "Wallet, UPI, or card charge did not go through.",
    icon: "CreditCard",
  },
  {
    slug: "ride-cancellation",
    title: "Ride Cancellation",
    summary: "Questions about cancel fees or driver cancellations.",
    icon: "Ban",
  },
  {
    slug: "wrong-pickup",
    title: "Wrong Pickup Location",
    summary: "Driver went to a different pin than you selected.",
    icon: "MapPin",
  },
  {
    slug: "wrong-drop",
    title: "Wrong Drop Location",
    summary: "You were dropped at the wrong destination.",
    icon: "MapPinned",
  },
  {
    slug: "refund-request",
    title: "Refund Request",
    summary: "Request a refund for a cancelled or incorrect trip.",
    icon: "IndianRupee",
  },
  {
    slug: "promo-issue",
    title: "Promo Code Issue",
    summary: "Coupon not applying or discount missing.",
    icon: "Ticket",
  },
  {
    slug: "account-problem",
    title: "Account Problem",
    summary: "Login, profile, or account access issues.",
    icon: "UserRound",
  },
];

const baseTopicBody = (title) => ({
  explanation: `We're sorry you're facing an issue with “${title}”. Follow the steps below — most cases resolve in a few minutes without waiting on hold.`,
  solutions: [
    "Open Rides → select the trip → check live status and driver details.",
    "Confirm pickup/drop pins match what you intended on the map.",
    "If payment is involved, verify wallet balance or retry with UPI/card.",
    "Still stuck? Start Live Chat with your Ride ID ready.",
  ],
  tips: [
    "Keep screenshots of the fare breakup and map route.",
    "Share the Ride ID — it speeds up resolution dramatically.",
    "For safety issues, use Emergency SOS first, then report here.",
  ],
  faqs: [
    {
      id: "1",
      question: "How long does support take to reply?",
      answer:
        "Live chat agents typically respond within 2–5 minutes during peak hours. Email tickets are answered within 24 hours.",
    },
    {
      id: "2",
      question: "Will I get a refund automatically?",
      answer:
        "Eligible refunds are reviewed case-by-case. Approved amounts usually return to Wallet within 24–48 hours (or to the original payment method in 3–5 days).",
    },
    {
      id: "3",
      question: "Can I reopen a closed ticket?",
      answer:
        "Yes. Open Help Center → your recent tickets, or start a new Live Chat referencing the previous ticket number.",
    },
  ],
});

export const getSupportTopic = (slug) => {
  const topic = SUPPORT_TOPICS.find((t) => t.slug === slug);
  if (!topic) return null;
  return { ...topic, ...baseTopicBody(topic.title) };
};

export const SUPPORT_CONTACT = {
  phone: "+91 1800-123-4567",
  phoneDisplay: "1800-123-4567",
  email: "taxi.support@smspro.in",
  hours: "24×7 · All days",
  hoursDetail: "Peak support: 7:00 AM – 11:00 PM IST",
};

export const HELP_CENTER_GROUPS = [
  {
    id: "booking",
    title: "Booking & rides",
    articles: [
      { id: "a1", title: "How to book a taxi", readMins: 2 },
      { id: "a2", title: "Scheduling a ride for later", readMins: 3 },
      { id: "a3", title: "Changing pickup after booking", readMins: 2 },
    ],
  },
  {
    id: "payments",
    title: "Payments & wallet",
    articles: [
      { id: "a4", title: "Adding money to wallet", readMins: 2 },
      { id: "a5", title: "Understanding fare breakup", readMins: 4 },
      { id: "a6", title: "Applying promo codes", readMins: 2 },
    ],
  },
  {
    id: "safety",
    title: "Safety",
    articles: [
      { id: "a7", title: "Using Emergency SOS", readMins: 3 },
      { id: "a8", title: "Sharing trip status", readMins: 2 },
      { id: "a9", title: "Verified driver checklist", readMins: 3 },
    ],
  },
];

export const SUPPORT_FAQS = [
  {
    id: "f1",
    category: "Rides",
    question: "How do I cancel a ride?",
    answer:
      "Open Active Ride → Cancel. Cancellation fees may apply after the driver has started toward you.",
  },
  {
    id: "f2",
    category: "Rides",
    question: "Can I book for someone else?",
    answer:
      "Yes. Add their phone while booking and share the live tracking link once a driver is assigned.",
  },
  {
    id: "f3",
    category: "Payments",
    question: "Why was I charged twice?",
    answer:
      "Pending UPI holds sometimes reverse automatically. If both succeed, raise a Payment Failed topic with screenshots.",
  },
  {
    id: "f4",
    category: "Payments",
    question: "Where do refunds go?",
    answer:
      "Wallet refunds credit instantly after approval. Card/UPI refunds take 3–5 bank working days.",
  },
  {
    id: "f5",
    category: "Safety",
    question: "What happens when I tap SOS?",
    answer:
      "You can call police/ambulance, share live location with emergency contacts, and alert Just Order safety desk.",
  },
  {
    id: "f6",
    category: "Account",
    question: "How do I update my phone number?",
    answer:
      "Profile → Edit Profile → Phone. OTP verification is required to save the new number.",
  },
];

export const CHAT_THREAD = [
  {
    id: "d1",
    type: "date",
    label: "Today",
  },
  {
    id: "m1",
    type: "agent",
    text: "Hi! Welcome to Just Order Taxi Support. How can we help you today?",
    time: "10:02 AM",
  },
  {
    id: "m2",
    type: "user",
    text: "My driver hasn't arrived yet and it's been 12 minutes.",
    time: "10:03 AM",
  },
  {
    id: "m3",
    type: "agent",
    text: "Sorry about the wait. Could you share your Ride ID from the Rides tab?",
    time: "10:03 AM",
  },
  {
    id: "m4",
    type: "user",
    text: "Ride ID: JO-TX-94821",
    time: "10:04 AM",
  },
  {
    id: "m5",
    type: "agent",
    text: "Thanks. I can see the driver is 400m away stuck in traffic near Ring Road. Would you like me to nudge them or help you reassign?",
    time: "10:05 AM",
  },
  {
    id: "typing",
    type: "typing",
  },
];

export const SOS_ACTIONS = [
  {
    id: "emergency-contact",
    title: "Emergency Contact",
    subtitle: "Call your saved emergency contact",
    tone: "orange",
  },
  {
    id: "police",
    title: "Call Police",
    subtitle: "Dial 112 (placeholder)",
    tone: "red",
  },
  {
    id: "ambulance",
    title: "Call Ambulance",
    subtitle: "Dial 108 (placeholder)",
    tone: "red",
  },
  {
    id: "share",
    title: "Share Live Location",
    subtitle: "Send your pin to trusted contacts",
    tone: "blue",
  },
];

export const SOS_INSTRUCTIONS = [
  "Move to a well-lit, public area if it is safe to do so.",
  "Keep the app open so Live Location can be shared.",
  "Note the vehicle number and driver name from the ride screen.",
  "After calling emergency services, inform Just Order Support via Live Chat.",
];
