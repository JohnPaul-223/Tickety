// Global state
let currentFilter = 'all';
let allTickets = [];
let allSchedule = [];
let charts = {};
let calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let selectedCalendarDate = getDateKey(new Date());

// Get Supabase client reference
const getSupabase = () => window.supabase;

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    console.log('📱 DOM Content Loaded');
    console.log('🔍 Checking Supabase in app.js:', typeof window.supabase);
    console.log('🔍 Supabase.from available:', typeof window.supabase?.from);
    
    if (typeof window.supabase === 'undefined' || typeof window.supabase.from !== 'function') {
        console.error('❌ Supabase not available in app.js!');
        alert('Error: Supabase client not initialized. Please reload the page.');
        return;
    }
    
    initializeTheme();
    loadDashboard();
});

// Theme Management
function initializeTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
    }
    updateThemeIcon();
}

function toggleTheme() {
    document.body.classList.toggle('dark-mode');
    const newTheme = document.body.classList.contains('dark-mode') ? 'dark' : 'light';
    localStorage.setItem('theme', newTheme);
    updateThemeIcon();
    
    // Redraw charts with new theme colors
    if (document.getElementById('dashboard-page').classList.contains('active')) {
        loadCharts();
    }
}

function updateThemeIcon() {
    const isDark = document.body.classList.contains('dark-mode');
    const icon = document.querySelector('.theme-icon');
    if (icon) {
        icon.textContent = isDark ? '☀️' : '🌙';
    }
}

// Get theme-aware colors
function getThemedColors() {
    const isDark = document.body.classList.contains('dark-mode');
    
    return {
        text: isDark ? '#f1f5f9' : '#1e293b',
        grid: isDark ? '#334155' : '#e2e8f0',
        background: isDark ? '#1e293b' : '#ffffff',
        cyan: '#06b6d4',
        blue: '#3b82f6',
        purple: '#8b5cf6',
        pink: '#ec4899',
        red: '#ef4444',
        orange: '#f97316',
        green: '#10b981',
        emerald: '#059669',
        yellow: '#f59e0b'
    };
}

// Navigation
function showPage(pageName) {
    // Hide all pages
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });

    // Remove active class from nav links
    document.querySelectorAll('.nav-menu a').forEach(link => {
        link.classList.remove('active');
    });

    // Show selected page
    document.getElementById(`${pageName}-page`).classList.add('active');
    
    // Set active nav link
    event.target.classList.add('active');

    // Load data for the page
    if (pageName === 'dashboard') {
        loadDashboard();
    } else if (pageName === 'tickets') {
        loadTickets();
    } else if (pageName === 'schedule') {
        loadSchedule();
    }
}

// Dashboard functions
async function loadDashboard() {
    try {
        await Promise.all([
            loadStats(),
            loadCharts(),
            loadRecentTickets(),
            loadTodaySchedule(),
            checkOverdueTickets()
        ]);
    } catch (error) {
        console.error('Error loading dashboard:', error);
        showNotification('Error loading dashboard data', 'error');
    }
}

// Load Charts
async function loadCharts() {
    const { data: tickets } = await supabase.from('tickets').select('*');
    const colors = getThemedColors();
    
    // Destroy existing charts
    Object.values(charts).forEach(chart => {
        if (chart) chart.destroy();
    });
    
    // Chart defaults
    Chart.defaults.color = colors.text;
    Chart.defaults.borderColor = colors.grid;
    
    // 1. Tickets Per Month (Bar Chart)
    const monthlyData = getMonthlyTicketData(tickets);
    const ctx1 = document.getElementById('tickets-per-month-chart');
    if (ctx1) {
        charts.monthly = new Chart(ctx1, {
            type: 'bar',
            data: {
                labels: monthlyData.labels,
                datasets: [
                    {
                        label: 'Answered',
                        data: monthlyData.answered,
                        backgroundColor: colors.cyan,
                        borderRadius: 4
                    },
                    {
                        label: 'Failed/Busy',
                        data: monthlyData.failed,
                        backgroundColor: colors.pink,
                        borderRadius: 4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: { color: colors.text, usePointStyle: true }
                    }
                },
                scales: {
                    x: { 
                        grid: { display: false },
                        ticks: { color: colors.text }
                    },
                    y: { 
                        grid: { color: colors.grid },
                        ticks: { color: colors.text }
                    }
                }
            }
        });
    }
    
    // 2. Status Distribution (Doughnut)
    const statusData = getStatusDistribution(tickets);
    const ctx2 = document.getElementById('status-distribution-chart');
    if (ctx2) {
        charts.status = new Chart(ctx2, {
            type: 'doughnut',
            data: {
                labels: statusData.labels,
                datasets: [{
                    data: statusData.values,
                    backgroundColor: [colors.cyan, colors.purple, colors.green, colors.orange],
                    borderWidth: 0,
                    cutout: '70%'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: { 
                            color: colors.text,
                            padding: 15,
                            font: { size: 12 }
                        }
                    }
                }
            }
        });
    }
    
    // 3. Priority Breakdown (Doughnut)
    const priorityData = getPriorityDistribution(tickets);
    const ctx3 = document.getElementById('priority-breakdown-chart');
    if (ctx3) {
        charts.priority = new Chart(ctx3, {
            type: 'doughnut',
            data: {
                labels: priorityData.labels,
                datasets: [{
                    data: priorityData.values,
                    backgroundColor: [colors.red, colors.orange, colors.yellow, colors.green],
                    borderWidth: 0,
                    cutout: '70%'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: { 
                            color: colors.text,
                            padding: 15,
                            font: { size: 12 }
                        }
                    }
                }
            }
        });
    }
    
    // 4. Weekly Activity (Bar Chart)
    const weeklyData = getWeeklyActivity(tickets);
    const ctx4 = document.getElementById('weekly-activity-chart');
    if (ctx4) {
        charts.weekly = new Chart(ctx4, {
            type: 'bar',
            data: {
                labels: weeklyData.labels,
                datasets: [{
                    label: 'Tickets',
                    data: weeklyData.values,
                    backgroundColor: colors.emerald,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: { 
                        grid: { display: false },
                        ticks: { color: colors.text }
                    },
                    y: { 
                        grid: { color: colors.grid },
                        ticks: { color: colors.text }
                    }
                }
            }
        });
    }
}

// Chart data functions
function getMonthlyTicketData(tickets) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const answered = new Array(12).fill(0);
    const failed = new Array(12).fill(0);
    
    tickets.forEach(ticket => {
        const month = new Date(ticket.created_at).getMonth();
        if (ticket.status === 'resolved' || ticket.status === 'closed') {
            answered[month]++;
        } else {
            failed[month]++;
        }
    });
    
    return { labels: months, answered, failed };
}

