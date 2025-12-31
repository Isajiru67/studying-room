"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function InputPage() {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const onSubmit = async () => {
    setMessage("");

    if (!title.trim()) {
      setMessage("タイトルを入力してください");
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("posts")
        .insert({
          title: title.trim(),
          content: content.trim() || null,
        })
        .select("id")
        .single();

      if (error) {
        setMessage("保存に失敗しました: " + error.message);
        return;
      }

      // 完了画面へ（IDを渡したいならクエリで渡せます）
      router.push(`/complete?id=${data.id}`);
    } finally {
      setSaving(false);
    }
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

        <button onClick={onSubmit} disabled={saving} style={{ padding: "8px 16px" }}>
          {saving ? "保存中..." : "保存"}
        </button>

        {message && <p style={{ color: "crimson" }}>{message}</p>}
      </div>
    </main>
  );
}
