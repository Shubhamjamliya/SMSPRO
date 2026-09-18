/**
 * City-aware place suggestions. Keys are normalized city names.
 * Falls back to a generic metro set when city is unknown.
 */
const CITY_PLACES = {
  indore: [
    { id: "ind-airport", name: "Devi Ahilya Airport", type: "Airport", emoji: "✈️" },
    { id: "ind-railway", name: "Indore Junction", type: "Railway", emoji: "🚆" },
    { id: "ind-treasure", name: "Treasure Island Mall", type: "Mall", emoji: "🛍️" },
    { id: "ind-cristal", name: "C21 Mall", type: "Mall", emoji: "🏬" },
    { id: "ind-it", name: "IT Park", type: "IT Park", emoji: "💻" },
    { id: "ind-rajwada", name: "Rajwada", type: "Attraction", emoji: "🏛️" },
    { id: "ind-sarafa", name: "Sarafa Bazaar", type: "Market", emoji: "🌃" },
  ],
  bhopal: [
    { id: "bpl-airport", name: "Raja Bhoj Airport", type: "Airport", emoji: "✈️" },
    { id: "bpl-railway", name: "Bhopal Junction", type: "Railway", emoji: "🚆" },
    { id: "bpl-db", name: "DB Mall", type: "Mall", emoji: "🛍️" },
    { id: "bpl-lake", name: "Upper Lake", type: "Attraction", emoji: "🌊" },
  ],
  mumbai: [
    { id: "bom-airport", name: "CSM International Airport", type: "Airport", emoji: "✈️" },
    { id: "bom-cst", name: "CSMT", type: "Railway", emoji: "🚆" },
    { id: "bom-bandra", name: "Bandra Kurla Complex", type: "IT Park", emoji: "💻" },
    { id: "bom-gateway", name: "Gateway of India", type: "Attraction", emoji: "🗿" },
  ],
  delhi: [
    { id: "del-airport", name: "IGI Airport", type: "Airport", emoji: "✈️" },
    { id: "del-ndls", name: "New Delhi Railway", type: "Railway", emoji: "🚆" },
    { id: "del-cp", name: "Connaught Place", type: "Market", emoji: "🛒" },
    { id: "del-india", name: "India Gate", type: "Attraction", emoji: "🇮🇳" },
  ],
};

const GENERIC = [
  { id: "g-airport", name: "Airport", type: "Airport", emoji: "✈️" },
  { id: "g-railway", name: "Railway Station", type: "Railway", emoji: "🚆" },
  { id: "g-mall", name: "City Mall", type: "Mall", emoji: "🛍️" },
  { id: "g-it", name: "IT Park", type: "IT Park", emoji: "💻" },
  { id: "g-market", name: "Main Market", type: "Market", emoji: "🛒" },
  { id: "g-tour", name: "Tourist Spot", type: "Attraction", emoji: "📍" },
];

export const getPlacesForCity = (cityName = "") => {
  const key = String(cityName || "")
    .trim()
    .toLowerCase()
    .split(",")[0]
    .trim();
  if (!key) return GENERIC;
  const match = Object.keys(CITY_PLACES).find(
    (city) => key.includes(city) || city.includes(key),
  );
  return match ? CITY_PLACES[match] : GENERIC;
};
