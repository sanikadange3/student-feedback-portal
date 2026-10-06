// selfstudentfeedback.js

let currentUser = null;
let currentStudent = null;
let allSubjects = [];
let submittedSubjectIds = new Set();
let activeSubject = null;
let isPortalInitialized = false;
let activeCycleId = "cycle_1";
let activeCycleName = "Feedback Cycle 1";

const currentRatings = {
  q1: 0,
  q2: 0,
  q3: 0,
  q4: 0,
  q5: 0
};

const ratingLabels = {
  1: "1 - Poor",
  2: "2 - Needs Improvement",
  3: "3 - Average",
  4: "4 - Good",
  5: "5 - Excellent"
};

const THEORY_FEEDBACK_QUESTIONS = [
  "Is the subject organized in a logical sequence, with clearly stated objectives?",
  "Is the subject thoroughly prepared, and is the syllabus covered according to the timeline?",
  "Is the language simple and understandable, and are diagrams and board work neat and clear?",
  "Does the faculty ask questions to promote interaction, test understanding, and provoke thought?",
  "Are lectures conducted regularly, with proper class control?"
];

const LAB_FEEDBACK_QUESTIONS = [
  "Is the lab syllabus covered according to the timeline and organized in a logical sequence?",
  "Is critical thinking used in problem solving?",
  "Are questions asked to promote interaction, and are viva voce questions discussed?",
  "Are practical sessions explained clearly and conducted effectively?",
  "Are labs conducted regularly, with proper control during the session?"
];

// 1. Auth & Access Control Check
auth.onAuthStateChanged(async (user) => {
  if (!user) {
    window.location.href = "studentlogin.html";
    return;
  }

  // Prevent multiple executions for the same user session
  if (currentUser && currentUser.uid === user.uid && isPortalInitialized) {
    console.log("Portal already initialized for user session:", user.uid);
    return;
  }

  currentUser = user;

  try {
    const docSnap = await db.collection("users").doc(user.uid).get();

    if (!docSnap.exists) {
      alert("User profile not found in system.");
      await auth.signOut();
      window.location.href = "studentlogin.html";
      return;
    }

    currentStudent = docSnap.data();

    // STRICT ACCESS CONTROL: Prevent teacher-registered students from accessing this self-registered portal
    if (currentStudent.registrationType === "teacher_registered" || (!currentStudent.registrationType && currentStudent.role === "student")) {
      console.warn("Teacher-registered student attempted to access self-registered portal. Redirecting...");
      window.location.href = "studentfeedback.html";
      return;
    }

    isPortalInitialized = true;

    // Display student profile info in header bar
    displayStudentInfo(currentStudent);

    // Initialize interactive star ratings for modal
    initStarRatings();

    // Initialize dashboard data: fetch submitted feedback & matching subjects
    await initPortal(user, currentStudent);

  } catch (err) {
    console.error("Error initializing self-registered student portal:", err);
    alert("Error loading profile: " + err.message);
  }
});

// 2. Display Student Info in Header Bar
function displayStudentInfo(student) {
  document.getElementById("studentName").textContent = student.name || "N/A";
  document.getElementById("studentPrn").textContent = student.prn || "N/A";
  document.getElementById("studentClass").textContent = student.class || student.year || "N/A";
  document.getElementById("studentDivision").textContent = student.division || "N/A";
  document.getElementById("studentBatch").textContent = student.batch || "N/A";
}

