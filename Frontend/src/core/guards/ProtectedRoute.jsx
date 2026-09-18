import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@core/context/AuthContext';
import { isTokenExpired } from '@core/utils/token';
import { MODULE_LOGIN_PATHS, getModuleFromPathname } from '@core/utils/sessionExpiry';
import { buildLoginRedirectState } from '@core/utils/postLoginRedirect';

// requiredRole values used by callers ("user") map onto the AuthContext authData keys ("customer").
const ROLE_ALIASES = {
    user: 'customer',
};

const getDefaultLoginPath = (pathname) => MODULE_LOGIN_PATHS[getModuleFromPathname(pathname)];

const ProtectedRoute = ({ children, requiredRole, loginPath }) => {
    const { isAuthenticated, isLoading, authData } = useAuth();
    const location = useLocation();

    // When a specific role is required, check that role's own token rather than
    // whichever role the current URL happens to resolve to.
    let authenticatedForRoute = isAuthenticated;
    let roleToken = null;
    if (requiredRole) {
        const roleKey = ROLE_ALIASES[requiredRole] || requiredRole;
        roleToken = authData?.[roleKey];
        authenticatedForRoute = Boolean(roleToken) && !isTokenExpired(roleToken);
    } else {
        const module = getModuleFromPathname(location.pathname);
        const roleKey = ROLE_ALIASES[module] || module;
        roleToken = authData?.[roleKey] || authData?.[module];
        if (roleToken && !isTokenExpired(roleToken)) {
            authenticatedForRoute = true;
        }
    }

    // Only block with a spinner on the initial bootstrap — never unmount an
    // already-authenticated panel during silent token/profile refreshes.
    if (isLoading && !authenticatedForRoute && !roleToken) {
        return (
            <div className="flex h-screen w-full items-center justify-center">
                <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary-500 border-t-transparent"></div>
            </div>
        );
    }

    if (!authenticatedForRoute) {
        const redirectTo = loginPath || getDefaultLoginPath(location.pathname);
        return <Navigate to={redirectTo} state={buildLoginRedirectState(location)} replace />;
    }

    return <>{children}</>;
};

export default ProtectedRoute;
