// ================= GLOBAL DATA STORAGE =================
// Updated: Subject Management with Division Support
let structure1Data = [];
let structure2Data = [];
let structure3Data = [];
let feedbackDate1 = '';
let feedbackDate2 = '';
let feedbackDate3 = '';
let structure3SummaryStats = { totalSubjects: 0, theoryCount: 0, practicalCount: 0, overallPct: 0, totalSubmissions: 0 };

// ================= TOAST NOTIFICATION HELPER =================
function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 100);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 500);
    }, 3000);
}

// ================= HELPER FUNCTION TO DETECT LAB SUBJECTS =================
// Returns true if subject is a Practical/Lab subject (name contains LAB or Practical, or type is lab/practical)
function isLabSubject(subjectName, type) {
    if (!subjectName) return false;

    const nameLower = subjectName.toLowerCase();
    const typeLower = (type || '').toLowerCase();

    // Check if type is lab or practical
    if (typeLower === 'lab' || typeLower === 'practical') {
        return true;
    }

    // Check if subject name contains LAB or PRACTICAL
    if (nameLower.includes('lab') || nameLower.includes('practical')) {
        return true;
    }

    return false;
}

// ================= HELPER FUNCTIONS FOR MAJORITY CALCULATION =================

// Calculate majority value with special rules
function calculateMajority(values) {
    if (!values || values.length === 0) return 0;

    // Count occurrences of each value
    const counts = {};
    values.forEach(val => {
        if (val !== undefined && val !== null && val !== '') {
            const key = String(val);
            counts[key] = (counts[key] || 0) + 1;
        }
    });

    // Find the maximum count
    let maxCount = 0;
    let maxKeys = [];

    for (const [key, count] of Object.entries(counts)) {
        if (count > maxCount) {
            maxCount = count;
            maxKeys = [key];
        } else if (count === maxCount) {
            maxKeys.push(key);
        }
    }

    // If only one value, return it
    if (maxKeys.length === 1) {
        return parseFloat(maxKeys[0]) || 0;
    }

    // If tie, return the highest value (for numbers)
    const numericKeys = maxKeys.map(k => parseFloat(k)).filter(k => !isNaN(k));
    if (numericKeys.length > 0) {
        return Math.max(...numericKeys);
    }

    // For non-numeric (like Yes/No), return the first one
    return maxKeys[0];
}

// Calculate majority for Notes Uploaded (prioritize Yes over No on tie)
function calculateNotesMajority(values) {
    if (!values || values.length === 0) return 'No';

    let yesCount = 0;
    let noCount = 0;

    values.forEach(val => {
        if (val === true || val === 'Yes' || val === 'yes') {
            yesCount++;
        } else if (val === false || val === 'No' || val === 'no') {
            noCount++;
        }
    });

    // If tie, prioritize Yes
    if (yesCount >= noCount) {
        return 'Yes';
    }
    return 'No';
}

// Helper to normalize subject names for matching across feedback and structures
function normalizeSubjectName(name) {
    if (!name) return '';
    return name.toString().replace(/\s*\((Theory|Lab|Practical)\)\s*/gi, '').trim();
}

// Calculate TA / ISE status formatted string (returns AVG Count 0, 1, or 2)
function formatTAStatus(store) {
    if (!store || !store.iseCompleted || store.iseCompleted.length === 0) return 0;
    return calculateMajority(store.iseCompleted);
}

// ================= STRUCTURE 1 FUNCTIONS =================

function openStructure1() {
    document.getElementById('structure1Modal').style.display = 'block';
    document.getElementById('structure1Year').value = '';
    document.getElementById('structure1Division').value = '';
    document.getElementById('structure1TableContainer').style.display = 'none';
    structure1Data = [];
}

function closeStructure1() {
    document.getElementById('structure1Modal').style.display = 'none';
}

async function getFaculty(subject, division, componentType = 'theory') {
    if (componentType === 'theory') {
        return subject.theoryTeachers?.[division] || 'Not Assigned';
    } else {
        return subject.labTeachers?.[division] || 'Not Assigned';
    }
}

