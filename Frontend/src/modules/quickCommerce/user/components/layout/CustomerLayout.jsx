import React, { useMemo } from 'react';
import Footer from './Footer';
import BottomNav from './BottomNav';
import MiniCart from '../shared/MiniCart';
import ProductDetailSheet from '../shared/ProductDetailSheet';
import MobileFooterMessage from './MobileFooterMessage';
import { useProductDetail } from '../../context/ProductDetailContext';
import { cn } from '@/lib/utils';
import { useLocation } from 'react-router-dom';

// Static sets for O(1) lookups instead of Array.includes (O(n)) on every render
const HIDE_BOTTOM_NAV_SET = new Set(['/cart', '/checkout', '/search', '/chat']);
const HIDE_CART_SET = new Set(['/cart', '/checkout', '/search', '/chat']);
const HIDE_FOOTER_MSG_SET = new Set(['/profile', '/profile/edit']);

import AppMobileFrame from '@/modules/common/components/AppMobileFrame';

const CustomerLayout = ({
    children,
    showHeader: showHeaderProp,        // kept for API compat (unused internally)
    fullHeight = false,
    showCart: showCartProp,
    showBottomNav: showBottomNavProp,
}) => {
    const location = useLocation();
    const { isOpen: isProductDetailOpen } = useProductDetail();

    // Strip module prefix once per pathname change
    const path = useMemo(
        () => location.pathname.replace(/^\/quick(?:-commerce(?:\/user)?)?/, '') || '/',
        [location.pathname],
    );

    // All visibility flags derived in a single useMemo to avoid multiple hook calls
    const {
        showBottomNav,
        showCart,
        showFooterMessage,
        finalShowBottomNavMobile,
        finalShowFooterMessageMobile,
    } = useMemo(() => {
        const matchesPrefix = (prefix) =>
            path === prefix || path.startsWith(`${prefix}/`);

        const _showBottomNav =
            showBottomNavProp !== undefined
                ? showBottomNavProp
                : !HIDE_BOTTOM_NAV_SET.has(path);

        const _showCart =
            showCartProp !== undefined
                ? showCartProp
                : !HIDE_CART_SET.has(path) && !matchesPrefix('/orders');

        const _showFooterMessage =
            _showBottomNav &&
            !HIDE_FOOTER_MSG_SET.has(path) &&
            !matchesPrefix('/category');

        return {
            showBottomNav: _showBottomNav,
            showCart: _showCart,
            showFooterMessage: _showFooterMessage,
            finalShowBottomNavMobile: _showBottomNav && !isProductDetailOpen,
            finalShowFooterMessageMobile: _showFooterMessage && !isProductDetailOpen,
        };
    }, [path, showBottomNavProp, showCartProp, isProductDetailOpen]);

    return (
        <AppMobileFrame bgClassName="quick-theme-scope bg-white dark:bg-background">
            <div className="w-full flex-1 flex flex-col justify-between">
                <main className={cn('flex-1', !fullHeight && 'pb-16')}>
                    {children}
                </main>

                {showCart && <MiniCart />}
                <ProductDetailSheet />

                <div>
                    {finalShowFooterMessageMobile && <MobileFooterMessage />}
                    {showBottomNav && <BottomNav />}
                </div>
            </div>
        </AppMobileFrame>
    );
};

export default React.memo(CustomerLayout);