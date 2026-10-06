// ================= DOM ELEMENTS =================
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
    }
});

// ================= LOAD SUBJECTS =================
yearFilter.addEventListener('change', loadSubjects);
divisionFilter.addEventListener('change', loadSubjects);
batchFilter.addEventListener('change', loadSubjects);

async function loadSubjects() {
    subjectFilter.innerHTML = '<option value="">Select Subject</option>';

    if (!yearFilter.value || !divisionFilter.value || !batchFilter.value) return;

    try {
        // Get from subjectStructures collection - filter by year
        const structureSnapshot = await db.collection('subjectStructures')
            .where('year', '==', yearFilter.value)
            .get();

        if (!structureSnapshot.empty) {
            // Fetch relevant child subjects for these structures to get their IDs
            let subjectsQuery = db.collection('subjects')
                .where('year', '==', yearFilter.value)
                .where('division', '==', divisionFilter.value);
                
            if (batchFilter.value !== 'all') {
                subjectsQuery = subjectsQuery.where('batch', '==', batchFilter.value);
            }
            
            const subjectsSnapshot = await subjectsQuery.get();
            
            const subjectIdMap = {}; // originalSubjectName -> { theory: [], lab: [] }
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

            // Use subject structure - filter by division
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
                        // Priority: Theory Faculty
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
        } else {
            // Fall back to old subjects collection
            let snapshotQuery = db.collection('subjects')
                .where('year', '==', yearFilter.value)
                .where('division', '==', divisionFilter.value);
                
            if (batchFilter.value !== 'all') {
                snapshotQuery = snapshotQuery.where('batch', '==', batchFilter.value);
            }
            
            const snapshot = await snapshotQuery.get();

            snapshot.forEach(doc => {
                const d = doc.data();
                const opt = document.createElement('option');
                opt.value = doc.id;
                opt.textContent = `${d.subject} (${d.faculty})`;
                opt.dataset.subjectName = d.subject;
                opt.dataset.type = d.type || 'theory';
                opt.dataset.faculty = d.faculty || '';
                opt.dataset.relatedIds = JSON.stringify([doc.id]);
                subjectFilter.appendChild(opt);
            });
        }

        console.log('Subjects loaded, count:', subjectFilter.options.length);
    } catch (error) {
        console.error('Error loading subjects:', error);
    }
}

// ================= VIEW FEEDBACK =================
viewFeedbackBtn.addEventListener('click', viewFeedback);