function getStatusDistribution(tickets) {
    const statuses = {
        'Open': tickets.filter(t => t.status === 'open').length,
        'In Progress': tickets.filter(t => t.status === 'in_progress').length,
        'Resolved': tickets.filter(t => t.status === 'resolved').length,
        'Closed': tickets.filter(t => t.status === 'closed').length
    };
    
    return {
        labels: Object.keys(statuses),
        values: Object.values(statuses)
    };
}

function getPriorityDistribution(tickets) {
    const priorities = {
        'Urgent': tickets.filter(t => t.priority === 'urgent').length,
        'High': tickets.filter(t => t.priority === 'high').length,
        'Medium': tickets.filter(t => t.priority === 'medium').length,
        'Low': tickets.filter(t => t.priority === 'low').length
    };
    
    return {
        labels: Object.keys(priorities),
        values: Object.values(priorities)
    };
}

function getWeeklyActivity(tickets) {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const counts = new Array(7).fill(0);
    
    tickets.forEach(ticket => {
        const dayOfWeek = new Date(ticket.created_at).getDay();
        const adjustedDay = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Monday = 0
        counts[adjustedDay]++;
    });
    
    return { labels: days, values: counts };
}

async function loadStats() {
    const { data: tickets, error } = await supabase
        .from('tickets')
        .select('*');

    if (error) {
        console.error('Error loading stats:', error);
        return;
    }

    const now = new Date();
    document.getElementById('stat-total').textContent = tickets.length;
    document.getElementById('stat-open').textContent = tickets.filter(t => t.status === 'open').length;
    document.getElementById('stat-progress').textContent = tickets.filter(t => t.status === 'in_progress').length;
    document.getElementById('stat-resolved').textContent = tickets.filter(t => t.status === 'resolved').length;
}

async function loadRecentTickets() {
    const { data: tickets, error } = await supabase
        .from('tickets')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

    if (error) {
        console.error('Error loading recent tickets:', error);
        return;
    }

    const container = document.getElementById('recent-tickets');
    
    if (tickets.length === 0) {
        container.innerHTML = '<p class="empty-state">No tickets yet. Create your first ticket!</p>';
        return;
    }

    container.innerHTML = tickets.map(ticket => `
        <div class="ticket-item" onclick="viewTicket(${ticket.id})">
            <div class="ticket-header">
                <h4>#${ticket.id} - ${ticket.title}</h4>
                <span class="badge badge-${ticket.priority}">${ticket.priority}</span>
                <span class="badge badge-${ticket.status}">${ticket.status}</span>
            </div>
            <p class="ticket-meta">
                Client: ${ticket.client_name} | Created: ${new Date(ticket.created_at).toLocaleDateString()}
            </p>
        </div>
    `).join('');
}

