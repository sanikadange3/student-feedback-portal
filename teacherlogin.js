const form = document.getElementById("teacherLoginForm");
const errorBox = document.getElementById("teacherError");
const submitBtn = document.getElementById("teacherSubmit");
const spinner = submitBtn.querySelector(".spinner");

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = document.getElementById("teacherEmail").value.trim();
  const password = document.getElementById("teacherPassword").value;

  errorBox.style.display = "none";
  submitBtn.disabled = true;
  spinner.style.display = "inline-block";

  try {
    const cred = await auth.signInWithEmailAndPassword(email, password);

    if (cred.user.email !== "teacher@portal.com") {
      await auth.signOut();
      errorBox.textContent = "Not authorized as teacher.";
      errorBox.style.display = "block";
      return;
    }

    window.location.href = "teacherdashboard.html";

  } catch (err) {
    errorBox.textContent = "Invalid login credentials.";
    errorBox.style.display = "block";
  } finally {
    submitBtn.disabled = false;
    spinner.style.display = "none";
  }
});