async function viewFeedback() {
    console.log('viewFeedback function called');
    loadingSpinner.style.display = 'flex';
    resultsSection.style.display = 'none';
    noDataMessage.style.display = 'none';

    try {
        const userSnap = await db.collection('users').get();
        console.log('User docs found:', userSnap.size);

        const subjectSnap = await db.collection('subjects').get();
        const structureSnap = await db.collection('subjectStructures').get();

        console.log('Subject docs found:', subjectSnap.size);
        console.log('Subject structure docs found:', structureSnap.size);

        const students = {};
        const subjects = {};

        userSnap.forEach(d => students[d.id] = d.data());
        subjectSnap.forEach(d => subjects[d.id] = d.data());

        // Also add subject structures
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

        // Determine search target: either all relevant subjects for this year/div/batch or just one subject
        let targetSubjectIds = [];
        if (subjectFilter.value) {
            const selectedOpt = subjectFilter.selectedOptions[0];
            try {
                targetSubjectIds = JSON.parse(selectedOpt.dataset.relatedIds || '[]');
            } catch (e) {
                targetSubjectIds = [subjectFilter.value.split('_')[0]];
            }
        }

        console.log('Targeting subject IDs:', targetSubjectIds);

        // Fetch feedback with targeted query if possible
        let feedbackQuery = db.collection('feedback');
        if (targetSubjectIds.length > 0 && targetSubjectIds.length <= 10) {
            feedbackQuery = feedbackQuery.where('subjectId', 'in', targetSubjectIds);
        }
        
        const feedbackSnap = await feedbackQuery.get();
        console.log('Feedback docs found:', feedbackSnap.size);

        // Initialize feedback map (Group by Student + Base Subject Name)
        const feedbackMap = {};

        feedbackSnap.forEach(doc => {
            const f = doc.data();
            const student = students[f.studentId];
            const rawSubject = subjects[f.subjectId];

            if (!student || !rawSubject) return;

            // Strict isolation: exclude self-registered feedback in Teacher Registered Feedback view
            if (student.registrationType === 'self_registered' || f.registrationType === 'self_registered') return;

            // Global filters
            if (
                student.year !== yearFilter.value ||
                student.division !== divisionFilter.value ||
                (batchFilter.value !== 'all' && student.batch !== batchFilter.value)
            ) return;

            // Subject specific filter
            if (targetSubjectIds.length > 0 && !targetSubjectIds.includes(f.subjectId)) return;

            const baseName = rawSubject.originalSubjectName || rawSubject.subject.replace(' (Theory)', '').replace(' (Lab)', '');
            const key = `${f.studentId}_${baseName}`;

            if (!feedbackMap[key]) {
                feedbackMap[key] = {
                    student,
                    subjectName: baseName,
                    feedbackData: [],
                    componentTypes: new Set()
                };
            }

            feedbackMap[key].feedbackData.push(f);
            feedbackMap[key].componentTypes.add(rawSubject.type);
        });

        // Process each student-subject combination
        Object.values(feedbackMap).forEach(({ student, subjectName, feedbackData, componentTypes }) => {
            let unitsCompleted = 0;
            let attendanceFilled = 'No';
            let theoryAttendancePercent = 0;
            let quizScheduled = 0;
            let notesUploaded = false;
            let comment = '';

            let practicalsCompleted = 0;
            let totalPracticals = 10;
            let labAttendancePercent = 0;
            let practicalProgress = 0;

            feedbackData.forEach(f => {
                const sub = subjects[f.subjectId];
                const type = (sub ? sub.type : (f.type || 'theory')).toLowerCase();

                if (type === 'lab' || type === 'practical') {
                    if (f.practicalsCompleted !== undefined) {
                        practicalsCompleted = f.practicalsCompleted;
                        totalPracticals = f.totalPracticals || 10;
                        practicalProgress = f.practicalProgress || 0;
                        labAttendancePercent = f.labAttendancePercent || 0;
                        if (f.labAttendanceFilled === 'Yes' || f.labAttendanceFilled === true) attendanceFilled = 'Yes';
                    }
                    if (f.comment) comment += (comment ? ' | ' : '') + 'Lab: ' + f.comment;
                } else {
                    if (f.unitsCompleted !== undefined) {
                        unitsCompleted = f.unitsCompleted;
                        theoryAttendancePercent = f.theoryAttendancePercent || 0;
                        quizScheduled = f.quizScheduled || 0;
                        notesUploaded = f.notesUploaded || false;
                        if (f.theoryAttendanceFilled === 'Yes' || f.theoryAttendanceFilled === true) attendanceFilled = 'Yes';
                    }
                    if (f.comment) comment += (comment ? ' | ' : '') + 'Theory: ' + f.comment;
                }
            });

            // Determine display type
            let displayType = 'Theory';
            if (componentTypes.has('both') || (componentTypes.has('theory') && (componentTypes.has('lab') || componentTypes.has('practical')))) {
                displayType = 'Both';
            } else if (componentTypes.has('lab') || componentTypes.has('practical')) {
                displayType = 'Lab';
            }

            // Get faculty prioritizing Theory
            const structDoc = Array.from(structureSnap.docs).find(d => d.data().subjectName === subjectName);
            const struct = structDoc ? structDoc.data() : null;
            const divFaculty = (struct && struct.faculty) ? (struct.faculty[divisionFilter.value] || {}) : {};
            
            let facultyName = 'Not Assigned';
            if (displayType === 'Both' || displayType === 'Theory') {
                facultyName = divFaculty.theoryFaculty || (typeof divFaculty === 'string' ? divFaculty : 'Not Assigned');
            } else {
                facultyName = divFaculty.practicalFaculty || (typeof divFaculty === 'string' ? divFaculty : 'Not Assigned');
            }

            finalData.push({
                studentName: student.name,
                subjectName: subjectName,
                faculty: facultyName,
                type: displayType,

                // Simplified fields
                unitsCompleted: unitsCompleted,
                practicalsCompleted: practicalsCompleted,
                totalPracticals: totalPracticals,
                labAttendancePercent: labAttendancePercent,
                practicalProgress: practicalProgress,
                theoryAttendancePercent: theoryAttendancePercent,
                quizScheduled: quizScheduled,
                notesUploaded: notesUploaded,
                attendanceFilled: attendanceFilled,
                feedback: comment || 'No feedback'
            });
        });

        loadingSpinner.style.display = 'none';

        if (!finalData.length) {
            noDataMessage.style.display = 'flex';
            return;
        }

        // Calculate Summary Statistics
        const totalResp = finalData.length;
        let sumSyllabus = 0;

        finalData.forEach(item => {
            const isLab = item.type === 'Lab';
            const isBoth = item.type === 'Both';
            
            let syllabusProg = 0;

            if (isBoth) {
                // Average theory and lab for BOTH summary stats
                const thProg = (item.unitsCompleted / 6 * 100);
                const lbProg = item.practicalProgress;
                syllabusProg = (thProg + lbProg) / 2;
            } else if (isLab) {
                syllabusProg = item.practicalProgress;
            } else {
                syllabusProg = (item.unitsCompleted / 6 * 100);
            }

            sumSyllabus += syllabusProg;
        });

        const avgSyllabus = Math.round(sumSyllabus / totalResp);

        // Update UI
        document.getElementById('totalResponses').textContent = totalResp;
        document.getElementById('avgSyllabus').textContent = avgSyllabus + '%';
        // Note: averageRanking and avgAttendance targets might still exist in HTML but we don't update them here.

        currentFeedbackData = finalData;
        resultsSection.style.display = 'block';
        displayTableView(finalData);
    } catch (error) {
        console.error('Error loading feedback:', error);
        loadingSpinner.style.display = 'none';
        noDataMessage.style.display = 'flex';
        alert('Error loading feedback data. Please try again.');
    }
}

