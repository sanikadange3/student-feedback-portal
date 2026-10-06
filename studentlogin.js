// studentlogin.js

// Make sure firebase.js already has:
// const auth = firebase.auth();
// const db = firebase.firestore();

const loginForm = document.getElementById("loginForm");
const errorMessage = document.getElementById("errorMessage");
const submitBtn = document.getElementById("submitBtn");
const spinner = submitBtn.querySelector(".spinner");

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  // Get form values
  const studentId = document.getElementById("studentId").value.trim();
  const password = document.getElementById("password").value;

  // Reset error message
  errorMessage.style.display = "none";
  errorMessage.textContent = "";
  
  // Disable button and show spinner
  submitBtn.disabled = true;
  spinner.style.display = "inline-block";

  try {
    // Firebase login using email/password
    // If your students login with custom IDs, use `${studentId}@portal.com` or however you structured emails
    const email = studentId.includes("@") ? studentId : studentId.toLowerCase() + "@portal.com"; 
    const userCredential = await auth.signInWithEmailAndPassword(email, password);

    // Fetch user profile from Firestore to determine registration type
    const userDoc = await db.collection("users").doc(userCredential.user.uid).get();

    if (!userDoc.exists) {
      // If user document doesn't exist, try querying by username or PRN
      const prnSnap = await db.collection("users").where("prn", "==", studentId).get();
      if (!prnSnap.empty) {
        const student = prnSnap.docs[0].data();
        if (student.registrationType === "self_registered") {
          window.location.href = "selfstudentfeedback.html";
        } else {
          window.location.href = "studentfeedback.html";
        }
        return;
      }
      
      errorMessage.textContent = "Student profile not found in system.";
      errorMessage.style.display = "block";
      await auth.signOut();
      return;
    }

    const student = userDoc.data();
    console.log("Login success for role:", student.registrationType || "teacher_registered");

    // Redirect based on registrationType
    if (student.registrationType === "self_registered") {
      window.location.href = "selfstudentfeedback.html";
    } else {
      window.location.href = "studentfeedback.html";
    }

  } catch (error) {
    console.error("Login error:", error);

    // Show user-friendly error
    let message = "Login failed. Please check your credentials.";
    if (error.code === "auth/user-not-found") message = "Student ID not found. Contact admin.";
    if (error.code === "auth/wrong-password") message = "Incorrect password.";
    if (error.code === "auth/invalid-email") message = "Invalid student ID format.";

    errorMessage.textContent = message;
    errorMessage.style.display = "block";
    errorMessage.classList.add("shake");

    setTimeout(() => errorMessage.classList.remove("shake"), 500);
  } finally {
    // Re-enable button and hide spinner
    submitBtn.disabled = false;
    spinner.style.display = "none";
  }
});
