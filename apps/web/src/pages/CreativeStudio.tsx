import { ArrowRight, CheckCircle2, Clapperboard, Film, ImagePlus, LoaderCircle, Play, ShieldCheck, Sparkles, Wallet, X } from "lucide-react";
import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { api } from "../api";
import type { CreativeAspect, CreativeJob, CreativeProjectSummary } from "../creative-types";
import { makeCaptionOverlay } from "../creative-captions";
import { PageHeader } from "../components/ui";

const money = (value: number | null) => value === null ? "Not reported" : `$${value.toFixed(6)}`;
const MAX_PHOTOS = 6;
const readImage = async (file: File): Promise<string> => {
  if (!( ["image/jpeg", "image/png", "image/webp"].includes(file.type)) || file.size > 12_000_000) throw new Error("Choose JPG, PNG or WebP images under 12 MB each.");
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    let edge = 1280;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const ratio = Math.min(1, edge / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.naturalWidth * ratio));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * ratio));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Image preparation is unavailable in this browser.");
      context.fillStyle = "#ffffff"; context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", attempt < 2 ? 0.78 : 0.67);
      if (dataUrl.length <= 2_000_000) return dataUrl; // within 1.5 MB server payload limit
      edge = Math.round(edge * 0.77);
    }
    throw new Error("One image could not be compressed below 1.5 MB. Try a smaller picture.");
  } finally { URL.revokeObjectURL(url); }
};

