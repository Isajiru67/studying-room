import Link from "next/link";

export default async function CompletePage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;

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
