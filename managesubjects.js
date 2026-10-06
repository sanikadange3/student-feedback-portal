// Global variables
let currentYear = '';
let subjectStructure = [];
let editingSubjectId = null;

// Toggle faculty fields based on selected divisions
function toggleFacultyFields() {
    const divA = document.getElementById('divA');
    const divB = document.getElementById('divB');
    const divC = document.getElementById('divC');
    
    if (!divA || !divB || !divC) return;
    
    const facultyGroupA = document.getElementById('facultyGroupA');
    const facultyGroupB = document.getElementById('facultyGroupB');
    const facultyGroupC = document.getElementById('facultyGroupC');
    
    // Show/hide faculty fields based on checkbox selection
    if (facultyGroupA) facultyGroupA.style.display = divA.checked ? 'block' : 'none';
    if (facultyGroupB) facultyGroupB.style.display = divB.checked ? 'block' : 'none';
    if (facultyGroupC) facultyGroupC.style.display = divC.checked ? 'block' : 'none';

    const subjectType = document.getElementById('type')?.value;
    
    const divChecks = { 'A': divA.checked, 'B': divB.checked, 'C': divC.checked };

    ['A', 'B', 'C'].forEach(div => {
        const theoryWrapper = document.getElementById(`div${div}-theory-wrapper`);
        const labWrapper = document.getElementById(`div${div}-lab-wrapper`);
        const theoryInput = document.getElementById(`faculty${div}_theory`);
        const labInput = document.getElementById(`faculty${div}_lab`);
        
        if (!theoryWrapper || !labWrapper) return;
        
        const isDivChecked = divChecks[div];

        if (subjectType === 'theory') {
            theoryWrapper.style.display = 'block';
            labWrapper.style.display = 'none';
            if (theoryInput) theoryInput.required = isDivChecked;
            if (labInput) labInput.required = false;
        } else if (subjectType === 'practical') {
            theoryWrapper.style.display = 'none';
            labWrapper.style.display = 'block';
            if (theoryInput) theoryInput.required = false;
            if (labInput) labInput.required = isDivChecked;
        } else if (subjectType === 'both') {
            theoryWrapper.style.display = 'block';
            labWrapper.style.display = 'block';
            if (theoryInput) theoryInput.required = isDivChecked;
            if (labInput) labInput.required = isDivChecked;
        } else {
            theoryWrapper.style.display = 'none';
            labWrapper.style.display = 'none';
            if (theoryInput) theoryInput.required = false;
            if (labInput) labInput.required = false;
        }
    });
}

// Handle year selection change
async function onYearChange() {
    const yearSelect = document.getElementById('classYear');
    currentYear = yearSelect.value;
    
    const subjectStructureSection = document.getElementById('subjectStructureSection');
    const addSubjectForm = document.getElementById('addSubjectForm');
    const modeIndicator = document.getElementById('modeIndicator');
    const modeText = document.getElementById('modeText');
    const selectedYearDisplay = document.getElementById('selectedYearDisplay');
    
    if (!currentYear) {
        subjectStructureSection.classList.add('hidden');
        addSubjectForm.classList.add('hidden');
        modeIndicator.classList.add('hidden');
        return;
    }
    
    // Show the subject structure section
    subjectStructureSection.classList.remove('hidden');
    selectedYearDisplay.textContent = getYearName(currentYear);
    
    // Load existing subjects for this year
    await loadSubjectStructure(currentYear);
}

