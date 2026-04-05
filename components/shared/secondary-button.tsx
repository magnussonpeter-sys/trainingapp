"use client";

import Link from "next/link";

type SecondaryButtonBaseProps = {
  children: React.ReactNode;
  className?: string;
};

type SecondaryButtonAsButtonProps = SecondaryButtonBaseProps & {
  href?: never;
  onClick?: () => void;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
};

type SecondaryButtonAsLinkProps = SecondaryButtonBaseProps & {
  href: string;
  onClick?: never;
  type?: never;
  disabled?: never;
};

type SecondaryButtonProps =
  | SecondaryButtonAsButtonProps
  | SecondaryButtonAsLinkProps;

// Sekundär knapp för sidoval och mindre viktiga CTA.
export default function SecondaryButton(props: SecondaryButtonProps) {
  const baseClassName = `inline-flex min-h-[48px] items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 ${props.className ?? ""}`.trim();

  if ("href" in props && props.href) {
    return (
      <Link href={props.href} className={baseClassName}>
        {props.children}
      </Link>
    );
  }

  return (
    <button
      type={props.type ?? "button"}
      onClick={props.onClick}
      disabled={props.disabled}
      className={`${baseClassName} disabled:cursor-not-allowed disabled:opacity-60`.trim()}
    >
      {props.children}
    </button>
  );
}