// 3. Initialize Portal: Load Submitted Feedback + Subjects matching Class, Division, and Batch
async function initPortal(user, student) {
  const loadingContainer = document.getElementById("loadingContainer");
  const noSubjectsAlert = document.getElementById("noSubjectsAlert");
  const subjectsDashboard = document.getElementById("subjectsDashboard");

  loadingContainer.style.display = "flex";
  noSubjectsAlert.style.display = "none";
  subjectsDashboard.style.display = "none";

  try {
    // Clear existing local arrays & sets before fetching
    allSubjects = [];
    submittedSubjectIds.clear();

    // Fetch active cycle settings from systemSettings/selfFeedbackCycle
    try {
      const cycleDoc = await db.collection("systemSettings").doc("selfFeedbackCycle").get();
      if (cycleDoc.exists) {
        const cData = cycleDoc.data();
        if (cData.currentCycleId) activeCycleId = cData.currentCycleId;
        if (cData.cycleName) activeCycleName = cData.cycleName;
      }
    } catch (cErr) {
      console.warn("Could not load active cycle settings:", cErr);
    }

    // Step A: Load previously submitted feedback for this student IN THE ACTIVE CYCLE
    const [selfFeedbackSnap, generalFeedbackSnap] = await Promise.all([
      db.collection("self_feedback").where("studentId", "==", user.uid).get(),
      db.collection("feedback").where("studentId", "==", user.uid).get()
    ]);

    selfFeedbackSnap.forEach(doc => {
      const data = doc.data();
      const docCycle = data.feedbackCycleId || "cycle_1";
      if (docCycle === activeCycleId) {
        if (data.subjectId) submittedSubjectIds.add(data.subjectId);
        if (data.subjectStructureId) submittedSubjectIds.add(data.subjectStructureId);
        if (data.originalSubjectName) submittedSubjectIds.add(data.originalSubjectName.trim().toLowerCase());
        if (data.subjectName) submittedSubjectIds.add(data.subjectName.trim().toLowerCase());
      }
    });

    generalFeedbackSnap.forEach(doc => {
      const data = doc.data();
      const docCycle = data.feedbackCycleId || "cycle_1";
      if (docCycle === activeCycleId) {
        if (data.subjectId) submittedSubjectIds.add(data.subjectId);
        if (data.subjectStructureId) submittedSubjectIds.add(data.subjectStructureId);
        if (data.originalSubjectName) submittedSubjectIds.add(data.originalSubjectName.trim().toLowerCase());
        if (data.subjectName) submittedSubjectIds.add(data.subjectName.trim().toLowerCase());
      }
    });

    console.log(`Loaded submitted feedback for ${activeCycleId}:`, Array.from(submittedSubjectIds));

    // Step B: Fetch subjects matching student's Class, Division, and Batch from Firestore
    allSubjects = await fetchSubjectsForStudent(student);

    loadingContainer.style.display = "none";

    if (allSubjects.length === 0) {
      noSubjectsAlert.style.display = "flex";
      return;
    }

    subjectsDashboard.style.display = "block";
    renderDashboard();

  } catch (err) {
    console.error("Error initializing portal:", err);
    loadingContainer.style.display = "none";
    alert("Error fetching portal data: " + err.message);
  }
}

// Helper: Normalize Year Code from Class string (e.g., "SY Computer" -> "SY", "TY" -> "TY")
function getYearCode(classStr) {
  if (!classStr) return "";
  const s = classStr.toUpperCase();
  if (s.includes("FY") || s.includes("FIRST")) return "FY";
  if (s.includes("SY") || s.includes("SECOND")) return "SY";
  if (s.includes("TY") || s.includes("THIRD")) return "TY";
  return classStr.trim();
}

