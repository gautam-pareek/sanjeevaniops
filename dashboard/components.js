/* ============================================================================
   SanjeevaniOps Dashboard - UI Components
   Reusable component builders
   ============================================================================ */

// ApplicationCard Component
const ApplicationCard = {
    /**
     * Render application card for list view
     */
    render(app) {
        const statusClass = app.status === 'active' ? 'badge-active' : 'badge-inactive';
        const containerStatus = app.container_info?.status || 'unknown';

        return `
            <div class="card" data-app-id="${app.app_id}" style="cursor: pointer;">
                <div class="card-header">
                    <div>
                        <h3 class="card-title">${Utils.dom.escapeHTML(app.name)}</h3>
                        <p class="text-muted" style="font-size: var(--font-size-sm); margin-top: var(--space-xs);">
                            ${Utils.dom.escapeHTML(app.description || 'No description')}
                        </p>
                    </div>
                    <span class="badge ${statusClass}">${app.status}</span>
                </div>
                <div class="card-body">
                    <div style="display: flex; flex-direction: column; gap: var(--space-sm);">
                        <div style="display: flex; align-items: center; gap: var(--space-sm);">
                            <span style="opacity: 0.7;"><i class="ph ph-nut"></i></span>
                            <span style="font-family: var(--font-family-mono); font-size: var(--font-size-sm);">
                                ${Utils.dom.escapeHTML(app.container_name)}
                            </span>
                        </div>
                        <div style="display: flex; align-items: center; gap: var(--space-sm);">
                            <span style="opacity: 0.7;"><i class="ph ph-heartbeat"></i></span>
                            <span style="font-size: var(--font-size-sm); text-transform: capitalize;">
                                ${app.health_check?.type || 'N/A'} Check
                            </span>
                        </div>
                        <div style="display: flex; align-items: center; gap: var(--space-sm);">
                            <span style="opacity: 0.7; color: ${containerStatus === 'running' ? 'var(--color-success)' : 'var(--color-warning)'};">
                                <i class="ph-fill ${containerStatus === 'running' ? 'ph-check-circle' : 'ph-warning-circle'}"></i>
                            </span>
                            <span style="font-size: var(--font-size-sm);">
                                Container: ${Utils.string.capitalize(containerStatus)}
                            </span>
                        </div>
                    </div>
                </div>
                <div class="card-footer">
                    <span style="font-size: var(--font-size-xs); color: var(--color-text-tertiary);">
                        Updated ${Utils.date.getRelativeTime(app.registration_info?.last_updated_at)}
                    </span>
                    <button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); navigateToApp('${app.app_id}')">
                        View Details <i class="ph ph-arrow-right"></i>
                    </button>
                </div>
            </div>
        `;
    }
};

// Loading Skeleton Component
const LoadingSkeleton = {
    /**
     * Render loading skeleton for cards
     */
    renderCard() {
        return `
            <div class="card">
                <div class="skeleton skeleton-heading"></div>
                <div class="skeleton skeleton-text"></div>
                <div class="skeleton skeleton-text" style="width: 60%;"></div>
                <div style="margin-top: var(--space-md);">
                    <div class="skeleton skeleton-text"></div>
                    <div class="skeleton skeleton-text" style="width: 80%;"></div>
                </div>
            </div>
        `;
    },

    /**
     * Render multiple skeleton cards
     */
    renderCards(count = 3) {
        return Array(count).fill(null).map(() => this.renderCard()).join('');
    }
};

// Empty State Component
const EmptyState = {
    /**
     * Render empty state
     */
    render(config = {}) {
        const {
            icon = '<i class="ph ph-magnifying-glass"></i>',
            title = 'No Data Found',
            message = 'There are no items to display',
            actionText = null,
            actionHandler = null
        } = config;

        return `
            <div class="empty-state">
                <div class="empty-icon">${icon}</div>
                <h3>${title}</h3>
                <p>${message}</p>
                ${actionText && actionHandler ? `
                    <button class="btn btn-primary" onclick="${actionHandler}">${actionText}</button>
                ` : ''}
            </div>
        `;
    }
};

