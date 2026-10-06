// viewselfstudents.js

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
    } else {
        fetchSelfStudents();
    }
});

// Apply filters
applyBtn.addEventListener('click', () => {
    fetchSelfStudents();
});

// Fetch self-registered students function
async function fetchSelfStudents() {
    studentsContainer.innerHTML = `<div class="loading">Loading self-registered students...</div>`;

    try {
        const snapshot = await db.collection('users').get();

        if (snapshot.empty) {
            studentsContainer.innerHTML = `<div class="no-students">No self-registered students found.</div>`;
            return;
        }

        const filteredDocs = [];
        snapshot.forEach(doc => {
            const s = doc.data();

            // Strict filter: registrationType MUST be self_registered
            if (s.registrationType !== 'self_registered') return;

            // Apply dropdown filters if selected
            if (yearFilter.value.trim() !== "" && s.year !== yearFilter.value) return;
            if (divisionFilter.value.trim() !== "" && s.division !== divisionFilter.value) return;
            if (batchFilter.value.trim() !== "" && s.batch !== batchFilter.value) return;

            filteredDocs.push({ id: doc.id, ...s });
        });

        if (filteredDocs.length === 0) {
            studentsContainer.innerHTML = `<div class="no-students">No self-registered students match the selected filters.</div>`;
            return;
        }

        // Sort by PRN or Name
        filteredDocs.sort((a, b) => (a.prn || a.name || '').localeCompare(b.prn || b.name || ''));

        // Build table
        let tableHTML = `
            <table class="students-table">
                <thead>
                    <tr>
                        <th>PRN Number</th>
                        <th>Name</th>
                        <th>Username / Email</th>
                        <th>Class (Year)</th>
                        <th>Division</th>
                        <th>Batch</th>
                        <th>Type</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
        `;

        filteredDocs.forEach(s => {
            const username = s.email || s.username || s.prn || '-';
            tableHTML += `
                <tr id="student-${s.id}">
                    <td><strong>${s.prn || '-'}</strong></td>
                    <td>${s.name || '-'}</td>
                    <td>${username}</td>
                    <td>${s.year || '-'}</td>
                    <td>${s.division || '-'}</td>
                    <td>${s.batch || '-'}</td>
                    <td><span class="badge-self">Self Registered</span></td>
                    <td>
                        <button class="remove-btn" onclick="removeSelfStudent('${s.id}')">Remove</button>
                    </td>
                </tr>
            `;
        });

        tableHTML += `</tbody></table>`;
        studentsContainer.innerHTML = tableHTML;

    } catch (err) {
        console.error("Error fetching self-registered students:", err);
        studentsContainer.innerHTML = `<div class="error">Error fetching self-registered students: ${err.message}</div>`;
    }
}

// Remove self-registered student
async function removeSelfStudent(studentId) {
    if (!confirm("Are you sure you want to remove this self-registered student record?")) return;

    try {
        await db.collection('users').doc(studentId).delete();
        const row = document.getElementById(`student-${studentId}`);
        if (row) {
            row.style.transition = "opacity 0.5s";
            row.style.opacity = 0;
            setTimeout(() => row.remove(), 500);
        }
    } catch (err) {
        console.error("Error deleting student:", err);
        alert("Failed to remove student: " + err.message);
    }
}