async function loadTodaySchedule() {
    const { start, end } = getLocalDayBounds();
    
    const { data: schedule, error } = await supabase
        .from('schedule')
        .select(`
            *,
            tickets (
                id,
                title,
                client_name
            )
        `)
        .gte('scheduled_date', start)
        .lt('scheduled_date', end)
        .order('scheduled_date', { ascending: true });

    if (error) {
        console.error('Error loading today schedule:', error);
        return;
    }

    const container = document.getElementById('today-schedule');
    
    if (schedule.length === 0) {
        container.innerHTML = '<p class="empty-state">No tasks scheduled for today</p>';
        return;
    }

    container.innerHTML = schedule.map(item => `
        <div class="schedule-item">
            <div class="schedule-time">
                ${new Date(item.scheduled_date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
            </div>
            <div class="schedule-content">
                <h4>${item.title}</h4>
                ${item.tickets ? `
                    <p class="ticket-meta">
                        Ticket: #${item.tickets.id} | Client: ${item.tickets.client_name}
                    </p>
                ` : ''}
            </div>
            <span class="badge badge-${item.status}">${item.status}</span>
        </div>
    `).join('');
}

async function checkOverdueTickets() {
    const now = new Date().toISOString();
    
    const { data: tickets, error } = await supabase
        .from('tickets')
        .select('*')
        .not('status', 'in', '(resolved,closed)')
        .not('due_date', 'is', null)
        .lt('due_date', now)
        .order('due_date', { ascending: true });

    if (error) {
        console.error('Error checking overdue tickets:', error);
        return;
    }

    const alert = document.getElementById('overdue-alert');
    const list = document.getElementById('overdue-list');

    if (tickets.length === 0) {
        alert.style.display = 'none';
        return;
    }

    alert.style.display = 'block';
    list.innerHTML = tickets.map(ticket => `
        <li>
            <a href="#" onclick="viewTicket(${ticket.id}); return false;">
                #${ticket.id} - ${ticket.title}
            </a>
            (Client: ${ticket.client_name}, Due: ${new Date(ticket.due_date).toLocaleDateString()})
        </li>
    `).join('');
}

// Tickets functions
async function loadTickets(status = 'all') {
    currentFilter = status;
    
    let query = supabase.from('tickets').select('*');
    
    if (status !== 'all') {
        query = query.eq('status', status);
    }
    
    query = query.order('created_at', { ascending: false });

    const { data: tickets, error } = await query;

    if (error) {
        console.error('Error loading tickets:', error);
        showNotification('Error loading tickets', 'error');
        return;
    }

    allTickets = tickets;
    displayTickets(tickets);
}

