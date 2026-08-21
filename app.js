/* ============================================================
   TRADING JOURNAL — app.js
   Vanilla JS, no build step. Data model + Drive upload + canvas draw.
   ============================================================ */

const STORAGE_KEY = "tj_trades_v1";
const FOLDER_ID_KEY = "tj_drive_folder_id";

const TAGS = ["Trend","Pullback","Breakout","CounterTrend","FollowTrend","A Setup","B Setup","C Setup","Win","Loss","BE","Mistake"];
const RATING_KEYS = [
  {key:"setupQuality", label:"Setup Quality"},
  {key:"entryQuality", label:"Entry Quality"},
  {key:"riskManagement", label:"Risk Management"},
  {key:"exitQuality", label:"Exit Quality"},
  {key:"ruleFollow", label:"ตามระบบ (Rule Follow)"},
  {key:"emotionalControl", label:"Emotional Control"},
];
const IMG_SLOTS = ["before_htf","before_entry","before_detail","before_extra_1","after_result","after_exit","after_detail"];
const SIDEBAR_STATE_KEY = "tj_sidebar_collapsed";

// ---------- state ----------
let trades = loadTrades();
let current = blankTrade();
let activeSlotKey = null; // which image slot / note field the modal is editing
let activeIsNote = false;

// canvas state
let baseImage = null; // HTMLImageElement currently loaded on canvas
let strokes = [];      // undo stack of stroke arrays
let currentStroke = null;
let drawing = false;
let accessToken = null;
let tokenClient = null;

// ============================================================
// INIT
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
  buildRatingBlock();
  buildTagBlock();
  bindPillToggles();
  bindTopbar();
  bindSidebarToggle();
  bindImageSlots();
  bindNoteHandButtons();
  bindModal();
  bindSaveBar();
  bindSearch();
  bindFieldAutosync();
  bindSmartTextareas();
  loadFormFromCurrent();
  renderTicker();
  showView("form");
  initGoogleAuth();
});

function blankTrade(){
  return {
    id: null,
    createdAt: Date.now(),
    fields: {f_tradeNo: String(nextTradeNumber())}, // all text inputs by id
    toggles: {}, // pill-toggle fields
    ratings: {}, // rating key -> 0-5
    tags: [],
    images: {}, // slot -> {driveId, name, thumbnailLink, webViewLink, localDataUrl}
    beforeSlotCount: 4,
  };
}

function nextTradeNumber(){
  const highest = trades.reduce((max, trade) => {
    const value = Number.parseInt(trade.fields?.f_tradeNo, 10);
    return Number.isFinite(value) ? Math.max(max, value) : max;
  }, 0);
  return highest + 1;
}

// ============================================================
// VIEW SWITCHING
// ============================================================
function showView(name){
  document.getElementById("listView").classList.toggle("active", name==="list");
  document.getElementById("formView").classList.toggle("active", name==="form");
  if(name==="list") renderTradeList();
}

function bindTopbar(){
  document.getElementById("viewListBtn").onclick = () => showView("list");
  document.getElementById("viewNewBtn").onclick = () => { current = blankTrade(); loadFormFromCurrent(); showView("form"); };
  document.getElementById("connectDriveBtn").onclick = requestDriveAccess;
}

function bindSidebarToggle(){
  const button = document.getElementById("sidebarToggle");
  const collapsed = localStorage.getItem(SIDEBAR_STATE_KEY) === "true";
  document.body.classList.toggle("sidebar-collapsed", collapsed);
  updateSidebarToggleLabel();
  button.onclick = () => {
    document.body.classList.toggle("sidebar-collapsed");
    localStorage.setItem(SIDEBAR_STATE_KEY, document.body.classList.contains("sidebar-collapsed"));
    updateSidebarToggleLabel();
  };
}

function updateSidebarToggleLabel(){
  const button = document.getElementById("sidebarToggle");
  const collapsed = document.body.classList.contains("sidebar-collapsed");
  button.setAttribute("aria-label", collapsed ? "กางเมนูด้านข้าง" : "พับเมนูด้านข้าง");
}

