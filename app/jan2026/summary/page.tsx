"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Status = "yes" | "maybe" | "no";
type Participant = { id: string; name: string };
type ResponseRow = { participant_id: string; date: string; status: Status; note: string | null };
type Weekend = { dateISO: string; label: string };

function formatJP(date: Date) {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const w = ["日", "月", "火", "水", "木", "金", "土"][date.getDay()];
  return `${m}/${d}(${w})`;
}

function getWeekendRowsJan2026JST(): Weekend[] {
  const rows: Weekend[] = [];
  for (let day = 1; day <= 31; day++) {
    const iso = `2026-01-${String(day).padStart(2, "0")}`;
    const date = new Date(`${iso}T00:00:00+09:00`);
    const dow = date.getDay();
    if (dow === 0 || dow === 6) rows.push({ dateISO: iso, label: formatJP(date) });
  }
  return rows;
}

function toMark(status?: Status): string {
  if (status === "yes") return "○";
  if (status === "maybe") return "△";
  if (status === "no") return "×";
  return "-";
}

export default function Jan2026SummaryPage() {
  const weekends = useMemo(() => getWeekendRowsJan2026JST(), []);

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [matrix, setMatrix] = useState<Record<string, Record<string, { status?: Status; note?: string | null }>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // クリックしたセルの備考表示用
  const [selected, setSelected] = useState<{
    name: string;
    dateLabel: string;
    mark: string;
    note: string | null | undefined;
  } | null>(null);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError("");
      setSelected(null);

      try {
        // 1) 参加者一覧
        const { data: p, error: pErr } = await supabase
          .from("participants")
          .select("id,name")
          .order("name", { ascending: true });

        if (pErr) throw new Error(pErr.message);
        const participantsData = (p ?? []) as Participant[];
        setParticipants(participantsData);

        // 2) 回答（2026年1月の範囲だけ取得）
        const { data: r, error: rErr } = await supabase
          .from("weekend_responses")
          .select("participant_id,date,status,note")
          .gte("date", "2026-01-01")
          .lte("date", "2026-01-31");

        if (rErr) throw new Error(rErr.message);
        const responses = (r ?? []) as ResponseRow[];

        // 3) 行列へ整形
        const m: Record<string, Record<string, { status?: Status; note?: string | null }>> = {};
        for (const person of participantsData) {
          m[person.id] = {};
          for (const w of weekends) m[person.id][w.dateISO] = {};
        }
        for (const row of responses) {
          if (!m[row.participant_id]) continue;
          if (!m[row.participant_id][row.date]) continue; // 土日以外は無視
          m[row.participant_id][row.date] = { status: row.status, note: row.note };
        }

        setMatrix(m);
      } catch (e) {
        setError(e instanceof Error ? e.message : "読み込みに失敗しました");
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [weekends]);

  const onCellClick = (person: Participant, w: Weekend) => {
    const cell = matrix?.[person.id]?.[w.dateISO];
    const mark = toMark(cell?.status);
    setSelected({
      name: person.name,
      dateLabel: w.label,
      mark,
      note: cell?.note,
    });
  };

  return (
    <main style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.h1}>2026年1月 土日 集計</h1>
        <button
          onClick={() => window.location.reload()}
          style={styles.refresh}
          title="再読み込み"
        >
          再読み込み
        </button>
      </div>

      {loading && <p>読み込み中...</p>}
      {error && <p style={{ color: "crimson" }}>エラー: {error}</p>}

      {!loading && !error && (
        <>
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={{ ...styles.th, ...styles.stickyLeft }}>名前</th>
                  {weekends.map((w) => (
                    <th key={w.dateISO} style={styles.th}>
                      {w.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {participants.map((person) => (
                  <tr key={person.id}>
                    <td style={{ ...styles.td, ...styles.stickyLeft, fontWeight: 700 }}>
                      {person.name}
                    </td>

                    {weekends.map((w) => {
                      const cell = matrix?.[person.id]?.[w.dateISO];
                      const mark = toMark(cell?.status);
                      const hasNote = !!cell?.note?.trim();

                      return (
                        <td
                          key={w.dateISO}
                          style={{
                            ...styles.td,
                            cursor: "pointer",
                            background: hasNote ? "#fff7e6" : "transparent",
                          }}
                          onClick={() => onCellClick(person, w)}
                          title={hasNote ? "備考あり（クリックで表示）" : "クリックで詳細"}
                        >
                          <span style={{ fontSize: 18 }}>{mark}</span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <section style={styles.detail}>
            <h2 style={styles.h2}>セル詳細</h2>
            {!selected ? (
              <p style={{ margin: 0, color: "#555" }}>表のセルをクリックすると、備考を表示します。</p>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                <div>
                  <strong>{selected.name}</strong> / <strong>{selected.dateLabel}</strong> /{" "}
                  <strong>{selected.mark}</strong>
                </div>
                <div style={styles.noteBox}>
                  {selected.note?.trim() ? selected.note : <span style={{ color: "#777" }}>（備考なし）</span>}
                </div>
              </div>
            )}
          </section>

          <p style={{ marginTop: 10, color: "#666" }}>
            ※セルが薄いオレンジの場合は備考あり。<br />
            ※「-」は未入力です。
          </p>
        </>
      )}
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    padding: 24,
    maxWidth: 1100,
    margin: "0 auto",
    fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
  },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 },
  h1: { fontSize: 26, margin: "12px 0 16px" },
  refresh: { padding: "8px 12px", borderRadius: 10, border: "1px solid #ccc", cursor: "pointer" },

  tableWrap: {
    border: "1px solid #e5e5e5",
    borderRadius: 12,
    overflow: "auto",
    maxHeight: 520,
    background: "#fff",
  },
  table: { borderCollapse: "separate", borderSpacing: 0, width: "100%", minWidth: 900 },
  th: {
    position: "sticky",
    top: 0,
    background: "#f7f7f7",
    borderBottom: "1px solid #eaeaea",
    padding: "10px 12px",
    textAlign: "center",
    whiteSpace: "nowrap",
    zIndex: 2,
  },
  td: {
    borderBottom: "1px solid #f0f0f0",
    padding: "10px 12px",
    textAlign: "center",
    whiteSpace: "nowrap",
  },
  stickyLeft: {
    position: "sticky",
    left: 0,
    background: "#fff",
    zIndex: 3,
    textAlign: "left",
    minWidth: 120,
  },

  detail: {
    marginTop: 16,
    border: "1px solid #e5e5e5",
    borderRadius: 12,
    padding: 14,
    background: "#fff",
  },
  h2: { fontSize: 18, margin: "0 0 10px" },
  noteBox: {
    border: "1px solid #e5e5e5",
    borderRadius: 10,
    padding: 10,
    background: "#fafafa",
    minHeight: 44,
  },
};