async function loadStructure1Data() {
    const selectedYear = document.getElementById('structure1Year').value;
    const selectedDivision = document.getElementById('structure1Division').value;
    const tableContainer = document.getElementById('structure1TableContainer');
    const tableBody = document.getElementById('structure1TableBody');

    if (!selectedYear) {
        tableContainer.style.display = 'none';
        return;
    }

    try {
        console.log('Loading Structure 1 for year:', selectedYear, 'division:', selectedDivision);

        // 1. Get all subject structures for the selected year
        const structureSnapshot = await db.collection('subjectStructures')
            .where('year', '==', selectedYear)
            .get();

        const allStructures = [];
        structureSnapshot.forEach(doc => {
            allStructures.push({ id: doc.id, ...doc.data() });
        });

        // 2. Get all child subjects to map IDs to originalSubjectNames
        const subjectsSnapshot = await db.collection('subjects')
            .where('year', '==', selectedYear)
            .get();

        const subjectIdMap = {}; // subjectId -> originalSubjectName
        subjectsSnapshot.forEach(doc => {
            const data = doc.data();
            subjectIdMap[doc.id] = data.originalSubjectName || data.subject;
        });

        // 3. Get all feedback data
        const feedbackSnapshot = await db.collection('feedback').get();

        // Group feedback by SubjectName + Division
        // feedbackStore[subjectName][division] = { units: [], pracs: [], notes: [] }
        const feedbackStore = {};

        // 4. Get all students to associate feedback with divisions
        const studentsSnapshot = await db.collection('users').get();
        const studentDivisionMap = {};
        studentsSnapshot.forEach(doc => {
            const d = doc.data();
            const divVal = (d.division || d.div || '').toString().trim().toUpperCase();
            studentDivisionMap[doc.id] = divVal;
        });

        // Deduplicate feedback entries per student per subject to ensure only the latest feedback is used
        const latestFeedbackMap = {};
        feedbackSnapshot.forEach(doc => {
            const f = doc.data();
            const rawSubject = subjectIdMap[f.subjectId] || f.subjectName || f.originalSubjectName || f.subject || '';
            const subjectName = normalizeSubjectName(rawSubject);
            const studentId = f.studentId || doc.id.split('_')[0];

            if (subjectName && studentId) {
                const key = `${studentId}_${subjectName}`;
                let ts = 0;
                if (f.createdAt) {
                    ts = f.createdAt.toMillis ? f.createdAt.toMillis() : new Date(f.createdAt).getTime();
                } else if (doc.id.includes('_final')) {
                    ts = 2;
                } else {
                    ts = 1;
                }

                const existing = latestFeedbackMap[key];
                if (!existing || ts >= existing.ts) {
                    latestFeedbackMap[key] = { data: f, docId: doc.id, ts: ts };
                }
            }
        });

        Object.values(latestFeedbackMap).forEach(item => {
            const f = item.data;
            const rawSubject = subjectIdMap[f.subjectId] || f.subjectName || f.originalSubjectName || f.subject || '';
            const subjectName = normalizeSubjectName(rawSubject);
            const rawDiv = studentDivisionMap[f.studentId] || f.division || f.studentDivision || '';
            const div = rawDiv.toString().trim().toUpperCase();

            if (subjectName && div) {
                if (!feedbackStore[subjectName]) feedbackStore[subjectName] = {};
                if (!feedbackStore[subjectName][div]) {
                    feedbackStore[subjectName][div] = { units: [], pracs: [], notes: [], attendanceMarked: [], iseCompleted: [], ta1Completed: [], ta2Completed: [] };
                }

                if (f.unitsCompleted !== undefined) feedbackStore[subjectName][div].units.push(f.unitsCompleted);
                if (f.practicalsCompleted !== undefined) feedbackStore[subjectName][div].pracs.push(f.practicalsCompleted);
                if (f.notesUploaded !== undefined) feedbackStore[subjectName][div].notes.push(f.notesUploaded);
                if (f.theoryAttendanceFilled !== undefined) feedbackStore[subjectName][div].attendanceMarked.push(f.theoryAttendanceFilled);
                if (f.labAttendanceFilled !== undefined) feedbackStore[subjectName][div].attendanceMarked.push(f.labAttendanceFilled);

                let ta1 = f.ta1Completed;
                let ta2 = f.ta2Completed;
                if (ta1 === undefined && ta2 === undefined && f.iseCompleted !== undefined) {
                    const num = Number(f.iseCompleted) || 0;
                    ta1 = num >= 1;
                    ta2 = num >= 2;
                }

                if (ta1 !== undefined) feedbackStore[subjectName][div].ta1Completed.push(!!ta1);
                if (ta2 !== undefined) feedbackStore[subjectName][div].ta2Completed.push(!!ta2);

                const iseVal = (f.ta1Completed !== undefined || f.ta2Completed !== undefined)
                    ? (ta2 ? 2 : (ta1 ? 1 : 0))
                    : (f.iseCompleted !== undefined ? Number(f.iseCompleted) : (ta2 ? 2 : (ta1 ? 1 : 0)));
                feedbackStore[subjectName][div].iseCompleted.push(iseVal);

                // Track earliest/latest submission date
                if (f.createdAt) {
                    const date = f.createdAt.toDate ? f.createdAt.toDate() : new Date(f.createdAt);
                    if (!feedbackStore[subjectName][div].dates) feedbackStore[subjectName][div].dates = [];
                    feedbackStore[subjectName][div].dates.push(date);
                }
            }
        });

        // Calculate a representative date for the whole report
        let allDates = [];
        Object.values(feedbackStore).forEach(divs => {
            Object.values(divs).forEach(store => {
                if (store.dates) allDates = allDates.concat(store.dates);
            });
        });

        if (allDates.length > 0) {
            const latestDate = new Date(Math.max(...allDates));
            feedbackDate1 = latestDate.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
        } else {
            feedbackDate1 = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
        }

        const divisionsToShow = selectedDivision ? [selectedDivision.toUpperCase()] : ['A', 'B', 'C'];
        structure1Data = [];

        divisionsToShow.forEach(div => {
            allStructures.forEach(struct => {
                const structDivs = (struct.divisions || []).map(d => d.toString().trim().toUpperCase());
                if (!structDivs.includes(div)) return;

                const subjectName = normalizeSubjectName(struct.subjectName);
                const type = struct.type; // theory, lab, both
                const facultyObj = struct.faculty || {};
                const divFaculty = facultyObj[div] || facultyObj[div.toLowerCase()] || {};

                // Helper to create a row
                const createRow = (rowType, facultyName, units, pracs, notes, attendanceMarked, iseCompleted) => ({
                    srNo: 0,
                    class: `${selectedYear} ${div}`,
                    subjectName: struct.subjectName || subjectName,
                    facultyName: facultyName,
                    unitsCovered: units,
                    practicalsCovered: pracs,
                    attendanceMarked: attendanceMarked,
                    iseCompleted: iseCompleted,
                    notesUploaded: notes,
                    sign: '',
                    division: div,
                    type: rowType,
                    sequenceOrder: struct.sequenceOrder || 999
                });

                const store = feedbackStore[subjectName]?.[div] || { units: [], pracs: [], notes: [], attendanceMarked: [], iseCompleted: [], ta1Completed: [], ta2Completed: [] };

                if (type === 'both') {
                    // One Consolidated Row for Both
                    const thFac = divFaculty.theoryFaculty || (typeof divFaculty === 'string' ? divFaculty : 'Not Assigned');
                    structure1Data.push(createRow(
                        'both',
                        thFac, // Priority: Theory Faculty
                        calculateMajority(store.units),
                        calculateMajority(store.pracs),
                        calculateNotesMajority(store.notes),
                        calculateNotesMajority(store.attendanceMarked),
                        formatTAStatus(store)
                    ));
                } else if (type === 'theory') {
                    structure1Data.push(createRow(
                        'theory',
                        divFaculty.theoryFaculty || (typeof divFaculty === 'string' ? divFaculty : 'Not Assigned'),
                        calculateMajority(store.units),
                        'N/A',
                        calculateNotesMajority(store.notes),
                        calculateNotesMajority(store.attendanceMarked),
                        formatTAStatus(store)
                    ));
                } else if (type === 'lab' || type === 'practical') {
                    structure1Data.push(createRow(
                        'lab',
                        divFaculty.practicalFaculty || (typeof divFaculty === 'string' ? divFaculty : 'Not Assigned'),
                        'N/A',
                        calculateMajority(store.pracs),
                        'N/A',
                        calculateNotesMajority(store.attendanceMarked),
                        'N/A'
                    ));
                }
            });
        });

        // Sort by division, then sequence
        structure1Data.sort((a, b) => {
            if (a.division !== b.division) return a.division.localeCompare(b.division);
            return a.sequenceOrder - b.sequenceOrder;
        });

        // Re-assign SR No
        structure1Data.forEach((row, index) => row.srNo = index + 1);

        // Render Table
        tableBody.innerHTML = '';
        let lastDiv = '';
        structure1Data.forEach(row => {
            if (lastDiv !== row.division) {
                const header = document.createElement('tr');
                header.innerHTML = `<td colspan="10" style="background: #f4f4f4; font-weight: bold; text-align: left; padding: 10px;">Division ${row.division}</td>`;
                tableBody.appendChild(header);
                lastDiv = row.division;
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${row.srNo}</td>
                <td>${row.class}</td>
                <td>${row.subjectName}</td>
                <td>${row.facultyName}</td>
                <td>${row.unitsCovered}</td>
                <td>${row.practicalsCovered}</td>
                <td>${row.attendanceMarked}</td>
                <td>${row.iseCompleted}</td>
                <td>${row.notesUploaded}</td>
                <td>${row.sign}</td>
            `;
            tableBody.appendChild(tr);
        });

        tableContainer.style.display = 'block';
        document.getElementById('saveStructure1Btn').disabled = false;
        document.getElementById('saveStructure1Btn').textContent = 'Save Report';

    } catch (error) {
        console.error('Error loading Structure 1:', error);
        alert('Error loading report: ' + error.message);
    }
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

async function saveStructure1() {
    const user = auth.currentUser;
    if (!user) {
        alert('You must be logged in to save reports.');
        return;
    }

    const selectedYear = document.getElementById('structure1Year').value;
    const selectedDivision = document.getElementById('structure1Division').value;
    const saveBtn = document.getElementById('saveStructure1Btn');

    try {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';

        await db.collection('savedReports').add({
            teacherId: user.uid,
            teacherEmail: user.email,
            reportType: 'Structure 1',
            year: selectedYear,
            division: selectedDivision || 'All',
            data: structure1Data,
            feedbackDate: feedbackDate1,
            savedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        showToast('Structure saved successfully');
        saveBtn.textContent = 'Saved ✔';
    } catch (error) {
        console.error('Error saving Structure 1:', error);
        alert('Error saving report: ' + error.message);
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Report';
    }
}

function exportStructure1ToExcel() {
    const selectedYear = document.getElementById('structure1Year').value;
    const selectedDivision = document.getElementById('structure1Division').value;

    // 1. Prepare Branded Header Rows
    const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
    const dateStr = new Date().toLocaleDateString('en-GB', options);

    const headerRows = [
        ["JSPM's Rajarshi Shahu College of Engineering"],
        ["Empowered Autonomous Institute • Affiliated to SPPU • Approved by AICTE"],
        ["NBA (UG) • NAAC “A” Grade • NIRF 151–200"],
        [""],
        ["Subject Wise Report"],
        ["Department: Computer Engineering", "", "", "", "", "", "", "", `Feedback Taken On: ${dateStr}`],
        ["Academic Year: 2025–26", "", "", "", "", "", "", "", 'Semester:  2 '],
        [`Class: ${selectedYear}            Division: ${selectedDivision || 'All'}`],
        [""]
    ];

    // 2. Prepare data with division headers
    const excelData = [];
    let lastDivision = '';

    structure1Data.forEach(row => {
        // Add division header row when division changes
        if (lastDivision !== row.division) {
            excelData.push({
                'Sr No': '',
                'Class': 'Division ' + row.division,
                'Subject Name': '',
                'Faculty Name': '',
                'Units Covered': '',
                'Practicals Covered': '',
                'Attendance Marked on ERP': '',
                'TA 1 / TA 2 Completed': '',
                'Notes Uploaded': '',
                'Sign': ''
            });
            lastDivision = row.division;
        }

        excelData.push({
            'Sr No': row.srNo,
            'Class': row.class,
            'Subject Name': row.subjectName,
            'Faculty Name': row.facultyName,
            'Units Covered': row.unitsCovered,
            'Practicals Covered': row.practicalsCovered,
            'Attendance Marked on ERP': row.attendanceMarked,
            'TA 1 / TA 2 Completed': row.iseCompleted,
            'Notes Uploaded': row.notesUploaded,
            'Sign': row.sign
        });
    });

    const wsData = [...headerRows, ...excelData.map(Object.values)];
    wsData.push([""]);
    wsData.push([""]);
    wsData.push(["DAC ", "", "", "", "", "", "", "", "HOD ", ""]);

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Set columns
    ws['!cols'] = [{ wch: 8 }, { wch: 15 }, { wch: 30 }, { wch: 30 }, { wch: 15 }, { wch: 18 }, { wch: 25 }, { wch: 25 }, { wch: 15 }, { wch: 10 }];

    XLSX.utils.book_append_sheet(wb, ws, 'Structure 1');
    XLSX.writeFile(wb, `Structure1_Subject_Summary_${selectedYear}.xlsx`);
}

function exportStructure1ToPDF() {
    if (!structure1Data || structure1Data.length === 0) {
        alert('No data to export!');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    const startY = addBrandedHeader(doc, 'Subject Wise Report');

    const selectedYear = document.getElementById('structure1Year').value;
    const selectedDivision = document.getElementById('structure1Division').value;

    const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
    const dateStr = new Date().toLocaleDateString('en-GB', options);

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);

    doc.text('Department: Computer Engineering', 14, startY + 4);

    // Right aligned feedback date
    doc.setFont('helvetica', 'italic');
    doc.text(`Feedback Taken On: ${feedbackDate1}`, 196, startY + 4, { align: 'right' });

    doc.text('Academic Year: 2025–26', 14, startY + 10);
    doc.text('Semester: 2    ', 196, startY + 10, { align: 'right' });
    doc.text(`Class: ${selectedYear}            Division: ${selectedDivision || 'All'}`, 14, startY + 16);

    const tableColumn = ['Sr No', 'Class', 'Subject Name', 'Faculty Name', 'Units Covered', 'Practicals Covered', 'Attendance Marked on ERP', 'TA 1 / TA 2 Completed', 'Notes Uploaded', 'Sign'];
    const tableRows = [];

    // Track division changes to add header rows in PDF
    let lastDivision = '';

    structure1Data.forEach(row => {
        // Add division header row when division changes
        if (lastDivision !== row.division) {
            const headerRow = [
                { content: 'Division ' + row.division, colSpan: 10, styles: { fillColor: [224, 224, 224], fontStyle: 'bold', halign: 'left' } }
            ];
            tableRows.push(headerRow);
            lastDivision = row.division;
        }

        const rowData = [
            row.srNo,
            row.class,
            row.subjectName,
            row.facultyName,
            row.unitsCovered.toString(),
            row.practicalsCovered.toString(),
            row.attendanceMarked.toString(),
            row.iseCompleted.toString(),
            row.notesUploaded,
            row.sign
        ];
        tableRows.push(rowData);
    });

    doc.autoTable({
        head: [tableColumn],
        body: tableRows,
        startY: startY + 22,
        theme: 'grid',
        styles: { fontSize: 8 },
        headStyles: { fillColor: [41, 128, 185] }
    });

    const finalY = doc.lastAutoTable.finalY || (startY + 22);

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');

    const pageHeight = doc.internal.pageSize.getHeight();
    const bottomMargin = 20;

    if (finalY > pageHeight - 35) {
        doc.addPage();
    }

    const signY = doc.internal.pageSize.getHeight() - bottomMargin;

    doc.text('DAC ', 14, signY);
    doc.text('HOD ', 196, signY, { align: 'right' });

    doc.save('Structure1_Report.pdf');
}

// ================= STRUCTURE 2 FUNCTIONS =================

function openStructure2() {
    document.getElementById('structure2Modal').style.display = 'block';
    document.getElementById('structure2Year').value = '';
    document.getElementById('structure2Division').value = '';
    document.getElementById('structure2TableContainer').style.display = 'none';
    structure2Data = [];
}

function closeStructure2() {
    document.getElementById('structure2Modal').style.display = 'none';
}

async function loadStructure2Data() {
    const selectedYear = document.getElementById('structure2Year').value;
    const selectedDivision = document.getElementById('structure2Division').value;
    const tableContainer = document.getElementById('structure2TableContainer');
    const tableBody = document.getElementById('structure2TableBody');

    if (!selectedYear) {
        tableContainer.style.display = 'none';
        return;
    }

    try {
        console.log('Loading Structure 2 for year:', selectedYear);

        // 1. Get all subject structures for the selected year
        const structureSnapshot = await db.collection('subjectStructures')
            .where('year', '==', selectedYear)
            .get();

        const allStructures = [];
        structureSnapshot.forEach(doc => {
            allStructures.push({ id: doc.id, ...doc.data() });
        });

        // 2. Get all child subjects to map IDs to originalSubjectNames
        const subjectsSnapshot = await db.collection('subjects')
            .where('year', '==', selectedYear)
            .get();

        const subjectIdMap = {};
        subjectsSnapshot.forEach(doc => {
            const data = doc.data();
            subjectIdMap[doc.id] = data.originalSubjectName || data.subject;
        });

        // 3. Get all feedback data
        const feedbackSnapshot = await db.collection('feedback').get();
        const feedbackStore = {};

        // 4. Get all students to associate feedback with divisions
        const studentsSnapshot = await db.collection('users').get();
        const studentDivisionMap = {};
        studentsSnapshot.forEach(doc => {
            const d = doc.data();
            const divVal = (d.division || d.div || '').toString().trim().toUpperCase();
            studentDivisionMap[doc.id] = divVal;
        });

        const latestFeedbackMap2 = {};
        feedbackSnapshot.forEach(doc => {
            const f = doc.data();
            const rawSubject = subjectIdMap[f.subjectId] || f.subjectName || f.originalSubjectName || f.subject || '';
            const subjectName = normalizeSubjectName(rawSubject);
            const studentId = f.studentId || doc.id.split('_')[0];

            if (subjectName && studentId) {
                const key = `${studentId}_${subjectName}`;
                let ts = 0;
                if (f.createdAt) {
                    ts = f.createdAt.toMillis ? f.createdAt.toMillis() : new Date(f.createdAt).getTime();
                } else if (doc.id.includes('_final')) {
                    ts = 2;
                } else {
                    ts = 1;
                }

                const existing = latestFeedbackMap2[key];
                if (!existing || ts >= existing.ts) {
                    latestFeedbackMap2[key] = { data: f, docId: doc.id, ts: ts };
                }
            }
        });

        Object.values(latestFeedbackMap2).forEach(item => {
            const f = item.data;
            const rawSubject = subjectIdMap[f.subjectId] || f.subjectName || f.originalSubjectName || f.subject || '';
            const subjectName = normalizeSubjectName(rawSubject);
            const rawDiv = studentDivisionMap[f.studentId] || f.division || f.studentDivision || '';
            const div = rawDiv.toString().trim().toUpperCase();

            if (subjectName && div) {
                if (!feedbackStore[subjectName]) feedbackStore[subjectName] = {};
                if (!feedbackStore[subjectName][div]) {
                    feedbackStore[subjectName][div] = { units: [], pracs: [] };
                }
                if (f.unitsCompleted !== undefined) feedbackStore[subjectName][div].units.push(f.unitsCompleted);
                if (f.practicalsCompleted !== undefined) feedbackStore[subjectName][div].pracs.push(f.practicalsCompleted);

                // Track dates
                if (f.createdAt) {
                    const date = f.createdAt.toDate ? f.createdAt.toDate() : new Date(f.createdAt);
                    if (!feedbackStore[subjectName][div].dates) feedbackStore[subjectName][div].dates = [];
                    feedbackStore[subjectName][div].dates.push(date);
                }
            }
        });

        // Calculate date
        let allDates = [];
        Object.values(feedbackStore).forEach(divs => {
            Object.values(divs).forEach(store => {
                if (store.dates) allDates = allDates.concat(store.dates);
            });
        });

        if (allDates.length > 0) {
            const latestDate = new Date(Math.max(...allDates));
            feedbackDate2 = latestDate.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
        } else {
            feedbackDate2 = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
        }

        const divisionsToShow = selectedDivision ? [selectedDivision.toUpperCase()] : ['A', 'B', 'C'];
        structure2Data = [];

        divisionsToShow.forEach(div => {
            allStructures.forEach(struct => {
                const structDivs = (struct.divisions || []).map(d => d.toString().trim().toUpperCase());
                if (!structDivs.includes(div)) return;

                const subjectName = normalizeSubjectName(struct.subjectName);
                const type = struct.type;
                const facultyObj = struct.faculty || {};
                const divFaculty = facultyObj[div] || facultyObj[div.toLowerCase()] || {};

                const store = feedbackStore[subjectName]?.[div] || { units: [], pracs: [] };

                const createRow = (rowType, facultyName, units, pracs) => ({
                    srNo: 0,
                    class: `${selectedYear} ${div}`,
                    subjectName: struct.subjectName || subjectName,
                    facultyName: facultyName,
                    lecturesPlanned: '',
                    lecturesConducted: '',
                    practicalsPlanned: '',
                    practicalsConducted: '',
                    practicalsCompleted: '',
                    unitCompleted: '',
                    sign: '',
                    division: div,
                    type: rowType,
                    sequenceOrder: struct.sequenceOrder || 999
                });

                if (type === 'both') {
                    // One Consolidated Row for Both
                    const thFac = divFaculty.theoryFaculty || (typeof divFaculty === 'string' ? divFaculty : 'Not Assigned');
                    structure2Data.push(createRow(
                        'both',
                        thFac,
                        calculateMajority(store.units),
                        calculateMajority(store.pracs)
                    ));
                } else if (type === 'theory') {
                    structure2Data.push(createRow(
                        'theory',
                        divFaculty.theoryFaculty || (typeof divFaculty === 'string' ? divFaculty : 'Not Assigned'),
                        calculateMajority(store.units),
                        'N/A'
                    ));
                } else if (type === 'lab' || type === 'practical') {
                    structure2Data.push(createRow(
                        'lab',
                        divFaculty.practicalFaculty || (typeof divFaculty === 'string' ? divFaculty : 'Not Assigned'),
                        'N/A',
                        calculateMajority(store.pracs)
                    ));
                }
            });
        });

        structure2Data.sort((a, b) => {
            if (a.division !== b.division) return a.division.localeCompare(b.division);
            return a.sequenceOrder - b.sequenceOrder;
        });

        structure2Data.forEach((row, index) => row.srNo = index + 1);

        tableBody.innerHTML = '';
        let lastDiv = '';
        structure2Data.forEach(row => {
            if (lastDiv !== row.division) {
                const header = document.createElement('tr');
                header.innerHTML = `<td colspan="11" style="background: #f4f4f4; font-weight: bold; text-align: left; padding: 10px;">Division ${row.division}</td>`;
                tableBody.appendChild(header);
                lastDiv = row.division;
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${row.srNo}</td>
                <td>${row.class}</td>
                <td>${row.subjectName}</td>
                <td>${row.facultyName}</td>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
            `;
            tableBody.appendChild(tr);
        });

        tableContainer.style.display = 'block';
        document.getElementById('saveStructure2Btn').disabled = false;
        document.getElementById('saveStructure2Btn').textContent = 'Save Report';

    } catch (error) {
        console.error('Error loading Structure 2:', error);
        alert('Error loading report: ' + error.message);
    }
}

async function saveStructure2() {
    const user = auth.currentUser;
    if (!user) {
        alert('You must be logged in to save reports.');
        return;
    }

    const selectedYear = document.getElementById('structure2Year').value;
    const selectedDivision = document.getElementById('structure2Division').value;
    const saveBtn = document.getElementById('saveStructure2Btn');

    try {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';

        await db.collection('savedReports').add({
            teacherId: user.uid,
            teacherEmail: user.email,
            reportType: 'Structure 2',
            year: selectedYear,
            division: selectedDivision || 'All',
            data: structure2Data,
            feedbackDate: feedbackDate2,
            savedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        showToast('Structure saved successfully');
        saveBtn.textContent = 'Saved ✔';
    } catch (error) {
        console.error('Error saving Structure 2:', error);
        alert('Error saving report: ' + error.message);
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Report';
    }
}



function exportStructure2ToExcel() {
    const selectedYear = document.getElementById('structure2Year').value;
    const selectedDivision = document.getElementById('structure2Division').value;

    // 1. Prepare Branded Header Rows
    const headerRows = [
        ["JSPM's Rajarshi Shahu College of Engineering"],
        ["Empowered Autonomous Institute • Affiliated to SPPU • Approved by AICTE"],
        ["NBA (UG) • NAAC “A” Grade • NIRF 151–200"],
        [""],
        ["SYLLABUS COVERAGE REPORT"],
        ["Department: Computer Engineering", "", "", "", "", "", "", "", `Feedback Taken On: ${feedbackDate2}`],
        ["Academic Year: 2025–26", "", "", "", "", "", "", "", 'Semester:  2 '],
        [`Class: ${selectedYear}            Division: ${selectedDivision || 'All'}`],
        [""]
    ];

    // 2. Prepare data with division headers
    const excelData = [];
    let lastDivision = '';

    structure2Data.forEach(row => {
        // Add division header row when division changes
        if (lastDivision !== row.division) {
            excelData.push({
                'Sr No': '',
                'Class': 'Division ' + row.division,
                'Subject Name': '',
                'Faculty Name': '',
                'No of Lectures Planned': '',
                'No of Lectures Conducted': '',
                'No of Practicals Planned': '',
                'No of Practicals Conducted': '',
                'Practicals Completed': '',
                'Unit Completed': '',
                'Sign': ''
            });
            lastDivision = row.division;
        }

        excelData.push({
            'Sr No': row.srNo,
            'Class': row.class,
            'Subject Name': row.subjectName,
            'Faculty Name': row.facultyName,
            'No of Lectures Planned': row.lecturesPlanned,
            'No of Lectures Conducted': row.lecturesConducted,
            'No of Practicals Planned': row.practicalsPlanned,
            'No of Practicals Conducted': row.practicalsConducted,
            'Practicals Completed': row.practicalsCompleted,
            'Unit Completed': row.unitCompleted,
            'Sign': row.sign
        });
    });

    const wsData = [...headerRows, ...excelData.map(Object.values)];
    wsData.push([""]);
    wsData.push([""]);
    wsData.push(["DAC Sign", "", "", "", "", "", "", "", "HOD Sign", ""]);

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    ws['!cols'] = [{ wch: 8 }, { wch: 12 }, { wch: 25 }, { wch: 25 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 8 }];

    XLSX.utils.book_append_sheet(wb, ws, 'Structure 2');
    XLSX.writeFile(wb, `Structure2_Syllabus_Coverage_${selectedYear}.xlsx`);
}

function exportStructure2ToPDF() {
    if (!structure2Data || structure2Data.length === 0) {
        alert('No data to export!');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    const startY = addBrandedHeader(doc, ' Syllabus Coverage Report ');

    const selectedYear = document.getElementById('structure2Year').value;
    const selectedDivision = document.getElementById('structure2Division').value;

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);

    doc.text('Department: Computer Engineering', 14, startY + 4);

    // Right aligned feedback date
    doc.setFont('helvetica', 'italic');
    doc.text(`Feedback Taken On: ${feedbackDate2}`, 196, startY + 4, { align: 'right' });

    doc.text('Academic Year: 2025–26', 14, startY + 10);
    doc.text('Semester: 2 ', 196, startY + 10, { align: 'right' });
    doc.text(`Class: ${selectedYear}            Division: ${selectedDivision || 'All'}`, 14, startY + 16);

    const tableColumn = ['Sr No', 'Class', 'Subject Name', 'Name of Subject Teacher', 'Lectures Planned', 'Lectures Conducted', 'Practicals Planned', 'Practicals Conducted', 'Practical Completed', 'Unit Completed', 'Sign'];
    const tableRows = [];

    // Track division changes to add header rows in PDF
    let lastDivision = '';

    structure2Data.forEach(row => {
        // Add division header row when division changes
        if (lastDivision !== row.division) {
            const headerRow = [
                { content: 'Division ' + row.division, colSpan: 11, styles: { fillColor: [224, 224, 224], fontStyle: 'bold', halign: 'left' } }
            ];
            tableRows.push(headerRow);
            lastDivision = row.division;
        }

        const rowData = [
            row.srNo,
            row.class,
            row.subjectName,
            row.facultyName,
            row.lecturesPlanned,
            row.lecturesConducted,
            row.practicalsPlanned,
            row.practicalsConducted,
            row.practicalsCompleted,
            row.unitCompleted,
            row.sign
        ];
        tableRows.push(rowData);
    });

    doc.autoTable({
        head: [tableColumn],
        body: tableRows,
        startY: startY + 22,
        theme: 'grid',
        styles: { fontSize: 8 },
        headStyles: { fillColor: [41, 128, 185] }
    });

    const finalY = doc.lastAutoTable.finalY || (startY + 22);
    const pageHeight = doc.internal.pageSize.getHeight();
    const bottomMargin = 20;

    if (finalY > pageHeight - 35) {
        doc.addPage();
    }

    const signY = doc.internal.pageSize.getHeight() - bottomMargin;

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('DAC ', 14, signY);
    doc.text('HOD ', 196, signY, { align: 'right' });

    doc.save('Structure2_Syllabus_Coverage.pdf');
}

// ================= STRUCTURE 3 FUNCTIONS =================

async function openStructure3() {
    document.getElementById('structure3Modal').style.display = 'block';
    document.getElementById('structure3Year').value = '';
    document.getElementById('structure3Division').value = '';
    document.getElementById('structure3Batch').value = '';
    document.getElementById('structure3TableContainer').style.display = 'none';
    document.getElementById('structure3NoData').style.display = 'block';
    structure3Data = [];
    await initStructure3CycleFilter();
}

async function initStructure3CycleFilter() {
    const cycleSelect = document.getElementById('structure3Cycle');
    if (!cycleSelect) return;

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

        const prevVal = cycleSelect.value;
        cycleSelect.innerHTML = '';

        cyclesList.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = c.name;
            cycleSelect.appendChild(opt);
        });

        const allOpt = document.createElement('option');
        allOpt.value = 'all';
        allOpt.textContent = 'All Cycles Combined';
        cycleSelect.appendChild(allOpt);

        if (prevVal && Array.from(cycleSelect.options).some(o => o.value === prevVal)) {
            cycleSelect.value = prevVal;
        } else {
            cycleSelect.value = activeCycleId;
        }
    } catch (err) {
        console.error("Error loading Structure 3 cycle filter:", err);
    }
}

