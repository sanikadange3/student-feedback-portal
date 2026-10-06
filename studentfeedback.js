// Global variables
let subjects = [];
let currentUser = null;
let currentStudent = null;

// Firebase auth state change
auth.onAuthStateChanged(async (user) => {
    if (!user) {
        window.location.href = 'studentlogin.html';
        return;
    }
    currentUser = user;
    try {
        const docSnap = await db.collection("users").doc(user.uid).get();
        if (!docSnap.exists) {
            alert("User profile not found.");
            await auth.signOut();
            window.location.href = 'studentlogin.html';
            return;
        }
        currentStudent = docSnap.data();

        // Access Control: Self-registered students must use the new self-registered feedback page
        if (currentStudent.registrationType === "self_registered") {
            window.location.href = 'selfstudentfeedback.html';
            return;
        }

        displayStudentInfo(currentStudent);
        fetchSubjects(currentStudent, user.uid);
    } catch (err) {
        console.error(err);
        alert("Error loading profile");
    }
});

// Display student info
function displayStudentInfo(student) {
    document.getElementById('studentName').textContent = student.name || 'N/A';
    document.getElementById('studentYear').textContent = student.year || 'N/A';
    document.getElementById('studentDivision').textContent = student.division || 'N/A';
    document.getElementById('studentBatch').textContent = student.batch || 'N/A';
}

// Fetch subjects from Firebase
async function fetchSubjects(student, uid) {
    try {
        // Query subjects collection matching student year, division, and batch
        console.log('Fetching subjects for:', { year: student.year, division: student.division, batch: student.batch });

        const subjectsSnapshot = await db.collection('subjects')
            .where('year', '==', student.year)
            .where('division', '==', student.division)
            .where('batch', '==', student.batch)
            .get();

        console.log('Subjects found in database:', subjectsSnapshot.size);

        let subjectsData = [];
        subjectsSnapshot.forEach(doc => {
            console.log('Subject document:', doc.id, doc.data());
            subjectsData.push({ id: doc.id, ...doc.data() });
        });

        // Filter subjects for TY elective support
        if (student.year === 'TY' && student.electives && student.electives.length > 0) {
            console.log('Filtering TY electives:', student.electives);
            subjectsData = subjectsData.filter(s => {
                const sName = s.originalSubjectName || (s.subject || '').replace(' (Theory)', '').replace(' (Lab)', '');
                return student.electives.includes(sName);
            });
        }

        subjects = [];
        if (subjectsData.length === 0) {
            document.getElementById('subjectCards').innerHTML = "<p>No subjects found. Please contact your administrator.</p>";
            return;
        }

        subjectsData.forEach(s => {
            const isLabSubject = s.hasLab || s.type === "lab" || s.type === "both" || s.subject.toLowerCase().includes('lab');
            const isTheorySubject = s.type === "theory" || s.type === "both" || s.subject.toLowerCase().includes('theory') || (!s.type && !isLabSubject);

            subjects.push({
                id: s.id,
                name: s.subject,
                originalSubjectName: s.originalSubjectName || s.subject.replace(' (Theory)', '').replace(' (Lab)', ''),
                subjectStructureId: s.subjectStructureId || s.id,
                originalId: s.originalSubjectName || s.subject,
                displayName: s.subject,
                componentType: s.type,
                faculty: s.faculty || 'Not Assigned',
                type: s.type,
                subjectType: s.subjectType || s.type,
                parentType: s.parentType || s.type,
                hasLab: isLabSubject,
                hasTheory: isTheorySubject,
                totalPracticals: s.totalPracticals || 10,
                practicalsCompleted: 0,
                practicalProgress: 0,
                ta1Completed: false,
                ta2Completed: false,
                iseCompleted: 0,
                notesUploaded: false,
                isLabSubmitted: false,
                unitsCompleted: 0,
                isSubmitted: false,
                sequenceOrder: s.sequenceOrder || 0
            });
        });

        // Sort subjects by sequence order
        subjects.sort((a, b) => (a.sequenceOrder || 0) - (b.sequenceOrder || 0));

        // Load feedback data for each subject
        const promises = subjects.map(subject => loadSubmittedFeedback(subject, uid));
        await Promise.all(promises);
        renderSubjects();
    } catch (err) {
        console.error('Error fetching subjects:', err);
        document.getElementById('subjectCards').innerHTML = "<p>Error loading subjects. Please refresh the page.</p>";
    }
}

