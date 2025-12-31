"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

export default function CompletePage() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");

  return (
    <main style={{ padding: 24 }}>
      <h2>完了</h2>
      <p>内容の登録が完了しました。</p>
      {id && <p>登録ID: {id}</p>}

      <div style={{ marginTop: 24 }}>
        <Link href="/input">続けて入力する</Link>
        <br />
        <Link href="/">トップへ戻る</Link>
      </div>
    </main>
  );
}
