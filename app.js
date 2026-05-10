/* ================================================================
   MDA EARTHWORK SYSTEM — app.js v3.1
   Fixes: Yantrika API mode param | Voice input | Data reference
   ================================================================ */

/* ── VOICE ENGINE ─────────────────────────────────────────────── */
const Voice = (() => {
  const synth = window.speechSynthesis;
  let voice   = null;
  let busy    = false;
  let q       = [];

  function init() {
    const load = () => {
      const vs = synth.getVoices();
      voice =
        vs.find(v => v.lang === "mr-IN") ||
        vs.find(v => v.lang === "hi-IN") ||
        vs.find(v => v.lang.startsWith("hi")) ||
        vs.find(v => /female|woman/i.test(v.name)) ||
        vs[0] || null;
    };
    load();
    if (synth.onvoiceschanged !== undefined) synth.onvoiceschanged = load;
  }

  function _next() {
    if (!q.length) { busy = false; hideVoiceBar(); return; }
    busy = true;
    const text = q.shift();
    const utt  = new SpeechSynthesisUtterance(text);
    utt.voice  = voice;
    utt.lang   = "hi-IN";
    utt.rate   = 0.88;
    utt.pitch  = 1.15;
    utt.volume = 1;
    utt.onstart = () => showVoiceBar(text);
    utt.onend   = () => _next();
    utt.onerror = () => _next();
    synth.speak(utt);
  }

  function speak(text, priority) {
    if (!synth || !text) return;
    if (priority) { synth.cancel(); q = []; }
    q.push(text);
    if (!busy) _next();
  }

  function stop() { synth.cancel(); q = []; busy = false; hideVoiceBar(); }

  return { init, speak, stop };
})();

function showVoiceBar(text) {
  const bar = document.getElementById("voiceBar");
  const txt = document.getElementById("voiceBarText");
  if (bar) bar.classList.add("show");
  if (txt) txt.textContent = text;
}
function hideVoiceBar() {
  const bar = document.getElementById("voiceBar");
  if (bar) bar.classList.remove("show");
}

/* ── HELPERS ──────────────────────────────────────────────────── */
function getEl(id)    { return document.getElementById(id); }
function getValue(id) { return getEl(id)?.value?.trim() || ""; }
function resetSelect(el, ph) {
  if (!el) return;
  el.innerHTML = `<option value="">${ph}</option>`;
}
function addOption(el, value, text) {
  if (!el) return;
  const o = document.createElement("option");
  o.value = value; o.textContent = text;
  el.appendChild(o);
}
function unique(arr) { return [...new Set(arr)]; }

