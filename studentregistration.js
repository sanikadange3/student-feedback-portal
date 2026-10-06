// studentregistration.js

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("registrationForm");
  const errorBanner = document.getElementById("errorBanner");
  const errorMessageText = document.getElementById("errorMessageText");
  const submitBtn = document.getElementById("submitBtn");
  const btnText = submitBtn.querySelector(".btn-text");
  const spinner = submitBtn.querySelector(".spinner");
  const successModal = document.getElementById("successModal");

  function showError(msg) {
    errorMessageText.textContent = msg;
    errorBanner.style.display = "flex";
    errorBanner.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function hideError() {
    errorBanner.style.display = "none";
    errorMessageText.textContent = "";
  }

  function setLoading(loading) {
    if (loading) {
      submitBtn.disabled = true;
      btnText.style.display = "none";
      spinner.style.display = "block";
    } else {
      submitBtn.disabled = false;
      btnText.style.display = "inline";
      spinner.style.display = "none";
    }
  }

  const studentClassSelect = document.getElementById("studentClass");
  const divisionSelect = document.getElementById("division");
  const electiveSection = document.getElementById("electiveSection");
  const electiveList = document.getElementById("electiveList");
  const electiveClassTitle = document.getElementById("electiveClassTitle");

  let availableElectives = [];

  function getYearCode(classStr) {
    if (!classStr) return "";
    const s = String(classStr).toUpperCase();
    if (s.includes("FY") || s.includes("FIRST")) return "FY";
    if (s.includes("SY") || s.includes("SECOND")) return "SY";
    if (s.includes("TY") || s.includes("THIRD")) return "TY";
    if (s.includes("BE") || s.includes("FINAL")) return "BE";
    return classStr.trim();
  }

  async function ensureAuthenticatedForReading() {
    if (auth.currentUser) return auth.currentUser;
    try {
      const cred = await auth.signInAnonymously();
      return cred.user;
    } catch (err1) {
      console.warn("Anonymous auth disabled/failed:", err1.code || err1.message);
      try {
        const guestCred = await auth.signInWithEmailAndPassword("guest.reader@portal.com", "guest123");
        return guestCred.user;
      } catch (err2) {
        try {
          const guestCreate = await auth.createUserWithEmailAndPassword("guest.reader@portal.com", "guest123");
          return guestCreate.user;
        } catch (err3) {
          console.warn("Guest reader auth fallback failed:", err3.message);
        }
      }
    }
    return null;
  }

  async function loadElectivesForClass() {
    const selectedClass = studentClassSelect ? studentClassSelect.value : "";
    const selectedDiv = divisionSelect ? divisionSelect.value : "";
    const targetYearCode = getYearCode(selectedClass);

    if (!selectedClass) {
      if (electiveSection) electiveSection.style.display = "none";
      if (electiveList) electiveList.innerHTML = "";
      availableElectives = [];
      return;
    }

    if (electiveClassTitle) electiveClassTitle.textContent = selectedClass;
    if (electiveSection) electiveSection.style.display = "block";
    if (electiveList) electiveList.innerHTML = '<p style="font-size: 0.85rem; color: #64748b;">Loading available subjects...</p>';

    try {
      // Ensure user is authenticated for Firestore queries
      await ensureAuthenticatedForReading();

      let structDocs = [];
      let subDocs = [];

      // Fetch subjectStructures
      try {
        const sSnap = await db.collection("subjectStructures").get();
        sSnap.forEach(d => structDocs.push({ id: d.id, ...d.data() }));
      } catch (err1) {
        try {
          const sSnap1 = await db.collection("subjectStructures").where("year", "==", selectedClass).get();
          sSnap1.forEach(d => structDocs.push({ id: d.id, ...d.data() }));
          if (targetYearCode !== selectedClass) {
            const sSnap2 = await db.collection("subjectStructures").where("year", "==", targetYearCode).get();
            sSnap2.forEach(d => structDocs.push({ id: d.id, ...d.data() }));
          }
        } catch (err2) {
          console.warn("Could not query subjectStructures:", err2);
        }
      }

      // Fetch subjects
      try {
        const subSnap = await db.collection("subjects").get();
        subSnap.forEach(d => subDocs.push({ id: d.id, ...d.data() }));
      } catch (err1) {
        try {
          const subSnap1 = await db.collection("subjects").where("year", "==", selectedClass).get();
          subSnap1.forEach(d => subDocs.push({ id: d.id, ...d.data() }));
          if (targetYearCode !== selectedClass) {
            const subSnap2 = await db.collection("subjects").where("year", "==", targetYearCode).get();
            subSnap2.forEach(d => subDocs.push({ id: d.id, ...d.data() }));
          }
        } catch (err2) {
          console.warn("Could not query subjects:", err2);
        }
      }

      const isElectiveMatch = (subName, dataObj) => {
        if (!dataObj) return false;
        if (dataObj.isElective === true || dataObj.elective === true || dataObj.isOptional === true) return true;
        if (!subName) return false;
        const nameLower = subName.toLowerCase();
        return nameLower.includes("pe-") || nameLower.includes("pe ") || nameLower.includes("pe1") ||
          nameLower.includes("pe2") || nameLower.includes("pe-i") || nameLower.includes("pe-ii") ||
          nameLower.includes("elective") || nameLower.includes("open elective") || nameLower.includes("oe-");
      };

      const isYearMatch = (docYearStr) => {
        if (!docYearStr) return true;
        const dYear = String(docYearStr).trim();
        const dCode = getYearCode(dYear);
        return dYear === selectedClass ||
          dCode === targetYearCode ||
          (targetYearCode === "TY" && (dCode === "TY" || dYear.toUpperCase().includes("TY") || dYear.toUpperCase().includes("THIRD"))) ||
          selectedClass.toLowerCase().includes(dYear.toLowerCase()) ||
          dYear.toLowerCase().includes(selectedClass.toLowerCase());
      };

      const allFetched = [];


      structDocs.forEach(d => {
        if (!isYearMatch(d.year)) return;
        if (selectedDiv && d.divisions && Array.isArray(d.divisions) && d.divisions.length > 0 && !d.divisions.includes(selectedDiv)) return;

        const subName = d.subjectName ? d.subjectName.trim() : "";
        if (!subName) return;
        const isElec = isElectiveMatch(subName, d);
        allFetched.push({ id: d.subjectStructureId || subName, name: subName, isElective: isElec });
      });

      subDocs.forEach(d => {
        if (!isYearMatch(d.year)) return;
        if (selectedDiv && d.division && d.division !== selectedDiv) return;

        const rawSub = d.originalSubjectName || d.subject || d.subjectName || "";
        const subName = String(rawSub).replace(" (Theory)", "").replace(" (Lab)", "").trim();
        if (!subName) return;
        const isElec = isElectiveMatch(subName, d);
        if (!allFetched.some(item => item.name.toLowerCase() === subName.toLowerCase())) {
          allFetched.push({ id: d.subjectStructureId || d.subjectId || subName, name: subName, isElective: isElec });
        }
      });

      let electiveCandidates = [];
      if (targetYearCode === "TY" || selectedClass === "TY" || selectedClass.toUpperCase().includes("TY")) {
        // Show ALL TY subjects for student selection
        electiveCandidates = allFetched;
      } else if (allFetched.some(item => item.isElective)) {
        electiveCandidates = allFetched.filter(item => item && item.isElective);
      } else {
        electiveCandidates = allFetched;
      }

      // Deduplicate safely by subject name
      const electiveMap = new Map();
      electiveCandidates.forEach(item => {
        const nameStr = String(item && item.name ? item.name : "").trim();
        if (nameStr && !electiveMap.has(nameStr.toLowerCase())) {
          electiveMap.set(nameStr.toLowerCase(), { id: item.id || nameStr, name: nameStr });
        }
      });

      availableElectives = Array.from(electiveMap.values());

      if (availableElectives.length === 0) {
        if (electiveSection) electiveSection.style.display = "block";
        if (electiveList) electiveList.innerHTML = '<p style="font-size: 0.85rem; color: #64748b;">No subjects configured yet for TY. Proceed with registration or contact teacher.</p>';
        return;
      }

      if (electiveSection) electiveSection.style.display = "block";
      if (electiveList) {
        electiveList.innerHTML = "";

        availableElectives.forEach((elec, index) => {
          const elecName = String(elec && elec.name ? elec.name : "Subject");
          const elecId = elec && elec.id ? elec.id : `elec_${index}`;
          const checkboxId = `elec_${index}_${elecId}`;
          const div = document.createElement("div");
          div.style.cssText = "display: flex; align-items: center; gap: 10px; padding: 8px 12px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; transition: all 0.2s ease;";
          div.innerHTML = `
            <input type="checkbox" id="${checkboxId}" name="selectedElectives" value="${escapeHTML(elecId)}" data-name="${escapeHTML(elecName)}" style="width: 18px; height: 18px; accent-color: #7c3aed; cursor: pointer;">
            <label for="${checkboxId}" style="font-size: 0.925rem; font-weight: 500; color: #1e293b; cursor: pointer; flex: 1; user-select: none;">${escapeHTML(elecName)}</label>
          `;
          electiveList.appendChild(div);
        });
      }

    } catch (err) {
      console.error("Error fetching electives:", err);
      if (electiveList) electiveList.innerHTML = '<p style="font-size: 0.85rem; color: #ef4444;">Error loading subjects: ' + escapeHTML(err.message) + '</p>';
    }
  }

  function escapeHTML(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  if (studentClassSelect) studentClassSelect.addEventListener("change", loadElectivesForClass);
  if (divisionSelect) divisionSelect.addEventListener("change", loadElectivesForClass);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideError();

    // 1. Extract values
    const fullName = document.getElementById("fullName").value.trim();
    const studentClass = document.getElementById("studentClass").value.trim();
    const division = document.getElementById("division").value.trim();
    const batch = document.getElementById("batch").value.trim();
    const prnNumber = document.getElementById("prnNumber").value.trim();
    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;
    const confirmPassword = document.getElementById("confirmPassword").value;

    // 2. Validate required fields
    if (!fullName || !studentClass || !division || !batch || !prnNumber || !username || !password || !confirmPassword) {
      showError("All fields are required. Please fill in every field.");
      return;
    }

    // 3. Password match validation
    if (password !== confirmPassword) {
      showError("Password and Confirm Password do not match.");
      return;
    }

    // 4. Password minimum length check
    if (password.length < 6) {
      showError("Password must be at least 6 characters long.");
      return;
    }

    // 5. Username format validation (alphanumeric and underscores)
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      showError("Username can only contain letters, numbers, and underscores.");
      return;
    }

    // 6. Elective selection validation
    const selectedElectiveIds = [];
    const selectedElectiveNames = [];

    if (electiveSection && electiveSection.style.display !== "none" && availableElectives.length > 0) {
      const checkedInputs = electiveList.querySelectorAll("input[name='selectedElectives']:checked");
      checkedInputs.forEach(cb => {
        selectedElectiveIds.push(cb.value);
        if (cb.dataset.name) selectedElectiveNames.push(cb.dataset.name);
      });

      if (selectedElectiveIds.length === 0) {
        showError(`Please select your required elective subject(s) for ${studentClass} before completing registration.`);
        return;
      }
    }

    setLoading(true);

    let userCredential = null;

    try {
      // Step 1: Create Firebase Authentication account FIRST
      const email = username.toLowerCase() + "@portal.com";

      try {
        userCredential = await auth.createUserWithEmailAndPassword(email, password);
      } catch (authErr) {
        console.error("Auth creation error:", authErr);
        if (authErr.code === "auth/email-already-in-use") {
          showError("This Username is already taken. Please choose another username.");
        } else if (authErr.code === "auth/weak-password") {
          showError("Password is too weak. Please use a stronger password.");
        } else {
          showError(authErr.message || "Failed to create account. Please try again.");
        }
        setLoading(false);
        return;
      }

      const uid = userCredential.user.uid;

      // Step 2: Perform PRN Uniqueness check in Firestore
      const prnQuery = await db.collection("users").where("prn", "==", prnNumber).get();
      if (!prnQuery.empty) {
        await userCredential.user.delete();
        showError("A student with this PRN Number is already registered.");
        setLoading(false);
        return;
      }

      // Step 3: Save student profile into Firestore (WITHOUT storing raw password)
      const studentData = {
        name: fullName,
        class: studentClass,
        year: studentClass, // mapped for legacy query compatibility
        division: division,
        batch: batch,
        prn: prnNumber,
        username: username,
        role: "student",
        registrationType: "self_registered",
        authUid: uid,
        active: true,
        selectedElectives: selectedElectiveIds,
        selectedElectiveNames: selectedElectiveNames,
        electives: selectedElectiveNames,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };

      await db.collection("users").doc(uid).set(studentData);

      // Step 4: Sign out temporary session so student logs in cleanly through login page
      await auth.signOut();

      // Step 5: Show success modal
      successModal.style.display = "flex";

    } catch (err) {
      console.error("Registration error:", err);

      if (userCredential && userCredential.user) {
        try {
          await userCredential.user.delete();
        } catch (cleanupErr) {
          console.error("Cleanup error:", cleanupErr);
        }
      }

      showError("An unexpected error occurred during registration: " + err.message);
    } finally {
      setLoading(false);
    }
  });
});

function goToLogin() {
  window.location.href = "studentlogin.html";
}
