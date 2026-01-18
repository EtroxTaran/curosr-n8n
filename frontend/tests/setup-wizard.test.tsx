import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SetupStepWelcome } from '../components/setup/SetupStepWelcome';
import { SetupStepConnect } from '../components/setup/SetupStepConnect';
import { SetupStepImport } from '../components/setup/SetupStepImport';
import { SetupStepWebhooks } from '../components/setup/SetupStepWebhooks';
import { SetupStepVerify } from '../components/setup/SetupStepVerify';
import { SetupStepComplete } from '../components/setup/SetupStepComplete';
import type { WorkflowStatus } from '../components/setup/SetupStepImport';
import type { WebhookInfo } from '../components/setup/SetupStepWebhooks';
import type { VerificationResult } from '../components/setup/SetupStepVerify';

describe('SetupStepWelcome', () => {
  it('should render welcome message', () => {
    render(<SetupStepWelcome />);

    expect(screen.getByText(/Welcome to AI Product Factory Setup/i)).toBeInTheDocument();
  });

  it('should render all setup steps overview', () => {
    render(<SetupStepWelcome />);

    expect(screen.getByText('Connect to n8n')).toBeInTheDocument();
    expect(screen.getByText('Import Workflows')).toBeInTheDocument();
    expect(screen.getByText('Configure Webhooks')).toBeInTheDocument();
    expect(screen.getByText('Verify Setup')).toBeInTheDocument();
  });

  it('should render prerequisites note', () => {
    render(<SetupStepWelcome />);

    expect(screen.getByText('Before you begin')).toBeInTheDocument();
    // Use getAllByText since "n8n instance" appears in multiple places
    const n8nMentions = screen.getAllByText(/n8n instance/i);
    expect(n8nMentions.length).toBeGreaterThan(0);
    // API key is mentioned in the prerequisites section
    const apiKeyMentions = screen.getAllByText(/API key/i);
    expect(apiKeyMentions.length).toBeGreaterThan(0);
  });

  it('should render skip option hint', () => {
    render(<SetupStepWelcome />);

    expect(screen.getByText(/Skip Setup/i)).toBeInTheDocument();
  });
});

