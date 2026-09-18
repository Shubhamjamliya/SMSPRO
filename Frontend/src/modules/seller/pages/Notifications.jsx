import React, { useEffect, useState } from 'react';
import { sellerApi } from '../services/sellerApi';
import { HiOutlineBell, HiOutlineCheckCircle, HiOutlineExclamationCircle, HiOutlineClock } from 'react-icons/hi2';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import Card from '@shared/components/ui/Card';

const Notifications = () => {
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchNotifications = async () => {
        try {
            const response = await sellerApi.getNotifications();
            if (response.data.success) {
                setNotifications(response.data.result.notifications);
            }
        } catch (error) {
            console.error("Fetch Error:", error);
            toast.error("Failed to load notifications");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchNotifications();
    }, []);

    const handleMarkAsRead = async (id) => {
        try {
            await sellerApi.markNotificationRead(id);
            fetchNotifications();
        } catch (error) {
            toast.error("Failed to mark as read");
        }
    };

    const handleMarkAllAsRead = async () => {
        try {
            await sellerApi.markAllNotificationsRead();
            fetchNotifications();
            toast.success("All notifications marked as read!");
        } catch (error) {
            toast.error("Failed to mark all as read");
        }
    };

    if (loading) {
        return (
            <div className="p-6 md:p-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                <h1 className="ds-h1 mb-6">Notifications</h1>
                <div className="flex items-center justify-center min-h-[300px]">
                    <p className="text-sm font-semibold text-slate-500">Loading notifications...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 md:p-8 max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="ds-h1">Notifications</h1>
                    <p className="ds-description mt-2">Stay updated with your latest alerts and activities.</p>
                </div>
                {notifications.length > 0 && notifications.some(n => !n.isRead) && (
                    <button
                        onClick={handleMarkAllAsRead}
                        className="px-4 py-2 bg-primary/10 text-primary rounded-xl text-xs font-bold hover:bg-primary/20 transition-colors"
                    >
                        Mark all as read
                    </button>
                )}
            </div>

            <Card className="p-0 overflow-hidden bg-white/70 backdrop-blur-xl border border-slate-100 shadow-sm rounded-2xl">
                {notifications.length > 0 ? (
                    <div className="divide-y divide-slate-100">
                        {notifications.map((notif) => (
                            <div
                                key={notif._id}
                                className={cn(
                                    "p-5 hover:bg-slate-50/80 transition-all cursor-pointer group relative",
                                    !notif.isRead && "bg-primary/[0.03]"
                                )}
                                onClick={() => !notif.isRead && handleMarkAsRead(notif._id)}
                            >
                                {!notif.isRead && (
                                    <div className="absolute left-0 top-0 bottom-0 w-1 rounded-r-full bg-primary" />
                                )}
                                <div className="flex gap-4">
                                    <div className={cn(
                                        "h-12 w-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105 shadow-sm",
                                        notif.type === 'order' ? "bg-emerald-50 text-emerald-600 border border-emerald-100" :
                                            notif.type === 'payment' ? "bg-amber-50 text-amber-600 border border-amber-100" :
                                                "bg-primary/5 text-primary border border-primary/10"
                                    )}>
                                        {notif.type === 'order' ? <HiOutlineCheckCircle size={24} /> :
                                            notif.type === 'payment' ? <HiOutlineClock size={24} /> :
                                                <HiOutlineExclamationCircle size={24} />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between mb-1.5">
                                            <p className={cn(
                                                "text-sm font-black tracking-tight truncate",
                                                notif.isRead ? "text-slate-600" : "text-slate-900"
                                            )}>
                                                {notif.title}
                                            </p>
                                            <span className="text-[10px] font-bold text-slate-400 whitespace-nowrap ml-4">
                                                {new Date(notif.createdAt).toLocaleString(undefined, {
                                                    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                                                })}
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-500 font-medium leading-relaxed">
                                            {notif.message}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="py-20 px-6 text-center">
                        <div className="h-20 w-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6 border border-slate-100 shadow-sm">
                            <HiOutlineBell className="h-10 w-10 text-slate-300" />
                        </div>
                        <h3 className="text-lg font-black text-slate-900 mb-2">No notifications yet</h3>
                        <p className="text-sm text-slate-500 font-medium max-w-sm mx-auto">
                            When you receive new orders, payments, or important updates, they will appear here.
                        </p>
                    </div>
                )}
            </Card>
        </div>
    );
};

export default Notifications;