// ============================================================
// PILL TOGGLES (single-select buttons)
// ============================================================
function bindPillToggles(){
  document.querySelectorAll(".pill-toggle").forEach(group => {
    const field = group.dataset.field;
    group.querySelectorAll(".pill").forEach(btn => {
      btn.addEventListener("click", () => {
        const already = btn.classList.contains("active");
        group.querySelectorAll(".pill").forEach(b=>b.classList.remove("active"));
        if(!already){
          btn.classList.add("active");
          current.toggles[field] = btn.dataset.val;
        } else {
          delete current.toggles[field];
        }
        if(field === "direction") updateCalculatedRR();
      });
    });
  });
}

function applyToggleState(){
  document.querySelectorAll(".pill-toggle").forEach(group => {
    const field = group.dataset.field;
    const val = current.toggles[field];
    group.querySelectorAll(".pill").forEach(b => {
      b.classList.toggle("active", b.dataset.val === val);
    });
  });
}

// ============================================================
// RATING STARS
// ============================================================
function buildRatingBlock(){
  const el = document.getElementById("ratingBlock");
  el.innerHTML = "";
  RATING_KEYS.forEach(r => {
    const row = document.createElement("div");
    row.className = "rating-row";
    row.innerHTML = `<span class="rlabel">${r.label}</span><span class="stars" data-key="${r.key}"></span>`;
    el.appendChild(row);
    const starsEl = row.querySelector(".stars");
    for(let i=1;i<=5;i++){
      const s = document.createElement("span");
      s.className = "star";
      s.textContent = "★";
      s.dataset.val = i;
      s.addEventListener("click", () => {
        const cur = current.ratings[r.key] || 0;
        current.ratings[r.key] = (cur === i) ? i-1 : i; // click same star to reduce
        renderStars();
        updateTotalScore();
      });
      starsEl.appendChild(s);
    }
  });
  renderStars();
}
function renderStars(){
  document.querySelectorAll(".stars").forEach(starsEl => {
    const key = starsEl.dataset.key;
    const val = current.ratings[key] || 0;
    starsEl.querySelectorAll(".star").forEach(s => {
      s.classList.toggle("filled", Number(s.dataset.val) <= val);
    });
  });
}
function updateTotalScore(){
  const total = RATING_KEYS.reduce((sum,r) => sum + (current.ratings[r.key]||0), 0);
  document.getElementById("totalScore").textContent = `${total} / 30`;
}

// ============================================================
// TAGS
// ============================================================
function buildTagBlock(){
  const el = document.getElementById("tagBlock");
  el.innerHTML = "";
  TAGS.forEach(tag => {
    const chip = document.createElement("span");
    chip.className = "tag-chip";
    chip.textContent = "#"+tag;
    chip.addEventListener("click", () => {
      const idx = current.tags.indexOf(tag);
      if(idx>=0){ current.tags.splice(idx,1); chip.classList.remove("active"); }
      else { current.tags.push(tag); chip.classList.add("active"); }
    });
    el.appendChild(chip);
  });
}
function applyTagState(){
  document.querySelectorAll(".tag-chip").forEach(chip => {
    const tag = chip.textContent.replace("#","");
    chip.classList.toggle("active", current.tags.includes(tag));
  });
}

// ============================================================
// TEXT FIELD BINDING (auto-sync inputs <-> current.fields)
// ============================================================
function allFieldInputs(){
  return document.querySelectorAll("#formView input[id^='f_'], #formView textarea[id^='f_'], #formView select[id^='f_']");
}
function bindFieldAutosync(){
  allFieldInputs().forEach(inp => {
    inp.addEventListener("input", () => {
      current.fields[inp.id] = inp.value;
      if(["f_entryPrice", "f_slPrice", "f_exitPrice"].includes(inp.id)) updateCalculatedRR();
    });
  });
}

