/* ============================================================================
   SanjeevaniOps Dashboard - Form Builders
   Form construction and validation
   ============================================================================ */

// Registration Form Wizard
const RegistrationWizard = {
    currentStep: 1,
    totalSteps: 4,
    formData: {},

    /**
     * Initialize the registration wizard
     */
    init() {
        this.currentStep = 1;
        this.formData = {
            name: '',
            description: '',
            container_name: '',
            health_check: {
                type: 'http',
                interval_seconds: 30,
                timeout_seconds: 5,
                failure_threshold: 3,
                success_threshold: 1,
                config: {
                    url: '',
                    method: 'GET',
                    expected_status_codes: [200],
                    warn_response_time_ms: 3000,
                    critical_response_time_ms: 5000,
                    error_keywords: [],
                    additional_endpoints: [],
                    expect_json: false
                }
            },
            recovery_policy: {
                enabled: false,
                max_restart_attempts: 3,
                restart_delay_seconds: 60,
                backoff_multiplier: 1.0,
                escalation_threshold: 3,
                allowed_actions: ['container_restart']
            },
            metadata: {
                environment: 'development',
                criticality: 'medium',
                tags: []
            }
        };
    },

    /**
     * Render the registration form
     */
    render() {
        return `
            <div class="registration-wizard">
                ${this.renderProgressBar()}
                <div class="wizard-content" style="margin-top: var(--space-xl);">
                    ${this.renderCurrentStep()}
                </div>
                <div class="wizard-actions" style="display: flex; justify-content: space-between; margin-top: var(--space-xl); padding-top: var(--space-xl); border-top: 1px solid var(--color-border);">
                    <button 
                        class="btn btn-secondary" 
                        onclick="RegistrationWizard.previousStep()"
                        ${this.currentStep === 1 ? 'disabled' : ''}>
                        ← Previous
                    </button>
                    ${this.currentStep < this.totalSteps ? `
                        <button class="btn btn-primary" onclick="RegistrationWizard.nextStep()">
                            Next →
                        </button>
                    ` : `
                        <button class="btn btn-success" onclick="RegistrationWizard.submit()">
                            <i class="ph ph-check"></i> Register Application
                        </button>
                    `}
                </div>
            </div>
        `;
    },

    renderProgressBar() {
        const progress = (this.currentStep / this.totalSteps) * 100;

        return `
            <div class="wizard-progress">
                <div style="display: flex; justify-content: space-between; margin-bottom: var(--space-md);">
                    ${['Basic Info', 'Health Check', 'Recovery Policy', 'Metadata'].map((label, index) => {
            const stepNum = index + 1;
            const isActive = stepNum === this.currentStep;
            const isComplete = stepNum < this.currentStep;

            return `
                            <div style="flex: 1; text-align: center;">
                                <div style="
                                    width: 32px;
                                    height: 32px;
                                    margin: 0 auto var(--space-sm);
                                    display: flex;
                                    align-items: center;
                                    justify-content: center;
                                    border-radius: var(--radius-full);
                                    font-weight: var(--font-weight-semibold);
                                    ${isActive ? 'background: var(--color-primary); color: var(--color-background);' : ''}
                                    ${isComplete ? 'background: var(--color-success); color: white;' : ''}
                                    ${!isActive && !isComplete ? 'background: var(--color-surface-elevated); color: var(--color-text-tertiary);' : ''}
                                ">
                                    ${isComplete ? '<i class="ph-bold ph-check"></i>' : stepNum}
                                </div>
                                <div style="font-size: var(--font-size-sm); ${isActive ? 'color: var(--color-primary); font-weight: var(--font-weight-medium);' : 'color: var(--color-text-secondary);'}">
                                    ${label}
                                </div>
                            </div>
                        `;
        }).join('')}
                </div>
                <div style="height: 4px; background: var(--color-surface-elevated); border-radius: var(--radius-full); overflow: hidden;">
                    <div style="height: 100%; width: ${progress}%; background: var(--color-primary); transition: width var(--transition-base);"></div>
                </div>
            </div>
        `;
    },

    renderCurrentStep() {
        switch (this.currentStep) {
            case 1: return this.renderStep1();
            case 2: return this.renderStep2();
            case 3: return this.renderStep3();
            case 4: return this.renderStep4();
            default: return '';
        }
    },

    // Step 1: Basic Info
    renderStep1() {
        return `
            <div class="form-step">
                <h3 style="margin-bottom: var(--space-lg);">Basic Information</h3>
                
                <div class="form-group">
                    <label class="form-label required">Application Name</label>
                    <input 
                        type="text" 
                        class="form-input" 
                        id="app-name"
                        value="${this.formData.name}"
                        placeholder="my-web-app"
                        onchange="RegistrationWizard.updateField('name', this.value)">
                    <span class="form-hint">Alphanumeric, dash, or underscore. Must start with alphanumeric.</span>
                </div>
                
                <div class="form-group">
                    <label class="form-label">Description</label>
                    <textarea 
                        class="form-textarea" 
                        id="app-description"
                        placeholder="Optional description of your application"
                        onchange="RegistrationWizard.updateField('description', this.value)">${this.formData.description}</textarea>
                </div>
                
                <div class="form-group">
                    <label class="form-label required">Container Name</label>
                    <input 
                        type="text" 
                        class="form-input" 
                        id="container-name"
                        value="${this.formData.container_name}"
                        placeholder="web-app-container"
                        onchange="RegistrationWizard.updateField('container_name', this.value)">
                    <span class="form-hint">The name of the Docker container to monitor</span>
                </div>
            </div>
        `;
    },

    // Step 2: Health Check
    renderStep2() {
        const healthCheck = this.formData.health_check;

        return `
            <div class="form-step">
                <h3 style="margin-bottom: var(--space-lg);">Health Check Configuration</h3>
                
                <div class="form-group">
                    <label class="form-label required">Health Check Type</label>
                    <select 
                        class="form-select" 
                        id="health-check-type"
                        value="${healthCheck.type}"
                        onchange="RegistrationWizard.updateHealthCheckType(this.value)">
                        <option value="http">HTTP</option>
                        <option value="tcp">TCP</option>
                        <option value="exec">Exec</option>
                        <option value="docker_native">Docker Native</option>
                    </select>
                </div>
                
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--space-md);">
                    <div class="form-group">
                        <label class="form-label">Interval (seconds)</label>
                        <input 
                            type="number" 
                            class="form-input" 
                            value="${healthCheck.interval_seconds}"
                            min="10" max="3600"
                            onchange="RegistrationWizard.updateField('health_check.interval_seconds', parseInt(this.value))">
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label">Timeout (seconds)</label>
                        <input 
                            type="number" 
                            class="form-input" 
                            value="${healthCheck.timeout_seconds}"
                            min="1" max="300"
                            onchange="RegistrationWizard.updateField('health_check.timeout_seconds', parseInt(this.value))">
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label">Failure Threshold</label>
                        <input 
                            type="number" 
                            class="form-input" 
                            value="${healthCheck.failure_threshold}"
                            min="1" max="10"
                            onchange="RegistrationWizard.updateField('health_check.failure_threshold', parseInt(this.value))">
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label">Success Threshold</label>
                        <input 
                            type="number" 
                            class="form-input" 
                            value="${healthCheck.success_threshold}"
                            min="1" max="5"
                            onchange="RegistrationWizard.updateField('health_check.success_threshold', parseInt(this.value))">
                    </div>
                </div>
                
                <div id="health-check-config" style="margin-top: var(--space-lg);">
                    ${this.renderHealthCheckConfig(healthCheck.type)}
                </div>
            </div>
        `;
    },

    renderHealthCheckConfig(type) {
        const config = this.formData.health_check.config || {};

        switch (type) {
            case 'http':
                return `
                    <h4 style="margin-bottom: var(--space-md);">HTTP Configuration</h4>
                    <div class="form-group">
                        <label class="form-label required">URL</label>
                        <input 
                            type="text" 
                            class="form-input" 
                            value="${config.url || ''}"
                            placeholder="http://localhost:8080/health"
                            onchange="RegistrationWizard.updateField('health_check.config.url', this.value)">
                    </div>
                    <div class="form-group">
                        <label class="form-label">HTTP Method</label>
                        <select 
                            class="form-select"
                            value="${config.method || 'GET'}"
                            onchange="RegistrationWizard.updateField('health_check.config.method', this.value)">
                            <option value="GET">GET</option>
                            <option value="POST">POST</option>
                            <option value="HEAD">HEAD</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Expected Status Codes (comma-separated)</label>
                        <input 
                            type="text" 
                            class="form-input" 
                            value="${(config.expected_status_codes || [200]).join(',')}"
                            placeholder="200,201,204"
                            onchange="RegistrationWizard.updateField('health_check.config.expected_status_codes', this.value.split(',').map(n => parseInt(n.trim())))">
                    </div>
                    <h4 style="margin: var(--space-lg) 0 var(--space-md);">Enhanced Detection</h4>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-md);">
                        <div class="form-group">
                            <label class="form-label">Warn if response slower than (ms)</label>
                            <input 
                                type="number" 
                                class="form-input" 
                                value="${config.warn_response_time_ms || 3000}"
                                min="100" max="30000"
                                onchange="RegistrationWizard.updateField('health_check.config.warn_response_time_ms', parseInt(this.value))">
                            <span class="form-hint">Default: 3000ms</span>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Critical if response slower than (ms)</label>
                            <input 
                                type="number" 
                                class="form-input" 
                                value="${config.critical_response_time_ms || 5000}"
                                min="100" max="30000"
                                onchange="RegistrationWizard.updateField('health_check.config.critical_response_time_ms', parseInt(this.value))">
                            <span class="form-hint">Default: 5000ms</span>
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Additional Endpoints (one per line)</label>
                        <textarea
                            class="form-input"
                            id="additional-endpoints-input"
                            rows="3"
                            placeholder="/api/health&#10;/about&#10;http://localhost:8080/api/status"
                            style="resize:vertical;"
                            oninput="RegistrationWizard.updateField('health_check.config.additional_endpoints', this.value.split('\n').map(s=>s.trim()).filter(Boolean))">${(config.additional_endpoints || []).join('\n')}</textarea>
                        <span class="form-hint">Check reachability of extra routes (max 5)</span>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-md);">
                        <div class="form-group">
                            <label class="form-label">Error Keywords in Body</label>
                            <input 
                                type="text" 
                                class="form-input"
                                id="error-keywords-input"
                                value="${(config.error_keywords || []).join(', ')}"
                                placeholder="error, exception, fatal"
                                oninput="RegistrationWizard.updateField('health_check.config.error_keywords', this.value.split(',').map(s=>s.trim()).filter(Boolean))">
                            <span class="form-hint">Leave blank to use defaults</span>
                        </div>
                        <div class="form-group" style="display:flex; flex-direction:column; justify-content:center;">
                            <label class="form-label" style="display:flex; align-items:center; gap:var(--space-sm); cursor:pointer;">
                                <input 
                                    type="checkbox"
                                    ${config.expect_json ? 'checked' : ''}
                                    onchange="RegistrationWizard.updateField('health_check.config.expect_json', this.checked)">
                                Expect valid JSON response
                            </label>
                            <span class="form-hint">Fails if response body is not valid JSON</span>
                        </div>
                    </div>
                `;
            case 'tcp':
                return `
                    <h4 style="margin-bottom: var(--space-md);">TCP Configuration</h4>
                    <div style="display: grid; grid-template-columns: 2fr 1fr; gap: var(--space-md);">
                        <div class="form-group">
                            <label class="form-label">Host</label>
                            <input 
                                type="text" 
                                class="form-input" 
                                value="${config.host || 'localhost'}"
                                placeholder="localhost"
                                onchange="RegistrationWizard.updateField('health_check.config.host', this.value)">
                        </div>
                        <div class="form-group">
                            <label class="form-label required">Port</label>
                            <input 
                                type="number" 
                                class="form-input" 
                                value="${config.port || ''}"
                                placeholder="8080"
                                min="1" max="65535"
                                onchange="RegistrationWizard.updateField('health_check.config.port', parseInt(this.value))">
                        </div>
                    </div>
                `;
            case 'exec':
                return `
                    <h4 style="margin-bottom: var(--space-md);">Exec Configuration</h4>
                    <div class="form-group">
                        <label class="form-label required">Command</label>
                        <input 
                            type="text" 
                            class="form-input" 
                            value="${config.command || ''}"
                            placeholder="curl -f http://localhost:8080/health"
                            onchange="RegistrationWizard.updateField('health_check.config.command', this.value)">
                        <span class="form-hint">Command to execute inside the container</span>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Expected Exit Code</label>
                        <input 
                            type="number" 
                            class="form-input" 
                            value="${config.expected_exit_code || 0}"
                            min="0" max="255"
                            onchange="RegistrationWizard.updateField('health_check.config.expected_exit_code', parseInt(this.value))">
                    </div>
                `;
            case 'docker_native':
                return `
                    <div class="card card-glass" style="padding: var(--space-lg);">
                        <p class="text-muted">
                            Docker Native health checks use the container's built-in HEALTHCHECK instruction.
                            No additional configuration required.
                        </p>
                    </div>
                `;
            default:
                return '';
        }
    },

    // Step 3: Recovery Policy
    renderStep3() {
        const policy = this.formData.recovery_policy;

        return `
            <div class="form-step">
                <h3 style="margin-bottom: var(--space-sm);">Recovery Policy</h3>
                <p style="color: var(--color-text-secondary); font-size: var(--font-size-sm); margin-bottom: var(--space-lg);">
                    When enabled, the monitoring engine will automatically restart the container after detecting a failure — up to the configured limit, with an increasing delay between attempts.
                </p>
                
                <div class="form-group">
                    <label class="form-checkbox">
                        <input 
                            type="checkbox" 
                            ${policy.enabled ? 'checked' : ''}
                            onchange="RegistrationWizard.updateField('recovery_policy.enabled', this.checked); RegistrationWizard.refresh()">
                        <span>Enable automatic recovery</span>
                    </label>
                </div>
                
                ${policy.enabled ? `
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--space-md); margin-top: var(--space-lg);">
                        <div class="form-group">
                            <label class="form-label">Max Restart Attempts</label>
                            <input 
                                type="number" 
                                class="form-input" 
                                value="${policy.max_restart_attempts}"
                                min="0" max="10"
                                onchange="RegistrationWizard.updateField('recovery_policy.max_restart_attempts', parseInt(this.value))">
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label">Restart Delay (seconds)</label>
                            <input 
                                type="number" 
                                class="form-input" 
                                value="${policy.restart_delay_seconds}"
                                min="10" max="3600"
                                onchange="RegistrationWizard.updateField('recovery_policy.restart_delay_seconds', parseInt(this.value))">
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label">Backoff Multiplier</label>
                            <input 
                                type="number" 
                                class="form-input" 
                                step="0.1"
                                value="${policy.backoff_multiplier}"
                                min="1.0" max="3.0"
                                onchange="RegistrationWizard.updateField('recovery_policy.backoff_multiplier', parseFloat(this.value))">
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label">Escalation Threshold</label>
                            <input 
                                type="number" 
                                class="form-input" 
                                value="${policy.escalation_threshold}"
                                min="1" max="10"
                                onchange="RegistrationWizard.updateField('recovery_policy.escalation_threshold', parseInt(this.value))">
                        </div>
                    </div>
                    
                    <div class="form-group" style="margin-top: var(--space-lg);">
                        <label class="form-label">Allowed Actions</label>
                        <div style="margin-top: var(--space-sm);">
                            <label class="form-checkbox">
                                <input 
                                    type="checkbox" 
                                    checked
                                    disabled>
                                <span>Container Restart — triggered automatically by the monitoring engine</span>
                            </label>
                        </div>
                    </div>
                ` : `
                    <div class="card card-glass" style="padding: var(--space-lg); margin-top: var(--space-lg);">
                        <p class="text-muted">
                            Automatic recovery is disabled. The system will detect failures but will not take recovery actions.
                        </p>
                    </div>
                `}
            </div>
        `;
    },

    // Step 4: Metadata
    renderStep4() {
        const metadata = this.formData.metadata;

        return `
            <div class="form-step">
                <h3 style="margin-bottom: var(--space-lg);">Application Metadata</h3>
                
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: var(--space-md);">
                    <div class="form-group">
                        <label class="form-label required">Environment</label>
                        <select 
                            class="form-select"
                            value="${metadata.environment}"
                            onchange="RegistrationWizard.updateField('metadata.environment', this.value)">
                            <option value="development">Development</option>
                            <option value="staging">Staging</option>
                            <option value="production">Production</option>
                        </select>
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label">Criticality</label>
                        <select 
                            class="form-select"
                            value="${metadata.criticality}"
                            onchange="RegistrationWizard.updateField('metadata.criticality', this.value)">
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                            <option value="critical">Critical</option>
                        </select>
                    </div>
                </div>
                
                <div class="form-group">
                    <label class="form-label">Owner</label>
                    <input 
                        type="text" 
                        class="form-input" 
                        value="${metadata.owner || ''}"
                        placeholder="Team or individual name"
                        onchange="RegistrationWizard.updateField('metadata.owner', this.value)">
                </div>
                
                <div class="form-group">
                    <label class="form-label">Team</label>
                    <input 
                        type="text" 
                        class="form-input" 
                        value="${metadata.team || ''}"
                        placeholder="Team name"
                        onchange="RegistrationWizard.updateField('metadata.team', this.value)">
                </div>
                
                <div class="form-group">
                    <label class="form-label">Tags</label>
                    <input 
                        type="text" 
                        class="form-input" 
                        value="${(metadata.tags || []).join(', ')}"
                        placeholder="web, api, critical (comma-separated)"
                        onchange="RegistrationWizard.updateField('metadata.tags', this.value.split(',').map(t => t.trim()).filter(t => t))">
                </div>
            </div>
        `;
    },

    updateField(path, value) {
        const keys = path.split('.');
        let obj = this.formData;

        for (let i = 0; i < keys.length - 1; i++) {
            obj = obj[keys[i]];
        }

        obj[keys[keys.length - 1]] = value;
    },

    updateHealthCheckType(type) {
        this.formData.health_check.type = type;
        if (type === 'http') {
            this.formData.health_check.config = {
                url: '',
                method: 'GET',
                expected_status_codes: [200],
                warn_response_time_ms: 3000,
                critical_response_time_ms: 5000,
                error_keywords: [],
                additional_endpoints: [],
                expect_json: false
            };
        } else {
            this.formData.health_check.config = {};
        }
        this.refresh();
    },

    collectCurrentStepValues() {
        // Read values from DOM before refresh destroys them
        if (this.currentStep === 2 && this.formData.health_check.type === 'http') {
            const epEl = document.getElementById('additional-endpoints-input');
            if (epEl && epEl.value.trim()) {
                this.formData.health_check.config.additional_endpoints = epEl.value.split('\n').map(s => s.trim()).filter(Boolean);
            }
            const kwEl = document.getElementById('error-keywords-input');
            if (kwEl && kwEl.value.trim()) {
                this.formData.health_check.config.error_keywords = kwEl.value.split(',').map(s => s.trim()).filter(Boolean);
            }
        }
    },

    nextStep() {
        this.collectCurrentStepValues();
        if (this.currentStep < this.totalSteps) {
            this.currentStep++;
            this.refresh();
        }
    },

    previousStep() {
        if (this.currentStep > 1) {
            this.currentStep--;
            this.refresh();
        }
    },

    refresh() {
        const contentView = document.getElementById('content-view');
        if (contentView) {
            contentView.innerHTML = this.render();
        }
    },

    async submit() {
        this.collectCurrentStepValues();
        try {
            showLoading(true);

            // Validate and submit
            const result = await API.applications.create(this.formData);

            showLoading(false);
            showToast('Application registered successfully!', 'success');

            // Navigate to the new application
            setTimeout(() => {
                navigateToApp(result.app_id);
            }, 1000);

        } catch (error) {
            showLoading(false);
            showToast(error.message || 'Failed to register application', 'error');
            console.error('Registration error:', error);
        }
    }
};

console.log('Forms loaded');
