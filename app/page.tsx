"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function InputPage() {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [message, setMessage] = useState("");

  const onSubmit = () => {
    if (!title) {
      setMessage("タイトルを入力してください");
      return;
    }

    // 仮：保存処理（あとでSupabaseに差し替える）
    console.log({
      title,
      content,
    });

    setMessage("保存しました");

    // 例：保存後にトップへ戻る
    // router.push("/");
  };

  return (
    <main style={{ padding: 24, maxWidth: 600 }}>
      <h2>内容入力</h2>

      <div style={{ display: "grid", gap: 16 }}>
        <label>
          タイトル
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{ width: "100%", padding: 8 }}
          />
        </label>

        <label>
          内容
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={5}
            style={{ width: "100%", padding: 8 }}
          />
        </label>

        <button onClick={onSubmit} style={{ padding: "8px 16px" }}>
          保存
        </button>

        {message && <p>{message}</p>}
      </div>
    </main>
  );
}
