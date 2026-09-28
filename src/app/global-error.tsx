"use client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#09090b", color: "#f4f3ef", display: "grid", placeItems: "center", minHeight: "100dvh", textAlign: "center", padding: 24 }}>
        <div style={{ maxWidth: 440 }}>
          <div style={{ fontSize: 13, letterSpacing: ".14em", textTransform: "uppercase", color: "#a1a1aa" }}>500</div>
          <h1 style={{ fontSize: 32, margin: "12px 0" }}>The app hit a serious error</h1>
          <p style={{ color: "#a1a1aa", lineHeight: 1.6 }}>Your data is safe. Reload the page; if this continues, please contact the studio and quote the reference below.</p>
          <button onClick={reset} style={{ marginTop: 20, padding: "12px 22px", borderRadius: 12, border: 0, background: "#ff5b2e", color: "#0b0b0c", fontWeight: 700, cursor: "pointer" }}>
            Reload
          </button>
          {error.digest ? <p style={{ marginTop: 24, fontSize: 12, color: "#71717a" }}>Reference: {error.digest}</p> : null}
        </div>
      </body>
    </html>
  );
}
