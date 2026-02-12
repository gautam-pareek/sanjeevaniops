/* ============================================================================
   SanjeevaniOps Dashboard - Main Application
   Core application logic, routing, and initialization
   ============================================================================ */

console.log('SanjeevaniOps Dashboard - Initializing');

// App state
const AppState = {
    currentRoute: 'dashboard',
    currentOperator: localStorage.getItem('operator') || 'admin',
    apiConnected: false,
    applications: [],
    currentApp: null,
    filters: {
        status: 'active',
        search: '',
        limit: 50,
        offset: 0
    }
};

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM loaded, initializing app...');

    // Set operator
    const operatorName = document.getElementById('operator-name');
    if (operatorName) {
        operatorName.textContent = AppState.currentOperator;
    }

    // Initialize API status check
    await checkAPIStatus();

    // Setup navigation
    setupNavigation();

    // Setup global handlers
    setupGlobalHandlers();

    // Load initial route
    const hash = window.location.hash.slice(1) || 'dashboard';
    navigateTo(hash);

    // Hide loading overlay
    setTimeout(() => {
        const loadingOverlay = document.getElementById('loading-overlay');
        if (loadingOverlay) {
            loadingOverlay.classList.add('hidden');
        }
    }, 500);

    console.log('App initialized successfully');
});

// Check API connectivity
async function checkAPIStatus() {
    const statusDot = document.getElementById('api-status');
    const statusText = document.getElementById('api-status-text');

    try {
        const isConnected = await API.healthCheck();

        AppState.apiConnected = isConnected;

        if (isConnected) {
            if (statusDot) statusDot.classList.add('connected');
            if (statusText) statusText.textContent = 'API Connected';
        } else {
            throw new Error('API not responding');
        }
    } catch (error) {
        AppState.apiConnected = false;
        if (statusDot) statusDot.classList.add('error');
        if (statusText) statusText.textContent = 'API Offline';
        console.warn('API connection failed:', error.message);
    }
}

// Setup navigation handlers
function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const route = item.getAttribute('data-route');
            navigateTo(route);
        });
    });

    // Setup sidebar toggle for mobile
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('sidebar');

    if (sidebarToggle && sidebar) {
        sidebarToggle.addEventListener('click', () => {
            sidebar.classList.toggle('open');
        });
    }

    // Handle browser back/forward
    window.addEventListener('hashchange', () => {
        const hash = window.location.hash.slice(1) || 'dashboard';
        navigateTo(hash, false);
    });
}

// Setup global handlers
function setupGlobalHandlers() {
    // Quick register button
    const quickRegisterBtn = document.getElementById('quick-register-btn');
    if (quickRegisterBtn) {
        quickRegisterBtn.addEventListener('click', () => {
            navigateTo('register');
        });
    }

    // Refresh button
    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
            await checkAPIStatus();
            await refreshCurrentView();
            showToast('Refreshed successfully', 'success');
        });
    }
}

// Navigation function
async function navigateTo(route, updateHash = true) {
    AppState.currentRoute = route;

    // Update URL hash
    if (updateHash) {
        window.location.hash = route;
    }

    // Update active nav item
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-route') === route) {
            item.classList.add('active');
        }
    });

    // Route to view
    if (route.startsWith('app/')) {
        const appId = route.split('/')[1];
        await renderApplicationDetailView(appId);
    } else {
        switch (route) {
            case 'dashboard':
                await renderDashboardView();
                break;
            case 'applications':
                await renderApplicationsView();
                break;
            case 'register':
                renderRegisterView();
                break;
            case 'settings':
                renderSettingsView();
                break;
            default:
                render404();
        }
    }
}

// Refresh current view
async function refreshCurrentView() {
    await navigateTo(AppState.currentRoute, false);
}

