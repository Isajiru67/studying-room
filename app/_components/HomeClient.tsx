"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Status = "yes" | "maybe" | "no";
type Slot = "am" | "pm";

const mark = (s?: Status) => (s === "yes" ? "○" : s === "maybe" ? "△" : s === "no" ? "×" : "-");
const slotLabel = (s: Slot) => (s === "am" ? "午前" : "午後");
const isHighlight = (yesCount: number) => yesCount >= 3;


type Schedule = { id: string; key: string; title: string };
type Person = { id: string; name: string };
type DateRow = { date: string; label: string; sort_order: number | null };
type RespRow = { participant_id: string; date: string; time_slot: Slot; status: Status; note: string | null };

export default function HomeClient() {
  const router = useRouter();
  const sp = useSearchParams();
  const monthFromQuery = sp.get("month") ?? "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [selectedKey, setSelectedKey] = useState<string>("");

  const [scheduleId, setScheduleId] = useState<string>("");
  const [dates, setDates] = useState<DateRow[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [responses, setResponses] = useState<RespRow[]>([]);

  // タップで表示する備考（スマホはホバーできないため）
  const [activeNote, setActiveNote] = useState<{ label: string; text: string } | null>(null);


  // 初回：月一覧取得
  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");

      const { data: sch, error: schErr } = await supabase
        .from("schedules")
        .select("id,key,title")
        .order("key", { ascending: false });

      if (schErr) {
        setError(schErr.message);
        setLoading(false);
        return;
      }

      const list = (sch ?? []) as Schedule[];
      setSchedules(list);

      const picked = list.find((x) => x.key === monthFromQuery) ?? list[0];
      if (!picked) {
        setError("月が未登録です（schedulesに登録してください）");
        setLoading(false);
        return;
      }

      setSelectedKey(picked.key);
      setScheduleId(picked.id);
      setLoading(false);
    })();
    // monthFromQuery が変わったら再選択
  }, [monthFromQuery]);

  // 選択月が変わったら、その月のデータを読み込む
  useEffect(() => {
    if (!scheduleId) return;

    (async () => {
      setLoading(true);
      setError("");

      const [{ data: d, error: dErr }, { data: p, error: pErr }, { data: r, error: rErr }] = await Promise.all([
        supabase
          .from("schedule_dates")
          .select("date,label,sort_order")
          .eq("schedule_id", scheduleId)
          .order("sort_order", { ascending: true })
          .order("date", { ascending: true }),
        supabase.from("participants").select("id,name").order("name", { ascending: true }),
        supabase
          .from("schedule_responses")
          .select("participant_id,date,time_slot,status,note")
          .eq("schedule_id", scheduleId),
      ]);

      if (dErr) return setError(dErr.message), setLoading(false);
      if (pErr) return setError(pErr.message), setLoading(false);
      if (rErr) return setError(rErr.message), setLoading(false);

      setDates((d ?? []) as DateRow[]);
      setPeople((p ?? []) as Person[]);
      setResponses((r ?? []) as RespRow[]);
      setLoading(false);
    })();
  }, [scheduleId]);

  const dateKeys = useMemo(() => {
    return (dates ?? []).map((x) => ({
      date: x.date,
      label: x.label ?? x.date,
    }));
  }, [dates]);

  // 行列化：matrix[personId][date][slot] = {status,note}
  const matrix = useMemo(() => {
    const m: Record<string, Record<string, Record<Slot, { status?: Status; note?: string | null }>>> = {};
    for (const person of people) {
      m[person.id] = {};
      for (const d of dateKeys) {
        m[person.id][d.date] = { am: {}, pm: {} };
      }
    }
    for (const row of responses) {
      if (!m[row.participant_id]) continue;
      if (!m[row.participant_id][row.date]) continue;
      m[row.participant_id][row.date][row.time_slot] = { status: row.status, note: row.note };
    }
    return m;
  }, [people, dateKeys, responses]);

  // 日付×スロットのカウント
  const counts = useMemo(() => {
    const c: Record<string, Record<Slot, { yes: number; maybe: number }>> = {};
    for (const d of dateKeys) c[d.date] = { am: { yes: 0, maybe: 0 }, pm: { yes: 0, maybe: 0 } };

    for (const row of responses) {
      if (!c[row.date]) continue;
      if (row.status === "yes") c[row.date][row.time_slot].yes += 1;
      if (row.status === "maybe") c[row.date][row.time_slot].maybe += 1;
    }
    return c;
  }, [dateKeys, responses]);

  // ○人数が最多の枠（1人以上、同数は全て対象）
  const maxYes = useMemo(() => {
    let max = 0;
    for (const d of dateKeys) {
      max = Math.max(max, counts[d.date]?.am?.yes ?? 0, counts[d.date]?.pm?.yes ?? 0);
    }
    return max;
  }, [dateKeys, counts]);
  const isBest = (yesCount: number) => maxYes > 0 && yesCount === maxYes;

  const onChangeMonth =(key: string) => {
    setSelectedKey(key);
    router.push(`/?month=${encodeURIComponent(key)}`);
    router.refresh(); // 要件：再読み込み
  };

  const selectedSchedule = schedules.find((s) => s.key === selectedKey);
  const heading =
  selectedSchedule?.title
    ? `${selectedSchedule.title}分 参加状況`
    : "参加状況";


  if (loading) return <main style={{ padding: 24 }}>読み込み中...</main>;
  if (error) return <main style={{ padding: 24, color: "crimson" }}>エラー: {error}</main>;
  if (!selectedSchedule) return <main style={{ padding: 24 }}>月が選択できません</main>;

  return (
    <main style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      {/* 月選択（最上部） */}
<div
  style={{
    display: "flex",
    gap: 12,
    alignItems: "center",
    marginBottom: 10,
    flexWrap: "wrap",
  }}
>
  <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
    月：
    <select
      value={selectedKey}
      onChange={(e) => onChangeMonth(e.target.value)}
    >
      {schedules.map((s) => (
        <option key={s.key} value={s.key}>
          {s.title}
        </option>
      ))}
    </select>
  </label>

  <Link href={`/input/${selectedSchedule.key}`} style={btn}>
    出欠を入力する
  </Link>

  <Link href="/participants" style={btn}>
    参加者の新規登録・削除
  </Link>

  <Link href="/schedules/new" style={btn}>
    月のカレンダーを登録
  </Link>
</div>

{/* 見出し */}
<h1 style={{ margin: "4px 0 12px" }}>
  {heading}
</h1>




      <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "auto", background: "var(--surface)" }}>
  <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 1100 }}>
    <thead>
      {/* 1段目：日付（午前午後をまとめる） */}
      <tr style={{ background: "var(--surface-muted)" }}>
        <th style={{ ...th, ...stickyCorner }} rowSpan={2}>名前</th>

        {dateKeys.map((d) => {
          const yesAm = counts[d.date]?.am?.yes ?? 0;
          const yesPm = counts[d.date]?.pm?.yes ?? 0;
          // 日付単位で「どちらかが3以上なら」日付ヘッダもハイライト（好み）
          const dateHi = isHighlight(yesAm) || isHighlight(yesPm);

          return (
            <th
              key={d.date}
              style={{ ...th, ...stickyTopRow1, ...(dateHi ? hi : {}) }}
              colSpan={2}
            >
              {d.label}
            </th>
          );
        })}
      </tr>

      {/* 2段目：午前/午後 */}
      <tr style={{ background: "var(--surface-muted)" }}>
        {dateKeys.flatMap((d) => {
          const yesAm = counts[d.date]?.am?.yes ?? 0;
          const yesPm = counts[d.date]?.pm?.yes ?? 0;
          return [
            <th key={`${d.date}-am`} style={{ ...th, ...stickyTopRow2, ...(isHighlight(yesAm) ? hi : {}) }}>
              午前{isBest(yesAm) && " ★"}
            </th>,
            <th key={`${d.date}-pm`} style={{ ...th, ...stickyTopRow2, ...(isHighlight(yesPm) ? hi : {}) }}>
              午後{isBest(yesPm) && " ★"}
            </th>,
          ];
        })}
      </tr>
    </thead>

    <tbody>
      {people.map((p) => (
        <tr key={p.id}>
          <td style={{ ...td, fontWeight: 700, textAlign: "left", ...stickyLeft }}>{p.name}</td>

          {dateKeys.flatMap((d) => {
            const cellAm = matrix[p.id]?.[d.date]?.am;
            const cellPm = matrix[p.id]?.[d.date]?.pm;

            const yesAm = counts[d.date]?.am?.yes ?? 0;
            const yesPm = counts[d.date]?.pm?.yes ?? 0;

            const noteAm = cellAm?.note ?? "";
            const notePm = cellPm?.note ?? "";

            return [
              <td
                key={`${p.id}-${d.date}-am`}
                style={{ ...td, ...(isHighlight(yesAm) ? hi : {}), ...(noteAm ? tappable : {}) }}
                title={noteAm}
                onClick={() => noteAm && setActiveNote({ label: `${p.name}／${d.label}／午前`, text: noteAm })}
              >
                {mark(cellAm?.status)}
                {noteAm && <sup style={noteMark}>※</sup>}
              </td>,
              <td
                key={`${p.id}-${d.date}-pm`}
                style={{ ...td, ...(isHighlight(yesPm) ? hi : {}), ...(notePm ? tappable : {}) }}
                title={notePm}
                onClick={() => notePm && setActiveNote({ label: `${p.name}／${d.label}／午後`, text: notePm })}
              >
                {mark(cellPm?.status)}
                {notePm && <sup style={noteMark}>※</sup>}
              </td>,
            ];
          })}
        </tr>
      ))}
    </tbody>

    <tfoot>
      <tr style={{ background: "var(--surface-muted-2)" }}>
        <td style={{ ...td, fontWeight: 700, textAlign: "left", ...stickyLeft, background: "var(--surface-muted-2)" }}>○人数</td>
        {dateKeys.flatMap((d) => {
          const yesAm = counts[d.date]?.am?.yes ?? 0;
          const yesPm = counts[d.date]?.pm?.yes ?? 0;
          return [
            <td key={`${d.date}-am-yes`} style={{ ...td, fontWeight: 700, ...(isHighlight(yesAm) ? hi : {}), ...(isBest(yesAm) ? best : {}) }}>
              {yesAm}
            </td>,
            <td key={`${d.date}-pm-yes`} style={{ ...td, fontWeight: 700, ...(isHighlight(yesPm) ? hi : {}), ...(isBest(yesPm) ? best : {}) }}>
              {yesPm}
            </td>,
          ];
        })}
      </tr>

      <tr style={{ background: "var(--surface-muted-2)" }}>
        <td style={{ ...td, fontWeight: 700, textAlign: "left", ...stickyLeft, background: "var(--surface-muted-2)" }}>△人数</td>
        {dateKeys.flatMap((d) => {
          const yesAm = counts[d.date]?.am?.yes ?? 0;
          const yesPm = counts[d.date]?.pm?.yes ?? 0;
          const maybeAm = counts[d.date]?.am?.maybe ?? 0;
          const maybePm = counts[d.date]?.pm?.maybe ?? 0;
          return [
            <td key={`${d.date}-am-maybe`} style={{ ...td, ...(isHighlight(yesAm) ? hi : {}) }}>
              {maybeAm}
            </td>,
            <td key={`${d.date}-pm-maybe`} style={{ ...td, ...(isHighlight(yesPm) ? hi : {}) }}>
              {maybePm}
            </td>,
          ];
        })}
      </tr>
    </tfoot>
  </table>
