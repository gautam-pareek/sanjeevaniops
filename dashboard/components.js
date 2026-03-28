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
        if (!events || events.length === 0) return '';
        return `
        <div class="card" style="margin-top: var(--space-xl);">
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
        let aiHtml = '';
        if (e.ai_analysis) {
            try {
                const analysis = typeof e.ai_analysis === 'string' ? JSON.parse(e.ai_analysis) : e.ai_analysis;
                aiHtml = CrashEventsPanel._renderAIInsight(analysis, e.ai_analyzed_at);
            } catch {
                aiHtml = `<div style="margin-top: var(--space-sm); padding: var(--space-sm); background: var(--color-surface-elevated); border-radius: var(--radius-sm); font-size: var(--font-size-sm);">${Utils.dom.escapeHTML(String(e.ai_analysis))}</div>`;
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
                ? `<pre style="font-size: 11px; font-family: var(--font-family-mono); background: var(--color-bg-secondary); border: 1px solid var(--color-border); padding: var(--space-sm); border-radius: var(--border-radius-sm); overflow-x: auto; max-height: 220px; overflow-y: auto; white-space: pre-wrap; color: var(--color-text-secondary); margin: 0;">${logPreview}</pre>`
                : `<p style="font-size: var(--font-size-sm); color: var(--color-text-tertiary); margin: 0;">No logs captured</p>`
            }
            <div id="ai-result-${e.event_id}">${aiHtml}</div>
        </div>`;
    },

    _renderAIInsight(analysis, analyzedAt) {
        const severityColors = {
            low: 'var(--color-success)',
            medium: 'var(--color-warning)',
            high: '#e67e22',
            critical: 'var(--color-error)',
        };
        const sevColor = severityColors[analysis.severity] || 'var(--color-text-secondary)';

        return `
        <div style="margin-top: var(--space-md); border: 1px solid var(--color-primary); border-radius: var(--radius-md); overflow: hidden;">
            <div style="background: var(--color-primary); color: white; padding: 6px 12px; font-size: var(--font-size-sm); font-weight: 600; display: flex; justify-content: space-between; align-items: center;">
                <span><i class="ph ph-brain"></i> AI Insight</span>
                <span style="font-size: var(--font-size-xs); opacity: 0.8;">${analysis.model_used || 'llama3.2:1b'}</span>
            </div>
            <div style="padding: var(--space-md); background: var(--color-surface-elevated);">
                <div style="display: flex; gap: var(--space-sm); margin-bottom: var(--space-md);">
                    <span class="badge" style="background: ${sevColor}; color: white; font-size: var(--font-size-xs);">${(analysis.severity || 'unknown').toUpperCase()}</span>
                    ${analysis.category ? `<span class="badge" style="background: var(--color-bg-secondary); color: var(--color-text-secondary); font-size: var(--font-size-xs);">${analysis.category}</span>` : ''}
                </div>
                <div style="margin-bottom: var(--space-sm);">
                    <strong style="font-size: var(--font-size-sm);">Crash Reason:</strong>
                    <p style="font-size: var(--font-size-sm); margin: 4px 0 0 0; color: var(--color-text-secondary);">${Utils.dom.escapeHTML(analysis.crash_reason || 'Unknown')}</p>
                </div>
                <div>
                    <strong style="font-size: var(--font-size-sm);">Suggested Fix:</strong>
                    <p style="font-size: var(--font-size-sm); margin: 4px 0 0 0; color: var(--color-text-secondary);">${Utils.dom.escapeHTML(analysis.suggested_fix || 'No suggestion available')}</p>
                </div>
                ${analyzedAt ? `<div style="margin-top: var(--space-sm); font-size: var(--font-size-xs); color: var(--color-text-tertiary);">Analyzed: ${Utils.date.formatDateTime(analyzedAt)}</div>` : ''}
                <div style="margin-top: var(--space-md); border-top: 1px solid var(--color-border); padding-top: var(--space-sm);">
                    <button class="btn btn-secondary" style="font-size: var(--font-size-xs); padding: 4px 12px;"
                        data-ai-context="${btoa(encodeURIComponent(JSON.stringify({cr: analysis.crash_reason || '', sf: analysis.suggested_fix || ''})))}"
                        onclick="CrashEventsPanel._continueInChat(this)">
                        <i class="ph ph-chat-dots"></i> Continue in Chat
                    </button>
                </div>
            </div>
        </div>`;
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
            btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Analyzing...';
        }
        try {
            const resp = await API.health.analyzeCrashEvent(appId, eventId);
            if (resp.analysis && resp.analysis.success) {
                resultDiv.innerHTML = CrashEventsPanel._renderAIInsight(resp.analysis, resp.analysis.analyzed_at);
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
