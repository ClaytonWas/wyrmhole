import { useEffect } from "react";
import { createPortal } from "react-dom";
import { XIcon } from "./Icons";

type DetailModalProps = {
  isOpen: boolean;
  onClose: () => void;
  // Pre-styled icon wrapper (e.g. <div className="p-2 bg-yellow-50 rounded-xl">...</div>).
  // Cards control their own accent color this way.
  iconSlot?: React.ReactNode;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  // Optional footer slot — caller provides its own padding/border to fit the design.
  footer?: React.ReactNode;
};

export function DetailModal({
  isOpen,
  onClose,
  iconSlot,
  title,
  subtitle,
  children,
  footer,
}: DetailModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="rounded-3xl w-full max-w-md overflow-hidden"
        style={{
          background: "rgba(255, 255, 255, 0.85)",
          backdropFilter: "blur(40px)",
          WebkitBackdropFilter: "blur(40px)",
          border: "1px solid rgb(229, 231, 235)",
          boxShadow:
            "0 8px 32px 0 rgba(31, 38, 135, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.4)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              {iconSlot}
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold text-gray-900 truncate">{title}</h3>
                {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-100 active:bg-gray-200 transition-colors"
              title="Close (Esc)"
            >
              <XIcon className="w-5 h-5 fill-gray-500 hover:fill-gray-700" />
            </button>
          </div>
        </div>
        {children}
        {footer}
      </div>
    </div>,
    document.body,
  );
}
