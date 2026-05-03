import { Suspense } from "react";

import ReplaceBlockPageClient from "@/components/run/replace-block-page-client";

export default async function ReplaceBlockPage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = (await props.searchParams) ?? {};
  const userIdParam = Array.isArray(searchParams.userId)
    ? searchParams.userId[0]
    : searchParams.userId;
  const blockIndexParam = Array.isArray(searchParams.blockIndex)
    ? searchParams.blockIndex[0]
    : searchParams.blockIndex;

  return (
    <Suspense fallback={null}>
      <ReplaceBlockPageClient
        initialUserId={typeof userIdParam === "string" ? userIdParam : ""}
        initialBlockIndex={typeof blockIndexParam === "string" ? blockIndexParam : "0"}
      />
    </Suspense>
  );
}