// ================= FEEDBACK CYCLE MANAGEMENT (START NEW / DELETE) =================
async function startNewSelfFeedbackCycle() {
    const confirmMsg = 
        "Are you sure you want to start a NEW FEEDBACK CYCLE for all self-registered students?\n\n" +
        "• All self-registered students will be eligible to submit feedback again.\n" +
        "• Previous feedback records will remain saved for historical reports/history.\n" +
        "• New submissions will be tagged under the new feedback cycle.\n" +
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

        await initStructure3CycleFilter();
        const cycleSelect = document.getElementById('structure3Cycle');
        if (cycleSelect) cycleSelect.value = newCycleId;
        if (document.getElementById('structure3Year')?.value) {
            loadStructure3Data();
        }

    } catch (err) {
        console.error("Error starting new feedback cycle:", err);
        alert("Failed to start new feedback cycle: " + err.message);
    }
}

async function deleteSelfFeedbackCycle() {
    const cycleSelect = document.getElementById('structure3Cycle') || document.getElementById('cycleFilter');
    const selectedCycleId = cycleSelect ? cycleSelect.value : '';

    if (!selectedCycleId || selectedCycleId === 'all') {
        alert("Please select a specific Feedback Cycle from the dropdown to delete.");
        return;
    }

    const selectedOptText = cycleSelect.options[cycleSelect.selectedIndex]?.text || selectedCycleId;

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

        await initStructure3CycleFilter();
        if (document.getElementById('structure3Year')?.value) {
            loadStructure3Data();
        }

    } catch (err) {
        console.error("Error deleting feedback cycle:", err);
        alert("Failed to delete feedback cycle: " + err.message);
    }
}