// Calculate AVG Count based on TA selections:
// None = 0, TA1 = 1, TA2 = 2, TA1+TA2 = 2
function getTaCount(ta1Completed, ta2Completed) {
    if (ta2Completed) return 2;
    if (ta1Completed) return 1;
    return 0;
}

// Load submitted feedback for a subject
async function loadSubmittedFeedback(subject, uid) {
    try {
        // First, try to load the final feedback submission
        const finalSnapshot = await db.collection("feedback")
            .where("studentId", "==", uid)
            .where("subjectId", "==", subject.id)
            .get();

        let finalFeedback = null;
        finalSnapshot.forEach(doc => {
            const data = doc.data();
            // Check if this is a final submission
            if (doc.id.includes('_final') || (!data.unit && data.unitsCompleted !== undefined)) {
                finalFeedback = data;
            }
        });

        if (finalFeedback) {
            // Load final feedback data
            if (subject.hasLab) {
                // Lab subject: load practicals data
                subject.totalPracticals = finalFeedback.totalPracticals || 10;
                subject.practicalsCompleted = finalFeedback.practicalsCompleted || 0;
                subject.practicalProgress = finalFeedback.practicalProgress || 0;
                subject.isLabSubmitted = true;
            } else {
                // Theory subject: load simplified units data
                subject.unitsCompleted = finalFeedback.unitsCompleted || 0;
                if (finalFeedback.ta1Completed !== undefined || finalFeedback.ta2Completed !== undefined) {
                    subject.ta1Completed = !!finalFeedback.ta1Completed;
                    subject.ta2Completed = !!finalFeedback.ta2Completed;
                    subject.iseCompleted = getTaCount(subject.ta1Completed, subject.ta2Completed);
                } else if (finalFeedback.iseCompleted !== undefined) {
                    const num = Number(finalFeedback.iseCompleted) || 0;
                    subject.iseCompleted = num;
                    subject.ta1Completed = num >= 1;
                    subject.ta2Completed = num >= 2;
                }
                subject.notesUploaded = finalFeedback.notesUploaded || false;
                subject.isSubmitted = finalFeedback.isSubmitted || false;
            }

            // Mark subject as having final feedback submitted
            subject.hasFinalFeedback = true;
        } else {
            // Load individual field submissions if no final feedback exists
            const fieldSnapshot = await db.collection("feedback")
                .where("studentId", "==", uid)
                .where("subjectId", "==", subject.id)
                .get();

            fieldSnapshot.forEach(doc => {
                const data = doc.data();

                // Handle practicals-based feedback for lab subjects
                if (subject.hasLab && data.totalPracticals) {
                    subject.totalPracticals = data.totalPracticals;
                    subject.practicalsCompleted = data.practicalsCompleted || 0;
                    subject.practicalProgress = data.practicalProgress || 0;
                    subject.isLabSubmitted = data.isLabSubmitted || false;
                }

                // Handle simplified unitsCompleted field
                if (!subject.hasLab && data.unitsCompleted !== undefined) {
                    subject.unitsCompleted = data.unitsCompleted || 0;
                }

                if (!subject.hasLab) {
                    if (data.ta1Completed !== undefined || data.ta2Completed !== undefined) {
                        subject.ta1Completed = !!data.ta1Completed;
                        subject.ta2Completed = !!data.ta2Completed;
                        subject.iseCompleted = getTaCount(subject.ta1Completed, subject.ta2Completed);
                    } else if (data.iseCompleted !== undefined) {
                        const num = Number(data.iseCompleted) || 0;
                        subject.iseCompleted = num;
                        subject.ta1Completed = num >= 1;
                        subject.ta2Completed = num >= 2;
                    }
                }
            });
        }
    } catch (err) {
        console.error('Error loading feedback:', err);
    }
}