// Pagination Component
const Pagination = {
    /**
     * Render pagination controls
     */
    render(current, total, limit, onPageChange) {
        const totalPages = Math.ceil(total / limit);
        const currentPage = Math.floor(current / limit) + 1;

        if (totalPages <= 1) return '';

        let pages = [];

        // Always show first page
        if (totalPages > 0) pages.push(1);

        // Show ellipsis and pages around current
        if (currentPage > 3) pages.push('...');

        for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
            pages.push(i);
        }

        // Show ellipsis and last page
        if (currentPage < totalPages - 2) pages.push('...');
        if (totalPages > 1) pages.push(totalPages);

        return `
            <div style="display: flex; justify-content: center; align-items: center; gap: var(--space-sm); margin-top: var(--space-xl);">
                <button 
                    class="btn btn-secondary" 
                    ${currentPage === 1 ? 'disabled' : ''}
                    onclick="${onPageChange}((${currentPage} - 2) * ${limit})">
                    ← Previous
                </button>
                
                ${pages.map(page => {
            if (page === '...') {
                return '<span style="padding: 0 var(--space-sm);">...</span>';
            }
            const isActive = page === currentPage;
            return `
                        <button 
                            class="btn ${isActive ? 'btn-primary' : 'btn-secondary'}" 
                            ${isActive ? 'disabled' : ''}
                            onclick="${onPageChange}((${page} - 1) * ${limit})">
                            ${page}
                        </button>
                    `;
        }).join('')}
                
                <button 
                    class="btn btn-secondary" 
                    ${currentPage === totalPages ? 'disabled' : ''}
                    onclick="${onPageChange}(${currentPage} * ${limit})">
                    Next →
                </button>
            </div>
        `;
    }
};

// Health Check Config Display
const HealthCheckDisplay = {
    /**
     * Render health check configuration
     */
    render(healthCheck) {
        if (!healthCheck) return '<p class="text-muted">No health check configured</p>';

        const typeConfig = this.renderTypeSpecific(healthCheck.type, healthCheck.config);

        return `
            <div class="card">
                <div class="card-header">
                    <h4 class="card-title">Health Check Configuration</h4>
                    <span class="badge badge-info">${Utils.string.toTitleCase(healthCheck.type)}</span>
                </div>
                <div class="card-body">
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--space-md);">
                        <div>
                            <label class="text-muted" style="font-size: var(--font-size-sm);">Interval</label>
                            <p style="font-weight: var(--font-weight-medium); margin-top: var(--space-xs);">
                                ${healthCheck.interval_seconds}s
                            </p>
                        </div>
                        <div>
                            <label class="text-muted" style="font-size: var(--font-size-sm);">Timeout</label>
                            <p style="font-weight: var(--font-weight-medium); margin-top: var(--space-xs);">
                                ${healthCheck.timeout_seconds}s
                            </p>
                        </div>
                        <div>
                            <label class="text-muted" style="font-size: var(--font-size-sm);">Failure Threshold</label>
                            <p style="font-weight: var(--font-weight-medium); margin-top: var(--space-xs);">
                                ${healthCheck.failure_threshold}
                            </p>
                        </div>
                        <div>
                            <label class="text-muted" style="font-size: var(--font-size-sm);">Success Threshold</label>
                            <p style="font-weight: var(--font-weight-medium); margin-top: var(--space-xs);">
                                ${healthCheck.success_threshold}
                            </p>
                        </div>
                    </div>
                    ${typeConfig}
                </div>
            </div>
        `;
    },

    renderTypeSpecific(type, config) {
        if (!config) return '';

        switch (type) {
            case 'http':
                return `
                    <div style="margin-top: var(--space-lg); padding-top: var(--space-lg); border-top: 1px solid var(--color-border);">
                        <h5 style="margin-bottom: var(--space-md);">HTTP Configuration</h5>
                        <div style="display: flex; flex-direction: column; gap: var(--space-sm);">
                            <div><strong>URL:</strong> <code>${config.url}</code></div>
                            <div><strong>Method:</strong> ${config.method || 'GET'}</div>
                            <div><strong>Expected Status:</strong> ${(config.expected_status_codes || [200]).join(', ')}</div>
                        </div>
                    </div>
                `;
            case 'tcp':
                return `
                    <div style="margin-top: var(--space-lg); padding-top: var(--space-lg); border-top: 1px solid var(--color-border);">
                        <h5 style="margin-bottom: var(--space-md);">TCP Configuration</h5>
                        <div style="display: flex; flex-direction: column; gap: var(--space-sm);">
                            <div><strong>Host:</strong> ${config.host || 'localhost'}</div>
                            <div><strong>Port:</strong> ${config.port}</div>
                        </div>
                    </div>
                `;
            case 'exec':
                return `
                    <div style="margin-top: var(--space-lg); padding-top: var(--space-lg); border-top: 1px solid var(--color-border);">
                        <h5 style="margin-bottom: var(--space-md);">Exec Configuration</h5>
                        <div style="display: flex; flex-direction: column; gap: var(--space-sm);">
                            <div><strong>Command:</strong> <code>${config.command}</code></div>
                            <div><strong>Expected Exit Code:</strong> ${config.expected_exit_code || 0}</div>
                        </div>
                    </div>
                `;
            default:
                return '';
        }
    }
};

