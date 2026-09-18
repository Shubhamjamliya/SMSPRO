import React, { createContext, useContext } from 'react';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/services/api/errors';
import { notifyApiError } from '@/services/api/networkToast';

const ToastContext = createContext(undefined);

export const ToastProvider = ({ children }) => {
    const showToast = (message, type = 'info') => {
        // Accept Error / Axios error objects — never surface technical text.
        const text =
            message && typeof message === 'object'
                ? getApiErrorMessage(message)
                : String(message || '');

        switch (type) {
            case 'success':
                toast.success(text);
                break;
            case 'error':
                if (message && typeof message === 'object') {
                    notifyApiError(message, { force: true });
                } else {
                    toast.error(text);
                }
                break;
            case 'warning':
                toast.warning(text);
                break;
            case 'info':
            default:
                toast.info(text);
                break;
        }
    };

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
        </ToastContext.Provider>
    );
};

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) throw new Error('useToast must be used within a ToastProvider');
    return context;
};