export function CreativeStudio() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [modelPool, setModelPool] = useState<string[]>([]);
  const [model, setModel] = useState("");
  const [productName, setProductName] = useState("");
  const [brief, setBrief] = useState("");
  const [audience, setAudience] = useState("");
  const [aspectRatio, setAspectRatio] = useState<CreativeAspect>("9:16");
  const [durationSeconds, setDurationSeconds] = useState<15 | 30>(30);
  const [budget, setBudget] = useState("0.25");
  const [imageDataUrls, setImageDataUrls] = useState<string[]>([]);
  const [imageIndexes, setImageIndexes] = useState<number[]>([0, 0, 0]);
  const [secondImageIndexes, setSecondImageIndexes] = useState<Array<number | null>>([null, null, null]);
  const [job, setJob] = useState<CreativeJob | null>(null);
  const [recent, setRecent] = useState<CreativeProjectSummary[]>([]);
  const [captions, setCaptions] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let mounted = true;
    void api.creativeStatus().then((result) => { if (mounted) setEnabled(result.enabled); if (result.enabled) void api.creativeProjects().then((projects) => { if (mounted) setRecent(projects); }).catch(() => {}); }).catch(() => { if (mounted) setEnabled(false); });
    void api.providerStatus().then((result) => { if (mounted) setModelPool(result.models?.length ? result.models : [result.model]); }).catch(() => {});
    return () => { mounted = false; };
  }, []);
  useEffect(() => {
    if (!job || job.status !== "rendering") return;
    let mounted = true;
    const timer = setInterval(() => {
      void api.creativeProject(job.id).then((next) => {
        if (mounted) { setJob(next); if (next.error) setError(next.error); }
      }).catch((caught: unknown) => { if (mounted) setError(caught instanceof Error ? caught.message : "Unable to check video status."); });
    }, 2500);
    return () => { mounted = false; clearInterval(timer); };
  }, [job?.id, job?.status]);
  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = ""; // Allow selecting the same photo again after removal.
    if (!files.length) return;
    setError("");
    if (imageDataUrls.length + files.length > MAX_PHOTOS) { setError(`Upload at most ${MAX_PHOTOS} images. Remove an existing one first.`); return; }
    setBusy(true);
    try {
      const prepared: string[] = [];
      for (const file of files) prepared.push(await readImage(file));
      setImageDataUrls((current) => [...current, ...prepared].slice(0, MAX_PHOTOS));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not read the image(s)."); }
    finally { setBusy(false); }
  };
  const removePhoto = (index: number) => setImageDataUrls((current) => current.filter((_photo, i) => i !== index));
  const plan = async (event: FormEvent) => {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      if (!imageDataUrls.length) throw new Error("Upload one or more product photos first.");
      const created = await api.createCreativeStoryboard({ productName, brief, audience, aspectRatio, durationSeconds, inferenceBudgetUsd: Number(budget), imageDataUrls, ...(model ? { model } : {}) });
      setJob(created); setCaptions(created.storyboard?.scenes.map((scene) => scene.caption) ?? []); setImageIndexes(created.storyboard?.scenes.map((scene, i) => scene.imageIndex ?? i % imageDataUrls.length) ?? [0, 0, 0]); setSecondImageIndexes(created.storyboard?.scenes.map((scene) => scene.secondImageIndex ?? null) ?? [null, null, null]);
      void api.creativeProjects().then(setRecent).catch(() => {});
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Storyboarding failed."); }
    finally { setBusy(false); }
  };
  const approve = async () => {
    if (!job) return;
    setBusy(true); setError("");
    try {
      const revised = await api.editCreativeStoryboard(job.id, captions, imageIndexes, secondImageIndexes);
      setJob(revised);
      // Captions are rasterized by the browser so FFmpeg never needs Fontconfig.
      await document.fonts.ready;
      const captionOverlays = captions.map((caption) => makeCaptionOverlay(caption, revised.aspectRatio));
      const started = await api.renderCreativeVideo(job.id, captionOverlays);
      setJob(started);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not start the render."); }
    finally { setBusy(false); }
  };
  const reopen = async (id: string) => {
    setError(""); setBusy(true);
    try { const opened = await api.creativeProject(id); setJob(opened); setCaptions(opened.storyboard?.scenes.map((scene) => scene.caption) ?? []); setImageIndexes(opened.storyboard?.scenes.map((scene, i) => scene.imageIndex ?? i % (opened.imageNames?.length || 1)) ?? [0, 0, 0]); setSecondImageIndexes(opened.storyboard?.scenes.map((scene) => scene.secondImageIndex ?? null) ?? [null, null, null]); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not open this video project."); }
    finally { setBusy(false); }
  };
  const recover = async () => {
    if (!job) return;
    setBusy(true); setError("");
    try {
      const recovered = await api.recoverCreativeStoryboard(job.id);
      setJob(recovered);
      setCaptions(recovered.storyboard?.scenes.map((scene) => scene.caption) ?? []);
      setImageIndexes(recovered.storyboard?.scenes.map((scene, i) => scene.imageIndex ?? i % (recovered.imageNames?.length || 1)) ?? [0, 0, 0]); setSecondImageIndexes(recovered.storyboard?.scenes.map((scene) => scene.secondImageIndex ?? null) ?? [null, null, null]);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not recover the outline."); }
    finally { setBusy(false); }
  };
  const reset = () => { setJob(null); setCaptions([]); setImageIndexes([0, 0, 0]); setSecondImageIndexes([null, null, null]); setError(""); void api.creativeProjects().then(setRecent).catch(() => {}); };
  return <div className="mx-auto max-w-5xl">
    <PageHeader eyebrow="Creative Studio · Beta" title="Turn your photos into a marketing video." description="Upload up to six product photos. Review three scenes, select up to six shots, and approve a 15- or 30-second MP4." />
    <div className="mb-6 rounded-2xl border border-violet/15 bg-violet/[.045] p-4 text-xs leading-6 text-ink">
      <strong>What this release does:</strong> requests an AI storyboard and renders a real downloadable MP4 using up to six of your uploaded photos, scene changes, subtle motion and captions. If Orbio cannot complete the outline, Auvra labels a local editable fallback rather than pretending the model succeeded. The voiceover is a written draft, not audio. This does not yet generate new AI footage or use a paid video API. This is a shared-password demo, not an individual private account: use only product photos you are comfortable sharing with other demo users.
    </div>
    {enabled === false ? <div role="alert" className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">Creative Studio is disabled on this protected demo. Set <code>AUVRA_CREATIVE_ENABLED=true</code> on the server and ensure FFmpeg is installed.</div> : null}
    {error ? <div role="alert" className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}
    {!job ? <form onSubmit={(event) => void plan(event)} className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
      <section className="card space-y-5 p-5 sm:p-7">
        <div className="flex items-center gap-3"><span className="rounded-xl bg-violet/[.07] p-2.5 text-violet"><Clapperboard className="h-5 w-5" /></span><div><h2 className="font-semibold">Your creative brief</h2><p className="text-xs text-muted">Tell Auvra what you're advertising.</p></div></div>
        <label className="block text-xs font-semibold">Product name<input required maxLength={100} value={productName} onChange={(event) => setProductName(event.target.value)} className="field mt-2" placeholder="e.g. Organic pineapple juice" /></label>
        <label className="block text-xs font-semibold">Target audience<input required maxLength={120} value={audience} onChange={(event) => setAudience(event.target.value)} className="field mt-2" placeholder="e.g. Lagos customers who enjoy fresh drinks" /></label>
        <label className="block text-xs font-semibold">What should the ad communicate?<textarea required minLength={15} maxLength={2500} rows={5} value={brief} onChange={(event) => setBrief(event.target.value)} className="field mt-2 resize-y" placeholder="Describe what the product is, its confirmed benefits, tone and desired call to action. Don't include claims you can't support." /></label>
        <div className="grid gap-4 sm:grid-cols-2"><label className="block text-xs font-semibold">Video format<select value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value as CreativeAspect)} className="field mt-2"><option value="9:16">Vertical · Reels / TikTok</option><option value="16:9">Landscape · Website / X</option></select></label><label className="block text-xs font-semibold">Orbio inference allowance ($)<input type="number" min="0.01" max="5" step="0.01" required value={budget} onChange={(event) => setBudget(event.target.value)} className="field mt-2" /></label></div>
        <label className="block text-xs font-semibold">Video length<select value={durationSeconds} onChange={(event) => setDurationSeconds(Number(event.target.value) as 15 | 30)} className="field mt-2"><option value={15}>15 seconds</option><option value={30}>30 seconds</option></select></label>
        <label className="block text-xs font-semibold">Storyboard AI model<select value={model} onChange={(event) => setModel(event.target.value)} className="field mt-2"><option value="">Auto · primary Orbio model</option>{modelPool.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <div className="rounded-xl border border-line bg-canvas p-4 text-xs leading-5 text-muted"><div className="mb-2 flex items-center gap-2 font-semibold text-ink"><Wallet className="h-4 w-4" /> Separate budgets</div>Only the approved storyboard request uses Orbio inference; its provider-reported cost is recorded. The local MP4 render incurs no separate video-generation API fee. Compute/storage charges are not metered here.</div>
        <button disabled={enabled !== true || busy || !imageDataUrls.length} type="submit" className="button-primary w-full py-3">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{busy ? "Writing storyboard…" : "Generate storyboard"}<ArrowRight className="h-4 w-4" /></button>
      </section>
      <section className="card p-5 sm:p-7">
        <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-violet/25 bg-violet/[.025] p-5 text-center transition hover:bg-violet/[.05]">
          <ImagePlus className="h-7 w-7 text-violet" />
          <span className="text-sm font-semibold">Add product images or screenshots</span>
          <span className="text-xs text-muted">1–6 JPG, PNG or WebP files · select multiple at once, or add more later. Each photo is resized in your browser.</span>
          <input aria-label="Choose product photos" multiple className="block w-full max-w-[270px] text-xs text-muted" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void upload(event)} />
        </label>
        {imageDataUrls.length ? <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {imageDataUrls.map((src, index) => <div key={`${index}-${src.slice(-12)}`} className="relative overflow-hidden rounded-xl border border-line bg-white"><img src={src} alt={`Uploaded photo ${index + 1}`} className="aspect-square w-full object-contain" /><span className="absolute bottom-2 left-2 rounded-md bg-night/85 px-2 py-1 text-[10px] font-bold text-white">Photo {index + 1}</span><button type="button" onClick={() => removePhoto(index)} disabled={busy} aria-label={`Remove photo ${index + 1}`} className="absolute right-2 top-2 rounded-lg bg-white p-1.5 text-ink shadow"><X className="h-3.5 w-3.5" /></button></div>)}
        </div> : <div className="mt-5 flex aspect-[9/10] items-center justify-center rounded-xl bg-canvas text-xs text-muted">Your images appear here</div>}
        <p className="mt-3 text-xs text-muted">{imageDataUrls.length} of {MAX_PHOTOS} images selected. Different images can be assigned to each video scene.</p>
      </section>
    </form> : <div className="space-y-5">
      <section className="card p-5 sm:p-7"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="eyebrow">Storyboard</p><h2 className="mt-2 text-2xl font-semibold text-ink">{job.storyboard?.headline ?? job.productName}</h2><p className="mt-1 text-xs text-muted">{job.storyboardSource === "manual_fallback" ? "Locally prepared outline (not AI-written)" : job.storyboard ? "AI storyboard" : "Storyboard unavailable"} · Model route: {job.servingModel} · Tokens: {job.tokenUsage.total.toLocaleString()} · Orbio reported: {money(job.inferenceCostUsd)}</p></div><span className="rounded-full bg-violet/[.07] px-3 py-1.5 text-xs font-semibold text-violet">{job.status === "completed" ? "MP4 ready" : job.status === "rendering" ? "Rendering" : job.status === "storyboard_ready" ? "Awaiting your approval" : "Incomplete"}</span></div>
        {job.error ? <p role="alert" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-6 text-amber-950">{job.error}</p> : null}
        {job.storyboard ? <div className="mt-6 grid gap-3 md:grid-cols-3">{job.storyboard.scenes.map((scene, index) => <div key={index} className="rounded-xl border border-line p-4"><p className="eyebrow">Scene {index + 1} · {index * (job.durationSeconds ?? 15) / 3}–{(index + 1) * (job.durationSeconds ?? 15) / 3}s</p><label className="mt-3 block text-xs font-semibold">On-screen caption<textarea value={captions[index] ?? scene.caption} onChange={(event) => setCaptions((current) => current.map((caption, i) => i === index ? event.target.value : caption))} disabled={job.status !== "storyboard_ready"} maxLength={84} rows={3} className="field mt-2 resize-none" /></label><label className="mt-3 block text-xs font-semibold">Scene photo<select className="field mt-2" disabled={job.status !== "storyboard_ready"} value={imageIndexes[index] ?? 0} onChange={(event) => setImageIndexes((current) => current.map((photoIndex, i) => i === index ? Number(event.target.value) : photoIndex))}>{(job.imageNames?.length ? job.imageNames : [job.imageName]).map((_name, photoIndex) => <option key={photoIndex} value={photoIndex}>Photo {photoIndex + 1}</option>)}</select></label><label className="mt-3 block text-xs font-semibold">Second shot (optional)<select className="field mt-2" disabled={job.status !== "storyboard_ready"} value={secondImageIndexes[index] ?? ""} onChange={(event) => setSecondImageIndexes((current) => current.map((photoIndex, i) => i === index ? (event.target.value === "" ? null : Number(event.target.value)) : photoIndex))}><option value="">No second shot</option>{(job.imageNames?.length ? job.imageNames : [job.imageName]).map((_name, photoIndex) => <option key={photoIndex} value={photoIndex}>Photo {photoIndex + 1}</option>)}</select></label><img className="mt-3 aspect-video w-full rounded-lg border border-line object-contain" src={`/api/creative/${job.id}/images/${imageIndexes[index] ?? 0}`} alt={`Scene ${index + 1} selected photo`} />{secondImageIndexes[index] !== null && secondImageIndexes[index] !== undefined ? <img className="mt-2 aspect-video w-full rounded-lg border border-line object-contain" src={`/api/creative/${job.id}/images/${secondImageIndexes[index]}`} alt={`Scene ${index + 1} second shot`} /> : null}<p className="mt-3 text-xs leading-5 text-muted">Suggested motion: {scene.direction}</p></div>)}</div> : null}
        {job.storyboard ? <div className="mt-5 rounded-xl bg-canvas p-4 text-xs leading-6"><strong className="text-ink">Draft voiceover (text only):</strong><p className="mt-2 text-muted">{job.storyboard.voiceoverDraft}</p></div> : null}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5"><p className="max-w-xl text-xs leading-5 text-muted">Approve the captions to render. No third-party video generation or additional inference call will be triggered.</p>{job.status === "failed" && !job.storyboard ? <button type="button" disabled={busy} onClick={() => void recover()} className="button-primary">Use editable local outline · no AI call</button> : null}{job.status === "storyboard_ready" ? <button type="button" disabled={busy || captions.some((caption) => !caption.trim())} onClick={() => void approve()} className="button-primary">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}{busy ? "Preparing…" : "Approve & render MP4"}</button> : null}{job.status === "rendering" ? <span className="inline-flex items-center gap-2 text-xs font-semibold text-violet"><LoaderCircle className="h-4 w-4 animate-spin" /> Rendering · typically under a few minutes</span> : null}</div>
      </section>
      {job.status === "completed" && job.videoUrl ? <section className="card p-5 sm:p-7"><h2 className="flex items-center gap-2 text-lg font-semibold"><CheckCircle2 className="h-5 w-5 text-emerald-600" /> Your video is ready</h2><p className="mt-2 text-xs text-muted">{job.durationSeconds ?? 15} seconds · {job.aspectRatio} · MP4 · multiple-photo motion with captions, no soundtrack</p><video key={job.videoUrl} controls playsInline preload="metadata" className={`mx-auto mt-5 w-full rounded-xl bg-night ${job.aspectRatio === "9:16" ? "max-w-[380px]" : ""}`} src={job.videoUrl}>Video playback is not supported by your browser.</video><div className="mt-5 flex flex-wrap gap-3"><a className="button-primary" href={job.videoUrl} download={`${job.productName.replace(/[^a-z0-9-]/gi, "-").slice(0, 50)}-auvra.mp4`}><Film className="h-4 w-4" /> Download MP4</a><button className="button-secondary" type="button" onClick={reset}><Play className="h-4 w-4" /> Create another</button></div></section> : <button type="button" onClick={reset} className="button-secondary">Start a new video brief</button>}
    </div>}
    {recent.length ? <section className="card mt-6 p-5 sm:p-6"><h2 className="text-sm font-semibold text-ink">Recent creative projects</h2><p className="mt-1 text-xs leading-5 text-muted">Projects are stored on this shared demo server and can be reopened after refreshing the page.</p><div className="mt-4 grid gap-2 sm:grid-cols-2">{recent.map((project) => <button key={project.id} type="button" disabled={busy} onClick={() => void reopen(project.id)} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-white px-4 py-3 text-left transition hover:border-violet/30 hover:bg-violet/[.025]"><span className="min-w-0"><span className="block truncate text-xs font-semibold text-ink">{project.productName}</span><span className="mt-1 block text-[11px] text-muted">{project.status.replaceAll("_", " ")} · {money(project.inferenceCostUsd)} inference</span></span><ArrowRight className="h-4 w-4 shrink-0 text-violet" /></button>)}</div></section> : null}
  </div>;
}