/* ── INIT ─────────────────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", () => {
  Voice.init();
  initApp();
});

async function initApp() {
  try {
    showPageLoader(true);
    await loadConfig();
    populateSubdivisions();
    getEl("workDate").value = new Date().toISOString().split("T")[0];
    handleDieselLogic();
    attachEventListeners();
    initVoiceInput();
    initYantrikaVoice();

    getEl("mainForm")?.addEventListener("reset", () => {
      if (recognition && isRecording) recognition.stop();
      const s = getEl("voiceStatus"); if (s) s.innerText = "";
      hideDieselGuidance();
      Voice.speak("फॉर्म रीसेट झाला. कृपया पुन्हा माहिती भरा.", true);
    });

    showPageLoader(false);
    setTimeout(() => {
      Voice.speak("नमस्कार! मी यंत्रिका. कृपया उपविभाग निवडून माहिती भरायला सुरुवात करा.", false);
    }, 1000);

  } catch (err) {
    showPageLoader(false);
    console.error("INIT FAILED:", err);
    Voice.speak("माहिती लोड करताना त्रुटी आली. कृपया पेज रिफ्रेश करा.", true);
    showToast("⚠️ Configuration load करण्यात त्रुटी. Refresh करा.", "danger");
  }
}

function showPageLoader(show) {
  const l = getEl("pageLoader");
  if (l) l.style.display = show ? "flex" : "none";
}

/* ── EVENT LISTENERS ──────────────────────────────────────────── */
function attachEventListeners() {
  getEl("subdivision")?.addEventListener("change", handleSubdivisionChange);
  getEl("workType")?.addEventListener("change",    handleWorkTypeChange);
  getEl("machineType")?.addEventListener("change", handleMachineTypeChange);

  getEl("subdivision")?.addEventListener("change", () => {
    const name = getEl("subdivision")?.options[getEl("subdivision").selectedIndex]?.text || "";
    if (name && !name.includes("निवडा")) Voice.speak(name + " निवडला. कामाचा प्रकार निवडा.", false);
  });

  getEl("workType")?.addEventListener("change", () => {
    const val = getValue("workType");
    if (val) Voice.speak(val + " निवडले. प्रकल्पाचे नाव निवडा.", false);
  });

  getEl("machineType")?.addEventListener("change", () => {
    const val = getValue("machineType");
    if (val) Voice.speak(val + " प्रकार निवडला. मशीनचे नाव निवडा.", false);
  });

  getEl("machineName")?.addEventListener("change", () => {
    const sub     = getValue("subdivision");
    const machine = getValue("machineName");
    const type    = getValue("machineType");
    populateStaff(sub, machine);
    toggleFormFields(type, sub);
    if (machine) {
      const mData = getMachineData(sub, machine);
      if (mData) {
        const avg  = mData["Diesel Average"] || 0;
        const cat  = mData["Category"] || "Machine";
        const unit = cat === "Machine" ? "लिटर प्रति तास" : "किलोमीटर प्रति लिटर";
        Voice.speak(`${machine} निवडले. या मशीनचा standard average ${avg} ${unit} आहे.`, false);
      } else {
        Voice.speak(`${machine} निवडले. चालकाचे नाव निवडा.`, false);
      }
      updateDieselGuidance();
    }
  });

  getEl("staffName")?.addEventListener("change", () => {
    const val = getValue("staffName");
    if (val) Voice.speak(val + " — चालक निवडले. डिझेल माहिती भरा.", false);
  });

  getEl("startReading")?.addEventListener("input", calculateTotalReading);

  getEl("endReading")?.addEventListener("input", () => {
    calculateTotalReading();
    const start = Number(getValue("startReading")) || 0;
    const end   = Number(getValue("endReading"))   || 0;
    if (end > start) Voice.speak(`एकूण ${(end - start).toFixed(1)} तास झाले.`, false);
  });

  getEl("shift1Start")?.addEventListener("input", calculateShiftHours);
  getEl("shift1End")?.addEventListener("input",   calculateShiftHours);
  getEl("shift2Start")?.addEventListener("input",  calculateShiftHours);
  getEl("shift2End")?.addEventListener("input",   () => {
    calculateShiftHours();
    const total = getValue("totalShiftHours");
    if (total) Voice.speak(`शिफ्टनुसार एकूण ${total} तास झाले.`, false);
  });

  getEl("dieselQty")?.addEventListener("input", () => {
    handleDieselLogic();
    updateDieselGuidance();
  });

  getEl("mainForm")?.addEventListener("submit", handleSubmit);

  document.querySelectorAll("input, select").forEach(el => {
    el.addEventListener("input",  () => { el.classList.remove("error"); if (!document.querySelectorAll(".error").length) closeErrorBox(); });
    el.addEventListener("change", () => { el.classList.remove("error"); if (!document.querySelectorAll(".error").length) closeErrorBox(); });
  });
}

/* ── SUBDIVISION ──────────────────────────────────────────────── */
function populateSubdivisions() {
  if (!CONFIG?.subdivisions) return;
  const sel = getEl("subdivision");
  if (!sel) return;
  resetSelect(sel, "उपविभाग निवडा...");
  CONFIG.subdivisions.forEach(s => addOption(sel, s["Subdivision Code"], s["Subdivision Name"]));
}

function handleSubdivisionChange() {
  const sub = getValue("subdivision");
  resetSelect(getEl("workType"),    "कामाचा प्रकार निवडा...");
  resetSelect(getEl("projectName"), "प्रकल्प निवडा...");
  resetMachineSection();
  hideDieselGuidance();
  if (!sub) return;
  const types = unique(CONFIG.projects.filter(p => p["Subdivision Code"] === sub).map(p => p["Work Type"]));
  types.forEach(t => addOption(getEl("workType"), t, t));
  populateMachineTypes(sub);
}

function handleWorkTypeChange() {
  const sub  = getValue("subdivision");
  const type = getValue("workType");
  const sel  = getEl("projectName");
  resetSelect(sel, "प्रकल्प निवडा...");
  if (!sub || !type) return;
  CONFIG.projects.filter(p => p["Subdivision Code"] === sub && p["Work Type"] === type)
    .forEach(p => addOption(sel, p["Project Name"], p["Project Name"]));
}

/* ── MACHINE ──────────────────────────────────────────────────── */
function populateMachineTypes(sub) {
  const sel = getEl("machineType");
  resetSelect(sel, "सयंत्राचा प्रकार निवडा...");
  unique(CONFIG.machines.filter(m => m["Subdivision Code"] === sub).map(m => m["Machine Type"]))
    .forEach(t => addOption(sel, t, t));
}

function handleMachineTypeChange() {
  const sub  = getValue("subdivision");
  const type = getValue("machineType");
  if (getEl("vehicleSection")) getEl("vehicleSection").style.display = "none";
  resetSelect(getEl("machineName"), "मशीन निवडा...");
  resetSelect(getEl("staffName"),   "चालक / ऑपरेटर निवडा...");
  if (!sub || !type) return;
  CONFIG.machines.filter(m => m["Subdivision Code"] === sub && m["Machine Type"] === type)
    .forEach(m => addOption(getEl("machineName"), m["Machine Name"], m["Machine Name"]));
  toggleFormFields(type, sub);
}