function closeStructure3() {
    document.getElementById('structure3Modal').style.display = 'none';
    closeStructure3DetailsModal();
}

function openStructure3DetailsModal(index) {
    const item = structure3Data[index];
    if (!item) return;

    document.getElementById('detailsSubjectName').textContent = item.displayName;
    document.getElementById('detailsSubjectType').textContent = item.subjectType;
    document.getElementById('detailsFacultyName').textContent = `Faculty: ${item.facultyName}`;
    document.getElementById('detailsClassGroup').textContent = `${item.class} - Div ${item.division} - Batch ${item.batch}`;
    document.getElementById('detailsStudentCount').textContent = item.studentCount;

    document.getElementById('detailsQ1').textContent = item.q1Display;
    document.getElementById('detailsQ2').textContent = item.q2Display;
    document.getElementById('detailsQ3').textContent = item.q3Display;
    document.getElementById('detailsQ4').textContent = item.q4Display;
    document.getElementById('detailsQ5').textContent = item.q5Display;
    document.getElementById('detailsOverall').textContent = item.overallDisplay;

    document.getElementById('structure3DetailsModal').style.display = 'block';
}

function closeStructure3DetailsModal() {
    const detailsModal = document.getElementById('structure3DetailsModal');
    if (detailsModal) {
        detailsModal.style.display = 'none';
    }

    // Clear and reset selected student/feedback details
    if (document.getElementById('detailsSubjectName')) document.getElementById('detailsSubjectName').textContent = '';
    if (document.getElementById('detailsSubjectType')) document.getElementById('detailsSubjectType').textContent = '';
    if (document.getElementById('detailsFacultyName')) document.getElementById('detailsFacultyName').textContent = '';
    if (document.getElementById('detailsClassGroup')) document.getElementById('detailsClassGroup').textContent = '';
    if (document.getElementById('detailsStudentCount')) document.getElementById('detailsStudentCount').textContent = '0';
    if (document.getElementById('detailsQ1')) document.getElementById('detailsQ1').textContent = '—';
    if (document.getElementById('detailsQ2')) document.getElementById('detailsQ2').textContent = '—';
    if (document.getElementById('detailsQ3')) document.getElementById('detailsQ3').textContent = '—';
    if (document.getElementById('detailsQ4')) document.getElementById('detailsQ4').textContent = '—';
    if (document.getElementById('detailsQ5')) document.getElementById('detailsQ5').textContent = '—';
    if (document.getElementById('detailsOverall')) document.getElementById('detailsOverall').textContent = '—';
}