// 4. Fetch Subjects from Firestore & Deduplicate Subjects per Class, Division, and Batch
async function fetchSubjectsForStudent(student) {
  const studentClass = (student.class || student.year || "").trim();
  const studentYearCode = getYearCode(studentClass);
  const studentDiv = (student.division || "").trim();
  const studentBatch = (student.batch || "").trim();

  console.log("Searching subjects for logged-in student:", { studentClass, studentYearCode, studentDiv, studentBatch });

  // Map keyed by Canonical Subject Identifier to ensure each subject appears EXACTLY ONCE
  const subjectMap = new Map();

  // Helper to generate canonical uniqueness key for deduplication
  function getCanonicalKey(structureId, baseName, isPractical) {
    const structId = structureId ? structureId.trim() : "";
    const normName = (baseName || "").trim().toLowerCase();
    const typeStr = isPractical ? "practical" : "theory";
    
    if (structId) {
      return `${structId}_${studentDiv}_${typeStr}`;
    }
    return `${normName}_${studentDiv}_${typeStr}`;
  }

  // --- Source 1: Firestore 'subjects' collection ---
  try {
    const subjectsSnap = await db.collection("subjects")
      .where("division", "==", studentDiv)
      .get();

    subjectsSnap.forEach(doc => {
      const d = doc.data();
      const docYear = (d.year || "").trim();
      const docYearCode = getYearCode(docYear);

      // Verify Class / Year match
      const isYearMatch = docYear === studentClass || 
                          docYearCode === studentYearCode || 
                          studentClass.toLowerCase().includes(docYear.toLowerCase()) || 
                          docYear.toLowerCase().includes(studentYearCode.toLowerCase());

      if (!isYearMatch) return;

      const isLab = d.hasLab || d.type === "lab" || d.type === "practical" || (d.subject && d.subject.toLowerCase().includes("lab"));
      
      // Batch filtering:
      // For practical subjects: must match studentBatch OR batch === 'all'
      // For theory subjects: applies to all batches in that division
      if (isLab) {
        const isLabBatchMatch = !d.batch || d.batch === "all" || d.batch === studentBatch;
        if (!isLabBatchMatch) return;
      }

      const rawSub = d.originalSubjectName || d.subject || d.subjectName || "";
      const baseName = String(rawSub).replace(" (Theory)", "").replace(" (Lab)", "").trim();
      const isPractical = isLab;
      const type = isPractical ? "lab" : "theory";
      const subjectType = isPractical ? "Practical" : "Theory";
      const structureId = d.subjectStructureId || doc.id.split("_")[0];

      // Format display name: "Data Structures" for Theory, "Data Structures Lab" for Practical
      let displayName = d.subject || baseName;
      displayName = String(displayName);
      if (isPractical && !displayName.toLowerCase().includes("lab")) {
        displayName = baseName + " Lab";
      } else if (!isPractical) {
        displayName = displayName.replace(" (Theory)", "");
      }

      const canonicalKey = getCanonicalKey(structureId, baseName, isPractical);

      const candidateSubject = {
        id: doc.id,
        subjectName: baseName,
        displayName: displayName,
        type: type,
        isPractical: isPractical,
        subjectType: subjectType,
        faculty: d.faculty || "Not Assigned",
        class: d.year || studentClass,
        division: d.division || studentDiv,
        batch: d.batch || studentBatch,
        subjectStructureId: structureId,
        teacherId: d.teacherId || "",
        sequenceOrder: d.sequenceOrder || 0
      };

      // DEDUPLICATION LOGIC:
      if (!subjectMap.has(canonicalKey)) {
        subjectMap.set(canonicalKey, candidateSubject);
      } else {
        // If candidate record matches student's specific batch exactly, prefer it over generic
        const existing = subjectMap.get(canonicalKey);
        if (d.batch === studentBatch && existing.batch !== studentBatch) {
          subjectMap.set(canonicalKey, candidateSubject);
        }
      }
    });
  } catch (err) {
    console.error("Error querying subjects collection:", err);
  }

  // --- Source 2: Firestore 'subjectStructures' collection (Double coverage) ---
  try {
    const structuresSnap = await db.collection("subjectStructures")
      .where("divisions", "array-contains", studentDiv)
      .get();

    structuresSnap.forEach(doc => {
      const d = doc.data();
      const docYear = (d.year || "").trim();
      const docYearCode = getYearCode(docYear);

      const isYearMatch = docYear === studentClass || 
                          docYearCode === studentYearCode || 
                          studentClass.toLowerCase().includes(docYear.toLowerCase()) || 
                          docYear.toLowerCase().includes(studentYearCode.toLowerCase());

      if (!isYearMatch) return;

      const facultyInfo = d.faculty || {};
      const divFaculty = facultyInfo[studentDiv] || {};
      const baseName = d.subjectName;
      const seq = d.sequenceOrder || 0;

      // Theory component of structure
      if (d.type === "theory" || d.type === "both") {
        const canonicalKey = getCanonicalKey(doc.id, baseName, false);
        if (!subjectMap.has(canonicalKey)) {
          subjectMap.set(canonicalKey, {
            id: `${doc.id}_${studentDiv}_theory`,
            subjectName: baseName,
            displayName: baseName,
            type: "theory",
            isPractical: false,
            subjectType: "Theory",
            faculty: divFaculty.theoryFaculty || "Not Assigned",
            class: studentClass,
            division: studentDiv,
            batch: studentBatch,
            subjectStructureId: doc.id,
            teacherId: d.teacherId || "",
            sequenceOrder: seq
          });
        }
      }

      // Practical component of structure
      if (d.type === "practical" || d.type === "lab" || d.type === "both") {
        const canonicalKey = getCanonicalKey(doc.id, baseName, true);
        const labName = baseName.toLowerCase().includes("lab") ? baseName : baseName + " Lab";
        if (!subjectMap.has(canonicalKey)) {
          subjectMap.set(canonicalKey, {
            id: `${doc.id}_${studentDiv}_lab`,
            subjectName: baseName,
            displayName: labName,
            type: "lab",
            isPractical: true,
            subjectType: "Practical",
            faculty: divFaculty.practicalFaculty || "Not Assigned",
            class: studentClass,
            division: studentDiv,
            batch: studentBatch,
            subjectStructureId: doc.id,
            teacherId: d.teacherId || "",
            sequenceOrder: seq
          });
        }
      }
    });
  } catch (err) {
    console.error("Error querying subjectStructures collection:", err);
  }

  const resultList = Array.from(subjectMap.values());

  // Sort by sequence order
  resultList.sort((a, b) => (a.sequenceOrder || 0) - (b.sequenceOrder || 0));

  // Determine submission status for each unique subject
  resultList.forEach(s => {
    const sId = s.id;
    const structId = s.subjectStructureId;
    const normName = s.subjectName ? s.subjectName.trim().toLowerCase() : "";
    const normDisplay = s.displayName ? s.displayName.trim().toLowerCase() : "";
    const canonicalKey = `${structId}_${s.division}_${s.isPractical ? "practical" : "theory"}`;

    s.isSubmitted = submittedSubjectIds.has(sId) || 
                    submittedSubjectIds.has(`${currentUser.uid}_${sId}`) ||
                    submittedSubjectIds.has(structId) ||
                    submittedSubjectIds.has(canonicalKey) ||
                    submittedSubjectIds.has(normName) ||
                    submittedSubjectIds.has(normDisplay) ||
                    Array.from(submittedSubjectIds).some(id => id.endsWith(sId) || (structId && id.includes(structId)));
  });

  // --- ELECTIVE FILTERING LOGIC ---
  const selectedElectiveIds = student.selectedElectives || [];
  const selectedElectiveNames = student.selectedElectiveNames || student.electives || [];

  const filteredList = resultList.filter(s => {
    const subName = (s.subjectName || "").trim().toLowerCase();
    const dispName = (s.displayName || "").trim().toLowerCase();
    const origName = (s.originalSubjectName || "").trim().toLowerCase();

    // Check if subject is an elective
    const isElectiveSubject = s.isElective === true || s.elective === true || s.isOptional === true ||
      subName.includes("pe-") || subName.includes("pe ") || subName.includes("pe1") || subName.includes("pe2") || 
      subName.includes("pe-i") || subName.includes("pe-ii") || subName.includes("elective") || subName.includes("open elective") || subName.includes("oe-");

    // If it's a normal/mandatory subject, always keep it!
    if (!isElectiveSubject) return true;

    // If student has no elective selections defined at all, keep all
    if (selectedElectiveIds.length === 0 && selectedElectiveNames.length === 0) {
      return true;
    }

    // Check if this elective matches student's selected electives by ID or Name
    const isIdMatch = selectedElectiveIds.includes(s.id) || 
                      selectedElectiveIds.includes(s.subjectStructureId) ||
                      selectedElectiveIds.some(id => (s.id && s.id.startsWith(id)) || (s.subjectStructureId && id.startsWith(s.subjectStructureId)));

    const isNameMatch = selectedElectiveNames.some(name => {
      const n = String(name).trim().toLowerCase();
      if (!n) return false;
      return n === subName || n === dispName || n === origName || subName.includes(n) || n.includes(subName);
    });

    return isIdMatch || isNameMatch;
  });

  console.log("Final filtered subject list for student UI (with electives):", filteredList);
  return filteredList;
}

