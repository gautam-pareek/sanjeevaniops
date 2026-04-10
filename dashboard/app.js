/* ============================================================================
   SanjeevaniOps Dashboard - Main Application
   Core application logic, routing, and initialization
   ============================================================================ */

console.log('SanjeevaniOps Dashboard - Initializing');

// App state
const AppState = {
    currentRoute: 'dashboard',
    healthMap: {},          // app_id -> current_status
    currentOperator: localStorage.getItem('operator') || 'admin',
    apiConnected: false,
    _retryInterval: null,
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
    if (!AppState.apiConnected) startAPIRetry();

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
            if (statusDot) { statusDot.classList.remove('error'); statusDot.classList.add('connected'); }
            if (statusText) statusText.textContent = 'API Connected';
        } else {
            throw new Error('API not responding');
        }
    } catch (error) {
        AppState.apiConnected = false;
        if (statusDot) { statusDot.classList.remove('connected'); statusDot.classList.add('error'); }
        if (statusText) statusText.textContent = 'API Offline — retrying...';
        console.warn('API connection failed:', error.message);
    }
}

// Poll until API comes back, then reload the current view automatically
function startAPIRetry() {
    if (AppState._retryInterval) return; // already retrying
    AppState._retryInterval = setInterval(async () => {
        try {
            const ok = await API.healthCheck();
            if (ok) {
                clearInterval(AppState._retryInterval);
                AppState._retryInterval = null;
                AppState.apiConnected = true;
                const dot = document.getElementById('api-status');
                const txt = document.getElementById('api-status-text');
                if (dot) { dot.classList.remove('error'); dot.classList.add('connected'); }
                if (txt) txt.textContent = 'API Connected';
                await refreshCurrentView();
            }
        } catch (_) {}
    }, 5000);
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
            case 'ai-engine':
                await renderAIEngineView();
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

        // Fetch summary data and health summary in parallel
        const [data, healthSummary] = await Promise.all([
            API.applications.list({ status: 'all', limit: 100 }),
            API.health.getSummary().catch(() => ({ statuses: [] }))
        ]);

        const total = data.total || 0;
        const active = data.applications.filter(app => app.status === 'active').length;
        const inactive = data.applications.filter(app => app.status === 'inactive').length;
        const recent = data.applications.slice(0, 5);

        // Build health lookup map: app_id -> status
        const healthMap = {};
        (healthSummary.statuses || []).forEach(s => { healthMap[s.app_id] = s.current_status; });

        // Cross-reference health status with container state
        const effectiveHealthMap = {};
        data.applications.forEach(app => {
            const containerRunning = (app.container_info?.status || '').toLowerCase() === 'running';
            const dbStatus = healthMap[app.app_id];
            effectiveHealthMap[app.app_id] = !containerRunning && dbStatus === 'healthy' ? 'unhealthy' : dbStatus;
        });
        const healthyCount = Object.values(effectiveHealthMap).filter(s => s === 'healthy').length;
        const unhealthyCount = Object.values(effectiveHealthMap).filter(s => s === 'unhealthy').length;

        contentView.innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--space-lg); margin-bottom: var(--space-2xl);">
                ${renderStatCard('<i class="ph ph-stack"></i>', 'Total Applications', total, 'All registered applications')}
                ${renderStatCard('<i class="ph ph-check-circle"></i>', 'Monitoring', active, 'Actively monitored')}
                ${renderStatCard('<i class="ph ph-heartbeat"></i>', 'Healthy', healthyCount, 'Passing health checks')}
                ${unhealthyCount > 0
                    ? renderStatCard('<i class="ph ph-warning-circle"></i>', 'Unhealthy', unhealthyCount, 'Needs attention', 'var(--color-error)')
                    : renderStatCard('<i class="ph ph-pause-circle"></i>', 'Unmonitored', inactive, 'Not currently monitored')}
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
                                    <div style="display: flex; align-items: center; gap: var(--space-sm);">
                                        ${app.monitoring_paused
                                            ? '<span style="font-size:var(--font-size-xs);color:var(--color-warning);"><i class="ph ph-pause-circle"></i> Paused</span>'
                                            : Components.HealthStatusBadge.render(effectiveHealthMap[app.app_id] || 'unknown')
                                        }
                                        ${(app.container_info?.status || '').toLowerCase() === 'running' && !app.monitoring_paused
                                            ? '<span class="badge ' + (app.status === 'active' ? 'badge-active' : 'badge-inactive') + '">' + (app.status === 'active' ? 'Monitoring' : 'Unmonitored') + '</span>'
                                            : ''
                                        }
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
function renderStatCard(icon, title, value, subtitle, accentColor = null) {
    const borderStyle = accentColor ? `border-left: 3px solid ${accentColor};` : '';
    const valueStyle = accentColor ? `color: ${accentColor};` : '';
    return `
        <div class="card card-glass" style="${borderStyle}">
            <div style="display: flex; align-items: center; gap: var(--space-md);">
                <div style="font-size: 3rem;">${icon}</div>
                <div style="flex: 1;">
                    <div style="font-size: var(--font-size-sm); color: var(--color-text-secondary); margin-bottom: var(--space-xs);">
                        ${title}
                    </div>
                    <div style="font-size: var(--font-size-2xl); font-weight: var(--font-weight-bold); ${valueStyle}">
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

        const [data, healthSummary] = await Promise.all([
            API.applications.list(AppState.filters),
            API.health.getSummary().catch(() => ({ statuses: [] }))
        ]);
        AppState.applications = data.applications || [];
        // Build health lookup map for card rendering
        AppState.healthMap = {};
        (healthSummary.statuses || []).forEach(s => { AppState.healthMap[s.app_id] = s.current_status; });
        // Override stale 'healthy' status for containers that are not running
        data.applications.forEach(app => {
            const containerRunning = (app.container_info?.status || '').toLowerCase() === 'running';
            if (!containerRunning && AppState.healthMap[app.app_id] === 'healthy') {
                AppState.healthMap[app.app_id] = 'unhealthy';
            }
        });

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
                    ${AppState.applications.map(app => {
                            const containerRunning = (app.container_info?.status || '').toLowerCase() === 'running';
                            const dbStatus = AppState.healthMap[app.app_id];
                            const effectiveStatus = !containerRunning && dbStatus === 'healthy' ? 'unhealthy' : dbStatus;
                            return Components.ApplicationCard.render(app, effectiveStatus);
                        }).join('')}
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

        // Fetch app data and health status in parallel
        const [app, healthStatus, healthHistory, crashEvents, recoveryActions, aiStatusResult] = await Promise.all([
            API.applications.get(appId),
            API.health.getStatus(appId).catch(() => null),
            API.health.getHistory(appId, { limit: 20 }).catch(() => ({ results: [] })),
            API.health.getCrashEvents(appId).catch(() => ({ events: [] })),
            API.health.getRecoveryActions(appId).catch(() => ({ actions: [] })),
            API.health.getAIStatus().catch(() => ({ available: false }))
        ]);
        const aiAvailable = aiStatusResult.available;
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
                    <div style="display: flex; gap: var(--space-sm); flex-wrap: wrap; justify-content: flex-end;">
                        ${(() => {
                            const containerRunning = (app.container_info?.status || '').toLowerCase() === 'running';
                            if (app.monitoring_paused) {
                                return '<span class="badge" style="background:rgba(234,179,8,0.15);color:var(--color-warning);"><i class="ph ph-pause-circle"></i> Monitoring Paused</span>';
                            } else if (containerRunning) {
                                return '<span class="badge ' + statusClass + '">' + (app.status === 'active' ? 'Monitoring' : 'Unmonitored') + '</span>';
                            }
                            return '';
                        })()}
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
                                ${containerStatus === 'running'
                                    ? '<i class="ph-fill ph-check-circle" style="color: var(--color-success)"></i>'
                                    : containerStatus === 'unknown'
                                        ? '<i class="ph-fill ph-circle-dashed" style="color: var(--color-text-tertiary)"></i>'
                                        : '<i class="ph-fill ph-x-circle" style="color: var(--color-error)"></i>'
                                } ${Utils.string.capitalize(containerStatus)}
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
            
            ${(() => {
                const containerRunning = (app.container_info?.status || '').toLowerCase() === 'running';
                const effectiveHealthStatus = healthStatus && !containerRunning && healthStatus.current_status === 'healthy'
                    ? { ...healthStatus, current_status: 'unhealthy' }
                    : healthStatus;
                return Components.HealthStatusBadge.renderPanel(effectiveHealthStatus);
            })()}

            <div style="display: flex; justify-content: flex-end; gap: var(--space-sm); margin-top: var(--space-md); margin-bottom: var(--space-xl); flex-wrap: wrap;">
                ${!app.monitoring_paused ? `
                    <button class="btn btn-secondary" onclick="handleTriggerHealthCheck('${app.app_id}')">
                        <i class="ph ph-heartbeat"></i> Run Check Now
                    </button>
                    <button class="btn btn-secondary" style="color:var(--color-warning);border-color:var(--color-warning);" onclick="handlePauseMonitoring('${app.app_id}')">
                        <i class="ph ph-pause-circle"></i> Pause Monitoring
                    </button>
                ` : `
                    <button class="btn btn-secondary" style="color:var(--color-success);border-color:var(--color-success);" onclick="handleResumeMonitoring('${app.app_id}')">
                        <i class="ph ph-play-circle"></i> Resume Monitoring
                    </button>
                `}
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
            
            <div class="card" style="margin-top: var(--space-xl);">
                <div class="card-header">
                    <h4 class="card-title"><i class="ph ph-heartbeat"></i> Health Check History</h4>
                    <span style="font-size: var(--font-size-sm); color: var(--color-text-tertiary);">Last 20 checks</span>
                </div>
                <div class="card-body">
                    ${Components.HealthHistoryTable.render(healthHistory.results)}
                </div>
            </div>

            <div id="crash-events-panel-wrapper">${Components.CrashEventsPanel.render(crashEvents.events, app.app_id, aiAvailable)}</div>
            <div id="recovery-history-panel-wrapper">${Components.RecoveryHistoryPanel.render(recoveryActions.actions || [])}</div>

            <div style="margin-top: var(--space-xl);">
                <button class="btn btn-primary" onclick="handleViewHistory('${app.app_id}')">
                    <i class="ph ph-scroll"></i> View Change History
                </button>
            </div>
        `;

        showLoading(false);

        // Silently refresh only the log <pre> content every 15 seconds — no DOM thrashing
        const logRefreshInterval = setInterval(async () => {
            if (AppState.currentRoute !== `app/${appId}`) {
                clearInterval(logRefreshInterval);
                return;
            }
            try {
                const fresh = await API.health.getCrashEvents(appId).catch(() => null);
                if (!fresh) return;
                for (const e of fresh.events) {
                    const pre = document.getElementById(`log-pre-${e.event_id}`);
                    if (pre && e.container_logs) {
                        pre.textContent = e.container_logs.slice(-2000);
                    }
                }
            } catch (_) {}
        }, 15000);

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

async function handlePauseMonitoring(appId) {
    const reason = prompt('Reason for pausing monitoring (optional):');
    if (reason === null) return; // user cancelled
    try {
        await API.monitoring.pause(appId, reason || null);
        showToast('Monitoring paused', 'warning');
        renderApplicationDetailView(appId);
    } catch (error) {
        showToast('Failed to pause monitoring: ' + error.message, 'error');
    }
}

async function handleResumeMonitoring(appId) {
    try {
        await API.monitoring.resume(appId);
        showToast('Monitoring resumed', 'success');
        renderApplicationDetailView(appId);
    } catch (error) {
        showToast('Failed to resume monitoring: ' + error.message, 'error');
    }
}

async function handleTriggerHealthCheck(appId) {
    try {
        await API.health.triggerCheck(appId);
        showToast('Health check triggered — refreshing in 3s...', 'info');
        // Wait for check to complete then refresh the detail view
        setTimeout(() => renderApplicationDetailView(appId), 3000);
    } catch (error) {
        showToast('Failed to trigger health check: ' + error.message, 'error');
    }
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
    // Only show the full-screen overlay during the very first app load.
    // Route transitions swap content fast enough that the overlay is jarring
    // (dark flash) rather than helpful. _initialLoadDone is set after the first
    // DOMContentLoaded render completes.
    if (show && window._initialLoadDone) return;
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        if (show) {
            overlay.classList.remove('hidden');
        } else {
            overlay.classList.add('hidden');
            window._initialLoadDone = true;
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

// ============================================================================
// AI Engine View — Operations Center
// ============================================================================

async function renderAIEngineView() {
    updatePageHeader('AI Engine', 'Intelligent log analysis powered by local LLM');

    const contentView = document.getElementById('content-view');
    contentView.innerHTML = '<div class="empty-state"><div class="loading-spinner"></div><p>Initializing AI Engine...</p></div>';

    // Fetch AI status, available models, and all crash events
    let aiStatus = { available: false, model: '', message: 'Checking...' };
    let aiModels = { available: false, models: [], active_model: '' };
    let allApps = [];
    let allCrashEvents = [];

    try {
        [aiStatus, aiModels, allApps] = await Promise.all([
            API.health.getAIStatus().catch(() => ({ available: false, model: '', message: 'Cannot reach AI engine' })),
            API.health.listAIModels().catch(() => ({ available: false, models: [], active_model: '' })),
            API.applications.list({ status: 'active' }).then(r => r.applications || []).catch(() => [])
        ]);

        // Gather crash events from all apps
        const crashPromises = allApps.map(app =>
            API.health.getCrashEvents(app.app_id).then(r => 
                (r.events || []).map(e => ({ ...e, app_name: app.name }))
            ).catch(() => [])
        );
        const crashArrays = await Promise.all(crashPromises);
        allCrashEvents = crashArrays.flat().sort((a, b) => new Date(b.captured_at) - new Date(a.captured_at));
    } catch (e) {
        console.error('AI Engine init error:', e);
    }

    // Compute stats
    const analyzed = allCrashEvents.filter(e => e.ai_analysis);
    const unanalyzed = allCrashEvents.filter(e => !e.ai_analysis);
    const severityCounts = { critical: 0, high: 0, medium: 0, low: 0 };
    const categoryCounts = {};

    analyzed.forEach(e => {
        try {
            const a = typeof e.ai_analysis === 'string' ? JSON.parse(e.ai_analysis) : e.ai_analysis;
            if (a.severity && severityCounts.hasOwnProperty(a.severity)) severityCounts[a.severity]++;
            if (a.category) categoryCounts[a.category] = (categoryCounts[a.category] || 0) + 1;
        } catch {}
    });

    const statusColor = aiStatus.available ? 'var(--color-success)' : 'var(--color-error)';
    const statusText = aiStatus.available ? 'Online' : 'Offline';
    const statusPulse = aiStatus.available ? 'animation: pulse 2s infinite;' : '';

    contentView.innerHTML = `
        <!-- AI Engine Hero Banner -->
        <div style="background: var(--color-primary); border-radius: var(--radius-lg); padding: var(--space-lg); margin-bottom: var(--space-xl); color: white; position: relative;">
            <div style="position: relative; z-index: 1;">
                <div style="display: flex; align-items: flex-start; gap: var(--space-md); flex-wrap: wrap;">
                    <div style="width: 40px; height: 40px; background: rgba(255,255,255,0.2); border-radius: var(--radius-md); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                        <i class="ph ph-brain" style="font-size: 24px; color: #fbbf24;"></i>
                    </div>
                    <div style="flex: 1; min-width: 200px;">
                        <h2 style="margin: 0; font-size: 20px; font-weight: 700; color: white;">AI Operations Center</h2>
                        <p style="margin: 2px 0 0 0; opacity: 1; font-size: var(--font-size-sm); line-height: 1.4;">Automated Log Analysis & Root-Cause Diagnosis</p>
                    </div>
                </div>
                <div style="display: flex; gap: var(--space-md); flex-wrap: wrap; align-items: center; margin-top: var(--space-md);">
                    <div style="display: flex; align-items: center; gap: var(--space-sm); border: 1px solid rgba(255,255,255,0.4); padding: 4px 12px; border-radius: var(--radius-full); white-space: nowrap;">
                        <span id="ai-engine-status-dot" style="width: 8px; height: 8px; border-radius: 50%; background: ${statusColor}; display: inline-block;"></span>
                        <span id="ai-engine-status-text" style="font-size: 11px; font-weight: 600;">Engine: ${statusText}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: var(--space-sm); border: 1px solid rgba(255,255,255,0.4); padding: 4px 8px 4px 12px; border-radius: var(--radius-full); white-space: nowrap;">
                        <i class="ph ph-cpu" style="font-size: 14px;"></i>
                        ${aiModels.models.length > 1
                            ? `<select id="ai-model-select" style="background: transparent; border: none; color: white; font-size: 11px; font-weight: 600; cursor: pointer; outline: none; max-width: 180px;">
                                ${aiModels.models.map(m => `<option value="${m}" style="background: var(--color-primary); color: white;" ${m === (aiModels.active_model || aiStatus.model) ? 'selected' : ''}>${m}</option>`).join('')}
                               </select>`
                            : `<span style="font-size: 11px; font-weight: 600;">${aiStatus.model || 'No model'}</span>`
                        }
                    </div>
                    <div style="display: flex; align-items: center; gap: var(--space-sm); border: 1px solid rgba(255,255,255,0.4); padding: 4px 12px; border-radius: var(--radius-full); white-space: nowrap;">
                        <i class="ph ph-hard-drives" style="font-size: 14px;"></i>
                        <span style="font-size: 11px; font-weight: 600;">Local · ${aiModels.models.length} model${aiModels.models.length !== 1 ? 's' : ''} installed</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- AI Offline Banner (hidden when online) -->
        <div id="ai-engine-offline-banner" style="border: 1px solid var(--color-warning); border-radius: var(--radius-md); padding: var(--space-md) var(--space-lg); margin-bottom: var(--space-xl); background: rgba(234,179,8,0.08); display: ${!aiStatus.available ? 'flex' : 'none'}; align-items: flex-start; gap: var(--space-md);">
            <i class="ph ph-warning-circle" style="font-size: 24px; color: var(--color-warning); flex-shrink: 0; margin-top: 2px;"></i>
            <div>
                <div style="font-weight: 700; color: var(--color-warning); margin-bottom: 4px;">AI Engine Unavailable</div>
                <div id="ai-engine-offline-msg" style="font-size: var(--font-size-sm); color: var(--color-text-secondary); line-height: 1.6;">
                    ${Utils.dom.escapeHTML(aiStatus.message)}
                </div>
                <div style="margin-top: 8px; font-size: var(--font-size-xs); color: var(--color-text-tertiary);">
                    The recovery playbook (deterministic analysis) will still work — only the AI narrative fix steps require Ollama.
                </div>
            </div>
        </div>

        <!-- Metrics Cards Row -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--space-lg); margin-bottom: var(--space-xl);">
            <div class="card" style="text-align: center; padding: var(--space-lg);">
                <div style="font-size: 36px; font-weight: 700; color: var(--color-primary);">${allCrashEvents.length}</div>
                <div style="font-size: var(--font-size-sm); color: var(--color-text-secondary); margin-top: var(--space-xs);">Total Crash Events</div>
            </div>
            <div class="card" style="text-align: center; padding: var(--space-lg);">
                <div style="font-size: 36px; font-weight: 700; color: var(--color-success);">${analyzed.length}</div>
                <div style="font-size: var(--font-size-sm); color: var(--color-text-secondary); margin-top: var(--space-xs);">AI Analyses Complete</div>
            </div>
            <div class="card" style="text-align: center; padding: var(--space-lg);">
                <div style="font-size: 36px; font-weight: 700; color: var(--color-warning);">${unanalyzed.length}</div>
                <div style="font-size: var(--font-size-sm); color: var(--color-text-secondary); margin-top: var(--space-xs);">Pending Analysis</div>
            </div>
            <div class="card" style="text-align: center; padding: var(--space-lg);">
                <div style="font-size: 36px; font-weight: 700; color: var(--color-error);">${severityCounts.critical + severityCounts.high}</div>
                <div style="font-size: var(--font-size-sm); color: var(--color-text-secondary); margin-top: var(--space-xs);">Critical/High Severity</div>
            </div>
        </div>

        <!-- Two Column: Severity Distribution + Category Breakdown -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-lg); margin-bottom: var(--space-xl);">
            <!-- Severity Distribution -->
            <div class="card">
                <div class="card-header"><h4 class="card-title"><i class="ph ph-chart-bar"></i> Severity Distribution</h4></div>
                <div class="card-body">
                    ${_renderSeverityBars(severityCounts, analyzed.length)}
                </div>
            </div>

            <!-- Category Breakdown -->
            <div class="card">
                <div class="card-header"><h4 class="card-title"><i class="ph ph-tag"></i> Failure Categories</h4></div>
                <div class="card-body">
                    ${Object.keys(categoryCounts).length > 0 ? Object.entries(categoryCounts).map(([cat, count]) => `
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--color-border);">
                            <span style="font-size: var(--font-size-sm); text-transform: capitalize;">${cat.replace(/_/g, ' ')}</span>
                            <span class="badge" style="background: var(--color-primary); color: white;">${count}</span>
                        </div>
                    `).join('') : '<p style="color: var(--color-text-tertiary); font-size: var(--font-size-sm);">No analyses yet — run analysis on crash events to see categories</p>'}
                </div>
            </div>
        </div>

        <!-- Batch Analysis Action -->
        ${unanalyzed.length > 0 && aiStatus.available ? `
        <div class="card" style="margin-bottom: var(--space-xl); border: 1px solid var(--color-primary);">
            <div class="card-body" style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <h4 style="margin: 0;"><i class="ph ph-lightning"></i> Batch Analysis Available</h4>
                    <p style="margin: 4px 0 0 0; font-size: var(--font-size-sm); color: var(--color-text-secondary);">${unanalyzed.length} crash event(s) awaiting AI analysis</p>
                </div>
                <button class="btn btn-primary" id="batch-analyze-btn" onclick="runBatchAnalysis()">
                    <i class="ph ph-brain"></i> Analyze All (${unanalyzed.length})
                </button>
            </div>
            <div id="batch-progress" style="display: none; padding: 0 var(--space-lg) var(--space-lg);">
                <div style="height: 6px; background: var(--color-surface-elevated); border-radius: var(--radius-full); overflow: hidden;">
                    <div id="batch-progress-bar" style="height: 100%; width: 0%; background: var(--color-primary); transition: width 0.5s ease; border-radius: var(--radius-full);"></div>
                </div>
                <p id="batch-status-text" style="font-size: var(--font-size-xs); color: var(--color-text-tertiary); margin-top: var(--space-xs);">Starting...</p>
            </div>
        </div>
        ` : ''}

        <!-- Recent Analyses Timeline -->
        <div class="card">
            <div class="card-header">
                <h4 class="card-title"><i class="ph ph-clock-counter-clockwise"></i> Recent AI Analyses</h4>
            </div>
            <div class="card-body">
                ${analyzed.length > 0 ? analyzed.slice(0, 10).map(e => _renderAnalysisTimelineItem(e)).join('') : `
                    <div class="empty-state" style="padding: var(--space-xl);">
                        <div style="font-size: 48px; color: var(--color-text-tertiary); margin-bottom: var(--space-md);"><i class="ph ph-brain"></i></div>
                        <h4 style="color: var(--color-text-secondary);">No Analyses Yet</h4>
                        <p style="color: var(--color-text-tertiary); font-size: var(--font-size-sm);">Navigate to an application's crash events and click "Analyze with AI" to get started</p>
                    </div>
                `}
            </div>
        </div>

        <!-- AI Chat Assistant -->
        <div class="card" style="margin-top: var(--space-xl); padding: 0; overflow: hidden;">
            <div class="card-header" style="background: var(--color-primary); color: white; border-radius: 0; margin-bottom: 0; padding: var(--space-md) var(--space-lg); border: none;">
                <h4 class="card-title" style="color: white; margin: 0; display: flex; align-items: center; gap: 10px;"><i class="ph ph-chat-dots"></i> AI Assistant</h4>
                <span style="font-size: var(--font-size-xs); opacity: 1; font-weight: 600;">SanjeevaniOps Bot</span>
            </div>
            <div id="ai-chat-messages" style="height: 350px; overflow-y: auto; padding: var(--space-lg); background: var(--color-background); border: none;">
                <div style="display: flex; gap: var(--space-md); margin-bottom: var(--space-lg);">
                    <div style="width: 32px; height: 32px; border-radius: var(--radius-sm); background: var(--color-primary); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                        <i class="ph ph-brain" style="color: white; font-size: 18px;"></i>
                    </div>
                    <div style="background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 0 var(--radius-md) var(--radius-md) var(--radius-md); padding: var(--space-md); max-width: 85%; box-shadow: var(--shadow-sm);">
                        <p style="margin: 0; font-size: var(--font-size-sm); color: var(--color-text-secondary);">
                            Hello! I'm the <strong>SanjeevaniOps AI Assistant</strong>. I can help with:
                        </p>
                        <ul style="margin: 8px 0 0 0; padding-left: 16px; font-size: var(--font-size-sm); color: var(--color-text-tertiary);">
                            <li>Diagnosing container crashes & exit codes</li>
                            <li>Docker & Nginx troubleshooting</li>
                            <li>Health check configuration help</li>
                            <li>Interpreting crash event logs</li>
                        </ul>
                    </div>
                </div>
            </div>
            <div style="display: flex; gap: var(--space-sm); padding: var(--space-md); border: 1px solid var(--color-border); border-top: none; border-radius: 0 0 var(--radius-md) var(--radius-md); background: var(--color-surface);">
                <input
                    type="text"
                    id="ai-chat-input"
                    class="form-input"
                    placeholder="Ask about container issues, crash logs, Docker troubleshooting..."
                    style="flex: 1;"
                    onkeydown="if(event.key==='Enter') sendAIChat()"
                >
                <button class="btn btn-primary" id="ai-chat-send-btn" onclick="sendAIChat()">
                    <i class="ph ph-paper-plane-tilt"></i> Send
                </button>
            </div>
        </div>

        <style>
            .typing-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--color-text-tertiary); margin: 0 2px; }
            .typing-dot:nth-child(1) { animation: none; opacity: 0.6; }
            .typing-dot:nth-child(2) { animation: none; opacity: 0.8; }
            .typing-dot:nth-child(3) { animation: none; opacity: 1; }
        </style>
    `;

    // Wire up model selector if multiple models are available
    const modelSelect = document.getElementById('ai-model-select');
    if (modelSelect) {
        modelSelect.addEventListener('change', async () => {
            const chosen = modelSelect.value;
            try {
                const res = await API.health.setAIModel(chosen);
                showToast(res.available
                    ? `Switched to ${chosen}`
                    : `Switched to ${chosen} (not found locally — check name)`,
                    res.available ? 'success' : 'warning');
            } catch (err) {
                showToast('Failed to switch model', 'error');
            }
        });
    }

    // Poll AI status every 20 seconds and update badge + offline banner in-place
    if (AppState._aiStatusInterval) clearInterval(AppState._aiStatusInterval);
    AppState._aiStatusInterval = setInterval(async () => {
        if (AppState.currentRoute !== 'ai-engine') {
            clearInterval(AppState._aiStatusInterval);
            AppState._aiStatusInterval = null;
            return;
        }
        try {
            const status = await API.health.getAIStatus();
            const dot = document.getElementById('ai-engine-status-dot');
            const txt = document.getElementById('ai-engine-status-text');
            const banner = document.getElementById('ai-engine-offline-banner');
            const bannerMsg = document.getElementById('ai-engine-offline-msg');
            if (dot) dot.style.background = status.available ? 'var(--color-success)' : 'var(--color-error)';
            if (txt) txt.textContent = `Engine: ${status.available ? 'Online' : 'Offline'}`;
            if (banner) banner.style.display = status.available ? 'none' : 'flex';
            if (bannerMsg && status.message) bannerMsg.textContent = status.message;
        } catch (_) {}
    }, 20000);

    // Check if we have crash context from "Continue in Chat" button
    const _checkChatContext = () => {
        const stored = sessionStorage.getItem('aiChatContext');
        if (!stored) return;

        const input = document.getElementById('ai-chat-input');
        const messages = document.getElementById('ai-chat-messages');
        if (!input || !messages) {
            // DOM not ready yet, retry
            setTimeout(_checkChatContext, 200);
            return;
        }

        sessionStorage.removeItem('aiChatContext');
        try {
            const ctx = JSON.parse(stored);
            const steps = ctx.steps || [];
            const files = ctx.files || [];

            // Build context card
            const contextDiv = document.createElement('div');
            contextDiv.style.cssText = 'padding: 10px 14px; background: var(--color-primary-light, #fff3e0); border-left: 3px solid var(--color-primary); border-radius: 6px; margin-bottom: 12px; font-size: 13px;';

            const stepsHtml = steps.length > 0
                ? `<div style="margin-top:6px;"><strong>Recovery Playbook:</strong><ol style="margin:4px 0 0 16px; padding:0; color:var(--color-text-secondary);">${steps.map(s => `<li style="margin-bottom:2px;">${Utils.dom.escapeHTML(s)}</li>`).join('')}</ol></div>`
                : '';
            const filesHtml = files.length > 0
                ? `<div style="margin-top:6px;"><strong>Files to inspect:</strong> <span style="color:var(--color-text-secondary); font-family:monospace;">${files.map(f => Utils.dom.escapeHTML(f)).join(', ')}</span></div>`
                : '';
            const sevHtml = ctx.sev
                ? `<span style="margin-left:8px; font-size:11px; padding:1px 7px; border-radius:999px; background:rgba(0,0,0,0.1);">${ctx.sev.toUpperCase()}</span>`
                : '';

            contextDiv.innerHTML = `<strong style="display:block; margin-bottom:6px;"><i class="ph ph-brain"></i> Crash Analysis Context${sevHtml}</strong>`
                + `<div style="color:var(--color-text-secondary); margin-bottom:2px;"><strong>Issue:</strong> ${Utils.dom.escapeHTML(ctx.crashReason || 'Unknown')}</div>`
                + stepsHtml
                + filesHtml;

            messages.appendChild(contextDiv);
            messages.scrollTop = messages.scrollHeight;

            // Build a pre-filled question that includes the playbook for richer AI reasoning
            const playbookSummary = steps.length > 0
                ? `\n\nRecovery Playbook:\n${steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`
                : '';
            const filesSummary = files.length > 0
                ? `\n\nFiles to inspect: ${files.join(', ')}`
                : '';
            input.value = `Issue: ${ctx.crashReason || 'Unknown'}${playbookSummary}${filesSummary}\n\nCan you explain the root cause in more detail and suggest what exactly to change to fix this?`;
            input.focus();

            // Scroll chat into view
            const chatCard = input.closest('.card');
            if (chatCard) chatCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch (e) {
            console.error('Failed to parse AI chat context:', e);
        }
    };
    setTimeout(_checkChatContext, 600);
}

function _renderSeverityBars(counts, total) {
    if (total === 0) return '<p style="color: var(--color-text-tertiary); font-size: var(--font-size-sm);">No analyses yet — severity data will appear after running analyses</p>';
    
    const items = [
        { label: 'Critical', count: counts.critical, color: 'var(--color-error)' },
        { label: 'High', count: counts.high, color: '#e67e22' },
        { label: 'Medium', count: counts.medium, color: 'var(--color-warning)' },
        { label: 'Low', count: counts.low, color: 'var(--color-success)' },
    ];

    return items.map(item => {
        const pct = total > 0 ? (item.count / total * 100) : 0;
        return `
            <div style="display: flex; align-items: center; gap: var(--space-md); margin-bottom: var(--space-sm);">
                <span style="width: 60px; font-size: var(--font-size-sm); font-weight: 500;">${item.label}</span>
                <div style="flex: 1; height: 22px; background: var(--color-surface-elevated); border-radius: var(--radius-sm); overflow: hidden;">
                    <div style="height: 100%; width: ${pct}%; background: ${item.color}; border-radius: var(--radius-sm); transition: width 1s ease; display: flex; align-items: center; justify-content: flex-end; padding-right: 6px; font-size: 11px; color: white; font-weight: 600; min-width: ${item.count > 0 ? '24px' : '0'};">
                        ${item.count > 0 ? item.count : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function _renderAnalysisTimelineItem(e) {
    let analysis = {};
    try {
        analysis = typeof e.ai_analysis === 'string' ? JSON.parse(e.ai_analysis) : e.ai_analysis;
    } catch {}

    const severityColors = { critical: 'var(--color-error)', high: '#e67e22', medium: 'var(--color-warning)', low: 'var(--color-success)' };
    const sevColor = severityColors[analysis.severity] || 'var(--color-text-tertiary)';

    return `
        <div style="display: flex; gap: var(--space-md); padding: var(--space-md) 0; border-bottom: 1px solid var(--color-border);">
            <div style="width: 4px; border-radius: 2px; background: ${sevColor}; flex-shrink: 0;"></div>
            <div style="flex: 1; min-width: 0;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                    <div style="display: flex; align-items: center; gap: var(--space-sm);">
                        <strong style="font-size: var(--font-size-sm);">${Utils.dom.escapeHTML(e.app_name || 'Unknown App')}</strong>
                        <span class="badge" style="background: ${sevColor}; color: white; font-size: 10px; padding: 1px 6px;">${(analysis.severity || '?').toUpperCase()}</span>
                        ${analysis.category ? `<span style="font-size: 10px; color: var(--color-text-tertiary); text-transform: capitalize;">${analysis.category.replace(/_/g, ' ')}</span>` : ''}
                    </div>
                    <span style="font-size: var(--font-size-xs); color: var(--color-text-tertiary);">${Utils.date.formatDateTime(e.ai_analyzed_at || e.captured_at)}</span>
                </div>
                <p style="font-size: var(--font-size-sm); color: var(--color-text-secondary); margin: 0; line-height: 1.4;">${Utils.dom.escapeHTML(analysis.crash_reason || 'Analysis in progress...')}</p>
            </div>
        </div>
    `;
}

// Batch analysis function
async function runBatchAnalysis() {
    const btn = document.getElementById('batch-analyze-btn');
    const progressDiv = document.getElementById('batch-progress');
    const progressBar = document.getElementById('batch-progress-bar');
    const statusText = document.getElementById('batch-status-text');

    if (btn) btn.disabled = true;
    if (progressDiv) progressDiv.style.display = 'block';

    try {
        // Get all apps and their unanalyzed crash events
        const apps = await API.applications.list({ status: 'active' }).then(r => r.applications || []);
        let allUnanalyzed = [];

        for (const app of apps) {
            const events = await API.health.getCrashEvents(app.app_id).then(r => r.events || []).catch(() => []);
            const pending = events.filter(e => !e.ai_analysis);
            pending.forEach(e => allUnanalyzed.push({ appId: app.app_id, eventId: e.event_id, appName: app.name }));
        }

        for (let i = 0; i < allUnanalyzed.length; i++) {
            const item = allUnanalyzed[i];
            const pct = ((i + 1) / allUnanalyzed.length * 100).toFixed(0);
            if (statusText) statusText.textContent = `Analyzing ${item.appName} (${i + 1} / ${allUnanalyzed.length})...`;
            if (progressBar) progressBar.style.width = pct + '%';

            try {
                await API.health.analyzeCrashEvent(item.appId, item.eventId);
            } catch (err) {
                console.warn('Batch analysis failed for', item.eventId, err);
            }
        }

        if (statusText) statusText.textContent = `Complete! Analyzed ${allUnanalyzed.length} event(s).`;
        if (progressBar) progressBar.style.width = '100%';

        // Refresh the view after a short delay
        setTimeout(() => renderAIEngineView(), 2000);

    } catch (err) {
        if (statusText) statusText.textContent = `Error: ${err.message}`;
        if (btn) btn.disabled = false;
    }
}

// AI Chat function
async function sendAIChat() {
    const input = document.getElementById('ai-chat-input');
    const messages = document.getElementById('ai-chat-messages');
    const sendBtn = document.getElementById('ai-chat-send-btn');
    if (!input || !messages) return;

    const msg = input.value.trim();
    if (!msg) return;

    // Render user message
    messages.innerHTML += `
        <div style="display: flex; gap: var(--space-sm); margin-bottom: var(--space-md); justify-content: flex-end;">
            <div style="background: var(--color-primary); color: white; border-radius: var(--radius-md) 0 var(--radius-md) var(--radius-md); padding: var(--space-sm) var(--space-md); max-width: 80%;">
                <p style="margin: 0; font-size: var(--font-size-sm);">${Utils.dom.escapeHTML(msg)}</p>
            </div>
            <div style="width: 32px; height: 32px; border-radius: 50%; background: var(--color-primary); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                <i class="ph ph-user" style="color: white; font-size: 16px;"></i>
            </div>
        </div>
    `;

    input.value = '';
    input.disabled = true;
    if (sendBtn) sendBtn.disabled = true;

    // Show typing indicator
    const typingId = 'typing-' + Date.now();
    messages.innerHTML += `
        <div id="${typingId}" style="display: flex; gap: var(--space-sm); margin-bottom: var(--space-md);">
            <div style="width: 32px; height: 32px; border-radius: var(--radius-sm); background: var(--color-primary); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                <i class="ph ph-brain" style="color: white; font-size: 16px;"></i>
            </div>
            <div style="background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 0 var(--radius-md) var(--radius-md) var(--radius-md); padding: var(--space-sm) var(--space-md); display: flex; align-items: center;">
                <span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>
            </div>
        </div>
    `;
    messages.scrollTop = messages.scrollHeight;

    try {
        const resp = await API.health.aiChat(msg);
        // Remove typing indicator
        const typingEl = document.getElementById(typingId);
        if (typingEl) typingEl.remove();

        const reply = resp.response || 'No response.';
        const isError = resp.success === false;

        messages.innerHTML += `
            <div style="display: flex; gap: var(--space-sm); margin-bottom: var(--space-md);">
                <div style="width: 32px; height: 32px; border-radius: var(--radius-sm); background: var(--color-primary); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                    <i class="ph ph-brain" style="color: white; font-size: 16px;"></i>
                </div>
                <div style="background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 0 var(--radius-md) var(--radius-md) var(--radius-md); padding: var(--space-md); max-width: 85%; ${isError ? 'border-left: 4px solid var(--color-error);' : ''}">
                    <p style="margin: 0; font-size: var(--font-size-sm); color: var(--color-text-primary); white-space: pre-wrap; line-height: 1.5;">${Utils.dom.escapeHTML(reply)}</p>
                </div>
            </div>
        `;
    } catch (err) {
        const typingEl = document.getElementById(typingId);
        if (typingEl) typingEl.remove();

        messages.innerHTML += `
            <div style="display: flex; gap: var(--space-sm); margin-bottom: var(--space-md);">
                <div style="width: 32px; height: 32px; border-radius: var(--radius-sm); background: var(--color-error); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                    <i class="ph ph-warning" style="color: white; font-size: 16px;"></i>
                </div>
                <div style="background: var(--color-surface); border: 1px solid var(--color-error); border-radius: 0 var(--radius-md) var(--radius-md) var(--radius-md); padding: var(--space-md); max-width: 85%;">
                    <p style="margin: 0; font-size: var(--font-size-sm); color: var(--color-error); font-weight: 500;">${Utils.dom.escapeHTML(err.message || 'Connection failed')}</p>
                </div>
            </div>
        `;
    }

    messages.scrollTop = messages.scrollHeight;
    input.disabled = false;
    if (sendBtn) sendBtn.disabled = false;
    input.focus();
}

console.log('App.js loaded successfully');