// Render subject cards
function renderSubjects() {
    const container = document.getElementById('subjectCards');

    // Group subjects by structureId
    const subjectGroups = {};
    subjects.forEach(s => {
        const gid = s.subjectStructureId;
        if (!subjectGroups[gid]) {
            subjectGroups[gid] = {
                id: gid,
                name: s.originalSubjectName,
                components: [],
                sequenceOrder: s.sequenceOrder
            };
        }
        subjectGroups[gid].components.push(s);
    });

    const groupsArray = Object.values(subjectGroups).sort((a, b) => (a.sequenceOrder || 0) - (b.sequenceOrder || 0));

    container.innerHTML = groupsArray.map((group, groupIndex) => {
        return `
        <div class="subject-card" style="animation-delay: ${0.1 * (groupIndex + 3)}s; margin-bottom: 2rem; border: 1px solid #e5e7eb; box-shadow: 0 4px 20px rgba(0,0,0,0.05);">
            <div class="subject-header" style="background: linear-gradient(135deg, #970b0bff 0%, #03193dff 100%); padding: 1.5rem;">
                <h3 class="subject-name" style="margin: 0; color: white; font-size: 1.5rem; font-weight: 700;">${group.name}</h3>
            </div>

            <div class="units-container" style="padding: 1.5rem;">
                ${group.components.map((subject, compIndex) => {
            const isSubmitted = subject.isSubmitted || subject.isLabSubmitted;
            return `
                    <div class="sub-subject-section" style="${compIndex < group.components.length - 1 ? 'border-bottom: 2px dashed #f3f4f6; padding-bottom: 2rem; margin-bottom: 2rem;' : ''}">
                         <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 1.5rem;">
                            <span class="component-badge ${subject.type === 'both' ? 'badge-both' : (subject.hasLab ? 'badge-lab' : 'badge-theory')}">
                                ${subject.type === 'both' ? 'Theory + Lab' : (subject.hasLab ? 'Lab' : 'Theory')}
                            </span>
                            <p class="subject-faculty" style="margin: 0; font-weight: 500; color: #4b5563;">Faculty: <span class="faculty-name" style="color: #111827; font-weight: 600;">${subject.faculty}</span></p>
                        </div>

                        ${subject.hasLab ? `
                            <div class="practicals-section lab-section">
                                <div class="practical-header">
                                    <h4 class="practical-title">Practical Completion</h4>
                                    <p class="practical-subtitle">Track your practical progress</p>
                                </div>

                                <div class="practical-input-section">
                                    <div class="practical-form-group">
                                        <label class="practical-label">Total Number of Practicals</label>
                                            <input
                                                type="number"
                                                class="practical-total-input"
                                                id="totalPracticals-${subject.id}"
                                                min="0"
                                                max="10"
                                                value="${subject.totalPracticals}"
                                                placeholder="Max 10"
                                                oninput="updateTotalPracticals('${subject.id}', this.value)"
                                            />
                                    </div>

                                    <div class="practical-form-group">
                                        <label class="practical-label">Practicals Completed</label>
                                            <input
                                                type="number"
                                                class="practical-completed-input"
                                                id="completedPracticals-${subject.id}"
                                                min="0"
                                                max="${subject.totalPracticals}"
                                                value="${subject.practicalsCompleted || 0}"
                                                placeholder="Enter completed practicals"
                                                oninput="updatePracticalsCompleted('${subject.id}', this.value)"
                                            />
                                    </div>
                                </div>

                                <div class="practical-progress-section">
                                    <div class="progress-header">
                                        <label class="progress-label">Practical Progress (%)</label>
                                    </div>

                                    <div class="progress-bar-wrapper">
                                        <div class="progress-bar progress-bar-lab" id="practicalProgress-${subject.id}" style="width: ${subject.practicalProgress || 0}%">
                                            <div class="progress-shimmer"></div>
                                        </div>
                                    </div>
                                    <p class="progress-text" id="practicalProgressText-${subject.id}">${subject.practicalProgress || 0}% Complete (${subject.practicalsCompleted || 0}/${subject.totalPracticals} practicals)</p>

                                    ${((subject.practicalProgress || 0) === 100) && !subject.isLabSubmitted ? `
                                        <div class="practical-submit-section" style="margin-top: 15px;">
                                            <button class="submit-progress-btn" onclick="submitPracticals('${subject.id}')">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                                                    <polyline points="22 4 12 14.01 9 11.01"/>
                                                </svg>
                                                Submit Practical Progress
                                            </button>
                                        </div>
                                    ` : ''}
                                </div>
                            </div>
                        ` : ''}

                        ${subject.hasTheory ? `
                            <div class="theory-units-section theory-section">
                                <div class="theory-units-header">
                                    <h4 class="theory-units-title">Unit Progress</h4>
                                    <p class="theory-units-subtitle">Enter the number of units completed</p>
                                </div>

                                <div class="units-completed-section">
                                    <div class="form-group">
                                        <input
                                            type="number"
                                            class="attendance-input units-completed-input"
                                            id="unitsCompleted-${subject.id}"
                                            min="0"
                                            max="6"
                                            step="0.01"
                                            inputmode="decimal"
                                            value="${subject.unitsCompleted || 0}"
                                            placeholder="Enter number of units completed (e.g., 1.5)"
                                            ${subject.isSubmitted ? 'disabled' : ''}
                                            oninput="updateUnitsCompleted('${subject.id}', this.value)"
                                        />
                                    </div>
                                </div>

                                <div class="attendance-grid">
                                    <div class="form-group">
                                        <label class="attendance-label">Notes Uploaded on ERP</label>
                                        <select class="attendance-select" ${subject.isSubmitted ? 'disabled' : ''} onchange="updateNotesUploaded('${subject.id}', this.value)">
                                            <option value="No" ${subject.notesUploaded === false || subject.notesUploaded === 'No' || !subject.notesUploaded ? 'selected' : ''}>No</option>
                                            <option value="Yes" ${subject.notesUploaded === true || subject.notesUploaded === 'Yes' ? 'selected' : ''}>Yes</option>
                                        </select>
                                    </div>
                                    <div class="form-group ta-checkboxes-group">
                                        <label class="attendance-label" style="display: block; margin-bottom: 8px;">TA / ISE Status</label>
                                        <div style="display: flex; gap: 15px; align-items: center; margin-top: 5px;">
                                            <label style="display: inline-flex; align-items: center; gap: 6px; cursor: pointer; font-size: 0.95rem; color: #333;">
                                                <input
                                                    type="checkbox"
                                                    id="ta1-${subject.id}"
                                                    ${subject.ta1Completed ? 'checked' : ''}
                                                    ${subject.isSubmitted ? 'disabled' : ''}
                                                    onchange="updateTa1Completed('${subject.id}', this.checked)"
                                                    style="width: 18px; height: 18px; cursor: pointer; accent-color: #4f46e5;"
                                                />
                                                <strong>TA1 Completed</strong>
                                            </label>
                                            <label style="display: inline-flex; align-items: center; gap: 6px; cursor: pointer; font-size: 0.95rem; color: #333;">
                                                <input
                                                    type="checkbox"
                                                    id="ta2-${subject.id}"
                                                    ${subject.ta2Completed ? 'checked' : ''}
                                                    ${subject.isSubmitted ? 'disabled' : ''}
                                                    onchange="updateTa2Completed('${subject.id}', this.checked)"
                                                    style="width: 18px; height: 18px; cursor: pointer; accent-color: #4f46e5;"
                                                />
                                                <strong>TA2 Completed</strong>
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ` : ''}
                    </div>
                    `;
        }).join('')}
            </div>
        </div>
    `;
    }).join('');
}

