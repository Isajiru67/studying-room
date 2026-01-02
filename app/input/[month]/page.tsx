"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Status = "yes" | "maybe" | "no";
type Slot = "am" | "pm";

type Person = { id: string; name: string };
type DateRow = { date: string; label: string };

type Answers = Record<
  string,
  {
    note: string; // 日付ごとに1つ（午前/午後共通）
    am: { status: Status };
    pm: { status: Status };
  }
>;

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

  const title = useMemo(() => `入力（${monthKey}）`, [monthKey]);

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

      // ✅ ベース（未入力はデフォルト○、備考空）
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

  // 入力者を選んだら既存回答を読み込み→上書き（なければデフォルト○）
  useEffect(() => {
    if (!scheduleId || !participantId || !dates.length) return;

    (async () => {
      setMsg("");

      // ベース（デフォルト○）を再作成（人切替で前の人の値が残らない）
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

      for (const row of existing ?? []) {
        if (!base[row.date]) continue;
        const slot = row.time_slot as Slot;

        if (slot === "am") {
          base[row.date].am.status = row.status as Status;
          base[row.date].note = (row.note ?? "") as string; // 共通備考はam側
        } else {
          base[row.date].pm.status = row.status as Status;
        }
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
      [date]: { ...prev[date], note },
    }));
  };

  const onSave = async () => {
    setMsg("");
    if (!scheduleId) return;
    if (!participantId) return setMsg("入力者を選択してください。");

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
    <main style={{ padding: 16, maxWidth: 1100, margin: "0 auto" }}>
      {/* 表示切り替え用CSS（PCは表、スマホはカード） */}
      <style jsx>{`
        .desktopOnly { display: none; }
        .mobileOnly { display: block; }

    

        /* スマホ用 保存バー */
  .mobileSaveBar {
    display: block;
    position: sticky;
    bottom: 0;
    padding: 10px 12px env(safe-area-inset-bottom);
    background: rgba(255, 255, 255, 0.95);
    border-top: 1px solid #eee;
    margin-top: 16px;
  }
        @media (min-width: 768px) {
          .desktopOnly { display: block; }
          .mobileOnly { display: none; }
          .mobileSaveBar { display: none; }
        }
      `}</style>

      <h1 style={{ margin: "6px 0 12px" }}>{title}</h1>

      {/* 上部コントロール */}
      <div style={topBar}>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          入力者：
          <select
            value={participantId}
            onChange={(e) => setParticipantId(e.target.value)}
            disabled={loading}
          >
            <option value="">選択してください</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={onSave}
            disabled={saving || loading || !participantId}
            style={primaryBtn}
          >
            {saving ? "保存中..." : "保存して集計へ"}
          </button>
          <button
            onClick={() => router.push(`/?month=${encodeURIComponent(monthKey)}`)}
            style={btn}
          >
            戻る
          </button>
        </div>
      </div>

      {msg && <p style={{ color: "crimson", marginTop: 10 }}>{msg}</p>}
      {loading && <p style={{ marginTop: 10 }}>読み込み中...</p>}

      {/* 入力者未選択時：ここで止める */}
      {!loading && !participantId && (
        <div style={hintBox}>
          <strong>最初に「入力者」を選択してください</strong>
          <div style={{ marginTop: 6, color: "#666", fontSize: 13 }}>
            入力者を選ぶと、その人の過去入力が読み込まれて編集できるようになります。
          </div>
        </div>
      )}

      {/* 入力者選択後のみ、日付入力UIを表示 */}
      {participantId && !loading && (
        <>
          {/* ===== PC（元の表形式） ===== */}
          <div className="desktopOnly" style={{ marginTop: 14 }}>
            <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, overflowX: "auto", background: "#fff" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "160px 1fr 1fr 420px",
                  padding: 12,
                  background: "#f7f7f7",
                  gap: 12,
                  minWidth: 980,
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
                    minWidth: 980,
                  }}
                >
                  <div>{d.label}</div>

                  <StatusButtons
                    value={answers[d.date]?.am?.status ?? "yes"}
                    onChange={(v) => setStatus(d.date, "am", v)}
                    size="md"
                  />

                  <StatusButtons
                    value={answers[d.date]?.pm?.status ?? "yes"}
                    onChange={(v) => setStatus(d.date, "pm", v)}
                    size="md"
                  />

                  <input
                    value={answers[d.date]?.note ?? ""}
                    onChange={(e) => setNote(d.date, e.target.value)}
                    placeholder="例：午後は途中参加 / どちらも遅れる など"
                    style={noteInput}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* ===== スマホ（カード形式） ===== */}
          <div className="mobileOnly" style={{ marginTop: 14 }}>
            <div style={{ display: "grid", gap: 12 }}>
              {dates.map((d) => (
                <section key={d.date} style={card}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
                    <strong style={{ fontSize: 16 }}>{d.label}</strong>
                    <span style={{ color: "#777", fontSize: 12 }}>{d.date}</span>
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <div style={slotLabel}>午前</div>
                    <StatusButtons
                      value={answers[d.date]?.am?.status ?? "yes"}
                      onChange={(v) => setStatus(d.date, "am", v)}
                      size="lg"
                    />
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <div style={slotLabel}>午後</div>
                    <StatusButtons
                      value={answers[d.date]?.pm?.status ?? "yes"}
                      onChange={(v) => setStatus(d.date, "pm", v)}
                      size="lg"
                    />
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <div style={slotLabel}>備考（共通）</div>
                    <textarea
                      value={answers[d.date]?.note ?? ""}
                      onChange={(e) => setNote(d.date, e.target.value)}
                      placeholder="例：午後は途中参加 / どちらも遅れる など"
                      style={noteArea}
                      rows={2}
                    />
                  </div>
                </section>
              ))}
            </div>
          </div>

          <p style={{ marginTop: 14, color: "#666", fontSize: 13 }}>
            ※未入力は午前/午後ともにデフォルトで○表示。<br />
            ※備考は日付ごとに1つで、午前側（am）に保存します。
          </p>
        </>
      )}
      {/* スマホ用：下固定 保存バー */}
