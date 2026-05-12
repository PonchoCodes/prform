import { ImageResponse } from "next/og";

export const dynamic = "force-dynamic";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        background: "#0A0A0A",
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "sans-serif",
        fontWeight: 900,
        fontSize: 72,
        letterSpacing: -3,
        color: "white",
      }}
    >
      PR
      <span style={{ background: "#E8FF00", color: "#0A0A0A", paddingLeft: 4, paddingRight: 4, marginLeft: 4 }}>
        f
      </span>
    </div>,
    { ...size }
  );
}