function getYearCode(classStr) {
    if (!classStr) return "";
    const s = String(classStr).toUpperCase();
    if (s.includes("FY") || s.includes("FIRST")) return "FY";
    if (s.includes("SY") || s.includes("SECOND")) return "SY";
    if (s.includes("TY") || s.includes("THIRD")) return "TY";
    if (s.includes("BE") || s.includes("FINAL")) return "BE";
    return classStr.trim();
}

async function loadStructure3Data() {
    const selectedYear = document.getElementById('structure3Year').value;
    const selectedDivision = document.getElementById('structure3Division').value;
    const selectedBatch = document.getElementById('structure3Batch').value;
    const cycleSelect = document.getElementById('structure3Cycle');
    const selectedCycle = cycleSelect ? cycleSelect.value : 'active';

    let activeCycleId = 'cycle_1';
    try {
        const cycleDoc = await db.collection('systemSettings').doc('selfFeedbackCycle').get();
        if (cycleDoc.exists && cycleDoc.data().currentCycleId) {
            activeCycleId = cycleDoc.data().currentCycleId;
        }
    } catch (cErr) {}

    const targetCycleId = (selectedCycle === 'active' || !selectedCycle) ? activeCycleId : selectedCycle;

    const tableContainer = document.getElementById('structure3TableContainer');
    const noDataMsg = document.getElementById('structure3NoData');
    const saveBtn = document.getElementById('saveStructure3Btn');

    if (!selectedYear) {
        tableContainer.style.display = 'none';
        noDataMsg.style.display = 'block';
        if (saveBtn) saveBtn.disabled = true;
        return;
    }

    noDataMsg.style.display = 'none';

    try {
        console.log('Loading Structure 3 for:', { year: selectedYear, division: selectedDivision, batch: selectedBatch, cycle: targetCycleId });

        const selectedYearCode = getYearCode(selectedYear);

        // STEP 1: Fetch ALL valid subjects configured by teachers for this Class & Division FIRST!
        const [structuresSnap, subjectsSnap] = await Promise.all([
            db.collection('subjectStructures').get(),
            db.collection('subjects').get()
        ]);

        const configuredSubjectsMap = new Map();

        // A. Process subjectStructures collection
        structuresSnap.forEach(doc => {
            const d = doc.data();
            const docYear = (d.year || '').trim();
            const docYearCode = getYearCode(docYear);

            const isYearMatch = docYear === selectedYear || 
                                docYearCode === selectedYearCode || 
                                selectedYear.toLowerCase().includes(docYear.toLowerCase()) || 
                                docYear.toLowerCase().includes(selectedYear.toLowerCase());

            if (!isYearMatch) return;

            const divisions = d.divisions || ['A', 'B', 'C'];
            const targetDivs = selectedDivision ? [selectedDivision] : divisions;

            targetDivs.forEach(div => {
                if (!divisions.includes(div)) return;

                const facultyInfo = d.faculty || {};
                const divFaculty = facultyInfo[div] || {};
                const baseName = d.subjectName;
                if (!baseName || !baseName.trim()) return;

                // Theory component
                if (d.type === 'theory' || d.type === 'both') {
                    const key = `${doc.id}_${div}_theory`;
                    const thFaculty = typeof divFaculty === 'string' ? divFaculty : (divFaculty.theoryFaculty || 'Not Assigned');

                    configuredSubjectsMap.set(key, {
                        subjectId: doc.id,
                        subjectStructureId: doc.id,
                        subjectName: baseName.trim(),
                        displayName: baseName.trim(),
                        type: 'theory',
                        subjectType: 'Theory',
                        isPractical: false,
                        facultyName: thFaculty || 'Not Assigned',
                        class: selectedYear,
                        division: div,
                        batch: selectedBatch || 'All',
                        sequenceOrder: d.sequenceOrder || 0,
                        studentUids: new Set(),
                        q1Sum: 0, q2Sum: 0, q3Sum: 0, q4Sum: 0, q5Sum: 0
                    });
                }

                // Practical component
                if (d.type === 'practical' || d.type === 'lab' || d.type === 'both') {
                    const key = `${doc.id}_${div}_practical`;
                    const prFaculty = typeof divFaculty === 'string' ? divFaculty : (divFaculty.practicalFaculty || 'Not Assigned');
                    const labName = baseName.toLowerCase().includes('lab') ? baseName.trim() : baseName.trim() + ' Lab';

                    configuredSubjectsMap.set(key, {
                        subjectId: doc.id,
                        subjectStructureId: doc.id,
                        subjectName: baseName.trim(),
                        displayName: labName,
                        type: 'lab',
                        subjectType: 'Practical',
                        isPractical: true,
                        facultyName: prFaculty || 'Not Assigned',
                        class: selectedYear,
                        division: div,
                        batch: selectedBatch || 'All',
                        sequenceOrder: d.sequenceOrder || 0,
                        studentUids: new Set(),
                        q1Sum: 0, q2Sum: 0, q3Sum: 0, q4Sum: 0, q5Sum: 0
                    });
                }
            });
        });

        // B. Process subjects collection (to capture individual division/batch entries)
        subjectsSnap.forEach(doc => {
            const d = doc.data();
            const docYear = (d.year || '').trim();
            const docYearCode = getYearCode(docYear);

            const isYearMatch = docYear === selectedYear || 
                                docYearCode === selectedYearCode || 
                                selectedYear.toLowerCase().includes(docYear.toLowerCase()) || 
                                docYear.toLowerCase().includes(selectedYear.toLowerCase());

            if (!isYearMatch) return;

            const div = d.division || 'A';
            if (selectedDivision && div !== selectedDivision) return;

            // Batch match for lab subjects
            const isLab = d.hasLab || d.type === 'lab' || d.type === 'practical' || (d.subject && String(d.subject).toLowerCase().includes('lab'));
            if (isLab && selectedBatch && selectedBatch !== 'All') {
                if (d.batch && d.batch !== 'all' && d.batch !== selectedBatch) return;
            }

            const rawSub = d.originalSubjectName || d.subject || d.subjectName || '';
            const baseName = String(rawSub).replace(' (Theory)', '').replace(' (Lab)', '').trim();
            if (!baseName) return;

            const structId = d.subjectStructureId || doc.id.split('_')[0];
            const isPractical = isLab;
            const typeStr = isPractical ? 'practical' : 'theory';
            const key = `${structId}_${div}_${typeStr}`;

            if (!configuredSubjectsMap.has(key)) {
                let displayName = d.subject || baseName;
                displayName = String(displayName);
                if (isPractical && !displayName.toLowerCase().includes('lab')) {
                    displayName = baseName + ' Lab';
                } else if (!isPractical) {
                    displayName = displayName.replace(' (Theory)', '');
                }

                configuredSubjectsMap.set(key, {
                    subjectId: doc.id,
                    subjectStructureId: structId,
                    subjectName: baseName,
                    displayName: displayName,
                    type: isPractical ? 'lab' : 'theory',
                    subjectType: isPractical ? 'Practical' : 'Theory',
                    isPractical: isPractical,
                    facultyName: d.faculty || 'Not Assigned',
                    class: selectedYear,
                    division: div,
                    batch: d.batch || selectedBatch || 'All',
                    sequenceOrder: d.sequenceOrder || 0,
                    studentUids: new Set(),
                    q1Sum: 0, q2Sum: 0, q3Sum: 0, q4Sum: 0, q5Sum: 0
                });
            } else {
                const existing = configuredSubjectsMap.get(key);
                if ((!existing.facultyName || existing.facultyName === 'Not Assigned') && d.faculty && d.faculty !== 'Not Assigned') {
                    existing.facultyName = d.faculty;
                }
            }
        });

        console.log('Configured subjects count for class & div:', configuredSubjectsMap.size);

        // STEP 2: Fetch self-registered student feedback records ONLY!
        const [selfSnap, generalSnap] = await Promise.all([
            db.collection('self_feedback').get(),
            db.collection('feedback').get()
        ]);

        const feedbackRecords = [];

        const isValidFeedbackDoc = (d) => {
            if (d.registrationType !== 'self_registered') return false;
            const hasRatings = d.question1Rating !== undefined || d.ratings?.q1 !== undefined;
            if (!hasRatings) return false;
            const hasSubjectId = d.subjectId || d.subjectStructureId || d.subjectName || d.originalSubjectName || d.subjectID || d.subject_id;
            if (!hasSubjectId) return false;
            return true;
        };

        const matchesFilter = (d) => {
            const yearMatch = !selectedYear || d.class === selectedYear || d.year === selectedYear || 
                              (d.class && String(d.class).includes(selectedYear)) || (d.year && String(d.year).includes(selectedYear));
            const divMatch = !selectedDivision || d.division === selectedDivision;
            const batchMatch = !selectedBatch || d.batch === selectedBatch;

            const docCycle = d.feedbackCycleId || 'cycle_1';
            const cycleMatch = targetCycleId === 'all' || docCycle === targetCycleId;

            return yearMatch && divMatch && batchMatch && cycleMatch;
        };

        selfSnap.forEach(doc => {
            const d = doc.data();
            if (isValidFeedbackDoc(d) && matchesFilter(d)) {
                feedbackRecords.push(d);
            }
        });

        generalSnap.forEach(doc => {
            const d = doc.data();
            if (isValidFeedbackDoc(d) && matchesFilter(d)) {
                const fId = d.feedbackId || doc.id;
                if (!feedbackRecords.some(r => r.feedbackId === fId)) {
                    feedbackRecords.push(d);
                }
            }
        });

        console.log('Valid self-registered feedback submissions found:', feedbackRecords.length);

        // STEP 3: Match feedback submissions against the VALID configured subjects ONLY!
        feedbackRecords.forEach(f => {
            const fType = String(f.type || f.subjectType || f.subject_type || '').toLowerCase();
            const rawFSub = f.originalSubjectName || f.subjectName || f.subject || '';
            const fRawName = String(rawFSub).replace(' (Theory)', '').replace(' (Lab)', '').trim().toLowerCase();
            const fSubId = String(f.subjectId || f.subjectID || f.subject_id || '').toLowerCase();

            const fIsPrac = fType === 'lab' || fType === 'practical' || 
                            fSubId.endsWith('_lab') || fSubId.includes('_lab_') || fSubId.endsWith('_practical') || fSubId.includes('_practical_') ||
                            fRawName.includes('lab') || fRawName.includes('practical');
            const fDiv = f.division || selectedDivision || 'A';

            let matchedConfig = null;

            for (const [key, config] of configuredSubjectsMap.entries()) {
                const configBase = String(config.subjectName || '').toLowerCase().trim();
                const configStructId = config.subjectStructureId;
                const configSubId = config.subjectId;

                const typeMatches = (config.isPractical === fIsPrac);
                const divMatches = !f.division || f.division === config.division;

                const isIdMatch = (f.subjectId && (f.subjectId === configSubId || f.subjectId === configStructId || String(f.subjectId).startsWith(configStructId))) ||
                                  (f.subjectStructureId && (f.subjectStructureId === configStructId || f.subjectStructureId === configSubId));

                const isNameMatch = fRawName && configBase && (fRawName === configBase || fRawName.includes(configBase) || configBase.includes(fRawName));

                if (typeMatches && divMatches && (isIdMatch || isNameMatch)) {
                    matchedConfig = config;
                    break;
                }
            }

            // ONLY aggregate if it matches a valid configured subject!
            if (matchedConfig) {
                const studentId = f.studentId || f.prn || f.username || Math.random().toString();
                if (!matchedConfig.studentUids.has(studentId)) {
                    matchedConfig.studentUids.add(studentId);

                    const q1 = Number(f.question1Rating || f.ratings?.q1 || 0);
                    const q2 = Number(f.question2Rating || f.ratings?.q2 || 0);
                    const q3 = Number(f.question3Rating || f.ratings?.q3 || 0);
                    const q4 = Number(f.question4Rating || f.ratings?.q4 || 0);
                    const q5 = Number(f.question5Rating || f.ratings?.q5 || 0);

                    matchedConfig.q1Sum += q1;
                    matchedConfig.q2Sum += q2;
                    matchedConfig.q3Sum += q3;
                    matchedConfig.q4Sum += q4;
                    matchedConfig.q5Sum += q5;
                }
            }
        });

        // STEP 4: Build final structure3Data list from configuredSubjectsMap ONLY!
        structure3Data = [];
        let totalAllRatingsSum = 0;
        let totalSubmissionsCount = 0;

        configuredSubjectsMap.forEach((subject) => {
            const count = subject.studentUids.size;

            let q1Pct = null, q2Pct = null, q3Pct = null, q4Pct = null, q5Pct = null, overallPct = null;
            let q1Display = '—', q2Display = '—', q3Display = '—', q4Display = '—', q5Display = '—', overallDisplay = '—';

            if (count > 0) {
                q1Pct = Math.round((subject.q1Sum / (count * 5)) * 100);
                q2Pct = Math.round((subject.q2Sum / (count * 5)) * 100);
                q3Pct = Math.round((subject.q3Sum / (count * 5)) * 100);
                q4Pct = Math.round((subject.q4Sum / (count * 5)) * 100);
                q5Pct = Math.round((subject.q5Sum / (count * 5)) * 100);

                const totalSubjectRatingsSum = subject.q1Sum + subject.q2Sum + subject.q3Sum + subject.q4Sum + subject.q5Sum;
                overallPct = Math.round((totalSubjectRatingsSum / (count * 25)) * 100);

                totalAllRatingsSum += totalSubjectRatingsSum;
                totalSubmissionsCount += count;

                q1Display = `${q1Pct}%`;
                q2Display = `${q2Pct}%`;
                q3Display = `${q3Pct}%`;
                q4Display = `${q4Pct}%`;
                q5Display = `${q5Pct}%`;
                overallDisplay = `${overallPct}%`;
            }

            structure3Data.push({
                subjectId: subject.subjectId,
                subjectStructureId: subject.subjectStructureId,
                subjectName: subject.subjectName,
                displayName: subject.displayName,
                type: subject.type,
                subjectType: subject.subjectType,
                isPractical: subject.isPractical,
                facultyName: subject.facultyName,
                class: selectedYear,
                division: subject.division || selectedDivision || 'A',
                batch: selectedBatch || 'All',
                studentCount: count,
                q1Pct: q1Pct,
                q2Pct: q2Pct,
                q3Pct: q3Pct,
                q4Pct: q4Pct,
                q5Pct: q5Pct,
                overallPct: overallPct,
                q1Display: q1Display,
                q2Display: q2Display,
                q3Display: q3Display,
                q4Display: q4Display,
                q5Display: q5Display,
                overallDisplay: overallDisplay,
                sequenceOrder: subject.sequenceOrder || 0
            });
        });

        // Sort by division, then theory first, then sequence order
        structure3Data.sort((a, b) => {
            if (a.division !== b.division) return a.division.localeCompare(b.division);
            if (a.isPractical !== b.isPractical) return a.isPractical ? 1 : -1;
            return a.sequenceOrder - b.sequenceOrder;
        });

        const theorySubjects = structure3Data.filter(s => !s.isPractical);
        const practicalSubjects = structure3Data.filter(s => s.isPractical);

        const overallClassPctDisplay = totalSubmissionsCount > 0 ? `${Math.round((totalAllRatingsSum / (totalSubmissionsCount * 25)) * 100)}%` : '—';
        const overallClassPctNum = totalSubmissionsCount > 0 ? Math.round((totalAllRatingsSum / (totalSubmissionsCount * 25)) * 100) : 0;

        structure3SummaryStats = {
            totalSubjects: structure3Data.length,
            theoryCount: theorySubjects.length,
            practicalCount: practicalSubjects.length,
            overallPct: overallClassPctNum,
            overallDisplay: overallClassPctDisplay,
            totalSubmissions: totalSubmissionsCount
        };

        feedbackDate3 = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });

        // Update Summary Card UI
        const groupTitle = `${selectedYear} - Division ${selectedDivision || 'All'} - Batch ${selectedBatch || 'All'}`;
        document.getElementById('summaryGroupTitle').textContent = groupTitle;
        document.getElementById('summaryOverallScore').textContent = overallClassPctDisplay;
        document.getElementById('statTotalSubjects').textContent = structure3Data.length;
        document.getElementById('statTheorySubjects').textContent = theorySubjects.length;
        document.getElementById('statPracticalSubjects').textContent = practicalSubjects.length;
        document.getElementById('statTotalSubmissions').textContent = totalSubmissionsCount;

        // Render Theory Table
        const theoryTbody = document.getElementById('structure3TheoryTableBody');
        const noTheoryMsg = document.getElementById('noTheoryMsg');
        document.getElementById('theorySectionCount').textContent = `${theorySubjects.length} Subject${theorySubjects.length === 1 ? '' : 's'}`;

        if (theorySubjects.length === 0) {
            theoryTbody.innerHTML = '';
            noTheoryMsg.style.display = 'block';
        } else {
            noTheoryMsg.style.display = 'none';
            theoryTbody.innerHTML = theorySubjects.map((s, idx) => `
                <tr>
                    <td>${idx + 1}</td>
                    <td><strong>${escapeHTML(s.displayName)}</strong></td>
                    <td>${escapeHTML(s.facultyName)}</td>
                    <td><span class="badge" style="background:${s.studentCount > 0 ? '#e0e7ff' : '#f1f5f9'}; color:${s.studentCount > 0 ? '#3730a3' : '#64748b'}; padding:0.2rem 0.6rem; border-radius:12px; font-weight:600;">${s.studentCount} Student${s.studentCount === 1 ? '' : 's'}</span></td>
                    <td>${s.q1Display}</td>
                    <td>${s.q2Display}</td>
                    <td>${s.q3Display}</td>
                    <td>${s.q4Display}</td>
                    <td>${s.q5Display}</td>
                    <td><strong style="color:${s.studentCount > 0 ? '#16a34a' : '#64748b'}; font-size:1.05rem;">${s.overallDisplay}</strong></td>
                    <td>
                        <button type="button" class="export-btn" onclick="openStructure3DetailsModal(${structure3Data.indexOf(s)})" style="padding:0.35rem 0.75rem; font-size:0.8rem;">
                            View Details
                        </button>
                    </td>
                </tr>
            `).join('');
        }

        // Render Practical Table
        const practicalTbody = document.getElementById('structure3PracticalTableBody');
        const noPracticalMsg = document.getElementById('noPracticalMsg');
        document.getElementById('practicalSectionCount').textContent = `${practicalSubjects.length} Subject${practicalSubjects.length === 1 ? '' : 's'}`;

        if (practicalSubjects.length === 0) {
            practicalTbody.innerHTML = '';
            noPracticalMsg.style.display = 'block';
        } else {
            noPracticalMsg.style.display = 'none';
            practicalTbody.innerHTML = practicalSubjects.map((s, idx) => `
                <tr>
                    <td>${idx + 1}</td>
                    <td><strong>${escapeHTML(s.displayName)}</strong></td>
                    <td>${escapeHTML(s.facultyName)}</td>
                    <td><span class="badge" style="background:${s.studentCount > 0 ? '#e0f2fe' : '#f1f5f9'}; color:${s.studentCount > 0 ? '#0369a1' : '#64748b'}; padding:0.2rem 0.6rem; border-radius:12px; font-weight:600;">${s.studentCount} Student${s.studentCount === 1 ? '' : 's'}</span></td>
                    <td>${s.q1Display}</td>
                    <td>${s.q2Display}</td>
                    <td>${s.q3Display}</td>
                    <td>${s.q4Display}</td>
                    <td>${s.q5Display}</td>
                    <td><strong style="color:${s.studentCount > 0 ? '#16a34a' : '#64748b'}; font-size:1.05rem;">${s.overallDisplay}</strong></td>
                    <td>
                        <button type="button" class="export-btn" onclick="openStructure3DetailsModal(${structure3Data.indexOf(s)})" style="padding:0.35rem 0.75rem; font-size:0.8rem;">
                            View Details
                        </button>
                    </td>
                </tr>
            `).join('');
        }

        tableContainer.style.display = 'block';
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save Report';
        }

    } catch (error) {
        console.error('Error loading Structure 3:', error);
        alert('Error loading Structure 3 report: ' + error.message);
    }
}