function displayTickets(tickets) {
    const container = document.getElementById('tickets-list');
    
    if (tickets.length === 0) {
        container.innerHTML = '<p class="empty-state">No tickets found. Create your first ticket!</p>';
        return;
    }

    container.innerHTML = `
        <table class="table">
            <thead>
                <tr>
                    <th>ID</th>
                    <th>Title</th>
                    <th>Client</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th>Category</th>
                    <th>Created</th>
                    <th>Due Date</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${tickets.map(ticket => `
                    <tr>
                        <td>#${ticket.id}</td>
                        <td><a href="#" onclick="viewTicket(${ticket.id}); return false;">${ticket.title}</a></td>
                        <td>${ticket.client_name}</td>
                        <td><span class="badge badge-${ticket.priority}">${ticket.priority}</span></td>
                        <td>
                            <select onchange="updateTicketStatus(${ticket.id}, this.value, this)" class="status-select" data-original-value="${ticket.status}">
                                <option value="open" ${ticket.status === 'open' ? 'selected' : ''}>Open</option>
                                <option value="in_progress" ${ticket.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
                                <option value="resolved" ${ticket.status === 'resolved' ? 'selected' : ''}>Resolved</option>
                                <option value="closed" ${ticket.status === 'closed' ? 'selected' : ''}>Closed</option>
                            </select>
                        </td>
                        <td>${ticket.category || '-'}</td>
                        <td>${new Date(ticket.created_at).toLocaleDateString()}</td>
                        <td>
                            ${ticket.due_date ? `
                                ${new Date(ticket.due_date).toLocaleDateString()}
                                ${ticket.status !== 'resolved' && ticket.status !== 'closed' && new Date(ticket.due_date) < new Date() ? 
                                    '<span class="badge badge-urgent">Overdue</span>' : ''}
                            ` : '-'}
                        </td>
                        <td>
                            <button class="btn btn-sm" onclick="editTicket(${ticket.id})">Edit</button>
                            <button class="btn btn-sm btn-danger" onclick="deleteTicket(${ticket.id}, this)">Delete</button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function filterTickets(status) {
    // Update active filter tab
    document.querySelectorAll('.filter-tabs a').forEach(a => a.classList.remove('active'));
    document.getElementById(`filter-${status}`).classList.add('active');
    
    loadTickets(status);
}

async function updateTicketStatus(id, status, selectElement) {
    const originalValue = selectElement.dataset.originalValue || selectElement.value;
    selectElement.disabled = true;
    
    const loadingNotification = showNotification('Updating ticket status...', 'loading', 0);
    
    try {
        const { error } = await supabase
            .from('tickets')
            .update({ 
                status,
                updated_at: new Date().toISOString(),
                ...(status === 'resolved' ? { resolved_at: new Date().toISOString() } : {})
            })
            .eq('id', id);

        if (error) throw error;

        loadingNotification.remove();
        activeNotifications = activeNotifications.filter(n => n !== loadingNotification);
        
        showNotification('✓ Status updated successfully', 'success');
        selectElement.dataset.originalValue = status;
        loadTickets(currentFilter);
    } catch (error) {
        loadingNotification.remove();
        activeNotifications = activeNotifications.filter(n => n !== loadingNotification);
        
        handleError(error, 'Failed to update status');
        selectElement.value = originalValue;
    } finally {
        selectElement.disabled = false;
    }
}

// Schedule functions
async function loadScheduleLegacy() {
    await Promise.all([
        loadTodayTasks(),
        loadUpcomingTasks(),
        loadAllSchedule()
    ]);
}

async function loadTodayTasks() {
    const today = new Date().toISOString().split('T')[0];
    
    const { data: schedule, error } = await supabase
        .from('schedule')
        .select(`
            *,
            tickets (
                id,
                title,
                client_name
            )
        `)
        .gte('scheduled_date', `${today}T00:00:00`)
        .lt('scheduled_date', `${today}T23:59:59`)
        .order('scheduled_date', { ascending: true });

    if (error) {
        console.error('Error loading today tasks:', error);
        return;
    }

    const container = document.getElementById('today-tasks');
    
    if (schedule.length === 0) {
        container.innerHTML = '<p class="empty-state">No tasks scheduled for today</p>';
        return;
    }

    container.innerHTML = schedule.map(item => `
        <div class="schedule-card">
            <div class="schedule-card-header">
                <h3>${item.title}</h3>
                <span class="badge badge-${item.status}">${item.status}</span>
            </div>
            <div class="schedule-card-body">
                <p class="schedule-time">
                    🕒 ${new Date(item.scheduled_date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    (${item.duration} min)
                </p>
                ${item.description ? `<p>${item.description}</p>` : ''}
                ${item.tickets ? `
                    <p class="ticket-meta">
                        Ticket: #${item.tickets.id} | Client: ${item.tickets.client_name}
                    </p>
                ` : ''}
            </div>
            <div class="form-actions">
                <button class="btn btn-sm" onclick="editSchedule(${item.id})">Edit</button>
                <button class="btn btn-sm btn-danger" onclick="deleteSchedule(${item.id})">Delete</button>
            </div>
        </div>
    `).join('');
}

async function loadUpcomingTasks() {
    const today = new Date();
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);
    
    const { data: schedule, error } = await supabase
        .from('schedule')
        .select(`
            *,
            tickets (
                id,
                title,
                client_name
            )
        `)
        .eq('status', 'pending')
        .gte('scheduled_date', today.toISOString())
        .lte('scheduled_date', nextWeek.toISOString())
        .order('scheduled_date', { ascending: true });

    if (error) {
        console.error('Error loading upcoming tasks:', error);
        return;
    }

    const container = document.getElementById('upcoming-tasks');
    
    if (schedule.length === 0) {
        container.innerHTML = '<p class="empty-state">No upcoming tasks in the next 7 days</p>';
        return;
    }

    container.innerHTML = schedule.map(item => `
        <div class="timeline-item">
            <div class="timeline-date">
                ${new Date(item.scheduled_date).toLocaleDateString('en-US', {weekday: 'short', month: 'short', day: 'numeric'})}<br>
                ${new Date(item.scheduled_date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
            </div>
            <div class="timeline-content">
                <h4>${item.title}</h4>
                ${item.description ? `<p>${item.description}</p>` : ''}
                ${item.tickets ? `
                    <p class="ticket-meta">
                        Ticket: #${item.tickets.id} | Client: ${item.tickets.client_name}
                    </p>
                ` : ''}
                <p class="schedule-duration">Duration: ${item.duration} minutes</p>
            </div>
        </div>
    `).join('');
}

async function loadAllSchedule() {
    const { data: schedule, error } = await supabase
        .from('schedule')
        .select(`
            *,
            tickets (
                id,
                title,
                client_name
            )
        `)
        .order('scheduled_date', { ascending: false });

    if (error) {
        console.error('Error loading all schedule:', error);
        return;
    }

    allSchedule = schedule;

    const container = document.getElementById('all-schedule');
    
    if (schedule.length === 0) {
        container.innerHTML = '<p class="empty-state">No scheduled tasks. Create your first task!</p>';
        return;
    }

    container.innerHTML = `
        <table class="table">
            <thead>
                <tr>
                    <th>Date & Time</th>
                    <th>Task</th>
                    <th>Ticket</th>
                    <th>Duration</th>
                    <th>Status</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${schedule.map(item => `
                    <tr>
                        <td>${new Date(item.scheduled_date).toLocaleString()}</td>
                        <td>${item.title}</td>
                        <td>${item.tickets ? `#${item.tickets.id}` : '-'}</td>
                        <td>${item.duration} min</td>
                        <td><span class="badge badge-${item.status}">${item.status}</span></td>
                        <td>
                            <button class="btn btn-sm" onclick="editSchedule(${item.id})">Edit</button>
                            <button class="btn btn-sm btn-danger" onclick="deleteSchedule(${item.id})">Delete</button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

async function loadSchedule() {
    const { data: schedule, error } = await supabase
        .from('schedule')
        .select(`
            *,
            tickets (
                id,
                title,
                client_name
            )
        `)
        .order('scheduled_date', { ascending: true });

    if (error) {
        console.error('Error loading calendar:', error);
        showNotification('Error loading schedule', 'error');
        return;
    }

    allSchedule = schedule || [];
    renderCalendar();
}

function getDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getLocalDayBounds(date = new Date()) {
    const startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const endDate = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);

    return {
        start: startDate.toISOString(),
        end: endDate.toISOString()
    };
}

function localDateTimeToUtc(localDateTime) {
    const localDate = new Date(localDateTime);
    return Number.isNaN(localDate.getTime()) ? localDateTime : localDate.toISOString();
}

function utcToDateTimeLocal(dateValue) {
    const date = new Date(dateValue);

    if (Number.isNaN(date.getTime())) {
        return '';
    }

    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return localDate.toISOString().slice(0, 16);
}

function getDateFromKey(dateKey) {
    return new Date(`${dateKey}T00:00:00`);
}

function getTasksForDate(dateKey) {
    return allSchedule.filter(item => getDateKey(new Date(item.scheduled_date)) === dateKey);
}

function changeCalendarMonth(offset) {
    calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + offset, 1);
    renderCalendar();
}

