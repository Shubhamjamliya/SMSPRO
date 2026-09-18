import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@core/context/AuthContext';
import { isTokenExpired } from '@core/utils/token';

const RoleGuard = ({ children, allowedRoles }) => {
    const { role, isAuthenticated, isLoading, authData } = useAuth();

    const roleToken = authData?.[role];
    const hasRoleToken = Boolean(roleToken) && !isTokenExpired(roleToken);

    // Don't unmount the panel while auth is doing a silent profile refresh.
    if (isLoading && !isAuthenticated && !hasRoleToken) {
        return null; // Let ProtectedRoute handle the loading spinner
    }

    if ((!isAuthenticated && !hasRoleToken) || !role || !allowedRoles.includes(role)) {
        // Redirect to their respective dashboard if they are logged in but trying to access the wrong area
        if ((isAuthenticated || hasRoleToken) && role) {
            return <Navigate to={`/${role}`} replace />;
        }
        return <Navigate to="/unauthorized" replace />;
    }

    return <>{children}</>;
};

export default RoleGuard;
