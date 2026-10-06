// summaryreports.js

// Authentication Check
auth.onAuthStateChanged(user => {
    if (!user || user.email !== "teacher@portal.com") {
        location.href = "teacherlogin.html";
    } else {
        fetchReports(user.uid);
    }
});

async function fetchReports(uid) {
    const tableBody = document.getElementById('reportsTableBody');
    
    try {
        const querySnapshot = await db.collection('savedReports')
            .where('teacherId', '==', uid)
            .get();

        if (querySnapshot.empty) {
            tableBody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 2rem;">No saved reports found.</td></tr>';
            return;
        }

        let reports = [];
        querySnapshot.forEach(doc => {
            reports.push({ id: doc.id, ...doc.data() });
        });

        // Client-side sort to avoid index requirement
        reports.sort((a, b) => {
            const timeA = a.savedAt ? (a.savedAt.toMillis ? a.savedAt.toMillis() : new Date(a.savedAt).getTime()) : 0;
            const timeB = b.savedAt ? (b.savedAt.toMillis ? b.savedAt.toMillis() : new Date(b.savedAt).getTime()) : 0;
            return timeB - timeA;
        });

        tableBody.innerHTML = '';

        reports.forEach(report => {
            const tr = document.createElement('tr');
            
            // Format Timestamp
            const savedDate = report.savedAt ? (report.savedAt.toDate ? report.savedAt.toDate() : new Date(report.savedAt)) : new Date();
            const dateStr = savedDate.toLocaleDateString('en-GB') + ' ' + savedDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

            tr.innerHTML = `
                <td>${dateStr}</td>
                <td>${report.reportType}</td>
                <td>${report.year}</td>
                <td>${report.division}</td>
                <td>
                    <button class="export-btn" onclick="downloadReport('${report.id}')" style="min-width: 150px; min-height: 40px; padding: 0.5rem 1rem;">
                        📥 Download PDF
                    </button>
                    <button class="remove-btn" onclick="deleteReport('${report.id}')" style="min-width: 120px; min-height: 40px; padding: 0.5rem 1rem; margin-left: 10px;">
                        🗑 Delete
                    </button>
                </td>
            `;
            tableBody.appendChild(tr);
        });

    } catch (error) {
        console.error("Error fetching reports:", error);
        tableBody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: red;">Error loading reports: ' + error.message + '</td></tr>';
    }
}

async function deleteReport(reportId) {
    if (!confirm('Are you sure you want to delete this report?')) return;

    try {
        await db.collection('savedReports').doc(reportId).delete();
        alert('Report deleted successfully');
        fetchReports(auth.currentUser.uid);
    } catch (error) {
        console.error("Error deleting report:", error);
        alert('Error deleting report');
    }
}

async function downloadReport(reportId) {
    try {
        const docRef = await db.collection('savedReports').doc(reportId).get();
        if (!docRef.exists) {
            alert('Report not found');
            return;
        }

        const report = docRef.data();
        const data = report.data;
        const feedbackDate = (report.feedbackDate || '').split(' ')[0];
        
        if (report.reportType === 'Structure 1') {
            exportStructure1PDF(data, report.year, report.division, feedbackDate);
        } else if (report.reportType === 'Structure 2') {
            exportStructure2PDF(data, report.year, report.division, feedbackDate);
        } else if (report.reportType && report.reportType.includes('Structure 3')) {
            exportStructure3PDF(report);
        }
    } catch (error) {
        console.error("Error downloading report:", error);
        alert('Error downloading report');
    }
}

// ================= PDF HELPER FUNCTIONS =================