function bindSmartTextareas(){
  document.querySelectorAll("#formView textarea").forEach(textarea => {
    textarea.addEventListener("input", () => {
      const caret = textarea.selectionStart;
      const beforeCaret = textarea.value.slice(0, caret);
      const bulletTrigger = beforeCaret.match(/(^|\n)([ \t]*)- $/);
      if(!bulletTrigger) return;

      textarea.setRangeText("• ", caret - 2, caret, "end");
      textarea.dispatchEvent(new Event("input", {bubbles:true}));
    });

    textarea.addEventListener("keydown", event => {
      if(event.key === " " && textarea.selectionStart === textarea.selectionEnd){
        const caret = textarea.selectionStart;
        const lineStart = textarea.value.lastIndexOf("\n", caret - 1) + 1;
        const currentLine = textarea.value.slice(lineStart, caret);
        const bulletStart = currentLine.match(/^(\s*)-$/);
        if(bulletStart){
          event.preventDefault();
          textarea.setRangeText(`${bulletStart[1]}• `, lineStart, caret, "end");
          textarea.dispatchEvent(new Event("input", {bubbles:true}));
          return;
        }
      }

      if(event.key !== "Enter" || event.shiftKey || textarea.selectionStart !== textarea.selectionEnd) return;

      const caret = textarea.selectionStart;
      const lineStart = textarea.value.lastIndexOf("\n", caret - 1) + 1;
      const currentLine = textarea.value.slice(lineStart, caret);
      const numbered = currentLine.match(/^(\s*)(\d+)([.)])\s+(.*)$/);
      const bullet = currentLine.match(/^(\s*)[•-]\s+(.*)$/);
      if(!numbered && !bullet) return;

      event.preventDefault();
      const content = numbered ? numbered[4] : bullet[2];
      if(!content.trim()){
        textarea.setRangeText("", lineStart, caret, "end");
      } else {
        const prefix = numbered
          ? `${numbered[1]}${Number(numbered[2]) + 1}${numbered[3]} `
          : `${bullet[1]}• `;
        textarea.setRangeText(`\n${prefix}`, caret, caret, "end");
      }
      textarea.dispatchEvent(new Event("input", {bubbles:true}));
    });
  });
}

