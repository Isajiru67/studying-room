import { Suspense } from "react";
import Link from "next/link";
import CompleteBody from "./CompleteBody";

export default function CompletePage() {
  return (
    <main style={{ padding: 24 }}>
      <Suspense fallback={<p>読み込み中...</p>}>
        <CompleteBody />
      </Suspense>

      <div style={{ marginTop: 24 }}>
        <Link href="/input">続けて入力する</Link>
        <br />
        <Link href="/">トップへ戻る</Link>
      </div>
    </main>
  );
}
