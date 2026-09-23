"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;

type DayItem = {
  day: number;
  date: string; // YYYY-MM-DD
  weekday: number; // 0=日 ... 6=土
  checked: boolean;
  holiday: boolean;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

// 未登録の月だけを、近い順に最大12件返す（登録済みの月はそもそも選択肢に出さない）
function unregisteredMonths(existingKeys: string[], count = 12) {
  const now = new Date();
  let y = now.getFullYear();
  let m = now.getMonth() + 1; // 1-12
  const result: { key: string; year: number; month: number }[] = [];

  for (let i = 0; i < 120 && result.length < count; i++) {
    const key = `${y}-${pad2(m)}`;
    if (!existingKeys.includes(key)) result.push({ key, year: y, month: m });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return result;
}

export default function NewSchedulePage() {
  const router = useRouter();

  const [existingKeys, setExistingKeys] = useState<string[]>([]);
  const [loadingExisting, setLoadingExisting] = useState(true);

  const [monthValue, setMonthValue] = useState(""); // "YYYY-MM"
  const [title, setTitle] = useState("");
  const [titleEdited, setTitleEdited] = useState(false);
  const [days, setDays] = useState<DayItem[]>([]);

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  // 既存の月一覧を取得（登録済みの月を選択肢から除外するために使う）
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("schedules").select("key");
      if (!error) {
        const keys = (data ?? []).map((r: { key: string }) => r.key);
        setExistingKeys(keys);
        const candidates = unregisteredMonths(keys);
        setMonthValue((prev) => prev || candidates[0]?.key || "");
      }
      setLoadingExisting(false);
    })();
  }, []);

  const monthOptions = useMemo(() => unregisteredMonths(existingKeys), [existingKeys]);

  // 選択月が変わったら、その月の日付一覧を作り直す（土日はデフォルトでチェック）
  useEffect(() => {
    if (!monthValue) return;
    const [yStr, mStr] = monthValue.split("-");
    const y = Number(yStr);
    const m = Number(mStr);
    if (!y || !m) return;

    const daysInMonth = new Date(y, m, 0).getDate();
    const list: DayItem[] = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const weekday = new Date(y, m - 1, day).getDay();
      list.push({
        day,
        date: `${yStr}-${mStr}-${pad2(day)}`,
        weekday,
        checked: weekday === 0 || weekday === 6,
        holiday: false,
      });
    }
    setDays(list);

    if (!titleEdited) setTitle(`${y}年${m}月`);
  }, [monthValue, titleEdited]);

  const isDuplicate = existingKeys.includes(monthValue);
  const selectedCount = days.filter((d) => d.checked).length;

  const toggleDay = (day: number) => {
    setDays((prev) => prev.map((d) => (d.day === day ? { ...d, checked: !d.checked } : d)));
  };
  const toggleHoliday = (day: number) => {
    setDays((prev) => prev.map((d) => (d.day === day ? { ...d, holiday: !d.holiday } : d)));
  };

  const preview = useMemo(() => {
    const [, mStr] = monthValue.split("-");
    const m = Number(mStr);
    return days
      .filter((d) => d.checked)
      .map((d, i) => ({
        date: d.date,
        label: `${m}/${d.day}(${WEEKDAYS[d.weekday]}${d.holiday ? "・祝" : ""})`,
        sort_order: i + 1,
      }));
  }, [days, monthValue]);

  const onSave = async () => {
    setMsg("");
    if (isDuplicate) return setMsg("この月はすでに登録されています。");
    if (!title.trim()) return setMsg("タイトルを入力してください。");
    if (preview.length === 0) return setMsg("日付を1つ以上選択してください。");

    setSaving(true);
    try {
      const { data: schedule, error: schErr } = await supabase
        .from("schedules")
        .insert({ key: monthValue, title: title.trim() })
        .select("id")
        .single();

      if (schErr) {
        setMsg(
          schErr.code === "23505" ? "この月はすでに登録されています。" : `登録に失敗しました: ${schErr.message}`
        );
        return;
      }

      const rows = preview.map((d) => ({ schedule_id: schedule.id, ...d }));
      const { error: datesErr } = await supabase.from("schedule_dates").insert(rows);

      if (datesErr) {
        // 日付側が失敗したら、中途半端な月だけが残らないよう戻す
        await supabase.from("schedules").delete().eq("id", schedule.id);
        setMsg(`日付の登録に失敗しました: ${datesErr.message}`);
        return;
      }

      router.push(`/?month=${encodeURIComponent(monthValue)}`);
      router.refresh();
    } catch {
      setMsg("通信に失敗しました。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main style={{ padding: 24, maxWidth: 700, margin: "0 auto" }}>
      <h1 style={{ margin: "8px 0 14px" }}>月のカレンダーを登録</h1>

      <div style={card}>
        <label style={row}>
          対象月：
          {loadingExisting ? (
            <span style={{ color: "var(--muted-text)" }}>読み込み中...</span>
          ) : monthOptions.length === 0 ? (
            <span style={{ color: "var(--danger)" }}>登録できる月がありません</span>
          ) : (
            <select value={monthValue} onChange={(e) => setMonthValue(e.target.value)} style={input}>
              {monthOptions.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.year}年{o.month}月
                </option>
              ))}
            </select>
          )}
        </label>

        <label style={row}>
          タイトル：
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setTitleEdited(true);
            }}
            style={{ ...input, flex: 1 }}
          />
        </label>

        <p style={{ color: "var(--muted-text)", fontSize: 12, margin: 0 }}>
          ※登録済みの月は選択肢に表示されません（登録・変更はできません）。
        </p>
      </div>

      {days.length > 0 && (
        <div style={{ ...card, marginTop: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
            <strong>候補日をタップして選択</strong>
            <span style={{ color: "var(--muted-text)", fontSize: 13 }}>{selectedCount}日選択中</span>
          </div>

          <div style={calendarGrid}>
            {WEEKDAYS.map((w, i) => (
              <div
                key={w}
                style={{
                  ...weekdayCell,
                  color: i === 0 ? "var(--danger)" : i === 6 ? "var(--accent-border)" : "var(--muted-text)",
                }}
              >
                {w}
              </div>
            ))}

            {Array.from({ length: days[0].weekday }).map((_, i) => (
              <div key={`blank-${i}`} />
            ))}

            {days.map((d) => (
              <button
                key={d.day}
                type="button"
                onClick={() => toggleDay(d.day)}
                style={{
                  ...dayCell,
                  ...(d.checked ? dayCellSelected : {}),
                  color: !d.checked
                    ? d.weekday === 0
                      ? "var(--danger)"
                      : d.weekday === 6
                      ? "var(--accent-border)"
                      : "var(--foreground)"
                    : undefined,
                }}
              >
                <span style={{ fontSize: 15, fontWeight: 700 }}>{d.day}</span>
                {d.checked && (
                  <span
                    role="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleHoliday(d.day);
                    }}
                    style={{ ...holidayBadge, ...(d.holiday ? holidayBadgeActive : {}) }}
                  >
                    祝
                  </span>
                )}
              </button>
            ))}
          </div>

          <p style={{ marginTop: 10, color: "var(--muted-text)", fontSize: 12 }}>
            ※日付をタップで候補日に追加/解除。選択した日の「祝」をタップすると祝日表記になります。
          </p>
        </div>
      )}

      {msg && <p style={{ color: "var(--danger)", marginTop: 10 }}>{msg}</p>}

      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <button onClick={onSave} disabled={saving || loadingExisting || isDuplicate || !monthValue} style={primaryBtn}>
          {saving ? "登録中..." : "この内容で登録する"}
        </button>
        <button onClick={() => router.push("/")} style={btn}>
          戻る
        </button>
      </div>
    </main>
  );
}

