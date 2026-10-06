// Teacher Dashboard JavaScript - Professional Features

// Sidebar Toggle
function toggleSidebar() {
  const sidebar = document.querySelector('.sidebar');
  sidebar.classList.toggle('active');
}

// Close sidebar when clicking outside
document.addEventListener('click', (e) => {
  const sidebar = document.querySelector('.sidebar');
  const toggleBtn = document.querySelector('.mobile-menu-toggle');
  
  if (!sidebar.contains(e.target) && !toggleBtn.contains(e.target)) {
    sidebar.classList.remove('active');
  }
});

// Load dashboard stats
async function loadDashboardStats() {
  try {
    // Total Students
    const studentsSnap = await window.db.collection('users').get();
    document.getElementById('totalStudents').textContent = studentsSnap.size;

    // Total Subjects (from subjectStructures)
    const subjectsSnap = await window.db.collection('subjectStructures').get();
    document.getElementById('totalSubjects').textContent = subjectsSnap.size;

    // Total Feedback
    const feedbackSnap = await window.db.collection('feedback').get();
    document.getElementById('totalFeedback').textContent = feedbackSnap.size;

    // Update recent activity (mock for now - implement real)
    updateRecentActivity();
  } catch (error) {
    console.error('Error loading stats:', error);
  }
}

// Update recent activity
function updateRecentActivity() {
  const activityList = document.querySelector('.activity-list');
  // Mock recent activities - replace with real Firestore listener
  activityList.innerHTML = `
    <div class="activity-item">
      <div class="activity-icon bg-primary">👤</div>
      <div class="activity-content">
        <div class="activity-title">New student registered</div>
        <div class="activity-time">2 hours ago</div>
      </div>
    </div>
    <div class="activity-item">
      <div class="activity-icon bg-success">📝</div>
      <div class="activity-content">
        <div class="activity-title">Feedback submitted for Math 101</div>
        <div class="activity-time">5 hours ago</div>
      </div>
    </div>
    <div class="activity-item">
      <div class="activity-icon bg-warning">📚</div>
      <div class="activity-content">
        <div class="activity-title">Subject structure updated</div>
        <div class="activity-time">1 day ago</div>
      </div>
    </div>
  `;
}

// Enhanced students table with search and pagination
function enhanceStudentsTable() {
  const studentsCard = document.getElementById('studentsCard');
  if (!studentsCard) return;

  // Add search input
  const searchHTML = `
    <div class="table-controls" style="margin-bottom: 1rem; display: flex; gap: 1rem; align-items: center;">
      <input type="text" id="studentsSearch" placeholder="Search students..." class="input" style="flex: 1;">
      <button onclick="loadStudents()" class="btn btn-secondary" style="padding: 0.75rem 1.5rem;">Refresh</button>
    </div>
  `;
  
  studentsCard.insertAdjacentHTML('afterbegin', searchHTML);
  
  // Search functionality
  document.getElementById('studentsSearch').addEventListener('input', debounce(loadStudentsWithSearch, 300));
}

// Debounce utility
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Load students with search
async function loadStudentsWithSearch() {
  const searchTerm = document.getElementById('studentsSearch').value.toLowerCase();
  
  try {
    const snapshot = await window.db.collection('users').get();
    const table = document.getElementById('studentsTable');
    table.innerHTML = '';

    let count = 0;
    snapshot.forEach(doc => {
      const s = doc.data();
      const matchesSearch = s.name.toLowerCase().includes(searchTerm) ||
                          s.prn.toLowerCase().includes(searchTerm);
      
      if (matchesSearch) {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${s.name}</td>
          <td>${s.year}</td>
          <td>${s.division}</td>
          <td>${s.batch}</td>
          <td>${s.prn}</td>
          <td>
            <button class="remove-btn btn btn-error" onclick="removeStudent('${doc.id}', '${s.uid || ''}')">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M18 6L12 18l-6-12"/>
              </svg>
              Remove
            </button>
          </td>
        `;
        table.appendChild(row);
        count++;
      }
    });

    if (count === 0) {
      table.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem; color: var(--gray-500);">No students found matching your search.</td></tr>';
    }
  } catch (error) {
    console.error('Error loading students:', error);
  }
}

// Initialize dashboard when page loads
document.addEventListener('DOMContentLoaded', () => {
  loadDashboardStats();
  enhanceStudentsTable();
  
  // Auth check
  window.auth.onAuthStateChanged(user => {
    if (!user || user.email !== "teacher@portal.com") {
      window.location.href = "teacherlogin.html";
    }
  });
  
  // Load students
  loadStudentsWithSearch();
});

// Export functions (keep existing structure functions)
function toggleStudents() {
  const studentsCard = document.getElementById('studentsCard');
  studentsCard.style.display = studentsCard.style.display === 'none' ? 'block' : 'none';
}

function removeStudent(id, uid) {
  if (!confirm('Remove this student? This action cannot be undone.')) return;

  window.db.collection('users').doc(id).delete().then(() => {
    if (uid) {
      window.db.collection('disabledUsers').doc(uid).set({
        disabled: true,
        removedAt: window.firebase.firestore.FieldValue.serverTimestamp()
      });
    }
    alert('Student removed successfully');
  }).catch(error => {
    console.error('Error removing student:', error);
    alert('Error removing student. Please try again.');
  });
}