// Load subject structure from Firestore
async function loadSubjectStructure(year) {
    const subjectList = document.getElementById('subjectList');
    const emptyState = document.getElementById('emptyState');
    const modeIndicator = document.getElementById('modeIndicator');
    const modeText = document.getElementById('modeText');
    
    try {
        console.log('Loading subjects for year:', year);
        
        // Get subjects for this year from subjectStructures collection
        const snapshot = await db.collection('subjectStructures')
            .where('year', '==', year)
            .get();
        
        console.log('Query snapshot size:', snapshot.size);
        
        subjectStructure = [];
        snapshot.forEach(doc => {
            subjectStructure.push({ id: doc.id, ...doc.data() });
        });
        
        console.log('Loaded subjects:', subjectStructure);
        
        // Sort locally by sequence order
        subjectStructure.sort((a, b) => (a.sequenceOrder || 0) - (b.sequenceOrder || 0));
        
        if (subjectStructure.length === 0) {
            // No subjects defined yet - show empty state and add new mode
            subjectList.innerHTML = '';
            emptyState.classList.remove('hidden');
            modeText.textContent = 'Add subjects for this year';
            modeText.className = 'mode-indicator mode-add-new';
            modeIndicator.classList.remove('hidden');
        } else {
            // Subjects exist - show them
            emptyState.classList.add('hidden');
            renderSubjectList();
            
            // Check if any subjects need faculty assignment
            const needsFacultyAssignment = subjectStructure.some(s => !s.faculty || (!s.faculty.A?.theoryFaculty && !s.faculty.A?.practicalFaculty));
            if (needsFacultyAssignment) {
                modeText.textContent = 'Assign faculty to divisions';
                modeText.className = 'mode-indicator mode-add-faculty';
            } else {
                modeText.textContent = subjectStructure.length + ' subjects defined';
                modeText.className = 'mode-indicator mode-add-new';
            }
            modeIndicator.classList.remove('hidden');
        }
    } catch (error) {
        console.error('Error loading subject structure:', error);
        showError('Error loading subjects: ' + error.message);
    }
}