const card: React.CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 12,
  background: "var(--surface)",
  padding: 14,
};

const row: React.CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "center",
  marginBottom: 10,
};

const input: React.CSSProperties = {
  padding: "8px 10px",
  border: "1px solid var(--border-input)",
  borderRadius: 8,
  background: "var(--surface)",
  color: "var(--foreground)",
};

const btn: React.CSSProperties = {
  padding: "10px 14px",
  border: "1px solid var(--border-input)",
  borderRadius: 10,
  background: "var(--surface)",
  color: "var(--foreground)",
  cursor: "pointer",
};

const primaryBtn: React.CSSProperties = {
  ...btn,
  border: "1px solid var(--primary-bg)",
  background: "var(--primary-bg)",
  color: "var(--primary-text)",
  fontWeight: 700,
};

const calendarGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(7, 1fr)",
  gap: 6,
};

const weekdayCell: React.CSSProperties = {
  textAlign: "center",
  fontSize: 12,
  fontWeight: 700,
  paddingBottom: 6,
};

const dayCell: React.CSSProperties = {
  position: "relative",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 2,
  minHeight: 52,
  border: "1px solid var(--border-input)",
  borderRadius: 10,
  background: "var(--surface)",
  cursor: "pointer",
  touchAction: "manipulation",
  padding: 4,
};

const dayCellSelected: React.CSSProperties = {
  border: "2px solid var(--active-border)",
  background: "var(--active-bg)",
  color: "var(--active-text)",
};

const holidayBadge: React.CSSProperties = {
  fontSize: 10,
  padding: "1px 6px",
  borderRadius: 999,
  border: "1px solid var(--border-input)",
  color: "var(--muted-text)",
};

const holidayBadgeActive: React.CSSProperties = {
  border: "1px solid var(--danger)",
  color: "var(--danger)",
  fontWeight: 700,
};
