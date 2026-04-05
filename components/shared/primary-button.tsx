"use client";

type PrimaryButtonProps = {
  children: React.ReactNode;
  onClick?: () => void;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  className?: string;
};

// Primär knapp för huvud-CTA i appen.
export default function PrimaryButton({
  children,
  onClick,
  type = "button",
  disabled = false,
  className = "",
}: PrimaryButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-[56px] items-center justify-center rounded-2xl bg-indigo-600 px-5 py-4 text-base font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60 ${className}`.trim()}
    >
      {children}
    </button>
  );
}