// Render the subject list with grouping by division and type
function renderSubjectList() {
    const subjectList = document.getElementById('subjectList');
    
    if (!subjectList) return;
    
    if (subjectStructure.length === 0) {
        subjectList.innerHTML = '';
        const emptyState = document.getElementById('emptyState');
        if (emptyState) emptyState.classList.remove('hidden');
        return;
    }
    
    const emptyState = document.getElementById('emptyState');
    if (emptyState) emptyState.classList.add('hidden');
    
    // Sort by sequence order
    const sortedSubjects = [...subjectStructure].sort((a, b) => a.sequenceOrder - b.sequenceOrder);
    
    // Group subjects by division
    const groupedByDivision = {};
    sortedSubjects.forEach(subject => {
        if (!subject.divisions || subject.divisions.length === 0) return;
        
        subject.divisions.forEach(div => {
            if (!groupedByDivision[div]) {
                groupedByDivision[div] = { theory: [], practical: [], both: [] };
            }
            if (subject.type === 'theory') {
                groupedByDivision[div].theory.push(subject);
            } else if (subject.type === 'practical' || subject.type === 'lab') {
                groupedByDivision[div].practical.push(subject);
            } else if (subject.type === 'both') {
                groupedByDivision[div].both.push(subject);
            }
        });
    });
    
    // Sort divisions: A, B, C
    const sortedDivisions = Object.keys(groupedByDivision).sort();
    
    let html = '';
    
    sortedDivisions.forEach((division, divIndex) => {
        const group = groupedByDivision[division];
        
        // Add division header
        html += `
            <div class="division-header" style="background: linear-gradient(135deg, #7c3aed 0%, #2563eb 100%); color: white; padding: 12px 20px; border-radius: 8px; margin: 20px 0 15px 0; font-weight: 600; font-size: 14px;">
                Division ${division}
            </div>
        `;
        
        // Add Theory subjects
        group.theory.forEach(subject => {
            html += `
                <div class="subject-item">
                    <div class="subject-info">
                        <div class="subject-name">
                            ${subject.subjectName}
                            <span class="subject-type-indicator type-theory">Theory</span>
                        </div>
                        <div class="subject-meta">
                            <span>Sequence: ${subject.sequenceOrder}</span>
                            <span>Batch: ${subject.batch === 'all' ? 'All' : subject.batch}</span>
                            <span>Divisions: ${getDivisionsText(subject.divisions)}</span>
                        </div>
                        <div class="subject-meta" style="margin-top: 5px;">
                            <strong>Faculty:</strong> 
                            ${subject.faculty ? 
                                `[A] Th: ${subject.faculty.A?.theoryFaculty || 'N/A'}, Lb: ${subject.faculty.A?.practicalFaculty || 'N/A'} | [B] Th: ${subject.faculty.B?.theoryFaculty || 'N/A'}, Lb: ${subject.faculty.B?.practicalFaculty || 'N/A'} | [C] Th: ${subject.faculty.C?.theoryFaculty || 'N/A'}, Lb: ${subject.faculty.C?.practicalFaculty || 'N/A'}` 
                                : 'Not assigned'}
                        </div>
                    </div>
                    <div class="subject-actions">
                        <button class="delete-btn" onclick="deleteSubject('${subject.id}')">Delete</button>
                    </div>
                </div>
            `;
        });
        
        // Add blank row separator between Theory and Practical
        if (group.theory.length > 0 && group.practical.length > 0) {
            html += `<div class="row-separator" style="height: 15px;"></div>`;
        }
        
        // Add Practical subjects
        group.practical.forEach(subject => {
            html += `
                <div class="subject-item">
                    <div class="subject-info">
                        <div class="subject-name">
                            ${subject.subjectName}
                            <span class="subject-type-indicator type-practical">Practical</span>
                        </div>
                        <div class="subject-meta">
                            <span>Sequence: ${subject.sequenceOrder}</span>
                            <span>Batch: ${subject.batch === 'all' ? 'All' : subject.batch}</span>
                            <span>Divisions: ${getDivisionsText(subject.divisions)}</span>
                        </div>
                        <div class="subject-meta" style="margin-top: 5px;">
                            <strong>Faculty:</strong> 
                            ${subject.faculty ? 
                                `[A] Th: ${subject.faculty.A?.theoryFaculty || 'N/A'}, Lb: ${subject.faculty.A?.practicalFaculty || 'N/A'} | [B] Th: ${subject.faculty.B?.theoryFaculty || 'N/A'}, Lb: ${subject.faculty.B?.practicalFaculty || 'N/A'} | [C] Th: ${subject.faculty.C?.theoryFaculty || 'N/A'}, Lb: ${subject.faculty.C?.practicalFaculty || 'N/A'}` 
                                : 'Not assigned'}
                        </div>
                    </div>
                    <div class="subject-actions">
                        <button class="delete-btn" onclick="deleteSubject('${subject.id}')">Delete</button>
                    </div>
                </div>
            `;
        });
        
        // Add blank row separator between Practical and Both
        if ((group.theory.length > 0 || group.practical.length > 0) && group.both.length > 0) {
            html += `<div class="row-separator" style="height: 15px;"></div>`;
        }

        // Add 'Both' subjects
        group.both.forEach(subject => {
            html += `
                <div class="subject-item">
                    <div class="subject-info">
                        <div class="subject-name">
                            ${subject.subjectName}
                            <span class="subject-type-indicator type-both" style="background: #fdf4ff; color: #c026d3; padding: 2px 8px; border-radius: 12px; font-size: 12px; margin-left: 8px;">Theory + Practical</span>
                        </div>
                        <div class="subject-meta">
                            <span>Sequence: ${subject.sequenceOrder}</span>
                            <span>Batch: ${subject.batch === 'all' ? 'All' : subject.batch}</span>
                            <span>Divisions: ${getDivisionsText(subject.divisions)}</span>
                        </div>
                        <div class="subject-meta" style="margin-top: 5px;">
                            <strong>Faculty:</strong> 
                            ${subject.faculty ? 
                                `[A] Th: ${subject.faculty.A?.theoryFaculty || 'N/A'}, Lb: ${subject.faculty.A?.practicalFaculty || 'N/A'} | [B] Th: ${subject.faculty.B?.theoryFaculty || 'N/A'}, Lb: ${subject.faculty.B?.practicalFaculty || 'N/A'} | [C] Th: ${subject.faculty.C?.theoryFaculty || 'N/A'}, Lb: ${subject.faculty.C?.practicalFaculty || 'N/A'}` 
                                : 'Not assigned'}
                        </div>
                    </div>
                    <div class="subject-actions">
                        <button class="delete-btn" onclick="deleteSubject('${subject.id}')">Delete</button>
                    </div>
                </div>
            `;
        });
        
        // Add blank row separator between divisions
        if (divIndex < sortedDivisions.length - 1) {
            html += `<div class="division-separator" style="height: 25px; margin: 10px 0;"></div>`;
        }
    });
    
    subjectList.innerHTML = html;
}