<div className="mobileSaveBar">
  <button
    onClick={onSave}
    disabled={saving || loading || !participantId}
    style={{
      width: "100%",
      padding: "14px 16px",
      borderRadius: 14,
      border: "1px solid #111",
      background: "#111",
      color: "#fff",
      fontSize: 16,
      fontWeight: 700,
    }}
  >
    {saving ? "保存中..." : "保存して集計へ"}
  </button>
</div>

    </main>
  );
}

function StatusButtons({
  value,
  onChange,
  size = "lg",
}: {
  value: Status;
  onChange: (v: Status) => void;
  size?: "md" | "lg";
}) {
  const items: { v: Status; label: string; hint: string }[] = [
    { v: "yes", label: "○", hint: "参加" },
    { v: "maybe", label: "△", hint: "未定" },
    { v: "no", label: "×", hint: "不参加" },
  ];

  const btnStyle = size === "lg" ? segBtnLg : segBtnMd;

  return (
    <div style={segWrap} role="group" aria-label="出欠選択">
      {items.map((it) => {
        const active = value === it.v;
        return (
          <button
            key={it.v}
            type="button"
            onClick={() => onChange(it.v)}
            aria-pressed={active}
            style={{
              ...btnStyle,
              ...(active ? segBtnActive : {}),
            }}
          >
            <div style={{ fontSize: size === "lg" ? 20 : 18, fontWeight: 800, lineHeight: 1 }}>
              {it.label}
            </div>
            <div style={{ fontSize: 12, color: active ? "#111" : "#666", marginTop: 4 }}>{it.hint}</div>
          </button>
        );
      })}
    </div>
  );
}

/* styles */
const topBar: React.CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "center",
  justifyContent: "space-between",
  flexWrap: "wrap",
  padding: "10px 12px",
  border: "1px solid #eee",
  borderRadius: 12,
  background: "#fff",
};

const btn: React.CSSProperties = {
  padding: "10px 12px",
  border: "1px solid #ddd",
  borderRadius: 12,
  background: "#fff",
  cursor: "pointer",
  touchAction: "manipulation",
};

const primaryBtn: React.CSSProperties = {
  ...btn,
  border: "1px solid #333",
  fontWeight: 700,
};

const hintBox: React.CSSProperties = {
  marginTop: 14,
  padding: "12px 14px",
  border: "1px solid #e5e5e5",
  borderRadius: 12,
  background: "#fff",
};

const card: React.CSSProperties = {
  border: "1px solid #e5e5e5",
  borderRadius: 14,
  background: "#fff",
  padding: 12,
};

const slotLabel: React.CSSProperties = {
  fontSize: 12,
  color: "#666",
  marginBottom: 6,
};

const segWrap: React.CSSProperties = {
  display: "flex",
  gap: 10,
};

const segBtnLg: React.CSSProperties = {
  flex: 1,
  minHeight: 56, // スマホで押しやすい
  padding: "10px 0",
  borderRadius: 14,
  border: "1px solid #ddd",
  background: "#fff",
  cursor: "pointer",
  touchAction: "manipulation",
};

const segBtnMd: React.CSSProperties = {
  flex: 1,
  minHeight: 44,
  padding: "8px 0",
  borderRadius: 12,
  border: "1px solid #ddd",
  background: "#fff",
  cursor: "pointer",
  touchAction: "manipulation",
};

const segBtnActive: React.CSSProperties = {
  border: "2px solid #111",
  background: "#f3f3f3",
};

const noteInput: React.CSSProperties = {
  padding: "10px 12px",
  border: "1px solid #ddd",
  borderRadius: 12,
  width: "100%",
};

const noteArea: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid #ddd",
  borderRadius: 12,
  resize: "vertical",
};