// Recovery Policy Display
const RecoveryPolicyDisplay = {
    /**
     * Render recovery policy configuration
     */
    render(policy) {
        if (!policy) return '<p class="text-muted">No recovery policy configured</p>';

        const enabledBadge = policy.enabled ?
            '<span class="badge badge-success">Enabled</span>' :
            '<span class="badge badge-inactive">Disabled</span>';

        return `
            <div class="card">
                <div class="card-header">
                    <h4 class="card-title">Recovery Policy</h4>
                    ${enabledBadge}
                </div>
                <div class="card-body">
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--space-md);">
                        <div>
                            <label class="text-muted" style="font-size: var(--font-size-sm);">Max Restart Attempts</label>
                            <p style="font-weight: var(--font-weight-medium); margin-top: var(--space-xs);">
                                ${policy.max_restart_attempts || 0}
                            </p>
                        </div>
                        <div>
                            <label class="text-muted" style="font-size: var(--font-size-sm);">Restart Delay</label>
                            <p style="font-weight: var(--font-weight-medium); margin-top: var(--space-xs);">
                                ${policy.restart_delay_seconds || 0}s
                            </p>
                        </div>
                        <div>
                            <label class="text-muted" style="font-size: var(--font-size-sm);">Backoff Multiplier</label>
                            <p style="font-weight: var(--font-weight-medium); margin-top: var(--space-xs);">
                                ${policy.backoff_multiplier || 1.0}x
                            </p>
                        </div>
                        <div>
                            <label class="text-muted" style="font-size: var(--font-size-sm);">Escalation Threshold</label>
                            <p style="font-weight: var(--font-weight-medium); margin-top: var(--space-xs);">
                                ${policy.escalation_threshold || 0}
                            </p>
                        </div>
                    </div>
                    <div style="margin-top: var(--space-lg); padding-top: var(--space-lg); border-top: 1px solid var(--color-border);">
                        <label class="text-muted" style="font-size: var(--font-size-sm);">Allowed Actions</label>
                        <div style="display: flex; flex-wrap: wrap; gap: var(--space-sm); margin-top: var(--space-sm);">
                            ${(policy.allowed_actions || []).map(action =>
            `<span class="badge badge-info">${Utils.string.toTitleCase(action)}</span>`
        ).join('')}
                            ${(policy.allowed_actions || []).length === 0 ? '<span class="text-muted">None</span>' : ''}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
};

// History Timeline Component
// HistoryTimeline Component
const HistoryTimeline = {
    /**
     * Render history timeline
     */
    render(historyEntries) {
        if (!historyEntries || historyEntries.length === 0) {
            return EmptyState.render({
                icon: '<i class="ph ph-scroll"></i>',
                title: 'No History',
                message: 'No changes have been recorded for this application'
            });
        }

        return `
            <div style="display: flex; flex-direction: column; gap: var(--space-lg);">
                ${historyEntries.map(entry => this.renderEntry(entry)).join('')}
            </div>
        `;
    },

    renderEntry(entry) {
        const changeTypeColors = {
            created: 'badge-success',
            updated: 'badge-info',
            deleted: 'badge-error',
            reactivated: 'badge-success'
        };

        const changeTypeIcons = {
            created: 'ph-sparkle',
            updated: 'ph-pencil-simple',
            deleted: 'ph-trash',
            reactivated: 'ph-arrows-counter-clockwise'
        };

        const badgeClass = changeTypeColors[entry.change_type] || 'badge-info';
        const iconName = changeTypeIcons[entry.change_type] || 'ph-notepad';

        return `
            <div class="card">
                <div class="card-header">
                    <div style="display: flex; align-items: center; gap: var(--space-md);">
                        <span style="font-size: var(--font-size-xl);"><i class="ph ${iconName}"></i></span>
                        <div>
                            <div style="display: flex; align-items: center; gap: var(--space-sm);">
                                <span class="badge ${badgeClass}">${Utils.string.toTitleCase(entry.change_type)}</span>
                                <span class="badge badge-info">v${entry.version}</span>
                            </div>
                            <p style="font-size: var(--font-size-sm); color: var(--color-text-secondary); margin-top: var(--space-xs);">
                                ${Utils.date.formatDateTime(entry.changed_at)} by ${entry.changed_by}
                            </p>
                        </div>
                    </div>
                </div>
                ${entry.change_reason ? `
                    <div class="card-body">
                        <p><strong>Reason:</strong> ${Utils.dom.escapeHTML(entry.change_reason)}</p>
                    </div>
                ` : ''}
            </div>
        `;
    }
};

// Export components
const Components = {
    ApplicationCard,
    LoadingSkeleton,
    EmptyState,
    Pagination,
    HealthCheckDisplay,
    RecoveryPolicyDisplay,
    HistoryTimeline
};

console.log('Components loaded');
