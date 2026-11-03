/* ========== 1) البيانات ==========
   دلوقتي بنستخدم بيانات تجريبية. لما الباك إند يجهز (Swagger)،
   حطي رابط الـ API هنا وهيشتغل من غير ما تغيري باقي الكود.
   لازم الـ API يرجّع نفس شكل الـ mock تحت. */
const API_URL = "";   // مثال: "http://localhost:8000/api/dashboard"

const mock = {
  kpis: [
    { label: "Total sales", value: 482350, format: "money", note: "+8.4% vs last month", trend: "up" },
    { label: "Orders", value: 1284, format: "number", note: "+3.1% vs last month", trend: "up" },
    { label: "Average order", value: 375.7, format: "money", note: "-1.2% vs last month", trend: "down" },
    { label: "Risk score", value: 38, format: "score", note: "Moderate, out of 100", risk: true }
  ],
  months: ["Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct"],
  sales:  [52000, 58500, 54200, 63100, 67800, 61900, 72400, 78600],
  risks: [
    { name: "Stock shortage", score: 55 },
    { name: "Customer credit", score: 42 },
    { name: "Supplier delay", score: 31 },
    { name: "Late payments", score: 27 }
  ],
  scans: [
    { name: "Invoice 2041", date: "2026-10-28", status: "done" },
    { name: "Invoice 2040", date: "2026-10-27", status: "done" },
    { name: "Receipt 118", date: "2026-10-25", status: "wait" }
  ]
};

async function loadData() {
  if (!API_URL) return mock;
  try {
    const res = await fetch(API_URL);
    if (!res.ok) throw new Error(res.status);
    return await res.json();
  } catch (err) {
    console.warn("API unavailable, using mock data:", err);
    showToast("Server not reachable. Showing sample data.");
    return mock;
  }
}

/* ========== 2) الرسم (Rendering) ========== */
const $ = (id) => document.getElementById(id);
const fmt = {
  money: (v) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(v) + " EGP",
  number: (v) => new Intl.NumberFormat("en-US").format(v),
  score: (v) => v + "/100"
};
const level = (s) => (s >= 60 ? "var(--bad)" : s >= 35 ? "var(--warn)" : "var(--good)");

function renderKpis(list) {
  $("kpis").innerHTML = list.map((k) => `
    <div class="kpi ${k.risk ? "risk" : ""}">
      <div class="label">${k.label}</div>
      <div class="value">${fmt[k.format](k.value)}</div>
      <div class="note ${k.trend || ""}">${k.note}</div>
    </div>`).join("");
}

function renderChart(labels, values) {
  const W = 640, H = 240, p = { l: 52, r: 12, t: 12, b: 28 };
  const max = Math.max(...values) * 1.1;
  const x = (i) => p.l + (i * (W - p.l - p.r)) / (values.length - 1);
  const y = (v) => H - p.b - (v / max) * (H - p.t - p.b);
  const line = "M" + values.map((v, i) => `${x(i)},${y(v)}`).join("L");
  const area = `${line}L${x(values.length - 1)},${H - p.b}L${x(0)},${H - p.b}Z`;
  const grid = [0, 1, 2, 3, 4].map((t) => {
    const v = (max * t) / 4;
    return `<line class="axis" x1="${p.l}" x2="${W - p.r}" y1="${y(v)}" y2="${y(v)}"/>
            <text x="${p.l - 8}" y="${y(v) + 4}" text-anchor="end">${Math.round(v / 1000)}k</text>`;
  }).join("");
  const xs = labels.map((l, i) => `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${l}</text>`).join("");
  const dots = values.map((v, i) => `<circle class="dot" cx="${x(i)}" cy="${y(v)}" r="4"/>`).join("");
  $("salesChart").innerHTML =
    `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Line chart of monthly sales">
       ${grid}<path class="area" d="${area}"/><path class="line" d="${line}"/>${dots}${xs}</svg>`;
}

function renderRisks(list) {
  $("riskBars").innerHTML = list.map((r) => `
    <div class="bar">
      <div class="row"><span>${r.name}</span><strong>${r.score}</strong></div>
      <div class="track"><div class="fill" style="width:${r.score}%;background:${level(r.score)}"></div></div>
    </div>`).join("");
}

function renderScans(list) {
  $("scanRows").innerHTML = list.map((s) => `
    <tr>
      <td>${s.thumb ? `<img class="thumb" src="${s.thumb}" alt="">` : ""}${s.name}</td>
      <td>${s.date}</td>
      <td><span class="tag ${s.status}">${s.status === "done" ? "Read" : "Waiting for OCR"}</span></td>
    </tr>`).join("");
}

/* ========== 3) الكاميرا ========== */
const dlg = $("camera"), video = $("video"), canvas = $("canvas"), preview = $("preview");
let stream = null, photo = null, scans = [];

function setState(s) { dlg.dataset.state = s; }
function stopCamera() { stream?.getTracks().forEach((t) => t.stop()); stream = null; video.srcObject = null; }

function cameraError(e) {
  if (!navigator.mediaDevices?.getUserMedia) return "Camera needs a secure connection (https or localhost).";
  if (e.name === "NotAllowedError") return "Camera access was blocked. Allow it in your browser settings and try again.";
  if (e.name === "NotFoundError") return "No camera found on this device.";
  return "Could not start the camera. Close other apps that use it and try again.";
}

async function openCamera() {
  dlg.showModal();
  setState("live");
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },  // الكاميرا الخلفية في الموبايل
      audio: false
    });
    video.srcObject = stream;
  } catch (e) {
    $("camMsg").textContent = cameraError(e);
    setState("error");
  }
}

function takePhoto() {
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video, 0, 0);
  photo = canvas.toDataURL("image/jpeg", 0.9);
  preview.src = photo;
  setState("review");
}

function usePhoto() {
  scans.unshift({
    name: "Scan " + (scans.length + 1),
    date: new Date().toISOString().slice(0, 10),
    status: "wait",
    thumb: photo     // لاحقاً: ابعتي الصورة للباك إند (fetch + FormData) علشان الـ OCR
  });
  renderScans(scans);
  dlg.close();
  showToast("Photo saved. It will be read once OCR is connected.");
}

$("scanBtn").addEventListener("click", openCamera);
$("shotBtn").addEventListener("click", takePhoto);
$("retakeBtn").addEventListener("click", () => setState("live"));
$("useBtn").addEventListener("click", usePhoto);
$("closeBtn").addEventListener("click", () => dlg.close());
dlg.addEventListener("close", stopCamera);   // يقفل الكاميرا لما الـ dialog يتقفل بأي طريقة

/* ========== 4) أدوات صغيرة ========== */
let toastTimer;
function showToast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 3500);
}

/* ========== 5) تشغيل ========== */
(async function init() {
  const data = await loadData();
  scans = [...data.scans];
  renderKpis(data.kpis);
  renderChart(data.months, data.sales);
  renderRisks(data.risks);
  renderScans(scans);
})();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(console.warn));
}