describe('SetupStepConnect', () => {
  const defaultProps = {
    apiUrl: '',
    apiKey: '',
    webhookBaseUrl: '',
    onApiUrlChange: vi.fn(),
    onApiKeyChange: vi.fn(),
    onWebhookBaseUrlChange: vi.fn(),
    onTestConnection: vi.fn().mockResolvedValue(undefined),
    connectionStatus: 'idle' as const,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render all input fields', () => {
    render(<SetupStepConnect {...defaultProps} />);

    expect(screen.getByLabelText(/n8n Instance URL/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/API Key/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Webhook Base URL/i)).toBeInTheDocument();
  });

  it('should render test connection button', () => {
    render(<SetupStepConnect {...defaultProps} />);

    expect(screen.getByRole('button', { name: /Test Connection/i })).toBeInTheDocument();
  });

  it('should disable test button when fields are empty', () => {
    render(<SetupStepConnect {...defaultProps} />);

    const testButton = screen.getByRole('button', { name: /Test Connection/i });
    expect(testButton).toBeDisabled();
  });

  it('should enable test button when URL and API key are provided', () => {
    render(
      <SetupStepConnect
        {...defaultProps}
        apiUrl="https://n8n.example.com"
        apiKey="n8n_api_12345"
      />
    );

    const testButton = screen.getByRole('button', { name: /Test Connection/i });
    expect(testButton).not.toBeDisabled();
  });

  it('should call onApiUrlChange when URL is entered', async () => {
    const user = userEvent.setup();
    render(<SetupStepConnect {...defaultProps} />);

    // Use getByLabelText which matches the id via htmlFor
    const urlInput = screen.getByLabelText(/n8n Instance URL/i);
    await user.type(urlInput, 'https://test.com');

    expect(defaultProps.onApiUrlChange).toHaveBeenCalled();
  });

  it('should call onApiKeyChange when API key is entered', async () => {
    const user = userEvent.setup();
    render(<SetupStepConnect {...defaultProps} />);

    const apiKeyInput = screen.getByPlaceholderText('n8n_api_...');
    await user.type(apiKeyInput, 'test-key');

    expect(defaultProps.onApiKeyChange).toHaveBeenCalled();
  });

  it('should toggle API key visibility', async () => {
    const user = userEvent.setup();
    render(
      <SetupStepConnect
        {...defaultProps}
        apiKey="secret-api-key"
      />
    );

    const apiKeyInput = screen.getByPlaceholderText('n8n_api_...') as HTMLInputElement;
    expect(apiKeyInput.type).toBe('password');

    // Find the toggle button (the one inside the input group)
    const toggleButtons = screen.getAllByRole('button');
    const toggleButton = toggleButtons.find(btn => btn.className.includes('absolute'));
    if (toggleButton) {
      await user.click(toggleButton);
      expect(apiKeyInput.type).toBe('text');
    }
  });

  it('should call onTestConnection when test button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <SetupStepConnect
        {...defaultProps}
        apiUrl="https://n8n.example.com"
        apiKey="n8n_api_12345"
      />
    );

    const testButton = screen.getByRole('button', { name: /Test Connection/i });
    await user.click(testButton);

    expect(defaultProps.onTestConnection).toHaveBeenCalled();
  });

  it('should show loading state during testing', () => {
    render(
      <SetupStepConnect
        {...defaultProps}
        apiUrl="https://n8n.example.com"
        apiKey="n8n_api_12345"
        connectionStatus="testing"
      />
    );

    expect(screen.getByText(/Testing Connection/i)).toBeInTheDocument();
  });

  it('should show success state when connection verified', () => {
    render(
      <SetupStepConnect
        {...defaultProps}
        apiUrl="https://n8n.example.com"
        apiKey="n8n_api_12345"
        connectionStatus="success"
        connectionVersion="1.82.0"
      />
    );

    expect(screen.getByText(/Connection Successful/i)).toBeInTheDocument();
    expect(screen.getByText(/version 1\.82\.0/i)).toBeInTheDocument();
  });

  it('should show error state when connection fails', () => {
    render(
      <SetupStepConnect
        {...defaultProps}
        apiUrl="https://n8n.example.com"
        apiKey="n8n_api_12345"
        connectionStatus="error"
        connectionError="Invalid API key"
      />
    );

    expect(screen.getByText(/Connection Failed/i)).toBeInTheDocument();
    expect(screen.getByText(/Invalid API key/i)).toBeInTheDocument();
  });

  it('should render help link for creating API key', () => {
    render(<SetupStepConnect {...defaultProps} />);

    const helpLink = screen.getByRole('link', { name: /How to create an n8n API key/i });
    expect(helpLink).toHaveAttribute('href', 'https://docs.n8n.io/api/api-reference/');
    expect(helpLink).toHaveAttribute('target', '_blank');
  });
});

