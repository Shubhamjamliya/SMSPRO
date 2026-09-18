/** Fallback taxi fleet when public config has no taxi vehicles mapped yet. */
export const TAXI_VEHICLE_FALLBACK = [
  {
    id: "bike",
    name: "Bike",
    icon: "🏍️",
    tagline: "Beat traffic solo",
    etaMins: 3,
    baseFare: 29,
    category: "economy",
  },
  {
    id: "auto",
    name: "Auto",
    icon: "🛺",
    tagline: "Everyday city rides",
    etaMins: 5,
    baseFare: 49,
    category: "economy",
  },
  {
    id: "mini",
    name: "Mini Cab",
    icon: "🚗",
    tagline: "Affordable hatchbacks",
    etaMins: 6,
    baseFare: 79,
    category: "economy",
  },
  {
    id: "sedan",
    name: "Sedan",
    icon: "🚕",
    tagline: "Comfortable AC rides",
    etaMins: 7,
    baseFare: 99,
    category: "comfort",
  },
  {
    id: "suv",
    name: "SUV",
    icon: "🚙",
    tagline: "Space for the family",
    etaMins: 8,
    baseFare: 149,
    category: "premium",
  },
  {
    id: "premium",
    name: "Premium Cab",
    icon: "✨",
    tagline: "Top-rated chauffeurs",
    etaMins: 9,
    baseFare: 199,
    category: "premium",
  },
  {
    id: "xl",
    name: "XL",
    icon: "🚐",
    tagline: "6–7 seater rides",
    etaMins: 10,
    baseFare: 179,
    category: "xl",
  },
];

export const formatInr = (n) =>
  `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