function addBrandedHeader(doc, reportTitle) {
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

    doc.setFont('times', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(139, 0, 0); // Maroon
    doc.text("JSPM's Rajarshi Shahu College of Engineering", 105, 18, { align: 'center' });

    doc.setFont('times', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.text("Empowered Autonomous Institute • Affiliated to SPPU • Approved by AICTE", 105, 24, { align: 'center' });
    doc.text("NBA (UG) • NAAC “A” Grade • NIRF 151–200", 105, 29, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(10, 31, 68); // Navy
    doc.text(reportTitle, 105, 40, { align: 'center' });

    doc.setDrawColor(139, 0, 0);
    doc.setLineWidth(1);
    doc.line(14, 32, 196, 32);

    return 45;
}

function exportStructure1PDF(data, selectedYear, selectedDivision, feedbackDate) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    const startY = addBrandedHeader(doc, 'Subject Wise Report');
    const dateStr = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);

    doc.text('Department: Computer Engineering', 14, startY + 4);
    doc.setFont('helvetica', 'italic');
    doc.text(`Feedback Taken On: ${feedbackDate}`, 196, startY + 4, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.text('Academic Year: 2025–26', 14, startY + 10);
    doc.text('Semester: 2 ', 196, startY + 10, { align: 'right' });
    doc.text(`Class: ${selectedYear}            Division: ${selectedDivision || 'All'}`, 14, startY + 16);

    const tableColumn = ['Sr No', 'Class', 'Subject Name', 'Faculty Name', 'Units Covered', 'Practicals Covered', 'Attendance Marked on ERP', 'TA 1 / TA 2 Completed', 'Notes Uploaded', 'Sign'];
    const tableRows = [];
    let lastDivision = '';

    data.forEach(row => {
        if (lastDivision !== row.division) {
            tableRows.push([{ content: 'Division ' + row.division, colSpan: 10, styles: { fillColor: [224, 224, 224], fontStyle: 'bold', halign: 'left' } }]);
            lastDivision = row.division;
        }
        tableRows.push([
            row.srNo, 
            row.class, 
            row.subjectName, 
            row.facultyName, 
            (row.unitsCovered || '0').toString(), 
            (row.practicalsCovered || '0').toString(), 
            (row.attendanceMarked || 'No').toString(), 
            (row.iseCompleted || 'None').toString(), 
            row.notesUploaded || 'No', 
            row.sign || ''
        ]);
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
    doc.text('DAC Sign', 14, signY);
    doc.text('HOD Sign', 196, signY, { align: 'right' });

    doc.save(`Structure1_Report_${selectedYear}_${selectedDivision}.pdf`);
}

function exportStructure2PDF(data, selectedYear, selectedDivision, feedbackDate) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const startY = addBrandedHeader(doc, ' Syllabus Coverage Report ');

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);

    doc.text('Department: Computer Engineering', 14, startY + 4);
    doc.setFont('helvetica', 'italic');
    doc.text(`Feedback Taken On: ${feedbackDate}`, 196, startY + 4, { align: 'right' });

    doc.text('Academic Year: 2025–26', 14, startY + 10);
    doc.text('Semester: 2 ', 196, startY + 10, { align: 'right' });
    doc.text(`Class: ${selectedYear}            Division: ${selectedDivision || 'All'}`, 14, startY + 16);

    const tableColumn = ['Sr No', 'Class', 'Subject Name', 'Name of Subject Teacher', 'Lectures Planned', 'Lectures Conducted', 'Practicals Planned', 'Practicals Conducted', 'Practical Completed', 'Unit Completed', 'Sign'];
    const tableRows = [];
    let lastDivision = '';

    data.forEach(row => {
        if (lastDivision !== row.division) {
            tableRows.push([{ content: 'Division ' + row.division, colSpan: 11, styles: { fillColor: [224, 224, 224], fontStyle: 'bold', halign: 'left' } }]);
            lastDivision = row.division;
        }
        tableRows.push([
            row.srNo, 
            row.class, 
            row.subjectName, 
            row.facultyName, 
            row.lecturesPlanned || '', 
            row.lecturesConducted || '', 
            row.practicalsPlanned || '', 
            row.practicalsConducted || '', 
            row.practicalsCompleted || '', 
            row.unitCompleted || '', 
            row.sign || ''
        ]);
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
    doc.text('DAC Sign', 14, signY);
    doc.text('HOD Sign', 196, signY, { align: 'right' });

    doc.save(`Structure2_Report_${selectedYear}_${selectedDivision}.pdf`);
}

function exportStructure3PDF(report) {
    const data = report.data || [];
    const summaryStats = report.summaryStats || { overallPct: report.overallFeedback || 0, totalSubmissions: report.totalSubmissions || 0 };
    const feedbackDate = report.feedbackDate || new Date().toLocaleDateString('en-GB');
    const year = report.year || 'N/A';
    const division = report.division || 'All';
    const batch = report.batch || 'All';

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    const startY = addBrandedHeader(doc, 'Self-Registered Student Feedback Report (Structure 3)');

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);

    doc.text('Department: Computer Engineering', 14, startY + 4);
    doc.setFont('helvetica', 'italic');
    doc.text(`Feedback Taken On: ${feedbackDate}`, 196, startY + 4, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.text('Academic Year: 2025–26', 14, startY + 10);
    doc.text('Semester: 2', 196, startY + 10, { align: 'right' });
    doc.text(`Class: ${year}    Division: ${division}    Batch: ${batch}`, 14, startY + 16);
    const overallClassHeaderDisplay = summaryStats.overallDisplay || ((summaryStats.totalSubmissions || 0) > 0 ? `${summaryStats.overallPct || 0}%` : '—');
    doc.text(`Class Overall Feedback: ${overallClassHeaderDisplay}    Total Submissions: ${summaryStats.totalSubmissions || report.totalSubmissions || 0}`, 196, startY + 16, { align: 'right' });

    const tableColumn = ['Sr No', 'Subject Name', 'Type', 'Faculty Name', 'Students', 'Q1 %', 'Q2 %', 'Q3 %', 'Q4 %', 'Q5 %', 'Overall %'];
    const tableRows = [];
    let lastDivision = '';

    data.forEach((row, idx) => {
        if (lastDivision !== row.division) {
            tableRows.push([{ content: 'Division ' + (row.division || division), colSpan: 11, styles: { fillColor: [224, 224, 224], fontStyle: 'bold', halign: 'left' } }]);
            lastDivision = row.division;
        }

        const count = row.studentCount || 0;
        const q1Disp = row.q1Display || (count > 0 && row.q1Pct != null ? `${row.q1Pct}%` : '—');
        const q2Disp = row.q2Display || (count > 0 && row.q2Pct != null ? `${row.q2Pct}%` : '—');
        const q3Disp = row.q3Display || (count > 0 && row.q3Pct != null ? `${row.q3Pct}%` : '—');
        const q4Disp = row.q4Display || (count > 0 && row.q4Pct != null ? `${row.q4Pct}%` : '—');
        const q5Disp = row.q5Display || (count > 0 && row.q5Pct != null ? `${row.q5Pct}%` : '—');
        const overallDisp = row.overallDisplay || (count > 0 && row.overallPct != null ? `${row.overallPct}%` : '—');

        tableRows.push([
            (idx + 1).toString(),
            row.displayName || row.subjectName,
            row.subjectType || (row.isPractical ? 'Practical' : 'Theory'),
            row.facultyName,
            count.toString(),
            q1Disp,
            q2Disp,
            q3Disp,
            q4Disp,
            q5Disp,
            overallDisp
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

    doc.save(`Structure3_Feedback_Report_${year}_${division}_${batch}.pdf`);
}

