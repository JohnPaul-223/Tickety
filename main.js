// ==================== config.js ====================

// Supabase Configuration
// Wait for Supabase library to be available
(function initializeSupabase() {
    'use strict';
    
    console.log('ðŸ”§ Initializing Supabase configuration...');
    console.log('ðŸ“¦ window.supabase available:', typeof window.supabase);

    // Check if Supabase library is loaded
    if (typeof window.supabase === 'undefined') {
        console.error('âŒ Supabase library not loaded!');
        console.error('ðŸ’¡ The @supabase/supabase-js library must be loaded first');
        console.error('ðŸŒ Check your internet connection');
        alert('Error: Supabase library not loaded. Please check your internet connection and reload.');
        return;
    }

    const SUPABASE_URL = 'https://vvdhzzrpuwppsxqioeat.supabase.co';
    const SUPABASE_ANON_KEY = 'sb_publishable_riVW4Au_E9MwnFbAaqwPUA_Oq-wbQ6Y'; // Replace this with your actual anon/public key from Supabase settings

    // Create Supabase client and make it globally available
    try {
        window.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        
        console.log('âœ… Supabase client created successfully');
        console.log('ðŸ“¡ Project URL:', SUPABASE_URL);
        console.log('ðŸ”— Client type:', typeof window.supabase);
        console.log('ðŸ”— .from() available:', typeof window.supabase.from);
        
        // Test connection
        window.supabase
            .from('tickets')
            .select('count')
            .then(({ data, error }) => {
                if (error) {
                    console.error('âŒ Database connection error:', error.message);
                    
                    if (error.message.includes('relation') || error.message.includes('does not exist')) {
                        alert('âš ï¸ Database tables not found!\n\nPlease run the supabase-setup.sql script in your Supabase SQL Editor.\n\nCheck SUPABASE_SETUP_GUIDE.md for instructions.');
                    }
                } else {
                    console.log('âœ… Database connection successful!');
                    console.log('ðŸŽ‰ Ticketing system ready!');
                }
            });
            
        // Clear old localStorage data
        if (localStorage.getItem('tickets') || localStorage.getItem('schedule')) {
            console.log('ðŸ§¹ Clearing old localStorage data...');
            localStorage.removeItem('tickets');
            localStorage.removeItem('schedule');
        }
        
    } catch (error) {
        console.error('âŒ Failed to create Supabase client:', error);
        alert('Error initializing Supabase: ' + error.message);
    }
})();


// ==================== app.js ====================

// Global state
let currentFilter = 'all';
let allTickets = [];
let allSchedule = [];
let charts = {};
let calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let selectedCalendarDate = getDateKey(new Date());
let ticketImageUrl = null;
let ticketImagePreviewUrl = null;

