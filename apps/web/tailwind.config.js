/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#201936",
        muted: "#77718C",
        line: "#EAE7F2",
        canvas: "#F8F7FC",
        night: "#211747",
        violet: "#6D35F7",
        glow: "#9254FF"
      },
      boxShadow: {
        card: "0 1px 2px rgba(33,23,71,.03), 0 12px 34px rgba(33,23,71,.045)",
        lift: "0 14px 34px rgba(109,53,247,.2)"
      },
      fontFamily: { sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"] }
    }
  },
  plugins: []
};