function toggleFormFields(machineType, sub) {
  const vs = getEl("vehicleSection");
  if (!vs || !CONFIG?.machines) return;
  const machine = getValue("machineName");
  if (!machine) { vs.style.display = "none"; getEl("tripCount").required = false; getEl("locationFromTo").required = false; return; }
  const mData = getMachineData(sub, machine);
  if (!mData) { vs.style.display = "none"; return; }
  const isVehicle = mData.Category?.trim() === "Vehicle";
  vs.style.display = isVehicle ? "block" : "none";
  getEl("tripCount").required      = isVehicle;
  getEl("locationFromTo").required = isVehicle;
  if (!isVehicle) { getEl("tripCount").value = ""; getEl("locationFromTo").value = ""; }
}

function getMachineData(sub, machine) {
  return CONFIG?.machines?.find(m =>
    String(m["Subdivision Code"]).trim() === String(sub).trim() &&
    String(m["Machine Name"]).trim()     === String(machine).trim()
  ) || null;
}

function populateStaff(sub, machine) {
  const sel = getEl("staffName");
  resetSelect(sel, "चालक / ऑपरेटर निवडा...");
  const mData = getMachineData(sub, machine);
  if (!mData) return;
  const role = String(mData["Category"] || "").trim().toLowerCase() === "machine" ? "Operator" : "Driver";
  CONFIG.staff
    .filter(s => String(s["Subdivision Code"]).trim() === String(sub).trim() && String(s["Role"]).trim().toLowerCase() === role.toLowerCase())
    .forEach(p => addOption(sel, p["Name"], p["Name"]));
}

function resetMachineSection() {
  resetSelect(getEl("machineType"), "सयंत्राचा प्रकार निवडा...");
  resetSelect(getEl("machineName"), "मशीन निवडा...");
  resetSelect(getEl("staffName"),   "चालक / ऑपरेटर निवडा...");
  if (getEl("vehicleSection")) getEl("vehicleSection").style.display = "none";
}

/* ── CALCULATIONS ─────────────────────────────────────────────── */
function calculateTotalReading() {
  const s = Number(getValue("startReading")) || 0;
  const e = Number(getValue("endReading"))   || 0;
  if (e >= s && getEl("totalHoursReading"))
    getEl("totalHoursReading").value = (e - s).toFixed(1);
}

function calculateShiftHours() {
  const toH = t => { if (!t) return 0; const [h, m] = t.split(":").map(Number); return h + m / 60; };
  const total =
    Math.max(0, toH(getValue("shift1End")) - toH(getValue("shift1Start"))) +
    Math.max(0, toH(getValue("shift2End")) - toH(getValue("shift2Start")));
  if (getEl("totalShiftHours")) getEl("totalShiftHours").value = total.toFixed(1);
}

/* ── DIESEL LOGIC ─────────────────────────────────────────────── */
function handleDieselLogic() {
  const qty = Number(getValue("dieselQty")) || 0;
  const t   = getEl("dieselTime");
  const r   = getEl("dieselReading");
  if (!t || !r) return;
  if (qty > 0) { t.disabled = false; r.disabled = false; }
  else         { t.value = ""; r.value = ""; t.disabled = true; r.disabled = true; }
}

function updateDieselGuidance() {
  const sub      = getValue("subdivision");
  const machine  = getValue("machineName");
  const diesel   = parseFloat(getValue("dieselQty")) || 0;
  const guidance = getEl("dieselGuidance");
  const guidText = getEl("dieselGuidanceText");
  if (!guidance || !guidText) return;
  if (!machine || !diesel) { hideDieselGuidance(); return; }
  const mData    = getMachineData(sub, machine);
  if (!mData) { hideDieselGuidance(); return; }
  const expected = parseFloat(mData["Diesel Average"]) || 0;
  const category = mData["Category"] || "Machine";
  if (!expected) { hideDieselGuidance(); return; }

  let msg = "", voiceMsg = "";
  if (category === "Machine") {
    const hrs = (diesel / expected).toFixed(1);
    msg      = `तुम्ही <strong>${diesel} लिटर</strong> डिझेल भरले. Standard average: <strong>${expected} L/hr</strong><br>हे diesel पुरेल: <strong>~${hrs} तास</strong> — Average गाठण्यासाठी किमान <strong>${hrs} तास</strong> काम आवश्यक आहे.`;
    voiceMsg = `तुम्ही ${diesel} लिटर डिझेल भरले. Standard average ${expected} लिटर प्रति तास आहे. हे diesel साधारण ${hrs} तास पुरेल. Average गाठण्यासाठी किमान ${hrs} तास काम करणे आवश्यक आहे.`;
  } else {
    const km = (diesel * expected).toFixed(0);
    msg      = `तुम्ही <strong>${diesel} लिटर</strong> डिझेल भरले. Standard average: <strong>${expected} km/L</strong><br>हे diesel पुरेल: <strong>~${km} किमी</strong> — Average गाठण्यासाठी किमान <strong>${km} किमी</strong> ट्रिप्स आवश्यक.`;
    voiceMsg = `तुम्ही ${diesel} लिटर डिझेल भरले. Standard average ${expected} किलोमीटर प्रति लिटर आहे. हे diesel साधारण ${km} किलोमीटर पुरेल.`;
  }
  guidText.innerHTML     = msg;
  guidance.style.display = "block";
  Voice.speak(voiceMsg, false);
}

