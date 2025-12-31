"use client";

import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Status = "yes" | "no" | "maybe";
type Row = { dateISO: string; label: string };

function formatJP(date: Date) {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const w = ["日", "月", "火", "水", "木", "金", "土"][date.getDay()];
  return `${m}/${d}(${w})`;
}

function getWeekendRowsJan2026JST(): Row[] {
  const rows: Row[] = [];
  for (let day = 1; day <= 31; day++) {
    const iso = `2026-01-${String(day).padStart(2, "0")}`;
    const date = new Date(`${iso}T00:00:00+09:00`);
    const dow = date.getDay();
    if (dow === 0 || dow === 6) rows.push({ dateISO: iso, label: formatJP(date) });
  }
  return rows;
}

type Answer = { status: Status | ""; note: string };

export default function Jan2026WeekendPage() {
  const weekends = useMemo(() => getWeekendRowsJan2026JST(), []);

  const [name, setName] = useState("");
  const [answers, setAnswers] = useState<Record<string, Answer>>(() => {
    const init: Record<string, Answer> = {};
    for (const w of weekends) init[w.dateISO] = { status: "", note: "" };
    return init;
  });

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const setStatus = (dateISO: string, status: Status) => {
    setAnswers((p) => ({ ...p, [dateISO]: { ...p[dateISO], status } }));
  };

  const setNote = (dateISO: string, note: string) => {
    setAnswers((p) => ({ ...p, [dateISO]: { ...p[dateISO], note } }));
  };

  const onSubmit = async () => {
    setMsg("");
    const trimmed = name.trim();
    if (!trimmed) return setMsg("名前を入力してください。");

    setSaving(true);
    try {
      // participants upsert
      const { data: p, error: pErr } = await supabase
        .from("participants")
        .upsert({ name: trimmed }, { onConflict: "name" })
        .select("id")
        .single();
      if (pErr) throw new Error(pErr.message);

      // 回答 upsert（statusが入ってる行のみ）
      const rows = weekends
        .filter((w) => {
          const st = answers[w.dateISO].status;
          return st === "yes" || st === "no" || st === "maybe";
        })
        .map((w) => ({
          participant_id: p.id,
          date: w.dateISO,
          status: answers[w.dateISO].status as Status,
          note: answers[w.dateISO].note.trim() || null,
        }));

      if (!rows.length) return setMsg("参加/不参加/△ を1つ以上選択してください。");

      const { error: rErr } = await supabase
        .from("weekend_responses")
        .upsert(rows, { onConflict: "participant_id,date" });

      if (rErr) throw new Error(rErr.message);

      setMsg("保存しました！");
    } catch (e) {
      setMsg(e instanceof Error ? `保存に失敗しました: ${e.message}` : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main style={styles.page}>
      <h1 style={styles.h1}>2026年1月 土日の参加可否</h1>

      <section style={styles.card}>
        <label style={styles.label}>
          <div style={styles.labelTitle}>名前</div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例：伊佐次"
            style={styles.input}
          />
        </label>

        <p style={styles.help}>各日程を「参加 / △ / 不参加」で選び、必要なら備考も入力して保存してください。</p>

        <div style={styles.table}>
          <div style={{ ...styles.tr, ...styles.thRow }}>
            <div style={styles.th}>日程</div>
            <div style={styles.th}>回答</div>
            <div style={styles.th}>備考</div>
          </div>

          {weekends.map((w) => {
            const a = answers[w.dateISO];
            return (
              <div key={w.dateISO} style={styles.tr3}>
                <div style={styles.tdDate}>{w.label}</div>

                <div style={styles.td}>
                  <label style={styles.radio}>
                    <input
                      type="radio"
                      name={w.dateISO}
                      checked={a.status === "yes"}
                      onChange={() => setStatus(w.dateISO, "yes")}
                    />
                    参加
                  </label>
                  <label style={styles.radio}>
                    <input
                      type="radio"
                      name={w.dateISO}
                      checked={a.status === "maybe"}
                      onChange={() => setStatus(w.dateISO, "maybe")}
                    />
                    △
                  </label>
                  <label style={styles.radio}>
                    <input
                      type="radio"
                      name={w.dateISO}
                      checked={a.status === "no"}
                      onChange={() => setStatus(w.dateISO, "no")}
                    />
                    不参加
                  </label>
                </div>

                <div>
                  <input
                    value={a.note}
                    onChange={(e) => setNote(w.dateISO, e.target.value)}
                    placeholder="例：午後なら参加可能"
                    style={styles.noteInput}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div style={styles.footer}>
          <button onClick={onSubmit} disabled={saving} style={styles.button}>
            {saving ? "保存中..." : "保存"}
          </button>
          <span style={styles.msg}>{msg}</span>
        </div>
      </section>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { padding: 24, maxWidth: 980, margin: "0 auto", fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif" },
  h1: { fontSize: 28, margin: "12px 0 18px" },
  card: { border: "1px solid #e5e5e5", borderRadius: 12, padding: 18, background: "#fff" },
  label: { display: "block", marginBottom: 12 },
  labelTitle: { fontWeight: 700, marginBottom: 6 },
  input: { width: "100%", padding: "10px 12px", border: "1px solid #d8d8d8", borderRadius: 10, fontSize: 16 },
  help: { margin: "6px 0 14px", color: "#555" },

  table: { border: "1px solid #e8e8e8", borderRadius: 12, overflow: "hidden" },

  thRow: { background: "#f7f7f7", borderTop: "none" },
  th: { fontWeight: 700 },

  tr: { display: "grid", gridTemplateColumns: "160px 1fr", padding: 12, borderTop: "1px solid #eee", alignItems: "center" },
  tr3: {
    display: "grid",
    gridTemplateColumns: "160px 1fr 320px",
    padding: 12,
    borderTop: "1px solid #eee",
    alignItems: "center",
    gap: 12,
  },

  tdDate: { fontSize: 16 },
  td: { display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" },
  radio: { display: "inline-flex", gap: 6, alignItems: "center" },

  noteInput: { width: "100%", padding: "10px 12px", border: "1px solid #d8d8d8", borderRadius: 10 },

  footer: { display: "flex", gap: 12, alignItems: "center", marginTop: 14 },
  button: { padding: "10px 16px", borderRadius: 10, border: "1px solid #ccc", cursor: "pointer" },
  msg: { color: "#1a7f37" },
};
