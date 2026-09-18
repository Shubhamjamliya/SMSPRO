import React from "react";
import { cn } from "@/lib/utils";

/**
 * Clean Mobile App Layout Wrapper.
 * - Applies the exact same mobile CSS layout & styling up to 650px container width.
 * - No fake device frame, bezels, or camera notches.
 */
export default function AppMobileFrame({ children, className, bgClassName = "bg-white dark:bg-[#0a0a0a]" }) {
  return (
    <div className="min-h-screen w-full bg-slate-100/70 dark:bg-black text-slate-900 dark:text-slate-100 font-sans selection:bg-orange-500/20">
      <div
        className={cn(
          "w-full max-w-[650px] mx-auto min-h-screen relative flex flex-col justify-between overflow-x-hidden border-x border-slate-200/70 dark:border-slate-800/70 shadow-xs",
          bgClassName,
          className
        )}
      >
        <div className="w-full min-w-0 flex-1 flex flex-col justify-between">
          {children}
        </div>
      </div>
    </div>
  );
}