function hideDieselGuidance() {
  const g = getEl("dieselGuidance");
  if (g) g.style.display = "none";
}

/* ── FORM SUBMIT ──────────────────────────────────────────────── */
async function handleSubmit(e) {
  e.preventDefault();
  const btn = e.target.querySelector("button[type='submit']");
  btn.disabled = true; btn.innerHTML = "⏳ जतन होत आहे...";
  Voice.speak("माहिती जतन होत आहे. कृपया थांबा.", true);

  const subSelect = getEl("subdivision");
  const subCode   = subSelect?.value || "";
  const subName   = subSelect?.options[subSelect.selectedIndex]?.text || "";

  if (!validateFrontend()) {
    btn.disabled = false; btn.innerHTML = "✅ माहिती जतन करा";
    return;
  }

  const start  = Number(getValue("startReading")) || 0;
  const end    = Number(getValue("endReading"))   || 0;
  const total  = end - start;
  const diesel = Number(getValue("dieselQty")) || 0;
  let remark   = "✅ काम झाले";
  if (total === 0 && diesel === 0) remark = "🚫 काम झाले नाही";
  else if (total > 0 && diesel === 0) remark = "⚠️ काम झाले पण डिझेल भरले नाही";

  const payload = {
    "उपविभाग कोड":                         subCode,
    "उपविभाग":                             subName,
    "दिनांक":                              getValue("workDate"),
    "कामाचा प्रकार":                       getValue("workType"),
    "प्रकल्पाचे नाव":                      getValue("projectName"),
    "सयंत्राचा प्रकार":                    getValue("machineType"),
    "चालक":                                getValue("staffName"),
    "मशीन":                                getValue("machineName"),
    "डिझेल (लिटर)":                        diesel,
    "डिझेल वेळ":                           getValue("dieselTime"),
    "डिझेल reading":                       getValue("dieselReading"),
    "सुरुवातीचे reading":                  start,
    "शेवटचे reading":                      end,
    "Dashboard एकूण (तास/km)":             total,
    "या ठिकाणापासून ते त्या ठिकाणापर्यंत": getValue("locationFromTo"),
    "एकूण ट्रिप्स":                        getValue("tripCount"),
    "शिफ्ट-१ सुरू वेळ":                   getValue("shift1Start"),
    "शिफ्ट-१ बंद वेळ":                    getValue("shift1End"),
    "शिफ्ट-२ सुरू वेळ":                   getValue("shift2Start"),
    "शिफ्ट-२ बंद वेळ":                    getValue("shift2End"),
    "एकूण तास (shift)":                    getValue("totalShiftHours"),
    "टीप":                                 remark
  };

  try {
    const res  = await fetch(API_URL, {
      method: "POST",
      body:   JSON.stringify(payload),
      headers:{ "Content-Type": "text/plain;charset=utf-8" }
    });
    const text = await res.text();
    if (text && text.toLowerCase().includes("success")) {
      showToast("✅ माहिती यशस्वीरित्या जतन झाली!", "success");
      Voice.speak("माहिती यशस्वीरित्या जतन झाली. धन्यवाद!", true);
      getEl("mainForm").reset();
      resetMachineSection();
      hideDieselGuidance();
      getEl("workDate").value = new Date().toISOString().split("T")[0];
      handleDieselLogic();
    } else {
      let errMsg = "Server error आला.";
      try { const d = JSON.parse(text); errMsg = d?.error || errMsg; } catch(e) {}
      showToast("⚠️ " + errMsg, "danger");
      Voice.speak(errMsg, true);
    }
  } catch (err) {
    showToast("❌ नेटवर्क एरर. पुन्हा प्रयत्न करा.", "danger");
    Voice.speak("नेटवर्क समस्या आली. Internet connection तपासा.", true);
  }
  btn.disabled = false; btn.innerHTML = "✅ माहिती जतन करा";
}