function parsePrice(value){
  const normalized = String(value || "").replace(/,/g, "").trim();
  if(!normalized) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function updateCalculatedRR(){
  const entry = parsePrice(current.fields.f_entryPrice);
  const stop = parsePrice(current.fields.f_slPrice);
  const exit = parsePrice(current.fields.f_exitPrice);
  const direction = current.toggles.direction;
  let result = "";

  if(entry !== null && stop !== null && exit !== null && direction){
    const risk = direction === "Long" ? entry - stop : stop - entry;
    const reward = direction === "Long" ? exit - entry : entry - exit;
    if(risk > 0) result = `1 : ${(reward / risk).toFixed(2)}`;
  }

  current.fields.f_rrMultiple = result;
  const output = document.getElementById("f_rrMultiple");
  if(output) output.value = result;
}

function loadFormFromCurrent(){
  const legacyDate = current.fields.f_date;
  if(legacyDate && current.fields.f_entryTime && !current.fields.f_entryTime.includes("T")){
    current.fields.f_entryTime = `${legacyDate}T${current.fields.f_entryTime}`;
  }
  if(legacyDate && current.fields.f_exitTime && !current.fields.f_exitTime.includes("T")){
    current.fields.f_exitTime = `${legacyDate}T${current.fields.f_exitTime}`;
  }
  allFieldInputs().forEach(inp => { inp.value = current.fields[inp.id] || ""; });
  applyToggleState();
  updateCalculatedRR();
  applyTagState();
  renderStars();
  updateTotalScore();
  renderAllImageSlots();
  document.getElementById("deleteTradeBtn").style.display = current.id ? "inline-block" : "none";
  document.getElementById("saveStatus").textContent = current.id ? `กำลังแก้ไขเทรด #${current.fields.f_tradeNo||""}` : "เทรดใหม่ (ยังไม่บันทึก)";
}

// ============================================================
// IMAGE SLOTS -> open annotate modal
// ============================================================
function bindImageSlots(){
  document.querySelectorAll("[data-slot]").forEach(bindImageSlotElement);
  document.getElementById("addBeforeImageBtn").onclick = () => {
    const nextNumber = Math.max(4, current.beforeSlotCount || 4) + 1;
    const slot = `before_extra_${nextNumber - 3}`;
    openAnnotateModal(slot, false, slot);
  };
}
function bindImageSlotElement(slotEl){
  if(slotEl.dataset.bound === "true") return;
  slotEl.dataset.bound = "true";
  slotEl.addEventListener("click", () => openAnnotateModal(slotEl.dataset.slot, false, slotEl.dataset.slot));
}
function createBeforeImageSlot(number){
  const gallery = document.getElementById("beforeImageGallery");
  if(!gallery || number <= 4) return;
  const slot = `before_extra_${number - 3}`;
  if(gallery.querySelector(`[data-slot="${slot}"]`)) return;
  const slotEl = document.createElement("div");
  slotEl.className = "imgslot before-dynamic";
  slotEl.dataset.slot = slot;
  slotEl.innerHTML = `<div class="imgslot-label">${number}. Additional Chart</div><div class="imgslot-canvas-wrap"></div>`;
  gallery.appendChild(slotEl);
  bindImageSlotElement(slotEl);
  renderImageSlot(slot);
}
function syncBeforeImageSlots(){
  document.querySelectorAll(".before-dynamic").forEach(el => el.remove());
  const highestImageNumber = Object.keys(current.images || {}).reduce((highest, key) => {
    const match = key.match(/^before_extra_(\d+)$/);
    return match ? Math.max(highest, Number(match[1]) + 3) : highest;
  }, 4);
  const count = Math.max(4, highestImageNumber);
  current.beforeSlotCount = count;
  for(let number = 5; number <= count; number++) createBeforeImageSlot(number);
}
function bindNoteHandButtons(){
  document.querySelectorAll(".hand-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const target = btn.dataset.target; // e.g. f_notesBefore
      openAnnotateModal(target, true, "note:"+target);
    });
  });
}
function renderAllImageSlots(){
  syncBeforeImageSlots();
  document.querySelectorAll("[data-slot]").forEach(slotEl => renderImageSlot(slotEl.dataset.slot));
}
function renderImageSlot(slot){
  const slotEl = document.querySelector(`[data-slot="${slot}"]`);
  const wrap = slotEl?.querySelector(".imgslot-canvas-wrap");
  if(!wrap) return;
  slotEl.querySelector(".image-delete-btn")?.remove();
  const img = current.images[slot];
  const isAdditional = Number(slot.match(/^before_extra_(\d+)$/)?.[1] || 0) >= 2;
  if(img && (img.thumbnailLink || img.localDataUrl)){
    wrap.innerHTML = `<img src="${img.thumbnailLink || img.localDataUrl}" alt="">`;
  } else {
    wrap.innerHTML = `<div class="imgslot-placeholder">🖼</div>`;
  }
  if(img || isAdditional){
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "image-delete-btn";
    deleteButton.textContent = isAdditional ? "✕ ลบกล่องและรูป" : "✕ ลบรูป";
    deleteButton.addEventListener("click", event => {
      event.stopPropagation();
      deleteImageFromSlot(slot);
    });
    slotEl.appendChild(deleteButton);
  }
}

function deleteImageFromSlot(slot){
  const isAdditional = Number(slot.match(/^before_extra_(\d+)$/)?.[1] || 0) >= 2;
  if(!current.images[slot] && !isAdditional) return false;
  const message = isAdditional
    ? "ลบกล่อง Additional Chart และรูปนี้ออกจากเทรด? (ไฟล์ใน Google Drive จะไม่ถูกลบ)"
    : "ลบรูปนี้ออกจากเทรด? (ไฟล์ใน Google Drive จะไม่ถูกลบ)";
  if(!confirm(message)) return false;
  delete current.images[slot];

  if(isAdditional){
    const remaining = Object.entries(current.images)
      .filter(([key]) => Number(key.match(/^before_extra_(\d+)$/)?.[1] || 0) >= 2)
      .sort(([a], [b]) => Number(a.split("_").pop()) - Number(b.split("_").pop()))
      .map(([, image]) => image);
    Object.keys(current.images).forEach(key => {
      if(Number(key.match(/^before_extra_(\d+)$/)?.[1] || 0) >= 2) delete current.images[key];
    });
    remaining.forEach((image, index) => { current.images[`before_extra_${index + 2}`] = image; });
    current.beforeSlotCount = 4 + remaining.length;
    renderAllImageSlots();
  } else {
    renderImageSlot(slot);
  }
  return true;
}

