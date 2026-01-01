"use client";
import { useRouter, useSearchParams } from "next/navigation";

export type ScheduleOption = { key: string; title: string };

export default function MonthPicker({ options, selectedKey }: { options: ScheduleOption[]; selectedKey: string }) {
  const router = useRouter();
  const sp = useSearchParams();

  return (
    <select
      value={selectedKey}
      onChange={(e) => {
        const month = e.target.value;
        // 画面再読み込み要件：push + refresh でOK
        router.push(`/?month=${encodeURIComponent(month)}`);
        router.refresh();
      }}
    >
      {options.map((o) => (
        <option key={o.key} value={o.key}>
          {o.title}
        </option>
      ))}
    </select>
  );
}