</div>
      <p style={{ marginTop: 10, color: "var(--muted-text)" }}>
        ※備考があるセルには「※」が付きます。タップ（またはホバー）で内容を確認できます。<br />
        ※○人数が3人以上の枠は黄色でハイライトされます（午前/午後それぞれ判定）。<br />
        ※○人数が最も多い枠には★が付きます（同数の場合は全て）。
      </p>

      {activeNote && (
        <div style={noteToastWrap} onClick={() => setActiveNote(null)}>
          <div style={noteToast}>
            <strong>{activeNote.label}</strong>
            <div style={{ marginTop: 4 }}>{activeNote.text}</div>
            <div style={{ marginTop: 6, fontSize: 11, color: "var(--muted-text)" }}>（タップで閉じる）</div>
          </div>
        </div>
      )}
    </main>
  );
}

const th: React.CSSProperties = { borderBottom: "1px solid var(--border-soft)", padding: "10px 12px", textAlign: "center", whiteSpace: "nowrap" };
const td: React.CSSProperties = { borderBottom: "1px solid var(--border-soft)", padding: "10px 12px", textAlign: "center", whiteSpace: "nowrap" };
const btn: React.CSSProperties = { padding: "8px 12px", border: "1px solid var(--border-input)", borderRadius: 10, textDecoration: "none", color: "inherit" };
const hi: React.CSSProperties = { backgroundColor: "var(--highlight-bg)" };
const best: React.CSSProperties = { outline: "2px solid var(--accent-border)", outlineOffset: -2 };

