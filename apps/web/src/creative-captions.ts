import type { CreativeAspect } from "./creative-types";

/** Browser-native rasterization: reliable on Windows and Linux without FFmpeg drawtext/Fontconfig. */
export function makeCaptionOverlay(text: string, aspect: CreativeAspect): string {
  const canvas = document.createElement("canvas");
  canvas.width = aspect === "9:16" ? 720 : 1280;
  canvas.height = aspect === "9:16" ? 1280 : 720;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Caption rendering is unavailable in this browser. Try Chrome or Edge.");
  const { width, height } = canvas;
  const caption = text.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 84);
  if (!caption) throw new Error("Each scene needs a caption before rendering.");
  const regionTop = Math.round(height * 0.72);
  context.fillStyle = "rgba(7, 5, 23, .68)";
  context.fillRect(0, regionTop, width, height - regionTop);
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "#ffffff";
  const availableWidth = width * 0.84;

  // Fit the user's caption within two readable lines without cutting a word in half.
  let lines: string[] = [];
  let fontSize = aspect === "9:16" ? 42 : 40;
  const minimum = aspect === "9:16" ? 24 : 26;
  for (; fontSize >= minimum; fontSize -= 2) {
    context.font = `700 ${fontSize}px Inter, Arial, sans-serif`;
    lines = [""];
    for (const word of caption.split(" ")) {
      const index = lines.length - 1;
      const current = lines[index] ?? "";
      const candidate = current ? `${current} ${word}` : word;
      if (current && context.measureText(candidate).width > availableWidth) lines.push(word);
      else lines[index] = candidate;
    }
    if (lines.length <= 2 && lines.every((line) => context.measureText(line).width <= availableWidth)) break;
  }
  if (lines.length > 2 || lines.some((line) => context.measureText(line).width > availableWidth)) {
    throw new Error("A scene caption is too long for the video. Shorten it and try again.");
  }
  const spacing = fontSize * 1.32;
  const centerY = regionTop + (height - regionTop) / 2;
  const start = centerY - (lines.length - 1) * spacing / 2;
  lines.forEach((line, index) => context.fillText(line, width / 2, start + index * spacing));
  return canvas.toDataURL("image/png");
}