// 5. Render Dashboard with Separate Theory and Practical Sections
function renderDashboard() {
  const theoryGrid = document.getElementById("theorySubjectsGrid");
  const practicalGrid = document.getElementById("practicalSubjectsGrid");
  const noTheoryText = document.getElementById("noTheoryText");
  const noPracticalText = document.getElementById("noPracticalText");
  const theoryCountBadge = document.getElementById("theoryCountBadge");
  const practicalCountBadge = document.getElementById("practicalCountBadge");

  // Clear existing DOM grids before rendering
  theoryGrid.innerHTML = "";
  practicalGrid.innerHTML = "";

  const theorySubjects = allSubjects.filter(s => !s.isPractical);
  const practicalSubjects = allSubjects.filter(s => s.isPractical);

  theoryCountBadge.textContent = `${theorySubjects.length} Subject${theorySubjects.length === 1 ? '' : 's'}`;
  practicalCountBadge.textContent = `${practicalSubjects.length} Subject${practicalSubjects.length === 1 ? '' : 's'}`;

  // Render Theory Subjects
  if (theorySubjects.length === 0) {
    noTheoryText.style.display = "block";
  } else {
    noTheoryText.style.display = "none";
    theoryGrid.innerHTML = theorySubjects.map(s => renderSubjectCardHTML(s)).join("");
  }

  // Render Practical Subjects
  if (practicalSubjects.length === 0) {
    noPracticalText.style.display = "block";
  } else {
    noPracticalText.style.display = "none";
    practicalGrid.innerHTML = practicalSubjects.map(s => renderSubjectCardHTML(s)).join("");
  }
}