// ================= TABLE VIEW =================
function displayTableView(data) {
    tableBody.innerHTML = '';

    // Build table header dynamically
    let tableHeaderHTML = `
        <tr>
            <th>#</th>
            <th>Subject</th>
            <th>Faculty</th>
            <th>Type</th>
            <th>Units Completed</th>
            <th>Notes Uploaded</th>
        </tr>
    `;

    // Update the table header
    const tableHead = document.querySelector('#feedbackTable thead');
    if (tableHead) {
        tableHead.innerHTML = tableHeaderHTML;
    }

    data.forEach((item, index) => {
        let progressHTML, attendanceHTML;

        const isLabDisplay = item.type === 'Lab';
        const isBothDisplay = item.type === 'Both';

        if (isBothDisplay) {
            progressHTML = `Units: ${item.unitsCompleted}/6<br>Pracs: ${item.practicalsCompleted}/${item.totalPracticals}`;
            attendanceHTML = `Th: ${item.theoryAttendancePercent}%<br>Lab: ${item.labAttendancePercent}%`;
        } else if (isLabDisplay) {
            progressHTML = `Practicals: ${item.practicalsCompleted}/${item.totalPracticals}<br>Progress: ${item.practicalProgress}%`;
            attendanceHTML = `${item.labAttendancePercent}%`;
        } else {
            progressHTML = `${item.unitsCompleted} / 6 units`;
            attendanceHTML = `${item.theoryAttendancePercent}%`;
        }

        // Notes/Quiz display (Only for Theory/Both)
        const notesUploadedDisplay = (isLabDisplay) ? "N/A" : (item.notesUploaded ? "Yes" : "No");
        const quizScheduledDisplay = (isLabDisplay) ? "N/A" : (item.quizScheduled || 0);

        tableBody.innerHTML += `
            <tr>
                <td>${index + 1}</td>
                <td>${item.subjectName}</td>
                <td>${item.faculty}</td>
                <td>${item.type}</td>
                <td>${progressHTML}</td>
                <td>${notesUploadedDisplay}</td>
            </tr>
        `;
    });

    tableView.style.display = 'block';
    cardView.style.display = 'none';
}