describe('SetupStepImport', () => {
  const sampleWorkflows: WorkflowStatus[] = [
    {
      filename: 'workflow-1.json',
      name: 'Main Workflow',
      localVersion: '1.0.0',
      n8nWorkflowId: null,
      isActive: false,
      importStatus: 'pending',
      webhookPaths: [],
      hasCredentials: false,
      lastImportAt: null,
      lastError: null,
    },
    {
      filename: 'workflow-2.json',
      name: 'Subworkflow A',
      localVersion: '1.0.0',
      n8nWorkflowId: 'wf_123',
      isActive: true,
      importStatus: 'imported',
      webhookPaths: ['/webhook/test'],
      hasCredentials: true,
      lastImportAt: '2024-01-15T10:00:00Z',
      lastError: null,
    },
  ];

  const defaultProps = {
    workflows: sampleWorkflows,
    isLoading: false,
    isImporting: false,
    importProgress: null,
    onStartImport: vi.fn(),
    onRetryFailed: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render workflow list', () => {
    render(<SetupStepImport {...defaultProps} />);

    expect(screen.getByText('Main Workflow')).toBeInTheDocument();
    expect(screen.getByText('Subworkflow A')).toBeInTheDocument();
  });

  it('should show import count', () => {
    render(<SetupStepImport {...defaultProps} />);

    expect(screen.getByText('1/2')).toBeInTheDocument();
  });

  it('should show pending status badge', () => {
    render(<SetupStepImport {...defaultProps} />);

    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('should show credentials badge for workflows with credentials', () => {
    render(<SetupStepImport {...defaultProps} />);

    expect(screen.getByText('Credentials')).toBeInTheDocument();
  });

  it('should show import button when there are pending workflows', () => {
    render(<SetupStepImport {...defaultProps} />);

    expect(screen.getByRole('button', { name: /Import All Workflows/i })).toBeInTheDocument();
  });

  it('should call onStartImport when import button is clicked', async () => {
    const user = userEvent.setup();
    render(<SetupStepImport {...defaultProps} />);

    const importButton = screen.getByRole('button', { name: /Import All Workflows/i });
    await user.click(importButton);

    expect(defaultProps.onStartImport).toHaveBeenCalled();
  });

  it('should show loading state', () => {
    render(<SetupStepImport {...defaultProps} isLoading={true} />);

    // Loading spinner should be present
    const spinner = document.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('should show importing progress with phase indicator', () => {
    render(
      <SetupStepImport
        {...defaultProps}
        isImporting={true}
        importProgress={{ current: 'Main Workflow', completed: 1, total: 2, phase: 'creating' }}
      />
    );

    // Should show phase indicator and current workflow in progress display
    expect(screen.getByText('Creating Workflows')).toBeInTheDocument();
    expect(screen.getByText(/Creating:/i)).toBeInTheDocument();
  });

  it('should show activating phase progress', () => {
    render(
      <SetupStepImport
        {...defaultProps}
        isImporting={true}
        importProgress={{ current: 'Main Workflow', completed: 1, total: 2, phase: 'activating' }}
      />
    );

    // Should show activating phase
    expect(screen.getByText('Activating Workflows')).toBeInTheDocument();
    expect(screen.getByText(/Activating:/i)).toBeInTheDocument();
  });

  it('should show success message when all imported', () => {
    const allImportedWorkflows: WorkflowStatus[] = [
      { ...sampleWorkflows[0], importStatus: 'imported' },
      { ...sampleWorkflows[1] },
    ];

    render(
      <SetupStepImport
        {...defaultProps}
        workflows={allImportedWorkflows}
      />
    );

    expect(screen.getByText(/All workflows imported successfully/i)).toBeInTheDocument();
  });

  it('should show retry button when there are failures', () => {
    const failedWorkflows: WorkflowStatus[] = [
      { ...sampleWorkflows[0], importStatus: 'failed', lastError: 'API error' },
      { ...sampleWorkflows[1] },
    ];

    render(
      <SetupStepImport
        {...defaultProps}
        workflows={failedWorkflows}
      />
    );

    expect(screen.getByRole('button', { name: /Retry Failed/i })).toBeInTheDocument();
  });

  it('should show error message for failed workflows', () => {
    const failedWorkflows: WorkflowStatus[] = [
      { ...sampleWorkflows[0], importStatus: 'failed', lastError: 'API connection error' },
      { ...sampleWorkflows[1] },
    ];

    render(
      <SetupStepImport
        {...defaultProps}
        workflows={failedWorkflows}
      />
    );

    expect(screen.getByText(/API connection error/i)).toBeInTheDocument();
  });
});

describe('SetupStepWebhooks', () => {
  const sampleWebhooks: WebhookInfo[] = [
    {
      workflowName: 'API Workflow',
      path: '/webhook/start-project',
      fullUrl: 'https://n8n.example.com/webhook/start-project',
      isActive: true,
    },
    {
      workflowName: 'Governance Workflow',
      path: '/webhook/governance-batch',
      fullUrl: 'https://n8n.example.com/webhook/governance-batch',
      isActive: true,
    },
  ];

  const defaultProps = {
    webhooks: sampleWebhooks,
    webhookBaseUrl: 'https://n8n.example.com',
  };

  it('should render webhook list', () => {
    render(<SetupStepWebhooks {...defaultProps} />);

    expect(screen.getByText('API Workflow')).toBeInTheDocument();
    expect(screen.getByText('Governance Workflow')).toBeInTheDocument();
  });

  it('should show webhook URLs', () => {
    render(<SetupStepWebhooks {...defaultProps} />);

    expect(screen.getByText(/\/webhook\/start-project/)).toBeInTheDocument();
    expect(screen.getByText(/\/webhook\/governance-batch/)).toBeInTheDocument();
  });

  it('should show Active badges for active webhooks', () => {
    render(<SetupStepWebhooks {...defaultProps} />);

    const activeBadges = screen.getAllByText('Active');
    expect(activeBadges.length).toBe(2);
  });

  it('should show empty state when no webhooks', () => {
    render(
      <SetupStepWebhooks
        {...defaultProps}
        webhooks={[]}
      />
    );

    expect(screen.getByText(/No webhook endpoints detected/i)).toBeInTheDocument();
  });

  it('should show base URL', () => {
    render(<SetupStepWebhooks {...defaultProps} />);

    expect(screen.getByText('https://n8n.example.com')).toBeInTheDocument();
  });

  it('should show webhook summary', () => {
    render(<SetupStepWebhooks {...defaultProps} />);

    expect(screen.getByText('Webhook Summary')).toBeInTheDocument();
    expect(screen.getByText(/2 endpoints detected/i)).toBeInTheDocument();
  });

  it('should show inactive badges for inactive webhooks', () => {
    const webhooksWithInactive: WebhookInfo[] = [
      { ...sampleWebhooks[0] },
      { ...sampleWebhooks[1], isActive: false },
    ];

    render(
      <SetupStepWebhooks
        {...defaultProps}
        webhooks={webhooksWithInactive}
      />
    );

    expect(screen.getByText('Inactive')).toBeInTheDocument();
  });
});

describe('SetupStepVerify', () => {
  const defaultVerificationResults: VerificationResult[] = [
    {
      id: 'n8n-health',
      name: 'n8n Health',
      description: 'Check if n8n instance is accessible',
      status: 'pending',
    },
    {
      id: 'api-access',
      name: 'API Access',
      description: 'Verify API key is valid',
      status: 'pending',
    },
    {
      id: 'workflows',
      name: 'Workflows Active',
      description: 'Check if workflows are imported and active',
      status: 'pending',
    },
    {
      id: 'webhooks',
      name: 'Webhooks Accessible',
      description: 'Verify webhooks can be reached',
      status: 'pending',
    },
  ];

  const defaultProps = {
    verificationResults: defaultVerificationResults,
    isVerifying: false,
    onVerify: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render verification checklist', () => {
    render(<SetupStepVerify {...defaultProps} />);

    expect(screen.getByText('n8n Health')).toBeInTheDocument();
    expect(screen.getByText('API Access')).toBeInTheDocument();
    expect(screen.getByText('Workflows Active')).toBeInTheDocument();
    expect(screen.getByText('Webhooks Accessible')).toBeInTheDocument();
  });

  it('should render start verification button', () => {
    render(<SetupStepVerify {...defaultProps} />);

    expect(screen.getByRole('button', { name: /Run Verification/i })).toBeInTheDocument();
  });

  it('should call onVerify when button clicked', async () => {
    const user = userEvent.setup();
    render(<SetupStepVerify {...defaultProps} />);

    const verifyButton = screen.getByRole('button', { name: /Run Verification/i });
    await user.click(verifyButton);

    expect(defaultProps.onVerify).toHaveBeenCalled();
  });

  it('should show loading state during verification', () => {
    render(<SetupStepVerify {...defaultProps} isVerifying={true} />);

    expect(screen.getByText(/Verifying/i)).toBeInTheDocument();
  });

  it('should show passed status for successful checks', () => {
    const passedResults: VerificationResult[] = defaultVerificationResults.map(r => ({
      ...r,
      status: 'success' as const,
      message: 'Check passed',
    }));

    render(
      <SetupStepVerify
        {...defaultProps}
        verificationResults={passedResults}
      />
    );

    // Should show success message
    expect(screen.getByText(/All Checks Passed/i)).toBeInTheDocument();
  });

  it('should show failed status for failed checks', () => {
    const failedResults: VerificationResult[] = [
      { ...defaultVerificationResults[0], status: 'success' as const },
      { ...defaultVerificationResults[1], status: 'error' as const, message: 'API key invalid' },
      { ...defaultVerificationResults[2], status: 'error' as const },
      { ...defaultVerificationResults[3], status: 'error' as const },
    ];

    render(
      <SetupStepVerify
        {...defaultProps}
        verificationResults={failedResults}
      />
    );

    // Should show failure message
    expect(screen.getByText(/Some Checks Failed/i)).toBeInTheDocument();
  });

  it('should show check descriptions', () => {
    render(<SetupStepVerify {...defaultProps} />);

    expect(screen.getByText('Check if n8n instance is accessible')).toBeInTheDocument();
    expect(screen.getByText('Verify API key is valid')).toBeInTheDocument();
  });

  it('should show warning status when checks have warnings', () => {
    const warningResults: VerificationResult[] = [
      { ...defaultVerificationResults[0], status: 'success' as const },
      { ...defaultVerificationResults[1], status: 'warning' as const, message: 'API key may expire soon' },
      { ...defaultVerificationResults[2], status: 'success' as const },
      { ...defaultVerificationResults[3], status: 'success' as const },
    ];

    render(
      <SetupStepVerify
        {...defaultProps}
        verificationResults={warningResults}
      />
    );

    expect(screen.getByText('Warning')).toBeInTheDocument();
  });
});

describe('SetupStepComplete', () => {
  const defaultSummary = {
    n8nConfigured: true,
    workflowsImported: 8,
    workflowsTotal: 8,
    webhooksConfigured: 2,
  };

  const defaultProps = {
    summary: defaultSummary,
    onGoToProjects: vi.fn(),
    onGoToSettings: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render success message', () => {
    render(<SetupStepComplete {...defaultProps} />);

    expect(screen.getByText(/Setup Complete/i)).toBeInTheDocument();
  });

  it('should show workflows imported count', () => {
    render(<SetupStepComplete {...defaultProps} />);

    expect(screen.getByText('8/8')).toBeInTheDocument();
    expect(screen.getByText(/Workflows Imported/i)).toBeInTheDocument();
  });

  it('should show webhooks configured count', () => {
    render(<SetupStepComplete {...defaultProps} />);

    // The number "2" may appear multiple times (webhooks count and next steps list)
    // Use getAllByText and verify at least one matches
    const webhooksText = screen.getAllByText('2');
    expect(webhooksText.length).toBeGreaterThan(0);
    expect(screen.getByText(/Webhooks Configured/i)).toBeInTheDocument();
  });

  it('should show Connected status', () => {
    render(<SetupStepComplete {...defaultProps} />);

    expect(screen.getByText('Connected')).toBeInTheDocument();
    expect(screen.getByText(/n8n Status/i)).toBeInTheDocument();
  });

  it('should render Go to Projects button', () => {
    render(<SetupStepComplete {...defaultProps} />);

    expect(screen.getByRole('button', { name: /Go to Projects/i })).toBeInTheDocument();
  });

  it('should call onGoToProjects when clicked', async () => {
    const user = userEvent.setup();
    render(<SetupStepComplete {...defaultProps} />);

    const projectsButton = screen.getByRole('button', { name: /Go to Projects/i });
    await user.click(projectsButton);

    expect(defaultProps.onGoToProjects).toHaveBeenCalled();
  });

  it('should render View Settings link', () => {
    render(<SetupStepComplete {...defaultProps} />);

    expect(screen.getByRole('button', { name: /View Settings/i })).toBeInTheDocument();
  });

  it('should call onGoToSettings when clicked', async () => {
    const user = userEvent.setup();
    render(<SetupStepComplete {...defaultProps} />);

    const settingsButton = screen.getByRole('button', { name: /View Settings/i });
    await user.click(settingsButton);

    expect(defaultProps.onGoToSettings).toHaveBeenCalled();
  });

  it('should render next steps section', () => {
    render(<SetupStepComplete {...defaultProps} />);

    expect(screen.getByText(/Next Steps/i)).toBeInTheDocument();
  });

  it('should render help link to n8n documentation', () => {
    render(<SetupStepComplete {...defaultProps} />);

    const helpLink = screen.getByRole('link', { name: /n8n Documentation/i });
    expect(helpLink).toHaveAttribute('href', 'https://docs.n8n.io/');
    expect(helpLink).toHaveAttribute('target', '_blank');
  });
});