// Update units completed
function updateUnitsCompleted(subjectId, value) {
    const subject = subjects.find(s => s.id === subjectId);
    if (!subject) return;

    // Validate: 0-6 (allow decimals)
    const unitsCompleted = Math.min(6, Math.max(0, parseFloat(value) || 0));
    subject.unitsCompleted = unitsCompleted;

    // Update the display directly only if necessary to avoid cursor jumping
    const inputElement = document.getElementById(`unitsCompleted-${subjectId}`);
    if (inputElement) {
        // If the user is typing a decimal point, don't force-format the value back
        if (!value.endsWith('.') && !value.endsWith('0')) {
             // Only force sync if the parsed value is different from input text in a meaningful way
             if (parseFloat(inputElement.value) !== unitsCompleted) {
                inputElement.value = unitsCompleted;
             }
        }
    }
}

// Update total practicals for lab subjects
function updateTotalPracticals(subjectId, value) {
    const subject = subjects.find(s => s.id === subjectId);
    if (!subject) return;
    const totalPracticals = Math.min(10, Math.max(0, parseInt(value) || 0));
    subject.totalPracticals = totalPracticals;
    
    // Strict Clamping: Update input value in DOM immediately
    const input = document.getElementById(`totalPracticals-${subjectId}`);
    if (input) input.value = totalPracticals;

    // Update the max attribute of completed practicals input
    const completedInput = document.getElementById(`completedPracticals-${subjectId}`);
    if (completedInput) {
        completedInput.max = totalPracticals;
    }

    // Recalculate progress if completed practicals exceed new total
    if (subject.practicalsCompleted > totalPracticals) {
        subject.practicalsCompleted = totalPracticals;
        updatePracticalsCompleted(subjectId, totalPracticals);
    } else {
        updatePracticalsCompleted(subjectId, subject.practicalsCompleted || 0);
    }
}