// ヘッダー1行分の高さ（2段目のsticky位置の基準に使う。th/tdのpaddingと概ね合わせている）
const HEADER_ROW_H = 41;

// スマホの横スクロールでも名前列・ヘッダーが見えるようにするsticky設定
const stickyLeft: React.CSSProperties = { position: "sticky", left: 0, zIndex: 1, background: "var(--surface)" };
const stickyTopRow1: React.CSSProperties = { position: "sticky", top: 0, zIndex: 2, background: "var(--surface-muted)" };
const stickyTopRow2: React.CSSProperties = { position: "sticky", top: HEADER_ROW_H, zIndex: 2, background: "var(--surface-muted)" };
const stickyCorner: React.CSSProperties = { position: "sticky", left: 0, top: 0, zIndex: 3, background: "var(--surface-muted)" };

// 備考ありセル：タップ可能な見た目
const tappable: React.CSSProperties = { cursor: "pointer" };
const noteMark: React.CSSProperties = { marginLeft: 2, fontSize: 10, color: "var(--accent-border)" };

const noteToastWrap: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.35)",
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
  padding: 16,
  zIndex: 50,
};
const noteToast: React.CSSProperties = {
  maxWidth: 420,
  width: "100%",
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 14,
  padding: "14px 16px",
  boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
  marginBottom: "env(safe-area-inset-bottom, 0px)",
};