function goToToday() {
    const today = new Date();
    calendarMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    selectedCalendarDate = getDateKey(today);
    renderCalendar();
}

function selectCalendarDate(dateKey) {
    const selectedDate = getDateFromKey(dateKey);
    selectedCalendarDate = dateKey;
    calendarMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
    renderCalendar();
}

function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    const monthLabel = document.getElementById('calendar-month-label');

    if (!grid || !monthLabel) {
        return;
    }

    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const gridStart = new Date(year, month, 1 - firstDay.getDay());
    const todayKey = getDateKey(new Date());

    monthLabel.textContent = calendarMonth.toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric'
    });

    grid.innerHTML = Array.from({ length: 42 }, (_, index) => {
        const date = new Date(gridStart);
        date.setDate(gridStart.getDate() + index);

        const dateKey = getDateKey(date);
        const tasks = getTasksForDate(dateKey);
        const isCurrentMonth = date.getMonth() === month;
        const stateClasses = [
            'calendar-day',
            isCurrentMonth ? '' : 'is-outside-month',
            dateKey === todayKey ? 'is-today' : '',
            dateKey === selectedCalendarDate ? 'is-selected' : '',
            tasks.length ? 'has-tasks' : ''
        ].filter(Boolean).join(' ');

        const taskPreview = tasks.slice(0, 2).map(task => `
            <span class="calendar-task calendar-task-${task.status}" title="${formatScheduleTime(task.scheduled_date)} ${task.title}">
                <time>${formatScheduleTime(task.scheduled_date)}</time>
                <strong>${task.title}</strong>
            </span>
        `).join('');
        const extraTaskCount = tasks.length > 2
            ? `<span class="calendar-task-more">+${tasks.length - 2} more</span>`
            : '';

        return `
            <button type="button" class="${stateClasses}" onclick="selectCalendarDate('${dateKey}')" aria-label="${date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}">
                <time class="calendar-day-number" datetime="${dateKey}">${date.getDate()}</time>
                <span class="calendar-day-items">${taskPreview}${extraTaskCount}</span>
            </button>
        `;
    }).join('');

    renderCalendarAgenda();
}

