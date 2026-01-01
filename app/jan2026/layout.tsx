import Link from "next/link";

export default function Jan2026Layout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <header
        style={{
          position: "sticky",
          top: 0,
          background: "#fff",
          borderBottom: "1px solid #eee",
          padding: "12px 24px",
          zIndex: 10,
        }}
      >
        <nav style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <strong style={{ marginRight: 8 }}>2026年1月</strong>

          <Link href="/jan2026" style={linkStyle}>
            入力
          </Link>

          <Link href="/jan2026/summary" style={linkStyle}>
            集計
          </Link>
        </nav>
      </header>

      <div style={{ padding: "16px 24px" }}>{children}</div>
    </div>
  );
}

const linkStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 10,
  border: "1px solid #ddd",
  textDecoration: "none",
  color: "inherit",
};
