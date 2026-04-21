import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
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
        fontSize: 11,
        letterSpacing: -0.5,
        color: "white",
      }}
    >
      PR
      <span style={{ background: "#E8FF00", color: "#0A0A0A", paddingLeft: 1, paddingRight: 1, marginLeft: 1 }}>
        f
      </span>
    </div>,
    { ...size }
  );
}