// Helper function to get divisions text
function getDivisionsText(divisions) {
    if (!divisions || divisions.length === 0) return 'None';
    return divisions.join(', ');
}

// Helper function to get year name
function getYearName(year) {
    const yearNames = {
        'FY': 'First Year (FY)',
        'SY': 'Second Year (SY)',
        'TY': 'Third Year (TY)'
    };
    return yearNames[year] || year;
}

// Show add subject form
function showAddSubjectForm() {
    const formCard = document.getElementById('addSubjectForm');
    const formTitle = document.getElementById('formTitle');
    const submitBtnText = document.getElementById('submitBtnText');
    
    if (!formCard) return;
    
    // Reset form
    document.getElementById('subjectForm').reset();
    editingSubjectId = null;
    
    // Set default sequence order
    const nextSequence = subjectStructure.length + 1;
    document.getElementById('sequenceOrder').value = nextSequence;
    
    // Reset division checkboxes to default (only Div A checked)
    document.getElementById('divA').checked = true;
    document.getElementById('divB').checked = false;
    document.getElementById('divC').checked = false;
    
    // Initialize faculty field visibility based on default selection
    toggleFacultyFields();
    
    formTitle.textContent = 'Add New Subject';
    submitBtnText.textContent = 'Add Subject';
    formCard.classList.remove('hidden');
    
    // Scroll to form
    formCard.scrollIntoView({ behavior: 'smooth' });
}

// Cancel add subject
function cancelAddSubject() {
    const formCard = document.getElementById('addSubjectForm');
    if (formCard) {
        formCard.classList.add('hidden');
    }
    const form = document.getElementById('subjectForm');
    if (form) {
        form.reset();
    }
    editingSubjectId = null;
}

