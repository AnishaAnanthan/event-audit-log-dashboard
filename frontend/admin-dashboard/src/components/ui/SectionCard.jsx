function SectionCard({ title, right, children }) {
  return (
    <div className="card">
      {(title || right) && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", marginBottom: "1.25rem", flexWrap: "wrap" }}>
          {title ? <h2 style={{ margin: 0, fontSize: "1.25rem", color: "var(--text-primary)" }}>{title}</h2> : <span />}
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

export default SectionCard;
