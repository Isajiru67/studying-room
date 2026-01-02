"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Person = { id: string; name: string };


export default function ParticipantsPage() {
  const router = useRouter();
  const [list, setList] = useState<Person[]>([]);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");

  const load = async () => {
    const { data, error } = await supabase.from("participants").select("id,name").order("name", { ascending: true });
    if (error) return setMsg(error.message);
    setList(data ?? []);
  };

  useEffect(() => { load(); }, []);

  const add = async () => {
    setMsg("");
    const trimmed = name.trim();
    if (!trimmed) return setMsg("名前を入力してください。");

    const { error } = await supabase.from("participants").insert({ name: trimmed });
    if (error) return setMsg(`追加できません: ${error.message}`);

    setName("");
    await load();
  };

  const remove = async (id: string) => {
    if (!confirm("削除しますか？")) return;
    const { error } = await supabase.from("participants").delete().eq("id", id);
    if (error) return setMsg(`削除できません: ${error.message}`);
    await load();
  };

  return (
    <main style={{ padding: 24, maxWidth: 700, margin: "0 auto" }}>
      <h1 style={{ margin: "8px 0 14px" }}>参加者の新規登録・削除</h1>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="名前を追加" style={{ flex: 1, padding: "10px 12px", border: "1px solid #ddd", borderRadius: 10 }} />
        <button onClick={add} style={btn}>追加</button>
        <button onClick={() => router.push("/")} style={btn}>戻る</button>
      </div>

      {msg && <p style={{ color: "crimson" }}>{msg}</p>}

      <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, background: "#fff" }}>
        {list.map((p) => (
          <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: 12, borderTop: "1px solid #eee" }}>
            <span>{p.name}</span>
            <button onClick={() => remove(p.id)} style={btn}>削除</button>
          </div>
        ))}
        {!list.length && <div style={{ padding: 12, color: "#666" }}>まだ登録がありません。</div>}
      </div>
    </main>
  );
}



const btn: React.CSSProperties = { padding: "8px 12px", border: "1px solid #ddd", borderRadius: 10, cursor: "pointer" };
