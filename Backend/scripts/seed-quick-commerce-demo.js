import mongoose from "mongoose";
import dotenv from "dotenv";
import { QuickCategory } from "../src/modules/quick-commerce/models/category.model.js";
import { QuickProduct } from "../src/modules/quick-commerce/models/product.model.js";
import { QuickZone } from "../src/modules/quick-commerce/models/quick_zone.model.js";
import { Seller } from "../src/modules/quick-commerce/seller/models/seller.model.js";
import { FoodUser } from "../src/core/users/user.model.js";

dotenv.config();

const mongoUri =
  process.env.MONGODB_URI ||
  process.env.MONGO_URI ||
  "mongodb://127.0.0.1:27017/smspro";

// ── Public Unsplash Image Dataset ───────────────────────────────────────────
const IMAGES = {
  // Store / Header / Category Images
  store: "https://images.unsplash.com/photo-1578916171728-46686eac8d58?auto=format&fit=crop&w=600&q=80",
  headerVeg: "https://images.unsplash.com/photo-1610832958506-aa56368176cf?auto=format&fit=crop&w=600&q=80",
  subVeg: "https://images.unsplash.com/photo-1597362925123-77861d3fbac7?auto=format&fit=crop&w=600&q=80",
  subFruit: "https://images.unsplash.com/photo-1619566636858-adf3ef46400b?auto=format&fit=crop&w=600&q=80",
  subExotic: "https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=600&q=80",

  headerDairy: "https://images.unsplash.com/photo-1628088062854-d1870b4553da?auto=format&fit=crop&w=600&q=80",
  subMilk: "https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=600&q=80",
  subBread: "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=600&q=80",
  subButter: "https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?auto=format&fit=crop&w=600&q=80",

  headerDrinks: "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=600&q=80",
  subSoda: "https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=600&q=80",
  subJuice: "https://images.unsplash.com/photo-1613478223719-2ab802602423?auto=format&fit=crop&w=600&q=80",

  headerSnacks: "https://images.unsplash.com/photo-1566478989037-eec170784d0b?auto=format&fit=crop&w=600&q=80",
  subChips: "https://images.unsplash.com/photo-1566478989037-eec170784d0b?auto=format&fit=crop&w=600&q=80",
  subBiscuits: "https://images.unsplash.com/photo-1558961363-fa8fdf82db35?auto=format&fit=crop&w=600&q=80",
  subChoco: "https://images.unsplash.com/photo-1582293041079-7814c2f12063?auto=format&fit=crop&w=600&q=80",

  headerInstant: "https://images.unsplash.com/photo-1612929633738-8fe44f7ec841?auto=format&fit=crop&w=600&q=80",
  subNoodles: "https://images.unsplash.com/photo-1612929633738-8fe44f7ec841?auto=format&fit=crop&w=600&q=80",
  subFrozen: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=600&q=80",

  headerPersonal: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=600&q=80",

  // Specific Product Images
  tomato: "https://images.unsplash.com/photo-1592924357228-91a4daadcfea?auto=format&fit=crop&w=600&q=80",
  onion: "https://images.unsplash.com/photo-1618512496248-a07fe83aa8cf?auto=format&fit=crop&w=600&q=80",
  potato: "https://images.unsplash.com/photo-1518977676601-b53f82aba655?auto=format&fit=crop&w=600&q=80",
  spinach: "https://images.unsplash.com/photo-1576045057995-568f588f82fb?auto=format&fit=crop&w=600&q=80",
  banana: "https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?auto=format&fit=crop&w=600&q=80",
  apple: "https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?auto=format&fit=crop&w=600&q=80",
  orange: "https://images.unsplash.com/photo-1547514701-42782101795e?auto=format&fit=crop&w=600&q=80",

  milk: "https://images.unsplash.com/photo-1563636619-e9143da7973b?auto=format&fit=crop&w=600&q=80",
  bread: "https://images.unsplash.com/photo-1549931319-a545dcf3bc73?auto=format&fit=crop&w=600&q=80",
  butter: "https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?auto=format&fit=crop&w=600&q=80",
  cheese: "https://images.unsplash.com/photo-1452195100486-9cc805987862?auto=format&fit=crop&w=600&q=80",
  eggs: "https://images.unsplash.com/photo-1516448620398-c5f44bf9f441?auto=format&fit=crop&w=600&q=80",

  coke: "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=600&q=80",
  pepsi: "https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=600&q=80",
  orangeJuice: "https://images.unsplash.com/photo-1613478223719-2ab802602423?auto=format&fit=crop&w=600&q=80",
  redbull: "https://images.unsplash.com/photo-1622543925917-763c34d1a86e?auto=format&fit=crop&w=600&q=80",

  chips: "https://images.unsplash.com/photo-1566478989037-eec170784d0b?auto=format&fit=crop&w=600&q=80",
  cookies: "https://images.unsplash.com/photo-1558961363-fa8fdf82db35?auto=format&fit=crop&w=600&q=80",
  chocolate: "https://images.unsplash.com/photo-1582293041079-7814c2f12063?auto=format&fit=crop&w=600&q=80",

  maggi: "https://images.unsplash.com/photo-1612929633738-8fe44f7ec841?auto=format&fit=crop&w=600&q=80",
  fries: "https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=600&q=80",

  soap: "https://images.unsplash.com/photo-1607006482602-76ca970733fe?auto=format&fit=crop&w=600&q=80",
  shampoo: "https://images.unsplash.com/photo-1535585209827-a15fcdbc4c2d?auto=format&fit=crop&w=600&q=80",
};

