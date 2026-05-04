"use client";

import Link from "next/link";

import { uiButtonClasses } from "@/lib/ui/button-classes";

type NavAction =
  | {
      label: string;
      href: string;
    }
  | undefined;

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function PageNavActions(props: {
  backAction?: NavAction;
  cancelAction?: NavAction;
  compact?: boolean;
}) {
  const hasActions = props.backAction || props.cancelAction;

  if (!hasActions) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3",
        props.compact ? "" : "pb-1",
      )}
    >
      {props.backAction ? (
        <Link href={props.backAction.href} className={uiButtonClasses.ghost}>
          {props.backAction.label}
        </Link>
      ) : null}

      {props.cancelAction ? (
        <Link href={props.cancelAction.href} className={uiButtonClasses.secondary}>
          {props.cancelAction.label}
        </Link>
      ) : null}
    </div>
  );
}