// ================= CARD VIEW =================
function displayCardView(data) {
    cardGrid.innerHTML = '';

    data.forEach(item => {
        let progressText, attendanceText;
        const isLabDisplay = item.type === 'Lab';
        const isBothDisplay = item.type === 'Both';

        if (isBothDisplay) {
            progressText = `Units: ${item.unitsCompleted}/6, Pracs: ${item.practicalsCompleted}/${item.totalPracticals}`;
            attendanceText = `Th: ${item.theoryAttendancePercent}%, Lab: ${item.labAttendancePercent}%`;
        } else if (isLabDisplay) {
            progressText = `Practicals: ${item.practicalsCompleted}/${item.totalPracticals}, Progress: ${item.practicalProgress}%`;
            attendanceText = `${item.labAttendancePercent}%`;
        } else {
            progressText = `${item.unitsCompleted} / 6 units`;
            attendanceText = `${item.theoryAttendancePercent}%`;
        }

        // Notes / Quiz display
        let optionalFields = '';
        if (!isLabDisplay) {
            optionalFields = `
                <p><b>Notes Uploaded:</b> ${item.notesUploaded ? "Yes" : "No"}</p>
                <p><b>Quiz Scheduled:</b> ${item.quizScheduled || 0}</p>
            `;
        }

        cardGrid.innerHTML += `
            <div class="feedback-card">
                <h4>${item.subjectName}</h4>
                <p><b>Faculty:</b> ${item.faculty}</p>
                <p><b>Type:</b> ${item.type}</p>
                <p><b>Units/Practicals:</b> ${progressText}</p>
                ${optionalFields}
            </div>
        `;
    });

    tableView.style.display = 'none';
    cardView.style.display = 'block';
}

// ================= VIEW SWITCH =================
function switchView(view) {
    currentView = view;
    view === 'table'
        ? displayTableView(currentFeedbackData)
        : displayCardView(currentFeedbackData);
}

