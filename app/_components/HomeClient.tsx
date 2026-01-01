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

  const onChangeMonth = (key: string) => {
    setSelectedKey(key);
    router.push(`/?month=${encodeURIComponent(key)}`);
    router.refresh(); // 要件：再読み込み
  };

  const selectedSchedule = schedules.find((s) => s.key === selectedKey);

  if (loading) return <main style={{ padding: 24 }}>読み込み中...</main>;
  if (error) return <main style={{ padding: 24, color: "crimson" }}>エラー: {error}</main>;
  if (!selectedSchedule) return <main style={{ padding: 24 }}>月が選択できません</main>;

  return (
    <main style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <h1 style={{ margin: "8px 0 14px" }}>集計</h1>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          月：
          <select value={selectedKey} onChange={(e) => onChangeMonth(e.target.value)}>
            {schedules.map((s) => (
              <option key={s.key} value={s.key}>
                {s.title}
              </option>
            ))}
          </select>
        </label>

        <Link href={`/input/${selectedSchedule.key}`} style={btn}>
          入力
        </Link>

        <Link href="/participants" style={btn}>
          入力者マスタ
        </Link>
      </div>

      <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, overflow: "auto", background: "#fff" }}>
  <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 1100 }}>
    <thead>
      {/* 1段目：日付（午前午後をまとめる） */}
      <tr style={{ background: "#f7f7f7" }}>
        <th style={th} rowSpan={2}>名前</th>

        {dateKeys.map((d) => {
          const yesAm = counts[d.date]?.am?.yes ?? 0;
          const yesPm = counts[d.date]?.pm?.yes ?? 0;
          // 日付単位で「どちらかが3以上なら」日付ヘッダもハイライト（好み）
          const dateHi = isHighlight(yesAm) || isHighlight(yesPm);

          return (
            <th
              key={d.date}
              style={{ ...th, ...(dateHi ? hi : {}) }}
              colSpan={2}
            >
              {d.label}
            </th>
          );
        })}
      </tr>

      {/* 2段目：午前/午後 */}
      <tr style={{ background: "#f7f7f7" }}>
        {dateKeys.flatMap((d) => {
          const yesAm = counts[d.date]?.am?.yes ?? 0;
          const yesPm = counts[d.date]?.pm?.yes ?? 0;
          return [
            <th key={`${d.date}-am`} style={{ ...th, ...(isHighlight(yesAm) ? hi : {}) }}>
              午前
            </th>,
            <th key={`${d.date}-pm`} style={{ ...th, ...(isHighlight(yesPm) ? hi : {}) }}>
              午後
            </th>,
          ];
        })}
      </tr>
    </thead>

    <tbody>
      {people.map((p) => (
        <tr key={p.id}>
          <td style={{ ...td, fontWeight: 700, textAlign: "left" }}>{p.name}</td>

          {dateKeys.flatMap((d) => {
            const cellAm = matrix[p.id]?.[d.date]?.am;
            const cellPm = matrix[p.id]?.[d.date]?.pm;

            const yesAm = counts[d.date]?.am?.yes ?? 0;
            const yesPm = counts[d.date]?.pm?.yes ?? 0;

            return [
              <td
                key={`${p.id}-${d.date}-am`}
                style={{ ...td, ...(isHighlight(yesAm) ? hi : {}) }}
                title={cellAm?.note ?? ""}
              >
                {mark(cellAm?.status)}
              </td>,
              <td
                key={`${p.id}-${d.date}-pm`}
                style={{ ...td, ...(isHighlight(yesPm) ? hi : {}) }}
                title={cellPm?.note ?? ""}
              >
                {mark(cellPm?.status)}
              </td>,
            ];
          })}
        </tr>
      ))}
    </tbody>

    <tfoot>
      <tr style={{ background: "#fafafa" }}>
        <td style={{ ...td, fontWeight: 700, textAlign: "left" }}>○人数</td>
        {dateKeys.flatMap((d) => {
          const yesAm = counts[d.date]?.am?.yes ?? 0;
          const yesPm = counts[d.date]?.pm?.yes ?? 0;
          return [
            <td key={`${d.date}-am-yes`} style={{ ...td, fontWeight: 700, ...(isHighlight(yesAm) ? hi : {}) }}>
              {yesAm}
            </td>,
            <td key={`${d.date}-pm-yes`} style={{ ...td, fontWeight: 700, ...(isHighlight(yesPm) ? hi : {}) }}>
              {yesPm}
            </td>,
          ];
        })}
      </tr>

      <tr style={{ background: "#fafafa" }}>
        <td style={{ ...td, fontWeight: 700, textAlign: "left" }}>△人数</td>
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
<div style={{ border: "1px solid #e5e5e5", borderRadius: 12, overflow: "auto", background: "#fff" }}>
        
      </div>

      <p style={{ marginTop: 10, color: "#666" }}>
        ※セルの備考はホバーで確認できます。<br />
        ※○人数が3人以上の枠は黄色でハイライトされます（午前/午後それぞれ判定）。
      </p>
    </main>
  );
}

const th: React.CSSProperties = { borderBottom: "1px solid #eee", padding: "10px 12px", textAlign: "center", whiteSpace: "nowrap" };
const td: React.CSSProperties = { borderBottom: "1px solid #f2f2f2", padding: "10px 12px", textAlign: "center", whiteSpace: "nowrap" };
const btn: React.CSSProperties = { padding: "8px 12px", border: "1px solid #ddd", borderRadius: 10, textDecoration: "none", color: "inherit" };
const hi: React.CSSProperties = { backgroundColor: "#fff3bf" };
