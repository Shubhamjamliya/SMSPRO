import PolicyPage from "./PolicyPage";

const POLICY_PRIVACY = {
  title: "Privacy Policy",
  updated: "Bike Rent",
  sections: [
    { heading: "Information we use", body: "We use account, booking, location, and payment information to provide Bike Rent services and keep rentals secure." },
    { heading: "How we share it", body: "We share only the information needed with service providers, payment partners, and authorities where required by law." },
  ],
};

const POLICY_TERMS = {
  title: "Terms & Conditions",
  updated: "Bike Rent",
  sections: [
    { heading: "Using Bike Rent", body: "You must provide accurate information, follow local traffic laws, and use each rented bike responsibly." },
    { heading: "Bookings and charges", body: "Rental charges, deposits, and applicable fees are shown before confirmation and may be adjusted for damage or late return." },
  ],
};

const POLICY_REFUND = {
  title: "Refund Policy",
  updated: "Bike Rent",
  sections: [
    { heading: "Eligible refunds", body: "Eligible cancelled bookings and refundable deposits are reviewed after the rental or cancellation is completed." },
    { heading: "Processing time", body: "Approved refunds are returned to the original payment method according to the payment provider's processing timeline." },
  ],
};

export function PrivacyPolicyPage() {
  return <PolicyPage policy={POLICY_PRIVACY} />;
}

export function TermsPage() {
  return <PolicyPage policy={POLICY_TERMS} />;
}

export function RefundPolicyPage() {
  return <PolicyPage policy={POLICY_REFUND} />;
}