// ============================================================
// ANNOTATE MODAL (canvas drawing + upload)
// ============================================================
const canvas = () => document.getElementById("drawCanvas");
function openAnnotateModal(key, isNote, titleKey){
  activeSlotKey = key;
  activeIsNote = isNote;
  document.getElementById("annotateTitle").textContent = isNote ? "วาดโน้ตลายมือ" : "แนบรูป / วาดทับรูป";
  document.getElementById("annotateModal").classList.add("active");
  document.getElementById("uploadStatus").textContent = "";
  strokes = [];
  currentStroke = null;
  baseImage = null;

  const existing = isNote ? null : current.images[key];
  document.getElementById("removeCurrentImageBtn").style.display = existing ? "inline-block" : "none";
  const c = canvas();
  const stage = document.querySelector(".canvas-stage");
  const maxW = Math.min(stage.clientWidth - 20, 640);

  if(existing && existing.localDataUrl){
    const im = new Image();
    im.onload = () => { baseImage = im; sizeCanvasToImage(im, maxW); redraw(); };
    im.src = existing.localDataUrl;
    document.getElementById("canvasEmpty").style.display = "none";
  } else if(isNote){
    // blank ruled canvas for handwriting
    c.width = maxW; c.height = 320;
    document.getElementById("canvasEmpty").style.display = "block";
    redraw();
  } else {
    c.width = maxW; c.height = 260;
    document.getElementById("canvasEmpty").style.display = "block";
    redraw();
  }
}
function sizeCanvasToImage(im, maxW){
  const scale = Math.min(maxW / im.width, 1);
  canvas().width = Math.round(im.width * scale);
  canvas().height = Math.round(im.height * scale);
}
function closeAnnotateModal(){
  document.getElementById("annotateModal").classList.remove("active");
  activeSlotKey = null;
}

function bindModal(){
  document.getElementById("annotateClose").onclick = closeAnnotateModal;
  document.getElementById("removeCurrentImageBtn").onclick = () => {
    if(activeSlotKey && deleteImageFromSlot(activeSlotKey)) closeAnnotateModal();
  };
  document.getElementById("fileInput").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if(file) loadImageFile(file);
  });
  document.getElementById("pasteBtn").onclick = async () => {
    try{
      const items = await navigator.clipboard.read();
      for(const item of items){
        const type = item.types.find(t=>t.startsWith("image/"));
        if(type){
          const blob = await item.getType(type);
          loadImageBlob(blob);
          return;
        }
      }
      setStatus("ไม่พบรูปใน clipboard");
    }catch(err){
      setStatus("อ่าน clipboard ไม่ได้ — ลองวางด้วย Ctrl+V แทน");
    }
  };
  document.addEventListener("paste", (e) => {
    if(!document.getElementById("annotateModal").classList.contains("active")) return;
    const items = e.clipboardData?.items || [];
    for(const item of items){
      if(item.type.startsWith("image/")){
        loadImageBlob(item.getAsFile());
        break;
      }
    }
  });
  document.getElementById("undoBtn").onclick = () => { strokes.pop(); redraw(); };
  document.getElementById("clearBtn").onclick = () => { strokes = []; baseImage = null; document.getElementById("canvasEmpty").style.display="block"; const c=canvas(); c.getContext("2d").clearRect(0,0,c.width,c.height); };
  document.getElementById("uploadDriveBtn").onclick = handleUpload;

  // drawing events (pointer events cover mouse + touch + pen incl. Apple Pencil)
  const c = canvas();
  c.addEventListener("pointerdown", startStroke);
  c.addEventListener("pointermove", moveStroke);
  window.addEventListener("pointerup", endStroke);
  c.addEventListener("pointerleave", endStroke);
}