// Handle subject form submission
async function handleSubjectSubmit(e) {
    e.preventDefault();
    
    const submitBtn = document.getElementById('submitBtn');
    if (submitBtn) submitBtn.disabled = true;
    
    const subjectName = document.getElementById('subjectName').value.trim();
    const type = document.getElementById('type').value;
    const sequenceOrder = parseInt(document.getElementById('sequenceOrder').value);
    const batch = document.getElementById('batch').value;
    
    // Get selected divisions
    const divisions = [];
    if (document.getElementById('divA').checked) divisions.push('A');
    if (document.getElementById('divB').checked) divisions.push('B');
    if (document.getElementById('divC').checked) divisions.push('C');
    
    // Get faculty names - only for selected divisions
    const faculty = {};
    if (document.getElementById('divA').checked) {
        faculty.A = {
            theoryFaculty: type === 'theory' || type === 'both' ? document.getElementById('facultyA_theory').value.trim() || 'Not Assigned' : 'Not Assigned',
            practicalFaculty: type === 'practical' || type === 'both' ? document.getElementById('facultyA_lab').value.trim() || 'N/A' : 'N/A'
        };
    }
    if (document.getElementById('divB').checked) {
        faculty.B = {
            theoryFaculty: type === 'theory' || type === 'both' ? document.getElementById('facultyB_theory').value.trim() || 'Not Assigned' : 'Not Assigned',
            practicalFaculty: type === 'practical' || type === 'both' ? document.getElementById('facultyB_lab').value.trim() || 'N/A' : 'N/A'
        };
    }
    if (document.getElementById('divC').checked) {
        faculty.C = {
            theoryFaculty: type === 'theory' || type === 'both' ? document.getElementById('facultyC_theory').value.trim() || 'Not Assigned' : 'Not Assigned',
            practicalFaculty: type === 'practical' || type === 'both' ? document.getElementById('facultyC_lab').value.trim() || 'N/A' : 'N/A'
        };
    }
    
    if (!subjectName || !type || !sequenceOrder || !batch) {
        showError('Please fill all required fields');
        if (submitBtn) submitBtn.disabled = false;
        return;
    }
    
    if (divisions.length === 0) {
        showError('Please select at least one division');
        if (submitBtn) submitBtn.disabled = false;
        return;
    }
    
    try {
        // Create subject structure data
        const subjectData = {
            subjectName: subjectName,
            type: type === 'practical' ? 'lab' : type,
            sequenceOrder: sequenceOrder,
            year: currentYear,
            batch: batch,
            divisions: divisions,
            faculty: faculty,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        console.log('Saving subject structure:', subjectData);
        
        let subjectDocId = editingSubjectId;
        
        if (editingSubjectId) {
            // Update existing subject
            await db.collection('subjectStructures').doc(editingSubjectId).update(subjectData);
            alert('Subject updated successfully!');
        } else {
            // Add new subject - capture the document ID
            const docRef = await db.collection('subjectStructures').add(subjectData);
            subjectDocId = docRef.id;
            alert('Subject added successfully!');
        }
        
        // Add the ID to subjectData for use in updating subjects collection
        subjectData.id = subjectDocId;
        
        // Also create/update subject entries in the subjects collection for each division
        await updateSubjectsCollection(subjectData, subjectDocId);
        
        // Reset and reload
        document.getElementById('subjectForm').reset();
        document.getElementById('addSubjectForm').classList.add('hidden');
        
        // Reset form defaults
        document.getElementById('divA').checked = true;
        document.getElementById('divB').checked = false;
        document.getElementById('divC').checked = false;
        
        await loadSubjectStructure(currentYear);
        
    } catch (error) {
        console.error('Error saving subject:', error);
        showError('Error saving subject: ' + error.message);
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
}

// Update subjects collection with faculty assignments per division
async function updateSubjectsCollection(subjectData, existingId) {
    const labBatches = subjectData.batch === 'all' ? ['B1', 'B2', 'B3'] : [subjectData.batch];
    const theoryBatches = ['B1', 'B2', 'B3'];

    const subjectId = existingId || subjectData.id;

    for (const division of subjectData.divisions) {
        // First, find all existing entries in 'subjects' collection for this specific structure ID and division
        // This allows us to clean up entries if the name or type changed
        const existingEntriesSnapshot = await db.collection('subjects')
            .where('subjectStructureId', '==', subjectId)
            .where('division', '==', division)
            .get();

        const existingDocIds = new Set();
        existingEntriesSnapshot.forEach(doc => existingDocIds.add(doc.id));

        const saveComponent = async (componentType, facultyName, hasLabStatus) => {
            const applicableBatches = (componentType === 'theory' || !hasLabStatus) ? theoryBatches : labBatches;

            for (const batch of applicableBatches) {
                let componentSuffix = '';
                if (subjectData.type === 'both') {
                    componentSuffix = componentType === 'theory' ? ' (Theory)' : ' (Lab)';
                }
                
                // CREATE A DETERMINISTIC ID: structureId + division + batch + type
                // This ensures that even if we rename the subject, the ID stays the same
                // which preserves the link to existing student feedback.
                const deterministicDocId = `${subjectId}_${division}_${batch}_${componentType}`;
                
                const subjectEntryData = {
                    subject: subjectData.subjectName + componentSuffix,
                    originalSubjectName: subjectData.subjectName,
                    faculty: facultyName,
                    year: subjectData.year,
                    division: division,
                    batch: batch,
                    type: componentType,
                    subjectType: componentType === 'theory' ? 'Theory' : 'Lab',
                    parentType: subjectData.type,
                    hasLab: hasLabStatus,
                    totalPracticals: hasLabStatus ? 10 : null,
                    subjectStructureId: subjectId,
                    sequenceOrder: subjectData.sequenceOrder,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                };

                console.log('Saving individual subject entry:', deterministicDocId, subjectEntryData);
                await db.collection('subjects').doc(deterministicDocId).set(subjectEntryData, { merge: true });
                
                // Remove from the set of docs to be deleted
                existingDocIds.delete(deterministicDocId);
            }
        };

        const facStats = subjectData.faculty[division];
        const thFac = facStats ? (facStats.theoryFaculty || 'Not Assigned') : 'Not Assigned';
        const prFac = facStats ? (facStats.practicalFaculty || 'N/A') : 'N/A';

        if (subjectData.type === 'theory') {
            await saveComponent('theory', thFac, false);
        } else if (subjectData.type === 'practical' || subjectData.type === 'lab') {
            await saveComponent('lab', prFac, true);
        } else if (subjectData.type === 'both') {
            await saveComponent('theory', thFac, false);
            await saveComponent('lab', prFac, true);
        }

        // Delete any remaining old doc IDs that were not updated (obsolete entries)
        const deletePromises = [];
        existingDocIds.forEach(id => {
            deletePromises.push(db.collection('subjects').doc(id).delete());
        });
        await Promise.all(deletePromises);
    }
}

// Delete subject
async function deleteSubject(subjectId) {
    if (!confirm('Are you sure you want to delete this subject? This will also remove it from all divisions.')) {
        return;
    }
    
    try {
        // Get the subject data first
        const subjectDoc = await db.collection('subjectStructures').doc(subjectId).get();
        const subjectData = subjectDoc.data();
        
        // Delete from subjectStructures
        await db.collection('subjectStructures').doc(subjectId).delete();
        
        // Delete from subjects collection (all divisions and batches) handling 'both' entries too
        const subjectsQuery1 = await db.collection('subjects')
            .where('year', '==', currentYear)
            .where('subject', '==', subjectData.subjectName)
            .get();
        const subjectsQuery2 = await db.collection('subjects')
            .where('year', '==', currentYear)
            .where('originalSubjectName', '==', subjectData.subjectName)
            .get();

        
        const deletePromises = [];
        subjectsQuery1.forEach(doc => {
            deletePromises.push(db.collection('subjects').doc(doc.id).delete());
        });
        subjectsQuery2.forEach(doc => {
            deletePromises.push(db.collection('subjects').doc(doc.id).delete());
        });
        
        await Promise.all(deletePromises);
        
        alert('Subject deleted successfully!');
        await loadSubjectStructure(currentYear);
        
    } catch (error) {
        console.error('Error deleting subject:', error);
        showError('Error deleting subject: ' + error.message);
    }
}

// Assign faculty to a specific division
async function assignFaculty(subjectId, division, facultyName) {
    try {
        await db.collection('subjectStructures').doc(subjectId).update({
            [`faculty.${division}`]: facultyName
        });
        
        // Also update the subjects collection
        const batches = ['B1', 'B2', 'B3'];
        const subject = subjectStructure.find(s => s.id === subjectId);
        
        if (subject) {
            for (const batch of batches) {
                const existingQuery = await db.collection('subjects')
                    .where('year', '==', currentYear)
                    .where('division', '==', division)
                    .where('batch', '==', batch)
                    .where('subject', '==', subject.subjectName)
                    .get();
                
                if (!existingQuery.empty) {
                    await db.collection('subjects').doc(existingQuery.docs[0].id).update({
                        faculty: facultyName
                    });
                }
            }
        }
        
        // Reload the subject list
        await loadSubjectStructure(currentYear);
        
    } catch (error) {
        console.error('Error assigning faculty:', error);
        showError('Error assigning faculty: ' + error.message);
    }
}

// Show error message
function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
        setTimeout(() => {
            errorDiv.style.display = 'none';
        }, 5000);
    } else {
        alert(message);
    }
}

// Initialize on page load
console.log('Manage Subjects JS loaded');