// ================= BRANDED HEADER HELPER =================
function addBrandedHeader(doc, reportTitle) {
    // Add Logos using pre-loaded Base64 constants to avoid CORS/Tainted Canvas issues
    if (window.logoBase64) {
        if (window.logoBase64.jspm) {
            try {
                doc.addImage(window.logoBase64.jspm, 'PNG', 14, 10, 20, 20);
            } catch (e) { console.error('Error adding JSPM logo:', e); }
        }
        if (window.logoBase64.rscoe) {
            try {
                doc.addImage(window.logoBase64.rscoe, 'PNG', 176, 10, 20, 20);
            } catch (e) { console.error('Error adding RSCOE logo:', e); }
        }
    }

    // College Name
    doc.setFont('times', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(139, 0, 0); // Maroon
    doc.text("JSPM's Rajarshi Shahu College of Engineering", 105, 18, { align: 'center' });

    // Accreditation Info
    doc.setFont('times', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.text("Empowered Autonomous Institute • Affiliated to SPPU • Approved by AICTE", 105, 24, { align: 'center' });
    doc.text("NBA (UG) • NAAC “A” Grade • NIRF 151–200", 105, 29, { align: 'center' });

    // Report Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(10, 31, 68); // Navy
    doc.text(reportTitle, 105, 40, { align: 'center' });

    // Header Line
    doc.setDrawColor(139, 0, 0);
    doc.setLineWidth(1);
    doc.line(14, 32, 196, 32);

    return 45; // Return next content start position
}
function exportToPDF() {
    if (!currentFeedbackData || currentFeedbackData.length === 0) {
        alert("No data to export!");
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    const startY = addBrandedHeader(doc, "Student Feedback Report");

    const selectedYear = yearFilter.value;
    const selectedDivision = divisionFilter.value;
    const selectedBatch = batchFilter.value;
    const selectedSubject = subjectFilter.options[subjectFilter.selectedIndex]?.text || 'All Subjects';

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    doc.text(`Year: ${selectedYear} - Division: ${selectedDivision} - Batch: ${selectedBatch}`, 14, startY + 5);
    doc.text(`Subject: ${selectedSubject}`, 14, startY + 11);

    const tableColumn = ['#', 'Subject', 'Faculty', 'Type', 'Units Completed', 'Notes Uploaded'];
    const tableRows = [];

    currentFeedbackData.forEach((item, index) => {
        let progressText, attendanceText;

        const isLabDisplay = item.type.toLowerCase() === 'lab' || item.type.toLowerCase() === 'practical' || item.subjectName.toLowerCase().includes('lab');

        if (isLabDisplay) {
            progressText = `Prac: ${item.practicalsCompleted}/${item.totalPracticals}, Prog: ${item.practicalProgress}%`;
            attendanceText = `${item.labAttendancePercent}%`;
        } else {
            progressText = `${item.unitsCompleted} / 6 units`;
            attendanceText = `${item.theoryAttendancePercent}%`;
        }

        // Notes Uploaded display
        let notesUploadedDisplay = '';
        if (!isLabDisplay) {
            notesUploadedDisplay = item.notesUploaded ? "Yes" : "No";
        } else {
            notesUploadedDisplay = "N/A";
        }

        // Quiz Scheduled display
        let quizScheduledDisplay = '';
        if (!isLabDisplay) {
            quizScheduledDisplay = item.quizScheduled || 0;
        } else {
            quizScheduledDisplay = "N/A";
        }

        const rowData = [
            index + 1,
            item.subjectName,
            item.faculty,
            item.type,
            progressText,
            notesUploadedDisplay
        ];
        tableRows.push(rowData);
    });

    doc.autoTable({
        head: [tableColumn],
        body: tableRows,
        startY: startY + 18,
        theme: 'grid',
        styles: { fontSize: 7 },
        headStyles: { fillColor: [41, 128, 185] }
    });

    doc.save("student_feedback.pdf");
}
function exportToExcel() {
    if (!currentFeedbackData || currentFeedbackData.length === 0) {
        alert("No data to export!");
        return;
    }

    const selectedYear = yearFilter.value;
    const selectedDivision = divisionFilter.value;
    const selectedBatch = batchFilter.value;
    const selectedSubject = subjectFilter.options[subjectFilter.selectedIndex]?.text || 'All Subjects';

    // 1. Prepare Branded Header Rows
    const headerRows = [
        ["JSPM's Rajarshi Shahu College of Engineering"],
        ["Empowered Autonomous Institute • Affiliated to SPPU • Approved by AICTE"],
        ["NBA (UG) • NAAC “A” Grade • NIRF 151–200"],
        [""],
        ["STUDENT FEEDBACK REPORT"],
        [`Year: ${selectedYear}`, `Division: ${selectedDivision}`, `Batch: ${selectedBatch}`],
        [`Subject: ${selectedSubject}`],
        [""]
    ];

    // 2. Prepare Table Headers
    const tableHeaders = ['#', 'Subject', 'Faculty', 'Type', 'Units Completed', 'Notes Uploaded'];
    
    // 3. Prepare Data Rows
    const dataRows = [];
    currentFeedbackData.forEach((item, index) => {
        let progressText, attendanceText;
        const isLabDisplay = item.type.toLowerCase() === 'lab' || item.type.toLowerCase() === 'practical' || item.subjectName.toLowerCase().includes('lab');

        if (isLabDisplay) {
            progressText = `Prac: ${item.practicalsCompleted}/${item.totalPracticals}, Prog: ${item.practicalProgress}%`;
            attendanceText = `${item.labAttendancePercent}%`;
        } else {
            progressText = `${item.unitsCompleted} / 6 units`;
            attendanceText = `${item.theoryAttendancePercent}%`;
        }

        const notesUploadedDisplay = !isLabDisplay ? (item.notesUploaded ? "Yes" : "No") : "N/A";
        const quizScheduledDisplay = !isLabDisplay ? (item.quizScheduled || 0) : "N/A";

        dataRows.push([
            index + 1,
            item.subjectName,
            item.faculty,
            item.type,
            progressText,
            notesUploadedDisplay
        ]);
    });

    // 4. Combine all rows
    const allRows = [...headerRows, tableHeaders, ...dataRows];

    // 5. Create Worksheet and Workbook
    const ws = XLSX.utils.aoa_to_sheet(allRows);
    
    // Set column widths
    ws['!cols'] = [
        { wch: 5 },  // #
        { wch: 25 }, // Subject
        { wch: 20 }, // Faculty
        { wch: 10 }, // Type
        { wch: 25 }, // Units
        { wch: 15 }, // Attendance Filled
        { wch: 20 }, // Student Attendance
        { wch: 15 }, // Quiz
        { wch: 15 }, // Notes
        { wch: 40 }  // Feedback
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Feedback Report");

    // 6. Save File
    XLSX.writeFile(wb, `Feedback_Report_${selectedYear}_${selectedDivision}.xlsx`);
}


// ================= LOGOUT =================
function handleLogout() {
    auth.signOut().then(() => {
        window.location.href = "teacherlogin.html";
    });
}

