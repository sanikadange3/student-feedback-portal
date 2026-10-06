// viewselffeedback.js

// ================= DOM ELEMENTS =================
const cycleFilter = document.getElementById('cycleFilter');
const yearFilter = document.getElementById('yearFilter');
const divisionFilter = document.getElementById('divisionFilter');
const batchFilter = document.getElementById('batchFilter');
const subjectFilter = document.getElementById('subjectFilter');
const viewFeedbackBtn = document.getElementById('viewFeedbackBtn');

const resultsSection = document.getElementById('resultsSection');
const loadingSpinner = document.getElementById('loadingSpinner');
const noDataMessage = document.getElementById('noDataMessage');
const tableView = document.getElementById('tableView');
const cardView = document.getElementById('cardView');
const tableBody = document.getElementById('tableBody');
const cardGrid = document.getElementById('cardGrid');

// ================= GLOBAL =================
let currentFeedbackData = [];
let currentView = 'table';

// ================= AUTH CHECK =================
auth.onAuthStateChanged(user => {
    if (!user || user.email !== "teacher@portal.com") {
        window.location.href = "teacherlogin.html";
    } else {
        initCycleFilter();
    }
});

// ================= CYCLE FILTER INIT =================
async function initCycleFilter() {
    if (!cycleFilter) return;
    try {
        let activeCycleId = "cycle_1";
        const cycleDoc = await db.collection("systemSettings").doc("selfFeedbackCycle").get();
        if (cycleDoc.exists && cycleDoc.data().currentCycleId) {
            activeCycleId = cycleDoc.data().currentCycleId;
        }

        const existingCyclesSet = new Set();
        existingCyclesSet.add(activeCycleId);

        const [selfSnap, genSnap] = await Promise.all([
            db.collection("self_feedback").get(),
            db.collection("feedback").get()
        ]);

        selfSnap.forEach(d => {
            const cId = d.data().feedbackCycleId || 'cycle_1';
            existingCyclesSet.add(cId);
        });

        genSnap.forEach(d => {
            const f = d.data();
            if (f.registrationType === 'self_registered') {
                const cId = f.feedbackCycleId || 'cycle_1';
                existingCyclesSet.add(cId);
            }
        });

        const cyclesList = Array.from(existingCyclesSet).map(cId => {
            const num = parseInt(cId.replace('cycle_', ''), 10) || 1;
            return {
                id: cId,
                number: num,
                name: `Feedback Cycle ${num}${cId === activeCycleId ? ' (Active)' : ''}`
            };
        });

        cyclesList.sort((a, b) => b.number - a.number);

        const prevSelected = cycleFilter.value;
        cycleFilter.innerHTML = '<option value="all">All Cycles</option>';

        cyclesList.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = c.name;
            cycleFilter.appendChild(opt);
        });

        if (prevSelected && Array.from(cycleFilter.options).some(o => o.value === prevSelected)) {
            cycleFilter.value = prevSelected;
        } else {
            cycleFilter.value = activeCycleId;
        }
    } catch (err) {
        console.error("Error initializing cycle filter:", err);
    }
}

// Attach cycleFilter change listener
if (cycleFilter) {
    cycleFilter.addEventListener('change', () => {
        if (resultsSection.style.display !== 'none') {
            viewSelfFeedback();
        }
    });
}

