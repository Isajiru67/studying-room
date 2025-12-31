"use client";

import { useSearchParams } from "next/navigation";

export default function CompleteBody() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");

  return (
    <>
      <h2>完了</h2>
      <p>内容の登録が完了しました。</p>
      {id && <p>登録ID: {id}</p>}
    </>
  );
}
