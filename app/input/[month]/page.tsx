"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Status = "yes" | "maybe" | "no";
type Slot = "am" | "pm";

type Person = { id: string; name: string };
type DateRow = { date: string; label: string };

const slotLabel = (s: Slot) => (s === "am" ? "午前" : "午後");

export default function InputPage() {
  const router = useRouter();
  const params = useParams<{ month: string }>();
  const monthKey = params.month;

  const [scheduleId, setScheduleId] = useState<string>("");
  const [dates, setDates] = useState<DateRow[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [participantId, setParticipantId] = useState("");

  // answers[date][slot] = {status, note}
  const [answers, setAnswers] = useState<
    Record<string, Record<Slot, { status: Status; note: string }>>
  >({});

  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // 初期ロード：schedule / dates / people
  useEffect(() => {
    (async () => {
      setLoading(true);
      setMsg("");

      const { data: s, error: sErr } = await supabase
        .from("schedules")
        .select("id,key,title")
        .eq("key", monthKey)
        .single();
      if (sErr) {
        setLoading(false);
        return setMsg(`月が見つかりません: ${sErr.message}`);
      }
      setScheduleId(s.id);

      const { data: d, error: dErr } = await supabase
        .from("schedule_dates")
        .select("date,label,sort_order")
        .eq("schedule_id", s.id)
        .order("sort_order", { ascending: true })
        .order("date", { ascending: true });
      if (dErr) {
        setLoading(false);
        return setMsg(`日付取得エラー: ${dErr.message}`);
      }

      const dateRows: DateRow[] = (d ?? []).map((x: any) => ({
        date: x.date,
        label: x.label ?? x.date,
      }));
      setDates(dateRows);

      // ✅ 未入力はデフォルト○（午前/午後ともに）
      const init: Record<string, Record<Slot, { status: Status; note: string }>> = {};
      for (const r of dateRows) {
        init[r.date] = {
          am: { status: "yes", note: "" },
          pm: { status: "yes", note: "" },
        };
      }
      setAnswers(init);

      const { data: p, error: pErr } = await supabase
        .from("participants")
        .select("id,name")
        .order("name", { ascending: true });
      if (pErr) {
        setLoading(false);
        return setMsg(`入力者取得エラー: ${pErr.message}`);
      }
      setPeople(p ?? []);

      setLoading(false);
    })();
  }, [monthKey]);

  // 入力者を選んだら既存回答を読み込み→上書き（なければデフォルト○）
  useEffect(() => {
    if (!scheduleId || !participantId || !dates.length) return;

    (async () => {
      setMsg("");

      // ベース（デフォルト○）を再作成（人を切り替えたときに前の人の値が残らない）
      const base: Record<string, Record<Slot, { status: Status; note: string }>> = {};
      for (const d of dates) {
        base[d.date] = {
          am: { status: "yes", note: "" },
          pm: { status: "yes", note: "" },
        };
      }

      const { data: existing, error } = await supabase
        .from("schedule_responses")
        .select("date,time_slot,status,note")
        .eq("schedule_id", scheduleId)
        .eq("participant_id", participantId);

      if (error) {
        setAnswers(base);
        return setMsg(`既存回答の取得に失敗しました: ${error.message}`);
      }

      for (const row of existing ?? []) {
        if (!base[row.date]) continue;
        const slot = row.time_slot as Slot;
        base[row.date][slot] = {
          status: row.status as Status,
          note: (row.note ?? "") as string,
        };
      }

      setAnswers(base);
    })();
  }, [scheduleId, participantId, dates]);

  const setStatus = (date: string, slot: Slot, status: Status) => {
    setAnswers((prev) => ({
      ...prev,
      [date]: { ...prev[date], [slot]: { ...prev[date][slot], status } },
    }));
  };

  const setNote = (date: string, slot: Slot, note: string) => {
    setAnswers((prev) => ({
      ...prev,
      [date]: { ...prev[date], [slot]: { ...prev[date][slot], note } },
    }));
  };

  const onSave = async () => {
    setMsg("");
    if (!scheduleId) return;
    if (!participantId) return setMsg("入力者を選択してください。");

    // デフォルト○なので、全件（date×slot）を upsert で確定保存
    const rows = dates.flatMap((d) =>
      (["am", "pm"] as Slot[]).map((slot) => ({
        schedule_id: scheduleId,
        participant_id: participantId,
        date: d.date,
        time_slot: slot,
        status: answers[d.date]?.[slot]?.status ?? "yes",
        note: answers[d.date]?.[slot]?.note?.trim() || null,
      }))
    );

    setSaving(true);
    try {
      const { error } = await supabase
        .from("schedule_responses")
        .upsert(rows, { onConflict: "schedule_id,participant_id,date,time_slot" });

      if (error) return setMsg(`保存に失敗しました: ${error.message}`);

      router.push(`/?month=${encodeURIComponent(monthKey)}`);
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ margin: "8px 0 14px" }}>入力（{monthKey}）</h1>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          入力者：
          <select value={participantId} onChange={(e) => setParticipantId(e.target.value)} disabled={loading}>
            <option value="">選択してください</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        <button onClick={onSave} disabled={saving || loading || !participantId} style={btn}>
          {saving ? "保存中..." : "保存して集計へ"}
        </button>

        <button onClick={() => router.push(`/?month=${encodeURIComponent(monthKey)}`)} style={btn}>
          戻る（集計）
        </button>
      </div>

      {msg && <p style={{ color: "crimson" }}>{msg}</p>}
      {loading ? (
        <p>読み込み中...</p>
      ) : (
        <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "160px 1fr 280px 1fr 280px",
              padding: 12,
              background: "#f7f7f7",
              gap: 12,
            }}
          >
            <strong>日付</strong>
            <strong>午前</strong>
            <strong>午前 備考</strong>
            <strong>午後</strong>
            <strong>午後 備考</strong>
          </div>

          {dates.map((d) => (
            <div
              key={d.date}
              style={{
                display: "grid",
                gridTemplateColumns: "160px 1fr 280px 1fr 280px",
                padding: 12,
                borderTop: "1px solid #eee",
                gap: 12,
                alignItems: "center",
              }}
            >
              <div>{d.label}</div>

              {/* 午前 */}
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {(["yes", "maybe", "no"] as Status[]).map((st) => (
                  <label key={`am-${st}`}>
                    <input
                      type="radio"
                      name={`${d.date}-am`}
                      checked={answers[d.date]?.am?.status === st}
                      onChange={() => setStatus(d.date, "am", st)}
                    />{" "}
                    {st === "yes" ? "○" : st === "maybe" ? "△" : "×"}
                  </label>
                ))}
              </div>
              <input
                value={answers[d.date]?.am?.note ?? ""}
                onChange={(e) => setNote(d.date, "am", e.target.value)}
                placeholder="例：午前は遅れる"
                style={noteInput}
              />

              {/* 午後 */}
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {(["yes", "maybe", "no"] as Status[]).map((st) => (
                  <label key={`pm-${st}`}>
                    <input
                      type="radio"
                      name={`${d.date}-pm`}
                      checked={answers[d.date]?.pm?.status === st}
                      onChange={() => setStatus(d.date, "pm", st)}
                    />{" "}
                    {st === "yes" ? "○" : st === "maybe" ? "△" : "×"}
                  </label>
                ))}
              </div>
              <input
                value={answers[d.date]?.pm?.note ?? ""}
                onChange={(e) => setNote(d.date, "pm", e.target.value)}
                placeholder="例：午後なら参加可能"
                style={noteInput}
              />
            </div>
          ))}
        </div>
      )}

      <p style={{ marginTop: 10, color: "#666" }}>
        ※未入力は午前/午後ともにデフォルトで○表示。<br />
        ※入力者を切り替えると、その人の既存入力が復元されます。
      </p>
    </main>
  );
}

const btn: React.CSSProperties = {
  padding: "8px 12px",
  border: "1px solid #ddd",
  borderRadius: 10,
  cursor: "pointer",
};

const noteInput: React.CSSProperties = {
  padding: "10px 12px",
  border: "1px solid #ddd",
  borderRadius: 10,
  width: "100%",
};
