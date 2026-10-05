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

            showNotification('✓ Ticket updated successfully', 'success');
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

            showNotification('✓ Ticket created successfully', 'success');
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

console.log('✅ Multiple images extension loaded successfully');