// Dashboard View
async function renderDashboardView() {
    updatePageHeader('Dashboard', 'Monitor and manage your applications');

    const contentView = document.getElementById('content-view');
    if (!contentView) return;

    try {
        showLoading(true);

        // Fetch summary data
        const data = await API.applications.list({ status: 'all', limit: 100 });

        const total = data.total || 0;
        const active = data.applications.filter(app => app.status === 'active').length;
        const inactive = data.applications.filter(app => app.status === 'inactive').length;
        const recent = data.applications.slice(0, 5);

        contentView.innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: var(--space-lg); margin-bottom: var(--space-2xl);">
                ${renderStatCard('<i class="ph ph-stack"></i>', 'Total Applications', total, 'All registered applications')}
                ${renderStatCard('<i class="ph ph-check-circle"></i>', 'Active', active, 'Currently monitored')}
                ${renderStatCard('<i class="ph ph-pause-circle"></i>', 'Inactive', inactive, 'Not currently monitored')}
                ${renderStatCard('<i class="ph ph-plugs"></i>', 'API Status', AppState.apiConnected ? 'Connected' : 'Offline', AppState.apiConnected ? 'Backend is running' : 'Backend not available')}
            </div>
            
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">Recent Applications</h3>
                    <button class="btn btn-secondary" onclick="navigateTo('applications')">View All <i class="ph ph-arrow-right"></i></button>
                </div>
                <div class="card-body">
                    ${recent.length > 0 ?
                `<div style="display: grid; gap: var(--space-md);">
                            ${recent.map(app => `
                                <div style="display: flex; justify-content: space-between; align-items: center; padding: var(--space-md); background: var(--color-surface-elevated); border-radius: var(--radius-md); cursor: pointer;" onclick="navigateToApp('${app.app_id}')">
                                    <div>
                                        <div style="font-weight: var(--font-weight-medium); margin-bottom: var(--space-xs);">
                                            ${Utils.dom.escapeHTML(app.name)}
                                        </div>
                                        <div style="font-size: var(--font-size-sm); color: var(--color-text-secondary);">
                                            ${Utils.dom.escapeHTML(app.container_name)}
                                        </div>
                                    </div>
                                    <div style="display: flex; align-items: center; gap: var(--space-md);">
                                        <span class="badge ${app.status === 'active' ? 'badge-active' : 'badge-inactive'}">${app.status}</span>
                                        <button class="btn btn-icon"><i class="ph ph-arrow-right"></i></button>
                                    </div>
                                </div>
                            `).join('')}
                        </div>`
                : Components.EmptyState.render({
                    icon: '<i class="ph ph-stack"></i>',
                    title: 'No Applications Yet',
                    message: 'Register your first application to get started',
                    actionText: 'Register Application',
                    actionHandler: 'navigateTo("register")'
                })
            }
                </div>
            </div>
        `;

        showLoading(false);
    } catch (error) {
        showLoading(false);
        contentView.innerHTML = renderError('Failed to load dashboard', error.message);
    }
}

// Stat card helper
function renderStatCard(icon, title, value, subtitle) {
    return `
        <div class="card card-glass">
            <div style="display: flex; align-items: center; gap: var(--space-md);">
                <div style="font-size: 3rem;">${icon}</div>
                <div style="flex: 1;">
                    <div style="font-size: var(--font-size-sm); color: var(--color-text-secondary); margin-bottom: var(--space-xs);">
                        ${title}
                    </div>
                    <div style="font-size: var(--font-size-2xl); font-weight: var(--font-weight-bold);">
                        ${value}
                    </div>
                    <div style="font-size: var(--font-size-xs); color: var(--color-text-tertiary); margin-top: var(--space-xs);">
                        ${subtitle}
                    </div>
                </div>
            </div>
        </div>
    `;
}

// Applications List View
async function renderApplicationsView() {
    updatePageHeader('Applications', 'View and manage all registered applications');

    const contentView = document.getElementById('content-view');
    if (!contentView) return;

    try {
        showLoading(true);

        const data = await API.applications.list(AppState.filters);
        AppState.applications = data.applications || [];

        contentView.innerHTML = `
            <div style="margin-bottom: var(--space-xl);">
                <div style="display: flex; gap: var(--space-md); flex-wrap: wrap;">
                    <input 
                        type="text" 
                        class="form-input" 
                        placeholder="Search applications..."
                        style="flex: 1; min-width: 250px;"
                        value="${AppState.filters.search}"
                        oninput="handleSearchChange(this.value)">
                    
                    <select 
                        class="form-select" 
                        style="min-width: 150px;"
                        value="${AppState.filters.status}"
                        onchange="handleStatusFilterChange(this.value)">
                        <option value="all">All Status</option>
                        <option value="active">Active Only</option>
                        <option value="inactive">Inactive Only</option>
                    </select>
                </div>
            </div>
            
            ${AppState.applications.length > 0 ? `
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: var(--space-lg);">
                    ${AppState.applications.map(app => Components.ApplicationCard.render(app)).join('')}
                </div>
                ${Components.Pagination.render(
            AppState.filters.offset,
            data.total,
            AppState.filters.limit,
            'handlePageChange'
        )}
            ` : Components.EmptyState.render({
            icon: '<i class="ph ph-magnifying-glass"></i>',
            title: 'No Applications Found',
            message: AppState.filters.status !== 'all' || AppState.filters.search
                ? 'Try adjusting your filters'
                : 'Register your first application to get started',
            actionText: 'Register Application',
            actionHandler: 'navigateTo("register")'
        })}
        `;

        showLoading(false);
    } catch (error) {
        showLoading(false);
        contentView.innerHTML = renderError('Failed to load applications', error.message);
    }
}

// Application Detail View
async function renderApplicationDetailView(appId) {
    updatePageHeader('Application Details', 'View and manage application configuration');

    const contentView = document.getElementById('content-view');
    if (!contentView) return;

    try {
        showLoading(true);

        const app = await API.applications.get(appId);
        AppState.currentApp = app;

        const statusClass = app.status === 'active' ? 'badge-active' : 'badge-inactive';
        const containerStatus = app.container_info?.status || 'unknown';

        contentView.innerHTML = `
            <div style="margin-bottom: var(--space-xl);">
                <button class="btn btn-secondary" onclick="navigateTo('applications')">
                    ← Back to Applications
                </button>
            </div>
            
            <div class="card" style="margin-bottom: var(--space-xl);">
                <div class="card-header">
                    <div>
                        <h2 style="margin-bottom: var(--space-sm);">${Utils.dom.escapeHTML(app.name)}</h2>
                        <p class="text-muted">${Utils.dom.escapeHTML(app.description || 'No description')}</p>
                    </div>
                    <div style="display: flex; gap: var(--space-sm);">
                        <span class="badge ${statusClass}">${app.status}</span>
                        ${app.deleted_at ? '<span class="badge badge-deleted">Deleted</span>' : ''}
                    </div>
                </div>
                <div class="card-body">
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: var(--space-lg);">
                        <div>
                            <label class="text-muted" style="font-size: var(--font-size-sm);">Application ID</label>
                            <p style="font-family: var(--font-family-mono); font-size: var(--font-size-sm); margin-top: var(--space-xs); word-break: break-all;">
                                ${app.app_id}
                            </p>
                        </div>
                        <div>
                            <label class="text-muted" style="font-size: var(--font-size-sm);">Container Name</label>
                            <p style="font-weight: var(--font-weight-medium); margin-top: var(--space-xs);">
                                ${Utils.dom.escapeHTML(app.container_name)}
                            </p>
                        </div>
                        <div>
                            <label class="text-muted" style="font-size: var(--font-size-sm);">Container Status</label>
                            <p style="font-weight: var(--font-weight-medium); margin-top: var(--space-xs);">
                                ${containerStatus === 'running' ? '<i class="ph-fill ph-check-circle" style="color: var(--color-success)"></i>' : '<i class="ph-fill ph-warning-circle" style="color: var(--color-warning)"></i>'} ${Utils.string.capitalize(containerStatus)}
                            </p>
                        </div>
                        <div>
                            <label class="text-muted" style="font-size: var(--font-size-sm);">Last Updated</label>
                            <p style="margin-top: var(--space-xs);">
                                ${Utils.date.formatDateTime(app.registration_info?.last_updated_at)}
                            </p>
                        </div>
                    </div>
                </div>
                <div class="card-footer">
                    ${app.deleted_at ? `
                        <button class="btn btn-success" onclick="handleReactivateApp('${app.app_id}')">
                            <i class="ph ph-arrows-counter-clockwise"></i> Reactivate Application
                        </button>
                    ` : `
                        <button class="btn btn-secondary" onclick="handleVerifyContainer('${app.app_id}')">
                            <i class="ph ph-magnifying-glass"></i> Verify Container
                        </button>
                        <button class="btn btn-danger" onclick="handleDeleteApp('${app.app_id}')">
                            <i class="ph ph-trash"></i> Delete Application
                        </button>
                    `}
                </div>
            </div>
            
            <div style="display: grid; gap: var(--space-xl); margin-bottom: var(--space-xl);">
                ${Components.HealthCheckDisplay.render(app.health_check)}
                ${Components.RecoveryPolicyDisplay.render(app.recovery_policy)}
            </div>
            
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">Metadata</h3>
                </div>
                <div class="card-body">
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--space-md);">
                        <div>
                            <label class="text-muted" style="font-size: var(--font-size-sm);">Environment</label>
                            <p style="margin-top: var(--space-xs);">${Utils.string.capitalize(app.metadata?.environment || 'N/A')}</p>
                        </div>
                        <div>
                            <label class="text-muted" style="font-size: var(--font-size-sm);">Criticality</label>
                            <p style="margin-top: var(--space-xs);">${Utils.string.capitalize(app.metadata?.criticality || 'N/A')}</p>
                        </div>
                        ${app.metadata?.owner ? `
                            <div>
                                <label class="text-muted" style="font-size: var(--font-size-sm);">Owner</label>
                                <p style="margin-top: var(--space-xs);">${Utils.dom.escapeHTML(app.metadata.owner)}</p>
                            </div>
                        ` : ''}
                        ${app.metadata?.team ? `
                            <div>
                                <label class="text-muted" style="font-size: var(--font-size-sm);">Team</label>
                                <p style="margin-top: var(--space-xs);">${Utils.dom.escapeHTML(app.metadata.team)}</p>
                            </div>
                        ` : ''}
                    </div>
                    ${app.metadata?.tags && app.metadata.tags.length > 0 ? `
                        <div style="margin-top: var(--space-lg); padding-top: var(--space-lg); border-top: 1px solid var(--color-border);">
                            <label class="text-muted" style="font-size: var(--font-size-sm);">Tags</label>
                            <div style="display: flex; flex-wrap: wrap; gap: var(--space-sm); margin-top: var(--space-sm);">
                                ${app.metadata.tags.map(tag => `<span class="badge badge-info">${Utils.dom.escapeHTML(tag)}</span>`).join('')}
                            </div>
                        </div>
                    ` : ''}
                </div>
            </div>
            
            <div style="margin-top: var(--space-xl);">
                <button class="btn btn-primary" onclick="handleViewHistory('${app.app_id}')">
                    <i class="ph ph-scroll"></i> View Change History
                </button>
            </div>
        `;

        showLoading(false);
    } catch (error) {
        showLoading(false);
        contentView.innerHTML = renderError('Failed to load application details', error.message);
    }
}

// Register View
function renderRegisterView() {
    updatePageHeader('Register Application', 'Add a new application for monitoring');

    const contentView = document.getElementById('content-view');
    if (!contentView) return;

    RegistrationWizard.init();
    contentView.innerHTML = RegistrationWizard.render();
}

// Settings View
function renderSettingsView() {
    updatePageHeader('Settings', 'Configure dashboard preferences');

    const contentView = document.getElementById('content-view');
    if (!contentView) return;

    const currentOperator = AppState.currentOperator;

    contentView.innerHTML = `
        <div class="card">
            <div class="card-header">
                <h3 class="card-title">Operator Settings</h3>
            </div>
            <div class="card-body">
                <div class="form-group">
                    <label class="form-label">Operator Name</label>
                    <input 
                        type="text" 
                        class="form-input" 
                        id="operator-name-input"
                        value="${currentOperator}"
                        placeholder="Your name or username">
                    <span class="form-hint">This name will be recorded in audit trails</span>
                </div>
                <button class="btn btn-primary" onclick="handleSaveOperator()">
                    Save Settings
                </button>
            </div>
        </div>
        
        <div class="card" style="margin-top: var(--space-xl);">
            <div class="card-header">
                <h3 class="card-title">API Configuration</h3>
            </div>
            <div class="card-body">
                <div style="display: flex; align-items: center; gap: var(--space-md); padding: var(--space-md); background: var(--color-surface-elevated); border-radius: var(--radius-md);">
                    <span class="status-dot ${AppState.apiConnected ? 'connected' : 'error'}"></span>
                    <div style="flex: 1;">
                        <div style="font-weight: var(--font-weight-medium);">API Status</div>
                        <div style="font-size: var(--font-size-sm); color: var(--color-text-secondary); margin-top: var(--space-xs);">
                            ${AppState.apiConnected ? 'Connected to http://localhost:8000' : 'Not connected - is the backend running?'}
                        </div>
                    </div>
                    <button class="btn btn-secondary" onclick="checkAPIStatus(); showToast('API status checked', 'info')">
                        Refresh
                    </button>
                </div>
            </div>
        </div>
        
        <div class="card" style="margin-top: var(--space-xl);">
            <div class="card-header">
                <h3 class="card-title">About</h3>
            </div>
            <div class="card-body">
                <p><strong>SanjeevaniOps Dashboard</strong></p>
                <p style="margin-top: var(--space-sm); color: var(--color-text-secondary);">
                    Local-first, explainable application reliability and recovery system.
                </p>
                <div style="margin-top: var(--space-lg); padding-top: var(--space-lg); border-top: 1px solid var(--color-border);">
                    <p style="font-size: var(--font-size-sm); color: var(--color-text-tertiary);">
                        Version 1.0.0 • Built with HTML, CSS, and Vanilla JavaScript
                    </p>
                </div>
            </div>
        </div>
    `;
}

// Helper Functions

function updatePageHeader(title, subtitle) {
    const pageTitle = document.getElementById('page-title');
    const pageSubtitle = document.getElementById('page-subtitle');

    if (pageTitle) pageTitle.textContent = title;
    if (pageSubtitle) pageSubtitle.textContent = subtitle;
}

function renderError(title, message) {
    return `
        <div class="card" style="border-color: var(--color-error);">
            <div class="card-body" style="text-align: center; padding: var(--space-2xl);">
                <div style="font-size: 4rem; margin-bottom: var(--space-lg);"><i class="ph ph-warning" style="color: var(--color-error);"></i></div>
                <h3 style="color: var(--color-error); margin-bottom: var(--space-md);">${title}</h3>
                <p class="text-muted">${Utils.dom.escapeHTML(message)}</p>
                <button class="btn btn-primary" onclick="refreshCurrentView()" style="margin-top: var(--space-lg);">
                    Try Again
                </button>
            </div>
        </div>
    `;
}

function render404() {
    updatePageHeader('Not Found', 'The page you are looking for does not exist');

    const contentView = document.getElementById('content-view');
    if (contentView) {
        contentView.innerHTML = Components.EmptyState.render({
            icon: '<i class="ph ph-question"></i>',
            title: '404 - Page Not Found',
            message: 'The page you are looking for does not exist',
            actionText: 'Go to Dashboard',
            actionHandler: 'navigateTo("dashboard")'
        });
    }
}

// Event Handlers

function handleSearchChange(value) {
    AppState.filters.search = value;
    AppState.filters.offset = 0;
    Utils.perf.debounce(() => renderApplicationsView(), 500)();
}

function handleStatusFilterChange(value) {
    AppState.filters.status = value;
    AppState.filters.offset = 0;
    renderApplicationsView();
}

function handlePageChange(offset) {
    AppState.filters.offset = offset;
    renderApplicationsView();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function navigateToApp(appId) {
    navigateTo(`app/${appId}`);
}

async function handleVerifyContainer(appId) {
    try {
        showLoading(true);
        const result = await API.applications.verifyContainer(appId);
        showLoading(false);

        showModal(
            'Container Verification',
            `
                <div style="display: flex; flex-direction: column; gap: var(--space-md);">
                    <div><strong>Exists:</strong> ${result.verification.exists ? '<i class="ph-fill ph-check-circle" style="color: var(--color-success)"></i> Yes' : '<i class="ph-fill ph-x-circle" style="color: var(--color-error)"></i> No'}</div>
                    <div><strong>Running:</strong> ${result.verification.running ? '<i class="ph-fill ph-check-circle" style="color: var(--color-success)"></i> Yes' : '<i class="ph-fill ph-warning-circle" style="color: var(--color-warning)"></i> No'}</div>
                    <div><strong>Has Native Healthcheck:</strong> ${result.verification.has_native_healthcheck ? '<i class="ph-fill ph-check-circle" style="color: var(--color-success)"></i> Yes' : '<i class="ph-fill ph-x-circle" style="color: var(--color-error)"></i> No'}</div>
                    <div style="margin-top: var(--space-md); padding-top: var(--space-md); border-top: 1px solid var(--color-border);">
                        <p class="text-muted">${result.message}</p>
                    </div>
                </div>
            `,
            'Close',
            null
        );
    } catch (error) {
        showLoading(false);
        showToast(error.message || 'Failed to verify container', 'error');
    }
}

async function handleDeleteApp(appId) {
    showModal(
        'Delete Application',
        `
            <p>Are you sure you want to delete this application?</p>
            <p class="text-muted" style="margin-top: var(--space-sm);">This will soft-delete the application. It can be reactivated later.</p>
            <div class="form-group" style="margin-top: var(--space-lg);">
                <label class="form-label">Reason (optional)</label>
                <textarea 
                    class="form-textarea" 
                    id="delete-reason"
                    placeholder="Why are you deleting this application?"></textarea>
            </div>
        `,
        'Delete',
        async () => {
            try {
                showLoading(true);
                const reason = document.getElementById('delete-reason')?.value || null;
                await API.applications.delete(appId, reason);
                showLoading(false);
                showToast('Application deleted successfully', 'success');
                navigateTo('applications');
            } catch (error) {
                showLoading(false);
                showToast(error.message || 'Failed to delete application', 'error');
            }
        }
    );
}

async function handleReactivateApp(appId) {
    try {
        showLoading(true);
        await API.applications.reactivate(appId);
        showLoading(false);
        showToast('Application reactivated successfully', 'success');
        await renderApplicationDetailView(appId);
    } catch (error) {
        showLoading(false);
        showToast(error.message || 'Failed to reactivate application', 'error');
    }
}

async function handleViewHistory(appId) {
    try {
        showLoading(true);
        const result = await API.applications.getHistory(appId);
        showLoading(false);

        showModal(
            'Change History',
            Components.HistoryTimeline.render(result.history),
            'Close',
            null
        );
    } catch (error) {
        showLoading(false);
        showToast(error.message || 'Failed to load history', 'error');
    }
}

function handleSaveOperator() {
    const input = document.getElementById('operator-name-input');
    if (input && input.value.trim()) {
        AppState.currentOperator = input.value.trim();
        localStorage.setItem('operator', AppState.currentOperator);

        const operatorName = document.getElementById('operator-name');
        if (operatorName) {
            operatorName.textContent = AppState.currentOperator;
        }

        showToast('Settings saved successfully', 'success');
    }
}

// UI Helper Functions

function showLoading(show) {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        if (show) {
            overlay.classList.remove('hidden');
        } else {
            overlay.classList.add('hidden');
        }
    }
}

function showModal(title, body, confirmText = 'Confirm', onConfirm = null) {
    const modalOverlay = document.getElementById('modal-container');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    const modalConfirm = document.getElementById('modal-confirm');
    const modalCancel = document.getElementById('modal-cancel');
    const modalClose = document.getElementById('modal-close');

    if (modalTitle) modalTitle.textContent = title;
    if (modalBody) modalBody.innerHTML = body;
    if (modalConfirm) modalConfirm.textContent = confirmText;

    if (modalOverlay) modalOverlay.classList.remove('hidden');

    // Setup handlers
    const closeModal = () => {
        if (modalOverlay) modalOverlay.classList.add('hidden');
    };

    if (modalClose) {
        modalClose.onclick = closeModal;
    }

    if (modalCancel) {
        if (onConfirm) {
            modalCancel.classList.remove('hidden');
            modalCancel.onclick = closeModal;
        } else {
            modalCancel.classList.add('hidden');
        }
    }

    if (modalConfirm) {
        if (onConfirm) {
            modalConfirm.onclick = () => {
                onConfirm();
                closeModal();
            };
        } else {
            modalConfirm.onclick = closeModal;
        }
    }

    // Close on overlay click
    if (modalOverlay) {
        modalOverlay.onclick = (e) => {
            if (e.target === modalOverlay) {
                closeModal();
            }
        };
    }
}

function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const icons = {
        success: '<i class="ph-fill ph-check-circle"></i>',
        error: '<i class="ph-fill ph-warning-octagon"></i>',
        warning: '<i class="ph-fill ph-warning"></i>',
        info: '<i class="ph-fill ph-info"></i>'
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    toast.innerHTML = `
        <div class="toast-icon">${icons[type] || icons.info}</div>
        <div class="toast-content">
            <div class="toast-message">${Utils.dom.escapeHTML(message)}</div>
        </div>
    `;

    container.appendChild(toast);

    // Auto remove
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100px)';
        setTimeout(() => {
            if (container.contains(toast)) {
                container.removeChild(toast);
            }
        }, 300);
    }, duration);
}

console.log('App.js loaded successfully');
