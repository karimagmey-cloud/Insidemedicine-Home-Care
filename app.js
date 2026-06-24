/**
 * ICU File Management System
 * Production-quality medical records application
 * Stores all data in localStorage
 */
const ICUApp = (function () {
  'use strict';

  let activePatientId = null;
  let currentDrugSection = null;
  let editingDrugIndex = null;
  let editingAntiIndex = null;
  let stoppingAntiIndex = null;
  let debouncedFluidSave = null;

  // ─── Lab Reference Ranges ───────────────────────────────────────────
  const LAB_RANGES = {
    WBC:            { low: 4,     high: 11,    critLow: 2,    critHigh: 20,   unit: '×10³/µL' },
    Hb:             { low: 12,    high: 17,    critLow: 7,    critHigh: null, unit: 'g/dL' },
    Platelets:      { low: 150,   high: 400,   critLow: 50,   critHigh: 1000, unit: '×10³/µL' },
    BUN:            { low: 7,     high: 20,    critLow: null, critHigh: 60,   unit: 'mg/dL' },
    Creatinine:     { low: 0.6,   high: 1.2,   critLow: null, critHigh: 5,    unit: 'mg/dL' },
    ALT:            { low: 7,     high: 56,    critLow: null, critHigh: 500,  unit: 'U/L' },
    AST:            { low: 10,    high: 40,    critLow: null, critHigh: 500,  unit: 'U/L' },
    'Total Bilirubin': { low: 0.1, high: 1.2, critLow: null, critHigh: 10,   unit: 'mg/dL' },
    Albumin:        { low: 3.5,   high: 5.5,   critLow: 2,    critHigh: null, unit: 'g/dL' },
    Na:             { low: 136,   high: 145,   critLow: 120,  critHigh: 160,  unit: 'mEq/L' },
    K:              { low: 3.5,   high: 5.0,   critLow: 2.5,  critHigh: 6.5,  unit: 'mEq/L' },
    Ca:             { low: 8.5,   high: 10.5,  critLow: null, critHigh: null, unit: 'mg/dL' },
    Mg:             { low: 1.7,   high: 2.2,   critLow: null, critHigh: null, unit: 'mg/dL' },
    PO4:            { low: 2.5,   high: 4.5,   critLow: null, critHigh: null, unit: 'mg/dL' },
    PT:             { low: 11,    high: 13.5,  critLow: null, critHigh: null, unit: 'sec' },
    INR:            { low: 0.8,   high: 1.1,   critLow: null, critHigh: 3,    unit: '' },
    PTT:            { low: 25,    high: 35,    critLow: null, critHigh: null, unit: 'sec' },
    pH:             { low: 7.35,  high: 7.45,  critLow: 7.2,  critHigh: 7.6,  unit: '' },
    pCO2:           { low: 35,    high: 45,    critLow: null, critHigh: null, unit: 'mmHg' },
    pO2:            { low: 80,    high: 100,   critLow: 60,   critHigh: null, unit: 'mmHg' },
    HCO3:           { low: 22,    high: 26,    critLow: null, critHigh: null, unit: 'mEq/L' },
    Lactate:        { low: 0.5,   high: 2.0,   critLow: null, critHigh: 4,    unit: 'mmol/L' },
    CRP:            { low: 0,     high: 5,     critLow: null, critHigh: 50,   unit: 'mg/L' },
    Procalcitonin:  { low: 0,     high: 0.5,   critLow: null, critHigh: 2,    unit: 'ng/mL' }
  };

  const LAB_CATEGORIES = {
    'Complete Blood Count': ['WBC', 'Hb', 'Platelets'],
    'Renal Function': ['BUN', 'Creatinine'],
    'Liver Function': ['ALT', 'AST', 'Total Bilirubin', 'Albumin'],
    'Electrolytes': ['Na', 'K', 'Ca', 'Mg', 'PO4'],
    'Coagulation': ['PT', 'INR', 'PTT'],
    'Arterial Blood Gas': ['pH', 'pCO2', 'pO2', 'HCO3', 'Lactate'],
    'Inflammatory Markers': ['CRP', 'Procalcitonin']
  };

  const DRUG_SECTIONS = [
    { key: 'ivInfusions',          title: 'INTRAVENOUS INFUSIONS & VOLUME EXPANSION',        num: 1, columns: ['Medication/Fluid', 'Exact Dosage', 'Route', 'Frequency', 'Clinical Nursing Directives'] },
    { key: 'ivIntermittent',       title: 'SCHEDULED INTRAVENOUS INTERMITTENT MEDICATIONS',   num: 2, columns: ['Medication Name', 'Exact Dosage', 'Route', 'Frequency', 'Scheduled Timing'] },
    { key: 'subcutaneous',         title: 'SUBCUTANEOUS MEDICATIONS',                         num: 3, columns: ['Medication Name', 'Exact Dosage', 'Route', 'Frequency', 'Scheduled Timing'] },
    { key: 'oral',                 title: 'SCHEDULED ENTERAL / ORAL MEDICATIONS',             num: 4, columns: ['Medication Name', 'Exact Dosage', 'Route', 'Frequency', 'Scheduled Timing'] },
    { key: 'procedural',           title: 'PROCEDURAL & INHALATIONAL THERAPIES',              num: 5, columns: ['Therapy Type', 'Intervention', 'Route', 'Frequency', 'Scheduled Timing'] },
    { key: 'monitoringProtocols',  title: 'ICU MONITORING PROTOCOLS & DIRECTIVES',            num: 6, columns: ['Protocol Title', 'Details'] }
  ];

  const FLUID_INPUT_FIELDS  = ['ivFluids', 'meds', 'enteralFeed', 'oralIntake', 'bloodProducts'];
  const FLUID_OUTPUT_FIELDS = ['urineOutput', 'drainOutput', 'ngtOutput', 'stool', 'emesis'];

  // ─── Utility Functions ──────────────────────────────────────────────

  function generateId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    var s = String(str);
    var map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return s.replace(/[&<>"']/g, function (ch) { return map[ch]; });
  }

  function formatDate(dateStr) {
    if (!dateStr) return '—';
    try {
      var d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch (_) {
      return dateStr;
    }
  }

  function formatTime(timeStr) {
    if (!timeStr) return '—';
    try {
      var parts = timeStr.split(':');
      var h = parseInt(parts[0], 10);
      var m = parts[1] || '00';
      var ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12 || 12;
      return h + ':' + m + ' ' + ampm;
    } catch (_) {
      return timeStr;
    }
  }

  function debounce(fn, delay) {
    var timer = null;
    return function () {
      var context = this;
      var args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function () {
        fn.apply(context, args);
      }, delay);
    };
  }

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function nowTimeStr() {
    var d = new Date();
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  // ─── Toast Notifications ───────────────────────────────────────────

  function showToast(message, type) {
    type = type || 'info';
    var container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.style.cssText = 'position:fixed;top:20px;right:20px;z-index:100000;display:flex;flex-direction:column;gap:8px;';
      document.body.appendChild(container);
    }
    var toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    var iconMap = { success: '✓', error: '✕', info: 'ℹ' };
    toast.innerHTML = '<span class="toast-icon">' + (iconMap[type] || 'ℹ') + '</span><span>' + escapeHtml(message) + '</span>';
    toast.style.cssText = 'display:flex;align-items:center;gap:8px;padding:12px 20px;border-radius:8px;color:#fff;font-size:14px;box-shadow:0 4px 12px rgba(0,0,0,0.15);animation:toastIn 0.3s ease;min-width:250px;';
    if (type === 'success') toast.style.background = '#10b981';
    else if (type === 'error') toast.style.background = '#ef4444';
    else toast.style.background = '#3b82f6';

    container.appendChild(toast);
    setTimeout(function () {
      toast.style.animation = 'toastOut 0.3s ease forwards';
      setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    }, 3000);
  }

  // ─── Modal Management ──────────────────────────────────────────────

  function openModal(modalId) {
    var modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.add('active');
    modal.style.display = 'flex';
    requestAnimationFrame(function () {
      modal.style.opacity = '1';
      var content = modal.querySelector('.modal-content');
      if (content) content.style.transform = 'scale(1)';
    });
  }

  function closeModal(modalId) {
    var modal = document.getElementById(modalId);
    if (!modal) return;
    modal.style.opacity = '0';
    var content = modal.querySelector('.modal-content');
    if (content) content.style.transform = 'scale(0.95)';
    setTimeout(function () {
      modal.classList.remove('active');
      modal.style.display = 'none';
    }, 200);
  }

  function closeAllModals() {
    var modals = document.querySelectorAll('.modal');
    modals.forEach(function (m) {
      closeModal(m.id);
    });
  }

  // ─── Data Access ───────────────────────────────────────────────────

  function getPatients() {
    try {
      var data = localStorage.getItem('icu_patients');
      return data ? JSON.parse(data) : [];
    } catch (_) {
      return [];
    }
  }

  function savePatients(patients) {
    localStorage.setItem('icu_patients', JSON.stringify(patients));
  }

  function getActivePatient() {
    if (!activePatientId) return null;
    var patients = getPatients();
    return patients.find(function (p) { return p.id === activePatientId; }) || null;
  }

  function updatePatient(id, updates) {
    var patients = getPatients();
    var idx = patients.findIndex(function (p) { return p.id === id; });
    if (idx === -1) return null;
    Object.keys(updates).forEach(function (key) {
      if (typeof updates[key] === 'object' && updates[key] !== null && !Array.isArray(updates[key]) && typeof patients[idx][key] === 'object' && patients[idx][key] !== null && !Array.isArray(patients[idx][key])) {
        patients[idx][key] = Object.assign({}, patients[idx][key], updates[key]);
      } else {
        patients[idx][key] = updates[key];
      }
    });
    savePatients(patients);
    return patients[idx];
  }

  function createEmptyPatient() {
    return {
      id: generateId(),
      name: '',
      nameAr: '',
      age: 0,
      gender: 'Male',
      fileNumber: '',
      phone: '',
      admissionDate: todayStr(),
      diagnosis: '',
      comorbidities: '',
      pastHistory: '',
      allergies: '',
      codeStatus: 'Full Code',
      weight: '',
      height: '',
      gcs: '',
      devices: { tracheostomy: false, ngt: false, foley: false, centralLine: false, peripheralLine: false, chestTube: false },
      initialVitals: { bp: '', hr: '', temp: '', rr: '', spo2: '' },
      emergencyContact: { name: '', relation: '', phone: '' },
      location: 'Home Care',
      status: 'stable',
      doctorName: 'Dr. Karim Al-Agmey',
      drugs: {
        ivInfusions: [],
        ivIntermittent: [],
        subcutaneous: [],
        oral: [],
        procedural: [],
        monitoringProtocols: []
      },
      fluidBalance: {},
      labs: {},
      progressNotes: [],
      antibiotics: []
    };
  }

  // ─── Patient Management ────────────────────────────────────────────

  function addPatient(patientData) {
    var patient = createEmptyPatient();
    if (patientData) {
      Object.keys(patientData).forEach(function (k) {
        if (k !== 'id') patient[k] = patientData[k];
      });
    }
    var patients = getPatients();
    patients.push(patient);
    savePatients(patients);
    renderPatientList();
    selectPatient(patient.id);
    showToast('Patient added successfully', 'success');
    return patient;
  }

  function deletePatient(id) {
    if (!confirm('Are you sure you want to delete this patient? This action cannot be undone.')) return;
    var patients = getPatients();
    patients = patients.filter(function (p) { return p.id !== id; });
    savePatients(patients);
    if (activePatientId === id) {
      activePatientId = null;
      clearSheets();
    }
    renderPatientList();
    showToast('Patient deleted', 'info');
  }

  function selectPatient(id) {
    activePatientId = id;
    var patient = getActivePatient();
    if (!patient) return;

    // Highlight sidebar patient card
    var items = document.querySelectorAll('.patient-card');
    items.forEach(function (item) {
      item.classList.remove('active');
      if (item.dataset.id === id) item.classList.add('active');
    });

    // Update header dropdown select
    var headerSelect = document.getElementById('header-patient-select');
    if (headerSelect) {
      headerSelect.value = id;
    }

    // Render all sheets
    renderCover(patient);
    renderAdmission(patient);
    renderDrugSheet(patient);
    renderAntibiotics(patient);
    renderFluidBalance(patient);
    renderIOSummary(patient);
    renderLabSheet(patient);
    renderProgressNotes(patient);

    // Populate print-only sheets and headers
    renderPrintFluidSheet();
    renderPrintIoMonthlySheet();
    updatePrintHeaders(patient);

    switchTab('cover');
  }

  function updatePrintHeaders(patient) {
    var nameSpans = document.querySelectorAll('.patient-name-span');
    var fileSpans = document.querySelectorAll('.patient-file-span');
    var dxSpans = document.querySelectorAll('.patient-dx-span');
    
    var nameText = (patient.name || '') + (patient.nameAr ? '  /  ' + patient.nameAr : '');
    var fileText = patient.fileNumber || '—';
    var dxText = patient.diagnosis || '—';
    
    nameSpans.forEach(function (span) { span.textContent = nameText; });
    fileSpans.forEach(function (span) { span.textContent = fileText; });
    dxSpans.forEach(function (span) { span.textContent = dxText; });
  }

  function renderPrintFluidSheet() {
    var tbody = document.getElementById('print-fluid-body');
    if (!tbody) return;
    
    var html = '';
    for (var h = 0; h < 24; h++) {
      html += '<tr>';
      html += '<td style="font-weight:600; text-align:center;">' + String(h).padStart(2, '0') + ':00</td>';
      // 5 intake columns
      html += '<td></td><td></td><td></td><td></td><td></td>';
      // Total In
      html += '<td style="background:#eff6ff;"></td>';
      // 5 output columns
      html += '<td></td><td></td><td></td><td></td><td></td>';
      // Total Out
      html += '<td style="background:#fef9c3;"></td>';
      // Balance
      html += '<td></td>';
      html += '</tr>';
      
      // Subtotals
      if (h === 5 || h === 11 || h === 17 || h === 23) {
        var periodName = h === 5 ? 'Night (00-05)' : h === 11 ? 'Morning (06-11)' : h === 17 ? 'Afternoon (12-17)' : 'Evening (18-23)';
        html += '<tr style="background:#f1f5f9; font-weight:700;">';
        html += '<td colspan="6" style="text-align:right; padding-right:12px;">' + periodName + ' Subtotal:</td>';
        html += '<td style="background:#dbeafe;"></td>';
        html += '<td colspan="5" style="text-align:right;"></td>';
        html += '<td style="background:#fde68a;"></td>';
        html += '<td></td>';
        html += '</tr>';
      }
    }
    
    // Grand Total
    html += '<tr style="background:#e2e8f0; font-weight:800; font-size:10px;">';
    html += '<td colspan="6" style="text-align:right; padding-right:12px;">24-HOUR GRAND TOTAL:</td>';
    html += '<td style="background:#bfdbfe;"></td>';
    html += '<td colspan="5" style="text-align:right;"></td>';
    html += '<td style="background:#fcd34d;"></td>';
    html += '<td></td>';
    html += '</tr>';
    
    tbody.innerHTML = html;
  }

  function renderPrintIoMonthlySheet() {
    var tbody = document.getElementById('print-io-monthly-body');
    if (!tbody) return;
    
    var html = '';
    for (var d = 1; d <= 30; d++) {
      html += '<tr style="height:22px;">';
      html += '<td></td>'; // Date
      html += '<td style="text-align:center; font-weight:600;">' + d + '</td>'; // Day #
      html += '<td></td>'; // Total Intake
      html += '<td></td>'; // Total Output
      html += '<td></td>'; // Net Balance
      html += '<td></td>'; // Cumulative
      html += '<td></td>'; // Weight
      html += '<td></td>'; // Notes
      html += '</tr>';
    }
    tbody.innerHTML = html;
  }

  function clearSheets() {
    var main = document.getElementById('main-content');
    if (main) {
      var sheets = main.querySelectorAll('.sheet');
      sheets.forEach(function (s) {
        var inner = s.querySelector('.sheet-body, .sheet-content');
        if (inner) inner.innerHTML = '<p class="empty-state">Select a patient to view their records.</p>';
      });
    }
  }

  function renderPatientList() {
    var listEl = document.getElementById('patient-list');
    if (!listEl) return;
    var patients = getPatients();

    if (patients.length === 0) {
      listEl.innerHTML = '<p class="empty-state" style="padding:20px;text-align:center;color:#94a3b8;font-size:13px;">No patients yet.<br>Click + to add one.</p>';
      return;
    }

    var html = '';
    patients.forEach(function (p) {
      var statusColor = p.status === 'critical' ? '#ef4444' : p.status === 'monitoring' ? '#f59e0b' : '#10b981';
      var activeClass = p.id === activePatientId ? ' active' : '';
      var name = p.nameAr || p.name || 'Unnamed Patient';
      html += '<div class="patient-card' + activeClass + '" data-id="' + escapeHtml(p.id) + '" onclick="ICUApp.selectPatient(\'' + escapeHtml(p.id) + '\')">';
      html += '  <div class="patient-name">';
      html += '    <span class="status-dot" style="background:' + statusColor + ';display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;"></span>';
      html += '    ' + escapeHtml(name);
      html += '  </div>';
      html += '  <div class="patient-dx" style="font-size:11px;color:#94a3b8;margin-top:2px;">';
      html += '    ' + escapeHtml(p.fileNumber ? 'File #' + p.fileNumber : '') + (p.diagnosis ? ' — ' + escapeHtml(p.diagnosis).substring(0, 30) : '');
      html += '  </div>';
      html += '  <button class="btn-icon delete-patient-btn" onclick="event.stopPropagation();ICUApp.deletePatient(\'' + escapeHtml(p.id) + '\')" title="Delete patient" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);z-index:10;width:30px;height:30px;padding:0;display:inline-flex;align-items:center;justify-content:center;">🗑</button>';
      html += '</div>';
    });
    listEl.innerHTML = html;

    // Render header patient select options
    renderHeaderPatientSelector();
  }

  function renderHeaderPatientSelector() {
    var selectEl = document.getElementById('header-patient-select');
    if (!selectEl) return;
    var patients = getPatients();
    var html = '';
    if (patients.length === 0) {
      html += '<option value="">No Patients</option>';
    } else {
      patients.forEach(function (p) {
        var selected = p.id === activePatientId ? ' selected' : '';
        var name = p.nameAr || p.name || 'Unnamed Patient';
        html += '<option value="' + escapeHtml(p.id) + '"' + selected + '>' + escapeHtml(name) + '</option>';
      });
    }
    selectEl.innerHTML = html;
  }

  // ─── Navigation ────────────────────────────────────────────────────

  function switchTab(tabName) {
    var sheets = document.querySelectorAll('.sheet');
    sheets.forEach(function (s) { s.style.display = 'none'; });

    var target = document.getElementById('sheet-' + tabName);
    if (target) target.style.display = 'block';

    var tabs = document.querySelectorAll('.nav-tab');
    tabs.forEach(function (t) {
      t.classList.remove('active');
      if (t.dataset.tab === tabName) t.classList.add('active');
    });
  }

  function setupNavigation() {
    var tabs = document.querySelectorAll('.nav-tab');
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        switchTab(this.dataset.tab);
      });
    });
  }

  // ─── Cover Page ────────────────────────────────────────────────────

  function renderCover(patient) {
    setTextById('cover-patient-name', (patient.name || '') + (patient.nameAr ? '  /  ' + patient.nameAr : ''));
    setTextById('cover-diagnosis', patient.diagnosis || '—');
    setTextById('cover-file-number', patient.fileNumber || '—');
    setTextById('cover-date', formatDate(patient.admissionDate));
    setTextById('cover-doctor', patient.doctorName || '—');
    setTextById('cover-age', patient.age ? patient.age + ' yrs' : '—');
    setTextById('cover-gender', patient.gender || '—');
    setTextById('cover-location', patient.location || '—');
    setTextById('cover-status', patient.status ? patient.status.charAt(0).toUpperCase() + patient.status.slice(1) : '—');
    setTextById('cover-code-status', patient.codeStatus || '—');
    setTextById('cover-phone', patient.phone || '—');

    // Devices summary
    var devicesArr = [];
    if (patient.devices) {
      if (patient.devices.tracheostomy) devicesArr.push('Tracheostomy');
      if (patient.devices.ngt) devicesArr.push('NGT');
      if (patient.devices.foley) devicesArr.push('Foley Catheter');
      if (patient.devices.centralLine) devicesArr.push('Central Line');
      if (patient.devices.peripheralLine) devicesArr.push('Peripheral Line');
      if (patient.devices.chestTube) devicesArr.push('Chest Tube');
    }
    setTextById('cover-devices', devicesArr.length > 0 ? devicesArr.join(', ') : 'None');

    // Emergency contact
    if (patient.emergencyContact && patient.emergencyContact.name) {
      setTextById('cover-emergency', patient.emergencyContact.name + ' (' + (patient.emergencyContact.relation || '') + ') — ' + (patient.emergencyContact.phone || ''));
    } else {
      setTextById('cover-emergency', '—');
    }
  }

  function setTextById(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  // ─── Admission Sheet ──────────────────────────────────────────────

  function renderAdmission(patient) {
    setValById('adm-name', patient.name);
    setValById('adm-name-ar', patient.nameAr);
    setValById('adm-age', patient.age);
    setValById('adm-gender', patient.gender);
    setValById('adm-file-number', patient.fileNumber);
    setValById('adm-phone', patient.phone);
    setValById('adm-admission-date', patient.admissionDate);
    setValById('adm-diagnosis', patient.diagnosis);
    setValById('adm-comorbidities', patient.comorbidities);
    setValById('adm-past-history', patient.pastHistory);
    setValById('adm-allergies', patient.allergies);
    setValById('adm-code-status', patient.codeStatus);
    setValById('adm-weight', patient.weight);
    setValById('adm-height', patient.height);
    setValById('adm-gcs', patient.gcs);
    setValById('adm-location', patient.location);
    setValById('adm-status', patient.status);
    setValById('adm-doctor', patient.doctorName);

    // Devices
    if (patient.devices) {
      setCheckedById('adm-dev-tracheostomy', patient.devices.tracheostomy);
      setCheckedById('adm-dev-ngt', patient.devices.ngt);
      setCheckedById('adm-dev-foley', patient.devices.foley);
      setCheckedById('adm-dev-central-line', patient.devices.centralLine);
      setCheckedById('adm-dev-peripheral-line', patient.devices.peripheralLine);
      setCheckedById('adm-dev-chest-tube', patient.devices.chestTube);
    }

    // Vitals
    if (patient.initialVitals) {
      setValById('adm-bp', patient.initialVitals.bp);
      setValById('adm-hr', patient.initialVitals.hr);
      setValById('adm-temp', patient.initialVitals.temp);
      setValById('adm-rr', patient.initialVitals.rr);
      setValById('adm-spo2', patient.initialVitals.spo2);
    }

    // Emergency contact
    if (patient.emergencyContact) {
      setValById('adm-ec-name', patient.emergencyContact.name);
      setValById('adm-ec-relation', patient.emergencyContact.relation);
      setValById('adm-ec-phone', patient.emergencyContact.phone);
    }
  }

  function saveAdmission() {
    var patient = getActivePatient();
    if (!patient) { showToast('No patient selected', 'error'); return; }

    var updates = {
      name: getValById('adm-name'),
      nameAr: getValById('adm-name-ar'),
      age: parseInt(getValById('adm-age'), 10) || 0,
      gender: getValById('adm-gender'),
      fileNumber: getValById('adm-file-number'),
      phone: getValById('adm-phone'),
      admissionDate: getValById('adm-admission-date'),
      diagnosis: getValById('adm-diagnosis'),
      comorbidities: getValById('adm-comorbidities'),
      pastHistory: getValById('adm-past-history'),
      allergies: getValById('adm-allergies'),
      codeStatus: getValById('adm-code-status'),
      weight: getValById('adm-weight'),
      height: getValById('adm-height'),
      gcs: getValById('adm-gcs'),
      location: getValById('adm-location'),
      status: getValById('adm-status'),
      doctorName: getValById('adm-doctor'),
      devices: {
        tracheostomy: getCheckedById('adm-dev-tracheostomy'),
        ngt: getCheckedById('adm-dev-ngt'),
        foley: getCheckedById('adm-dev-foley'),
        centralLine: getCheckedById('adm-dev-central-line'),
        peripheralLine: getCheckedById('adm-dev-peripheral-line'),
        chestTube: getCheckedById('adm-dev-chest-tube')
      },
      initialVitals: {
        bp: getValById('adm-bp'),
        hr: getValById('adm-hr'),
        temp: getValById('adm-temp'),
        rr: getValById('adm-rr'),
        spo2: getValById('adm-spo2')
      },
      emergencyContact: {
        name: getValById('adm-ec-name'),
        relation: getValById('adm-ec-relation'),
        phone: getValById('adm-ec-phone')
      }
    };

    updatePatient(patient.id, updates);
    renderPatientList();
    var activeP = getActivePatient();
    renderCover(activeP);
    updatePrintHeaders(activeP);
    showToast('Admission data saved', 'success');
  }

  function setValById(id, val) {
    var el = document.getElementById(id);
    if (el) el.value = val !== undefined && val !== null ? val : '';
  }

  function getValById(id) {
    var el = document.getElementById(id);
    return el ? el.value : '';
  }

  function setCheckedById(id, val) {
    var el = document.getElementById(id);
    if (el) el.checked = !!val;
  }

  function getCheckedById(id) {
    var el = document.getElementById(id);
    return el ? el.checked : false;
  }

  // ─── Drug Order Sheet ─────────────────────────────────────────────

  function renderDrugSheet(patient) {
    var container = document.getElementById('drug-sheet-content');
    if (!container) return;

    var html = '<div class="drug-sheet-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">';
    html += '  <h2 style="margin:0;font-size:18px;">Critical Care Pharmacotherapy Matrix</h2>';
    html += '</div>';

    // Section 0: Active Antibiotics
    html += renderActiveAntibioticsSection(patient);

    DRUG_SECTIONS.forEach(function (sec) {
      var drugs = (patient.drugs && patient.drugs[sec.key]) ? patient.drugs[sec.key] : [];
      html += renderDrugSection(sec.key, sec.title, sec.num, drugs, sec.columns);
    });

    // Interactive Antibiotics History (screen-only, hidden in print)
    html += renderInteractiveAntibioticsHistory(patient);

    // Section for Other Medications (Print-only, hidden on screen)
    html += '<div class="drug-section print-only" style="margin-top:24px; page-break-inside:avoid;">';
    html += '  <h3 style="margin:0 0 8px;font-size:14px;font-weight:700;color:#1e293b;">OTHER MEDICATIONS / أدوية أخرى</h3>';
    html += '  <table class="data-table" style="width:100%;border-collapse:collapse;font-size:12px;">';
    html += '    <thead><tr>';
    html += '      <th style="width:30px;">#</th>';
    html += '      <th>Medication Name / اسم الدواء</th>';
    html += '      <th>Exact Dosage / الجرعة</th>';
    html += '      <th>Route / المسار</th>';
    html += '      <th>Frequency / التكرار</th>';
    html += '      <th>Scheduled Timing / التوقيت</th>';
    html += '    </tr></thead>';
    html += '    <tbody>';
    for (var r = 1; r <= 5; r++) {
      html += '      <tr style="height:28px;">';
      html += '        <td style="text-align:center;font-weight:600;">' + r + '</td>';
      html += '        <td></td><td></td><td></td><td></td><td></td>';
      html += '      </tr>';
    }
    html += '    </tbody>';
    html += '  </table>';
    html += '</div>';

    container.innerHTML = html;
  }

  function renderDrugSection(sectionKey, sectionTitle, sectionNumber, drugs, columns) {
    var html = '<div class="drug-section" data-section="' + sectionKey + '" style="margin-bottom:24px;">';
    html += '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">';
    html += '    <h3 style="margin:0;font-size:14px;font-weight:600;color:#1e293b;">' + sectionNumber + '. ' + escapeHtml(sectionTitle) + '</h3>';
    html += '    <button class="btn btn-sm btn-primary add-drug-btn no-print" onclick="ICUApp.openAddDrugModal(\'' + sectionKey + '\')" title="Add entry">+ Add</button>';
    html += '  </div>';
    html += '  <div style="overflow-x:auto;">';
    html += '  <table class="data-table" style="width:100%;border-collapse:collapse;font-size:13px;">';
    html += '    <thead><tr>';
    html += '      <th style="width:30px;">#</th>';
    columns.forEach(function (col) {
      html += '<th>' + escapeHtml(col) + '</th>';
    });
    html += '      <th style="width:90px;" class="no-print">Actions</th>';
    html += '    </tr></thead>';
    html += '    <tbody>';
 
    if (drugs.length === 0) {
      html += '<tr><td colspan="' + (columns.length + 2) + '" style="text-align:center;color:#94a3b8;padding:12px;">No entries</td></tr>';
    } else {
      drugs.forEach(function (drug, idx) {
        html += '<tr>';
        html += '<td>' + (idx + 1) + '</td>';
        if (sectionKey === 'monitoringProtocols') {
          html += '<td>' + escapeHtml(drug.title || '') + '</td>';
          html += '<td>' + escapeHtml(drug.details || '') + '</td>';
        } else {
          html += '<td>' + escapeHtml(drug.name || '') + '</td>';
          html += '<td>' + escapeHtml(drug.dosage || '') + '</td>';
          html += '<td>' + escapeHtml(drug.route || '') + '</td>';
          html += '<td>' + escapeHtml(drug.frequency || '') + '</td>';
          html += '<td>' + escapeHtml(drug.timing || drug.directives || '') + '</td>';
        }
        html += '<td class="no-print">';
        html += '  <button class="btn-icon" onclick="ICUApp.openAddDrugModal(\'' + sectionKey + '\',' + idx + ')" title="Edit" style="margin-right:6px;display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;padding:0;">✏️</button>';
        html += '  <button class="btn-icon" onclick="ICUApp.deleteDrug(\'' + sectionKey + '\',' + idx + ')" title="Delete" style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;padding:0;">🗑</button>';
        html += '</td>';
        html += '</tr>';
      });
    }
 
    html += '    </tbody>';
    html += '  </table>';
    html += '  </div>';
    html += '</div>';
    return html;
  }
 
  function openAddDrugModal(section, index) {
    currentDrugSection = section;
    editingDrugIndex = (index !== undefined && index !== null) ? index : null;
    
    var modal = document.getElementById('modal-add-drug');
    if (!modal) return;
 
    var sectionInfo = DRUG_SECTIONS.find(function (s) { return s.key === section; });
    var titleEl = document.getElementById('drug-modal-title');
    
    var patient = getActivePatient();
    var existingEntry = null;
    if (patient && editingDrugIndex !== null && patient.drugs && patient.drugs[section]) {
      existingEntry = patient.drugs[section][editingDrugIndex];
    }
 
    if (titleEl) {
      if (editingDrugIndex !== null) {
        titleEl.textContent = 'Edit: ' + (existingEntry ? (existingEntry.name || existingEntry.title || '') : 'Medication');
      } else {
        titleEl.textContent = 'Add to: ' + (sectionInfo ? sectionInfo.title : section);
      }
    }
 
    // Reset/Set drug fields
    setValById('drug-name', existingEntry ? (existingEntry.name || existingEntry.title || '') : '');
    setValById('drug-dosage', existingEntry ? (existingEntry.dosage || '') : '');
    setValById('drug-route', existingEntry ? (existingEntry.route || 'IV') : 'IV');
    setValById('drug-frequency', existingEntry ? (existingEntry.frequency || '') : '');
    setValById('drug-timing', existingEntry ? (existingEntry.timing || '') : '');
    setValById('drug-directives', existingEntry ? (existingEntry.directives || existingEntry.details || '') : '');
 
    // Adapt fields to match the active drug section
    var nameLabel = document.querySelector('label[for="drug-name"]');
    var dosageLabel = document.querySelector('label[for="drug-dosage"]');
    var routeGroup = document.getElementById('drug-route').closest('.form-group');
    var freqGroup = document.getElementById('drug-frequency').closest('.form-group');
    var timingGroup = document.getElementById('drug-timing').closest('.form-group');
    var dirLabel = document.querySelector('label[for="drug-directives"]');
 
    // Default visibility states
    if (nameLabel) nameLabel.textContent = 'Medication Name';
    if (dosageLabel) dosageLabel.closest('.form-group').style.display = 'block';
    if (routeGroup) routeGroup.style.display = 'block';
    if (freqGroup) freqGroup.style.display = 'block';
    if (timingGroup) timingGroup.style.display = 'block';
    if (dirLabel) dirLabel.closest('.form-group').style.display = 'block';
    if (dirLabel) dirLabel.textContent = 'Clinical Nursing Directives';
 
    if (section === 'monitoringProtocols') {
      if (nameLabel) nameLabel.textContent = 'Protocol Title';
      if (dosageLabel) dosageLabel.closest('.form-group').style.display = 'none';
      if (routeGroup) routeGroup.style.display = 'none';
      if (freqGroup) freqGroup.style.display = 'none';
      if (timingGroup) timingGroup.style.display = 'none';
      if (dirLabel) dirLabel.textContent = 'Details';
    } else if (section === 'ivInfusions') {
      if (timingGroup) timingGroup.style.display = 'none';
    } else {
      if (dirLabel) dirLabel.closest('.form-group').style.display = 'none';
    }
 
    openModal('modal-add-drug');
  }
 
  function saveDrug(section) {
    section = section || currentDrugSection;
    if (!section) { showToast('No drug section selected', 'error'); return; }
 
    var patient = getActivePatient();
    if (!patient) { showToast('No patient selected', 'error'); return; }
 
    var entry;
    if (section === 'monitoringProtocols') {
      var title = getValById('drug-name');
      var details = getValById('drug-directives');
      if (!title.trim()) { showToast('Protocol title is required', 'error'); return; }
      entry = { title: title, details: details };
    } else {
      var name = getValById('drug-name');
      var dosage = getValById('drug-dosage');
      var route = getValById('drug-route');
      var frequency = getValById('drug-frequency');
      if (!name.trim()) { showToast('Medication name is required', 'error'); return; }
      entry = { name: name, dosage: dosage, route: route, frequency: frequency };
      if (section === 'ivInfusions') {
        entry.directives = getValById('drug-directives');
      } else {
        entry.timing = getValById('drug-timing');
      }
    }
 
    if (!patient.drugs) patient.drugs = { ivInfusions: [], ivIntermittent: [], subcutaneous: [], oral: [], procedural: [], monitoringProtocols: [] };
    if (!patient.drugs[section]) patient.drugs[section] = [];
    
    if (editingDrugIndex !== null) {
      patient.drugs[section][editingDrugIndex] = entry;
      showToast('Medication updated', 'success');
    } else {
      patient.drugs[section].push(entry);
      showToast('Medication added', 'success');
    }
 
    updatePatient(patient.id, { drugs: patient.drugs });
    renderDrugSheet(getActivePatient());
    closeModal('modal-add-drug');
    editingDrugIndex = null;
  }

  function deleteDrug(section, index) {
    if (!confirm('Delete this entry?')) return;
    var patient = getActivePatient();
    if (!patient || !patient.drugs || !patient.drugs[section]) return;
    patient.drugs[section].splice(index, 1);
    updatePatient(patient.id, { drugs: patient.drugs });
    renderDrugSheet(getActivePatient());
    showToast('Entry removed', 'info');
  }

  // ─── Antibiotics Tracking & History ────────────────────────────────

  function calculateAntibioticDays(startDate, endDate) {
    if (!startDate) return '—';
    var start = new Date(startDate);
    if (isNaN(start.getTime())) return '—';
    
    var end = endDate ? new Date(endDate) : new Date();
    if (isNaN(end.getTime())) end = new Date();
    
    // Clear time portions for accurate day counting
    start.setHours(0,0,0,0);
    end.setHours(0,0,0,0);
    
    var diffTime = end.getTime() - start.getTime();
    var diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return diffDays > 0 ? diffDays : 1;
  }

  function renderActiveAntibioticsSection(patient) {
    var list = patient.antibiotics || [];
    var active = list.filter(function (a) { return a.status === 'Active' || !a.status; });

    var html = '<div class="drug-section" style="margin-bottom:24px;">';
    html += '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">';
    html += '    <h3 style="margin:0;font-size:14px;font-weight:600;color:#0d9488;display:flex;align-items:center;gap:6px;">';
    html += '      <span style="display:inline-flex;align-items:center;justify-content:center;background:#0d9488;color:#fff;width:20px;height:20px;border-radius:50%;font-size:11px;">0</span>';
    html += '      ANTIBIOTIC THERAPY (ACTIVE) / العلاج النشط بالمضادات الحيوية';
    html += '    </h3>';
    html += '    <button class="btn btn-sm btn-primary no-print" onclick="ICUApp.openAddAntibioticModal()" title="Add Antibiotic">+ Add Antibiotic</button>';
    html += '  </div>';
    html += '  <div style="overflow-x:auto;">';
    html += '  <table class="data-table" style="width:100%;border-collapse:collapse;font-size:13px;">';
    html += '    <thead><tr>';
    html += '      <th style="width:30px;">#</th>';
    html += '      <th>Antibiotic Name</th>';
    html += '      <th>Dosage</th>';
    html += '      <th>Route</th>';
    html += '      <th>Frequency</th>';
    html += '      <th>Timing</th>';
    html += '      <th>Start Date</th>';
    html += '      <th>Day #</th>';
    html += '      <th style="width:110px;" class="no-print">Actions</th>';
    html += '    </tr></thead>';
    html += '    <tbody>';

    if (active.length === 0) {
      html += '<tr><td colspan="9" style="text-align:center;color:#94a3b8;padding:12px;">No active antibiotic therapies</td></tr>';
    } else {
      active.forEach(function (anti, idx) {
        var realIdx = list.indexOf(anti);
        var dayNum = calculateAntibioticDays(anti.startDate, null);

        html += '<tr>';
        html += '<td>' + (idx + 1) + '</td>';
        html += '<td style="font-weight:600;color:#14b8a6;">' + escapeHtml(anti.name || '') + '</td>';
        html += '<td>' + escapeHtml(anti.dosage || '') + '</td>';
        html += '<td><span class="route-badge iv">' + escapeHtml(anti.route || '') + '</span></td>';
        html += '<td>' + escapeHtml(anti.frequency || '') + '</td>';
        html += '<td>' + escapeHtml(anti.timing || '') + '</td>';
        html += '<td>' + formatDate(anti.startDate) + '</td>';
        html += '<td style="font-weight:700;color:#c8a94e;">Day ' + dayNum + '</td>';
        html += '<td class="no-print">';
        html += '  <button class="btn btn-sm btn-danger" onclick="ICUApp.openStopAntibioticModal(' + realIdx + ')" title="Stop antibiotic" style="padding:2px 8px;font-size:11px;margin-right:4px;">🛑 Stop</button>';
        html += '  <button class="btn-icon" onclick="ICUApp.openAddAntibioticModal(' + realIdx + ')" title="Edit" style="margin-right:4px;display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;">✏️</button>';
        html += '  <button class="btn-icon" onclick="ICUApp.deleteAntibiotic(' + realIdx + ')" title="Delete" style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;">🗑</button>';
        html += '</td>';
        html += '</tr>';
      });
    }

    html += '    </tbody>';
    html += '  </table>';
    html += '  </div>';
    html += '</div>';
    return html;
  }

  function renderAntibiotics(patient) {
    var container = document.getElementById('antibiotics-sheet-content');
    if (!container) return;

    var list = patient.antibiotics || [];
    var active = list.filter(function (a) { return a.status === 'Active' || !a.status; });
    var past = list.filter(function (a) { return a.status === 'Discontinued'; });

    var html = '<div style="margin-bottom:24px;">';
    html += '  <h3 style="margin:0 0 12px;font-size:15px;color:#14b8a6;font-weight:700;">Active Antibiotics / المضادات الحيوية النشطة حالياً</h3>';
    html += '  <div style="overflow-x:auto;">';
    html += '  <table class="data-table" style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:16px;">';
    html += '    <thead><tr>';
    html += '      <th style="width:30px;">#</th>';
    html += '      <th>Antibiotic Name</th>';
    html += '      <th>Dosage</th>';
    html += '      <th>Route</th>';
    html += '      <th>Frequency</th>';
    html += '      <th>Timing</th>';
    html += '      <th>Start Date</th>';
    html += '      <th>Day #</th>';
    html += '    </tr></thead>';
    html += '    <tbody>';

    active.forEach(function (anti, idx) {
      var dayNum = calculateAntibioticDays(anti.startDate, null);
      html += '<tr>';
      html += '<td>' + (idx + 1) + '</td>';
      html += '<td style="font-weight:600;color:#14b8a6;">' + escapeHtml(anti.name || '') + '</td>';
      html += '<td>' + escapeHtml(anti.dosage || '') + '</td>';
      html += '<td><span class="route-badge iv">' + escapeHtml(anti.route || '') + '</span></td>';
      html += '<td>' + escapeHtml(anti.frequency || '') + '</td>';
      html += '<td>' + escapeHtml(anti.timing || '') + '</td>';
      html += '<td>' + formatDate(anti.startDate) + '</td>';
      html += '<td style="font-weight:700;color:#c8a94e;">Day ' + dayNum + '</td>';
      html += '</tr>';
    });

    // Append 3 empty rows at the bottom of the active list
    var activeCount = active.length;
    for (var r = 1; r <= 3; r++) {
      html += '<tr style="height:28px;">';
      html += '<td style="text-align:center;font-weight:600;color:#94a3b8;">' + (activeCount + r) + '</td>';
      html += '<td></td><td></td><td></td><td></td><td></td><td></td><td></td>';
      html += '</tr>';
    }

    html += '    </tbody>';
    html += '  </table>';
    html += '  </div>';
    html += '</div>';

    // Discontinued / History Table (printed without Actions column)
    html += '<div>';
    html += '  <h3 style="margin:24px 0 12px;font-size:15px;color:#94a3b8;font-weight:700;">Antibiotic Treatment History / سجل العلاجات السابقة</h3>';
    html += '  <div style="overflow-x:auto;">';
    html += '  <table class="data-table" style="width:100%;border-collapse:collapse;font-size:12px;">';
    html += '    <thead><tr style="background:#1e293b;">';
    html += '      <th style="width:30px;">#</th>';
    html += '      <th>Antibiotic Name</th>';
    html += '      <th>Dosage</th>';
    html += '      <th>Route</th>';
    html += '      <th>Frequency</th>';
    html += '      <th>Start Date</th>';
    html += '      <th>End Date</th>';
    html += '      <th>Total Duration</th>';
    html += '    </tr></thead>';
    html += '    <tbody>';

    if (past.length === 0) {
      html += '<tr><td colspan="8" style="text-align:center;color:#94a3b8;padding:24px;">No previous antibiotic history recorded.</td></tr>';
    } else {
      past.forEach(function (anti, idx) {
        var duration = calculateAntibioticDays(anti.startDate, anti.endDate);
        html += '<tr>';
        html += '<td>' + (idx + 1) + '</td>';
        html += '<td style="font-weight:600;color:#94a3b8;">' + escapeHtml(anti.name || '') + '</td>';
        html += '<td>' + escapeHtml(anti.dosage || '') + '</td>';
        html += '<td><span class="route-badge po" style="background:rgba(148,163,184,0.1);color:#94a3b8;">' + escapeHtml(anti.route || '') + '</span></td>';
        html += '<td>' + escapeHtml(anti.frequency || '') + '</td>';
        html += '<td>' + formatDate(anti.startDate) + '</td>';
        html += '<td>' + formatDate(anti.endDate) + '</td>';
        html += '<td style="font-weight:600;color:#f59e0b;">' + duration + ' Days</td>';
        html += '</tr>';
      });
    }
    html += '    </tbody>';
    html += '  </table>';
    html += '  </div>';
    html += '</div>';

    container.innerHTML = html;
  }

  function renderInteractiveAntibioticsHistory(patient) {
    var list = patient.antibiotics || [];
    var past = list.filter(function (a) { return a.status === 'Discontinued'; });

    var html = '<div style="margin-top:24px;" class="no-print">';
    html += '  <h3 style="margin:24px 0 12px;font-size:15px;color:#94a3b8;font-weight:700;">Antibiotic Treatment History / سجل العلاجات السابقة</h3>';
    html += '  <div style="overflow-x:auto;">';
    html += '  <table class="data-table" style="width:100%;border-collapse:collapse;font-size:13px;">';
    html += '    <thead><tr style="background:#1e293b;">';
    html += '      <th style="width:30px;">#</th>';
    html += '      <th>Antibiotic Name</th>';
    html += '      <th>Dosage</th>';
    html += '      <th>Route</th>';
    html += '      <th>Frequency</th>';
    html += '      <th>Start Date</th>';
    html += '      <th>End Date</th>';
    html += '      <th>Total Duration</th>';
    html += '      <th style="width:90px;" class="no-print">Actions</th>';
    html += '    </tr></thead>';
    html += '    <tbody>';

    if (past.length === 0) {
      html += '<tr><td colspan="9" style="text-align:center;color:#94a3b8;padding:24px;">No previous antibiotic history recorded.</td></tr>';
    } else {
      past.forEach(function (anti, idx) {
        var realIdx = list.indexOf(anti);
        var duration = calculateAntibioticDays(anti.startDate, anti.endDate);
        html += '<tr>';
        html += '<td>' + (idx + 1) + '</td>';
        html += '<td style="font-weight:600;color:#94a3b8;">' + escapeHtml(anti.name || '') + '</td>';
        html += '<td>' + escapeHtml(anti.dosage || '') + '</td>';
        html += '<td><span class="route-badge po" style="background:rgba(148,163,184,0.1);color:#94a3b8;">' + escapeHtml(anti.route || '') + '</span></td>';
        html += '<td>' + escapeHtml(anti.frequency || '') + '</td>';
        html += '<td>' + formatDate(anti.startDate) + '</td>';
        html += '<td>' + formatDate(anti.endDate) + '</td>';
        html += '<td style="font-weight:600;color:#f59e0b;">' + duration + ' Days</td>';
        html += '<td class="no-print">';
        html += '  <button class="btn-icon" onclick="ICUApp.openAddAntibioticModal(' + realIdx + ')" style="margin-right:4px;display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;">✏️</button>';
        html += '  <button class="btn-icon" onclick="ICUApp.deleteAntibiotic(' + realIdx + ')" style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;">🗑</button>';
        html += '</td>';
        html += '</tr>';
      });
    }
    html += '    </tbody>';
    html += '  </table>';
    html += '  </div>';
    html += '</div>';
    return html;
  }

  function openAddAntibioticModal(index) {
    editingAntiIndex = (index !== undefined && index !== null) ? index : null;
    var modal = document.getElementById('modal-add-antibiotic');
    if (!modal) return;

    var titleEl = document.getElementById('anti-modal-title');
    var patient = getActivePatient();
    var existing = null;
    if (patient && editingAntiIndex !== null && patient.antibiotics) {
      existing = patient.antibiotics[editingAntiIndex];
    }

    if (titleEl) {
      titleEl.textContent = editingAntiIndex !== null ? 'Edit Antibiotic Therapy' : 'Add Antibiotic Therapy';
    }

    setValById('anti-name', existing ? existing.name : '');
    setValById('anti-dosage', existing ? existing.dosage : '');
    setValById('anti-route', existing ? existing.route : 'IV');
    setValById('anti-frequency', existing ? existing.frequency : '');
    setValById('anti-timing', existing ? existing.timing : '');
    setValById('anti-start-date', existing ? existing.startDate : todayStr());

    openModal('modal-add-antibiotic');
  }

  function saveAntibiotic() {
    var patient = getActivePatient();
    if (!patient) { showToast('No patient selected', 'error'); return; }

    var name = getValById('anti-name');
    var startDate = getValById('anti-start-date');
    if (!name.trim()) { showToast('Antibiotic name is required', 'error'); return; }
    if (!startDate) { showToast('Start date is required', 'error'); return; }

    var entry = {
      name: name,
      dosage: getValById('anti-dosage'),
      route: getValById('anti-route'),
      frequency: getValById('anti-frequency'),
      timing: getValById('anti-timing'),
      startDate: startDate,
      status: 'Active',
      endDate: null
    };

    if (!patient.antibiotics) patient.antibiotics = [];

    if (editingAntiIndex !== null) {
      var prev = patient.antibiotics[editingAntiIndex];
      entry.status = prev.status || 'Active';
      entry.endDate = prev.endDate || null;
      patient.antibiotics[editingAntiIndex] = entry;
      showToast('Antibiotic therapy updated', 'success');
    } else {
      patient.antibiotics.push(entry);
      showToast('Antibiotic therapy added', 'success');
    }

    updatePatient(patient.id, { antibiotics: patient.antibiotics });
    
    var activeP = getActivePatient();
    renderDrugSheet(activeP);
    renderAntibiotics(activeP);
    
    closeModal('modal-add-antibiotic');
    editingAntiIndex = null;
  }

  function openStopAntibioticModal(index) {
    stoppingAntiIndex = index;
    var modal = document.getElementById('modal-stop-antibiotic');
    if (!modal) return;

    var patient = getActivePatient();
    if (patient && patient.antibiotics && patient.antibiotics[stoppingAntiIndex]) {
      var anti = patient.antibiotics[stoppingAntiIndex];
      var msgEl = document.getElementById('stop-anti-confirm-msg');
      if (msgEl) msgEl.textContent = 'Are you sure you want to stop "' + anti.name + '"? Please select the discontinuation date:';
    }

    setValById('anti-stop-date', todayStr());
    openModal('modal-stop-antibiotic');
  }

  function confirmStopAntibiotic() {
    var patient = getActivePatient();
    if (!patient || stoppingAntiIndex === null) return;

    var stopDate = getValById('anti-stop-date');
    if (!stopDate) { showToast('End date is required', 'error'); return; }

    var anti = patient.antibiotics[stoppingAntiIndex];
    if (new Date(stopDate) < new Date(anti.startDate)) {
      showToast('End date cannot be before start date', 'error');
      return;
    }

    anti.status = 'Discontinued';
    anti.endDate = stopDate;

    updatePatient(patient.id, { antibiotics: patient.antibiotics });
    
    var activeP = getActivePatient();
    renderDrugSheet(activeP);
    renderAntibiotics(activeP);

    closeModal('modal-stop-antibiotic');
    showToast('Antibiotic therapy stopped', 'info');
    stoppingAntiIndex = null;
  }

  function deleteAntibiotic(index) {
    if (!confirm('Are you sure you want to delete this antibiotic record? This cannot be undone.')) return;
    var patient = getActivePatient();
    if (!patient || !patient.antibiotics) return;

    patient.antibiotics.splice(index, 1);
    updatePatient(patient.id, { antibiotics: patient.antibiotics });

    var activeP = getActivePatient();
    renderDrugSheet(activeP);
    renderAntibiotics(activeP);
    showToast('Antibiotic record deleted', 'info');
  }

  // ─── Fluid Balance Sheet ──────────────────────────────────────────

  function getFluidDate() {
    var el = document.getElementById('fluid-date');
    return el ? el.value : todayStr();
  }

  function initFluidRow(hour) {
    return {
      hour: hour,
      ivFluids: 0,
      meds: 0,
      enteralFeed: 0,
      oralIntake: 0,
      bloodProducts: 0,
      urineOutput: 0,
      drainOutput: 0,
      ngtOutput: 0,
      stool: 0,
      emesis: 0
    };
  }

  function calculateFluidTotals(entries) {
    var result = {
      hourly: [],
      subtotals: { night: null, morning: null, afternoon: null, evening: null },
      grandTotal: null
    };

    // Ensure 24 entries
    for (var h = 0; h < 24; h++) {
      var existing = entries.find(function (e) { return e.hour === h; });
      result.hourly.push(existing || initFluidRow(h));
    }

    function sumFields(rows, fields) {
      var total = 0;
      rows.forEach(function (r) {
        fields.forEach(function (f) {
          total += parseFloat(r[f]) || 0;
        });
      });
      return total;
    }

    function calcBlock(startH, endH) {
      var rows = result.hourly.slice(startH, endH + 1);
      var intake = sumFields(rows, FLUID_INPUT_FIELDS);
      var output = sumFields(rows, FLUID_OUTPUT_FIELDS);
      return { intake: intake, output: output, balance: intake - output };
    }

    result.subtotals.night     = calcBlock(0, 5);    // 00:00 - 05:00
    result.subtotals.morning   = calcBlock(6, 11);   // 06:00 - 11:00
    result.subtotals.afternoon = calcBlock(12, 17);   // 12:00 - 17:00
    result.subtotals.evening   = calcBlock(18, 23);   // 18:00 - 23:00

    var totalIntake = result.subtotals.night.intake + result.subtotals.morning.intake + result.subtotals.afternoon.intake + result.subtotals.evening.intake;
    var totalOutput = result.subtotals.night.output + result.subtotals.morning.output + result.subtotals.afternoon.output + result.subtotals.evening.output;
    result.grandTotal = { intake: totalIntake, output: totalOutput, balance: totalIntake - totalOutput };

    return result;
  }

  function renderFluidBalance(patient) {
    var container = document.getElementById('fluid-sheet-content');
    if (!container) return;

    var dateEl = document.getElementById('fluid-date');
    if (dateEl && !dateEl.value) dateEl.value = todayStr();

    var date = getFluidDate();
    var entries = (patient.fluidBalance && patient.fluidBalance[date]) ? patient.fluidBalance[date] : [];
    var totals = calculateFluidTotals(entries);
    var hourlyData = totals.hourly;

    var html = '<div style="overflow-x:auto;">';
    html += '<table class="data-table fluid-table" style="width:100%;border-collapse:collapse;font-size:12px;">';

    // Header
    html += '<thead>';
    html += '<tr>';
    html += '<th rowspan="2" style="width:55px;">Hour</th>';
    html += '<th colspan="5" style="background:#dbeafe;color:#1e40af;">INTAKE (ml)</th>';
    html += '<th rowspan="2" style="background:#93c5fd;color:#1e3a8a;width:70px;">TOTAL IN</th>';
    html += '<th colspan="5" style="background:#fde68a;color:#92400e;">OUTPUT (ml)</th>';
    html += '<th rowspan="2" style="background:#fbbf24;color:#78350f;width:70px;">TOTAL OUT</th>';
    html += '<th rowspan="2" style="width:70px;">BALANCE</th>';
    html += '</tr>';
    html += '<tr>';
    html += '<th style="font-size:10px;">IV Fluids</th><th style="font-size:10px;">Meds</th><th style="font-size:10px;">Enteral</th><th style="font-size:10px;">Oral</th><th style="font-size:10px;">Blood</th>';
    html += '<th style="font-size:10px;">Urine</th><th style="font-size:10px;">Drain</th><th style="font-size:10px;">NGT</th><th style="font-size:10px;">Stool</th><th style="font-size:10px;">Emesis</th>';
    html += '</tr>';
    html += '</thead>';
    html += '<tbody>';

    var runningIntake = 0;
    var runningOutput = 0;

    for (var h = 0; h < 24; h++) {
      var row = hourlyData[h];
      var hourIntake = (parseFloat(row.ivFluids) || 0) + (parseFloat(row.meds) || 0) + (parseFloat(row.enteralFeed) || 0) + (parseFloat(row.oralIntake) || 0) + (parseFloat(row.bloodProducts) || 0);
      var hourOutput = (parseFloat(row.urineOutput) || 0) + (parseFloat(row.drainOutput) || 0) + (parseFloat(row.ngtOutput) || 0) + (parseFloat(row.stool) || 0) + (parseFloat(row.emesis) || 0);
      var hourBalance = hourIntake - hourOutput;
      runningIntake += hourIntake;
      runningOutput += hourOutput;

      html += '<tr>';
      html += '<td style="font-weight:600;white-space:nowrap;">' + String(h).padStart(2, '0') + ':00</td>';
      html += fluidInputCell(h, 'ivFluids', row.ivFluids);
      html += fluidInputCell(h, 'meds', row.meds);
      html += fluidInputCell(h, 'enteralFeed', row.enteralFeed);
      html += fluidInputCell(h, 'oralIntake', row.oralIntake);
      html += fluidInputCell(h, 'bloodProducts', row.bloodProducts);
      html += '<td style="font-weight:600;background:#eff6ff;">' + (hourIntake || '') + '</td>';
      html += fluidInputCell(h, 'urineOutput', row.urineOutput);
      html += fluidInputCell(h, 'drainOutput', row.drainOutput);
      html += fluidInputCell(h, 'ngtOutput', row.ngtOutput);
      html += fluidInputCell(h, 'stool', row.stool);
      html += fluidInputCell(h, 'emesis', row.emesis);
      html += '<td style="font-weight:600;background:#fef9c3;">' + (hourOutput || '') + '</td>';
      var balColor = hourBalance > 0 ? '#10b981' : hourBalance < 0 ? '#ef4444' : '#64748b';
      html += '<td style="font-weight:700;color:' + balColor + ';">' + (hourBalance !== 0 ? (hourBalance > 0 ? '+' : '') + hourBalance : '') + '</td>';
      html += '</tr>';

      // Subtotal rows
      if (h === 5 || h === 11 || h === 17 || h === 23) {
        var periodName = h === 5 ? 'Night (00-05)' : h === 11 ? 'Morning (06-11)' : h === 17 ? 'Afternoon (12-17)' : 'Evening (18-23)';
        var periodKey = h === 5 ? 'night' : h === 11 ? 'morning' : h === 17 ? 'afternoon' : 'evening';
        var sub = totals.subtotals[periodKey];
        var subBalColor = sub.balance > 0 ? '#10b981' : sub.balance < 0 ? '#ef4444' : '#64748b';
        html += '<tr style="background:#f1f5f9;font-weight:700;border-top:2px solid #cbd5e1;">';
        html += '<td colspan="6" style="text-align:right;padding-right:12px;">' + periodName + ' Subtotal:</td>';
        html += '<td style="background:#dbeafe;">' + sub.intake + '</td>';
        html += '<td colspan="5" style="text-align:right;padding-right:12px;"></td>';
        html += '<td style="background:#fde68a;">' + sub.output + '</td>';
        html += '<td style="color:' + subBalColor + ';">' + (sub.balance > 0 ? '+' : '') + sub.balance + '</td>';
        html += '</tr>';
      }
    }

    // Grand total row
    var gt = totals.grandTotal;
    var gtColor = gt.balance > 0 ? '#10b981' : gt.balance < 0 ? '#ef4444' : '#1e293b';
    html += '<tr style="background:#e2e8f0;font-weight:800;font-size:13px;border-top:3px solid #475569;">';
    html += '<td colspan="6" style="text-align:right;padding-right:12px;">24-HOUR GRAND TOTAL:</td>';
    html += '<td style="background:#bfdbfe;">' + gt.intake + '</td>';
    html += '<td colspan="5" style="text-align:right;padding-right:12px;"></td>';
    html += '<td style="background:#fcd34d;">' + gt.output + '</td>';
    html += '<td style="color:' + gtColor + ';font-size:14px;">' + (gt.balance > 0 ? '+' : '') + gt.balance + '</td>';
    html += '</tr>';

    html += '</tbody></table></div>';
    container.innerHTML = html;
  }

  function fluidInputCell(hour, field, value) {
    var v = value ? value : '';
    return '<td style="padding:2px;"><input type="number" class="fluid-input" data-hour="' + hour + '" data-field="' + field + '" value="' + v + '" min="0" style="width:55px;padding:3px 4px;border:1px solid #e2e8f0;border-radius:4px;font-size:12px;text-align:center;" onchange="ICUApp.saveFluidEntry(' + hour + ',\'' + field + '\',this.value)" /></td>';
  }

  function saveFluidEntry(hour, field, value) {
    var patient = getActivePatient();
    if (!patient) return;
    var date = getFluidDate();

    if (!patient.fluidBalance) patient.fluidBalance = {};
    if (!patient.fluidBalance[date]) {
      patient.fluidBalance[date] = [];
      for (var h = 0; h < 24; h++) {
        patient.fluidBalance[date].push(initFluidRow(h));
      }
    }

    var entries = patient.fluidBalance[date];
    var row = entries.find(function (e) { return e.hour === hour; });
    if (!row) {
      row = initFluidRow(hour);
      entries.push(row);
    }
    row[field] = parseFloat(value) || 0;

    updatePatient(patient.id, { fluidBalance: patient.fluidBalance });
    renderFluidTotals(entries);
  }

  function renderFluidTotals(entries) {
    var patient = getActivePatient();
    if (patient) renderFluidBalance(patient);
  }

  // ─── Daily I/O Summary ────────────────────────────────────────────

  function calculateDailyIO(patient, date) {
    if (!patient.fluidBalance || !patient.fluidBalance[date]) {
      return { date: date, intake: 0, output: 0, balance: 0 };
    }
    var entries = patient.fluidBalance[date];
    var totals = calculateFluidTotals(entries);
    return {
      date: date,
      intake: totals.grandTotal.intake,
      output: totals.grandTotal.output,
      balance: totals.grandTotal.balance
    };
  }

  function renderIOSummary(patient) {
    var container = document.getElementById('io-summary-content');
    if (!container) return;

    // Collect all dates with fluid balance data, sorted descending, show last 7
    var dates = [];
    if (patient.fluidBalance) {
      dates = Object.keys(patient.fluidBalance).sort().reverse().slice(0, 7).reverse();
    }

    if (dates.length === 0) {
      container.innerHTML = '<p class="empty-state" style="text-align:center;color:#94a3b8;padding:40px;">No fluid balance data recorded yet.</p>';
      return;
    }

    var html = '<div style="overflow-x:auto;">';
    html += '<table class="data-table" style="width:100%;border-collapse:collapse;font-size:13px;">';
    html += '<thead><tr>';
    html += '<th>Date</th><th>Total Intake (ml)</th><th>Total Output (ml)</th><th>Net Balance (ml)</th><th>Cumulative Balance (ml)</th><th>Notes</th>';
    html += '</tr></thead>';
    html += '<tbody>';

    var cumulative = 0;
    dates.forEach(function (date) {
      var daily = calculateDailyIO(patient, date);
      cumulative += daily.balance;

      var balColor = daily.balance > 0 ? '#10b981' : daily.balance < 0 ? '#ef4444' : '#64748b';
      var cumColor = cumulative > 0 ? '#10b981' : cumulative < 0 ? '#ef4444' : '#64748b';

      html += '<tr>';
      html += '<td style="font-weight:600;">' + formatDate(date) + '</td>';
      html += '<td>' + daily.intake + '</td>';
      html += '<td>' + daily.output + '</td>';
      html += '<td style="color:' + balColor + ';font-weight:700;">' + (daily.balance > 0 ? '+' : '') + daily.balance + '</td>';
      html += '<td style="color:' + cumColor + ';font-weight:700;">' + (cumulative > 0 ? '+' : '') + cumulative + '</td>';
      html += '<td>—</td>';
      html += '</tr>';
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;
  }

  // ─── Lab Results Sheet ────────────────────────────────────────────

  function getLabDates(patient) {
    if (!patient.labs) return [];
    return Object.keys(patient.labs).sort();
  }

  function getLabStatus(param, value) {
    if (value === '' || value === null || value === undefined || isNaN(parseFloat(value))) return 'normal';
    var v = parseFloat(value);
    var range = LAB_RANGES[param];
    if (!range) return 'normal';

    if (range.critLow !== null && v < range.critLow) return 'critical-low';
    if (range.critHigh !== null && v > range.critHigh) return 'critical-high';
    if (v < range.low) return 'warning-low';
    if (v > range.high) return 'warning-high';
    return 'normal';
  }

  function labStatusStyle(status) {
    switch (status) {
      case 'critical-low':  return 'background:#fecaca;color:#991b1b;font-weight:700;';
      case 'critical-high': return 'background:#fecaca;color:#991b1b;font-weight:700;';
      case 'warning-low':   return 'background:#fed7aa;color:#9a3412;font-weight:600;';
      case 'warning-high':  return 'background:#fed7aa;color:#9a3412;font-weight:600;';
      default:              return '';
    }
  }

  function renderLabSheet(patient) {
    var container = document.getElementById('lab-sheet-content');
    if (!container) return;

    var dates = getLabDates(patient);

    var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">';
    html += '  <h2 style="margin:0;font-size:18px;">Laboratory Results</h2>';
    html += '  <button class="btn btn-primary" onclick="ICUApp.openAddLabModal()">+ Add Lab Results</button>';
    html += '</div>';

    if (dates.length === 0) {
      html += '<p class="empty-state" style="text-align:center;color:#94a3b8;padding:40px;">No lab results recorded yet.</p>';
      container.innerHTML = html;
      return;
    }

    html += '<div style="overflow-x:auto;">';
    html += '<table class="data-table lab-table" style="width:100%;border-collapse:collapse;font-size:12px;">';
    html += '<thead><tr>';
    html += '<th style="min-width:130px;position:sticky;left:0;background:#f8fafc;z-index:1;">Parameter</th>';
    html += '<th style="min-width:80px;">Reference</th>';
    dates.forEach(function (d) {
      html += '<th style="min-width:90px;">' + formatDate(d) + ' <button class="btn-icon" onclick="ICUApp.deleteLabDate(\'' + d + '\')" title="Delete date" style="font-size:10px;">✕</button></th>';
    });
    html += '</tr></thead>';
    html += '<tbody>';

    Object.keys(LAB_CATEGORIES).forEach(function (category) {
      html += '<tr style="background:#f1f5f9;"><td colspan="' + (dates.length + 2) + '" style="font-weight:700;font-size:12px;color:#475569;padding:6px 8px;">' + escapeHtml(category) + '</td></tr>';
      LAB_CATEGORIES[category].forEach(function (param) {
        var range = LAB_RANGES[param];
        html += '<tr>';
        html += '<td style="font-weight:500;position:sticky;left:0;background:#fff;z-index:1;">' + escapeHtml(param) + (range.unit ? ' <span style="color:#94a3b8;font-size:10px;">(' + range.unit + ')</span>' : '') + '</td>';
        html += '<td style="color:#64748b;font-size:11px;">' + range.low + '–' + range.high + '</td>';
        dates.forEach(function (d) {
          var val = (patient.labs[d] && patient.labs[d][param] !== undefined) ? patient.labs[d][param] : '';
          var status = getLabStatus(param, val);
          var style = labStatusStyle(status);
          var arrow = '';
          if (status === 'warning-high' || status === 'critical-high') arrow = ' ↑';
          if (status === 'warning-low' || status === 'critical-low') arrow = ' ↓';
          html += '<td style="' + style + '">' + escapeHtml(String(val)) + arrow + '</td>';
        });
        html += '</tr>';
      });
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;
  }

  function openAddLabModal() {
    var patient = getActivePatient();
    if (!patient) { showToast('No patient selected', 'error'); return; }

    var modal = document.getElementById('modal-add-lab');
    if (!modal) return;

    // Reset date and all lab input fields
    setValById('lab-date', todayStr());
    document.querySelectorAll('#modal-add-lab .lab-field').forEach(function (input) {
      input.value = '';
    });

    openModal('modal-add-lab');
  }

  function saveLabEntry() {
    var patient = getActivePatient();
    if (!patient) { showToast('No patient selected', 'error'); return; }

    var date = getValById('lab-date');
    if (!date) { showToast('Date is required', 'error'); return; }

    if (!patient.labs) patient.labs = {};
    if (!patient.labs[date]) patient.labs[date] = {};

    document.querySelectorAll('#modal-add-lab .lab-field').forEach(function (input) {
      var param = input.getAttribute('data-param');
      if (param) {
        if (input.value !== '') {
          patient.labs[date][param] = parseFloat(input.value);
        } else {
          delete patient.labs[date][param];
        }
      }
    });

    updatePatient(patient.id, { labs: patient.labs });
    renderLabSheet(getActivePatient());
    closeModal('modal-add-lab');
    showToast('Lab results saved', 'success');
  }

  function deleteLabDate(date) {
    if (!confirm('Delete all lab results for ' + formatDate(date) + '?')) return;
    var patient = getActivePatient();
    if (!patient || !patient.labs) return;
    delete patient.labs[date];
    updatePatient(patient.id, { labs: patient.labs });
    renderLabSheet(getActivePatient());
    showToast('Lab date removed', 'info');
  }

  // ─── Progress Notes ───────────────────────────────────────────────

  function renderProgressNotes(patient) {
    var container = document.getElementById('notes-content');
    if (!container) return;

    var notes = patient.progressNotes || [];
    var sorted = notes.slice().sort(function (a, b) {
      var dA = (a.date || '') + (a.time || '');
      var dB = (b.date || '') + (b.time || '');
      return dB.localeCompare(dA);
    });

    var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">';
    html += '  <h2 style="margin:0;font-size:18px;">Progress Notes (SOAP)</h2>';
    html += '  <button class="btn btn-primary" onclick="ICUApp.openAddNoteModal()">+ Add Note</button>';
    html += '</div>';

    if (sorted.length === 0) {
      html += '<p class="empty-state" style="text-align:center;color:#94a3b8;padding:40px;">No progress notes recorded yet.</p>';
      container.innerHTML = html;
      return;
    }

    sorted.forEach(function (note, idx) {
      // Find actual index in original array for deletion
      var realIdx = notes.indexOf(note);
      html += '<div class="note-card" style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:12px;">';
      html += '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;border-bottom:1px solid #f1f5f9;padding-bottom:8px;">';
      html += '    <div>';
      html += '      <span style="font-weight:700;color:#1e293b;">' + formatDate(note.date) + '</span>';
      html += '      <span style="color:#64748b;margin-left:8px;">' + formatTime(note.time) + '</span>';
      html += '      <span style="color:#3b82f6;margin-left:12px;">' + escapeHtml(note.doctor || '') + '</span>';
      html += '    </div>';
      html += '    <button class="btn-icon" onclick="ICUApp.deleteNote(' + realIdx + ')" title="Delete note">🗑</button>';
      html += '  </div>';

      if (note.subjective) {
        html += '<div style="margin-bottom:8px;"><strong style="color:#6366f1;">S — Subjective:</strong><p style="margin:4px 0 0 16px;color:#334155;">' + escapeHtml(note.subjective) + '</p></div>';
      }
      if (note.objective) {
        html += '<div style="margin-bottom:8px;"><strong style="color:#0891b2;">O — Objective:</strong><p style="margin:4px 0 0 16px;color:#334155;">' + escapeHtml(note.objective) + '</p></div>';
      }
      if (note.assessment) {
        html += '<div style="margin-bottom:8px;"><strong style="color:#d97706;">A — Assessment:</strong><p style="margin:4px 0 0 16px;color:#334155;">' + escapeHtml(note.assessment) + '</p></div>';
      }
      if (note.plan) {
        html += '<div style="margin-bottom:8px;"><strong style="color:#059669;">P — Plan:</strong><p style="margin:4px 0 0 16px;color:#334155;">' + escapeHtml(note.plan) + '</p></div>';
      }

      html += '</div>';
    });

    container.innerHTML = html;
  }

  function openAddNoteModal() {
    var patient = getActivePatient();
    if (!patient) { showToast('No patient selected', 'error'); return; }

    setValById('note-date', todayStr());
    setValById('note-time', nowTimeStr());
    setValById('note-doctor', patient.doctorName || '');
    setValById('note-subjective', '');
    setValById('note-objective', '');
    setValById('note-assessment', '');
    setValById('note-plan', '');

    openModal('modal-add-note');
  }

  function saveNote() {
    var patient = getActivePatient();
    if (!patient) { showToast('No patient selected', 'error'); return; }

    var note = {
      date: getValById('note-date'),
      time: getValById('note-time'),
      doctor: getValById('note-doctor'),
      subjective: getValById('note-subjective'),
      objective: getValById('note-objective'),
      assessment: getValById('note-assessment'),
      plan: getValById('note-plan')
    };

    if (!note.date) { showToast('Date is required', 'error'); return; }

    if (!patient.progressNotes) patient.progressNotes = [];
    patient.progressNotes.push(note);
    updatePatient(patient.id, { progressNotes: patient.progressNotes });
    renderProgressNotes(getActivePatient());
    closeModal('modal-add-note');
    showToast('Progress note saved', 'success');
  }

  function deleteNote(index) {
    if (!confirm('Delete this progress note?')) return;
    var patient = getActivePatient();
    if (!patient || !patient.progressNotes) return;
    patient.progressNotes.splice(index, 1);
    updatePatient(patient.id, { progressNotes: patient.progressNotes });
    renderProgressNotes(getActivePatient());
    showToast('Note removed', 'info');
  }

  // ─── Data Management ──────────────────────────────────────────────

  function exportData() {
    var patients = getPatients();
    if (patients.length === 0) { showToast('No data to export', 'info'); return; }

    var dataStr = JSON.stringify(patients, null, 2);
    var blob = new Blob([dataStr], { type: 'application/json' });
    var url = URL.createObjectURL(blob);

    var now = new Date();
    var timestamp = now.getFullYear() + '' +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0') + '_' +
      String(now.getHours()).padStart(2, '0') +
      String(now.getMinutes()).padStart(2, '0');

    var a = document.createElement('a');
    a.href = url;
    a.download = 'icu_patients_' + timestamp + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Data exported successfully', 'success');
  }

  function importData(file) {
    if (!file) return;

    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var data = JSON.parse(e.target.result);
        if (!Array.isArray(data)) {
          showToast('Invalid file format: expected an array of patients', 'error');
          return;
        }

        // Validate structure: each entry must have an id
        var valid = data.every(function (p) {
          return p && typeof p === 'object' && p.id;
        });
        if (!valid) {
          showToast('Invalid data: each patient must have an id', 'error');
          return;
        }

        savePatients(data);
        activePatientId = null;
        renderPatientList();
        clearSheets();
        showToast('Data imported: ' + data.length + ' patient(s)', 'success');
      } catch (err) {
        showToast('Error reading file: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
  }

  function printFile() {
    window.print();
  }

  function printAllSheets() {
    var patient = getActivePatient();
    if (!patient) { showToast('No patient selected', 'error'); return; }

    document.body.classList.add('print-all');
    
    // Force layout reflow to make sure DOM updates are processed before printing
    var reflow = document.body.offsetHeight;
    
    var cleanupDone = false;
    var cleanup = function () {
      if (cleanupDone) return;
      cleanupDone = true;
      document.body.classList.remove('print-all');
    };
    
    window.addEventListener('afterprint', cleanup, { once: true });
    
    // Keep it active for 5 minutes (300000ms) as a fallback so it doesn't remove class while print dialog is open
    setTimeout(cleanup, 300000);

    // Delay print call to allow DOM reflow and rendering
    setTimeout(function() {
      window.print();
    }, 200);
  }

  // ─── Demo Data ─────────────────────────────────────────────────────

  function loadDemoData() {
    var today = todayStr();
    var yesterday = (function () {
      var d = new Date();
      d.setDate(d.getDate() - 1);
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    })();
    var twoDaysAgo = (function () {
      var d = new Date();
      d.setDate(d.getDate() - 2);
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    })();

    var demoPatient = {
      id: generateId(),
      name: 'Magda Al-Ismaili',
      nameAr: 'مجدة السماعيلي',
      age: 68,
      gender: 'Female',
      fileNumber: 'ICU-2026-0471',
      phone: '+968 9912 3456',
      admissionDate: twoDaysAgo,
      diagnosis: 'Hepatorenal Syndrome (HRS)',
      comorbidities: 'Liver Cirrhosis (Child-Pugh C), Hypothyroidism, Portal Hypertension',
      pastHistory: 'Recurrent ascites requiring paracentesis, previous variceal bleeding (banded), hepatic encephalopathy grade II',
      allergies: 'Sulfonamides',
      codeStatus: 'Full Code',
      weight: '72',
      height: '160',
      gcs: '13',
      devices: { tracheostomy: false, ngt: true, foley: true, centralLine: true, peripheralLine: true, chestTube: false },
      initialVitals: { bp: '88/54', hr: '102', temp: '37.2', rr: '22', spo2: '94' },
      emergencyContact: { name: 'Ahmed Al-Ismaili', relation: 'Son', phone: '+968 9923 4567' },
      location: 'Home Care',
      status: 'critical',
      doctorName: 'Dr. Karim Al-Agmey',
      drugs: {
        ivInfusions: [
          { name: 'Human Albumin 20%', dosage: '1 Bottle (100ml)', route: 'IV', frequency: 'q24h', directives: 'Infuse over 2 hours. Monitor for allergic reaction.' },
          { name: 'Kidmin (Amino Acid 7%)', dosage: '250ml', route: 'IV', frequency: 'q12h', directives: 'Run at 80ml/hr via central line.' },
          { name: 'Normal Saline 0.9%', dosage: '500ml', route: 'IV', frequency: 'q8h', directives: 'Maintenance. Adjust rate per fluid balance.' }
        ],
        ivIntermittent: [
          { name: 'Controloc (Pantoprazole)', dosage: '40mg', route: 'IV', frequency: 'q24h', timing: '08:00' },
          { name: 'B-Com (Vitamin B Complex)', dosage: '1 Amp', route: 'IV', frequency: 'q24h', timing: '08:00' },
          { name: 'Lasix (Furosemide)', dosage: '20mg', route: 'IV', frequency: 'q8h', timing: '06-14-22' },
          { name: 'Danset (Ondansetron)', dosage: '8mg', route: 'IV', frequency: 'q12h', timing: '08-20' },
          { name: 'Calcium Gluconate', dosage: '1 Amp + 100ml G10%', route: 'IV', frequency: 'q12h', timing: '08-20' }
        ],
        subcutaneous: [
          { name: 'Clexane (Enoxaparin)', dosage: '40mg', route: 'SC', frequency: 'q24h', timing: '08:00' }
        ],
        oral: [
          { name: 'L-Thyroxin (Levothyroxine)', dosage: '100mcg', route: 'PO', frequency: 'q24h', timing: '06:00' },
          { name: 'Midodrine', dosage: '5mg', route: 'PO', frequency: 'q8h', timing: '06-14-22' },
          { name: 'Ursofalk (Ursodeoxycholic Acid)', dosage: '1 tab', route: 'PO', frequency: 'q8h', timing: '08-16-24' },
          { name: 'NaHCO3 (Sodium Bicarbonate)', dosage: '500mg', route: 'PO', frequency: 'q8h', timing: '08-16-24' },
          { name: 'Bional (Probiotic)', dosage: '1 tab', route: 'PO', frequency: 'q12h', timing: '08-20' },
          { name: 'Spectone (Spironolactone)', dosage: '100mg', route: 'PO', frequency: 'q24h', timing: '09:00' },
          { name: 'Demafight (Dapagliflozin)', dosage: '5mg', route: 'PO', frequency: 'q24h', timing: '09:00' },
          { name: 'Lactulose', dosage: '15ml', route: 'PO', frequency: 'q8h', timing: '08-16-24' }
        ],
        procedural: [
          { name: 'Evacuating Enema', dosage: '', route: 'PR', frequency: 'q8h', timing: '' },
          { name: 'Atrovent Nebulizer', dosage: '', route: 'INH', frequency: 'q8h', timing: '' },
          { name: 'Pulmicort Nebulizer', dosage: '', route: 'INH', frequency: 'q12h', timing: '' }
        ],
        monitoringProtocols: [
          { title: 'Meticulous Fluid Balance', details: 'Strict I/O charting every hour. Target net negative 500–1000ml/day. Notify physician if urine output < 0.5ml/kg/hr for 2 consecutive hours.' },
          { title: 'Encephalopathy Prophylaxis', details: 'GCS assessment q4h. Lactulose titrated to 3–4 soft stools/day. RASS sedation scale monitoring. Notify if GCS drops ≥ 2 points.' }
        ]
      },
      fluidBalance: {},
      labs: {},
      progressNotes: [],
      antibiotics: [
        {
          name: 'Meronam (Meropenem)',
          dosage: '1g',
          route: 'IV',
          frequency: 'q8h',
          timing: '06:00 — 14:00 — 22:00',
          startDate: twoDaysAgo,
          status: 'Active',
          endDate: null
        },
        {
          name: 'Gastrobiotic (Rifaximin)',
          dosage: '550mg',
          route: 'PO',
          frequency: 'q12h',
          timing: '08:00 — 20:00',
          startDate: twoDaysAgo,
          status: 'Active',
          endDate: null
        },
        {
          name: 'Targocid (Teicoplanin)',
          dosage: '400mg',
          route: 'IV',
          frequency: 'q24h',
          timing: '12:00',
          startDate: (function () {
            var d = new Date();
            d.setDate(d.getDate() - 10);
            return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
          })(),
          status: 'Discontinued',
          endDate: yesterday
        }
      ]
    };

    // Sample fluid balance for today
    var todayFluid = [];
    for (var h = 0; h < 24; h++) {
      var row = initFluidRow(h);
      if (h >= 0 && h <= 14) {
        if (h % 3 === 0) { row.ivFluids = 60; row.meds = 20; }
        if (h % 4 === 0) { row.enteralFeed = 50; }
        if (h % 6 === 0) { row.oralIntake = 30; }
        row.urineOutput = Math.floor(Math.random() * 40) + 20;
        if (h % 8 === 0) { row.drainOutput = 15; }
      }
      todayFluid.push(row);
    }
    demoPatient.fluidBalance[today] = todayFluid;

    // Smaller set for yesterday
    var yFluid = [];
    for (var h2 = 0; h2 < 24; h2++) {
      var r2 = initFluidRow(h2);
      if (h2 % 3 === 0) { r2.ivFluids = 65; r2.meds = 15; }
      if (h2 % 4 === 0) { r2.enteralFeed = 45; }
      r2.urineOutput = Math.floor(Math.random() * 50) + 15;
      if (h2 % 12 === 0) { r2.ngtOutput = 25; }
      yFluid.push(r2);
    }
    demoPatient.fluidBalance[yesterday] = yFluid;

    // Sample labs
    demoPatient.labs[yesterday] = {
      WBC: 14.2, Hb: 8.1, Platelets: 88,
      BUN: 48, Creatinine: 3.8,
      ALT: 62, AST: 78, 'Total Bilirubin': 6.4, Albumin: 2.1,
      Na: 128, K: 5.6, Ca: 7.8, Mg: 1.5, PO4: 5.2,
      PT: 18.2, INR: 1.8, PTT: 42,
      pH: 7.31, pCO2: 32, pO2: 72, HCO3: 18, Lactate: 3.2,
      CRP: 68, Procalcitonin: 1.4
    };
    demoPatient.labs[today] = {
      WBC: 12.8, Hb: 8.4, Platelets: 95,
      BUN: 44, Creatinine: 3.4,
      ALT: 55, AST: 68, 'Total Bilirubin': 5.8, Albumin: 2.3,
      Na: 130, K: 5.2, Ca: 8.0, Mg: 1.6, PO4: 4.8,
      PT: 17.1, INR: 1.6, PTT: 38,
      pH: 7.33, pCO2: 34, pO2: 76, HCO3: 20, Lactate: 2.8,
      CRP: 52, Procalcitonin: 1.1
    };

    // Sample progress note
    demoPatient.progressNotes.push({
      date: today,
      time: '08:30',
      doctor: 'Dr. Karim Al-Agmey',
      subjective: 'Patient reports mild abdominal discomfort. Less drowsy compared to yesterday. Tolerating enteral feeds via NGT without nausea. Family at bedside, concerned about prognosis.',
      objective: 'GCS 13 (E4 V4 M5). BP 92/58, HR 98, Temp 37.1°C, RR 20, SpO2 95% on 3L NC. Abdomen distended, shifting dullness positive. Bilateral LE edema 2+. Urine output 35ml/hr (improved from 20ml/hr yesterday). Jaundiced. Central line site clean, no signs of infection.',
      assessment: 'Hepatorenal syndrome with gradual improvement in renal parameters after albumin and midodrine. Persistent coagulopathy and hypoalbuminemia. Mild hepatic encephalopathy (Grade I-II, improved). Metabolic acidosis partially compensated.',
      plan: '1. Continue Human Albumin 20% daily + Midodrine 5mg TID\n2. Monitor Cr/BUN trend — target Cr < 3.0\n3. Adjust Lasix based on UOP — hold if < 0.5ml/kg/hr\n4. Continue Lactulose, titrate to 3-4 stools/day\n5. Repeat labs PM\n6. Discuss liver transplant evaluation with hepatology team\n7. Family meeting re: goals of care at 14:00'
    });

    // Create interactive blank patient template
    var blankPatient = createEmptyPatient();
    blankPatient.name = 'New Patient (Blank)';
    blankPatient.nameAr = 'ملف مريض فارغ';
    blankPatient.fileNumber = 'IMC-BLANK-001';
    
    // Add empty fluid balance structure for today
    var blankFluid = [];
    for (var h = 0; h < 24; h++) {
      blankFluid.push(initFluidRow(h));
    }
    blankPatient.fluidBalance[today] = blankFluid;

    var patients = [demoPatient, blankPatient];
    savePatients(patients);
  }

  // ─── Event Listeners ──────────────────────────────────────────────

  function setupEventListeners() {
    // Navigation tabs
    setupNavigation();

    // Add patient
    var addPatientBtn = document.getElementById('add-patient-btn');
    if (addPatientBtn) {
      addPatientBtn.addEventListener('click', function () {
        // Reset form manually
        setValById('new-patient-name', '');
        setValById('new-patient-name-ar', '');
        setValById('new-patient-age', '');
        setValById('new-patient-gender', 'Male');
        setValById('new-patient-diagnosis', '');
        setValById('new-patient-file', '');
        openModal('modal-add-patient');
      });
    }

    // Save new patient from modal
    var savePatientBtn = document.getElementById('save-patient-btn');
    if (savePatientBtn) {
      savePatientBtn.addEventListener('click', function () {
        var name = getValById('new-patient-name');
        var nameAr = getValById('new-patient-name-ar');
        if (!name.trim() && !nameAr.trim()) {
          showToast('Patient name is required', 'error');
          return;
        }
        addPatient({
          name: name,
          nameAr: nameAr,
          age: parseInt(getValById('new-patient-age'), 10) || 0,
          gender: getValById('new-patient-gender') || 'Male',
          fileNumber: getValById('new-patient-file'),
          diagnosis: getValById('new-patient-diagnosis')
        });
        closeModal('modal-add-patient');
      });
    }

    // Save admission
    var saveAdmBtn = document.getElementById('save-admission-btn');
    if (saveAdmBtn) {
      saveAdmBtn.addEventListener('click', saveAdmission);
    }

    // Save drug
    var saveDrugBtn = document.getElementById('save-drug-btn');
    if (saveDrugBtn) {
      saveDrugBtn.addEventListener('click', function () {
        saveDrug();
      });
    }

    // Save antibiotic
    var saveAntiBtn = document.getElementById('save-anti-btn');
    if (saveAntiBtn) {
      saveAntiBtn.addEventListener('click', function () {
        saveAntibiotic();
      });
    }

    // Confirm stop antibiotic
    var confirmStopAntiBtn = document.getElementById('confirm-stop-anti-btn');
    if (confirmStopAntiBtn) {
      confirmStopAntiBtn.addEventListener('click', function () {
        confirmStopAntibiotic();
      });
    }

    // Save lab
    var saveLabBtn = document.getElementById('save-lab-btn');
    if (saveLabBtn) {
      saveLabBtn.addEventListener('click', saveLabEntry);
    }

    // Save note
    var saveNoteBtn = document.getElementById('save-note-btn');
    if (saveNoteBtn) {
      saveNoteBtn.addEventListener('click', saveNote);
    }

    // Export
    var exportBtn = document.getElementById('export-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', exportData);
    }

    // Header patient dropdown select change
    var headerSelect = document.getElementById('header-patient-select');
    if (headerSelect) {
      headerSelect.addEventListener('change', function () {
        if (this.value) selectPatient(this.value);
      });
    }

    // Import
    var importBtn = document.getElementById('import-btn');
    if (importBtn) {
      importBtn.addEventListener('click', function () {
        var fileInput = document.getElementById('import-file');
        if (fileInput) fileInput.click();
      });
    }
    var importFile = document.getElementById('import-file');
    if (importFile) {
      importFile.addEventListener('change', function (e) {
        if (e.target.files && e.target.files[0]) {
          importData(e.target.files[0]);
          e.target.value = '';
        }
      });
    }

    // Print
    var printBtn = document.getElementById('print-btn');
    if (printBtn) {
      printBtn.addEventListener('click', printFile);
    }
    var printAllBtn = document.getElementById('print-all-btn');
    if (printAllBtn) {
      printAllBtn.addEventListener('click', printAllSheets);
    }

    // Fluid date change
    var fluidDateEl = document.getElementById('fluid-date');
    if (fluidDateEl) {
      fluidDateEl.addEventListener('change', function () {
        var patient = getActivePatient();
        if (patient) renderFluidBalance(patient);
      });
    }

    // Modal close buttons
    document.querySelectorAll('.modal-close, [data-dismiss="modal"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var modal = this.closest('.modal');
        if (modal) closeModal(modal.id);
      });
    });

    // Click outside modal to close
    document.querySelectorAll('.modal').forEach(function (modal) {
      modal.addEventListener('click', function (e) {
        if (e.target === modal) closeModal(modal.id);
      });
    });

    // Escape key to close modals
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeAllModals();
    });
  }

  // ─── App Initialization ───────────────────────────────────────────

  function initApp() {
    // One-time clear of any old database to start with a clean raw template
    if (!localStorage.getItem('icu_raw_initialized_v2')) {
      localStorage.removeItem('icu_patients');
      localStorage.removeItem('active_patient_id');
      localStorage.setItem('icu_raw_initialized_v2', 'true');
    }

    var patients = getPatients();
    
    // Ensure at least one completely blank patient template exists
    if (patients.length === 0) {
      var blankPatient = createEmptyPatient();
      blankPatient.name = 'New Patient (Blank)';
      blankPatient.nameAr = 'ملف مريض فارغ';
      blankPatient.fileNumber = 'IMC-BLANK-001';
      var today = todayStr();
      var blankFluid = [];
      for (var h = 0; h < 24; h++) {
        blankFluid.push(initFluidRow(h));
      }
      blankPatient.fluidBalance[today] = blankFluid;
      patients.push(blankPatient);
      savePatients(patients);
    }

    // Render patient list
    renderPatientList();

    // Setup event listeners
    setupEventListeners();

    // Auto-select first patient if available
    patients = getPatients();
    if (patients.length > 0) {
      selectPatient(patients[0].id);
    }

    // Inject toast animation styles
    var style = document.createElement('style');
    style.textContent = '@keyframes toastIn{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}@keyframes toastOut{from{transform:translateX(0);opacity:1}to{transform:translateX(100%);opacity:0}}';
    document.head.appendChild(style);

    // Register Service Worker for PWA / Mobile installation
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('./sw.js').then(function (registration) {
          console.log('ServiceWorker registration successful with scope: ', registration.scope);
        }).catch(function (err) {
          console.log('ServiceWorker registration failed: ', err);
        });
      });
    }

    console.log('ICU File Management System initialized.');
  }

  // ─── Public API ────────────────────────────────────────────────────

  return {
    initApp: initApp,
    generateId: generateId,
    addPatient: addPatient,
    deletePatient: deletePatient,
    selectPatient: selectPatient,
    getPatients: getPatients,
    savePatients: savePatients,
    getActivePatient: getActivePatient,
    updatePatient: updatePatient,
    switchTab: switchTab,
    setupNavigation: setupNavigation,
    renderCover: renderCover,
    renderAdmission: renderAdmission,
    saveAdmission: saveAdmission,
    renderDrugSheet: renderDrugSheet,
    openAddDrugModal: openAddDrugModal,
    saveDrug: saveDrug,
    deleteDrug: deleteDrug,
    renderDrugSection: renderDrugSection,
    renderFluidBalance: renderFluidBalance,
    getFluidDate: getFluidDate,
    initFluidRow: initFluidRow,
    calculateFluidTotals: calculateFluidTotals,
    saveFluidEntry: saveFluidEntry,
    renderFluidTotals: renderFluidTotals,
    renderIOSummary: renderIOSummary,
    calculateDailyIO: calculateDailyIO,
    renderLabSheet: renderLabSheet,
    getLabDates: getLabDates,
    openAddLabModal: openAddLabModal,
    saveLabEntry: saveLabEntry,
    deleteLabDate: deleteLabDate,
    getLabStatus: getLabStatus,
    renderProgressNotes: renderProgressNotes,
    openAddNoteModal: openAddNoteModal,
    saveNote: saveNote,
    deleteNote: deleteNote,
    openModal: openModal,
    closeModal: closeModal,
    closeAllModals: closeAllModals,
    exportData: exportData,
    importData: importData,
    printFile: printFile,
    printAllSheets: printAllSheets,
    showToast: showToast,
    formatDate: formatDate,
    formatTime: formatTime,
    escapeHtml: escapeHtml,
    debounce: debounce,
    loadDemoData: loadDemoData,
    setupEventListeners: setupEventListeners,
    openAddAntibioticModal: openAddAntibioticModal,
    saveAntibiotic: saveAntibiotic,
    openStopAntibioticModal: openStopAntibioticModal,
    confirmStopAntibiotic: confirmStopAntibiotic,
    deleteAntibiotic: deleteAntibiotic,
    renderAntibiotics: renderAntibiotics
  };

})();

// ─── Bootstrap ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
  ICUApp.initApp();
});