function loadImageFile(file){ loadImageBlob(file); }
function loadImageBlob(blob){
  const reader = new FileReader();
  reader.onload = (e) => {
    const im = new Image();
    im.onload = () => {
      baseImage = im;
      const stage = document.querySelector(".canvas-stage");
      const maxW = Math.min(stage.clientWidth - 20, 640);
      sizeCanvasToImage(im, maxW);
      strokes = [];
      document.getElementById("canvasEmpty").style.display = "none";
      redraw();
    };
    im.src = e.target.result;
  };
  reader.readAsDataURL(blob);
}

function getPos(e){
  const rect = canvas().getBoundingClientRect();
  const scaleX = canvas().width / rect.width;
  const scaleY = canvas().height / rect.height;
  return { x:(e.clientX-rect.left)*scaleX, y:(e.clientY-rect.top)*scaleY, p: e.pressure && e.pressure>0 ? e.pressure : 0.5 };
}
function startStroke(e){
  e.preventDefault();
  drawing = true;
  document.getElementById("canvasEmpty").style.display = "none";
  currentStroke = { color: document.getElementById("penColor").value, size: Number(document.getElementById("penSize").value), points:[getPos(e)] };
  canvas().setPointerCapture(e.pointerId);
}
function moveStroke(e){
  if(!drawing) return;
  currentStroke.points.push(getPos(e));
  redraw(true);
}
function endStroke(){
  if(!drawing) return;
  drawing = false;
  if(currentStroke && currentStroke.points.length>1) strokes.push(currentStroke);
  currentStroke = null;
  redraw();
}
function redraw(live){
  const c = canvas();
  const ctx = c.getContext("2d");
  ctx.clearRect(0,0,c.width,c.height);
  if(baseImage) ctx.drawImage(baseImage,0,0,c.width,c.height);
  const all = live && currentStroke ? [...strokes, currentStroke] : strokes;
  all.forEach(s => {
    if(s.points.length<2) return;
    ctx.strokeStyle = s.color;
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(s.points[0].x, s.points[0].y);
    for(let i=1;i<s.points.length;i++){
      const pt = s.points[i];
      ctx.lineWidth = s.size * (0.6 + pt.p);
      ctx.lineTo(pt.x, pt.y);
    }
    ctx.stroke();
  });
}
function setStatus(msg){ document.getElementById("uploadStatus").textContent = msg; }

function canvasHasContent(){
  return baseImage !== null || strokes.length > 0;
}

// ============================================================
// GOOGLE DRIVE AUTH + UPLOAD
// ============================================================
function initGoogleAuth(){
  const tryInit = () => {
    if(typeof google === "undefined" || !google.accounts){ setTimeout(tryInit, 300); return; }
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: DRIVE_SCOPE,
      callback: (resp) => {
        if(resp.error){ setDriveStatus(false); return; }
        accessToken = resp.access_token;
        setDriveStatus(true);
      }
    });
  };
  tryInit();
}
function requestDriveAccess(){
  if(!tokenClient){ alert("Google Sign-In ยังโหลดไม่เสร็จ ลองอีกครั้งใน 1-2 วินาที"); return; }
  if(GOOGLE_CLIENT_ID.startsWith("YOUR_CLIENT_ID")){
    alert("ยังไม่ได้ใส่ Google Client ID ใน config.js — ดูวิธีตั้งค่าใน README.md");
    return;
  }
  tokenClient.requestAccessToken({ prompt: accessToken ? "" : "consent" });
}
function setDriveStatus(connected){
  const el = document.getElementById("driveStatus");
  el.classList.toggle("connected", connected);
  el.classList.toggle("disconnected", !connected);
  document.getElementById("driveStatusText").textContent = connected ? "Drive: เชื่อมต่อแล้ว" : "Drive: ไม่ได้เชื่อมต่อ";
  document.getElementById("connectDriveBtn").textContent = connected ? "🔄 ต่ออายุสิทธิ์" : "เชื่อมต่อ Google Drive";
}