/* ── VALIDATION ───────────────────────────────────────────────── */
function validateFrontend() {
  document.querySelectorAll(".error").forEach(el => el.classList.remove("error"));
  const fields = {
    subdivision: "उपविभाग", workType: "कामाचा प्रकार", projectName: "प्रकल्पाचे नाव",
    machineType: "सयंत्राचा प्रकार", machineName: "मशीन", staffName: "चालक / ऑपरेटर",
    startReading: "सुरुवातीचे reading", endReading: "शेवटचे reading",
    dieselQty: "डिझेल प्रमाण",
    shift1Start: "शिफ्ट-१ सुरू वेळ", shift1End: "शिफ्ट-१ बंद वेळ",
    shift2Start: "शिफ्ट-२ सुरू वेळ", shift2End: "शिफ्ट-२ बंद वेळ"
  };
  let missing = [];
  for (let id in fields) { if (!getValue(id)) missing.push({ id, label: fields[id] }); }

  const vs = getEl("vehicleSection");
  if (vs && vs.offsetParent !== null) {
    if (!getValue("tripCount"))      missing.push({ id: "tripCount",      label: "एकूण ट्रिप्स" });
    if (!getValue("locationFromTo")) missing.push({ id: "locationFromTo", label: "स्थान माहिती" });
  }
  const diesel = Number(getValue("dieselQty"));
  if (diesel > 0) {
    if (!getValue("dieselTime"))    missing.push({ id: "dieselTime",    label: "डिझेल वेळ" });
    if (!getValue("dieselReading")) missing.push({ id: "dieselReading", label: "डिझेल reading" });
  }
  if (missing.length > 0) {
    showErrorBox(missing);
    Voice.speak("कृपया ही माहिती भरा: " + missing.slice(0, 3).map(m => m.label).join(", "), true);
    return false;
  }
  const start = Number(getValue("startReading")), end = Number(getValue("endReading"));
  if (isNaN(start) || isNaN(end) || end <= start) {
    showErrorBox([{ id: "endReading", label: "शेवटचे reading सुरुवातीपेक्षा मोठे असावे" }]);
    Voice.speak("शेवटचे रीडिंग सुरुवातीच्या रीडिंगपेक्षा मोठे असावे.", true);
    return false;
  }
  const toMin = t => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  if (toMin(getValue("shift1End")) <= toMin(getValue("shift1Start"))) {
    showErrorBox([{ id: "shift1End", label: "शिफ्ट-१ बंद वेळ सुरू वेळेपेक्षा मोठी असावी" }]);
    Voice.speak("पहिल्या शिफ्टची बंद वेळ सुरू वेळेपेक्षा मोठी असावी.", true);
    return false;
  }
  if (toMin(getValue("shift2End")) <= toMin(getValue("shift2Start"))) {
    showErrorBox([{ id: "shift2End", label: "शिफ्ट-२ बंद वेळ सुरू वेळेपेक्षा मोठी असावी" }]);
    Voice.speak("दुसऱ्या शिफ्टची बंद वेळ सुरू वेळेपेक्षा मोठी असावी.", true);
    return false;
  }
  closeErrorBox();
  return true;
}

function showErrorBox(fields) {
  const list = getEl("errorList"), box = getEl("errorBox");
  if (!list || !box) return;
  list.innerHTML = "";
  fields.forEach(f => {
    const li = document.createElement("li"); li.textContent = f.label; list.appendChild(li);
    if (f.id) getEl(f.id)?.classList.add("error");
  });
  box.classList.remove("hidden");
  if (fields[0]?.id) getEl(fields[0].id)?.scrollIntoView({ behavior: "smooth", block: "center" });
}
function closeErrorBox() {
  getEl("errorBox")?.classList.add("hidden");
  document.querySelectorAll(".error").forEach(el => el.classList.remove("error"));
}

function showToast(msg, type = "success") {
  const existing = document.querySelector(".toast-msg"); if (existing) existing.remove();
  const box = document.createElement("div");
  box.className = "toast-msg toast-" + type; box.innerText = msg;
  document.body.appendChild(box);
  setTimeout(() => box.classList.add("show"), 10);
  setTimeout(() => { box.classList.remove("show"); setTimeout(() => box.remove(), 300); }, 4000);
}

/* ── VOICE INPUT (location) ───────────────────────────────────── */
let recognition = null;
let isRecording = false;

