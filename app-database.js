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
    showNotification('✓ Cleanup settings saved', 'success');
    
    // If enabled, schedule next cleanup check
    if (cleanupSettings.enabled) {
        scheduleAutoCleanup();
    }
}

// Toggle auto-cleanup
function toggleAutoCleanup() {
    saveCleanupSettings();
    if (cleanupSettings.enabled) {
        showNotification('✓ Auto-cleanup enabled', 'success');
    } else {
        showNotification('Auto-cleanup disabled', 'info');
    }
}

// Load database page
async function loadDatabasePage() {
    console.log('📊 Loading database page...');
    
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
        freeTierInfo.textContent = `⚠️ ${rowUsagePercent.toFixed(1)}% of free tier limit`;
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
        <h3>⚠️ Supabase Free Tier Warning</h3>
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
                        ${table.hasOldImages ? `<br><small style="color: var(--warning-color);">⚠️ ${table.unmigratedCount} old images need migration</small>` : ''}
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
        showNotification('✓ Database stats refreshed', 'success');
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
            `✓ Cleanup complete! Deleted ${result.tickets} tickets, ${result.schedule} tasks, and ${result.images} images`,
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
        console.log('🧹 Auto-cleanup triggered');
        performCleanup()
            .then(result => {
                cleanupSettings.lastCleanup = now.toISOString();
                saveCleanupSettings();
                console.log('✓ Auto-cleanup complete:', result);
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
                                            return `<td>${value ? '✓' : '✗'}</td>`;
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
        <h2>📦 Migrate Old Images</h2>
        <p class="page-subtitle">Move your existing images from the old single-image system to the new multi-image system</p>
        
        <div style="background: var(--surface-muted); padding: 1.5rem; border-radius: var(--radius); margin: 1rem 0;">
            <h3 style="margin-top: 0;">Why migrate?</h3>
            <p>Your old images are stored in the <code>tickets.image_url</code> column (old single-image system).</p>
            <p>The new gallery view shows images from the <code>ticket_images</code> table (new multi-image system).</p>
            <p style="margin-bottom: 0;"><strong>Result:</strong> You only see some images because the rest are in the old system!</p>
        </div>

        <div style="background: var(--warning-bg, #fff3cd); border: 2px solid var(--warning-color, #856404); padding: 1rem; border-radius: var(--radius); margin: 1rem 0;">
            <strong>⚠️ Safe Migration</strong>
            <p style="margin: 0.5rem 0 0 0;">This migration does NOT delete anything. It copies your images to the new table. Your original data stays intact!</p>
        </div>

        <h3>📝 What the migration does:</h3>
        <ul>
            <li>✅ Finds all tickets with <code>image_url</code></li>
            <li>✅ Copies them to <code>ticket_images</code> table</li>
            <li>✅ Sets position to 0 (first image)</li>
            <li>✅ Skips duplicates (won't create duplicates)</li>
            <li>✅ Preserves created/updated dates</li>
        </ul>

        <div id="migration-status" style="margin: 1rem 0;"></div>

        <div class="form-actions" style="margin-top: 1.5rem; gap: 0.5rem;">
            <button class="btn btn-secondary" onclick="closeModal('view-ticket-modal')">Cancel</button>
            <button class="btn btn-primary" onclick="runAutoMigration()" id="migrate-btn">
                🚀 Auto-Migrate Now
            </button>
        </div>

        <details style="margin-top: 1.5rem;">
            <summary style="cursor: pointer; font-weight: 600;">📋 Manual SQL Method (Advanced)</summary>
            <div style="margin-top: 1rem;">
                <h3>🚀 Manual Migration Steps</h3>
                <ol style="line-height: 2;">
                    <li>Open <strong>Supabase Dashboard</strong></li>
                    <li>Go to <strong>SQL Editor</strong></li>
                    <li>Copy the SQL below and paste it</li>
                    <li>Click <strong>Run</strong></li>
                    <li>Refresh this Database tab</li>
                </ol>

                <h3>🔍 SQL Code:</h3>
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
                <button class="btn btn-secondary" onclick="copyMigrationSQL()" style="margin-top: 0.5rem;">📋 Copy SQL</button>
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
        migrateBtn.textContent = '⏳ Migrating...';
        
        statusDiv.innerHTML = `
            <div style="background: var(--primary-bg, #e3f2fd); border: 2px solid var(--primary-color); padding: 1rem; border-radius: var(--radius);">
                <strong>⏳ Step 1:</strong> Finding old images...
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
                    <strong>✅ Nothing to migrate!</strong>
                    <p style="margin: 0.5rem 0 0 0;">All images are already in the new system.</p>
                </div>
            `;
            migrateBtn.textContent = '✅ Complete';
            setTimeout(() => {
                closeModal('view-ticket-modal');
                loadDatabaseStats();
                loadTablesInfo();
            }, 2000);
            return;
        }

        statusDiv.innerHTML = `
            <div style="background: var(--primary-bg, #e3f2fd); border: 2px solid var(--primary-color); padding: 1rem; border-radius: var(--radius);">
                <strong>🔍 Found ${ticketsWithImages.length} old images</strong><br>
                <strong>⏳ Step 2:</strong> Checking for duplicates...
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
                    <strong>✅ Already migrated!</strong>
                    <p style="margin: 0.5rem 0 0 0;">All ${ticketsWithImages.length} images are already in the new system.</p>
                </div>
            `;
            migrateBtn.textContent = '✅ Complete';
            setTimeout(() => {
                closeModal('view-ticket-modal');
                loadDatabaseStats();
                loadTablesInfo();
            }, 2000);
            return;
        }

        statusDiv.innerHTML = `
            <div style="background: var(--primary-bg, #e3f2fd); border: 2px solid var(--primary-color); padding: 1rem; border-radius: var(--radius);">
                <strong>📊 Ready to migrate ${imagesToMigrate.length} images</strong><br>
                <strong>⏳ Step 3:</strong> Copying to new system...
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
                    <strong>📊 Progress: ${migrated} / ${imagesToMigrate.length}</strong><br>
                    <div style="background: #e0e0e0; border-radius: 10px; overflow: hidden; margin-top: 0.5rem;">
                        <div style="background: var(--primary-color); height: 20px; width: ${(migrated / imagesToMigrate.length) * 100}%; transition: width 0.3s;"></div>
                    </div>
                </div>
            `;
        }

        // Success!
        statusDiv.innerHTML = `
            <div style="background: var(--success-bg, #d4edda); border: 2px solid var(--success-color, #28a745); padding: 1rem; border-radius: var(--radius);">
                <strong>✅ Migration Complete!</strong>
                <p style="margin: 0.5rem 0 0 0;">Successfully migrated ${migrated} images to the new system!</p>
            </div>
        `;
        migrateBtn.textContent = '✅ Success!';
        
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
                <strong>❌ Migration Failed</strong>
                <p style="margin: 0.5rem 0 0 0;">${error.message}</p>
                <p style="margin: 0.5rem 0 0 0; font-size: 0.9rem;">Try the manual SQL method below.</p>
            </div>
        `;
        migrateBtn.textContent = '❌ Failed';
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

console.log('✅ Database management module loaded');