async function ensureDriveFolder(){
  let folderId = localStorage.getItem(FOLDER_ID_KEY);
  if(folderId) return folderId;

  const q = encodeURIComponent(`name='${DRIVE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  }).then(r=>r.json());

  if(searchRes.files && searchRes.files.length>0){
    folderId = searchRes.files[0].id;
  } else {
    const createRes = await fetch("https://www.googleapis.com/drive/v3/files", {
      method:"POST",
      headers:{ Authorization:`Bearer ${accessToken}`, "Content-Type":"application/json" },
      body: JSON.stringify({ name: DRIVE_FOLDER_NAME, mimeType:"application/vnd.google-apps.folder" })
    }).then(r=>r.json());
    folderId = createRes.id;
  }
  localStorage.setItem(FOLDER_ID_KEY, folderId);
  return folderId;
}

async function handleUpload(){
  if(!canvasHasContent()){ setStatus("ยังไม่มีรูป/ลายเส้นให้อัปโหลด"); return; }
  if(!accessToken){
    setStatus("กำลังขอสิทธิ์เข้าถึง Google Drive...");
    requestDriveAccess();
    return;
  }
  setStatus("กำลังอัปโหลดขึ้น Google Drive...");
  try{
    const folderId = await ensureDriveFolder();
    const dataUrl = canvas().toDataURL("image/png");
    const blob = await (await fetch(dataUrl)).blob();
    const filename = `${activeSlotKey}_${Date.now()}.png`;

    const metadata = { name: filename, parents:[folderId] };
    const form = new FormData();
    form.append("metadata", new Blob([JSON.stringify(metadata)], {type:"application/json"}));
    form.append("file", blob);

    const uploadRes = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,thumbnailLink", {
      method:"POST",
      headers:{ Authorization:`Bearer ${accessToken}` },
      body: form
    }).then(r=>r.json());

    if(uploadRes.error){ setStatus("อัปโหลดไม่สำเร็จ: " + uploadRes.error.message); return; }

    // make link-viewable so it can be displayed later without re-auth
    await fetch(`https://www.googleapis.com/drive/v3/files/${uploadRes.id}/permissions`, {
      method:"POST",
      headers:{ Authorization:`Bearer ${accessToken}`, "Content-Type":"application/json" },
      body: JSON.stringify({ role:"reader", type:"anyone" })
    });

    const record = {
      driveId: uploadRes.id,
      name: uploadRes.name,
      webViewLink: `https://drive.google.com/file/d/${uploadRes.id}/view`,
      thumbnailLink: `https://drive.google.com/thumbnail?id=${uploadRes.id}&sz=w600`,
      localDataUrl: dataUrl
    };

    if(activeIsNote){
      current.images["note:"+activeSlotKey] = record;
    } else {
      current.images[activeSlotKey] = record;
      const extraMatch = activeSlotKey.match(/^before_extra_(\d+)$/);
      if(extraMatch){
        const number = Number(extraMatch[1]) + 3;
        current.beforeSlotCount = Math.max(4, current.beforeSlotCount || 4, number);
        createBeforeImageSlot(number);
      }
      renderImageSlot(activeSlotKey);
    }
    setStatus("✅ อัปโหลดสำเร็จ! บันทึกไว้กับเทรดนี้แล้ว");
    setTimeout(closeAnnotateModal, 700);
  }catch(err){
    console.error(err);
    setStatus("เกิดข้อผิดพลาด: " + err.message);
  }
}

// ============================================================
// SAVE / LOAD / DELETE TRADES (localStorage)
// ============================================================
function loadTrades(){
  try{ return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }catch(e){ return []; }
}
function persistTrades(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(trades)); }