// Update completed practicals and progress bar immediately
function updatePracticalsCompleted(subjectId, value) {
    const subject = subjects.find(s => s.id === subjectId);
    if (!subject) return;
    const completedPracticals = Math.min(Math.min(Math.max(0, parseInt(value) || 0), subject.totalPracticals || 10), 10);
    subject.practicalsCompleted = completedPracticals;
    
    // Strict Clamping: Update input value in DOM immediately
    const input = document.getElementById(`completedPracticals-${subjectId}`);
    if (input) input.value = completedPracticals;

    // Calculate progress percentage
    const progress = subject.totalPracticals > 0 ? Math.round((completedPracticals / subject.totalPracticals) * 100) : 0;
    subject.practicalProgress = progress;

    // Update progress bar immediately
    const progressBar = document.getElementById(`practicalProgress-${subjectId}`);
    const progressText = document.getElementById(`practicalProgressText-${subjectId}`);

    if (progressBar) {
        progressBar.style.width = `${progress}%`;
    }
    if (progressText) {
        progressText.textContent = `${progress}% Complete (${completedPracticals}/${subject.totalPracticals} practicals)`;
    }
}

// Update TA1 completed
function updateTa1Completed(subjectId, checked) {
    const subject = subjects.find(s => s.id === subjectId);
    if (!subject) return;
    subject.ta1Completed = !!checked;
    subject.iseCompleted = getTaCount(subject.ta1Completed, subject.ta2Completed);
}

// Update TA2 completed
function updateTa2Completed(subjectId, checked) {
    const subject = subjects.find(s => s.id === subjectId);
    if (!subject) return;
    subject.ta2Completed = !!checked;
    subject.iseCompleted = getTaCount(subject.ta1Completed, subject.ta2Completed);
}

