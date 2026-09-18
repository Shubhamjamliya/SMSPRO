import React from "react";
import { Link } from "react-router-dom";

/**
 * Floating pill bottom nav for all user modules.
 * Outer cream stadium + nested peach capsule on the active tab.
 */
export default function UserBottomNav({ items = [], ariaLabel = "Navigation" }) {
  return (
    <nav
      className="md:hidden pointer-events-none fixed inset-x-0 bottom-0 z-[500] px-5 pb-4"
      aria-label={ariaLabel}
    >
      <div className="pointer-events-auto mx-auto flex h-[62px] max-w-[400px] items-center rounded-full bg-[#F6F3EE] p-[5px] shadow-[0_10px_28px_rgba(28,25,23,0.14)] dark:bg-[#1c1c1c] dark:shadow-[0_10px_28px_rgba(0,0,0,0.45)]">
        {items.map((item) => {
          const Icon = item.icon;
          const active = Boolean(item.active);
          const fillActive = item.fillWhenActive !== false;

          return (
            <Link
              key={item.id || item.to || item.label}
              to={item.to}
              state={item.state}
              aria-current={active ? "page" : undefined}
              className="flex h-full min-w-0 flex-1 items-center justify-center"
            >
              <span
                className={`flex h-full min-w-[4.5rem] flex-col items-center justify-center gap-[3px] rounded-full px-3.5 ${
                  active ? "bg-[#FFD9BE]" : "bg-transparent"
                }`}
              >
                <Icon
                  className={`h-5 w-5 shrink-0 ${
                    active
                      ? `text-[#FF6A00]${fillActive ? " fill-[#FF6A00]" : ""}`
                      : "text-[#7A7A7A] dark:text-neutral-400"
                  }`}
                  strokeWidth={active ? 2.4 : 1.75}
                />
                <span
                  className={`whitespace-nowrap text-[11px] leading-none ${
                    active
                      ? "font-semibold text-[#FF6A00]"
                      : "font-medium text-[#7A7A7A] dark:text-neutral-400"
                  }`}
                >
                  {item.label}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