// ================= START NEW FEEDBACK CYCLE =================
async function startNewSelfFeedbackCycle() {
    const confirmMsg = 
        "Are you sure you want to start a NEW FEEDBACK CYCLE for all self-registered students?\n\n" +
        "• All self-registered students will be able to submit feedback again.\n" +
        "• Previous feedback records will remain saved for historical reports.\n" +
        "• New submissions will be identified separately under the new cycle.\n" +
        "• Teacher-registered student feedback will NOT be affected.\n\n" +
        "Click OK to confirm and start the new cycle.";

    if (!confirm(confirmMsg)) return;

    try {
        const cycleRef = db.collection('systemSettings').doc('selfFeedbackCycle');
        const cycleDoc = await cycleRef.get();

        let currentNum = 1;
        if (cycleDoc.exists && cycleDoc.data().cycleNumber) {
            currentNum = cycleDoc.data().cycleNumber;
        }

        const newNum = currentNum + 1;
        const newCycleId = `cycle_${newNum}`;
        const newCycleName = `Feedback Cycle ${newNum}`;

        await cycleRef.set({
            currentCycleId: newCycleId,
            cycleNumber: newNum,
            cycleName: newCycleName,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        alert(`🚀 Success! ${newCycleName} has been started.\n\nAll self-registered students can now submit fresh feedback for this cycle.`);

        await initCycleFilter();
        if (cycleFilter) cycleFilter.value = newCycleId;
        viewSelfFeedback();

    } catch (err) {
        console.error("Error starting new feedback cycle:", err);
        alert("Failed to start new feedback cycle: " + err.message);
    }
}

// ================= DELETE FEEDBACK CYCLE =================
async function deleteSelfFeedbackCycle() {
    const selectedCycleId = cycleFilter ? cycleFilter.value : '';

    if (!selectedCycleId || selectedCycleId === 'all') {
        alert("Please select a specific Feedback Cycle from the dropdown to delete.");
        return;
    }

    const selectedOptText = cycleFilter.options[cycleFilter.selectedIndex]?.text || selectedCycleId;

    const confirmMsg = 
        `Are you sure you want to DELETE all feedback data for ${selectedOptText}?\n\n` +
        "• All self-registered student feedback records for this cycle will be permanently deleted.\n" +
        "• Student registration profiles and user accounts will NOT be deleted.\n" +
        "• Other feedback cycles and teacher-registered feedback will NOT be affected.\n" +
        "• This cycle will be permanently removed from all cycle dropdowns and reports.\n\n" +
        "This action cannot be undone. Click OK to proceed.";

    if (!confirm(confirmMsg)) return;

    try {
        const [selfSnap, genSnap, reportSnap] = await Promise.all([
            db.collection('self_feedback').get(),
            db.collection('feedback').get(),
            db.collection('savedReports').get()
        ]);

        const deletePromises = [];

        selfSnap.forEach(doc => {
            const d = doc.data();
            const docCycle = d.feedbackCycleId || 'cycle_1';
            if (docCycle === selectedCycleId) {
                deletePromises.push(db.collection('self_feedback').doc(doc.id).delete());
            }
        });

        genSnap.forEach(doc => {
            const d = doc.data();
            if (d.registrationType === 'self_registered') {
                const docCycle = d.feedbackCycleId || 'cycle_1';
                if (docCycle === selectedCycleId) {
                    deletePromises.push(db.collection('feedback').doc(doc.id).delete());
                }
            }
        });

        reportSnap.forEach(doc => {
            const d = doc.data();
            if (d.feedbackCycleId === selectedCycleId) {
                deletePromises.push(db.collection('savedReports').doc(doc.id).delete());
            }
        });

        await Promise.all(deletePromises);

        // Update active cycle fallback if current active cycle was deleted
        const cycleRef = db.collection('systemSettings').doc('selfFeedbackCycle');
        const cycleDoc = await cycleRef.get();
        if (cycleDoc.exists) {
            const cData = cycleDoc.data();
            if (cData.currentCycleId === selectedCycleId) {
                const remainingSelfSnap = await db.collection('self_feedback').get();
                let maxNum = 1;
                remainingSelfSnap.forEach(d => {
                    const cId = d.data().feedbackCycleId;
                    if (cId && cId.startsWith('cycle_')) {
                        const num = parseInt(cId.replace('cycle_', ''), 10);
                        if (num > maxNum) maxNum = num;
                    }
                });
                const fallbackCycleId = `cycle_${maxNum}`;
                await cycleRef.set({
                    currentCycleId: fallbackCycleId,
                    cycleNumber: maxNum,
                    cycleName: `Feedback Cycle ${maxNum}`,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            }
        }

        alert(`🗑️ ${selectedOptText} deleted successfully.`);

        await initCycleFilter();
        if (resultsSection.style.display !== 'none') {
            viewSelfFeedback();
        }

    } catch (err) {
        console.error("Error deleting feedback cycle:", err);
        alert("Failed to delete feedback cycle: " + err.message);
    }
}

// ================= LOAD SUBJECTS =================
yearFilter.addEventListener('change', loadSubjects);
divisionFilter.addEventListener('change', loadSubjects);
batchFilter.addEventListener('change', loadSubjects);

async function loadSubjects() {
    subjectFilter.innerHTML = '<option value="">Select Subject</option>';

    if (!yearFilter.value || !divisionFilter.value || !batchFilter.value) return;

    try {
        const structureSnapshot = await db.collection('subjectStructures')
            .where('year', '==', yearFilter.value)
            .get();

        if (!structureSnapshot.empty) {
            let subjectsQuery = db.collection('subjects')
                .where('year', '==', yearFilter.value)
                .where('division', '==', divisionFilter.value);

            if (batchFilter.value !== 'all') {
                subjectsQuery = subjectsQuery.where('batch', '==', batchFilter.value);
            }

            const subjectsSnapshot = await subjectsQuery.get();

            const subjectIdMap = {};
            subjectsSnapshot.forEach(doc => {
                const d = doc.data();
                const name = d.originalSubjectName || d.subject;
                if (!subjectIdMap[name]) subjectIdMap[name] = { theory: [], lab: [] };

                const type = d.type || 'theory';
                if (type === 'theory') {
                    subjectIdMap[name].theory.push(doc.id);
                } else if (type === 'lab' || type === 'practical') {
                    subjectIdMap[name].lab.push(doc.id);
                }
            });

            structureSnapshot.forEach(doc => {
                const d = doc.data();
                if (d.divisions && d.divisions.includes(divisionFilter.value)) {
                    const facultyObj = d.faculty || {};
                    const divFaculty = facultyObj[divisionFilter.value] || {};
                    const subjectName = d.subjectName;

                    const opt = document.createElement('option');
                    opt.value = doc.id;
                    opt.dataset.subjectName = subjectName;

                    if (d.type === 'both') {
                        const faculty = divFaculty.theoryFaculty || 'Not Assigned';
                        opt.textContent = `${subjectName} - ${faculty}`;
                        opt.dataset.type = 'Both';
                        const combinedIds = [
                            ...(subjectIdMap[subjectName]?.theory || []),
                            ...(subjectIdMap[subjectName]?.lab || [])
                        ];
                        opt.dataset.relatedIds = JSON.stringify(combinedIds);
                    } else {
                        const faculty = d.type === 'theory'
                            ? (divFaculty.theoryFaculty || 'Not Assigned')
                            : (divFaculty.practicalFaculty || 'Not Assigned');
                        opt.textContent = `${subjectName} - ${faculty}`;
                        opt.dataset.type = d.type === 'theory' ? 'Theory' : 'Lab';
                        const relatedIds = d.type === 'theory'
                            ? (subjectIdMap[subjectName]?.theory || [])
                            : (subjectIdMap[subjectName]?.lab || []);
                        opt.dataset.relatedIds = JSON.stringify(relatedIds);
                    }
                    subjectFilter.appendChild(opt);
                }
            });
        }
    } catch (error) {
        console.error('Error loading subjects:', error);
    }
}

// ================= VIEW SELF FEEDBACK =================
viewFeedbackBtn.addEventListener('click', viewSelfFeedback);

async function viewSelfFeedback() {
    loadingSpinner.style.display = 'flex';
    resultsSection.style.display = 'none';
    noDataMessage.style.display = 'none';

    try {
        // Fetch all users to filter self-registered students
        const userSnap = await db.collection('users').get();
        const selfStudents = {};

        userSnap.forEach(d => {
            const data = d.data();
            if (data.registrationType === 'self_registered') {
                selfStudents[d.id] = data;
            }
        });

        const subjectSnap = await db.collection('subjects').get();
        const structureSnap = await db.collection('subjectStructures').get();

        const subjects = {};
        subjectSnap.forEach(d => subjects[d.id] = d.data());

        structureSnap.forEach(doc => {
            const d = doc.data();
            subjects[doc.id] = {
                subject: d.subjectName,
                faculty: d.faculty,
                type: d.type,
                year: d.year,
                divisions: d.divisions
            };
        });

        const finalData = [];

        let targetSubjectIds = [];
        if (subjectFilter.value) {
            const selectedOpt = subjectFilter.selectedOptions[0];
            try {
                targetSubjectIds = JSON.parse(selectedOpt.dataset.relatedIds || '[]');
            } catch (e) {
                targetSubjectIds = [subjectFilter.value.split('_')[0]];
            }
        }

        // Query both self_feedback and feedback collections to capture all self-registered submissions
        const [selfFeedbackSnap, generalFeedbackSnap] = await Promise.all([
            db.collection('self_feedback').get(),
            db.collection('feedback').get()
        ]);

        const feedbackMap = {};

        const processDoc = (doc) => {
            const f = doc.data();

            // Self-registered filter: MUST be from a self-registered student or have registrationType === 'self_registered'
            const isSelfReg = f.registrationType === 'self_registered' || (selfStudents[f.studentId] !== undefined);
            if (!isSelfReg) return;

            // Cycle filter
            const selectedCycle = cycleFilter ? cycleFilter.value : 'all';
            const docCycle = f.feedbackCycleId || 'cycle_1';
            if (selectedCycle !== 'all' && docCycle !== selectedCycle) return;

            const student = selfStudents[f.studentId] || {
                name: f.studentName || 'Self Student',
                prn: f.studentPrn || f.prn || '-',
                year: f.year || f.class,
                division: f.division,
                batch: f.batch
            };
            const rawSubject = subjects[f.subjectId] || { subject: f.subjectName || f.originalSubjectName || 'Subject', type: f.type || 'theory' };

            // Global filters
            if (yearFilter.value && student.year !== yearFilter.value && student.class !== yearFilter.value) return;
            if (divisionFilter.value && student.division !== divisionFilter.value) return;
            if (batchFilter.value && batchFilter.value !== 'all' && student.batch !== batchFilter.value) return;

            // Subject filter
            if (targetSubjectIds.length > 0 && !targetSubjectIds.includes(f.subjectId)) return;

            const baseName = rawSubject.originalSubjectName || (rawSubject.subject || f.subjectName || '').replace(' (Theory)', '').replace(' (Lab)', '');
            const key = `${f.studentId || f.studentPrn || doc.id}_${baseName}_${docCycle}`;

            if (!feedbackMap[key]) {
                feedbackMap[key] = {
                    student,
                    subjectName: baseName,
                    feedbackData: [],
                    componentTypes: new Set(),
                    cycleId: docCycle
                };
            }

            feedbackMap[key].feedbackData.push(f);
            feedbackMap[key].componentTypes.add(rawSubject.type || f.type || 'theory');
        };

        selfFeedbackSnap.forEach(processDoc);
        generalFeedbackSnap.forEach(processDoc);

        // Process each student-subject combination
        Object.values(feedbackMap).forEach(({ student, subjectName, feedbackData, componentTypes }) => {
            let unitsCompleted = 0;
            let attendanceFilled = 'No';
            let comment = '';
            let practicalsCompleted = 0;
            let totalPracticals = 10;
            let practicalProgress = 0;

            let ratingSum = 0;
            let ratingCount = 0;
            let qRatings = { q1: 0, q2: 0, q3: 0, q4: 0, q5: 0 };

            feedbackData.forEach(f => {
                const sub = subjects[f.subjectId];
                const type = (sub ? sub.type : (f.type || 'theory')).toLowerCase();

                // Rating processing
                let q1 = f.question1Rating || (f.ratings ? f.ratings.q1 : 0) || 0;
                let q2 = f.question2Rating || (f.ratings ? f.ratings.q2 : 0) || 0;
                let q3 = f.question3Rating || (f.ratings ? f.ratings.q3 : 0) || 0;
                let q4 = f.question4Rating || (f.ratings ? f.ratings.q4 : 0) || 0;
                let q5 = f.question5Rating || (f.ratings ? f.ratings.q5 : 0) || 0;

                const validRatings = [q1, q2, q3, q4, q5].filter(r => r > 0);
                if (validRatings.length > 0) {
                    const itemAvg = validRatings.reduce((a, b) => a + b, 0) / validRatings.length;
                    ratingSum += itemAvg;
                    ratingCount++;
                    qRatings = { q1, q2, q3, q4, q5 };
                } else if (f.rating) {
                    ratingSum += Number(f.rating);
                    ratingCount++;
                }

                if (type === 'lab' || type === 'practical') {
                    if (f.practicalsCompleted !== undefined) {
                        practicalsCompleted = f.practicalsCompleted;
                        totalPracticals = f.totalPracticals || 10;
                        practicalProgress = f.practicalProgress || 0;
                        if (f.labAttendanceFilled === 'Yes' || f.labAttendanceFilled === true) attendanceFilled = 'Yes';
                    }
                    if (f.comments || f.comment) comment += (comment ? ' | ' : '') + 'Lab: ' + (f.comments || f.comment);
                } else {
                    if (f.unitsCompleted !== undefined) {
                        unitsCompleted = f.unitsCompleted;
                        if (f.theoryAttendanceFilled === 'Yes' || f.theoryAttendanceFilled === true) attendanceFilled = 'Yes';
                    }
                    if (f.comments || f.comment) comment += (comment ? ' | ' : '') + 'Theory: ' + (f.comments || f.comment);
                }
            });

            let displayType = 'Theory';
            if (componentTypes.has('both') || (componentTypes.has('theory') && (componentTypes.has('lab') || componentTypes.has('practical')))) {
                displayType = 'Both';
            } else if (componentTypes.has('lab') || componentTypes.has('practical')) {
                displayType = 'Lab';
            }

            const structDoc = Array.from(structureSnap.docs).find(d => d.data().subjectName === subjectName);
            const struct = structDoc ? structDoc.data() : null;
            const divFaculty = (struct && struct.faculty) ? (struct.faculty[divisionFilter.value] || {}) : {};

            let facultyName = 'Not Assigned';
            if (displayType === 'Both' || displayType === 'Theory') {
                facultyName = divFaculty.theoryFaculty || (typeof divFaculty === 'string' ? divFaculty : 'Not Assigned');
            } else {
                facultyName = divFaculty.practicalFaculty || (typeof divFaculty === 'string' ? divFaculty : 'Not Assigned');
            }

            const calculatedAvgRating = ratingCount > 0 ? (ratingSum / ratingCount).toFixed(1) : 'N/A';

            finalData.push({
                studentId: student.id || student.uid || student.authUid || '',
                studentName: student.name || 'Self Student',
                prn: student.prn || student.studentPrn || '-',
                subjectName: subjectName,
                faculty: facultyName,
                type: displayType,
                avgRating: calculatedAvgRating,
                qRatings: qRatings,
                unitsCompleted: unitsCompleted,
                practicalsCompleted: practicalsCompleted,
                totalPracticals: totalPracticals,
                practicalProgress: practicalProgress,
                attendanceFilled: attendanceFilled,
                feedback: comment || 'No comments'
            });
        });

        loadingSpinner.style.display = 'none';

        if (!finalData.length) {
            noDataMessage.style.display = 'flex';
            return;
        }

        const totalResp = finalData.length;
        let sumRating = 0;
        let ratedCount = 0;

        finalData.forEach(item => {
            if (item.avgRating !== 'N/A') {
                sumRating += Number(item.avgRating);
                ratedCount++;
            }
        });

        const overallAvgRating = ratedCount > 0 ? (sumRating / ratedCount).toFixed(1) + ' / 5 ⭐' : 'N/A';

        document.getElementById('totalResponses').textContent = totalResp;
        if (document.getElementById('averageRanking')) {
            document.getElementById('averageRanking').textContent = overallAvgRating;
        }

        currentFeedbackData = finalData;
        renderData();
        resultsSection.style.display = 'block';

    } catch (err) {
        console.error('Error loading self-registered feedback:', err);
        loadingSpinner.style.display = 'none';
        noDataMessage.style.display = 'flex';
    }
}

// ================= RENDER DATA =================
function renderData() {
    if (currentView === 'table') {
        renderTable();
    } else {
        renderCards();
    }
}

function renderRatingsDetail(row) {
    if (row.avgRating === 'N/A' || !row.avgRating) return '<span style="color:#94a3b8; font-weight:500;">No Rating</span>';
    const num = Number(row.avgRating);
    const fullStars = Math.floor(num);
    let starsStr = '⭐'.repeat(Math.min(5, fullStars));

    let qHTML = '';
    const q = row.qRatings || {};
    if (q.q1 || q.q2 || q.q3 || q.q4 || q.q5) {
        qHTML = `
            <div style="margin-top: 4px; font-size: 0.78rem; color: #475569; display: flex; flex-wrap: wrap; gap: 4px;">
                <span style="background:#f1f5f9; padding: 2px 5px; border-radius: 4px;">Q1: <strong>${q.q1 || '-'}</strong>/5</span>
                <span style="background:#f1f5f9; padding: 2px 5px; border-radius: 4px;">Q2: <strong>${q.q2 || '-'}</strong>/5</span>
                <span style="background:#f1f5f9; padding: 2px 5px; border-radius: 4px;">Q3: <strong>${q.q3 || '-'}</strong>/5</span>
                <span style="background:#f1f5f9; padding: 2px 5px; border-radius: 4px;">Q4: <strong>${q.q4 || '-'}</strong>/5</span>
                <span style="background:#f1f5f9; padding: 2px 5px; border-radius: 4px;">Q5: <strong>${q.q5 || '-'}</strong>/5</span>
            </div>
        `;
    }

    return `
        <div>
            <div style="display:inline-flex; align-items:center; gap:6px;">
                <span style="font-size:0.9rem;">${starsStr}</span>
                <span style="font-weight:700; color:#d97706; font-size: 0.9rem;">${num} / 5</span>
            </div>
            ${qHTML}
        </div>
    `;
}

function renderTable() {
    tableBody.innerHTML = '';
    currentFeedbackData.forEach((row, index) => {
        const tr = document.createElement('tr');

        tr.innerHTML = `
            <td>${index + 1}</td>
            <td><strong>${row.studentName}</strong><br><small style="color:#64748b">PRN: ${row.prn}</small></td>
            <td><strong>${row.subjectName}</strong></td>
            <td><span class="type-badge ${row.type.toLowerCase()}">${row.type}</span></td>
            <td>${row.faculty}</td>
            <td>${renderRatingsDetail(row)}</td>
            <td>${row.feedback}</td>
        `;
        tableBody.appendChild(tr);
    });
}

function renderCards() {
    cardGrid.innerHTML = '';
    currentFeedbackData.forEach(row => {
        const card = document.createElement('div');
        card.className = 'feedback-card';

        card.innerHTML = `
            <div class="card-title-row" style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 0.5rem;">
                <h4 style="margin:0; font-size:1.1rem; color:#1e293b;">${row.subjectName}</h4>
                <span class="type-badge ${row.type.toLowerCase()}">${row.type}</span>
            </div>
            <p><strong>Student:</strong> ${row.studentName} (${row.prn})</p>
            <p><strong>Faculty:</strong> ${row.faculty}</p>
            <div style="margin: 0.5rem 0;"><strong>Ratings Given:</strong> ${renderRatingsDetail(row)}</div>
            <p><strong>Comments:</strong> ${row.feedback}</p>
        `;
        cardGrid.appendChild(card);
    });
}

function switchView(view) {
    currentView = view;
    document.getElementById('tableViewBtn').classList.toggle('active', view === 'table');
    document.getElementById('cardViewBtn').classList.toggle('active', view === 'card');
    tableView.style.display = view === 'table' ? 'block' : 'none';
    cardView.style.display = view === 'card' ? 'block' : 'none';
    renderData();
}

// ================= EXPORT FUNCTIONS =================
function exportToExcel() {
    if (!currentFeedbackData.length) return alert('No data to export!');

    const excelData = currentFeedbackData.map((row, idx) => ({
        'Sr No': idx + 1,
        'Student Name': row.studentName,
        'PRN': row.prn,
        'Subject': row.subjectName,
        'Type': row.type,
        'Faculty': row.faculty,
        'Average Rating': row.avgRating !== 'N/A' ? `${row.avgRating} / 5` : 'N/A',
        'Q1 Rating': row.qRatings ? row.qRatings.q1 : '-',
        'Q2 Rating': row.qRatings ? row.qRatings.q2 : '-',
        'Q3 Rating': row.qRatings ? row.qRatings.q3 : '-',
        'Q4 Rating': row.qRatings ? row.qRatings.q4 : '-',
        'Q5 Rating': row.qRatings ? row.qRatings.q5 : '-',
        'Comments': row.feedback
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(excelData);
    XLSX.utils.book_append_sheet(wb, ws, 'Self Feedback');
    XLSX.writeFile(wb, `Self_Registered_Feedback_${yearFilter.value}_${divisionFilter.value}.xlsx`);
}

function exportToPDF() {
    if (!currentFeedbackData.length) return alert('No data to export!');

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(16);
    doc.text('Self Registered Student Feedback Report', 14, 15);
    doc.setFontSize(10);
    doc.text(`Class: ${yearFilter.value} | Division: ${divisionFilter.value} | Batch: ${batchFilter.value}`, 14, 22);

    const columns = ['#', 'Student', 'Subject', 'Type', 'Faculty', 'Avg Rating', 'Q1-Q5 Ratings', 'Comments'];
    const rows = currentFeedbackData.map((r, idx) => {
        const q = r.qRatings || {};
        const qStr = (q.q1 || q.q2) ? `Q1:${q.q1 || '-'} Q2:${q.q2 || '-'} Q3:${q.q3 || '-'} Q4:${q.q4 || '-'} Q5:${q.q5 || '-'}` : '-';
        return [
            idx + 1,
            r.studentName,
            r.subjectName,
            r.type,
            r.faculty,
            r.avgRating !== 'N/A' ? `${r.avgRating}/5` : 'N/A',
            qStr,
            r.feedback
        ];
    });

    doc.autoTable({
        head: [columns],
        body: rows,
        startY: 28,
        theme: 'grid',
        headStyles: { fillColor: [124, 58, 237] }
    });

    doc.save(`Self_Registered_Feedback_${yearFilter.value}_${divisionFilter.value}.pdf`);
}