function initVoiceInput() {
  const btn    = getEl("micBtn");
  const input  = getEl("locationFromTo");
  const status = getEl("voiceStatus");
  if (!btn || !input || btn.dataset.voiceInit === "true") return;
  btn.dataset.voiceInit = "true";
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { if (status) status.innerText = "❌ Voice support नाही"; return; }
  recognition = new SR();
  recognition.lang = "hi-IN"; recognition.interimResults = false; recognition.continuous = false;
  recognition.onstart  = () => { isRecording = true;  btn.classList.add("recording"); if (status) status.innerText = "🎤 बोला..."; };
  recognition.onresult = ev => { input.value = ev.results[0][0].transcript.trim(); if (status) status.innerText = "✅ झाले"; input.focus(); };
  recognition.onerror  = ev => { if (status) status.innerText = ev.error === "not-allowed" ? "🚫 Mic permission द्या" : "❌ पुन्हा प्रयत्न करा"; };
  recognition.onend    = () => { isRecording = false; btn.classList.remove("recording"); };
  btn.addEventListener("click", () => {
    const vehicleVisible = getEl("vehicleSection") && getEl("vehicleSection").offsetParent !== null;
    if (!vehicleVisible) { if (status) status.innerText = "⚠️ फक्त वाहनासाठी"; return; }
    if (isRecording) recognition.stop();
    else { try { recognition.start(); } catch(e) {} }
  });
}

/* ── YANTRIKA VOICE INPUT ─────────────────────────────────────── */
let ypRecognition = null;
let ypRecording   = false;

function initYantrikaVoice() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return;
  ypRecognition = new SR();
  ypRecognition.lang             = "hi-IN";
  ypRecognition.interimResults   = false;
  ypRecognition.continuous       = false;

  ypRecognition.onstart = () => {
    ypRecording = true;
    const btn = getEl("ypMicBtn");
    if (btn) { btn.textContent = "🔴"; btn.style.background = "#fee2e2"; }
    Voice.stop();
  };

  ypRecognition.onresult = ev => {
    const text = ev.results[0][0].transcript.trim();
    ypRecording = false;
    const btn = getEl("ypMicBtn");
    if (btn) { btn.textContent = "🎤"; btn.style.background = ""; }
    if (text) {
      const inp = getEl("ypInput");
      if (inp) inp.value = text;
      ypSendText(text);
    }
  };

  ypRecognition.onerror = () => {
    ypRecording = false;
    const btn = getEl("ypMicBtn");
    if (btn) { btn.textContent = "🎤"; btn.style.background = ""; }
  };

  ypRecognition.onend = () => {
    ypRecording = false;
    const btn = getEl("ypMicBtn");
    if (btn) { btn.textContent = "🎤"; btn.style.background = ""; }
  };
}

function toggleYpMic() {
  if (!ypRecognition) { Voice.speak("Voice input या browser मध्ये उपलब्ध नाही.", true); return; }
  if (ypRecording) { ypRecognition.stop(); }
  else {
    Voice.stop();
    try { ypRecognition.start(); } catch(e) { console.log("ypMic err:", e); }
  }
}

/* ── YANTRIKA CHAT ─────────────────────────────────────────────
   FIX 1: mode in URL parameter (not body)
   FIX 2: load actual subdivision data as context
   FIX 3: fallback local answers when API fails
─────────────────────────────────────────────────────────────── */
let subDataCache = {};   // cache subdivision rows

async function getSubData(subCode) {
  if (!subCode) return [];
  if (subDataCache[subCode]) return subDataCache[subCode];
  const token = localStorage.getItem("token");
  if (!token) return [];
  try {
    const res  = await fetch(`${API_URL}?mode=dashboard&subdivision=${subCode}&token=${token}`);
    const data = await res.json();
    if (Array.isArray(data)) { subDataCache[subCode] = data; return data; }
  } catch(e) {}
  return [];
}