function renderCalendarAgenda() {
    const heading = document.getElementById('calendar-selected-date');
    const container = document.getElementById('calendar-day-tasks');

    if (!heading || !container) {
        return;
    }

    const selectedDate = getDateFromKey(selectedCalendarDate);
    const tasks = getTasksForDate(selectedCalendarDate);

    heading.textContent = selectedDate.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric'
    });

    if (tasks.length === 0) {
        container.innerHTML = '<p class="calendar-empty">No tasks scheduled</p>';
        return;
    }

    container.innerHTML = tasks.map(item => `
        <article class="calendar-agenda-item">
            <div class="calendar-agenda-meta">
                <time>${formatScheduleTime(item.scheduled_date)}</time>
                <span class="badge badge-${item.status}">${item.status}</span>
            </div>
            <h3>${item.title}</h3>
            <p class="calendar-duration">${item.duration} minutes</p>
            ${item.description ? `<p>${item.description}</p>` : ''}
            ${item.tickets ? `<p class="ticket-meta">Ticket #${item.tickets.id} - ${item.tickets.client_name}</p>` : ''}
            <div class="calendar-task-actions">
                <button class="btn btn-sm" onclick="editSchedule(${item.id})">Edit</button>
                <button class="btn btn-sm btn-danger" onclick="deleteSchedule(${item.id}, this)">Delete</button>
            </div>
        </article>
    `).join('');
}

function formatScheduleTime(dateValue) {
    return new Date(dateValue).toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit'
    });
}

// Modal functions
function showNewTicketModal() {
    document.getElementById('ticket-form').reset();
    document.getElementById('ticket-id').value = '';
    document.getElementById('ticket-modal-title').textContent = 'Create New Ticket';
    openModal('ticket-modal');
}

async function showNewScheduleModal() {
    // Load available tickets for the dropdown
    const { data: tickets, error } = await supabase
        .from('tickets')
        .select('id, title, client_name')
        .not('status', 'in', '(resolved,closed)')
        .order('created_at', { ascending: false });

    if (!error) {
        const select = document.getElementById('schedule-ticket');
        select.innerHTML = '<option value="">-- No ticket --</option>' +
            tickets.map(t => `<option value="${t.id}">#${t.id} - ${t.title} (${t.client_name})</option>`).join('');
    }

    document.getElementById('schedule-form').reset();
    document.getElementById('schedule-id').value = '';
    document.getElementById('schedule-date').value = `${selectedCalendarDate}T09:00`;
    document.getElementById('schedule-modal-title').textContent = 'Schedule New Task';
    openModal('schedule-modal');
}