async function saveStructure3() {
    const user = auth.currentUser;
    if (!user) {
        alert('You must be logged in to save reports.');
        return;
    }

    const selectedYear = document.getElementById('structure3Year').value;
    const selectedDivision = document.getElementById('structure3Division').value;
    const selectedBatch = document.getElementById('structure3Batch').value;
    const cycleSelect = document.getElementById('structure3Cycle');
    const targetCycleId = cycleSelect ? cycleSelect.value : 'cycle_1';
    const saveBtn = document.getElementById('saveStructure3Btn');

    try {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';

        await db.collection('savedReports').add({
            teacherId: user.uid,
            teacherEmail: user.email,
            reportType: 'Structure 3 - Self-Registered Student Feedback',
            year: selectedYear,
            division: selectedDivision || 'All',
            batch: selectedBatch || 'All',
            feedbackCycleId: targetCycleId,
            overallFeedback: structure3SummaryStats.overallPct,
            totalSubmissions: structure3SummaryStats.totalSubmissions,
            data: structure3Data,
            summaryStats: structure3SummaryStats,
            feedbackDate: feedbackDate3,
            savedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        showToast('Structure 3 report saved successfully');
        saveBtn.textContent = 'Saved ✔';
    } catch (error) {
        console.error('Error saving Structure 3:', error);
        alert('Error saving report: ' + error.message);
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Report';
    }
}

function exportStructure3ToExcel() {
    const selectedYear = document.getElementById('structure3Year').value;
    const selectedDivision = document.getElementById('structure3Division').value || 'All';
    const selectedBatch = document.getElementById('structure3Batch').value || 'All';

    if (!structure3Data || structure3Data.length === 0) {
        alert('No data to export!');
        return;
    }

    const headerRows = [
        ["JSPM's Rajarshi Shahu College of Engineering"],
        ["Empowered Autonomous Institute • Affiliated to SPPU • Approved by AICTE"],
        ["NBA (UG) • NAAC “A” Grade • NIRF 151–200"],
        [""],
        ["SELF-REGISTERED STUDENT FEEDBACK REPORT (STRUCTURE 3)"],
        ["Department: Computer Engineering", "", "", "", "", "", "", `Feedback Taken On: ${feedbackDate3}`],
        ["Academic Year: 2025–26", "", "", "", "", "", "", "Semester: 2"],
        [`Class: ${selectedYear}`, `Division: ${selectedDivision}`, `Batch: ${selectedBatch}`, "", `Overall Feedback: ${structure3SummaryStats.overallPct}%`, "", `Total Submissions: ${structure3SummaryStats.totalSubmissions}`],
        [""]
    ];

    const excelData = [];
    let lastDivision = '';

    structure3Data.forEach(row => {
        if (lastDivision !== row.division) {
            excelData.push({
                'Class': `Division ${row.division}`,
                'Division': '',
                'Batch': '',
                'Subject': '',
                'Subject Type': '',
                'Faculty': '',
                'Students Submitted': '',
                'Q1 %': '',
                'Q2 %': '',
                'Q3 %': '',
                'Q4 %': '',
                'Q5 %': '',
                'Overall %': '',
                'Report Date': ''
            });
            lastDivision = row.division;
        }

        excelData.push({
            'Class': row.class,
            'Division': row.division,
            'Batch': row.batch,
            'Subject': row.displayName,
            'Subject Type': row.subjectType,
            'Faculty': row.facultyName,
            'Students Submitted': row.studentCount,
            'Q1 %': row.q1Display,
            'Q2 %': row.q2Display,
            'Q3 %': row.q3Display,
            'Q4 %': row.q4Display,
            'Q5 %': row.q5Display,
            'Overall %': row.overallDisplay,
            'Report Date': feedbackDate3
        });
    });

    const wsData = [...headerRows, ...excelData.map(Object.values)];
    wsData.push([""]);
    wsData.push([""]);
    wsData.push(["DAC Sign", "", "", "", "", "", "", "", "HOD Sign"]);

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    ws['!cols'] = [
        { wch: 8 }, { wch: 10 }, { wch: 8 }, { wch: 28 }, { wch: 14 }, 
        { wch: 28 }, { wch: 18 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, 
        { wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 14 }
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Structure 3');
    XLSX.writeFile(wb, `Structure3_Self_Registered_Feedback_${selectedYear}_${selectedDivision}_${selectedBatch}.xlsx`);
}

function exportStructure3ToPDF() {
    if (!structure3Data || structure3Data.length === 0) {
        alert('No data to export!');
        return;
    }

    const selectedYear = document.getElementById('structure3Year').value;
    const selectedDivision = document.getElementById('structure3Division').value || 'All';
    const selectedBatch = document.getElementById('structure3Batch').value || 'All';

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    const startY = addBrandedHeader(doc, 'Self-Registered Student Feedback Report (Structure 3)');

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);

    doc.text('Department: Computer Engineering', 14, startY + 4);
    doc.setFont('helvetica', 'italic');
    doc.text(`Feedback Taken On: ${feedbackDate3}`, 196, startY + 4, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.text('Academic Year: 2025–26', 14, startY + 10);
    doc.text('Semester: 2', 196, startY + 10, { align: 'right' });
    doc.text(`Class: ${selectedYear}    Division: ${selectedDivision}    Batch: ${selectedBatch}`, 14, startY + 16);
    doc.text(`Class Overall Feedback: ${structure3SummaryStats.overallDisplay}    Total Submissions: ${structure3SummaryStats.totalSubmissions}`, 196, startY + 16, { align: 'right' });

    const tableColumn = ['Sr No', 'Subject Name', 'Type', 'Faculty Name', 'Students', 'Q1 %', 'Q2 %', 'Q3 %', 'Q4 %', 'Q5 %', 'Overall %'];
    const tableRows = [];
    let lastDivision = '';

    structure3Data.forEach((row, idx) => {
        if (lastDivision !== row.division) {
            tableRows.push([{ content: 'Division ' + row.division, colSpan: 11, styles: { fillColor: [224, 224, 224], fontStyle: 'bold', halign: 'left' } }]);
            lastDivision = row.division;
        }

        tableRows.push([
            (idx + 1).toString(),
            row.displayName,
            row.subjectType,
            row.facultyName,
            row.studentCount.toString(),
            row.q1Display,
            row.q2Display,
            row.q3Display,
            row.q4Display,
            row.q5Display,
            row.overallDisplay
        ]);
    });

    doc.autoTable({
        head: [tableColumn],
        body: tableRows,
        startY: startY + 22,
        theme: 'grid',
        styles: { fontSize: 8 },
        headStyles: { fillColor: [10, 31, 68] }
    });

    const finalY = doc.lastAutoTable.finalY || (startY + 22);
    const pageHeight = doc.internal.pageSize.getHeight();
    const bottomMargin = 20;

    if (finalY > pageHeight - 35) {
        doc.addPage();
    }

    const signY = doc.internal.pageSize.getHeight() - bottomMargin;

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('DAC Sign', 14, signY);
    doc.text('HOD Sign', 196, signY, { align: 'right' });

    doc.save(`Structure3_Feedback_Report_${selectedYear}_${selectedDivision}_${selectedBatch}.pdf`);
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

// ================= LOGOUT FUNCTION =================
function handleLogout() {
    if (confirm('Are you sure you want to logout?')) {
        auth.signOut().then(() => {
            window.location.href = 'index.html';
        }).catch((error) => {
            console.error('Logout Error:', error);
            alert('Error during logout');
        });
    }
}

// ================= SIDEBAR TOGGLE =================
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('collapsed');
}

// ================= CLOSE MODALS ON OUTSIDE CLICK =================
window.onclick = function (event) {
    const modal1 = document.getElementById('structure1Modal');
    const modal2 = document.getElementById('structure2Modal');
    const modal3 = document.getElementById('structure3Modal');
    const modal3Details = document.getElementById('structure3DetailsModal');

    if (event.target === modal1) closeStructure1();
    if (event.target === modal2) closeStructure2();
    if (event.target === modal3) closeStructure3();
    if (event.target === modal3Details) closeStructure3DetailsModal();
}


