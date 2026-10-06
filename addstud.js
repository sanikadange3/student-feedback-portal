const form = document.getElementById("addStudentForm");
const classYearSelect = document.getElementById("classYear");
const electiveSection = document.getElementById("electiveSection");
const electiveList = document.getElementById("electiveList");

// Handle Year Change to Show/Hide Electives
classYearSelect.addEventListener("change", async () => {
  const selectedYear = classYearSelect.value;
  
  if (selectedYear === "TY") {
    electiveSection.style.display = "block";
    await fetchTYSubjects();
  } else {
    electiveSection.style.display = "none";
    electiveList.innerHTML = "";
  }
});

// Fetch subjects for TY from subjectStructures
async function fetchTYSubjects() {
  electiveList.innerHTML = '<p style="font-size: 0.85rem; color: #64748b;">Loading subjects...</p>';
  try {
    const snapshot = await db.collection("subjectStructures")
      .where("year", "==", "TY")
      .get();
    
    if (snapshot.empty) {
      electiveList.innerHTML = '<p style="font-size: 0.85rem; color: #ef4444;">No subjects found for TY. Please add subjects first.</p>';
      return;
    }

    // Use a Set to store unique subject names
    const uniqueSubjects = new Set();
    snapshot.forEach(doc => {
      uniqueSubjects.add(doc.data().subjectName);
    });

    electiveList.innerHTML = "";
    Array.from(uniqueSubjects).sort().forEach(subjectName => {
      const id = `elective_${subjectName.replace(/\s+/g, '_')}`;
      const div = document.createElement("div");
      div.style.cssText = "display: flex; align-items: center; gap: 10px; padding: 6px 0; border-bottom: 1px solid #f1f5f9;";
      div.innerHTML = `
        <input type="checkbox" id="${id}" name="electives" value="${subjectName}" style="width: 16px; height: 16px; accent-color: #7c3aed; cursor: pointer;">
        <label for="${id}" style="font-size: 0.9rem; color: #1e293b; cursor: pointer; flex: 1;">${subjectName}</label>
      `;
      electiveList.appendChild(div);
    });
  } catch (err) {
    console.error("Error fetching TY subjects:", err);
    electiveList.innerHTML = '<p style="font-size: 0.85rem; color: #ef4444;">Error loading subjects.</p>';
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const submitBtn = document.getElementById("submitBtn");
  const submitText = submitBtn.querySelector(".btn-text");
  const spinner = submitBtn.querySelector(".spinner");

  const name = document.getElementById("studentName").value.trim();
  const year = document.getElementById("classYear").value.trim();
  const division = document.getElementById("division").value.trim();
  const prn = document.getElementById("studentprn").value.trim();
  const batch = document.getElementById("batch").value.trim();
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();

  // Collect selected electives if TY
  const electives = [];
  if (year === "TY") {
    const checked = electiveList.querySelectorAll("input[name='electives']:checked");
    checked.forEach(cb => electives.push(cb.value));
    
    if (electives.length === 0) {
      alert("Please select at least one subject for Third Year student.");
      return;
    }
  }

  if (!name || !prn || !year || !division || !batch || !username || !password) {
    alert("Please fill all fields");
    return;
  }

  const email = username + "@portal.com";
  
  submitBtn.disabled = true;
  submitText.style.display = "none";
  spinner.style.display = "block";

  try {
    // 1. Create login account
    const userCredential = await auth.createUserWithEmailAndPassword(email, password);
    const uid = userCredential.user.uid;

    // 2. Save student info with UID as document ID
    const studentData = {
      name,
      prn,
      username,
      year,
      class: year,
      division,
      batch,
      role: "student",
      registrationType: "teacher_registered",
      authUid: uid,
      active: true,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    // Add electives for TY students
    if (year === "TY") {
      studentData.electives = electives;
    }

    await db.collection("users").doc(uid).set(studentData);

    alert("Student added successfully!");
    form.reset();
    electiveSection.style.display = "none";
    electiveList.innerHTML = "";
  } catch (err) {
    alert(err.message);
  } finally {
    submitBtn.disabled = false;
    submitText.style.display = "block";
    spinner.style.display = "none";
  }
});