async function askYantrika(question) {
  const subCode  = getValue("subdivision");
  const machine  = getValue("machineName");
  const diesel   = getValue("dieselQty")        || "0";
  const hours    = getValue("totalHoursReading") || "0";
  const shiftHrs = getValue("totalShiftHours")   || "0";
  const mData    = getMachineData(subCode, machine);
  const expected = mData?.["Diesel Average"] || "";
  const category = mData?.["Category"]       || "Machine";
  const subName  = getEl("subdivision")?.options[getEl("subdivision")?.selectedIndex]?.text || "";
  const driver   = getValue("staffName")     || "";
  const project  = getValue("projectName")   || "";
  const date     = getValue("workDate")      || "";

  /* सर्व subdivision data load करा (cache केलेला) */
  const allRows = await getSubData(subCode);

  /* या मशीनच्या सर्व rows — कोणताही date filter नाही */
  const myRows = machine
    ? allRows.filter(r => String(r["मशीन"] || "").trim() === machine.trim())
    : allRows;

  /* सर्व data चे aggregates */
  const totalHrsAll    = myRows.reduce((a, r) => a + (Number(r["Dashboard एकूण (तास/km)"]) || 0), 0);
  const totalDieselAll = myRows.reduce((a, r) => a + (Number(r["डिझेल (लिटर)"]) || 0), 0);
  const workDaysAll    = myRows.length;

  const actualAvgAll = totalHrsAll > 0 && totalDieselAll > 0
    ? (category === "Machine"
        ? (totalDieselAll / totalHrsAll).toFixed(2)
        : (totalHrsAll / totalDieselAll).toFixed(2))
    : "—";

  /* महिनानिहाय breakdown */
  const monthlyMap = {};
  myRows.forEach(r => {
    const d = new Date(r["दिनांक"]);
    if (isNaN(d)) return;
    const key = d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0");
    if (!monthlyMap[key]) monthlyMap[key] = { hrs: 0, diesel: 0, days: 0 };
    monthlyMap[key].hrs    += Number(r["Dashboard एकूण (तास/km)"] || 0);
    monthlyMap[key].diesel += Number(r["डिझेल (लिटर)"] || 0);
    monthlyMap[key].days   += 1;
  });

  /* सर्व machines चा summary */
  const allMachinesSummary = {};
  allRows.forEach(r => {
    const m = String(r["मशीन"] || "").trim();
    if (!m) return;
    if (!allMachinesSummary[m]) allMachinesSummary[m] = { hrs: 0, diesel: 0, days: 0 };
    allMachinesSummary[m].hrs    += Number(r["Dashboard एकूण (तास/km)"] || 0);
    allMachinesSummary[m].diesel += Number(r["डिझेल (लिटर)"] || 0);
    allMachinesSummary[m].days   += 1;
  });

  /* Context object — सर्व data */
  const context = {
    machine, category, diesel, hours, shiftHrs,
    expected, subName, driver, project, date,
    allData: {
      totalHrs:         totalHrsAll.toFixed(1),
      totalDiesel:      totalDieselAll.toFixed(1),
      workDays:         workDaysAll,
      actualAvg:        actualAvgAll,
      monthlyBreakdown: monthlyMap,
      allMachines:      allMachinesSummary
    }
  };

  /* Gemini API call (mode in URL) */
  try {
    const res  = await fetch(`${API_URL}?mode=yantrika_chat`, {
      method:  "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body:    JSON.stringify({ question, context, subdivision: subCode })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    if (data.answer) return data.answer;
    throw new Error("empty");
  } catch (err) {
    return localYantrikaAnswer(question, context);
  }
}

/* ── LOCAL FALLBACK ANSWERS ─────────────────────────────────────
   ctx.allData मध्ये सर्व data आहे — कोणताही date filter नाही
─────────────────────────────────────────────────────────────── */
function localYantrikaAnswer(q, ctx) {
  const ql     = q.toLowerCase();
  const unitMr = ctx.category === "Machine" ? "लिटर प्रति तास" : "किलोमीटर प्रति लिटर";
  const unit   = ctx.category === "Machine" ? "L/hr" : "km/L";
  const d      = ctx.allData || {};

  /* Diesel average */
  if (ql.includes("average") || ql.includes("avg") || ql.includes("सरासरी") || ql.includes("डिझेल किती")) {
    if (!ctx.machine) return "कृपया आधी मशीन निवडा, मग मी average सांगेन.";
    const exp = ctx.expected || "माहिती नाही";
    const act = d.actualAvg || "—";
    return `${ctx.machine} चा standard average: ${exp} ${unitMr}.
आजपर्यंतचा actual average (सर्व नोंदी): ${act} ${unitMr}.
एकूण ${d.workDays || 0} दिवस काम नोंद आहे.`;
  }

  /* Today's hours */
  if (ql.includes("आज") && (ql.includes("तास") || ql.includes("किती") || ql.includes("hours"))) {
    if (ctx.hours && ctx.hours !== "0")
      return `आज Dashboard नुसार ${ctx.hours} तास / किमी झाले. Shift नुसार: ${ctx.shiftHrs} तास.`;
    return "आजचे reading अजून भरले नाही. Dashboard reading भरल्यावर सांगेन.";
  }

  /* Diesel today */
  if (ql.includes("diesel") || ql.includes("डिझेल")) {
    if (ctx.diesel && ctx.diesel !== "0" && ctx.expected) {
      const unit2val = ctx.category === "Machine"
        ? (parseFloat(ctx.diesel) / parseFloat(ctx.expected)).toFixed(1)
        : (parseFloat(ctx.diesel) * parseFloat(ctx.expected)).toFixed(0);
      const unit2lbl = ctx.category === "Machine" ? `${unit2val} तास` : `${unit2val} किमी`;
      return `आज ${ctx.diesel} लिटर भरले. Standard average ${ctx.expected} ${unitMr} नुसार हे ${unit2lbl} पुरेल.

एकूण (सर्व नोंदी): ${d.totalDiesel || 0} लिटर वापरले, ${d.workDays || 0} दिवस.`;
    }
    return `एकूण (सर्व नोंदी): ${d.totalDiesel || 0} लिटर डिझेल वापरले. ${d.workDays || 0} दिवस काम झाले.`;
  }

  /* Performance */
  if (ql.includes("performance") || ql.includes("कामगिरी") || ql.includes("कसे आहे") || ql.includes("कशी आहे")) {
    const exp = ctx.expected || "—";
    const act = d.actualAvg || "—";
    let status = "";
    if (act !== "—" && exp !== "—") {
      const r = parseFloat(act) / parseFloat(exp);
      status = ctx.category === "Machine"
        ? (r <= 1.0 ? "✅ उत्कृष्ट! Average पेक्षा कमी diesel वापरतोय." : r <= 1.1 ? "✅ चांगली — average मध्ये." : "⚠️ Diesel जास्त वापरतोय — सुधारणा करा.")
        : (r >= 1.0 ? "✅ उत्कृष्ट! Average पेक्षा जास्त mileage." : r >= 0.9 ? "✅ चांगली — average मध्ये." : "⚠️ Mileage कमी — तपासणी करा.");
    }
    // Monthly summary
    let monthlyText = "";
    if (d.monthlyBreakdown) {
      const months = Object.keys(d.monthlyBreakdown).sort().slice(-3);
      monthlyText = "

मागील महिने:
" + months.map(m => {
        const mb = d.monthlyBreakdown[m];
        return `📅 ${m}: ${mb.hrs.toFixed(1)} तास, ${mb.diesel.toFixed(1)} L, ${mb.days} दिवस`;
      }).join("
");
    }
    return `${ctx.machine || "मशीन"} — एकूण Performance:
📅 कामाचे दिवस: ${d.workDays || 0}
⏱ एकूण तास: ${d.totalHrs || 0}
⛽ एकूण diesel: ${d.totalDiesel || 0} लिटर
📊 Actual avg: ${act} ${unit}
📌 Expected: ${exp} ${unit}
${status}${monthlyText}`;
  }

  /* Work days / attendance */
  if (ql.includes("दिवस") || ql.includes("हजेरी") || ql.includes("attendance") || ql.includes("किती दिवस")) {
    let monthlyText = "";
    if (d.monthlyBreakdown) {
      const months = Object.keys(d.monthlyBreakdown).sort();
      monthlyText = "

महिनानिहाय:
" + months.map(m => {
        return `📅 ${m}: ${d.monthlyBreakdown[m].days} दिवस`;
      }).join("
");
    }
    return `एकूण (सर्व नोंदी): ${d.workDays || 0} दिवस काम नोंद आहे.${monthlyText}`;
  }

  /* Monthly breakdown */
  if (ql.includes("महिना") || ql.includes("month") || ql.includes("monthly")) {
    if (!d.monthlyBreakdown || !Object.keys(d.monthlyBreakdown).length)
      return "महिनानिहाय डेटा उपलब्ध नाही.";
    const months = Object.keys(d.monthlyBreakdown).sort();
    const lines  = months.map(m => {
      const mb = d.monthlyBreakdown[m];
      const avg = mb.hrs > 0 && mb.diesel > 0
        ? (ctx.category === "Machine" ? (mb.diesel/mb.hrs).toFixed(2) : (mb.hrs/mb.diesel).toFixed(2))
        : "—";
      return `📅 ${m}: ${mb.hrs.toFixed(1)} तास | ${mb.diesel.toFixed(1)} L diesel | ${mb.days} दिवस | avg: ${avg} ${unit}`;
    });
    return `${ctx.machine} — महिनानिहाय:
${lines.join("
")}`;
  }

  /* All machines comparison */
  if (ql.includes("सर्व") || ql.includes("सगळ्या") || ql.includes("तुलना") || ql.includes("comparison")) {
    if (!d.allMachines || !Object.keys(d.allMachines).length)
      return "सर्व मशीनचा डेटा उपलब्ध नाही.";
    const lines = Object.entries(d.allMachines)
      .sort((a, b) => b[1].hrs - a[1].hrs)
      .slice(0, 5)
      .map(([name, s]) => `⚙️ ${name.substring(0,25)}: ${s.hrs.toFixed(1)} तास, ${s.days} दिवस`);
    return `उपविभागातील मशीन (top 5 by hours):
${lines.join("
")}`;
  }

  /* Form help */
  if (ql.includes("form") || ql.includes("भरा") || ql.includes("मदत") || ql.includes("help")) {
    return "Form भरण्याचा क्रम:
1️⃣ दिनांक → उपविभाग → कामाचा प्रकार → प्रकल्प
2️⃣ मशीन प्रकार → मशीन → चालक
3️⃣ डिझेल → Reading → Shift वेळा
4️⃣ ✅ माहिती जतन करा दाबा";
  }

  /* Default */
  return `मी यंत्रिका! मी सर्व नोंदींच्या आधारे उत्तर देऊ शकते:
🎤 "माझा diesel average किती?"
📊 "माझी performance कशी आहे?"
📅 "महिनानिहाय data सांग"
⏱ "एकूण किती तास काम झाले?"
⚙️ "सर्व मशीनची तुलना कर"`;
}