// Helper: Generate HTML for a Subject Card
function renderSubjectCardHTML(subject) {
  return `
    <div class="subject-card" id="card-${escapeHTML(subject.id)}">
      <div class="subject-card-top">
        <div class="subject-card-header">
          <h4 class="subject-card-title">${escapeHTML(subject.displayName)}</h4>
          <span class="subject-type-badge ${subject.isPractical ? 'badge-practical' : 'badge-theory'}">
            ${escapeHTML(subject.subjectType)}
          </span>
        </div>
        <div class="subject-faculty-info">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
          <span>Faculty: <strong>${escapeHTML(subject.faculty)}</strong></span>
        </div>
        <div class="subject-meta-tags">
          <span class="meta-pill">Class: ${escapeHTML(currentStudent.class || currentStudent.year || 'N/A')}</span>
          <span class="meta-pill">Div: ${escapeHTML(currentStudent.division || 'N/A')}</span>
          <span class="meta-pill">Batch: ${escapeHTML(currentStudent.batch || 'N/A')}</span>
        </div>
      </div>
      <div class="subject-card-bottom">
        ${subject.isSubmitted ? `
          <div class="submitted-status-card">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <span>✓ Feedback Submitted</span>
          </div>
        ` : `
          <button class="give-feedback-btn" onclick="openFeedbackModal('${escapeHTML(subject.id)}')">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
            <span>Give Feedback</span>
          </button>
        `}
      </div>
    </div>
  `;
}

