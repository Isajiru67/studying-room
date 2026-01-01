"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Status = "yes" | "maybe" | "no";
type Slot = "am" | "pm";

type Person = { id: string; name: string };
type DateRow = { date: string; label: string };

// answers[date] = { note, am.status, pm.status }
type Answers = Record<
  string,
  {
    note: string;
    am: { status: Status };
    pm: { status: Status };
  }
>;

const markLabel = (st: Status) => (st === "yes" ? "○" : st === "maybe" ? "△" : "×");

export default function InputPage() {
  const router = useRouter();
  const params = useParams<{ month: string }>();
  const monthKey = params.month;

  const [scheduleId, setScheduleId] = useState<string>("");
  const [dates, setDates] = useState<DateRow[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [participantId, setParticipantId] = useState("");

  const [answers, setAnswers] = useState<Answers>({});

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

      // ✅ 未入力はデフォルト○（午前/午後とも）＋備考は空
      const init: Answers = {};
      for (const r of dateRows) {
        init[r.date] = {
          note: "",
          am: { status: "yes" },
          pm: { status: "yes" },
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

  // 入力者を選んだら既存回答を読み込み→上書き（なければデフォルト○のまま）
  useEffect(() => {
    if (!scheduleId || !participantId || !dates.length) return;

    (async () => {
      setMsg("");

      // ベース（デフォルト○）を再作成（人切替で前の人の値が残らないように）
      const base: Answers = {};
      for (const d of dates) {
        base[d.date] = {
          note: "",
          am: { status: "yes" },
          pm: { status: "yes" },
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

      // 既存回答で上書き
      for (const row of existing ?? []) {
        if (!base[row.date]) continue;

        const slot = row.time_slot as Slot;

        // status は各slotごと
        if (slot === "am") base[row.date].am.status = row.status as Status;
        if (slot === "pm") base[row.date].pm.status = row.status as Status;

        // note は「午前側に保存されているもの」を共通備考として採用
        if (slot === "am") base[row.date].note = (row.note ?? "") as string;
      }

      setAnswers(base);
    })();
  }, [scheduleId, participantId, dates]);

  const setStatus = (date: string, slot: Slot, status: Status) => {
    setAnswers((prev) => ({
      ...prev,
      [date]: {
        ...prev[date],
        [slot]: { status },
      },
    }));
  };

  const setNote = (date: string, note: string) => {
    setAnswers((prev) => ({
      ...prev,
      [date]: {
        ...prev[date],
        note,
      },
    }));
  };

  const onSave = async () => {
    setMsg("");
    if (!scheduleId) return;
    if (!participantId) return setMsg("入力者を選択してください。");

    // 日付×slot を全件 upsert（デフォルト○も含めて確定保存）
    // note は am 側にだけ入れる（pmはnull）
    const rows = dates.flatMap((d) =>
      (["am", "pm"] as Slot[]).map((slot) => ({
        schedule_id: scheduleId,
        participant_id: participantId,
        date: d.date,
        time_slot: slot,
        status: answers[d.date]?.[slot]?.status ?? "yes",
        note: slot === "am" ? answers[d.date]?.note?.trim() || null : null,
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
              gridTemplateColumns: "160px 1fr 1fr 420px",
              padding: 12,
              background: "#f7f7f7",
              gap: 12,
            }}
          >
            <strong>日付</strong>
            <strong>午前</strong>
            <strong>午後</strong>
            <strong>備考（午前・午後共通）</strong>
          </div>

          {dates.map((d) => (
            <div
              key={d.date}
              style={{
                display: "grid",
                gridTemplateColumns: "160px 1fr 1fr 420px",
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
                  <label key={`${d.date}-am-${st}`}>
                    <input
                      type="radio"
                      name={`${d.date}-am`}
                      checked={answers[d.date]?.am?.status === st}
                      onChange={() => setStatus(d.date, "am", st)}
                    />{" "}
                    {markLabel(st)}
                  </label>
                ))}
              </div>

              {/* 午後 */}
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {(["yes", "maybe", "no"] as Status[]).map((st) => (
                  <label key={`${d.date}-pm-${st}`}>
                    <input
                      type="radio"
                      name={`${d.date}-pm`}
                      checked={answers[d.date]?.pm?.status === st}
                      onChange={() => setStatus(d.date, "pm", st)}
                    />{" "}
                    {markLabel(st)}
                  </label>
                ))}
              </div>

              {/* 共通備考 */}
              <input
                value={answers[d.date]?.note ?? ""}
                onChange={(e) => setNote(d.date, e.target.value)}
                placeholder="例：午後は途中参加 / どちらも遅れる など"
                style={noteInput}
              />
            </div>
          ))}
        </div>
      )}

      <p style={{ marginTop: 10, color: "#666" }}>
        ※未入力は午前/午後ともにデフォルトで○表示。<br />
        ※入力者を切り替えると、その人の既存入力が復元されます。<br />
        ※備考は日付ごとに1つで、午前側（am）に保存します。
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