export async function seedQuickCommerceDemo() {
  console.log("🚀 Starting Quick Commerce End-to-End Data Seed...");

  // ── 1. Seed Quick Zone ───────────────────────────────────────────────────
  let zone = await QuickZone.findOne({ name: "Indore Metro Quick Zone" });
  if (!zone) {
    zone = await QuickZone.create({
      name: "Indore Metro Quick Zone",
      zoneName: "Indore Central",
      country: "India",
      serviceLocation: "Indore, Madhya Pradesh",
      unit: "kilometer",
      coordinates: [
        { latitude: 22.8000, longitude: 75.8000 },
        { latitude: 22.8000, longitude: 75.9500 },
        { latitude: 22.6500, longitude: 75.9500 },
        { latitude: 22.6500, longitude: 75.8000 },
        { latitude: 22.8000, longitude: 75.8000 },
      ],
      isActive: true,
      zoneType: "multi_vendor",
      adminHubEnabled: true,
    });
    console.log("✅ Seeded Quick Zone:", zone.name);
  } else {
    console.log("ℹ️ Using existing Quick Zone:", zone.name);
  }

  // ── 2. Seed Customer (User) ──────────────────────────────────────────────
  let user = await FoodUser.findOne({ phone: "+919876543210" });
  if (!user) {
    user = await FoodUser.create({
      name: "Alex Quick Customer",
      email: "quickuser@smspro.com",
      phone: "+919876543210",
      phoneDigits: "919876543210",
      phoneLast10: "9876543210",
      role: "USER",
      isPhoneVerified: true,
      isActive: true,
      addresses: [
        {
          label: "Home",
          street: "Flat 402, Royal Heights",
          area: "Vijay Nagar",
          city: "Indore",
          state: "Madhya Pradesh",
          zipCode: "452010",
          formattedAddress: "Flat 402, Royal Heights, Vijay Nagar, Indore",
          location: { type: "Point", coordinates: [75.8577, 22.7196] },
          phone: "+919876543210",
          isDefault: true,
        },
      ],
    });
    console.log("✅ Seeded Customer User:", user.name);
  } else {
    console.log("ℹ️ Using existing Customer User:", user.name);
  }

  // ── 3. Seed Seller / Vendor ──────────────────────────────────────────────
  let seller = await Seller.findOne({ phone: "+919876500001" });
  if (!seller) {
    seller = await Seller.create({
      name: "SMSPRO SuperMart Owner",
      shopName: "SMSPRO Quick Mart",
      email: "seller@smspro.com",
      phone: "+919876500001",
      phoneDigits: "919876500001",
      phoneLast10: "9876500001",
      role: "SELLER",
      isAdminHub: true,
      isVerified: true,
      isActive: true,
      location: {
        type: "Point",
        coordinates: [75.8577, 22.7196],
        latitude: 22.7196,
        longitude: 75.8577,
        formattedAddress: "SMSPRO Hub, Vijay Nagar, Indore",
        address: "SMSPRO Hub, Vijay Nagar, Indore",
      },
      shopInfo: {
        businessType: "quick_commerce",
        shopImage: IMAGES.store,
        zoneId: zone._id,
        zoneSource: "quick",
        zoneName: zone.name,
        openingHours: "07:00 AM - 11:00 PM",
        supportEmail: "support@smsproquickmart.com",
      },
    });
    console.log("✅ Seeded Seller Store:", seller.shopName);
  } else {
    console.log("ℹ️ Using existing Seller Store:", seller.shopName);
  }

  // Link Seller to Admin Hub if needed
  if (!zone.adminHubSellerId) {
    zone.adminHubSellerId = seller._id;
    await zone.save();
  }

  // ── 4. Seed Categories & Subcategories ──────────────────────────────────
  const categoryDataset = [
    {
      header: { name: "Fresh Fruits & Vegetables", slug: "fresh-fruits-vegetables", image: IMAGES.headerVeg, accentColor: "#16a34a" },
      subcategories: [
        { name: "Fresh Vegetables", slug: "fresh-vegetables", image: IMAGES.subVeg },
        { name: "Fresh Fruits", slug: "fresh-fruits", image: IMAGES.subFruit },
        { name: "Exotic Greens", slug: "exotic-greens", image: IMAGES.subExotic },
      ],
    },
    {
      header: { name: "Dairy, Bread & Eggs", slug: "dairy-bread-eggs", image: IMAGES.headerDairy, accentColor: "#0284c7" },
      subcategories: [
        { name: "Milk & Curd", slug: "milk-curd", image: IMAGES.subMilk },
        { name: "Bread & Bakery", slug: "bread-bakery", image: IMAGES.subBread },
        { name: "Butter & Cheese", slug: "butter-cheese", image: IMAGES.subButter },
      ],
    },
    {
      header: { name: "Cold Drinks & Juices", slug: "cold-drinks-juices", image: IMAGES.headerDrinks, accentColor: "#ea580c" },
      subcategories: [
        { name: "Soft Drinks", slug: "soft-drinks", image: IMAGES.subSoda },
        { name: "Fruit Juices", slug: "fruit-juices", image: IMAGES.subJuice },
      ],
    },
    {
      header: { name: "Snacks & Munchies", slug: "snacks-munchies", image: IMAGES.headerSnacks, accentColor: "#d97706" },
      subcategories: [
        { name: "Chips & Namkeen", slug: "chips-namkeen", image: IMAGES.subChips },
        { name: "Biscuits & Cookies", slug: "biscuits-cookies", image: IMAGES.subBiscuits },
        { name: "Chocolates", slug: "chocolates", image: IMAGES.subChoco },
      ],
    },
    {
      header: { name: "Instant & Frozen Food", slug: "instant-frozen-food", image: IMAGES.headerInstant, accentColor: "#9333ea" },
      subcategories: [
        { name: "Noodles & Pasta", slug: "noodles-pasta", image: IMAGES.subNoodles },
        { name: "Frozen Snacks", slug: "frozen-snacks", image: IMAGES.subFrozen },
      ],
    },
  ];

  const categoryMap = {}; // slug -> category doc

  for (const item of categoryDataset) {
    let headerCat = await QuickCategory.findOne({ slug: item.header.slug });
    if (!headerCat) {
      headerCat = await QuickCategory.create({
        name: item.header.name,
        slug: item.header.slug,
        image: item.header.image,
        type: "header",
        businessType: "quick_commerce",
        status: "active",
        approvalStatus: "approved",
        accentColor: item.header.accentColor,
        isActive: true,
      });
      console.log(`  📁 Header Created: ${headerCat.name}`);
    }
    categoryMap[item.header.slug] = headerCat;

    for (const sub of item.subcategories) {
      let subCat = await QuickCategory.findOne({ slug: sub.slug });
      if (!subCat) {
        subCat = await QuickCategory.create({
          name: sub.name,
          slug: sub.slug,
          image: sub.image,
          type: "subcategory",
          businessType: "quick_commerce",
          status: "active",
          approvalStatus: "approved",
          parentId: headerCat._id,
          isActive: true,
        });
        console.log(`    ↳ Subcategory Created: ${subCat.name}`);
      }
      categoryMap[sub.slug] = subCat;
    }
  }

  // ── 5. Seed Products ─────────────────────────────────────────────────────
  const productDataset = [
    // Vegetables & Fruits
    {
      name: "Fresh Hybrid Tomatoes",
      slug: "fresh-hybrid-tomatoes",
      headerSlug: "fresh-fruits-vegetables",
      subSlug: "fresh-vegetables",
      image: IMAGES.tomato,
      price: 32,
      mrp: 45,
      unit: "500 g",
      brand: "Fresh Produce",
      badge: "FRESH",
      isFeatured: true,
      description: "Farm fresh, ripe red tomatoes ideal for curries, salads and gravies.",
    },
    {
      name: "Fresh Red Onions",
      slug: "fresh-red-onions",
      headerSlug: "fresh-fruits-vegetables",
      subSlug: "fresh-vegetables",
      image: IMAGES.onion,
      price: 38,
      mrp: 50,
      unit: "1 kg",
      brand: "Fresh Produce",
      badge: "ESSENTIAL",
      isFeatured: true,
      description: "Crisp and flavorful red onions sourced directly from certified farms.",
    },
    {
      name: "Fresh New Crop Potatoes",
      slug: "fresh-potatoes",
      headerSlug: "fresh-fruits-vegetables",
      subSlug: "fresh-vegetables",
      image: IMAGES.potato,
      price: 28,
      mrp: 40,
      unit: "1 kg",
      brand: "Fresh Produce",
      badge: "BESTSELLER",
      isFeatured: true,
      description: "High quality potatoes suitable for frying, boiling and curries.",
    },
    {
      name: "Organic Baby Spinach (Palak)",
      slug: "organic-baby-spinach",
      headerSlug: "fresh-fruits-vegetables",
      subSlug: "exotic-greens",
      image: IMAGES.spinach,
      price: 24,
      mrp: 35,
      unit: "250 g",
      brand: "Organic Greens",
      badge: "ORGANIC",
      isFeatured: false,
      description: "Hydroponically grown fresh spinach leaves rich in iron and vitamins.",
    },
    {
      name: "Robusta Fresh Bananas",
      slug: "robusta-fresh-bananas",
      headerSlug: "fresh-fruits-vegetables",
      subSlug: "fresh-fruits",
      image: IMAGES.banana,
      price: 48,
      mrp: 60,
      unit: "1 kg (6-8 pcs)",
      brand: "Fresh Produce",
      badge: "10 MINS",
      isFeatured: true,
      description: "Naturally ripened sweet bananas packed with potassium & energy.",
    },
    {
      name: "Shimla Crisp Red Apples",
      slug: "shimla-crisp-red-apples",
      headerSlug: "fresh-fruits-vegetables",
      subSlug: "fresh-fruits",
      image: IMAGES.apple,
      price: 140,
      mrp: 180,
      unit: "4 pcs (~600 g)",
      brand: "Shimla Premium",
      badge: "PREMIUM",
      isFeatured: true,
      description: "Juicy, crunchy red apples imported directly from orchards.",
    },
    {
      name: "Nagpur Sweet Oranges",
      slug: "nagpur-sweet-oranges",
      headerSlug: "fresh-fruits-vegetables",
      subSlug: "fresh-fruits",
      image: IMAGES.orange,
      price: 75,
      mrp: 100,
      unit: "1 kg",
      brand: "Fresh Produce",
      badge: "JUICY",
      isFeatured: false,
      description: "Vitamin-C rich juicy Nagpur oranges with sweet citrus flavor.",
    },

    // Dairy & Bakery
    {
      name: "Amul Taaza Toned Milk",
      slug: "amul-taaza-toned-milk",
      headerSlug: "dairy-bread-eggs",
      subSlug: "milk-curd",
      image: IMAGES.milk,
      price: 27,
      mrp: 28,
      unit: "500 ml Pouch",
      brand: "Amul",
      badge: "DAILY ESSENTIAL",
      isFeatured: true,
      description: "Pasteurised toned milk with 3.0% fat and 8.5% SNF.",
    },
    {
      name: "Modern 100% Whole Wheat Bread",
      slug: "modern-whole-wheat-bread",
      headerSlug: "dairy-bread-eggs",
      subSlug: "bread-bakery",
      image: IMAGES.bread,
      price: 45,
      mrp: 50,
      unit: "400 g",
      brand: "Modern",
      badge: "HEALTHY",
      isFeatured: true,
      description: "Soft and nutritious whole wheat bread baked fresh daily.",
    },
    {
      name: "Amul Pasteurised Salted Butter",
      slug: "amul-pasteurised-butter",
      headerSlug: "dairy-bread-eggs",
      subSlug: "butter-cheese",
      image: IMAGES.butter,
      price: 56,
      mrp: 60,
      unit: "100 g",
      brand: "Amul",
      badge: "POPULAR",
      isFeatured: true,
      description: "Delicious salted butter made from pure cow & buffalo milk.",
    },
    {
      name: "Amul Processed Cheese Blocks",
      slug: "amul-processed-cheese-blocks",
      headerSlug: "dairy-bread-eggs",
      subSlug: "butter-cheese",
      image: IMAGES.cheese,
      price: 135,
      mrp: 145,
      unit: "200 g",
      brand: "Amul",
      badge: "CHEESY",
      isFeatured: false,
      description: "Rich and creamy processed cheese blocks perfect for pizza & toast.",
    },
    {
      name: "Farm Fresh White Eggs",
      slug: "farm-fresh-white-eggs",
      headerSlug: "dairy-bread-eggs",
      subSlug: "bread-bakery",
      image: IMAGES.eggs,
      price: 42,
      mrp: 55,
      unit: "Pack of 6",
      brand: "Farm Fresh",
      badge: "PROTEIN",
      isFeatured: true,
      description: "Hygienically packed farm fresh protein-rich eggs.",
    },

    // Beverages
    {
      name: "Coca-Cola Original Taste",
      slug: "coca-cola-original-taste",
      headerSlug: "cold-drinks-juices",
      subSlug: "soft-drinks",
      image: IMAGES.coke,
      price: 40,
      mrp: 40,
      unit: "750 ml Bottle",
      brand: "Coca-Cola",
      badge: "CHILLED",
      isFeatured: true,
      description: "Refreshing sparkling soft drink with classic cola taste.",
    },
    {
      name: "Pepsi Soft Drink Can",
      slug: "pepsi-soft-drink-can",
      headerSlug: "cold-drinks-juices",
      subSlug: "soft-drinks",
      image: IMAGES.pepsi,
      price: 35,
      mrp: 35,
      unit: "330 ml Can",
      brand: "Pepsi",
      badge: "CHILLED",
      isFeatured: false,
      description: "Brisk, bold and refreshing cola beverage in a cold can.",
    },
    {
      name: "Real Fruit Power Orange Juice",
      slug: "real-fruit-power-orange-juice",
      headerSlug: "cold-drinks-juices",
      subSlug: "fruit-juices",
      image: IMAGES.orangeJuice,
      price: 110,
      mrp: 130,
      unit: "1 Litre Pack",
      brand: "Real",
      badge: "VITAMIN C",
      isFeatured: true,
      description: "Made from finest oranges with no added preservatives.",
    },
    {
      name: "Red Bull Energy Drink",
      slug: "red-bull-energy-drink",
      headerSlug: "cold-drinks-juices",
      subSlug: "soft-drinks",
      image: IMAGES.redbull,
      price: 125,
      mrp: 125,
      unit: "250 ml Can",
      brand: "Red Bull",
      badge: "ENERGY",
      isFeatured: true,
      description: "Vitalizes body and mind with taurine, caffeine and B-group vitamins.",
    },

    // Snacks
    {
      name: "Lay's Classic Salted Chips",
      slug: "lays-classic-salted-chips",
      headerSlug: "snacks-munchies",
      subSlug: "chips-namkeen",
      image: IMAGES.chips,
      price: 20,
      mrp: 20,
      unit: "50 g",
      brand: "Lay's",
      badge: "CRISPY",
      isFeatured: true,
      description: "Crispy potato chips made from farm-grown fresh potatoes.",
    },
    {
      name: "Oreo Vanilla Cream Biscuits",
      slug: "oreo-vanilla-cream-biscuits",
      headerSlug: "snacks-munchies",
      subSlug: "biscuits-cookies",
      image: IMAGES.cookies,
      price: 30,
      mrp: 30,
      unit: "120 g",
      brand: "Cadbury",
      badge: "SNACK",
      isFeatured: true,
      description: "Rich dark chocolate cookies filled with smooth vanilla cream.",
    },
    {
      name: "Cadbury Dairy Milk Silk Chocolate",
      slug: "cadbury-dairy-milk-silk",
      headerSlug: "snacks-munchies",
      subSlug: "chocolates",
      image: IMAGES.chocolate,
      price: 80,
      mrp: 90,
      unit: "60 g",
      brand: "Cadbury",
      badge: "SWEET",
      isFeatured: true,
      description: "Smooth and creamy milk chocolate bar melting in your mouth.",
    },

    // Instant Food
    {
      name: "Maggi 2-Minute Masala Noodles",
      slug: "maggi-2-minute-masala-noodles",
      headerSlug: "instant-frozen-food",
      subSlug: "noodles-pasta",
      image: IMAGES.maggi,
      price: 56,
      mrp: 60,
      unit: "Pack of 4 (280 g)",
      brand: "Nestle",
      badge: "HOT SELLER",
      isFeatured: true,
      description: "Iconic masala instant noodles made with quality spices and wheat flour.",
    },
    {
      name: "McCain Crispy French Fries",
      slug: "mccain-crispy-french-fries",
      headerSlug: "instant-frozen-food",
      subSlug: "frozen-snacks",
      image: IMAGES.fries,
      price: 115,
      mrp: 135,
      unit: "420 g Pack",
      brand: "McCain",
      badge: "FROZEN",
      isFeatured: true,
      description: "Ready-to-cook restaurant style golden french fries.",
    },
  ];

  let createdCount = 0;
  for (const prod of productDataset) {
    const headerCat = categoryMap[prod.headerSlug];
    const subCat = categoryMap[prod.subSlug];

    if (!headerCat) continue;

    let existing = await QuickProduct.findOne({ slug: prod.slug });
    if (!existing) {
      existing = await QuickProduct.create({
        name: prod.name,
        slug: prod.slug,
        image: prod.image,
        mainImage: prod.image,
        galleryImages: [prod.image],
        categoryId: headerCat._id,
        subcategoryId: subCat ? subCat._id : null,
        headerId: headerCat._id,
        price: prod.price,
        mrp: prod.mrp,
        salePrice: prod.price,
        unit: prod.unit,
        weight: prod.unit,
        brand: prod.brand,
        sku: `SKU-${prod.slug.toUpperCase()}`,
        stock: 150,
        lowStockAlert: 10,
        packingAmount: 0,
        status: "active",
        approvalStatus: "approved",
        approvedAt: new Date(),
        isFeatured: prod.isFeatured,
        tags: [prod.brand.toLowerCase(), prod.badge.toLowerCase(), "quick"],
        deliveryTime: "10 mins",
        badge: prod.badge,
        rating: 4.8,
        sellerId: seller._id,
        description: prod.description,
        isActive: true,
      });
      createdCount++;
      console.log(`  🛒 Product Created: ${existing.name} (${existing.unit}) - ₹${existing.price}`);
    }
  }

  console.log(`\n🎉 Quick Commerce End-to-End Seed Complete!`);
  console.log(`   - Zone: 1 ("${zone.name}")`);
  console.log(`   - Customer User: 1 ("${user.name}" - ${user.phone})`);
  console.log(`   - Seller Store: 1 ("${seller.shopName}" - ${seller.phone})`);
  console.log(`   - Headers & Subcategories: ${Object.keys(categoryMap).length}`);
  console.log(`   - Products Created: ${createdCount}`);

  return {
    success: true,
    zone,
    user: { id: user._id, name: user.name, phone: user.phone },
    seller: { id: seller._id, shopName: seller.shopName, phone: seller.phone },
    categoriesCount: Object.keys(categoryMap).length,
    productsCreated: createdCount,
  };
}

// Execute direct CLI script if invoked via node
if (process.argv[1]?.includes("seed-quick-commerce-demo.js")) {
  mongoose
    .connect(mongoUri)
    .then(async () => {
      console.log("Connected to MongoDB:", mongoUri);
      await seedQuickCommerceDemo();
      process.exit(0);
    })
    .catch((err) => {
      console.error("❌ MongoDB connection error:", err);
      process.exit(1);
    });
}