// Get Supabase client reference
const getSupabase = () => window.supabase;

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    console.log('ðŸ“± DOM Content Loaded');
    console.log('ðŸ” Checking Supabase in app.js:', typeof window.supabase);
    console.log('ðŸ” Supabase.from available:', typeof window.supabase?.from);
    
    if (typeof window.supabase === 'undefined' || typeof window.supabase.from !== 'function') {
        console.error('âŒ Supabase not available in app.js!');
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
                    <th>Done</th>
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
                            ${ticket.status === 'resolved' && ticket.resolved_at ? 
                                `<span style="color: #10b981;">✅ ${new Date(ticket.resolved_at).toLocaleDateString()}</span>` :
                            ticket.status === 'closed' && ticket.closed_at ?
                                `<span style="color: #ef4444;">🔒 ${new Date(ticket.closed_at).toLocaleDateString()}</span>` :
                            ticket.due_date ? `
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
        // Build update object with automatic timestamps
        const updateData = {
            status,
            updated_at: new Date().toISOString()
        };

        // Add specific timestamp based on status
        if (status === 'resolved') {
            updateData.resolved_at = new Date().toISOString();
        } else if (status === 'closed') {
            updateData.closed_at = new Date().toISOString();
        }

        const { error } = await supabase
            .from('tickets')
            .update(updateData)
            .eq('id', id);

        if (error) throw error;

        loadingNotification.remove();
        activeNotifications = activeNotifications.filter(n => n !== loadingNotification);
        
        showNotification('âœ“ Status updated successfully', 'success');
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
                    ðŸ•’ ${new Date(item.scheduled_date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
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

function handleTicketImageSelection(event) {
    const file = event.target.files[0];

    if (!file) {
        return;
    }

    if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) {
        event.target.value = '';
        showNotification('Choose an image up to 5 MB', 'error');
        return;
    }

    revokeTicketImagePreview();
    ticketImagePreviewUrl = URL.createObjectURL(file);
    showTicketImagePreview(ticketImagePreviewUrl);
}

function showTicketImagePreview(imageUrl) {
    const preview = document.getElementById('ticket-image-preview');
    const image = document.getElementById('ticket-image-preview-image');

    if (!preview || !image) {
        return;
    }

    if (!imageUrl) {
        image.removeAttribute('src');
        preview.hidden = true;
        return;
    }

    image.src = imageUrl;
    preview.hidden = false;
}

function revokeTicketImagePreview() {
    if (ticketImagePreviewUrl) {
        URL.revokeObjectURL(ticketImagePreviewUrl);
        ticketImagePreviewUrl = null;
    }
}

function resetTicketImage() {
    revokeTicketImagePreview();
    ticketImageUrl = null;

    const input = document.getElementById('ticket-image');
    if (input) {
        input.value = '';
    }

    showTicketImagePreview(null);
}

function clearTicketImage() {
    resetTicketImage();
}

function loadTicketImage(imageUrl) {
    revokeTicketImagePreview();
    ticketImageUrl = imageUrl || null;

    const input = document.getElementById('ticket-image');
    if (input) {
        input.value = '';
    }

    showTicketImagePreview(ticketImageUrl);
}

async function uploadTicketImage(file) {
    const extension = (file.name.split('.').pop() || 'png').replace(/[^a-z0-9]/gi, '').toLowerCase();
    const uniqueId = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const path = `tickets/${uniqueId}.${extension}`;
    const { error } = await supabase.storage
        .from('ticket-images')
        .upload(path, file, {
            cacheControl: '3600',
            contentType: file.type,
            upsert: false
        });

    if (error) {
        throw error;
    }

    const { data } = supabase.storage.from('ticket-images').getPublicUrl(path);
    return data.publicUrl;
}

// Modal functions
function showNewTicketModal() {
    document.getElementById('ticket-form').reset();
    document.getElementById('ticket-id').value = '';
    resetTicketImage();
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
    resetScheduleImage();
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
    
    console.log('ðŸ“ saveTicket called');
    
    const submitButton = event.target.querySelector('button[type="submit"]');
    setButtonLoading(submitButton, true);
    
    const id = document.getElementById('ticket-id').value;
    
    console.log('ðŸ” Form data collection starting...');
    
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
        image_url: ticketImageUrl,
        updated_at: new Date().toISOString()
    };

    // Add automatic timestamp for status changes
    if (id) {
        // When editing, check if status changed and add timestamp
        const { data: currentTicket } = await supabase
            .from('tickets')
            .select('status')
            .eq('id', id)
            .single();

        if (currentTicket && currentTicket.status !== ticketData.status) {
            if (ticketData.status === 'resolved') {
                ticketData.resolved_at = new Date().toISOString();
            } else if (ticketData.status === 'closed') {
                ticketData.closed_at = new Date().toISOString();
            }
        }
    } else {
        // For new tickets, set created_at
        ticketData.created_at = new Date().toISOString();
        
        // If creating ticket already resolved/closed, add timestamp
        if (ticketData.status === 'resolved') {
            ticketData.resolved_at = new Date().toISOString();
        } else if (ticketData.status === 'closed') {
            ticketData.closed_at = new Date().toISOString();
        }
    }

    console.log('ðŸ“Š Ticket data:', ticketData);
    console.log('ðŸ’¾ Supabase client available:', typeof supabase);

    try {
        let error, data;
        const imageFile = document.getElementById('ticket-image').files[0];

        if (imageFile) {
            ticketData.image_url = await uploadTicketImage(imageFile);
        }
        
        if (id) {
            console.log('ðŸ”„ Updating ticket #' + id);
            // Update existing ticket
            ({ data, error } = await supabase
                .from('tickets')
                .update(ticketData)
                .eq('id', id)
                .select());
                
            console.log('Update response:', { data, error });
        } else {
            console.log('âž• Creating new ticket');
            // Create new ticket (created_at already added above)
            ({ data, error } = await supabase
                .from('tickets')
                .insert([ticketData])
                .select());
                
            console.log('Insert response:', { data, error });
        }

        if (error) throw error;

        console.log('âœ… Operation successful');
        showNotification(id ? 'âœ“ Ticket updated successfully' : 'âœ“ Ticket created successfully', 'success');
        closeModal('ticket-modal');
        loadTickets(currentFilter);
        loadDashboard();
    } catch (error) {
        console.error('âŒ Error in saveTicket:', error);
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
    loadTicketImage(ticket.image_url);
    
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
                ${ticket.image_url ? `
                    <h3 style="margin-top: 1.5rem;">Image Attachment</h3>
                    <a class="ticket-image-link" href="${ticket.image_url}" target="_blank" rel="noopener noreferrer">
                        <img class="ticket-image-view" src="${ticket.image_url}" alt="Image attached to ticket #${ticket.id}">
                    </a>
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
                ${ticket.resolved_at ? `<p><strong>âœ… Resolved:</strong> ${new Date(ticket.resolved_at).toLocaleString()}</p>` : ''}
                ${ticket.closed_at ? `<p><strong>ðŸ”’ Closed:</strong> ${new Date(ticket.closed_at).toLocaleString()}</p>` : ''}
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

        showNotification('âœ“ Ticket deleted successfully', 'success');
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
    
    console.log('ðŸ“… saveSchedule called');
    
    const submitButton = event.target.querySelector('button[type="submit"]');
    setButtonLoading(submitButton, true);
    
    const id = document.getElementById('schedule-id').value;
    
    console.log('ðŸ” Schedule form data collection starting...');
    
    const scheduleData = {
        title: document.getElementById('schedule-title').value,
        description: document.getElementById('schedule-description').value || null,
        ticket_id: document.getElementById('schedule-ticket').value || null,
        scheduled_date: localDateTimeToUtc(document.getElementById('schedule-date').value),
        duration: parseInt(document.getElementById('schedule-duration').value),
        status: document.getElementById('schedule-status').value,
        image_url: scheduleImageUrl
    };


    console.log('Schedule data:', scheduleData);
    console.log('Supabase client available:', typeof supabase);


    try {
        let error, data;
        const imageFile = document.getElementById('schedule-image').files[0];
        if (imageFile) {
            scheduleData.image_url = await uploadScheduleImage(imageFile);
        }

        
        if (id) {
            console.log('ðŸ”„ Updating schedule #' + id);
            // Update existing schedule
            ({ data, error } = await supabase
                .from('schedule')
                .update(scheduleData)
                .eq('id', id)
                .select());
                
            console.log('Update response:', { data, error });
        } else {
            console.log('âž• Creating new schedule');
            // Create new schedule
            scheduleData.created_at = new Date().toISOString();
            ({ data, error } = await supabase
                .from('schedule')
                .insert([scheduleData])
                .select());
                
            console.log('Insert response:', { data, error });
        }

        if (error) throw error;

        console.log('âœ… Operation successful');
        showNotification(id ? 'âœ“ Task updated successfully' : 'âœ“ Task scheduled successfully', 'success');
        closeModal('schedule-modal');
        loadSchedule();
        loadDashboard();
    } catch (error) {
        console.error('âŒ Error in saveSchedule:', error);
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
    loadScheduleImage(item.image_url);
    
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

        showNotification('âœ“ Task deleted successfully', 'success');
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


// ==================== app-multiple-images.js ====================

// Multiple Images Extension for Datche Ticketing Service
// Add this file AFTER app.js in your HTML to enable multiple image support

// Global state for multiple images
let ticketImages = []; // Array of { file, previewUrl }
let ticketImageUrls = []; // Array of uploaded image URLs for edit mode
let existingTicketImages = []; // Array of existing images when editing

// Handle multiple image selection
function handleTicketImagesSelection(event) {
    const files = Array.from(event.target.files);
    
    if (files.length === 0) {
        return;
    }

    // Validate each file
    const validFiles = [];
    for (const file of files) {
        if (!file.type.startsWith('image/')) {
            showNotification(`${file.name} is not an image file`, 'error');
            continue;
        }
        
        if (file.size > 5 * 1024 * 1024) {
            showNotification(`${file.name} exceeds 5 MB limit`, 'error');
            continue;
        }
        
        validFiles.push(file);
    }

    // Add valid files to the collection
    for (const file of validFiles) {
        const previewUrl = URL.createObjectURL(file);
        ticketImages.push({ file, previewUrl });
    }

    // Clear the input so same files can be selected again if needed
    event.target.value = '';
    
    renderTicketImagesPreview();
}

// Render image previews
function renderTicketImagesPreview() {
    const container = document.getElementById('ticket-images-preview');
    
    if (!container) {
        return;
    }

    // Show existing images (when editing)
    const existingHTML = existingTicketImages.map((img, index) => `
        <div class="ticket-image-preview-item">
            <img src="${img.image_url}" alt="Ticket image ${index + 1}">
            <button type="button" class="icon-button ticket-image-remove" onclick="removeExistingImage(${img.id}, ${index})" aria-label="Remove image" title="Remove image">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
            </button>
        </div>
    `).join('');

    // Show new images (pending upload)
    const newHTML = ticketImages.map((item, index) => `
        <div class="ticket-image-preview-item">
            <img src="${item.previewUrl}" alt="New ticket image ${index + 1}">
            <button type="button" class="icon-button ticket-image-remove" onclick="removeNewImage(${index})" aria-label="Remove image" title="Remove image">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
            </button>
        </div>
    `).join('');

    container.innerHTML = existingHTML + newHTML;
}

// Remove a new image (not yet uploaded)
function removeNewImage(index) {
    const item = ticketImages[index];
    if (item && item.previewUrl) {
        URL.revokeObjectURL(item.previewUrl);
    }
    ticketImages.splice(index, 1);
    renderTicketImagesPreview();
}

// Remove an existing image (already in database)
async function removeExistingImage(imageId, index) {
    if (!confirm('Are you sure you want to delete this image?')) {
        return;
    }

    try {
        // Delete from database
        const { error } = await supabase
            .from('ticket_images')
            .delete()
            .eq('id', imageId);

        if (error) throw error;

        // Remove from array
        existingTicketImages.splice(index, 1);
        renderTicketImagesPreview();
        showNotification('Image deleted successfully', 'success');
    } catch (error) {
        console.error('Error deleting image:', error);
        showNotification('Failed to delete image', 'error');
    }
}

// Clear all images
function clearAllTicketImages() {
    // Revoke all preview URLs
    ticketImages.forEach(item => {
        if (item.previewUrl) {
            URL.revokeObjectURL(item.previewUrl);
        }
    });
    
    ticketImages = [];
    ticketImageUrls = [];
    existingTicketImages = [];
    
    const input = document.getElementById('ticket-images');
    if (input) {
        input.value = '';
    }
    
    renderTicketImagesPreview();
}

// Upload multiple images
async function uploadMultipleTicketImages(files, onProgress) {
    const uploadedUrls = [];
    
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        if (onProgress) {
            onProgress(i + 1, files.length);
        }
        
        try {
            const url = await uploadTicketImage(file);
            uploadedUrls.push(url);
        } catch (error) {
            console.error(`Error uploading ${file.name}:`, error);
            showNotification(`Failed to upload ${file.name}`, 'error');
        }
    }
    
    return uploadedUrls;
}

// Save images to ticket_images table
async function saveTicketImages(ticketId, imageUrls) {
    const imagesToInsert = imageUrls.map((url, index) => ({
        ticket_id: ticketId,
        image_url: url,
        position: index
    }));

    const { error } = await supabase
        .from('ticket_images')
        .insert(imagesToInsert);

    if (error) {
        console.error('Error saving ticket images:', error);
        throw error;
    }
}

// Load images for a ticket
async function loadTicketImages(ticketId) {
    const { data, error } = await supabase
        .from('ticket_images')
        .select('*')
        .eq('ticket_id', ticketId)
        .order('position', { ascending: true });

    if (error) {
        console.error('Error loading ticket images:', error);
        return [];
    }

    return data || [];
}

// Override the original showNewTicketModal to clear images
const originalShowNewTicketModal = window.showNewTicketModal;
window.showNewTicketModal = function() {
    if (originalShowNewTicketModal) {
        originalShowNewTicketModal();
    }
    clearAllTicketImages();
};

// Override the original saveTicket function to handle multiple images
const originalSaveTicket = window.saveTicket;
window.saveTicket = async function(event) {
    event.preventDefault();
    
    const submitButton = event.target.querySelector('button[type="submit"]');
    setButtonLoading(submitButton, true);
    
    const id = document.getElementById('ticket-id').value;
    
    try {
        // Upload new images if any
        let newImageUrls = [];
        if (ticketImages.length > 0) {
            showNotification(`Uploading ${ticketImages.length} image(s)...`, 'loading', 0);
            
            const files = ticketImages.map(item => item.file);
            newImageUrls = await uploadMultipleTicketImages(files, (current, total) => {
                console.log(`Uploading image ${current}/${total}`);
            });
            
            closeNotification();
        }

        // Prepare ticket data (without image_url for backward compatibility)
        const ticketData = {
            title: document.getElementById('ticket-title').value,
            description: document.getElementById('ticket-description').value,
            client_name: document.getElementById('ticket-client-name').value,
            client_email: document.getElementById('ticket-client-email').value || null,
            client_phone: document.getElementById('ticket-client-phone').value || null,
            category: document.getElementById('ticket-category').value || null,
            priority: document.getElementById('ticket-priority').value,
            status: document.getElementById('ticket-status').value,
            due_date: document.getElementById('ticket-due-date').value ? 
                      localDateTimeToUtc(document.getElementById('ticket-due-date').value) : null,
            notes: document.getElementById('ticket-notes').value || null,
            updated_at: new Date().toISOString()
        };

        let ticketId = id;

        if (id) {
            // Update existing ticket
            const { error } = await supabase
                .from('tickets')
                .update(ticketData)
                .eq('id', id);

            if (error) throw error;

            // Save new images to ticket_images table
            if (newImageUrls.length > 0) {
                await saveTicketImages(id, newImageUrls);
            }

            showNotification('âœ“ Ticket updated successfully', 'success');
        } else {
            // Create new ticket
            ticketData.created_at = new Date().toISOString();
            
            const { data: newTicket, error } = await supabase
                .from('tickets')
                .insert([ticketData])
                .select()
                .single();

            if (error) throw error;
            
            ticketId = newTicket.id;

            // Save images to ticket_images table
            if (newImageUrls.length > 0) {
                await saveTicketImages(ticketId, newImageUrls);
            }

            showNotification('âœ“ Ticket created successfully', 'success');
        }

        closeModal('ticket-modal');
        clearAllTicketImages();
        
        // Reload the current page
        const currentPage = document.querySelector('.page.active').id.replace('-page', '');
        if (currentPage === 'dashboard') {
            loadDashboard();
        } else if (currentPage === 'tickets') {
            loadTickets(currentFilter);
        }

    } catch (error) {
        console.error('Error saving ticket:', error);
        handleError(error, 'Failed to save ticket');
    } finally {
        setButtonLoading(submitButton, false);
    }
};

// Override editTicket to load multiple images
const originalEditTicket = window.editTicket;
window.editTicket = async function(id) {
    try {
        // Get ticket data
        const { data: ticket, error } = await supabase
            .from('tickets')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;

        // Load existing images
        existingTicketImages = await loadTicketImages(id);
        ticketImages = [];

        // Populate form
        document.getElementById('ticket-id').value = ticket.id;
        document.getElementById('ticket-title').value = ticket.title;
        document.getElementById('ticket-description').value = ticket.description;
        document.getElementById('ticket-client-name').value = ticket.client_name;
        document.getElementById('ticket-client-email').value = ticket.client_email || '';
        document.getElementById('ticket-client-phone').value = ticket.client_phone || '';
        document.getElementById('ticket-category').value = ticket.category || '';
        document.getElementById('ticket-priority').value = ticket.priority;
        document.getElementById('ticket-status').value = ticket.status;
        document.getElementById('ticket-due-date').value = ticket.due_date ? utcToDateTimeLocal(ticket.due_date) : '';
        document.getElementById('ticket-notes').value = ticket.notes || '';

        // Render image previews
        renderTicketImagesPreview();

        document.getElementById('ticket-modal-title').textContent = 'Edit Ticket';
        openModal('ticket-modal');

    } catch (error) {
        console.error('Error loading ticket:', error);
        showNotification('Failed to load ticket', 'error');
    }
};

// Override viewTicket to show multiple images
const originalViewTicket = window.viewTicket;
window.viewTicket = async function(id) {
    try {
        // Get ticket data
        const { data: ticket, error } = await supabase
            .from('tickets')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;

        // Load ticket images
        const images = await loadTicketImages(id);

        const container = document.getElementById('ticket-details');
        
        // Render ticket details
        container.innerHTML = `
            <div class="ticket-details">
                <h2>#${ticket.id} - ${ticket.title}</h2>
                <p><strong>Status:</strong> <span class="badge badge-${ticket.status}">${ticket.status}</span></p>
                <p><strong>Priority:</strong> <span class="badge badge-${ticket.priority}">${ticket.priority}</span></p>
                <p><strong>Description:</strong><br>${ticket.description}</p>
                <p><strong>Client:</strong> ${ticket.client_name}</p>
                ${ticket.client_email ? `<p><strong>Email:</strong> ${ticket.client_email}</p>` : ''}
                ${ticket.client_phone ? `<p><strong>Phone:</strong> ${ticket.client_phone}</p>` : ''}
                ${ticket.category ? `<p><strong>Category:</strong> ${ticket.category}</p>` : ''}
                <p><strong>Created:</strong> ${new Date(ticket.created_at).toLocaleString()}</p>
                ${ticket.due_date ? `<p><strong>Due Date:</strong> ${new Date(ticket.due_date).toLocaleString()}</p>` : ''}
                ${ticket.notes ? `<p><strong>Notes:</strong><br>${ticket.notes}</p>` : ''}
                
                ${images.length > 0 ? `
                    <div style="margin-top: 1.5rem;">
                        <h3>Attachments (${images.length})</h3>
                        <div class="ticket-images-gallery">
                            ${images.map((img, index) => `
                                <div class="ticket-image-gallery-item" onclick="window.open('${img.image_url}', '_blank')">
                                    <img src="${img.image_url}" alt="Ticket image ${index + 1}">
                                    ${img.caption ? `<div class="ticket-image-caption">${img.caption}</div>` : ''}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
                
                <div class="form-actions" style="margin-top: 1.5rem;">
                    <button class="btn btn-primary" onclick="closeModal('view-ticket-modal'); editTicket(${ticket.id});">Edit Ticket</button>
                    <button class="btn btn-secondary" onclick="closeModal('view-ticket-modal')">Close</button>
                </div>
            </div>
        `;

        openModal('view-ticket-modal');

    } catch (error) {
        console.error('Error loading ticket:', error);
        showNotification('Failed to load ticket details', 'error');
    }
};

// Helper function to close notification (for image upload progress)
function closeNotification() {
    const notifications = document.querySelectorAll('.notification');
    notifications.forEach(n => {
        n.style.animation = 'slideOut .2s ease-in forwards';
        setTimeout(() => n.remove(), 200);
    });
}

console.log('âœ… Multiple images extension loaded successfully');


// ==================== app-database.js ====================

// Database Management Feature for Datche Ticketing Service
// Handles database monitoring, statistics, and auto-cleanup
// Optimized for Supabase Free Tier

// Supabase Free Tier Limits
const SUPABASE_FREE_TIER = {
    maxStorageGB: 0.5,        // 500 MB
    maxStorageMB: 500,
    maxRows: 500000,          // 500K rows
    warningThreshold: 0.8     // Alert at 80% usage
};

let databaseCharts = {};
let cleanupSettings = {
    enabled: false,
    ticketsDays: 90,
    scheduleDays: 30,
    frequency: 'daily',
    lastCleanup: null
};

// Load cleanup settings from localStorage
function loadCleanupSettings() {
    const saved = localStorage.getItem('cleanup_settings');
    if (saved) {
        cleanupSettings = { ...cleanupSettings, ...JSON.parse(saved) };
    }
    
    // Apply settings to UI
    document.getElementById('auto-cleanup-enabled').checked = cleanupSettings.enabled;
    document.getElementById('cleanup-tickets-days').value = cleanupSettings.ticketsDays;
    document.getElementById('cleanup-schedule-days').value = cleanupSettings.scheduleDays;
    document.getElementById('cleanup-frequency').value = cleanupSettings.frequency;
    
    // Update last cleanup display
    if (cleanupSettings.lastCleanup) {
        const date = new Date(cleanupSettings.lastCleanup);
        document.getElementById('db-last-cleanup').textContent = date.toLocaleDateString();
    }
}

// Save cleanup settings
function saveCleanupSettings() {
    cleanupSettings.enabled = document.getElementById('auto-cleanup-enabled').checked;
    cleanupSettings.ticketsDays = parseInt(document.getElementById('cleanup-tickets-days').value);
    cleanupSettings.scheduleDays = parseInt(document.getElementById('cleanup-schedule-days').value);
    cleanupSettings.frequency = document.getElementById('cleanup-frequency').value;
    
    localStorage.setItem('cleanup_settings', JSON.stringify(cleanupSettings));
    showNotification('âœ“ Cleanup settings saved', 'success');
    
    // If enabled, schedule next cleanup check
    if (cleanupSettings.enabled) {
        scheduleAutoCleanup();
    }
}

// Toggle auto-cleanup
function toggleAutoCleanup() {
    saveCleanupSettings();
    if (cleanupSettings.enabled) {
        showNotification('âœ“ Auto-cleanup enabled', 'success');
    } else {
        showNotification('Auto-cleanup disabled', 'info');
    }
}

// Load database page
async function loadDatabasePage() {
    console.log('ðŸ“Š Loading database page...');
    
    try {
        await Promise.all([
            loadDatabaseStats(),
            loadDatabaseCharts(),
            loadTablesInfo()
        ]);
        
        loadCleanupSettings();
        checkAutoCleanup();
        
    } catch (error) {
        console.error('Error loading database page:', error);
        showNotification('Error loading database information', 'error');
    }
}

// Load database statistics
async function loadDatabaseStats() {
    try {
        // Get tickets count
        const { count: ticketsCount } = await supabase
            .from('tickets')
            .select('*', { count: 'exact', head: true });

        // Get schedule count
        const { count: scheduleCount } = await supabase
            .from('schedule')
            .select('*', { count: 'exact', head: true });

        // Get images count
        const { count: imagesCount } = await supabase
            .from('ticket_images')
            .select('*', { count: 'exact', head: true });

        const totalRecords = (ticketsCount || 0) + (scheduleCount || 0) + (imagesCount || 0);
        document.getElementById('db-total-records').textContent = totalRecords.toLocaleString();

        // Check free tier limits
        checkFreeTierLimits(totalRecords);

        // Calculate old records (>90 days)
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

        const { count: oldTickets } = await supabase
            .from('tickets')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'resolved')
            .lt('created_at', ninetyDaysAgo.toISOString());

        const { count: oldSchedule } = await supabase
            .from('schedule')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'completed')
            .lt('created_at', ninetyDaysAgo.toISOString());

        const oldRecords = (oldTickets || 0) + (oldSchedule || 0);
        document.getElementById('db-old-records').textContent = oldRecords.toLocaleString();

        // Estimate storage size (approximate calculation)
        // Average sizes: Ticket ~2KB, Schedule ~1KB, Image record ~0.5KB
        const estimatedSizeKB = (ticketsCount * 2) + (scheduleCount * 1) + (imagesCount * 0.5);
        const estimatedSizeMB = estimatedSizeKB / 1024;
        
        // Display with free tier context
        const storageElement = document.getElementById('db-storage-size');
        storageElement.textContent = `${estimatedSizeMB.toFixed(2)} MB`;
        
        // Add free tier indicator
        const usagePercent = (estimatedSizeMB / SUPABASE_FREE_TIER.maxStorageMB) * 100;
        const freeTierInfo = ` (${usagePercent.toFixed(1)}% of ${SUPABASE_FREE_TIER.maxStorageMB}MB)`;
        storageElement.textContent += freeTierInfo;
        
        // Change color based on usage
        if (usagePercent >= SUPABASE_FREE_TIER.warningThreshold * 100) {
            storageElement.style.color = 'var(--danger-color)';
        } else if (usagePercent >= 60) {
            storageElement.style.color = 'var(--warning-color)';
        } else {
            storageElement.style.color = 'var(--success-color)';
        }

        // Update usage bars
        updateUsageBars(totalRecords, estimatedSizeMB);

    } catch (error) {
        console.error('Error loading database stats:', error);
    }
}

// Update usage bars
function updateUsageBars(totalRecords, storageMB) {
    // Calculate percentages
    const rowsPercent = (totalRecords / SUPABASE_FREE_TIER.maxRows) * 100;
    const storagePercent = (storageMB / SUPABASE_FREE_TIER.maxStorageMB) * 100;
    
    // Update rows usage
    const rowsBar = document.getElementById('rows-usage-bar');
    const rowsPercentageEl = document.getElementById('rows-percentage');
    const rowsUsageText = document.getElementById('rows-usage-text');
    const rowsRemaining = document.getElementById('rows-remaining');
    
    if (rowsBar && rowsPercentageEl && rowsUsageText && rowsRemaining) {
        rowsBar.style.width = Math.min(rowsPercent, 100) + '%';
        rowsPercentageEl.textContent = rowsPercent.toFixed(1) + '%';
        rowsUsageText.textContent = `${totalRecords.toLocaleString()} / ${SUPABASE_FREE_TIER.maxRows.toLocaleString()}`;
        rowsRemaining.textContent = `${(SUPABASE_FREE_TIER.maxRows - totalRecords).toLocaleString()} remaining`;
        
        // Apply color classes
        rowsBar.className = 'usage-bar';
        if (rowsPercent >= SUPABASE_FREE_TIER.warningThreshold * 100) {
            rowsBar.classList.add('danger');
        } else if (rowsPercent >= 60) {
            rowsBar.classList.add('warning');
        }
    }
    
    // Update storage usage
    const storageBar = document.getElementById('storage-usage-bar');
    const storagePercentageEl = document.getElementById('storage-percentage');
    const storageUsageText = document.getElementById('storage-usage-text');
    const storageRemaining = document.getElementById('storage-remaining');
    
    if (storageBar && storagePercentageEl && storageUsageText && storageRemaining) {
        storageBar.style.width = Math.min(storagePercent, 100) + '%';
        storagePercentageEl.textContent = storagePercent.toFixed(1) + '%';
        storageUsageText.textContent = `${storageMB.toFixed(1)} MB / ${SUPABASE_FREE_TIER.maxStorageMB} MB`;
        storageRemaining.textContent = `${(SUPABASE_FREE_TIER.maxStorageMB - storageMB).toFixed(1)} MB remaining`;
        
        // Apply color classes
        storageBar.className = 'usage-bar';
        if (storagePercent >= SUPABASE_FREE_TIER.warningThreshold * 100) {
            storageBar.classList.add('danger');
        } else if (storagePercent >= 60) {
            storageBar.classList.add('warning');
        }
    }
}

// Check Supabase free tier limits
function checkFreeTierLimits(totalRecords) {
    const rowUsagePercent = (totalRecords / SUPABASE_FREE_TIER.maxRows) * 100;
    
    // Show warning if approaching limit
    if (rowUsagePercent >= SUPABASE_FREE_TIER.warningThreshold * 100) {
        showFreeTierWarning(rowUsagePercent, totalRecords);
    }
    
    // Update UI with free tier context
    const totalElement = document.getElementById('db-total-records');
    const freeTierInfo = document.createElement('small');
    freeTierInfo.style.display = 'block';
    freeTierInfo.style.fontSize = '0.75rem';
    freeTierInfo.style.marginTop = '0.25rem';
    freeTierInfo.style.fontWeight = 'normal';
    
    if (rowUsagePercent >= SUPABASE_FREE_TIER.warningThreshold * 100) {
        freeTierInfo.style.color = 'var(--danger-color)';
        freeTierInfo.textContent = `âš ï¸ ${rowUsagePercent.toFixed(1)}% of free tier limit`;
    } else if (rowUsagePercent >= 60) {
        freeTierInfo.style.color = 'var(--warning-color)';
        freeTierInfo.textContent = `${rowUsagePercent.toFixed(1)}% of free tier`;
    } else {
        freeTierInfo.style.color = 'var(--muted-text)';
        freeTierInfo.textContent = `${rowUsagePercent.toFixed(1)}% of ${SUPABASE_FREE_TIER.maxRows.toLocaleString()} rows`;
    }
    
    // Remove old indicator if exists
    const oldIndicator = totalElement.parentElement.querySelector('small');
    if (oldIndicator) {
        oldIndicator.remove();
    }
    
    totalElement.parentElement.appendChild(freeTierInfo);
}

// Show free tier warning
function showFreeTierWarning(usagePercent, totalRecords) {
    const warning = document.getElementById('overdue-alert');
    const list = document.getElementById('overdue-list');
    
    if (!warning || !list) return;
    
    const remainingRows = SUPABASE_FREE_TIER.maxRows - totalRecords;
    
    warning.innerHTML = `
        <h3>âš ï¸ Supabase Free Tier Warning</h3>
        <p>You are using <strong>${usagePercent.toFixed(1)}%</strong> of the free tier database limit.</p>
        <ul>
            <li>Current records: <strong>${totalRecords.toLocaleString()}</strong></li>
            <li>Free tier limit: <strong>${SUPABASE_FREE_TIER.maxRows.toLocaleString()}</strong> rows</li>
            <li>Remaining capacity: <strong>${remainingRows.toLocaleString()}</strong> rows</li>
        </ul>
        <p><strong>Recommended Actions:</strong></p>
        <ul>
            <li>Enable auto-cleanup to remove old data automatically</li>
            <li>Reduce retention periods to keep less data</li>
            <li>Run manual cleanup to free up space now</li>
            <li>Consider upgrading to Supabase Pro if needed</li>
        </ul>
    `;
    warning.style.display = 'block';
}

// Load database charts
async function loadDatabaseCharts() {
    const colors = getThemedColors();
    
    // Destroy existing charts
    Object.values(databaseCharts).forEach(chart => {
        if (chart) chart.destroy();
    });

    try {
        // 1. Database Growth Chart
        const growthData = await getDatabaseGrowthData();
        const ctx1 = document.getElementById('db-growth-chart');
        if (ctx1) {
            databaseCharts.growth = new Chart(ctx1, {
                type: 'line',
                data: {
                    labels: growthData.labels,
                    datasets: [{
                        label: 'Total Records',
                        data: growthData.values,
                        borderColor: colors.cyan,
                        backgroundColor: colors.cyan + '20',
                        borderWidth: 2,
                        tension: 0.4,
                        fill: true
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

        // 2. Table Distribution Chart
        const tableData = await getTableDistributionData();
        const ctx2 = document.getElementById('db-table-distribution-chart');
        if (ctx2) {
            databaseCharts.tables = new Chart(ctx2, {
                type: 'doughnut',
                data: {
                    labels: tableData.labels,
                    datasets: [{
                        data: tableData.values,
                        backgroundColor: [colors.cyan, colors.purple, colors.orange],
                        borderWidth: 0,
                        cutout: '65%'
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

        // 3. Data Age Distribution Chart
        const ageData = await getDataAgeDistribution();
        const ctx3 = document.getElementById('db-age-distribution-chart');
        if (ctx3) {
            databaseCharts.age = new Chart(ctx3, {
                type: 'bar',
                data: {
                    labels: ageData.labels,
                    datasets: [{
                        label: 'Records',
                        data: ageData.values,
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

        // 4. Storage Usage Chart
        const storageData = await getStorageUsageData();
        const ctx4 = document.getElementById('db-storage-chart');
        if (ctx4) {
            databaseCharts.storage = new Chart(ctx4, {
                type: 'bar',
                data: {
                    labels: storageData.labels,
                    datasets: [{
                        label: 'Records',
                        data: storageData.values,
                        backgroundColor: [colors.blue, colors.pink, colors.yellow],
                        borderRadius: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    indexAxis: 'y',
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        x: { 
                            grid: { color: colors.grid },
                            ticks: { color: colors.text }
                        },
                        y: { 
                            grid: { display: false },
                            ticks: { color: colors.text }
                        }
                    }
                }
            });
        }

    } catch (error) {
        console.error('Error loading database charts:', error);
    }
}

// Get database growth data
async function getDatabaseGrowthData() {
    const labels = [];
    const values = [];
    
    // Get last 6 months
    for (let i = 5; i >= 0; i--) {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
        const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
        
        labels.push(monthStart.toLocaleDateString('en-US', { month: 'short' }));
        
        // Count tickets created in this month
        const { count } = await supabase
            .from('tickets')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', monthStart.toISOString())
            .lte('created_at', monthEnd.toISOString());
        
        values.push(count || 0);
    }
    
    return { labels, values };
}

// Get table distribution data
async function getTableDistributionData() {
    const { count: ticketsCount } = await supabase
        .from('tickets')
        .select('*', { count: 'exact', head: true });

    const { count: scheduleCount } = await supabase
        .from('schedule')
        .select('*', { count: 'exact', head: true });

    const { count: imagesCount } = await supabase
        .from('ticket_images')
        .select('*', { count: 'exact', head: true });

    return {
        labels: ['Tickets', 'Schedule', 'Images'],
        values: [ticketsCount || 0, scheduleCount || 0, imagesCount || 0]
    };
}

// Get data age distribution
async function getDataAgeDistribution() {
    const labels = ['< 7 days', '7-30 days', '30-90 days', '> 90 days'];
    const values = [0, 0, 0, 0];
    
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    // Count tickets by age
    const { data: tickets } = await supabase
        .from('tickets')
        .select('created_at');

    if (tickets) {
        tickets.forEach(ticket => {
            const createdAt = new Date(ticket.created_at);
            if (createdAt > sevenDaysAgo) values[0]++;
            else if (createdAt > thirtyDaysAgo) values[1]++;
            else if (createdAt > ninetyDaysAgo) values[2]++;
            else values[3]++;
        });
    }

    return { labels, values };
}

// Get storage usage data
async function getStorageUsageData() {
    const { count: ticketsCount } = await supabase
        .from('tickets')
        .select('*', { count: 'exact', head: true });

    const { count: scheduleCount } = await supabase
        .from('schedule')
        .select('*', { count: 'exact', head: true });

    const { count: imagesCount } = await supabase
        .from('ticket_images')
        .select('*', { count: 'exact', head: true });

    return {
        labels: ['Tickets', 'Schedule', 'Images'],
        values: [ticketsCount || 0, scheduleCount || 0, imagesCount || 0]
    };
}

// Load tables information
async function loadTablesInfo() {
    const tbody = document.getElementById('database-tables-tbody');
    
    try {
        // Get ticket_images count
        const { count: imagesCount } = await supabase
            .from('ticket_images')
            .select('*', { count: 'exact', head: true });

        // Get tickets with old single image
        const { data: ticketsWithImages } = await supabase
            .from('tickets')
            .select('id, image_url')
            .not('image_url', 'is', null)
            .neq('image_url', '');

        // Check which old images are NOT yet migrated
        let unmigrated = 0;
        if (ticketsWithImages && ticketsWithImages.length > 0) {
            for (const ticket of ticketsWithImages) {
                const { data: existing } = await supabase
                    .from('ticket_images')
                    .select('id')
                    .eq('ticket_id', ticket.id)
                    .eq('image_url', ticket.image_url)
                    .maybeSingle();

                if (!existing) {
                    unmigrated++;
                }
            }
        }

        const tables = [
            { name: 'tickets', table: 'tickets' },
            { name: 'schedule', table: 'schedule' },
            { name: 'ticket_images', table: 'ticket_images', hasOldImages: unmigrated > 0, unmigratedCount: unmigrated }
        ];

        let html = '';

        for (const table of tables) {
            // Get count
            const { count } = await supabase
                .from(table.table)
                .select('*', { count: 'exact', head: true });

            // Get oldest record
            const { data: oldest } = await supabase
                .from(table.table)
                .select('created_at')
                .order('created_at', { ascending: true })
                .limit(1);

            // Get newest record
            const { data: newest } = await supabase
                .from(table.table)
                .select('created_at')
                .order('created_at', { ascending: false })
                .limit(1);

            const oldestDate = oldest && oldest[0] ? new Date(oldest[0].created_at).toLocaleDateString() : 'N/A';
            const newestDate = newest && newest[0] ? new Date(newest[0].created_at).toLocaleDateString() : 'N/A';

            html += `
                <tr>
                    <td>
                        <strong>${table.name}</strong>
                        ${table.hasOldImages ? `<br><small style="color: var(--warning-color);">âš ï¸ ${table.unmigratedCount} old images need migration</small>` : ''}
                    </td>
                    <td>${(count || 0).toLocaleString()}</td>
                    <td>${oldestDate}</td>
                    <td>${newestDate}</td>
                    <td>
                        <button class="btn btn-sm" onclick="viewTableDetails('${table.table}')">View</button>
                        ${table.hasOldImages ? `<button class="btn btn-sm btn-warning" onclick="showMigrationGuide()" style="margin-left: 0.5rem;">Migrate</button>` : ''}
                    </td>
                </tr>
            `;
        }

        tbody.innerHTML = html;

    } catch (error) {
        console.error('Error loading tables info:', error);
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Error loading table information</td></tr>';
    }
}

// Refresh database stats
async function refreshDatabaseStats() {
    showNotification('Refreshing database statistics...', 'loading', 0);
    
    try {
        await loadDatabasePage();
        closeNotification();
        showNotification('âœ“ Database stats refreshed', 'success');
    } catch (error) {
        closeNotification();
        showNotification('Error refreshing stats', 'error');
    }
}

// Show cleanup modal
async function showCleanupModal() {
    // Calculate preview
    const ticketsDays = parseInt(document.getElementById('cleanup-tickets-days').value);
    const scheduleDays = parseInt(document.getElementById('cleanup-schedule-days').value);
    
    const ticketsCutoff = new Date();
    ticketsCutoff.setDate(ticketsCutoff.getDate() - ticketsDays);
    
    const scheduleCutoff = new Date();
    scheduleCutoff.setDate(scheduleCutoff.getDate() - scheduleDays);

    // Count tickets to delete
    const { count: ticketsToDelete } = await supabase
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'resolved')
        .lt('created_at', ticketsCutoff.toISOString());

    // Count schedule to delete
    const { count: scheduleToDelete } = await supabase
        .from('schedule')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'completed')
        .lt('created_at', scheduleCutoff.toISOString());

    // Get tickets IDs to count images
    const { data: ticketsData } = await supabase
        .from('tickets')
        .select('id')
        .eq('status', 'resolved')
        .lt('created_at', ticketsCutoff.toISOString());

    let imagesToDelete = 0;
    if (ticketsData && ticketsData.length > 0) {
        const ticketIds = ticketsData.map(t => t.id);
        const { count: imagesCount } = await supabase
            .from('ticket_images')
            .select('*', { count: 'exact', head: true })
            .in('ticket_id', ticketIds);
        imagesToDelete = imagesCount || 0;
    }

    // Update preview
    document.getElementById('preview-tickets-days').textContent = ticketsDays;
    document.getElementById('preview-tickets-count').textContent = ticketsToDelete || 0;
    document.getElementById('preview-schedule-days').textContent = scheduleDays;
    document.getElementById('preview-schedule-count').textContent = scheduleToDelete || 0;
    document.getElementById('preview-images-count').textContent = imagesToDelete;

    openModal('cleanup-modal');
}

// Confirm and run cleanup
async function confirmCleanup() {
    closeModal('cleanup-modal');
    
    showNotification('Cleaning up old data...', 'loading', 0);
    
    try {
        const result = await performCleanup();
        
        cleanupSettings.lastCleanup = new Date().toISOString();
        saveCleanupSettings();
        
        closeNotification();
        showNotification(
            `âœ“ Cleanup complete! Deleted ${result.tickets} tickets, ${result.schedule} tasks, and ${result.images} images`,
            'success'
        );
        
        await loadDatabasePage();
        
    } catch (error) {
        closeNotification();
        console.error('Error during cleanup:', error);
        showNotification('Error during cleanup: ' + error.message, 'error');
    }
}

// Perform cleanup
async function performCleanup() {
    const ticketsDays = parseInt(document.getElementById('cleanup-tickets-days').value);
    const scheduleDays = parseInt(document.getElementById('cleanup-schedule-days').value);
    
    const ticketsCutoff = new Date();
    ticketsCutoff.setDate(ticketsCutoff.getDate() - ticketsDays);
    
    const scheduleCutoff = new Date();
    scheduleCutoff.setDate(scheduleCutoff.getDate() - scheduleDays);

    let deletedTickets = 0;
    let deletedSchedule = 0;
    let deletedImages = 0;

    // Delete old resolved tickets (cascades to images)
    const { data: ticketsToDelete } = await supabase
        .from('tickets')
        .select('id')
        .eq('status', 'resolved')
        .lt('created_at', ticketsCutoff.toISOString());

    if (ticketsToDelete && ticketsToDelete.length > 0) {
        // Count images first
        const ticketIds = ticketsToDelete.map(t => t.id);
        const { count: imagesCount } = await supabase
            .from('ticket_images')
            .select('*', { count: 'exact', head: true })
            .in('ticket_id', ticketIds);
        deletedImages = imagesCount || 0;

        // Delete tickets (cascade will delete images)
        const { error: ticketsError } = await supabase
            .from('tickets')
            .delete()
            .in('id', ticketIds);

        if (ticketsError) throw ticketsError;
        deletedTickets = ticketsToDelete.length;
    }

    // Delete old completed schedule
    const { data: scheduleToDelete } = await supabase
        .from('schedule')
        .select('id')
        .eq('status', 'completed')
        .lt('created_at', scheduleCutoff.toISOString());

    if (scheduleToDelete && scheduleToDelete.length > 0) {
        const scheduleIds = scheduleToDelete.map(s => s.id);
        const { error: scheduleError } = await supabase
            .from('schedule')
            .delete()
            .in('id', scheduleIds);

        if (scheduleError) throw scheduleError;
        deletedSchedule = scheduleToDelete.length;
    }

    return {
        tickets: deletedTickets,
        schedule: deletedSchedule,
        images: deletedImages
    };
}

// Run manual cleanup
async function runManualCleanup() {
    if (!confirm('Are you sure you want to run cleanup now? This will delete old data based on your settings.')) {
        return;
    }
    
    await confirmCleanup();
}

// Check if auto-cleanup should run
function checkAutoCleanup() {
    if (!cleanupSettings.enabled) {
        return;
    }

    const lastCleanup = cleanupSettings.lastCleanup ? new Date(cleanupSettings.lastCleanup) : null;
    const now = new Date();
    
    if (!lastCleanup) {
        // Never run before
        console.log('Auto-cleanup enabled but never run. Waiting for first manual run.');
        return;
    }

    const daysSinceLastCleanup = Math.floor((now - lastCleanup) / (1000 * 60 * 60 * 24));
    
    let shouldRun = false;
    
    switch (cleanupSettings.frequency) {
        case 'daily':
            shouldRun = daysSinceLastCleanup >= 1;
            break;
        case 'weekly':
            shouldRun = daysSinceLastCleanup >= 7;
            break;
        case 'monthly':
            shouldRun = daysSinceLastCleanup >= 30;
            break;
    }

    if (shouldRun) {
        console.log('ðŸ§¹ Auto-cleanup triggered');
        performCleanup()
            .then(result => {
                cleanupSettings.lastCleanup = now.toISOString();
                saveCleanupSettings();
                console.log('âœ“ Auto-cleanup complete:', result);
            })
            .catch(error => {
                console.error('Error during auto-cleanup:', error);
            });
    }
}

// Schedule auto-cleanup check
function scheduleAutoCleanup() {
    // Check every hour
    setInterval(checkAutoCleanup, 60 * 60 * 1000);
}

// View table details
async function viewTableDetails(tableName) {
    try {
        showNotification(`Loading ${tableName} data...`, 'loading', 0);
        
        // Fetch table data
        const { data, error } = await supabase
            .from(tableName)
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100);

        closeNotification();

        if (error) throw error;

        // Create modal content
        let modalContent = `
            <h2>${tableName.charAt(0).toUpperCase() + tableName.slice(1)} - Recent Records</h2>
            <p class="page-subtitle">Showing up to 100 most recent records</p>
        `;

        if (!data || data.length === 0) {
            modalContent += '<p class="empty-state">No records found in this table</p>';
        } else if (tableName === 'ticket_images') {
            // Special gallery view for images table
            modalContent += `
                <div class="image-gallery-grid">
                    ${data.map(row => `
                        <div class="image-gallery-tile" onclick="openImageFullscreen('${row.image_url}', ${row.ticket_id}, '${row.created_at}')">
                            <img src="${row.image_url}" alt="Ticket ${row.ticket_id} image" loading="lazy">
                            <div class="image-tile-overlay">
                                <div class="image-tile-info">
                                    <span>Ticket #${row.ticket_id}</span>
                                    <span>${new Date(row.created_at).toLocaleDateString()}</span>
                                </div>
                                <div class="image-tile-action">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                                        <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                                        <path d="M10 13l3 3 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                    </svg>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
                <p style="margin-top: 1rem; color: var(--muted-text); text-align: center;">
                    Click any image to view fullscreen
                </p>
            `;
        } else {
            // Regular table view for other tables
            const columns = Object.keys(data[0]);
            
            modalContent += `
                <div style="overflow-x: auto; max-height: 60vh;">
                    <table class="table">
                        <thead>
                            <tr>
                                ${columns.map(col => `<th>${col.replace(/_/g, ' ').toUpperCase()}</th>`).join('')}
                            </tr>
                        </thead>
                        <tbody>
                            ${data.map(row => `
                                <tr>
                                    ${columns.map(col => {
                                        let value = row[col];
                                        
                                        // Format different types of values
                                        if (value === null) {
                                            return '<td style="color: var(--muted-text);">-</td>';
                                        } else if (typeof value === 'boolean') {
                                            return `<td>${value ? 'âœ“' : 'âœ—'}</td>`;
                                        } else if (col.includes('date') || col.includes('at')) {
                                            return `<td>${new Date(value).toLocaleString()}</td>`;
                                        } else if (col === 'status' || col === 'priority') {
                                            return `<td><span class="badge badge-${value}">${value}</span></td>`;
                                        } else if (typeof value === 'string' && value.length > 50) {
                                            return `<td title="${value}">${value.substring(0, 50)}...</td>`;
                                        } else if (col.includes('url') && value) {
                                            return `<td><a href="${value}" target="_blank" rel="noopener">View</a></td>`;
                                        } else {
                                            return `<td>${value}</td>`;
                                        }
                                    }).join('')}
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }

        modalContent += `
            <div class="form-actions" style="margin-top: 1.5rem;">
                <button class="btn btn-secondary" onclick="closeModal('view-ticket-modal')">Close</button>
            </div>
        `;

        // Display in modal
        document.getElementById('ticket-details').innerHTML = modalContent;
        openModal('view-ticket-modal');

    } catch (error) {
        closeNotification();
        console.error(`Error viewing ${tableName}:`, error);
        showNotification(`Error loading ${tableName} data: ${error.message}`, 'error');
    }
}

// Open image in fullscreen
function openImageFullscreen(imageUrl, ticketId, createdAt) {
    const fullscreenHtml = `
        <div class="image-fullscreen-overlay" onclick="closeImageFullscreen()">
            <div class="image-fullscreen-container" onclick="event.stopPropagation()">
                <button class="image-fullscreen-close" onclick="closeImageFullscreen()" aria-label="Close">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                </button>
                <div class="image-fullscreen-info">
                    <span>Ticket #${ticketId}</span>
                    <span>${new Date(createdAt).toLocaleString()}</span>
                </div>
                <img src="${imageUrl}" alt="Ticket ${ticketId} image" class="image-fullscreen-img">
                <div class="image-fullscreen-actions">
                    <a href="${imageUrl}" target="_blank" class="btn btn-secondary" onclick="event.stopPropagation()">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style="margin-right: 0.5rem;">
                            <path d="M14 9v5H2V9M8 11V2M8 2L5 5M8 2l3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                        Open Original
                    </a>
                    <button class="btn btn-secondary" onclick="closeImageFullscreen()">Close</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', fullscreenHtml);
    document.body.style.overflow = 'hidden';
}

// Close fullscreen image
function closeImageFullscreen() {
    const overlay = document.querySelector('.image-fullscreen-overlay');
    if (overlay) {
        overlay.remove();
        document.body.style.overflow = '';
    }
}

// Show migration guide
function showMigrationGuide() {
    const modalContent = `
        <h2>ðŸ“¦ Migrate Old Images</h2>
        <p class="page-subtitle">Move your existing images from the old single-image system to the new multi-image system</p>
        
        <div style="background: var(--surface-muted); padding: 1.5rem; border-radius: var(--radius); margin: 1rem 0;">
            <h3 style="margin-top: 0;">Why migrate?</h3>
            <p>Your old images are stored in the <code>tickets.image_url</code> column (old single-image system).</p>
            <p>The new gallery view shows images from the <code>ticket_images</code> table (new multi-image system).</p>
            <p style="margin-bottom: 0;"><strong>Result:</strong> You only see some images because the rest are in the old system!</p>
        </div>

        <div style="background: var(--warning-bg, #fff3cd); border: 2px solid var(--warning-color, #856404); padding: 1rem; border-radius: var(--radius); margin: 1rem 0;">
            <strong>âš ï¸ Safe Migration</strong>
            <p style="margin: 0.5rem 0 0 0;">This migration does NOT delete anything. It copies your images to the new table. Your original data stays intact!</p>
        </div>

        <h3>ðŸ“ What the migration does:</h3>
        <ul>
            <li>âœ… Finds all tickets with <code>image_url</code></li>
            <li>âœ… Copies them to <code>ticket_images</code> table</li>
            <li>âœ… Sets position to 0 (first image)</li>
            <li>âœ… Skips duplicates (won't create duplicates)</li>
            <li>âœ… Preserves created/updated dates</li>
        </ul>

        <div id="migration-status" style="margin: 1rem 0;"></div>

        <div class="form-actions" style="margin-top: 1.5rem; gap: 0.5rem;">
            <button class="btn btn-secondary" onclick="closeModal('view-ticket-modal')">Cancel</button>
            <button class="btn btn-primary" onclick="runAutoMigration()" id="migrate-btn">
                ðŸš€ Auto-Migrate Now
            </button>
        </div>

        <details style="margin-top: 1.5rem;">
            <summary style="cursor: pointer; font-weight: 600;">ðŸ“‹ Manual SQL Method (Advanced)</summary>
            <div style="margin-top: 1rem;">
                <h3>ðŸš€ Manual Migration Steps</h3>
                <ol style="line-height: 2;">
                    <li>Open <strong>Supabase Dashboard</strong></li>
                    <li>Go to <strong>SQL Editor</strong></li>
                    <li>Copy the SQL below and paste it</li>
                    <li>Click <strong>Run</strong></li>
                    <li>Refresh this Database tab</li>
                </ol>

                <h3>ðŸ” SQL Code:</h3>
                <pre style="background: #1e1e1e; color: #d4d4d4; padding: 1rem; border-radius: var(--radius); overflow-x: auto; font-size: 0.85rem;"><code>-- Migrate existing images
INSERT INTO ticket_images (ticket_id, image_url, position, created_at, updated_at)
SELECT id, image_url, 0, created_at, updated_at
FROM tickets
WHERE image_url IS NOT NULL AND image_url != ''
AND NOT EXISTS (
    SELECT 1 FROM ticket_images ti 
    WHERE ti.ticket_id = tickets.id 
    AND ti.image_url = tickets.image_url
);</code></pre>
                <button class="btn btn-secondary" onclick="copyMigrationSQL()" style="margin-top: 0.5rem;">ðŸ“‹ Copy SQL</button>
            </div>
        </details>
    `;

    document.getElementById('ticket-details').innerHTML = modalContent;
    openModal('view-ticket-modal');
}

// Run automatic migration
async function runAutoMigration() {
    const statusDiv = document.getElementById('migration-status');
    const migrateBtn = document.getElementById('migrate-btn');
    
    try {
        migrateBtn.disabled = true;
        migrateBtn.textContent = 'â³ Migrating...';
        
        statusDiv.innerHTML = `
            <div style="background: var(--primary-bg, #e3f2fd); border: 2px solid var(--primary-color); padding: 1rem; border-radius: var(--radius);">
                <strong>â³ Step 1:</strong> Finding old images...
            </div>
        `;

        // Step 1: Get all tickets with image_url
        const { data: ticketsWithImages, error: fetchError } = await supabase
            .from('tickets')
            .select('id, image_url, created_at, updated_at')
            .not('image_url', 'is', null)
            .neq('image_url', '');

        if (fetchError) throw fetchError;

        if (!ticketsWithImages || ticketsWithImages.length === 0) {
            statusDiv.innerHTML = `
                <div style="background: var(--success-bg, #d4edda); border: 2px solid var(--success-color, #28a745); padding: 1rem; border-radius: var(--radius);">
                    <strong>âœ… Nothing to migrate!</strong>
                    <p style="margin: 0.5rem 0 0 0;">All images are already in the new system.</p>
                </div>
            `;
            migrateBtn.textContent = 'âœ… Complete';
            setTimeout(() => {
                closeModal('view-ticket-modal');
                loadDatabaseStats();
                loadTablesInfo();
            }, 2000);
            return;
        }

        statusDiv.innerHTML = `
            <div style="background: var(--primary-bg, #e3f2fd); border: 2px solid var(--primary-color); padding: 1rem; border-radius: var(--radius);">
                <strong>ðŸ” Found ${ticketsWithImages.length} old images</strong><br>
                <strong>â³ Step 2:</strong> Checking for duplicates...
            </div>
        `;

        // Step 2: Check which images already exist
        const imagesToMigrate = [];
        for (const ticket of ticketsWithImages) {
            const { data: existing } = await supabase
                .from('ticket_images')
                .select('id')
                .eq('ticket_id', ticket.id)
                .eq('image_url', ticket.image_url)
                .single();

            if (!existing) {
                imagesToMigrate.push({
                    ticket_id: ticket.id,
                    image_url: ticket.image_url,
                    position: 0,
                    created_at: ticket.created_at,
                    updated_at: ticket.updated_at
                });
            }
        }

        if (imagesToMigrate.length === 0) {
            statusDiv.innerHTML = `
                <div style="background: var(--success-bg, #d4edda); border: 2px solid var(--success-color, #28a745); padding: 1rem; border-radius: var(--radius);">
                    <strong>âœ… Already migrated!</strong>
                    <p style="margin: 0.5rem 0 0 0;">All ${ticketsWithImages.length} images are already in the new system.</p>
                </div>
            `;
            migrateBtn.textContent = 'âœ… Complete';
            setTimeout(() => {
                closeModal('view-ticket-modal');
                loadDatabaseStats();
                loadTablesInfo();
            }, 2000);
            return;
        }

        statusDiv.innerHTML = `
            <div style="background: var(--primary-bg, #e3f2fd); border: 2px solid var(--primary-color); padding: 1rem; border-radius: var(--radius);">
                <strong>ðŸ“Š Ready to migrate ${imagesToMigrate.length} images</strong><br>
                <strong>â³ Step 3:</strong> Copying to new system...
            </div>
        `;

        // Step 3: Insert images in batches
        const batchSize = 10;
        let migrated = 0;
        
        for (let i = 0; i < imagesToMigrate.length; i += batchSize) {
            const batch = imagesToMigrate.slice(i, i + batchSize);
            const { error: insertError } = await supabase
                .from('ticket_images')
                .insert(batch);

            if (insertError) {
                console.error('Batch insert error:', insertError);
                throw insertError;
            }

            migrated += batch.length;
            statusDiv.innerHTML = `
                <div style="background: var(--primary-bg, #e3f2fd); border: 2px solid var(--primary-color); padding: 1rem; border-radius: var(--radius);">
                    <strong>ðŸ“Š Progress: ${migrated} / ${imagesToMigrate.length}</strong><br>
                    <div style="background: #e0e0e0; border-radius: 10px; overflow: hidden; margin-top: 0.5rem;">
                        <div style="background: var(--primary-color); height: 20px; width: ${(migrated / imagesToMigrate.length) * 100}%; transition: width 0.3s;"></div>
                    </div>
                </div>
            `;
        }

        // Success!
        statusDiv.innerHTML = `
            <div style="background: var(--success-bg, #d4edda); border: 2px solid var(--success-color, #28a745); padding: 1rem; border-radius: var(--radius);">
                <strong>âœ… Migration Complete!</strong>
                <p style="margin: 0.5rem 0 0 0;">Successfully migrated ${migrated} images to the new system!</p>
            </div>
        `;
        migrateBtn.textContent = 'âœ… Success!';
        
        showNotification(`Successfully migrated ${migrated} images!`, 'success');

        // Refresh the page after 2 seconds
        setTimeout(() => {
            closeModal('view-ticket-modal');
            loadDatabaseStats();
            loadTablesInfo();
        }, 2000);

    } catch (error) {
        console.error('Migration error:', error);
        statusDiv.innerHTML = `
            <div style="background: var(--error-bg, #f8d7da); border: 2px solid var(--error-color, #dc3545); padding: 1rem; border-radius: var(--radius);">
                <strong>âŒ Migration Failed</strong>
                <p style="margin: 0.5rem 0 0 0;">${error.message}</p>
                <p style="margin: 0.5rem 0 0 0; font-size: 0.9rem;">Try the manual SQL method below.</p>
            </div>
        `;
        migrateBtn.textContent = 'âŒ Failed';
        migrateBtn.disabled = false;
        showNotification(`Migration failed: ${error.message}`, 'error');
    }
}

// Copy migration SQL to clipboard
function copyMigrationSQL() {
    const sql = `INSERT INTO ticket_images (ticket_id, image_url, position, created_at, updated_at)
SELECT id, image_url, 0, created_at, updated_at
FROM tickets
WHERE image_url IS NOT NULL AND image_url != ''
AND NOT EXISTS (
    SELECT 1 FROM ticket_images ti 
    WHERE ti.ticket_id = tickets.id 
    AND ti.image_url = tickets.image_url
);`;
    
    navigator.clipboard.writeText(sql).then(() => {
        showNotification('SQL copied to clipboard!', 'success');
    }).catch(err => {
        showNotification('Failed to copy SQL', 'error');
    });
}

// Override showPage to handle database page
const originalShowPage = window.showPage;
window.showPage = function(pageName) {
    if (originalShowPage) {
        originalShowPage(pageName);
    }
    
    if (pageName === 'database') {
        loadDatabasePage();
    }
};

// Initialize auto-cleanup on page load
document.addEventListener('DOMContentLoaded', () => {
    loadCleanupSettings();
    if (cleanupSettings.enabled) {
        scheduleAutoCleanup();
    }
});

console.log('âœ… Database management module loaded');





// ==================== SCHEDULE IMAGE HANDLING ====================

let scheduleImageUrl = null;
let scheduleImagePreviewUrl = null;

function handleScheduleImageSelection(event) {
    const file = event.target.files[0];
    if (!file) {
        resetScheduleImage();
        return;
    }

    if (!file.type.startsWith('image/')) {
        showNotification('Please select a valid image file', 'error');
        event.target.value = '';
        resetScheduleImage();
        return;
    }

    showScheduleImagePreview(URL.createObjectURL(file));
}

function showScheduleImagePreview(imageUrl) {
    const previewContainer = document.getElementById('schedule-image-preview');
    if (!previewContainer) return;

    if (scheduleImagePreviewUrl) {
        URL.revokeObjectURL(scheduleImagePreviewUrl);
    }
    
    scheduleImagePreviewUrl = imageUrl;
    
    previewContainer.innerHTML = `
        <div style="position: relative; display: inline-block;">
            <img src="${imageUrl}" alt="Schedule image preview" style="max-width: 200px; max-height: 200px; border-radius: 8px; border: 2px solid var(--border-color);">
            <button type="button" onclick="clearScheduleImage()" style="position: absolute; top: 5px; right: 5px; background: var(--error-color); color: white; border: none; border-radius: 50%; width: 24px; height: 24px; cursor: pointer; font-size: 14px; line-height: 1;">&times;</button>
        </div>
    `;
}

function revokeScheduleImagePreview() {
    if (scheduleImagePreviewUrl) {
        URL.revokeObjectURL(scheduleImagePreviewUrl);
        scheduleImagePreviewUrl = null;
    }
}

function resetScheduleImage() {
    const input = document.getElementById('schedule-image');
    const preview = document.getElementById('schedule-image-preview');
    
    if (input) input.value = '';
    if (preview) preview.innerHTML = '';
    
    revokeScheduleImagePreview();
    scheduleImageUrl = null;
}

function clearScheduleImage() {
    resetScheduleImage();
    showNotification('Image cleared', 'info');
}

function loadScheduleImage(imageUrl) {
    if (!imageUrl) {
        resetScheduleImage();
        return;
    }
    
    scheduleImageUrl = imageUrl;
    const previewContainer = document.getElementById('schedule-image-preview');
    if (previewContainer) {
        previewContainer.innerHTML = `
            <div style="position: relative; display: inline-block;">
                <img src="${imageUrl}" alt="Current schedule image" style="max-width: 200px; max-height: 200px; border-radius: 8px; border: 2px solid var(--border-color);">
                <button type="button" onclick="clearScheduleImage()" style="position: absolute; top: 5px; right: 5px; background: var(--error-color); color: white; border: none; border-radius: 50%; width: 24px; height: 24px; cursor: pointer; font-size: 14px; line-height: 1;">&times;</button>
            </div>
        `;
    }
}

async function uploadScheduleImage(file) {
    try {
        const fileExt = file.name.split('.').pop();
        const fileName = `schedule-${Date.now()}.${fileExt}`;
        const filePath = `schedule-images/${fileName}`;

        const { error: uploadError } = await supabase.storage
            .from('images')
            .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
            .from('images')
            .getPublicUrl(filePath);

        return publicUrl;
    } catch (error) {
        console.error('Error uploading schedule image:', error);
        showNotification('Failed to upload image: ' + error.message, 'error');
        throw error;
    }
}




