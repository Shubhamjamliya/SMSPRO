const names = ["Aarav Malhotra", "Isha Kapoor", "Rohan Desai", "Priya Nair", "Kabir Bhatia", "Sneha Kulkarni", "Dev Chawla", "Ananya Iyer", "Arjun Saxena", "Meera Pillai", "Yash Trivedi", "Nidhi Agarwal", "Vihaan Rathore", "Kiara Menon", "Aditya Bose"];
const zones = ["Vijay Nagar", "Palasia", "Rajwada", "Bhawarkua", "MR-10", "Sudama Nagar", "Rau", "Khajrana"];

function makeCustomer(index) {
  const name = names[index % names.length];
  return {
    id: `TXC-${String(700 + index).padStart(3, "0")}`,
    photo: `https://api.dicebear.com/7.x/initials/svg?seed=customer${index}&backgroundColor=93c5fd`,
    name,
    phone: `+91 99${String(30000000 + index * 199).slice(0, 8)}`,
    email: `${name.toLowerCase().replace(/\s+/g, ".")}@mail.local`,
    zone: zones[index % zones.length],
    totalRides: 4 + index * 3,
    totalSpend: 800 + index * 470,
    avgRating: (4.0 + (index % 10) * 0.1).toFixed(1),
    walletBalance: (index % 4) * 150,
    status: index % 9 === 7 ? "blocked" : "active",
    joinedAt: `2024-${String((index % 12) + 1).padStart(2, "0")}-08`,
    lastRideAt: `2026-07-${String((index % 20) + 1).padStart(2, "0")}`,
  };
}

export const MOCK_TAXI_CUSTOMERS = Array.from({ length: 22 }, (_, i) => makeCustomer(i + 1));