function openModal(modalId) {
    document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

// Ticket CRUD
async function saveTicket(event) {
    event.preventDefault();
    
    console.log('📝 saveTicket called');
    
    const submitButton = event.target.querySelector('button[type="submit"]');
    setButtonLoading(submitButton, true);
    
    const id = document.getElementById('ticket-id').value;
    
    console.log('🔍 Form data collection starting...');
    
    const ticketData = {
        title: document.getElementById('ticket-title').value,
        description: document.getElementById('ticket-description').value,
        client_name: document.getElementById('ticket-client-name').value,
        client_email: document.getElementById('ticket-client-email').value || null,
        client_phone: document.getElementById('ticket-client-phone').value || null,
        priority: document.getElementById('ticket-priority').value,
        status: document.getElementById('ticket-status').value,
        category: document.getElementById('ticket-category').value || null,
        due_date: document.getElementById('ticket-due-date').value || null,
        notes: document.getElementById('ticket-notes').value || null,
        updated_at: new Date().toISOString()
    };

    console.log('📊 Ticket data:', ticketData);
    console.log('💾 Supabase client available:', typeof supabase);

    try {
        let error, data;
        
        if (id) {
            console.log('🔄 Updating ticket #' + id);
            // Update existing ticket
            ({ data, error } = await supabase
                .from('tickets')
                .update(ticketData)
                .eq('id', id)
                .select());
                
            console.log('Update response:', { data, error });
        } else {
            console.log('➕ Creating new ticket');
            // Create new ticket
            ticketData.created_at = new Date().toISOString();
            ({ data, error } = await supabase
                .from('tickets')
                .insert([ticketData])
                .select());
                
            console.log('Insert response:', { data, error });
        }

        if (error) throw error;

        console.log('✅ Operation successful');
        showNotification(id ? '✓ Ticket updated successfully' : '✓ Ticket created successfully', 'success');
        closeModal('ticket-modal');
        loadTickets(currentFilter);
        loadDashboard();
    } catch (error) {
        console.error('❌ Error in saveTicket:', error);
        console.error('Error details:', {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint
        });
        handleError(error, id ? 'Failed to update ticket' : 'Failed to create ticket');
    } finally {
        setButtonLoading(submitButton, false);
    }
}

async function editTicket(id) {
    const loadingNotification = showNotification('Loading ticket...', 'loading', 0);
    
    try {
        const { data: ticket, error } = await supabase
            .from('tickets')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;
        
        loadingNotification.remove();
        activeNotifications = activeNotifications.filter(n => n !== loadingNotification);

    document.getElementById('ticket-id').value = ticket.id;
    document.getElementById('ticket-title').value = ticket.title;
    document.getElementById('ticket-description').value = ticket.description;
    document.getElementById('ticket-client-name').value = ticket.client_name;
    document.getElementById('ticket-client-email').value = ticket.client_email || '';
    document.getElementById('ticket-client-phone').value = ticket.client_phone || '';
    document.getElementById('ticket-priority').value = ticket.priority;
    document.getElementById('ticket-status').value = ticket.status;
    document.getElementById('ticket-category').value = ticket.category || '';
    document.getElementById('ticket-due-date').value = ticket.due_date ? ticket.due_date.slice(0, 16) : '';
    document.getElementById('ticket-notes').value = ticket.notes || '';
    
        document.getElementById('ticket-modal-title').textContent = 'Edit Ticket #' + ticket.id;
        openModal('ticket-modal');
    } catch (error) {
        loadingNotification.remove();
        activeNotifications = activeNotifications.filter(n => n !== loadingNotification);
        handleError(error, 'Failed to load ticket');
    }
}

async function viewTicket(id) {
    const { data: ticket, error } = await supabase
        .from('tickets')
        .select('*')
        .eq('id', id)
        .single();

    if (error) {
        console.error('Error loading ticket:', error);
        showNotification('Error loading ticket', 'error');
        return;
    }

    const detailsHtml = `
        <h2>Ticket #${ticket.id}: ${ticket.title}</h2>
        <div class="ticket-details" style="display: grid; gap: 2rem; margin-top: 1.5rem;">
            <div>
                <h3>Status & Priority</h3>
                <p><strong>Status:</strong> <span class="badge badge-${ticket.status}">${ticket.status}</span></p>
                <p><strong>Priority:</strong> <span class="badge badge-${ticket.priority}">${ticket.priority}</span></p>
                <p><strong>Category:</strong> ${ticket.category || 'Not specified'}</p>
                
                <h3 style="margin-top: 1.5rem;">Description</h3>
                <p>${ticket.description}</p>
                
                ${ticket.notes ? `
                    <h3 style="margin-top: 1.5rem;">Notes</h3>
                    <p>${ticket.notes}</p>
                ` : ''}
            </div>
            
            <div>
                <h3>Client Information</h3>
                <p><strong>Name:</strong> ${ticket.client_name}</p>
                ${ticket.client_email ? `<p><strong>Email:</strong> <a href="mailto:${ticket.client_email}">${ticket.client_email}</a></p>` : ''}
                ${ticket.client_phone ? `<p><strong>Phone:</strong> <a href="tel:${ticket.client_phone}">${ticket.client_phone}</a></p>` : ''}
                
                <h3 style="margin-top: 1.5rem;">Timeline</h3>
                <p><strong>Created:</strong> ${new Date(ticket.created_at).toLocaleString()}</p>
                <p><strong>Updated:</strong> ${new Date(ticket.updated_at).toLocaleString()}</p>
                ${ticket.due_date ? `<p><strong>Due:</strong> ${new Date(ticket.due_date).toLocaleString()}</p>` : ''}
                ${ticket.resolved_at ? `<p><strong>Resolved:</strong> ${new Date(ticket.resolved_at).toLocaleString()}</p>` : ''}
            </div>
        </div>
        
        <div class="form-actions" style="margin-top: 2rem;">
            <button class="btn btn-primary" onclick="editTicket(${ticket.id}); closeModal('view-ticket-modal');">Edit</button>
            <button class="btn btn-secondary" onclick="closeModal('view-ticket-modal')">Close</button>
        </div>
    `;

    document.getElementById('ticket-details').innerHTML = detailsHtml;
    openModal('view-ticket-modal');
}

async function deleteTicket(id, buttonElement) {
    if (!confirm('Are you sure you want to delete this ticket? This action cannot be undone.')) {
        return;
    }

    if (buttonElement) {
        setButtonLoading(buttonElement, true);
    }
    
    const loadingNotification = showNotification('Deleting ticket...', 'loading', 0);

    try {
        const { error } = await supabase
            .from('tickets')
            .delete()
            .eq('id', id);

        if (error) throw error;
        
        loadingNotification.remove();
        activeNotifications = activeNotifications.filter(n => n !== loadingNotification);

        showNotification('✓ Ticket deleted successfully', 'success');
        loadTickets(currentFilter);
        loadDashboard();
    } catch (error) {
        loadingNotification.remove();
        activeNotifications = activeNotifications.filter(n => n !== loadingNotification);
        
        handleError(error, 'Failed to delete ticket');
    } finally {
        if (buttonElement) {
            setButtonLoading(buttonElement, false);
        }
    }
}

// Schedule CRUD
async function saveSchedule(event) {
    event.preventDefault();
    
    console.log('📅 saveSchedule called');
    
    const submitButton = event.target.querySelector('button[type="submit"]');
    setButtonLoading(submitButton, true);
    
    const id = document.getElementById('schedule-id').value;
    
    console.log('🔍 Schedule form data collection starting...');
    
    const scheduleData = {
        title: document.getElementById('schedule-title').value,
        description: document.getElementById('schedule-description').value || null,
        ticket_id: document.getElementById('schedule-ticket').value || null,
        scheduled_date: localDateTimeToUtc(document.getElementById('schedule-date').value),
        duration: parseInt(document.getElementById('schedule-duration').value),
        status: document.getElementById('schedule-status').value
    };

    console.log('📊 Schedule data:', scheduleData);
    console.log('💾 Supabase client available:', typeof supabase);

    try {
        let error, data;
        
        if (id) {
            console.log('🔄 Updating schedule #' + id);
            // Update existing schedule
            ({ data, error } = await supabase
                .from('schedule')
                .update(scheduleData)
                .eq('id', id)
                .select());
                
            console.log('Update response:', { data, error });
        } else {
            console.log('➕ Creating new schedule');
            // Create new schedule
            scheduleData.created_at = new Date().toISOString();
            ({ data, error } = await supabase
                .from('schedule')
                .insert([scheduleData])
                .select());
                
            console.log('Insert response:', { data, error });
        }

        if (error) throw error;

        console.log('✅ Operation successful');
        showNotification(id ? '✓ Task updated successfully' : '✓ Task scheduled successfully', 'success');
        closeModal('schedule-modal');
        loadSchedule();
        loadDashboard();
    } catch (error) {
        console.error('❌ Error in saveSchedule:', error);
        console.error('Error details:', {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint
        });
        handleError(error, id ? 'Failed to update task' : 'Failed to schedule task');
    } finally {
        setButtonLoading(submitButton, false);
    }
}

async function editSchedule(id) {
    const loadingNotification = showNotification('Loading task...', 'loading', 0);
    
    try {
        const { data: item, error } = await supabase
            .from('schedule')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;
        
        loadingNotification.remove();
        activeNotifications = activeNotifications.filter(n => n !== loadingNotification);

    // Load available tickets
    const { data: tickets } = await supabase
        .from('tickets')
        .select('id, title, client_name')
        .not('status', 'in', '(resolved,closed)')
        .order('created_at', { ascending: false });

    if (tickets) {
        const select = document.getElementById('schedule-ticket');
        select.innerHTML = '<option value="">-- No ticket --</option>' +
            tickets.map(t => `<option value="${t.id}" ${t.id === item.ticket_id ? 'selected' : ''}>#${t.id} - ${t.title} (${t.client_name})</option>`).join('');
    }

    document.getElementById('schedule-id').value = item.id;
    document.getElementById('schedule-title').value = item.title;
    document.getElementById('schedule-description').value = item.description || '';
    document.getElementById('schedule-date').value = utcToDateTimeLocal(item.scheduled_date);
    document.getElementById('schedule-duration').value = item.duration;
    document.getElementById('schedule-status').value = item.status;
    
        document.getElementById('schedule-modal-title').textContent = 'Edit Task';
        openModal('schedule-modal');
    } catch (error) {
        loadingNotification.remove();
        activeNotifications = activeNotifications.filter(n => n !== loadingNotification);
        handleError(error, 'Failed to load task');
    }
}

async function deleteSchedule(id, buttonElement) {
    if (!confirm('Are you sure you want to delete this task?')) {
        return;
    }

    if (buttonElement) {
        setButtonLoading(buttonElement, true);
    }
    
    const loadingNotification = showNotification('Deleting task...', 'loading', 0);

    try {
        const { error } = await supabase
            .from('schedule')
            .delete()
            .eq('id', id);

        if (error) throw error;
        
        loadingNotification.remove();
        activeNotifications = activeNotifications.filter(n => n !== loadingNotification);

        showNotification('✓ Task deleted successfully', 'success');
        loadSchedule();
        loadDashboard();
    } catch (error) {
        loadingNotification.remove();
        activeNotifications = activeNotifications.filter(n => n !== loadingNotification);
        
        handleError(error, 'Failed to delete task');
    } finally {
        if (buttonElement) {
            setButtonLoading(buttonElement, false);
        }
    }
}

// Utility functions
let activeNotifications = [];

function showNotification(message, type = 'info', duration = 3000) {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    
    const messageSpan = document.createElement('span');
    messageSpan.textContent = message;
    notification.appendChild(messageSpan);
    
    document.body.appendChild(notification);
    
    // Stack notifications
    const index = activeNotifications.length;
    activeNotifications.push(notification);
    notification.style.top = `${80 + (index * 70)}px`;

    if (duration > 0) {
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease-out';
            setTimeout(() => {
                notification.remove();
                activeNotifications = activeNotifications.filter(n => n !== notification);
                // Reposition remaining notifications
                activeNotifications.forEach((n, i) => {
                    n.style.top = `${80 + (i * 70)}px`;
                });
            }, 300);
        }, duration);
    }
    
    return notification;
}

function setButtonLoading(button, loading = true, originalText = null) {
    if (loading) {
        button.disabled = true;
        button.classList.add('loading');
        if (!button.dataset.originalText) {
            button.dataset.originalText = button.textContent;
        }
        // Keep the text, loading spinner added via CSS
    } else {
        button.disabled = false;
        button.classList.remove('loading');
        if (button.dataset.originalText) {
            button.textContent = button.dataset.originalText;
            delete button.dataset.originalText;
        }
    }
}

function handleError(error, context = '') {
    console.error(`Error ${context}:`, error);
    const errorMessage = error.message || error.toString() || 'An unexpected error occurred';
    showNotification(`${context ? context + ': ' : ''}${errorMessage}`, 'error', 5000);
}

// Close modal when clicking outside
window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.classList.remove('active');
    }
}
