import React, { memo, useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Flame, X, Bookmark, Share2 } from "lucide-react";
import { restaurantAPI } from "@food/api";
import { useCart } from "@food/context/CartContext";
import { clampQuantity, getInitialQuantity, getQuantityLimits } from "@food/utils/orderQuantity";

// Module-level cache: persists across component unmount/remount, avoids re-fetching same restaurants
const productsCache = new Map();

const ProductModal = ({ product, onClose, onAdd }) => {
  const quantityLimits = getQuantityLimits(product);
  const [quantity, setQuantity] = useState(() => getInitialQuantity(product));

  if (!product) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 200 }}
          className="bg-white dark:bg-[#1a1a1a] w-full sm:w-[420px] sm:rounded-3xl rounded-t-3xl overflow-hidden flex flex-col max-h-[90vh] shadow-[0_20px_50px_rgba(0,0,0,0.3)] border border-gray-100/10"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header Image Area */}
          <div className="relative h-64 bg-gray-100 dark:bg-gray-900">
            <button
              onClick={onClose}
              className="absolute top-4 left-4 z-10 p-2 bg-black/45 text-white rounded-full hover:bg-black/75 transition-all border-0 outline-none flex items-center justify-center backdrop-blur-md"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="absolute bottom-[-20px] right-4 z-10 flex gap-2">
               <button className="p-3 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full shadow-lg hover:scale-105 active:scale-95 transition-all border border-gray-100/50 dark:border-gray-700 outline-none flex items-center justify-center">
                 <Bookmark className="w-5 h-5" />
               </button>
               <button className="p-3 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full shadow-lg hover:scale-105 active:scale-95 transition-all border border-gray-100/50 dark:border-gray-700 outline-none flex items-center justify-center">
                 <Share2 className="w-5 h-5" />
               </button>
            </div>
            <img
              src={product.image || product.imageUrl || "https://via.placeholder.com/400"}
              alt={product.name}
              className="w-full h-full object-cover"
            />
          </div>

          {/* Details Area */}
          <div className="p-6 pt-8 flex-1 overflow-y-auto">
            <div className="flex items-start gap-2 mb-2">
              <div className={`mt-1 shrink-0 w-4.5 h-4.5 rounded flex items-center justify-center border ${product.isVeg ? 'border-green-600' : 'border-red-600'}`}>
                <div className={`w-2 h-2 rounded-full ${product.isVeg ? 'bg-green-600' : 'bg-red-600'}`} />
              </div>
              <h2 className="text-xl font-extrabold text-gray-900 dark:text-white leading-tight">{product.name}</h2>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2.5 leading-relaxed">{product.description || "Delicious food item from our menu."}</p>
          </div>

          {/* Footer Area */}
          <div className="p-5 border-t border-gray-100/10 flex items-center justify-between gap-4 bg-gray-50 dark:bg-gray-900/60">
            <div className="flex items-center border border-gray-200 dark:border-gray-800 rounded-xl p-1 bg-white dark:bg-gray-900">
              <button 
                onClick={() => setQuantity(Math.max(quantityLimits.min, quantity - 1))}
                className="w-10 h-10 flex items-center justify-center text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-500 font-bold transition-colors border-0 outline-none bg-transparent text-lg"
              >
                -
              </button>
              <span className="w-8 text-center font-extrabold text-gray-800 dark:text-white">{quantity}</span>
              <button 
                onClick={() => setQuantity(Math.min(quantityLimits.max, quantity + 1))}
                className="w-10 h-10 flex items-center justify-center text-gray-500 dark:text-gray-400 hover:text-[#FF6A00] dark:hover:text-[#FF6A00] font-bold transition-colors border-0 outline-none bg-transparent text-lg"
              >
                +
              </button>
            </div>
            
            <button
              onClick={() => onAdd(product, quantity)}
              className="flex-1 bg-gradient-to-r from-[#FF6A00] to-[#E85D04] hover:from-[#E85D04] hover:to-[#C74D00] text-white py-3.5 px-6 rounded-xl font-bold text-sm flex justify-center items-center transition-all duration-300 shadow-[0_4px_12px_rgba(255,106,0,0.2)] border-0 outline-none active:scale-[0.98]"
            >
              Add Item • ₹{(product.price || 0) * quantity}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

