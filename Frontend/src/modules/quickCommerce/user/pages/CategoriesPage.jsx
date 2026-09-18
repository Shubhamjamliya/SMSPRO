import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown, Search } from 'lucide-react';
import LocationDrawer from '../components/shared/LocationDrawer';
import { useLocation } from '../context/LocationContext';
import { customerApi } from '../services/customerApi';
import { motion, AnimatePresence } from 'framer-motion';

const COLORS = [
    "#FDF2F2", "#F2F9F2", "#F2F2FD", "#FDFDF2",
    "#F2FDFD", "#FDF2FD", "#FFF8F0", "#F0FFF8",
];

// React.memo: only re-renders when isFlipped or category reference changes.
// Previously every interval tick caused ALL cards to re-render.
const CategoryCard = React.memo(function CategoryCard({ category, isFlipped }) {
    return (
        <div className="relative w-full aspect-square [perspective:1000px] group">
            <motion.div
                initial={false}
                animate={{ rotateY: isFlipped ? 180 : 0 }}
                transition={{ duration: 0.6, type: "spring", stiffness: 260, damping: 20 }}
                className="w-full h-full relative [transform-style:preserve-3d] cursor-pointer"
            >
                <div className="absolute inset-0 [backface-visibility:hidden] bg-card dark:bg-background rounded-full p-1.5 shadow-[0_8px_20px_-8px_rgba(0,0,0,0.1)] border border-border flex items-center justify-center overflow-hidden transition-colors">
                    <img
                        src={category.image}
                        alt={category.name}
                        loading="lazy"
                        className="w-[85%] h-[85%] object-contain mix-blend-multiply dark:mix-blend-normal group-hover:scale-110 transition-transform duration-500"
                    />
                </div>
                <div
                    className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)] rounded-full p-2.5 flex items-center justify-center text-center shadow-inner border border-border"
                    style={{ backgroundColor: category.color }}
                >
                    <span className="text-[9px] md:text-[11px] font-black text-foreground uppercase tracking-widest leading-tight">
                        {category.name}
                    </span>
                </div>
            </motion.div>
        </div>
    );
});

const CategoriesHeader = () => {
    const { currentLocation, isFetchingLocation } = useLocation();
    const [isLocationDrawerOpen, setIsLocationDrawerOpen] = useState(false);
    const navigate = useNavigate();

    const handleLocationClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsLocationDrawerOpen(true);
    };

    const handleSearchClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        navigate('/quick/search');
    };

    return (
        <div className="sticky top-0 z-40 bg-white border-b border-gray-100 shadow-xs px-4 py-3">
            <div className="w-full">
                <div className="flex justify-between items-start mb-2.5">
                    <div className="flex flex-col cursor-pointer" onClick={handleLocationClick}>
                        <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Delivery in</span>
                            <span className="bg-[#FF6A00] text-white text-[9px] font-bold px-1.5 py-0.5 rounded uppercase">10 MINS</span>
                        </div>
                        <div className="flex items-center gap-1 group">
                            <span className="text-[20px] font-black text-slate-900 leading-none">
                                {currentLocation?.time || "10-12 mins"}
                            </span>
                            <ChevronDown className="w-4 h-4 text-gray-500 group-hover:text-gray-800 transition-colors" />
                        </div>
                        <span className="text-[11px] text-gray-500 truncate max-w-[220px] mt-0.5">
                            {isFetchingLocation ? "Detecting location..." : (currentLocation?.name || "Select Location")}
                        </span>
                    </div>
                </div>
                
                <div className="relative cursor-pointer" onClick={handleSearchClick}>
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                        <Search className="h-4 w-4 text-[#FF6A00]" />
                    </div>
                    <input 
                        type="text"
                        placeholder="Search for bread, milk, eggs..."
                        className="w-full bg-gray-50 border border-gray-200 text-gray-900 rounded-xl py-2.5 pl-10 pr-4 focus:outline-none focus:ring-1 focus:ring-[#FF6A00]/30 text-xs font-medium placeholder:font-normal placeholder:text-gray-400 cursor-pointer shadow-2xs"
                        readOnly
                        onClick={handleSearchClick}
                    />
                </div>
            </div>
            <LocationDrawer open={isLocationDrawerOpen} onClose={() => setIsLocationDrawerOpen(false)} />
        </div>
    );
};