// 6. Interactive Star Rating Buttons for Modal Questions Q1-Q5
function initStarRatings() {
  const ratingContainers = document.querySelectorAll(".star-rating");

  ratingContainers.forEach((container) => {
    const ratingId = container.getAttribute("data-rating-id");
    const starBtns = container.querySelectorAll(".star-btn");
    const textSpan = document.getElementById(`${ratingId}Text`);

    starBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const value = parseInt(btn.getAttribute("data-value"), 10);
        currentRatings[ratingId] = value;

        // Highlight active stars
        starBtns.forEach((s) => {
          const sVal = parseInt(s.getAttribute("data-value"), 10);
          if (sVal <= value) {
            s.classList.add("active");
          } else {
            s.classList.remove("active");
          }
        });

        // Update rating status label text
        if (textSpan) {
          textSpan.textContent = ratingLabels[value] || "Not Rated";
        }

        // Hide validation error if displayed
        const modalErrorMsg = document.getElementById("modalErrorMsg");
        if (modalErrorMsg) modalErrorMsg.style.display = "none";
      });
    });
  });
}

// Reset Ratings in Modal
function resetModalRatings() {
  Object.keys(currentRatings).forEach(key => {
    currentRatings[key] = 0;
    const textSpan = document.getElementById(`${key}Text`);
    if (textSpan) textSpan.textContent = "Not Rated";

    const container = document.querySelector(`.star-rating[data-rating-id="${key}"]`);
    if (container) {
      container.querySelectorAll(".star-btn").forEach(s => s.classList.remove("active"));
    }
  });

  const modalComments = document.getElementById("modalComments");
  if (modalComments) modalComments.value = "";

  const modalErrorMsg = document.getElementById("modalErrorMsg");
  if (modalErrorMsg) modalErrorMsg.style.display = "none";
}

// 7. Open Feedback Modal for Specific Subject
function openFeedbackModal(subjectId) {
  activeSubject = allSubjects.find(s => s.id === subjectId);

  if (!activeSubject) {
    alert("Subject details not found.");
    return;
  }

  // Populate modal header details
  document.getElementById("modalSubjectName").textContent = activeSubject.displayName;
  document.getElementById("modalSubjectType").textContent = activeSubject.subjectType;
  document.getElementById("modalFacultyName").textContent = `Faculty: ${activeSubject.faculty}`;

  // Update questions dynamically for Theory vs Lab
  const isLab = activeSubject.isPractical === true || 
                activeSubject.type === "lab" || 
                activeSubject.type === "practical" || 
                (activeSubject.subjectType && activeSubject.subjectType.toLowerCase().includes("practical"));
  
  const questions = isLab ? LAB_FEEDBACK_QUESTIONS : THEORY_FEEDBACK_QUESTIONS;

  for (let i = 1; i <= 5; i++) {
    const qElem = document.getElementById(`qText${i}`);
    if (qElem) {
      qElem.textContent = questions[i - 1];
    }
  }

  // Reset ratings & comments form
  resetModalRatings();

  // Show modal
  document.getElementById("feedbackModal").style.display = "flex";
}

// Close Feedback Modal
function closeFeedbackModal() {
  document.getElementById("feedbackModal").style.display = "none";
  activeSubject = null;
}