const RecommendedSection = memo(({ recommendedForYouRestaurants }) => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const { addToCart } = useCart();

  // Stable key derived from IDs — prevents unnecessary re-fetches when parent re-renders
  const restaurantIdsKey = useMemo(
    () => (recommendedForYouRestaurants || []).map(r => r.mongoId || r.id).join(","),
    [recommendedForYouRestaurants]
  );

  useEffect(() => {
    if (!restaurantIdsKey) return;

    // Serve from cache if available
    if (productsCache.has(restaurantIdsKey)) {
      setProducts(productsCache.get(restaurantIdsKey));
      return;
    }

    const fetchProducts = async () => {
      setLoading(true);
      try {
        const restaurantsToFetch = (recommendedForYouRestaurants || []).slice(0, 3);
        const fetchPromises = restaurantsToFetch.map(async (restaurant) => {
          try {
            const res = await restaurantAPI.getMenuByRestaurantId(restaurant.mongoId || restaurant.id);
            const menu = res.data?.data?.menu;
            const items = [];
            if (menu?.sections) {
              menu.sections.forEach(section => {
                if (section.items) {
                  section.items.forEach(item => {
                    items.push({
                      ...item,
                      restaurantId: restaurant.mongoId || restaurant.id,
                      restaurant: restaurant.name,
                      restaurantData: restaurant
                    });
                  });
                }
              });
            }
            return items;
          } catch {
            return [];
          }
        });

        const results = await Promise.all(fetchPromises);
        const allProducts = results.flat().slice(0, 6);
        productsCache.set(restaurantIdsKey, allProducts);
        setProducts(allProducts);
      } catch {
        // Silently fail — section simply won't show
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, [restaurantIdsKey]); // Stable string dependency — no spurious re-runs

  // Loading Skeleton
  if (loading) {
    return (
      <section className="mt-6 px-4" data-purpose="recommended-section">
        <div className="flex items-center gap-1.5 mb-3">
          <div className="w-4 h-4 bg-gray-200 rounded animate-pulse" />
          <div className="h-5 w-40 bg-gray-200 rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bg-white rounded-[12px] border border-gray-100 overflow-hidden shadow-sm h-full flex flex-col animate-pulse">
              <div className="h-32 sm:h-36 bg-gray-200 shrink-0" />
              <div className="p-3 flex flex-col flex-1">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
                <div className="h-3 bg-gray-200 rounded w-1/2 mt-1 mb-auto" />
                <div className="flex justify-between items-center mt-3 shrink-0">
                  <div className="h-4 bg-gray-200 rounded w-1/4" />
                  <div className="h-6 bg-gray-200 rounded w-1/4" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (!products || products.length === 0) return null;

  const handleAddToCart = async (product, quantity) => {
    const result = await addToCart({
      ...product,
      // Respect the item's minimum order quantity (server clamps too).
      quantity: clampQuantity(quantity || getInitialQuantity(product), product),
      price: product.price,
      name: product.name,
      restaurantId: product.restaurantId,
      restaurant: product.restaurant
    });
    if (result?.ok === false) {
      // keep modal open on mismatch so user can decide
      return;
    }
    setSelectedProduct(null);
  };

  return (
    <motion.section
      className="mt-6 px-4"
      data-purpose="recommended-section"
      initial={false}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <Flame className="w-4 h-4 text-[#FF6A00]" strokeWidth={2.5} />
          <h3 className="text-base font-extrabold text-gray-900 dark:text-white tracking-tight">
            Recommended for you
          </h3>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {products.map((product, index) => (
            <motion.div
              key={`recommended-prod-${product._id || product.id || index}`}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.35, delay: index * 0.05 }}
            >
              <div
                onClick={() => setSelectedProduct(product)}
                className="bg-white dark:bg-[#1a1a1a] rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden shadow-sm block transition-all duration-300 hover:-translate-y-1 hover:shadow-md dark:hover:shadow-black/30 cursor-pointer h-full flex flex-col group"
                data-purpose="product-card"
              >
                <div className="relative h-32 bg-gray-100 dark:bg-gray-800 shrink-0 overflow-hidden">
                  <img
                    src={product.image || product.imageUrl || "https://via.placeholder.com/150"}
                    alt={product.name}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    loading="lazy"
                  />
                  {product.isVeg !== undefined && (
                    <div className={`absolute top-2 left-2 w-4 h-4 rounded flex items-center justify-center border ${product.isVeg ? 'border-green-600 bg-white' : 'border-red-500 bg-white'}`}>
                      <div className={`w-2 h-2 rounded-full ${product.isVeg ? 'bg-green-600' : 'bg-red-500'}`} />
                    </div>
                  )}
                </div>
                <div className="p-3 flex flex-col flex-1">
                  <h4 className="font-extrabold text-sm text-gray-900 dark:text-white line-clamp-2 leading-tight">
                    {product.name}
                  </h4>
                  <p className="text-[10px] font-medium text-gray-400 dark:text-gray-500 mt-1 line-clamp-1 mb-auto">
                    {product.restaurant}
                  </p>
                  <div className="flex justify-between items-center mt-3 shrink-0">
                    <span className="text-sm font-black text-gray-900 dark:text-white">
                      ₹{product.price || "199"}
                    </span>
                    <button
                      className="bg-white dark:bg-transparent border border-[#FF6A00] text-[#FF6A00] font-extrabold text-[10px] px-3 py-1 rounded-lg transition-all duration-200 hover:bg-[#FF6A00] hover:text-white active:scale-95 outline-none"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedProduct(product);
                      }}
                    >
                      ADD
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
        ))}
      </div>

      {selectedProduct && (
        <ProductModal 
          product={selectedProduct} 
          onClose={() => setSelectedProduct(null)} 
          onAdd={handleAddToCart}
        />
      )}
    </motion.section>
  );
});

export default RecommendedSection;
