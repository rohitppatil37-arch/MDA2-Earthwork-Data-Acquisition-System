/* ================================================================
   MDA EARTHWORK SYSTEM — app.js v3.0
   Voice-first talkative form | All existing fields | Yantrika AI
   ================================================================ */

/* ── VOICE ENGINE ─────────────────────────────────────────────── */
const Voice = (() => {
  const synth = window.speechSynthesis;
  let voice   = null;
  let queue   = [];
  let busy    = false;

  function init() {
    const load = () => {
      const voices = synth.getVoices();
      voice =
        voices.find(v => v.lang === "mr-IN") ||
        voices.find(v => v.lang === "hi-IN") ||
        voices.find(v => v.lang.startsWith("hi")) ||
        voices.find(v => v.name.toLowerCase().includes("female")) ||
        voices[0] || null;
    };
    load();
    if (synth.onvoiceschanged !== undefined) synth.onvoiceschanged = load;
  }

  function _next() {
    if (!queue.length) { busy = false; hideVoiceBar(); return; }
    busy = true;
    const { text, rate } = queue.shift();
    const utt  = new SpeechSynthesisUtterance(text);
    utt.voice  = voice;
    utt.lang   = "hi-IN";
    utt.rate   = rate || 0.9;
    utt.pitch  = 1.1;
    utt.volume = 1;
    utt.onstart = () => showVoiceBar(text);
    utt.onend   = () => _next();
    utt.onerror = () => _next();
    synth.speak(utt);
  }

  function speak(text, priority = false) {
    if (!synth || !text) return;
    if (priority) { synth.cancel(); queue = []; }
    queue.push({ text, rate: 0.9 });
    if (!busy) _next();
  }

  function stop() { synth.cancel(); queue = []; busy = false; hideVoiceBar(); }

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

function resetSelect(el, placeholder) {
  if (!el) return;
  el.innerHTML = `<option value="">${placeholder}</option>`;
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

    getEl("mainForm")?.addEventListener("reset", () => {
      if (recognition && isRecording) recognition.stop();
      const s = getEl("voiceStatus"); if (s) s.innerText = "";
      hideDieselGuidance();
      Voice.speak("फॉर्म रीसेट झाला. कृपया पुन्हा माहिती भरा.", true);
    });

    showPageLoader(false);
    // Welcome voice
    setTimeout(() => {
      Voice.speak("नमस्कार! मी यंत्रिका आहे. कृपया उपविभाग निवडून माहिती भरायला सुरुवात करा.", false);
    }, 800);

  } catch (err) {
    showPageLoader(false);
    console.error("❌ INIT FAILED:", err);
    Voice.speak("माहिती लोड करताना त्रुटी आली. कृपया पेज रिफ्रेश करा.", true);
    showToast("⚠️ Configuration load करण्यात त्रुटी आली. Refresh करा.", "danger");
  }
}

function showPageLoader(show) {
  const loader = getEl("pageLoader");
  if (loader) loader.style.display = show ? "flex" : "none";
}

/* ── EVENT LISTENERS ──────────────────────────────────────────── */
function attachEventListeners() {
  getEl("subdivision")?.addEventListener("change", handleSubdivisionChange);
  getEl("workType")?.addEventListener("change", handleWorkTypeChange);
  getEl("machineType")?.addEventListener("change", handleMachineTypeChange);

  getEl("machineName")?.addEventListener("change", () => {
    const subCode     = getValue("subdivision");
    const machineName = getValue("machineName");
    const machineType = getValue("machineType");
    populateStaff(subCode, machineName);
    toggleFormFields(machineType, subCode);
    if (machineName) {
      const mData = getMachineData(subCode, machineName);
      if (mData) {
        const avg = mData["Diesel Average"] || 0;
        const cat = mData["Category"] || "Machine";
        const unit = cat === "Machine" ? "लिटर प्रति तास" : "किलोमीटर प्रति लिटर";
        Voice.speak(`${machineName} निवडले. या मशीनचा standard average ${avg} ${unit} आहे.`, false);
      } else {
        Voice.speak(`${machineName} निवडले. आता चालकाचे नाव निवडा.`, false);
      }
      updateDieselGuidance();
    }
  });

  getEl("subdivision")?.addEventListener("change", () => {
    const name = getEl("subdivision")?.options[getEl("subdivision")?.selectedIndex]?.text || "";
    if (name && name !== "उपविभाग निवडा...") Voice.speak(`${name} निवडला. आता कामाचा प्रकार निवडा.`, false);
  });

  getEl("workType")?.addEventListener("change", () => {
    const val = getValue("workType");
    if (val) Voice.speak(`${val} निवडले. आता प्रकल्पाचे नाव निवडा.`, false);
  });

  getEl("machineType")?.addEventListener("change", () => {
    const val = getValue("machineType");
    if (val) Voice.speak(`${val} प्रकार निवडला. आता मशीनचे नाव निवडा.`, false);
  });

  getEl("staffName")?.addEventListener("change", () => {
    const val = getValue("staffName");
    if (val) Voice.speak(`${val} — चालक निवडले. आता डिझेल माहिती भरा.`, false);
  });

  getEl("startReading")?.addEventListener("input", () => {
    calculateTotalReading();
  });

  getEl("endReading")?.addEventListener("input", () => {
    calculateTotalReading();
    const start = Number(getValue("startReading")) || 0;
    const end   = Number(getValue("endReading"))   || 0;
    if (end > start) {
      const total = (end - start).toFixed(1);
      Voice.speak(`एकूण ${total} तास किंवा किलोमीटर झाले.`, false);
    }
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

  // Clear errors on input
  document.querySelectorAll("input, select").forEach(el => {
    el.addEventListener("input",  () => { el.classList.remove("error"); if (!document.querySelectorAll(".error").length) closeErrorBox(); });
    el.addEventListener("change", () => { el.classList.remove("error"); if (!document.querySelectorAll(".error").length) closeErrorBox(); });
  });
}

/* ── SUBDIVISION ──────────────────────────────────────────────── */
function populateSubdivisions() {
  if (!CONFIG?.subdivisions) return;
  const select = getEl("subdivision");
  if (!select) return;
  resetSelect(select, "उपविभाग निवडा...");
  CONFIG.subdivisions.forEach(sub => addOption(select, sub["Subdivision Code"], sub["Subdivision Name"]));
}

function handleSubdivisionChange() {
  if (!CONFIG?.projects) return;
  const subCode = getValue("subdivision");
  resetSelect(getEl("workType"),    "कामाचा प्रकार निवडा...");
  resetSelect(getEl("projectName"), "प्रकल्प निवडा...");
  resetMachineSection();
  hideDieselGuidance();
  if (!subCode) return;
  const workTypes = unique(CONFIG.projects.filter(p => p["Subdivision Code"] === subCode).map(p => p["Work Type"]));
  workTypes.forEach(type => addOption(getEl("workType"), type, type));
  populateMachineTypes(subCode);
}

function handleWorkTypeChange() {
  if (!CONFIG?.projects) return;
  const subCode  = getValue("subdivision");
  const workType = getValue("workType");
  const sel = getEl("projectName");
  resetSelect(sel, "प्रकल्प निवडा...");
  if (!subCode || !workType) return;
  CONFIG.projects.filter(p => p["Subdivision Code"] === subCode && p["Work Type"] === workType)
    .forEach(p => addOption(sel, p["Project Name"], p["Project Name"]));
}

/* ── MACHINE ──────────────────────────────────────────────────── */
function populateMachineTypes(subCode) {
  if (!CONFIG?.machines) return;
  const sel = getEl("machineType");
  resetSelect(sel, "सयंत्राचा प्रकार निवडा...");
  const types = unique(CONFIG.machines.filter(m => m["Subdivision Code"] === subCode).map(m => m["Machine Type"]));
  types.forEach(type => addOption(sel, type, type));
}

function handleMachineTypeChange() {
  if (!CONFIG?.machines) return;
  const subCode     = getValue("subdivision");
  const machineType = getValue("machineType");
  if (getEl("vehicleSection")) getEl("vehicleSection").style.display = "none";
  resetSelect(getEl("machineName"), "मशीन निवडा...");
  resetSelect(getEl("staffName"),   "चालक / ऑपरेटर निवडा...");
  if (!subCode || !machineType) return;
  CONFIG.machines.filter(m => m["Subdivision Code"] === subCode && m["Machine Type"] === machineType)
    .forEach(m => addOption(getEl("machineName"), m["Machine Name"], m["Machine Name"]));
  toggleFormFields(machineType, subCode);
}

function toggleFormFields(machineType, subCode) {
  const vehicleSection = getEl("vehicleSection");
  if (!vehicleSection || !CONFIG?.machines) return;
  const selectedMachine = getValue("machineName");
  if (!selectedMachine) { vehicleSection.style.display = "none"; getEl("tripCount").required = false; getEl("locationFromTo").required = false; return; }
  const mData = getMachineData(subCode, selectedMachine);
  if (!mData) { vehicleSection.style.display = "none"; return; }
  const isVehicle = mData.Category?.trim() === "Vehicle";
  vehicleSection.style.display = isVehicle ? "block" : "none";
  getEl("tripCount").required      = isVehicle;
  getEl("locationFromTo").required = isVehicle;
  if (!isVehicle) { getEl("tripCount").value = ""; getEl("locationFromTo").value = ""; }
}

function getMachineData(subCode, machineName) {
  return CONFIG?.machines?.find(m =>
    String(m["Subdivision Code"]).trim() === String(subCode).trim() &&
    String(m["Machine Name"]).trim()     === String(machineName).trim()
  ) || null;
}

function populateStaff(subCode, machineName) {
  if (!CONFIG?.staff || !CONFIG?.machines) return;
  const sel = getEl("staffName");
  resetSelect(sel, "चालक / ऑपरेटर निवडा...");
  const mData = getMachineData(subCode, machineName);
  if (!mData) return;
  const cat          = String(mData["Category"] || "").trim().toLowerCase();
  const roleRequired = cat === "machine" ? "Operator" : "Driver";
  CONFIG.staff
    .filter(s => String(s["Subdivision Code"]).trim() === String(subCode).trim() && String(s["Role"]).trim().toLowerCase() === roleRequired.toLowerCase())
    .forEach(person => addOption(sel, person["Name"], person["Name"]));
}

function resetMachineSection() {
  resetSelect(getEl("machineType"), "सयंत्राचा प्रकार निवडा...");
  resetSelect(getEl("machineName"), "मशीन निवडा...");
  resetSelect(getEl("staffName"),   "चालक / ऑपरेटर निवडा...");
  if (getEl("vehicleSection")) getEl("vehicleSection").style.display = "none";
}

/* ── CALCULATIONS ─────────────────────────────────────────────── */
function calculateTotalReading() {
  const start = Number(getValue("startReading")) || 0;
  const end   = Number(getValue("endReading"))   || 0;
  if (end >= start && getEl("totalHoursReading"))
    getEl("totalHoursReading").value = (end - start).toFixed(1);
}

function calculateShiftHours() {
  const toHours = t => { if (!t) return 0; const [h, m] = t.split(":").map(Number); return h + m / 60; };
  const total =
    Math.max(0, toHours(getValue("shift1End")) - toHours(getValue("shift1Start"))) +
    Math.max(0, toHours(getValue("shift2End")) - toHours(getValue("shift2Start")));
  if (getEl("totalShiftHours")) getEl("totalShiftHours").value = total.toFixed(1);
}

/* ── DIESEL LOGIC ─────────────────────────────────────────────── */
function handleDieselLogic() {
  const qty     = Number(getValue("dieselQty")) || 0;
  const time    = getEl("dieselTime");
  const reading = getEl("dieselReading");
  if (!time || !reading) return;
  if (qty > 0) { time.disabled = false; reading.disabled = false; }
  else         { time.value = ""; reading.value = ""; time.disabled = true; reading.disabled = true; }
}

function updateDieselGuidance() {
  const subCode  = getValue("subdivision");
  const machine  = getValue("machineName");
  const diesel   = parseFloat(getValue("dieselQty")) || 0;
  const guidance = getEl("dieselGuidance");
  const guidText = getEl("dieselGuidanceText");

  if (!guidance || !guidText) return;
  if (!machine || !diesel) { hideDieselGuidance(); return; }

  const mData    = getMachineData(subCode, machine);
  if (!mData)    { hideDieselGuidance(); return; }

  const expected = parseFloat(mData["Diesel Average"]) || 0;
  const category = mData["Category"] || "Machine";
  if (!expected)  { hideDieselGuidance(); return; }

  let msg = "", voiceMsg = "";

  if (category === "Machine") {
    // L/hr — how many hours will this diesel last?
    const expectedHours = (diesel / expected).toFixed(1);
    msg = `<strong>तुम्ही ${diesel} लिटर डिझेल भरले.</strong><br>
           या मशीनचा standard average: <strong>${expected} L/hr</strong><br>
           हे diesel पुरेल: <strong>~${expectedHours} तास</strong><br>
           Standard average गाठण्यासाठी किमान <strong>${expectedHours} तास</strong> काम करणे आवश्यक आहे.`;
    voiceMsg = `तुम्ही ${diesel} लिटर डिझेल भरले. या मशीनचा standard average ${expected} लिटर प्रति तास आहे. हे diesel साधारण ${expectedHours} तास पुरेल. Average गाठण्यासाठी किमान ${expectedHours} तास काम करणे आवश्यक आहे.`;
  } else {
    // km/L — how many km will this diesel cover?
    const expectedKm = (diesel * expected).toFixed(0);
    msg = `<strong>तुम्ही ${diesel} लिटर डिझेल भरले.</strong><br>
           या वाहनाचा standard average: <strong>${expected} km/L</strong><br>
           हे diesel पुरेल: <strong>~${expectedKm} किमी</strong><br>
           Standard average गाठण्यासाठी किमान <strong>${expectedKm} किमी</strong> ट्रिप्स आवश्यक आहेत.`;
    voiceMsg = `तुम्ही ${diesel} लिटर डिझेल भरले. या वाहनाचा standard average ${expected} किलोमीटर प्रति लिटर आहे. हे diesel साधारण ${expectedKm} किलोमीटर पुरेल. Average गाठण्यासाठी किमान ${expectedKm} किलोमीटर ट्रिप्स आवश्यक आहेत.`;
  }

  guidText.innerHTML = msg;
  guidance.style.display = "block";
  Voice.speak(voiceMsg, false);
}

function hideDieselGuidance() {
  const guidance = getEl("dieselGuidance");
  if (guidance) guidance.style.display = "none";
}

/* ── FORM SUBMIT ──────────────────────────────────────────────── */
async function handleSubmit(e) {
  e.preventDefault();
  const btn = e.target.querySelector("button[type='submit']");
  btn.disabled = true;
  btn.innerHTML = "⏳ जतन होत आहे...";
  Voice.speak("माहिती जतन होत आहे. कृपया थांबा.", true);

  const subSelect = getEl("subdivision");
  const subCode   = subSelect?.value || "";
  const subName   = subSelect?.options[subSelect.selectedIndex]?.text || "";

  if (!validateFrontend()) {
    btn.disabled = false;
    btn.innerHTML = "✅ माहिती जतन करा";
    return;
  }

  const start  = Number(getValue("startReading")) || 0;
  const end    = Number(getValue("endReading"))   || 0;
  const total  = end - start;
  const diesel = Number(getValue("dieselQty")) || 0;

  let remark = "✅ काम झाले";
  if (total === 0 && diesel === 0) remark = "🚫 काम झाले नाही";
  else if (total > 0 && diesel === 0) remark = "⚠️ काम झाले पण डिझेल भरले नाही";

  const payload = {
    "उपविभाग कोड":                        subCode,
    "उपविभाग":                            subName,
    "दिनांक":                             getValue("workDate"),
    "कामाचा प्रकार":                      getValue("workType"),
    "प्रकल्पाचे नाव":                     getValue("projectName"),
    "सयंत्राचा प्रकार":                   getValue("machineType"),
    "चालक":                               getValue("staffName"),
    "मशीन":                               getValue("machineName"),
    "डिझेल (लिटर)":                       diesel,
    "डिझेल वेळ":                          getValue("dieselTime"),
    "डिझेल reading":                      getValue("dieselReading"),
    "सुरुवातीचे reading":                 start,
    "शेवटचे reading":                     end,
    "Dashboard एकूण (तास/km)":            total,
    "या ठिकाणापासून ते त्या ठिकाणापर्यंत": getValue("locationFromTo"),
    "एकूण ट्रिप्स":                       getValue("tripCount"),
    "शिफ्ट-१ सुरू वेळ":                  getValue("shift1Start"),
    "शिफ्ट-१ बंद वेळ":                   getValue("shift1End"),
    "शिफ्ट-२ सुरू वेळ":                  getValue("shift2Start"),
    "शिफ्ट-२ बंद वेळ":                   getValue("shift2End"),
    "एकूण तास (shift)":                   getValue("totalShiftHours"),
    "टीप":                                remark
  };

  try {
    const res  = await fetch(API_URL, { method: "POST", body: JSON.stringify(payload), headers: { "Content-Type": "text/plain;charset=utf-8" } });
    const text = await res.text();

    if (text && text.toLowerCase().includes("success")) {
      showToast("✅ माहिती यशस्वीरित्या जतन झाली!", "success");
      Voice.speak("माहिती यशस्वीरित्या जतन झाली. धन्यवाद! पुढील नोंदीसाठी फॉर्म रीसेट झाला आहे.", true);
      getEl("mainForm").reset();
      resetMachineSection();
      hideDieselGuidance();
      getEl("workDate").value = new Date().toISOString().split("T")[0];
      handleDieselLogic();
    } else {
      const errData = JSON.parse(text);
      const errMsg  = errData?.error || "Unknown server error";
      showToast("⚠️ " + errMsg, "danger");
      Voice.speak("माहिती जतन करताना समस्या आली. " + errMsg, true);
    }
  } catch (err) {
    showToast("❌ नेटवर्क एरर. पुन्हा प्रयत्न करा.", "danger");
    Voice.speak("नेटवर्क समस्या आली. Internet connection तपासा आणि पुन्हा प्रयत्न करा.", true);
  }

  btn.disabled = false;
  btn.innerHTML = "✅ माहिती जतन करा";
}

/* ── VALIDATION ───────────────────────────────────────────────── */
function validateFrontend() {
  document.querySelectorAll(".error").forEach(el => el.classList.remove("error"));

  const fieldLabels = {
    subdivision:  "उपविभाग",
    workType:     "कामाचा प्रकार",
    projectName:  "प्रकल्पाचे नाव",
    machineType:  "सयंत्राचा प्रकार",
    machineName:  "मशीन",
    staffName:    "चालक / ऑपरेटर",
    startReading: "सुरुवातीचे reading",
    endReading:   "शेवटचे reading",
    dieselQty:    "डिझेल प्रमाण",
    shift1Start:  "शिफ्ट-१ सुरू वेळ",
    shift1End:    "शिफ्ट-१ बंद वेळ",
    shift2Start:  "शिफ्ट-२ सुरू वेळ",
    shift2End:    "शिफ्ट-२ बंद वेळ"
  };

  let missing = [];
  for (let id in fieldLabels) {
    if (!getValue(id)) missing.push({ id, label: fieldLabels[id] });
  }

  const vehicleSection = getEl("vehicleSection");
  if (vehicleSection && vehicleSection.offsetParent !== null) {
    if (!getValue("tripCount"))      missing.push({ id: "tripCount",      label: "एकूण ट्रिप्स" });
    if (!getValue("locationFromTo")) missing.push({ id: "locationFromTo", label: "स्थान माहिती" });
  }

  const dieselRaw = getValue("dieselQty");
  const diesel    = Number(dieselRaw);
  if (dieselRaw !== "" && (isNaN(diesel) || diesel < 0))
    missing.push({ id: "dieselQty", label: "डिझेल प्रमाण वैध संख्या असावी" });

  if (diesel > 0) {
    if (!getValue("dieselTime"))    missing.push({ id: "dieselTime",    label: "डिझेल वेळ" });
    if (!getValue("dieselReading")) missing.push({ id: "dieselReading", label: "डिझेल reading" });
  }

  if (missing.length > 0) {
    showErrorBox(missing);
    const labels = missing.slice(0, 3).map(m => m.label).join(", ");
    Voice.speak("कृपया खालील माहिती भरा: " + labels, true);
    return false;
  }

  const start = Number(getValue("startReading"));
  const end   = Number(getValue("endReading"));
  if (isNaN(start) || isNaN(end) || end <= start) {
    showErrorBox([{ id: "endReading", label: "शेवटचे reading सुरुवातीपेक्षा मोठे असावे" }]);
    Voice.speak("शेवटचे रीडिंग सुरुवातीच्या रीडिंगपेक्षा मोठे असावे.", true);
    return false;
  }

  const timeToMin = t => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  if (timeToMin(getValue("shift1End")) <= timeToMin(getValue("shift1Start"))) {
    showErrorBox([{ id: "shift1End", label: "शिफ्ट-१ बंद वेळ सुरू वेळेपेक्षा मोठी असावी" }]);
    Voice.speak("पहिल्या शिफ्टची बंद वेळ सुरू वेळेपेक्षा मोठी असावी.", true);
    return false;
  }
  if (timeToMin(getValue("shift2End")) <= timeToMin(getValue("shift2Start"))) {
    showErrorBox([{ id: "shift2End", label: "शिफ्ट-२ बंद वेळ सुरू वेळेपेक्षा मोठी असावी" }]);
    Voice.speak("दुसऱ्या शिफ्टची बंद वेळ सुरू वेळेपेक्षा मोठी असावी.", true);
    return false;
  }

  closeErrorBox();
  return true;
}

/* ── ERROR BOX ────────────────────────────────────────────────── */
function showErrorBox(fields) {
  const list = getEl("errorList");
  const box  = getEl("errorBox");
  if (!list || !box) return;
  list.innerHTML = "";
  fields.forEach(f => {
    const li = document.createElement("li");
    li.textContent = f.label;
    list.appendChild(li);
    if (f.id) getEl(f.id)?.classList.add("error");
  });
  box.classList.remove("hidden");
  if (fields[0]?.id) getEl(fields[0].id)?.scrollIntoView({ behavior: "smooth", block: "center" });
}
function closeErrorBox() {
  getEl("errorBox")?.classList.add("hidden");
  document.querySelectorAll(".error").forEach(el => el.classList.remove("error"));
}

/* ── TOAST ────────────────────────────────────────────────────── */
function showToast(msg, type = "success") {
  const existing = document.querySelector(".toast-msg");
  if (existing) existing.remove();
  const box = document.createElement("div");
  box.className = "toast-msg toast-" + type;
  box.innerText = msg;
  document.body.appendChild(box);
  setTimeout(() => box.classList.add("show"), 10);
  setTimeout(() => { box.classList.remove("show"); setTimeout(() => box.remove(), 300); }, 4000);
}

/* ── VOICE INPUT (location field only) ────────────────────────── */
let recognition = null;
let isRecording = false;

function initVoiceInput() {
  const btn    = getEl("micBtn");
  const input  = getEl("locationFromTo");
  const status = getEl("voiceStatus");
  if (!btn || !input) return;
  if (btn.dataset.voiceInit === "true") return;
  btn.dataset.voiceInit = "true";

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { if (status) status.innerText = "❌ Voice support नाही"; return; }

  recognition              = new SR();
  recognition.lang         = "hi-IN";
  recognition.interimResults = false;
  recognition.continuous   = false;

  recognition.onstart  = () => { isRecording = true;  btn.classList.add("recording"); if (status) status.innerText = "🎤 बोला..."; };
  recognition.onresult = ev  => { input.value = ev.results[0][0].transcript.trim(); if (status) status.innerText = "✅ झाले"; input.focus(); };
  recognition.onerror  = ev  => { if (status) status.innerText = ev.error === "not-allowed" ? "🚫 Mic permission द्या" : "❌ पुन्हा प्रयत्न करा"; };
  recognition.onend    = ()  => { isRecording = false; btn.classList.remove("recording"); };

  btn.addEventListener("click", () => {
    const vehicleVisible = getEl("vehicleSection") && getEl("vehicleSection").offsetParent !== null;
    if (!vehicleVisible) { if (status) status.innerText = "⚠️ फक्त वाहनासाठी वापरा"; return; }
    if (isRecording) recognition.stop();
    else { try { recognition.start(); } catch(e) { console.log("Voice err:", e); } }
  });
}

/* ── YANTRIKA CHAT ────────────────────────────────────────────── */
async function askYantrika(question) {
  const subCode = getValue("subdivision");
  const machine = getValue("machineName");
  const diesel  = getValue("dieselQty");
  const hours   = getValue("totalHoursReading");
  const mData   = getMachineData(subCode, machine);

  const context = {
    machine:   machine,
    category:  mData?.["Category"]        || "",
    diesel:    diesel,
    hours:     hours,
    expected:  mData?.["Diesel Average"]  || ""
  };

  try {
    const res  = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ mode: "yantrika_chat", question, context, subdivision: subCode })
    });
    const data = await res.json();
    return data.answer || "माफ करा, उत्तर देता आले नाही.";
  } catch (err) {
    return "Network समस्या आली. कृपया पुन्हा विचारा.";
  }
}