function bindSaveBar(){
  document.getElementById("saveTradeBtn").onclick = saveCurrentTrade;
  document.getElementById("deleteTradeBtn").onclick = deleteCurrentTrade;
}
function saveCurrentTrade(){
  if(!current.fields.f_tradeNo) current.fields.f_tradeNo = String(nextTradeNumber());
  if(!current.id) current.id = "t_" + Date.now();
  current.updatedAt = Date.now();
  const idx = trades.findIndex(t=>t.id===current.id);
  if(idx>=0) trades[idx] = current; else trades.push(current);
  persistTrades();
  document.getElementById("saveStatus").textContent = "✅ บันทึกแล้ว";
  document.getElementById("deleteTradeBtn").style.display = "inline-block";
  renderTicker();
}
function deleteCurrentTrade(){
  if(!current.id) return;
  if(!confirm("ลบเทรดนี้ออกจากบันทึก? (รูปใน Google Drive จะไม่ถูกลบ)")) return;
  trades = trades.filter(t=>t.id!==current.id);
  persistTrades();
  current = blankTrade();
  loadFormFromCurrent();
  renderTicker();
  showView("list");
}
function openTrade(id){
  const t = trades.find(x=>x.id===id);
  if(!t) return;
  current = JSON.parse(JSON.stringify(t));
  loadFormFromCurrent();
  showView("form");
}

// ============================================================
// TICKER STRIP
// ============================================================
function renderTicker(){
  const el = document.getElementById("ticker");
  if(trades.length===0){ el.innerHTML = `<div class="ticker-empty">ยังไม่มีเทรดที่บันทึก — เริ่มบันทึกเทรดแรกของคุณได้เลย</div>`; return; }
  const sorted = [...trades].sort((a,b)=>(b.updatedAt||b.createdAt)-(a.updatedAt||a.createdAt)).slice(0,20);
  el.innerHTML = sorted.map(t => {
    const res = t.toggles?.result || "-";
    const cls = res==="Win"?"tk-win":res==="Loss"?"tk-loss":"tk-be";
    const asset = t.fields?.f_asset || "—";
    const pl = t.fields?.f_plMoney || "";
    return `<div class="ticker-item"><b>${escapeHtml(asset)}</b><span class="${cls}">${res}</span>${pl?`<span>$${escapeHtml(pl)}</span>`:""}</div>`;
  }).join("");
}

// ============================================================
// LIST VIEW
// ============================================================
function bindSearch(){
  document.getElementById("searchInput").addEventListener("input", renderTradeList);
  document.getElementById("exportJsonBtn").onclick = exportJson;
}
function renderTradeList(){
  const q = (document.getElementById("searchInput").value||"").toLowerCase();
  const container = document.getElementById("tradeTable");
  const filtered = trades.filter(t => {
    if(!q) return true;
    const hay = [t.fields?.f_asset, t.fields?.f_setupReason, ...(t.tags||[])].join(" ").toLowerCase();
    return hay.includes(q);
  }).sort((a,b)=>(b.updatedAt||b.createdAt)-(a.updatedAt||a.createdAt));

  document.getElementById("listStats").textContent = `${filtered.length} เทรด`;

  if(filtered.length===0){
    container.innerHTML = `<div class="empty-state">ยังไม่มีเทรดที่บันทึก<br><br><button class="btn btn-primary" onclick="document.getElementById('viewNewBtn').click()">+ เริ่มเทรดแรก</button></div>`;
    return;
  }
  container.innerHTML = filtered.map(t => {
    const res = t.toggles?.result || "-";
    const dir = t.toggles?.direction || "-";
    const entryDatetime = t.fields?.f_entryTime || "";
    const tradeDate = entryDatetime.includes("T") ? entryDatetime.split("T")[0] : (t.fields?.f_date || "-");
    return `<div class="trade-row" onclick="openTrade('${t.id}')">
      <span class="mono">${escapeHtml(tradeDate)}</span>
      <span><b>${escapeHtml(t.fields?.f_asset || "—")}</b></span>
      <span class="mono">${dir}</span>
      <span class="mono">${escapeHtml(t.fields?.f_plMoney||"")}</span>
      <span class="res-badge res-${res}">${res}</span>
      <span class="tag-mini">${(t.tags||[]).map(x=>"#"+x).join(" ")}</span>
      <span class="mono">${escapeHtml(t.fields?.f_tradeNo||"")}</span>
    </div>`;
  }).join("");
}

function exportJson(){
  const blob = new Blob([JSON.stringify(trades,null,2)], {type:"application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `trading-journal-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
}

function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
}
