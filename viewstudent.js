// References

// DOM Elements
const yearFilter = document.getElementById('yearFilter');
const divisionFilter = document.getElementById('divisionFilter');
const batchFilter = document.getElementById('batchFilter');
const applyBtn = document.getElementById('applyFilters');
const studentsContainer = document.getElementById('studentsContainer');

// Check teacher login
auth.onAuthStateChanged(user => {
    if (!user || user.email !== "teacher@portal.com") {
        window.location.href = "teacherlogin.html";
    }
});

// Apply filters
applyBtn.addEventListener('click', () => {
    fetchStudents();
});

// Fetch students function
function fetchStudents() {
    studentsContainer.innerHTML = `<div class="loading">Loading students...</div>`;

    let query = db.collection('users');

    // Apply filters only if value exists
    if (yearFilter.value.trim() !== "") query = query.where('year', '==', yearFilter.value);
    if (divisionFilter.value.trim() !== "") query = query.where('division', '==', divisionFilter.value);
    if (batchFilter.value.trim() !== "") query = query.where('batch', '==', batchFilter.value);

    query.get()
    .then(snapshot => {
        const filteredDocs = [];
        snapshot.forEach(doc => {
            const s = doc.data();
            if (s.registrationType !== 'self_registered') {
                filteredDocs.push({ id: doc.id, ...s });
            }
        });

        if (filteredDocs.length === 0) {
            studentsContainer.innerHTML = `<div class="no-students">No teacher-registered students found.</div>`;
            return;
        }

        // Build table
        let tableHTML = `
            <table class="students-table">
                <thead>
                    <tr>
                        <th>PRN Number</th>
                        <th>Name</th>
                        <th>Year</th>
                        <th>Division</th>
                        <th>Batch</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
        `;

        filteredDocs.forEach(s => {
            tableHTML += `
                <tr id="student-${s.id}">
                    <td>${s.prn || '-'}</td>
                    <td>${s.name || '-'}</td>
                    <td>${s.year || '-'}</td>
                    <td>${s.division || '-'}</td>
                    <td>${s.batch || '-'}</td>
                    <td>
                        <button class="remove-btn" onclick="removeStudent('${s.id}')">Remove</button>
                    </td>
                </tr>
            `;
        });

        tableHTML += `</tbody></table>`;
        studentsContainer.innerHTML = tableHTML;
    })
    .catch(err => {
        console.error("Firestore error:", err);
        studentsContainer.innerHTML = `<div class="error">Error fetching students. Check console.</div>`;
    });
}

// Remove student
function removeStudent(studentId) {
    if (!confirm("Are you sure you want to remove this student?")) return;

    db.collection('users').doc(studentId).delete()
    .then(() => {
        const row = document.getElementById(`student-${studentId}`);
        row.style.transition = "opacity 0.5s";
        row.style.opacity = 0;
        setTimeout(() => row.remove(), 500);
    })
    .catch(err => {
        console.error(err);
        alert("Failed to remove student.");
    });
}