const CategoriesPage = () => {
    const [groups, setGroups] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [flippedCategoryId, setFlippedCategoryId] = useState(null);

    // Store subcategory IDs in a ref so the flip interval doesn't need
    // to be re-created every time groups change.
    const subCatIdsRef = useRef([]);

    const fetchCategories = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await customerApi.getCategories({ tree: true });
            if (res.data.success) {
                const results = res.data.results || res.data.result || [];
                const allCategories = Array.isArray(results) ? results : [];
                const headers = allCategories.filter(
                    (cat) => !cat.parentId || (cat.children && cat.children.length > 0),
                );
                const formattedGroups = headers
                    .filter((header) => (header.name || '').trim().toLowerCase() !== 'all')
                    .map((header, idx) => {
                        let subs = header.children && header.children.length > 0
                            ? header.children
                            : allCategories.filter((cat) => cat.parentId === header._id);
                        if (subs.length === 0) return null;
                        return {
                            id: header._id || idx,
                            title: header.name,
                            categories: subs.map((cat, cIdx) => ({
                                id: cat._id || `${idx}-${cIdx}`,
                                name: cat.name,
                                image: cat.image || "https://cdn.grofers.com/cdn-cgi/image/f=auto,fit=scale-down,q=70,metadata=none,w=270/layout-engine/2022-11/Slice-1_9.png",
                                color: COLORS[(idx + cIdx) % COLORS.length],
                            })),
                        };
                    })
                    .filter(Boolean);

                setGroups(formattedGroups);

                // Update ref immediately — interval won't need to restart
                subCatIdsRef.current = formattedGroups.flatMap((g) => g.categories.map((c) => c.id));
            }
        } catch (error) {
            console.error("Error fetching categories:", error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchCategories();
    }, [fetchCategories]);

    // Single interval — reads IDs from ref instead of closing over groups state.
    // Previously this was re-created on every groups change, causing a flicker gap.
    useEffect(() => {
        const interval = setInterval(() => {
            const ids = subCatIdsRef.current;
            if (!ids.length) return;
            const targetId = ids[Math.floor(Math.random() * ids.length)];
            setFlippedCategoryId(targetId);
            setTimeout(() => setFlippedCategoryId(null), 1500);
        }, 3000);
        return () => clearInterval(interval);
    }, []); // ← empty dep array: interval lives for the component lifetime

    return (
        <div className="min-h-screen bg-white transition-colors duration-500">
            <CategoriesHeader />
            <div className="w-full px-4 pt-4 pb-24">
                <AnimatePresence mode="wait">
                    {isLoading ? (
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="flex items-center justify-center h-64"
                        >
                            <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                        </motion.div>
                    ) : (
                        <div className="space-y-6 md:space-y-8">
                            {groups.map((group, groupIdx) => (
                                <motion.section
                                    key={group.id}
                                    initial={{ opacity: 0, y: 20 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ delay: groupIdx * 0.1 }}
                                    className="space-y-6"
                                >
                                    <div className="flex items-center gap-3">
                                        <h2 className="text-[15px] md:text-base font-black text-slate-900 tracking-wide uppercase transition-colors">
                                            {group.title}
                                        </h2>
                                        <div className="h-[1px] flex-1 bg-gray-100" />
                                    </div>
                                    <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-x-2 gap-y-5 md:gap-4">
                                        {group.categories.map((category) => (
                                            <Link key={category.id} to={`/quick/categories/${category.id}`} className="block">
                                                <CategoryCard
                                                    category={category}
                                                    isFlipped={flippedCategoryId === category.id}
                                                />
                                            </Link>
                                        ))}
                                    </div>
                                </motion.section>
                            ))}
                        </div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

export default CategoriesPage;