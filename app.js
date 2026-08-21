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
let selectedPenColor = "#ff4d4d";
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
    beforeSlotCount: 1,
    afterSlotCount: 1,
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
        if(field === "direction") updateCalculatedStats();
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
// TRADE REVIEW RATINGS
// ============================================================
function buildRatingBlock(){
  const el = document.getElementById("ratingBlock");
  el.innerHTML = "";
  RATING_KEYS.forEach(r => {
    const row = document.createElement("div");
    row.className = "rating-row";
    row.innerHTML = `<span class="rlabel">${r.label}</span><span class="rating-options" data-key="${r.key}"></span>`;
    el.appendChild(row);
    const optionsEl = row.querySelector(".rating-options");
    [{value:1,label:"แย่",className:"bad"},{value:2,label:"ปานกลาง",className:"medium"},{value:3,label:"ดี",className:"good"}].forEach(option => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `rating-choice ${option.className}`;
      button.textContent = option.label;
      button.dataset.val = option.value;
      button.addEventListener("click", () => {
        const cur = current.ratings[r.key] || 0;
        current.ratings[r.key] = (cur === option.value) ? 0 : option.value;
        renderRatings();
        updateTotalScore();
      });
      optionsEl.appendChild(button);
    });
  });
  renderRatings();
}
function renderRatings(){
  document.querySelectorAll(".rating-options").forEach(optionsEl => {
    const key = optionsEl.dataset.key;
    let val = current.ratings[key] || 0;
    if(val > 3) val = val <= 2 ? 1 : val === 3 ? 2 : 3;
    optionsEl.querySelectorAll(".rating-choice").forEach(button => {
      button.classList.toggle("active", Number(button.dataset.val) === val);
    });
  });
}
function updateTotalScore(){
  const values = RATING_KEYS.map(r => current.ratings[r.key] || 0).filter(Boolean).map(value => value > 3 ? (value <= 2 ? 1 : value === 3 ? 2 : 3) : value);
  const average = values.length ? values.reduce((sum,value) => sum + value, 0) / values.length : 0;
  const summary = !values.length ? "ยังไม่ประเมิน" : average < 1.5 ? "แย่" : average < 2.5 ? "ปานกลาง" : "ดี";
  const output = document.getElementById("totalScore");
  output.textContent = summary;
  output.dataset.level = values.length ? summary : "";
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
      if(["f_entryPrice", "f_slPrice", "f_exitPrice", "f_entryTime", "f_exitTime"].includes(inp.id)) updateCalculatedStats();
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

function setCalculatedField(id, value){
  current.fields[id] = value;
  const output = document.getElementById(id);
  if(output) output.value = value;
}

function formatHoldTime(milliseconds){
  let minutes = Math.floor(milliseconds / 60000);
  const days = Math.floor(minutes / 1440);
  minutes %= 1440;
  const hours = Math.floor(minutes / 60);
  minutes %= 60;
  const parts = [];
  if(days) parts.push(`${days}d`);
  if(hours) parts.push(`${hours}h`);
  if(minutes || parts.length === 0) parts.push(`${minutes}m`);
  return parts.join(" ");
}

function updateCalculatedStats(){
  const entry = parsePrice(current.fields.f_entryPrice);
  const stop = parsePrice(current.fields.f_slPrice);
  const exit = parsePrice(current.fields.f_exitPrice);
  const direction = current.toggles.direction;
  let rrText = "";
  let slR = "";
  let tpR = "";
  let resultR = "";

  if(entry !== null && stop !== null && direction){
    const risk = direction === "Long" ? entry - stop : stop - entry;
    if(risk > 0){
      slR = "-1.00 R";
      if(exit !== null){
        const reward = direction === "Long" ? exit - entry : entry - exit;
        const multiple = reward / risk;
        rrText = `1 : ${multiple.toFixed(2)}`;
        tpR = `${multiple.toFixed(2)} R`;
        resultR = `${multiple.toFixed(2)} R`;
      }
    }
  }

  let holdTime = "";
  const entryTime = Date.parse(current.fields.f_entryTime || "");
  const exitTime = Date.parse(current.fields.f_exitTime || "");
  if(Number.isFinite(entryTime) && Number.isFinite(exitTime) && exitTime >= entryTime){
    holdTime = formatHoldTime(exitTime - entryTime);
  }

  setCalculatedField("f_rrMultiple", rrText);
  setCalculatedField("f_slR", slR);
  setCalculatedField("f_tpR", tpR);
  setCalculatedField("f_resultR", resultR);
  setCalculatedField("f_holdTime", holdTime);
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
  updateCalculatedStats();
  applyTagState();
  renderRatings();
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
    const nextNumber = Math.min(4, Math.max(1, current.beforeSlotCount || 1) + 1);
    if(nextNumber <= (current.beforeSlotCount || 1)) return;
    const slot = `before_chart_${nextNumber}`;
    openAnnotateModal(slot, false, slot);
  };
  document.getElementById("addAfterImageBtn").onclick = () => {
    const nextNumber = Math.min(4, Math.max(1, current.afterSlotCount || 1) + 1);
    if(nextNumber <= (current.afterSlotCount || 1)) return;
    const slot = `after_chart_${nextNumber}`;
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
  if(!gallery || number <= 1 || number > 4) return;
  const slot = `before_chart_${number}`;
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
  migrateLegacyBeforeImages();
  const highestImageNumber = Object.keys(current.images || {}).reduce((highest, key) => {
    const match = key.match(/^before_chart_([1-4])$/);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 1);
  const count = Math.min(4, Math.max(1, highestImageNumber));
  current.beforeSlotCount = count;
  for(let number = 2; number <= count; number++) createBeforeImageSlot(number);
  document.getElementById("beforeImageGallery").classList.toggle("single-slot", count === 1);
  const addButton = document.getElementById("addBeforeImageBtn");
  addButton.disabled = count >= 4;
  addButton.textContent = count >= 4 ? "เพิ่มรูปครบ 4 รูปแล้ว" : "＋ Add Image";
}
function migrateLegacyBeforeImages(){
  if(Object.keys(current.images || {}).some(key => /^before_chart_[1-4]$/.test(key))) return;
  const legacyKeys = ["before_htf", "before_entry", "before_detail", "before_extra_1", "before_extra_2", "before_extra_3"];
  const legacyImages = legacyKeys.map(key => current.images[key]).filter(Boolean).slice(0, 4);
  legacyImages.forEach((image, index) => { current.images[`before_chart_${index + 1}`] = image; });
  legacyKeys.forEach(key => { delete current.images[key]; });
}
function createAfterImageSlot(number){
  const gallery = document.getElementById("afterImageGallery");
  if(!gallery || number <= 1 || number > 4) return;
  const slot = `after_chart_${number}`;
  if(gallery.querySelector(`[data-slot="${slot}"]`)) return;
  const slotEl = document.createElement("div");
  slotEl.className = "imgslot after-dynamic";
  slotEl.dataset.slot = slot;
  slotEl.innerHTML = `<div class="imgslot-label">${number}. Additional Chart</div><div class="imgslot-canvas-wrap"></div>`;
  gallery.appendChild(slotEl);
  bindImageSlotElement(slotEl);
  renderImageSlot(slot);
}
function syncAfterImageSlots(){
  document.querySelectorAll(".after-dynamic").forEach(el => el.remove());
  migrateLegacyAfterImages();
  const highestImageNumber = Object.keys(current.images || {}).reduce((highest, key) => {
    const match = key.match(/^after_chart_([1-4])$/);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 1);
  const count = Math.min(4, Math.max(1, highestImageNumber));
  current.afterSlotCount = count;
  for(let number = 2; number <= count; number++) createAfterImageSlot(number);
  document.getElementById("afterImageGallery").classList.toggle("single-slot", count === 1);
  const addButton = document.getElementById("addAfterImageBtn");
  addButton.disabled = count >= 4;
  addButton.textContent = count >= 4 ? "เพิ่มรูปครบ 4 รูปแล้ว" : "＋ Add Image";
}
function migrateLegacyAfterImages(){
  if(Object.keys(current.images || {}).some(key => /^after_chart_[1-4]$/.test(key))) return;
  const legacyKeys = ["after_result", "after_exit", "after_detail"];
  const legacyImages = legacyKeys.map(key => current.images[key]).filter(Boolean).slice(0, 4);
  legacyImages.forEach((image, index) => { current.images[`after_chart_${index + 1}`] = image; });
  legacyKeys.forEach(key => { delete current.images[key]; });
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
  syncAfterImageSlots();
  document.querySelectorAll("[data-slot]").forEach(slotEl => renderImageSlot(slotEl.dataset.slot));
}
function renderImageSlot(slot){
  const slotEl = document.querySelector(`[data-slot="${slot}"]`);
  const wrap = slotEl?.querySelector(".imgslot-canvas-wrap");
  if(!wrap) return;
  slotEl.querySelector(".image-delete-btn")?.remove();
  const img = current.images[slot];
  const chartMatch = slot.match(/^(before|after)_chart_([1-4])$/);
  const isAdditional = Number(chartMatch?.[2] || 0) >= 2;
  if(img && (img.thumbnailLink || img.localDataUrl)){
    wrap.innerHTML = `<img src="${img.thumbnailLink || img.localDataUrl}" alt="">`;
  } else {
    wrap.innerHTML = `<div class="imgslot-placeholder">🖼</div>`;
  }
  if(img || isAdditional){
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "image-delete-btn";
    deleteButton.textContent = "✕";
    deleteButton.title = isAdditional ? "ลบกล่องและรูป" : "ลบรูป";
    deleteButton.setAttribute("aria-label", deleteButton.title);
    deleteButton.addEventListener("click", event => {
      event.stopPropagation();
      deleteImageFromSlot(slot);
    });
    slotEl.appendChild(deleteButton);
  }
}

async function deleteImageFromSlot(slot){
  const chartMatch = slot.match(/^(before|after)_chart_([1-4])$/);
  const chartGroup = chartMatch?.[1] || "";
  const isAdditional = Number(chartMatch?.[2] || 0) >= 2;
  if(!current.images[slot] && !isAdditional) return false;
  const message = isAdditional
    ? "ลบกล่อง Additional Chart และรูปนี้ รวมถึงไฟล์ใน Google Drive?"
    : "ลบรูปนี้ออกจากเทรด รวมถึงไฟล์ใน Google Drive?";
  if(!confirm(message)) return false;
  const image = current.images[slot];
  if(image?.driveId){
    if(!accessToken){
      alert("กรุณาเชื่อมต่อ Google Drive ก่อนลบรูป เพื่อให้ระบบลบไฟล์จาก Drive ได้ด้วย");
      requestDriveAccess();
      return false;
    }
    let response;
    try{
      response = await fetch(`https://www.googleapis.com/drive/v3/files/${image.driveId}`, {
        method:"DELETE",
        headers:{Authorization:`Bearer ${accessToken}`}
      });
    }catch(error){
      alert("เชื่อมต่อ Google Drive ไม่สำเร็จ กรุณาลองใหม่");
      return false;
    }
    if(!response.ok && response.status !== 404){
      alert("ลบไฟล์จาก Google Drive ไม่สำเร็จ กรุณาต่ออายุสิทธิ์แล้วลองใหม่");
      return false;
    }
  }
  delete current.images[slot];

  if(isAdditional){
    const chartPattern = new RegExp(`^${chartGroup}_chart_([1-4])$`);
    const remaining = Object.entries(current.images)
      .filter(([key]) => Number(key.match(chartPattern)?.[1] || 0) >= 2)
      .sort(([a], [b]) => Number(a.split("_").pop()) - Number(b.split("_").pop()))
      .map(([, image]) => image);
    Object.keys(current.images).forEach(key => {
      if(Number(key.match(chartPattern)?.[1] || 0) >= 2) delete current.images[key];
    });
    remaining.forEach((image, index) => { current.images[`${chartGroup}_chart_${index + 2}`] = image; });
    if(chartGroup === "before") current.beforeSlotCount = 1 + remaining.length;
    if(chartGroup === "after") current.afterSlotCount = 1 + remaining.length;
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

  const existing = isNote ? current.images["note:"+key] : current.images[key];
  document.getElementById("removeCurrentImageBtn").style.display = existing && !isNote ? "inline-block" : "none";
  const c = canvas();
  const stage = document.querySelector(".canvas-stage");
  const maxW = Math.min(stage.clientWidth - 20, 640);

  if(existing && existing.localDataUrl){
    const im = new Image();
    im.onload = () => { baseImage = im; sizeCanvasToImage(im); redraw(); };
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
function sizeCanvasToImage(im){
  canvas().width = im.naturalWidth || im.width;
  canvas().height = im.naturalHeight || im.height;
}
function closeAnnotateModal(){
  document.getElementById("annotateModal").classList.remove("active");
  activeSlotKey = null;
}

function bindModal(){
  document.getElementById("annotateClose").onclick = closeAnnotateModal;
  document.getElementById("removeCurrentImageBtn").onclick = async () => {
    if(activeSlotKey && await deleteImageFromSlot(activeSlotKey)) closeAnnotateModal();
  };
  const colorButton = document.getElementById("penColorDropdownButton");
  const colorMenu = document.getElementById("penColorMenu");
  colorButton.onclick = event => {
    event.stopPropagation();
    const open = colorMenu.classList.toggle("active");
    if(open){
      const rect = colorButton.getBoundingClientRect();
      colorMenu.style.left = `${rect.left}px`;
      colorMenu.style.top = `${rect.bottom + 6}px`;
    }
    colorButton.setAttribute("aria-expanded", String(open));
  };
  document.querySelectorAll(".color-option").forEach(option => {
    option.onclick = event => {
      event.stopPropagation();
      selectedPenColor = option.dataset.color;
      document.getElementById("selectedPenColorSwatch").style.background = selectedPenColor;
      document.querySelectorAll(".color-option").forEach(item => item.classList.toggle("active", item === option));
      colorMenu.classList.remove("active");
      colorButton.setAttribute("aria-expanded", "false");
    };
  });
  document.addEventListener("click", () => {
    colorMenu.classList.remove("active");
    colorButton.setAttribute("aria-expanded", "false");
  });
  document.getElementById("fullSizePreviewBtn").onclick = openFullSizePreview;
  document.getElementById("closeFullSizePreview").onclick = closeFullSizePreview;
  document.getElementById("fullSizePreview").addEventListener("click", event => {
    if(event.target.id === "fullSizePreview") closeFullSizePreview();
  });
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

function openFullSizePreview(){
  if(!canvasHasContent()){
    setStatus("ยังไม่มีรูปสำหรับดูแบบเต็มขนาด");
    return;
  }
  document.getElementById("fullSizePreviewImage").src = canvas().toDataURL("image/png");
  const preview = document.getElementById("fullSizePreview");
  preview.classList.add("active");
  preview.setAttribute("aria-hidden", "false");
}

function closeFullSizePreview(){
  const preview = document.getElementById("fullSizePreview");
  preview.classList.remove("active");
  preview.setAttribute("aria-hidden", "true");
}

function loadImageFile(file){ loadImageBlob(file); }
function loadImageBlob(blob){
  const reader = new FileReader();
  reader.onload = (e) => {
    const im = new Image();
    im.onload = () => {
      baseImage = im;
      sizeCanvasToImage(im);
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
  currentStroke = { color: selectedPenColor, size: Number(document.getElementById("penSize").value), points:[getPos(e)] };
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
  const displayWidth = c.getBoundingClientRect().width || c.width;
  const displayScale = c.width / displayWidth;
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
      ctx.lineWidth = s.size * displayScale * (0.6 + pt.p);
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
  const button = document.getElementById("connectDriveBtn");
  button.classList.toggle("connected", connected);
  button.classList.toggle("disconnected", !connected);
  document.getElementById("driveStatusText").textContent = connected ? "Google Drive เชื่อมต่อแล้ว" : "เชื่อมต่อ Google Drive";
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
    const tradeNo = String(current.fields.f_tradeNo || "trade").replace(/[^a-zA-Z0-9_-]/g, "-");
    const beforeFilenameMatch = activeSlotKey.match(/^before_chart_([1-4])$/);
    const afterFilenameMatch = activeSlotKey.match(/^after_chart_([1-4])$/);
    const slotName = String(activeSlotKey || "image").replace(/[^a-zA-Z0-9_-]/g, "-");
    const filename = beforeFilenameMatch
      ? `${tradeNo}_before_${beforeFilenameMatch[1]}.png`
      : afterFilenameMatch
        ? `${tradeNo}_after_${afterFilenameMatch[1]}.png`
        : `${tradeNo}_${slotName}.png`;

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
      const beforeMatch = activeSlotKey.match(/^before_chart_([1-4])$/);
      if(beforeMatch){
        const number = Number(beforeMatch[1]);
        current.beforeSlotCount = Math.min(4, Math.max(1, current.beforeSlotCount || 1, number));
        syncBeforeImageSlots();
      }
      const afterMatch = activeSlotKey.match(/^after_chart_([1-4])$/);
      if(afterMatch){
        const number = Number(afterMatch[1]);
        current.afterSlotCount = Math.min(4, Math.max(1, current.afterSlotCount || 1, number));
        syncAfterImageSlots();
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
  const wrap = el.closest(".ticker-wrap");
  document.body.classList.toggle("has-ticker", trades.length > 0);
  if(trades.length===0){ el.innerHTML = ""; wrap.style.display = "none"; return; }
  wrap.style.display = "";
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
