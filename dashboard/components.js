/* ============================================================================
   SanjeevaniOps Dashboard - UI Components
   Reusable component builders
   ============================================================================ */

// ApplicationCard Component
const ApplicationCard = {
    /**
     * Render application card for list view
     */
    render(app, healthStatus = null) {
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
                    <div style="display: flex; flex-direction: column; align-items: flex-end; gap: var(--space-xs);">
                        ${(() => {
                            const containerRunning = (app.container_info?.status || '').toLowerCase() === 'running';
                            if (app.monitoring_paused) {
                                return '<span style="font-size:var(--font-size-xs);color:var(--color-warning);"><i class="ph ph-pause-circle"></i> Paused</span>';
                            } else if (!containerRunning) {
                                return '';
                            } else {
                                return '<span class="badge ' + statusClass + '">' + (app.status === 'active' ? 'Monitoring' : 'Unmonitored') + '</span>';
                            }
                        })()}
                        ${app.monitoring_paused ? '' : (healthStatus ? HealthStatusBadge.render(healthStatus) : '')}
                    </div>
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
                            <span style="opacity: 0.9; color: ${containerStatus === 'running' ? 'var(--color-success)' : containerStatus === 'unknown' ? 'var(--color-text-tertiary)' : 'var(--color-error)'};">
                                <i class="ph-fill ${containerStatus === 'running' ? 'ph-check-circle' : containerStatus === 'unknown' ? 'ph-circle-dashed' : 'ph-x-circle'}"></i>
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
                const endpoints = config.additional_endpoints || [];
                const keywords = config.error_keywords || [];
                return `
                    <div style="margin-top: var(--space-lg); padding-top: var(--space-lg); border-top: 1px solid var(--color-border);">
                        <h5 style="margin-bottom: var(--space-md);">HTTP Configuration</h5>
                        <div style="display: flex; flex-direction: column; gap: var(--space-sm);">
                            <div><strong>URL:</strong> <code>${config.url}</code></div>
                            <div><strong>Method:</strong> ${config.method || 'GET'}</div>
                            <div><strong>Expected Status:</strong> ${(config.expected_status_codes || [200]).join(', ')}</div>
                            <div><strong>Warn Response Time:</strong> ${config.warn_response_time_ms || 3000}ms</div>
                            <div><strong>Critical Response Time:</strong> ${config.critical_response_time_ms || 5000}ms</div>
                            <div><strong>Expect JSON:</strong> ${config.expect_json ? '<span style="color:var(--color-success);">Yes</span>' : 'No'}</div>
                        </div>
                        ${endpoints.length > 0 ? `
                            <div style="margin-top: var(--space-md);">
                                <strong>Additional Endpoints:</strong>
                                <div style="display: flex; flex-wrap: wrap; gap: var(--space-xs); margin-top: var(--space-xs);">
                                    ${endpoints.map(ep => `<code style="padding: 2px 8px; background: var(--color-surface-elevated); border-radius: var(--radius-sm); font-size: var(--font-size-sm);">${Utils.dom.escapeHTML(ep)}</code>`).join('')}
                                </div>
                            </div>
                        ` : ''}
                        ${keywords.length > 0 ? `
                            <div style="margin-top: var(--space-md);">
                                <strong>Error Keywords:</strong>
                                <div style="display: flex; flex-wrap: wrap; gap: var(--space-xs); margin-top: var(--space-xs);">
                                    ${keywords.map(kw => `<span class="badge badge-error" style="font-size: var(--font-size-xs);">${Utils.dom.escapeHTML(kw)}</span>`).join('')}
                                </div>
                            </div>
                        ` : ''}
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


// ============================================================================
// Health Status Components (Feature 3)
// ============================================================================

const HealthStatusBadge = {
    /**
     * Render a compact health status badge for use in cards and lists
     */
    render(status) {
        const config = this._config(status);
        return `<span style="display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 999px; font-size: var(--font-size-xs); font-weight: var(--font-weight-medium); background: ${config.bg}; color: ${config.color};">
            <i class="${config.icon}"></i> ${config.label}
        </span>`;
    },

    /**
     * Render a larger health status panel for the detail view
     */
    renderPanel(healthStatus) {
        if (!healthStatus) {
            return `<div class="card"><div class="card-body"><p class="text-muted">No health data yet.</p></div></div>`;
        }

        const config = this._config(healthStatus.current_status);
        const lastChecked = healthStatus.last_checked_at
            ? Utils.date.getRelativeTime(healthStatus.last_checked_at)
            : 'Never';
        const since = Utils.date.getRelativeTime(healthStatus.status_changed_at);

        return `
            <div class="card" style="border-left: 4px solid ${config.color};">
                <div class="card-header">
                    <h4 class="card-title">Health Status</h4>
                    ${this.render(healthStatus.current_status)}
                </div>
                <div class="card-body">
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: var(--space-md);">
                        <div>
                            <label class="text-muted" style="font-size: var(--font-size-sm);">Status Since</label>
                            <p style="font-weight: var(--font-weight-medium); margin-top: var(--space-xs);">${since}</p>
                        </div>
                        <div>
                            <label class="text-muted" style="font-size: var(--font-size-sm);">Last Checked</label>
                            <p style="font-weight: var(--font-weight-medium); margin-top: var(--space-xs);">${lastChecked}</p>
                        </div>
                        <div>
                            <label class="text-muted" style="font-size: var(--font-size-sm);">Consecutive Failures</label>
                            <p style="font-weight: var(--font-weight-medium); margin-top: var(--space-xs); color: ${healthStatus.consecutive_failures > 0 ? 'var(--color-error)' : 'inherit'};">
                                ${healthStatus.consecutive_failures}
                            </p>
                        </div>
                        <div>
                            <label class="text-muted" style="font-size: var(--font-size-sm);">Consecutive Successes</label>
                            <p style="font-weight: var(--font-weight-medium); margin-top: var(--space-xs); color: ${healthStatus.consecutive_successes > 0 ? 'var(--color-success)' : 'inherit'};">
                                ${healthStatus.consecutive_successes}
                            </p>
                        </div>
                    </div>
                    ${healthStatus.first_failure_at ? `
                        <div style="margin-top: var(--space-md); padding: var(--space-sm) var(--space-md); background: var(--color-error-subtle, rgba(239,68,68,0.1)); border-radius: var(--radius-sm);">
                            <span style="font-size: var(--font-size-sm); color: var(--color-error);">
                                <i class="ph ph-warning"></i> Failing since ${Utils.date.getRelativeTime(healthStatus.first_failure_at)}
                            </span>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    },

    _config(status) {
        switch (status) {
            case 'healthy':
                return { label: 'Healthy', icon: 'ph-fill ph-check-circle', color: 'var(--color-success)', bg: 'rgba(34,197,94,0.12)' };
            case 'unhealthy':
                return { label: 'Unhealthy', icon: 'ph-fill ph-x-circle', color: 'var(--color-error)', bg: 'rgba(239,68,68,0.12)' };
            case 'error':
                return { label: 'Error', icon: 'ph-fill ph-warning-circle', color: 'var(--color-warning)', bg: 'rgba(234,179,8,0.12)' };
            default:
                return { label: 'Unknown', icon: 'ph ph-circle-dashed', color: 'var(--color-text-tertiary)', bg: 'rgba(148,163,184,0.12)' };
        }
    }
};


const HealthHistoryTable = {
    /**
     * Render a table of health check results
     */
    render(results) {
        if (!results || results.length === 0) {
            return EmptyState.render({
                icon: '<i class="ph ph-heartbeat"></i>',
                title: 'No Health Checks Yet',
                message: 'Health check results will appear here once monitoring begins'
            });
        }

        return `
            <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse; font-size: var(--font-size-sm);">
                    <thead>
                        <tr style="border-bottom: 2px solid var(--color-border);">
                            <th style="text-align: left; padding: var(--space-sm) var(--space-md); color: var(--color-text-secondary); font-weight: var(--font-weight-medium);">Status</th>
                            <th style="text-align: left; padding: var(--space-sm) var(--space-md); color: var(--color-text-secondary); font-weight: var(--font-weight-medium);">Time</th>
                            <th style="text-align: left; padding: var(--space-sm) var(--space-md); color: var(--color-text-secondary); font-weight: var(--font-weight-medium);">Response</th>
                            <th style="text-align: left; padding: var(--space-sm) var(--space-md); color: var(--color-text-secondary); font-weight: var(--font-weight-medium);">Type</th>
                            <th style="text-align: left; padding: var(--space-sm) var(--space-md); color: var(--color-text-secondary); font-weight: var(--font-weight-medium);">Details</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${results.map(r => this._renderRow(r)).join('')}
                    </tbody>
                </table>
            </div>
        `;
    },

    _renderRow(result) {
        const responseTime = result.response_time_ms != null ? `${result.response_time_ms}ms` : '—';
        const subChecksHtml = this._renderSubChecks(result.sub_checks);
        const error = (!result.sub_checks || result.sub_checks.length === 0) && result.error_message
            ? `<span style="color: var(--color-error); font-size: var(--font-size-xs);" title="${Utils.dom.escapeHTML(result.error_message)}">
                <i class="ph ph-warning"></i> ${Utils.dom.escapeHTML(result.error_message.substring(0, 60))}${result.error_message.length > 60 ? '…' : ''}
               </span>`
            : '';

        return `
            <tr style="border-bottom: 1px solid var(--color-border);">
                <td style="padding: var(--space-sm) var(--space-md);">${HealthStatusBadge.render(result.status)}</td>
                <td style="padding: var(--space-sm) var(--space-md); color: var(--color-text-secondary);">${Utils.date.formatDateTime(result.checked_at)}</td>
                <td style="padding: var(--space-sm) var(--space-md); font-family: var(--font-family-mono);">${responseTime}</td>
                <td style="padding: var(--space-sm) var(--space-md); text-transform: uppercase; font-size: var(--font-size-xs); color: var(--color-text-tertiary);">${result.check_type}</td>
                <td style="padding: var(--space-sm) var(--space-md);">${subChecksHtml || error || '<span style="color:var(--color-text-tertiary);">—</span>'}</td>
            </tr>
        `;
    },

    _renderSubChecks(subChecks) {
        if (!subChecks || subChecks.length === 0) return '';
        return `<div style="display:flex; flex-direction:column; gap:2px;">
            ${subChecks.map(sc => `
                <span style="font-size:var(--font-size-xs); display:flex; align-items:center; gap:4px;">
                    <i class="ph ${sc.passed ? 'ph-check-circle' : 'ph-x-circle'}"
                       style="color:${sc.passed ? 'var(--color-success)' : 'var(--color-error)'}; flex-shrink:0;"></i>
                    <span style="color:var(--color-text-secondary); font-weight:500;">${Utils.dom.escapeHTML(sc.name)}:</span>
                    <span style="color:${sc.passed ? 'var(--color-text-secondary)' : 'var(--color-error)'};">${Utils.dom.escapeHTML(sc.message)}</span>
                </span>`).join('')}
        </div>`;
    }
};

// Add to Components export
Components.HealthStatusBadge = HealthStatusBadge;
Components.HealthHistoryTable = HealthHistoryTable;

console.log('Health components loaded');

const CrashEventsPanel = {
    render(events, appId) {
        if (!events || events.length === 0) return `
        <div id="crash-events-panel" class="card" style="margin-top: var(--space-xl);">
            <div class="card-header">
                <h4 class="card-title" style="color: var(--color-error);">
                    <i class="ph ph-warning-octagon"></i> Crash Events
                </h4>
            </div>
            <div class="card-body">
                <p style="color: var(--color-text-tertiary); font-size: var(--font-size-sm); margin: 0;">
                    <i class="ph ph-check-circle" style="color: var(--color-success);"></i>
                    No crash events recorded. Events appear when a healthy container goes unhealthy.
                </p>
            </div>
        </div>`;
        return `
        <div id="crash-events-panel" class="card" style="margin-top: var(--space-xl);">
            <div class="card-header" style="display:flex; justify-content:space-between; align-items:center;">
                <h4 class="card-title" style="color: var(--color-error);">
                    <i class="ph ph-warning-octagon"></i> Crash Events
                </h4>
                <span style="font-size: var(--font-size-sm); color: var(--color-text-tertiary);">${events.length} event(s) captured</span>
            </div>
            <div class="card-body">
                ${events.map(e => CrashEventsPanel._renderEvent(e, appId)).join('')}
            </div>
        </div>`;
    },

    _renderEvent(e, appId) {
        const logPreview = e.container_logs
            ? Utils.dom.escapeHTML(e.container_logs.slice(-2000))
            : null;

        // Parse existing AI analysis if available
        let playbookHtml = '';
        if (e.ai_analysis) {
            try {
                const analysis = typeof e.ai_analysis === 'string' ? JSON.parse(e.ai_analysis) : e.ai_analysis;
                playbookHtml = CrashEventsPanel._renderPlaybook(analysis, e.ai_analyzed_at, appId, e.event_id);
            } catch {
                playbookHtml = `<div style="margin-top: var(--space-sm); padding: var(--space-sm); background: var(--color-surface-elevated); border-radius: var(--radius-sm); font-size: var(--font-size-sm);">${Utils.dom.escapeHTML(String(e.ai_analysis))}</div>`;
            }
        }

        const analyzeBtnLabel = e.ai_analysis ? 'Re-Analyze' : 'Analyze with AI';
        const analyzeBtn = `<button
                class="btn btn-secondary"
                id="ai-btn-${e.event_id}"
                style="font-size: var(--font-size-xs); padding: 4px 12px;"
                onclick="CrashEventsPanel.analyzeEvent('${appId}', '${e.event_id}')">
                <i class="ph ph-brain"></i> ${analyzeBtnLabel}
              </button>`;

        return `
        <div style="border: 1px solid var(--color-border); border-radius: var(--border-radius-md); padding: var(--space-md); margin-bottom: var(--space-md);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: var(--space-sm);">
                <span style="font-size: var(--font-size-sm); font-weight: 500; color: var(--color-error);">
                    <i class="ph ph-warning"></i>
                    Container: ${Utils.dom.escapeHTML(e.container_status || 'unknown')}
                    ${e.exit_code != null ? `&nbsp;·&nbsp; exit code: <code>${e.exit_code}</code>` : ''}
                </span>
                <div style="display:flex; align-items:center; gap: var(--space-sm);">
                    ${analyzeBtn}
                    <span style="font-size: var(--font-size-xs); color: var(--color-text-tertiary);">
                        ${Utils.date.formatDateTime(e.captured_at)}
                    </span>
                </div>
            </div>
            ${logPreview
                ? `<pre id="log-pre-${e.event_id}" style="font-size: 11px; font-family: var(--font-family-mono); background: var(--color-bg-secondary); border: 1px solid var(--color-border); padding: var(--space-sm); border-radius: var(--border-radius-sm); overflow-x: auto; max-height: 220px; overflow-y: auto; white-space: pre-wrap; color: var(--color-text-secondary); margin: 0;">${logPreview}</pre>`
                : `<p id="log-pre-${e.event_id}" style="font-size: var(--font-size-sm); color: var(--color-text-tertiary); margin: 0;">No logs captured</p>`
            }
            <div id="ai-result-${e.event_id}">${playbookHtml}</div>
        </div>`;
    },

    // ── Recovery Playbook Panel ───────────────────────────────────────────────
    _renderPlaybook(analysis, analyzedAt, appId, eventId) {
        const severityColors = {
            low: 'var(--color-success)',
            medium: 'var(--color-warning)',
            high: '#e67e22',
            critical: 'var(--color-error)',
        };
        const sevColor = severityColors[analysis.severity] || 'var(--color-text-secondary)';

        const playbookSteps = analysis.playbook_steps || [];
        const filesToCheck  = analysis.files_to_check  || [];
        const commands      = analysis.commands         || analysis.diagnostic_commands || [];
        const fixSteps      = analysis.fix_steps        || [];
        const quickCheck    = analysis.quick_check      || '';

        // Numbered step icons ① ② ③ …
        const stepNums = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩'];

        const stepsToShow = playbookSteps.length > 0 ? playbookSteps : fixSteps;

        return `
        <div style="margin-top: var(--space-md); border: 1px solid var(--color-primary); border-radius: var(--radius-md); overflow: hidden;">

            <!-- Header: Root Cause -->
            <div style="background: var(--color-primary); color: white; padding: 6px 14px; font-size: var(--font-size-sm); font-weight: 600; display: flex; justify-content: space-between; align-items: center;">
                <span><i class="ph ph-magnifying-glass"></i> Root Cause</span>
                <div style="display:flex; gap: 6px; align-items:center;">
                    <span style="font-size: var(--font-size-xs); padding: 2px 8px; border-radius: 999px; background: ${sevColor}; color: white; font-weight:700;">${(analysis.severity || 'unknown').toUpperCase()}</span>
                    ${analysis.category ? `<span style="font-size: var(--font-size-xs); padding: 2px 8px; border-radius: 999px; background: rgba(255,255,255,0.2); color: white;">${analysis.category}</span>` : ''}
                </div>
            </div>
            <div style="padding: var(--space-md); background: var(--color-surface-elevated);">
                <p style="font-size: var(--font-size-sm); margin: 0; color: var(--color-text-secondary); line-height: 1.5;">
                    ${Utils.dom.escapeHTML(analysis.crash_reason || 'Unknown')}
                </p>
            </div>

            ${stepsToShow.length > 0 ? `
            <!-- Recovery Playbook Steps -->
            <div style="border-top: 1px solid var(--color-border);">
                <div style="padding: 8px 14px; background: var(--color-bg-secondary); display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-size: var(--font-size-sm); font-weight: 600; color: var(--color-text-primary);">
                        <i class="ph ph-list-checks"></i> Recovery Playbook
                    </span>
                    <button onclick="CrashEventsPanel._copySteps(${JSON.stringify(stepsToShow).replace(/"/g,'&quot;')})"
                            style="font-size: var(--font-size-xs); padding: 2px 10px; border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: transparent; cursor: pointer; color: var(--color-text-secondary);">
                        <i class="ph ph-copy"></i> Copy Steps
                    </button>
                </div>
                <div style="padding: var(--space-sm) var(--space-md) var(--space-md); background: var(--color-surface-elevated);">
                    <ol style="margin:0; padding-left: 0; list-style:none; display:flex; flex-direction:column; gap: 8px;">
                        ${stepsToShow.map((step, i) => `
                            <li style="display:flex; gap: 10px; align-items:flex-start; font-size: var(--font-size-sm); color: var(--color-text-secondary); line-height:1.5;">
                                <span style="flex-shrink:0; font-weight:700; color: var(--color-primary); min-width:22px;">${stepNums[i] || `${i+1}.`}</span>
                                <span>${Utils.dom.escapeHTML(step)}</span>
                            </li>`).join('')}
                    </ol>
                </div>
            </div>` : ''}

            ${filesToCheck.length > 0 ? `
            <!-- Files to Inspect -->
            <div style="border-top: 1px solid var(--color-border); padding: var(--space-sm) var(--space-md); background: var(--color-bg-secondary);">
                <span style="font-size: var(--font-size-xs); font-weight:600; color: var(--color-text-secondary); text-transform:uppercase; letter-spacing:0.05em;">
                    <i class="ph ph-folder-open"></i> Files to inspect
                </span>
                <div style="display:flex; flex-wrap:wrap; gap: 6px; margin-top: 6px;">
                    ${filesToCheck.map(f => `
                        <span onclick="CrashEventsPanel._copyToClipboard('${Utils.dom.escapeHTML(f)}', this)"
                              title="Click to copy"
                              style="font-family: var(--font-family-mono); font-size: var(--font-size-xs); padding: 3px 10px; background: var(--color-surface-elevated); border: 1px solid var(--color-border); border-radius: var(--radius-sm); cursor: pointer; color: var(--color-text-primary); transition: background 0.15s;"
                              onmouseover="this.style.background='var(--color-primary)';this.style.color='white';"
                              onmouseout="this.style.background='var(--color-surface-elevated)';this.style.color='var(--color-text-primary)';">
                            ${Utils.dom.escapeHTML(f)}
                        </span>`).join('')}
                </div>
            </div>` : ''}

            ${commands.length > 0 ? `
            <!-- Diagnostic Commands -->
            <div style="border-top: 1px solid var(--color-border); padding: var(--space-sm) var(--space-md); background: var(--color-bg-secondary);">
                <span style="font-size: var(--font-size-xs); font-weight:600; color: var(--color-text-secondary); text-transform:uppercase; letter-spacing:0.05em;">
                    <i class="ph ph-terminal"></i> Run these commands
                </span>
                <div style="display:flex; flex-direction:column; gap: 5px; margin-top: 6px;">
                    ${commands.map(cmd => `
                        <div onclick="CrashEventsPanel._copyToClipboard('${Utils.dom.escapeHTML(cmd).replace(/'/g,"\\'")}', this)"
                             title="Click to copy"
                             style="font-family: var(--font-family-mono); font-size: 11px; padding: 5px 10px; background: #1e1e2e; color: #a6e3a1; border-radius: var(--radius-sm); cursor: pointer; display:flex; justify-content:space-between; align-items:center; gap:8px;">
                            <code style="background:transparent; color:inherit;">${Utils.dom.escapeHTML(cmd)}</code>
                            <i class="ph ph-copy" style="opacity:0.6; flex-shrink:0;"></i>
                        </div>`).join('')}
                </div>
            </div>` : ''}

            ${quickCheck ? `
            <!-- Quick Verify -->
            <div style="border-top: 1px solid var(--color-border); padding: var(--space-sm) var(--space-md); background: var(--color-bg-secondary); display:flex; align-items:center; gap: 10px;">
                <span style="font-size: var(--font-size-xs); font-weight:600; color: var(--color-success); white-space:nowrap;">
                    <i class="ph ph-check-circle"></i> Quick verify:
                </span>
                <code onclick="CrashEventsPanel._copyToClipboard('${Utils.dom.escapeHTML(quickCheck)}', this)"
                      title="Click to copy"
                      style="font-size: 11px; color: var(--color-text-secondary); cursor:pointer; background: var(--color-surface-elevated); padding: 2px 8px; border-radius: var(--radius-sm);">
                    ${Utils.dom.escapeHTML(quickCheck)}
                </code>
            </div>` : ''}

            ${analysis.ai_available === false ? `
            <!-- AI Offline Notice -->
            <div style="border-top: 1px solid var(--color-border); padding: var(--space-sm) var(--space-md); background: rgba(234,179,8,0.08); display:flex; align-items:center; gap: 8px;">
                <i class="ph ph-warning-circle" style="color: var(--color-warning); flex-shrink:0;"></i>
                <span style="font-size: var(--font-size-xs); color: var(--color-warning);">
                    <strong>AI offline</strong> — AI-enhanced fix steps are unavailable. Start Ollama and re-analyze to get deeper recommendations.
                    <code style="background: rgba(0,0,0,0.2); padding: 1px 6px; border-radius: 3px; margin-left:4px;">ollama serve</code>
                </span>
            </div>` : ''}

            <!-- Action Bar -->
            <div style="border-top: 1px solid var(--color-border); padding: var(--space-sm) var(--space-md); background: var(--color-surface-elevated); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap: 8px;">
                <button class="btn btn-secondary" style="font-size: var(--font-size-xs); padding: 4px 12px;"
                    data-ai-context="${btoa(encodeURIComponent(JSON.stringify({
                        cr: analysis.crash_reason || '',
                        sf: analysis.suggested_fix || '',
                        steps: analysis.playbook_steps || [],
                        files: analysis.files_to_check || [],
                        sev: analysis.severity || '',
                        cat: analysis.category || ''
                    })))}"
                    onclick="CrashEventsPanel._continueInChat(this)">
                    <i class="ph ph-chat-dots"></i> Continue in Chat
                </button>

                <div style="display:flex; flex-direction:column; align-items:flex-end; gap:3px;">
                    <button id="restart-btn-${eventId}"
                            onclick="CrashEventsPanel.confirmRestart('${appId}', '${eventId}')"
                            style="font-size: var(--font-size-xs); padding: 4px 14px; border: 1px solid #d97706; border-radius: var(--radius-sm); background: rgba(217,119,6,0.1); color: #d97706; cursor:pointer; font-weight:600; transition: background 0.15s;"
                            onmouseover="this.style.background='rgba(217,119,6,0.2)'"
                            onmouseout="this.style.background='rgba(217,119,6,0.1)'">
                        <i class="ph ph-arrow-counter-clockwise"></i> Restart Container
                    </button>
                    <span style="font-size: 10px; color: var(--color-text-tertiary);">⚠ Temporary relief — fix root cause above first</span>
                </div>
            </div>

            ${analyzedAt ? `<div style="padding: 4px 14px; font-size: 10px; color: var(--color-text-tertiary); background: var(--color-bg-secondary);">Analyzed: ${Utils.date.formatDateTime(analyzedAt)} · Model: ${analysis.model_used || 'unknown'}</div>` : ''}
        </div>`;
    },

    // ── Restart confirmation modal ────────────────────────────────────────────
    confirmRestart(appId, eventId) {
        // Remove any existing modal
        const existing = document.getElementById('restart-confirm-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'restart-confirm-modal';
        modal.style.cssText = `
            position: fixed; inset: 0; z-index: 9999;
            background: rgba(0,0,0,0.5); backdrop-filter: blur(4px);
            display: flex; align-items: center; justify-content: center; padding: 20px;
        `;
        modal.innerHTML = `
            <div style="background: var(--color-surface); border-radius: var(--radius-lg); padding: var(--space-xl); max-width: 480px; width: 100%; box-shadow: 0 20px 60px rgba(0,0,0,0.4); border: 1px solid #d97706;">
                <div style="display:flex; align-items:center; gap: 12px; margin-bottom: var(--space-md);">
                    <span style="font-size: 28px; color: #d97706;"><i class="ph ph-warning"></i></span>
                    <h3 style="margin:0; color: #d97706;">Restart Container?</h3>
                </div>
                <p style="font-size: var(--font-size-sm); color: var(--color-text-secondary); line-height:1.6; margin-bottom: var(--space-md);">
                    This will restart the container and restore uptime <strong>temporarily</strong>.
                    The crash will recur unless you address the root cause identified in the Recovery Playbook above.
                </p>
                <p style="font-size: var(--font-size-sm); color: var(--color-text-tertiary); margin-bottom: var(--space-xl);">
                    The restart will be logged to the recovery audit trail.
                </p>
                <div style="display:flex; gap: var(--space-md); justify-content:flex-end;">
                    <button onclick="document.getElementById('restart-confirm-modal').remove()"
                            style="padding: 8px 20px; border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: transparent; cursor: pointer; color: var(--color-text-secondary);">
                        Cancel
                    </button>
                    <button onclick="CrashEventsPanel._executeRestart('${appId}', '${eventId}'); document.getElementById('restart-confirm-modal').remove();"
                            style="padding: 8px 20px; border: 1px solid #d97706; border-radius: var(--radius-sm); background: #d97706; color: white; cursor: pointer; font-weight:600;">
                        <i class="ph ph-arrow-counter-clockwise"></i> Yes, Restart
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        // Click outside to close
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    },

    async _executeRestart(appId, eventId) {
        const btn = document.getElementById(`restart-btn-${eventId}`);
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Restarting…'; }
        try {
            const resp = await API.health.restartContainer(appId, eventId);
            if (resp.success) {
                CrashEventsPanel._showToast('Container restarted. Now apply the fix above to prevent recurrence.', 'success');
            } else {
                CrashEventsPanel._showToast(`Restart failed: ${resp.message}`, 'error');
            }
        } catch (err) {
            CrashEventsPanel._showToast(`Restart error: ${err.message || 'Unknown error'}`, 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ph ph-arrow-counter-clockwise"></i> Restart Container'; }
        }
    },

    // ── Utilities ─────────────────────────────────────────────────────────────
    _copySteps(steps) {
        const text = steps.map((s, i) => `${i+1}. ${s}`).join('\n');
        navigator.clipboard.writeText(text).then(() => {
            CrashEventsPanel._showToast('Playbook steps copied to clipboard!', 'success');
        }).catch(() => {
            CrashEventsPanel._showToast('Copy failed — please select manually', 'error');
        });
    },

    _copyToClipboard(text, el) {
        navigator.clipboard.writeText(text).then(() => {
            const orig = el.style.outline;
            el.style.outline = '2px solid var(--color-success)';
            setTimeout(() => { el.style.outline = orig; }, 800);
            CrashEventsPanel._showToast(`Copied: ${text}`, 'success');
        }).catch(() => {});
    },

    _showToast(message, type = 'success') {
        const existing = document.getElementById('crash-panel-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.id = 'crash-panel-toast';
        const bg = type === 'success' ? 'var(--color-success)' : 'var(--color-error)';
        toast.style.cssText = `
            position: fixed; bottom: 24px; right: 24px; z-index: 99999;
            background: ${bg}; color: white; padding: 10px 20px;
            border-radius: var(--radius-md); font-size: var(--font-size-sm);
            font-weight: 600; box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            animation: slideInRight 0.3s ease;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    },

    _continueInChat(btn) {
        const encoded = btn.getAttribute('data-ai-context');
        let crashReason = 'Unknown';
        let suggestedFix = 'Unknown';
        if (encoded) {
            try {
                const data = JSON.parse(decodeURIComponent(atob(encoded)));
                crashReason = data.cr || 'Unknown';
                suggestedFix = data.sf || 'Unknown';
            } catch (e) {
                console.error('Failed to decode AI context', e);
            }
        }
        sessionStorage.setItem('aiChatContext', JSON.stringify({ crashReason, suggestedFix }));
        window.location.hash = '#ai-engine';
    },

    async analyzeEvent(appId, eventId) {
        const btn = document.getElementById(`ai-btn-${eventId}`);
        const resultDiv = document.getElementById(`ai-result-${eventId}`);
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Analyzing…';
        }
        try {
            const resp = await API.health.analyzeCrashEvent(appId, eventId);
            if (resp.analysis && resp.analysis.success) {
                resultDiv.innerHTML = CrashEventsPanel._renderPlaybook(resp.analysis, resp.analysis.analyzed_at, appId, eventId);
                if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ph ph-brain"></i> Re-Analyze'; }
            } else {
                const errMsg = resp.analysis ? resp.analysis.error : 'Unknown error';
                resultDiv.innerHTML = `<div style="margin-top: var(--space-sm); padding: var(--space-sm); background: #fff3cd; border-radius: var(--radius-sm); font-size: var(--font-size-sm); color: #856404;"><i class="ph ph-warning"></i> ${Utils.dom.escapeHTML(errMsg)}</div>`;
                if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ph ph-brain"></i> Retry Analysis'; }
            }
        } catch (err) {
            resultDiv.innerHTML = `<div style="margin-top: var(--space-sm); padding: var(--space-sm); background: #f8d7da; border-radius: var(--radius-sm); font-size: var(--font-size-sm); color: var(--color-error);"><i class="ph ph-warning"></i> ${Utils.dom.escapeHTML(err.message || 'Analysis failed')}</div>`;
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ph ph-brain"></i> Retry Analysis'; }
        }
    }
};

Components.CrashEventsPanel = CrashEventsPanel;


// ============================================================================
// Recovery History Panel
// ============================================================================

const RecoveryHistoryPanel = {
    render(actions) {
        if (!actions || actions.length === 0) return '';

        const rows = actions.map(a => {
            const statusColor = a.status === 'executed' ? 'var(--color-success)' : 'var(--color-error)';
            const statusIcon  = a.status === 'executed' ? 'ph-check-circle' : 'ph-x-circle';
            return `
            <tr style="border-bottom: 1px solid var(--color-border);">
                <td style="padding: var(--space-sm) var(--space-md);">
                    <span style="display:inline-flex; align-items:center; gap:4px; font-size: var(--font-size-xs); color:${statusColor};">
                        <i class="ph-fill ${statusIcon}"></i> ${a.status}
                    </span>
                </td>
                <td style="padding: var(--space-sm) var(--space-md); font-family: var(--font-family-mono); font-size: var(--font-size-xs); color: var(--color-text-secondary);">
                    ${Utils.dom.escapeHTML(a.container_name)}
                </td>
                <td style="padding: var(--space-sm) var(--space-md); font-size: var(--font-size-xs); color: var(--color-text-secondary);">
                    ${Utils.date.formatDateTime(a.requested_at)}
                </td>
                <td style="padding: var(--space-sm) var(--space-md); font-size: var(--font-size-xs); color: var(--color-text-secondary);">
                    ${Utils.dom.escapeHTML(a.requested_by)}
                </td>
                <td style="padding: var(--space-sm) var(--space-md); font-size: var(--font-size-xs); color: var(--color-text-tertiary); max-width:280px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"
                    title="${Utils.dom.escapeHTML(a.result_message || '')}">
                    ${Utils.dom.escapeHTML(a.result_message || '—')}
                </td>
            </tr>`;
        }).join('');

        return `
        <div id="recovery-history-panel" class="card" style="margin-top: var(--space-xl);">
            <div class="card-header">
                <h4 class="card-title" style="color: #d97706;">
                    <i class="ph ph-arrow-counter-clockwise"></i> Recovery Actions
                </h4>
                <span style="font-size: var(--font-size-xs); color: var(--color-text-tertiary);">Restart audit log</span>
            </div>
            <div class="card-body" style="padding: 0;">
                <div style="overflow-x:auto;">
                    <table style="width:100%; border-collapse:collapse; font-size: var(--font-size-sm);">
                        <thead>
                            <tr style="border-bottom: 2px solid var(--color-border);">
                                <th style="text-align:left; padding: var(--space-sm) var(--space-md); color: var(--color-text-secondary); font-weight: var(--font-weight-medium);">Status</th>
                                <th style="text-align:left; padding: var(--space-sm) var(--space-md); color: var(--color-text-secondary); font-weight: var(--font-weight-medium);">Container</th>
                                <th style="text-align:left; padding: var(--space-sm) var(--space-md); color: var(--color-text-secondary); font-weight: var(--font-weight-medium);">When</th>
                                <th style="text-align:left; padding: var(--space-sm) var(--space-md); color: var(--color-text-secondary); font-weight: var(--font-weight-medium);">By</th>
                                <th style="text-align:left; padding: var(--space-sm) var(--space-md); color: var(--color-text-secondary); font-weight: var(--font-weight-medium);">Result</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>`;
    }
};

Components.RecoveryHistoryPanel = RecoveryHistoryPanel;
