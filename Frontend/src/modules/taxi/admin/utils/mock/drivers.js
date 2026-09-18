const firstNames = ["Ravi", "Amit", "Suresh", "Vikas", "Karan", "Rahul", "Raj", "Sunil", "Deepak", "Manoj", "Anil", "Prakash", "Nitin", "Sanjay", "Arun", "Vivek", "Gaurav", "Rohit", "Ashok", "Mahesh"];
const lastNames = ["Kumar", "Singh", "Sharma", "Patel", "Yadav", "Verma", "Gupta", "Joshi", "Mehta", "Reddy"];
const vehicleTypes = ["Bike", "Auto", "Taxi", "Cab Premium", "SUV"];
const zones = ["Vijay Nagar", "Palasia", "Rajwada", "Bhawarkua", "MR-10", "Sudama Nagar", "Rau", "Khajrana", "Annapurna", "Airport Road"];

const avatar = (index) =>
  `https://api.dicebear.com/7.x/initials/svg?seed=driver${index}&backgroundColor=fbbf24`;

function makeDriver(index) {
  const id = `TXD-${String(100 + index).padStart(3, "0")}`;
  const name = `${firstNames[index % firstNames.length]} ${lastNames[index % lastNames.length]}`;
  const online = index % 3 !== 1;
  return {
    id,
    photo: avatar(index),
    name,
    phone: `+91 98${String(70000000 + index * 137).slice(0, 8)}`,
    email: `${name.toLowerCase().replace(/\s+/g, ".")}@taxi.local`,
    vehicleType: vehicleTypes[index % vehicleTypes.length],
    vehicleNumber: `MP09TX${String(1000 + index * 7)}`,
    currentZone: zones[index % zones.length],
    onlineStatus: online ? "online" : "offline",
    ridesCompleted: 120 + index * 23,
    rating: (4.1 + (index % 9) * 0.1).toFixed(1),
    walletBalance: 850 + index * 260,
    status: index % 7 === 5 ? "suspended" : "active",
    joinedAt: `2024-${String((index % 12) + 1).padStart(2, "0")}-12`,
    licenseNumber: `MP-09-${2018 + (index % 6)}-${String(340000 + index * 91)}`,
  };
}

export const MOCK_TAXI_DRIVERS = Array.from({ length: 24 }, (_, i) => makeDriver(i + 1));

const DOC_PLACEHOLDER = "https://placehold.co/640x400/e2e8f0/475569?text=";

function makeOnboardingRequest(index) {
  const name = `${firstNames[(index + 7) % firstNames.length]} ${lastNames[(index + 3) % lastNames.length]}`;
  const status = index % 5 === 3 ? "approved" : index % 5 === 4 ? "rejected" : "pending";
  return {
    id: `TXR-${String(500 + index).padStart(3, "0")}`,
    photo: avatar(index + 40),
    name,
    phone: `+91 97${String(60000000 + index * 251).slice(0, 8)}`,
    email: `${name.toLowerCase().replace(/\s+/g, ".")}@taxi.local`,
    dateOfBirth: `19${85 + (index % 12)}-0${(index % 9) + 1}-1${index % 9}`,
    address: `${zones[index % zones.length]}, Indore`,
    vehicleType: vehicleTypes[index % vehicleTypes.length],
    vehicleBrand: ["Maruti", "Hyundai", "Bajaj", "TVS", "Toyota"][index % 5],
    vehicleModel: ["Swift Dzire", "Aura", "RE Auto", "Jupiter", "Etios"][index % 5],
    vehicleNumber: `MP09ZX${String(4000 + index * 13)}`,
    licenseNumber: `MP-09-${2019 + (index % 5)}-${String(510000 + index * 77)}`,
    licenseExpiry: `202${6 + (index % 3)}-0${(index % 9) + 1}-20`,
    aadharNumber: `XXXX XXXX ${String(1000 + index * 111).slice(0, 4)}`,
    emergencyContactName: `${firstNames[(index + 11) % firstNames.length]} ${lastNames[(index + 5) % lastNames.length]}`,
    emergencyContactPhone: `+91 96${String(50000000 + index * 173).slice(0, 8)}`,
    bankAccountHolder: name,
    bankAccountNumber: `XXXXXX${String(4200 + index * 31)}`,
    bankIfsc: "SBIN0004921",
    documents: [
      { label: "Profile Photo", url: `${DOC_PLACEHOLDER}Profile+Photo` },
      { label: "Aadhar Front", url: `${DOC_PLACEHOLDER}Aadhar+Front` },
      { label: "Aadhar Back", url: `${DOC_PLACEHOLDER}Aadhar+Back` },
      { label: "Driving License Front", url: `${DOC_PLACEHOLDER}License+Front` },
      { label: "Driving License Back", url: `${DOC_PLACEHOLDER}License+Back` },
      { label: "Vehicle RC", url: `${DOC_PLACEHOLDER}Vehicle+RC` },
      { label: "Vehicle Insurance", url: `${DOC_PLACEHOLDER}Insurance` },
    ],
    status,
    appliedAt: `2026-07-${String((index % 20) + 1).padStart(2, "0")}T1${index % 9}:3${index % 6}:00`,
    reviewedAt: status === "pending" ? null : `2026-07-${String((index % 20) + 2).padStart(2, "0")}T12:00:00`,
    rejectionReason: status === "rejected" ? "Documents unclear — please re-upload license photos." : "",
  };
}

export const MOCK_ONBOARDING_REQUESTS = Array.from({ length: 14 }, (_, i) => makeOnboardingRequest(i + 1));
