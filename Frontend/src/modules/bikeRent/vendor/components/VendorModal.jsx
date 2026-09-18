import { X } from "lucide-react";

const SIZE_CLASSES = {
  md: "max-w-md",
  lg: "max-w-2xl",
  xl: "max-w-5xl",
};

export default function VendorModal({ open, title, onClose, children, wide = false, size }) {
  if (!open) return null;
  const resolvedSize = size || (wide ? "lg" : "md");
  return (
    <div className="fixed inset-0 z-600 flex items-center justify-center bg-black/30 px-4 backdrop-blur-[2px]">
      <div
        className={`max-h-[90vh] w-full overflow-y-auto rounded-3xl border border-slate-100 bg-white p-6 shadow-2xl ${
          SIZE_CLASSES[resolvedSize] || SIZE_CLASSES.md
        }`}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold leading-none tracking-tight text-gray-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm p-1 text-gray-400 opacity-70 transition-opacity hover:opacity-100 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
