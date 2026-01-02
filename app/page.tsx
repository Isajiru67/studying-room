import { Suspense } from "react";
import HomeClient from "./_components/HomeClient";

export const metadata = {
  title: "参加状況 | 出欠管理",
};

export default function Page() {
  return (
    <Suspense fallback={<main style={{ padding: 24 }}>読み込み中...</main>}>
      <HomeClient />
    </Suspense>
  );
}