// 8. Submit Feedback for Specific Subject
async function submitSubjectFeedback() {
  if (!activeSubject) return;

  // Validate that ALL 5 questions have been rated
  const isAllRated = currentRatings.q1 > 0 && 
                     currentRatings.q2 > 0 && 
                     currentRatings.q3 > 0 && 
                     currentRatings.q4 > 0 && 
                     currentRatings.q5 > 0;

  const modalErrorMsg = document.getElementById("modalErrorMsg");

  if (!isAllRated) {
    modalErrorMsg.style.display = "block";
    modalErrorMsg.scrollIntoView({ behavior: "smooth", block: "nearest" });
    return;
  }

  modalErrorMsg.style.display = "none";

  const submitBtn = document.getElementById("submitModalFeedbackBtn");
  const submitBtnText = document.getElementById("submitModalBtnText");
  const submitBtnSpinner = document.getElementById("modalBtnSpinner");

  submitBtn.disabled = true;
  submitBtnText.textContent = "Submitting...";
  submitBtnSpinner.style.display = "inline-block";

  try {
    const feedbackDocId = `${currentUser.uid}_${activeSubject.id}_${activeCycleId}`;
    const commentsText = document.getElementById("modalComments").value.trim();

    const feedbackRecord = {
      feedbackId: feedbackDocId,
      studentId: currentUser.uid,
      studentName: currentStudent.name || "",
      prn: currentStudent.prn || "",
      class: currentStudent.class || currentStudent.year || "",
      year: currentStudent.year || currentStudent.class || "",
      division: currentStudent.division || "",
      batch: currentStudent.batch || "",
      username: currentStudent.username || "",

      subjectId: activeSubject.id,
      subjectStructureId: activeSubject.subjectStructureId || "",
      subjectName: activeSubject.displayName || activeSubject.subjectName,
      originalSubjectName: activeSubject.subjectName,
      subjectType: activeSubject.subjectType, // "Theory" or "Practical"
      type: activeSubject.type, // "theory" or "lab"

      facultyId: activeSubject.facultyId || "",
      facultyName: activeSubject.faculty || "Not Assigned",
      teacherId: activeSubject.teacherId || "",

      question1Rating: Number(currentRatings.q1),
      question2Rating: Number(currentRatings.q2),
      question3Rating: Number(currentRatings.q3),
      question4Rating: Number(currentRatings.q4),
      question5Rating: Number(currentRatings.q5),

      ratings: {
        q1: Number(currentRatings.q1),
        q2: Number(currentRatings.q2),
        q3: Number(currentRatings.q3),
        q4: Number(currentRatings.q4),
        q5: Number(currentRatings.q5)
      },
      comments: commentsText,
      registrationType: "self_registered",
      feedbackCycleId: activeCycleId,
      cycleName: activeCycleName,
      submittedAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    console.log("Saving feedback record to Firestore:", feedbackDocId, feedbackRecord);

    // Save to dedicated self_feedback collection AND feedback collection for compatibility
    await Promise.all([
      db.collection("self_feedback").doc(feedbackDocId).set(feedbackRecord, { merge: true }),
      db.collection("feedback").doc(feedbackDocId).set(feedbackRecord, { merge: true })
    ]);

    // Mark subject as submitted locally
    activeSubject.isSubmitted = true;
    submittedSubjectIds.add(activeSubject.id);
    submittedSubjectIds.add(feedbackDocId);
    if (activeSubject.subjectStructureId) submittedSubjectIds.add(activeSubject.subjectStructureId);
    if (activeSubject.subjectName) submittedSubjectIds.add(activeSubject.subjectName.trim().toLowerCase());

    const submittedSubjectName = activeSubject.displayName || activeSubject.subjectName;
    const submittedSubjectType = activeSubject.subjectType || "";

    // Close feedback modal
    closeFeedbackModal();

    // Re-render dashboard cards so this subject card immediately shows "✓ Feedback Submitted"
    renderDashboard();

    // Show success modal
    document.getElementById("successModalDesc").textContent = 
      `Thank you! Your feedback for ${submittedSubjectName} (${submittedSubjectType}) has been recorded.`;
    document.getElementById("successModal").style.display = "flex";

  } catch (err) {
    console.error("Error submitting subject feedback:", err);
    alert("Error submitting feedback: " + err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtnText.textContent = "Submit Feedback";
    submitBtnSpinner.style.display = "none";
  }
}

// Close Success Modal
function closeSuccessModal() {
  document.getElementById("successModal").style.display = "none";
}

// Handle Sign Out
function handleLogout() {
  if (confirm("Are you sure you want to sign out?")) {
    auth.signOut().then(() => {
      window.location.href = "index.html";
    });
  }
}

// Utility: HTML Escaping
function escapeHTML(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