// Update ISE completed (legacy shim)
function updateIseCompleted(subjectId, value) {
    const subject = subjects.find(s => s.id === subjectId);
    if (!subject) return;
    const val = Math.max(0, parseInt(value) || 0);
    subject.iseCompleted = val;
    subject.ta1Completed = val >= 1;
    subject.ta2Completed = val >= 2;
}

// Update notes uploaded (checkbox) for theory subjects
function updateNotesUploaded(subjectId, value) {
    const subject = subjects.find(s => s.id === subjectId);
    if (subject) {
        subject.notesUploaded = value;
    }
}

// Submit units progress (freeze theory subject)
async function submitUnitsProgress(subjectId) {
    const subject = subjects.find(s => s.id === subjectId);

    if (!subject) {
        alert("Error: Subject not found");
        return;
    }

    if (subject.unitsCompleted !== 6) {
        alert('Please complete all 6 units before submitting.');
        return;
    }

    try {
        const feedbackData = {
            studentId: currentUser.uid,
            subjectId: subjectId,
            unitsCompleted: subject.unitsCompleted,
            theoryAttendanceFilled: 'Yes',
            ta1Completed: !!subject.ta1Completed,
            ta2Completed: !!subject.ta2Completed,
            iseCompleted: getTaCount(subject.ta1Completed, subject.ta2Completed),
            notesUploaded: subject.notesUploaded,
            isSubmitted: true,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        await db.collection("feedback").doc(`${currentUser.uid}_${subjectId}_units`).set(feedbackData);

        subject.isSubmitted = true;

        // Re-render subjects to show updated state
        renderSubjects();

        alert('Unit progress has been submitted!');
    } catch (err) {
        console.error('Error submitting unit feedback:', err);
        alert('Error submitting unit feedback');
    }
}

// Submit practicals progress (freeze lab subject)
async function submitPracticals(subjectId) {
    const subject = subjects.find(s => s.id === subjectId);

    if (subject.practicalProgress !== 100) {
        alert('Please complete practical progress to 100% before submitting.');
        return;
    }

    try {
        const feedbackData = {
            studentId: currentUser.uid,
            subjectId: subjectId,
            subjectName: subject.name,
            type: subject.type || 'lab',
            totalPracticals: subject.totalPracticals,
            practicalsCompleted: subject.practicalsCompleted,
            practicalProgress: subject.practicalProgress,
            labAttendanceFilled: 'Yes',
            isLabSubmitted: true,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        await db.collection("feedback").doc(`${currentUser.uid}_${subjectId}_lab`).set(feedbackData);

        subject.isLabSubmitted = true;

        // Re-render subjects to show updated state
        renderSubjects();

        alert('Practical progress has been submitted!');
    } catch (err) {
        console.error('Error submitting practical feedback:', err);
        alert('Error submitting practical feedback');
    }
}

// Handle batch selection
document.addEventListener('DOMContentLoaded', () => {
    const batchOptions = document.querySelectorAll('.batch-option');
    batchOptions.forEach(option => {
        option.addEventListener('click', () => {
            batchOptions.forEach(opt => opt.classList.remove('batch-selected'));
            option.classList.add('batch-selected');
        });
    });
});

// Handle submit
async function handleSubmit() {
    const submitBtn = document.getElementById('submitBtn');
    const submitText = submitBtn.querySelector('.submit-text');
    const submitIcon = submitBtn.querySelector('.submit-icon');
    const submitSpinner = submitBtn.querySelector('.submit-spinner');

    // Clear previous errors
    document.querySelectorAll('.input-error').forEach(el => el.classList.remove('input-error'));

    // Validation logic
    let isValid = true;
    let firstErrorElement = null;

    const setError = (id, condition) => {
        if (condition) {
            const el = document.getElementById(id);
            if (el) {
                el.classList.add('input-error');
                if (!firstErrorElement) firstErrorElement = el;
            }
            isValid = false;
        }
    };

    subjects.forEach(subject => {
        if (subject.hasLab) {
            // Lab validation
            setError(`totalPracticals-${subject.id}`, !subject.totalPracticals || subject.totalPracticals <= 0 || subject.totalPracticals > 10);
            setError(`completedPracticals-${subject.id}`, subject.practicalsCompleted < 0 || subject.practicalsCompleted > (subject.totalPracticals || 10) || subject.practicalsCompleted > 10);
        } else {
            // Theory validation
            setError(`unitsCompleted-${subject.id}`, subject.unitsCompleted === undefined || subject.unitsCompleted < 0 || subject.unitsCompleted > 6);
        }
    });

    if (!isValid) {
        if (firstErrorElement) {
            firstErrorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            firstErrorElement.focus();
        }
        alert('Please fix the errors before submitting.');
        return;
    }

    submitBtn.disabled = true;
    submitText.textContent = 'Submitting Feedback...';
    submitIcon.style.display = 'none';
    submitSpinner.style.display = 'block';

    try {
        // Collect all feedback data
        const feedbackPromises = subjects.map(async (subject) => {
            const feedbackData = {
                studentId: currentUser.uid,
                subjectId: subject.id,
                subjectName: subject.name,
                type: subject.type,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            if (subject.hasLab) {
                // Lab subject: save practicals data
                feedbackData.totalPracticals = subject.totalPracticals;
                feedbackData.practicalsCompleted = subject.practicalsCompleted;
                feedbackData.practicalProgress = subject.practicalProgress;
                feedbackData.labAttendanceFilled = 'Yes';
                feedbackData.isLabSubmitted = subject.isLabSubmitted;
            } else {
                // Theory subject: save simplified units data
                feedbackData.unitsCompleted = subject.unitsCompleted;
                feedbackData.theoryAttendanceFilled = 'Yes';
                feedbackData.ta1Completed = !!subject.ta1Completed;
                feedbackData.ta2Completed = !!subject.ta2Completed;
                feedbackData.iseCompleted = getTaCount(subject.ta1Completed, subject.ta2Completed);
                feedbackData.notesUploaded = subject.notesUploaded;
                feedbackData.isSubmitted = subject.isSubmitted;
            }

            // Save to database
            return db.collection("feedback").doc(`${currentUser.uid}_${subject.id}_final`).set(feedbackData);
        });

        await Promise.all(feedbackPromises);

        submitBtn.disabled = false;
        submitText.textContent = 'Submit Feedback';
        submitIcon.style.display = 'block';
        submitSpinner.style.display = 'none';

        // Show success modal
        const modal = document.getElementById('successModal');
        modal.style.display = 'flex';

        // Refresh subjects data and re-render to show any newly unlocked units
        // This will check for updated unit states without page reload
        if (currentStudent && currentUser) {
            await fetchSubjects(currentStudent, currentUser.uid);
        }
    } catch (err) {
        console.error('Error submitting feedback:', err);
        alert('Error submitting feedback. Please try again.');
        submitBtn.disabled = false;
        submitText.textContent = 'Submit Feedback';
        submitIcon.style.display = 'block';
        submitSpinner.style.display = 'none';
    }
}

// Close success modal
function closeSuccessModal() {
    const modal = document.getElementById('successModal');
    modal.style.display = 'none';
}

// Handle logout
function handleLogout() {
    if (confirm('Are you sure you want to logout?')) {
        auth.signOut().then(() => {
            window.location.href = 'index.html';
        });
    }
}

// Parallax effect
document.addEventListener('mousemove', (e) => {
    const shapes = document.querySelectorAll('.shape');
    const x = e.clientX / window.innerWidth;
    const y = e.clientY / window.innerHeight;

    shapes.forEach((shape, index) => {
        const speed = (index + 1) * 10;
        const xMove = (x - 0.5) * speed;
        const yMove = (y - 0.5) * speed;
        shape.style.transform = `translate(${xMove}px, ${yMove}px)`;
    });
});

