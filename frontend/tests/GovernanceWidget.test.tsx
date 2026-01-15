import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GovernanceWidget } from '../components/governance/GovernanceWidget';
import type { GovernancePayload, GovernanceResponse, TechDecision } from '../lib/schemas';

// Sample governance payload matching n8n schema
const samplePayload: GovernancePayload = {
  type: 'governance_request',
  scavenging_id: 'sc_abc123',
  project_id: 'test-project',
  detected_stack: [
    {
      id: 'tech_001',
      name: 'PostgreSQL',
      type: 'technology',
      category: 'database',
      description: 'Relational database management system',
      source: 'architecture.md',
      confidence: 0.95,
      alternatives: [
        { name: 'MySQL', description: 'Alternative open-source RDBMS' },
        { name: 'CockroachDB', description: 'Distributed SQL database' },
      ],
    },
    {
      id: 'tech_002',
      name: 'React',
      type: 'technology',
      category: 'framework',
      description: 'JavaScript UI library',
      source: 'tech-standards.md',
      confidence: 0.92,
      alternatives: [
        { name: 'Vue', description: 'Progressive JavaScript framework' },
        { name: 'Svelte', description: 'Compile-time framework' },
      ],
    },
    {
      id: 'tech_003',
      name: 'TypeScript',
      type: 'technology',
      category: 'language',
      description: 'Typed superset of JavaScript',
      source: 'coding-standards.md',
      confidence: 0.98,
      alternatives: [],
    },
  ],
  webhook_url: 'https://n8n.example.com/webhook/governance-batch',
};

// Helper to find icon buttons in a tech row
// The buttons are in order: Globe (global approve), CheckCircle2 (local approve), SkipForward (skip), Chevron (expand)
function getTechRowButtons(techName: string) {
  const techText = screen.getByText(techName);
  // The tech row container is the parent with border class
  const techRow = techText.closest('div[class*="border"][class*="rounded"]');
  if (!techRow) throw new Error(`Could not find tech row for ${techName}`);

  // Find all buttons within the row
  const allButtons = Array.from(techRow.querySelectorAll('button'));

  // Icon buttons have 'h-8' and 'w-8' classes
  const iconButtons = allButtons.filter(btn =>
    btn.className.includes('h-8') && btn.className.includes('w-8')
  );

  if (iconButtons.length < 4) {
    throw new Error(`Expected 4 icon buttons in tech row for ${techName}, found ${iconButtons.length}`);
  }

  return {
    globalApprove: iconButtons[0] as HTMLButtonElement,
    localApprove: iconButtons[1] as HTMLButtonElement,
    skip: iconButtons[2] as HTMLButtonElement,
    expand: iconButtons[3] as HTMLButtonElement,
  };
}

describe('GovernanceWidget', () => {
  const mockOnSubmit = vi.fn();

  beforeEach(() => {
    mockOnSubmit.mockClear();
    mockOnSubmit.mockResolvedValue(undefined);
  });

  describe('Rendering', () => {
    it('should render the card with title', () => {
      render(<GovernanceWidget payload={samplePayload} onSubmit={mockOnSubmit} />);

      // Check header
      expect(screen.getByText('Tech Stack Configurator')).toBeInTheDocument();
    });

    it('should render all detected technologies', () => {
      render(<GovernanceWidget payload={samplePayload} onSubmit={mockOnSubmit} />);

      // Check all technologies are rendered
      expect(screen.getByText('PostgreSQL')).toBeInTheDocument();
      expect(screen.getByText('React')).toBeInTheDocument();
      expect(screen.getByText('TypeScript')).toBeInTheDocument();
    });

    it('should display category badges correctly', () => {
      render(<GovernanceWidget payload={samplePayload} onSubmit={mockOnSubmit} />);

      expect(screen.getByText('database')).toBeInTheDocument();
      expect(screen.getByText('framework')).toBeInTheDocument();
      expect(screen.getByText('language')).toBeInTheDocument();
    });

    it('should show confidence percentage for each technology', () => {
      render(<GovernanceWidget payload={samplePayload} onSubmit={mockOnSubmit} />);

      // 95% confidence for PostgreSQL
      expect(screen.getByText('95%')).toBeInTheDocument();
      // 92% confidence for React
      expect(screen.getByText('92%')).toBeInTheDocument();
      // 98% confidence for TypeScript
      expect(screen.getByText('98%')).toBeInTheDocument();
    });

    it('should show source document reference', () => {
      render(<GovernanceWidget payload={samplePayload} onSubmit={mockOnSubmit} />);

      expect(screen.getByText('architecture.md')).toBeInTheDocument();
      expect(screen.getByText('tech-standards.md')).toBeInTheDocument();
      expect(screen.getByText('coding-standards.md')).toBeInTheDocument();
    });

    it('should render batch action buttons', () => {
      render(<GovernanceWidget payload={samplePayload} onSubmit={mockOnSubmit} />);

      expect(screen.getByRole('button', { name: /Approve All \(Global\)/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Approve All \(Local\)/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Skip All/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Confirm Selections/i })).toBeInTheDocument();
    });

    it('should show initial stats of 0 approved, 3 skipped', () => {
      render(<GovernanceWidget payload={samplePayload} onSubmit={mockOnSubmit} />);

      // Initial state: all skipped
      expect(screen.getByText('0 Approved')).toBeInTheDocument();
      expect(screen.getByText('3 Skipped')).toBeInTheDocument();
    });
  });

  describe('Interaction - Individual Actions', () => {
    it('should approve technology globally when clicking globe button', async () => {
      const user = userEvent.setup();
      render(<GovernanceWidget payload={samplePayload} onSubmit={mockOnSubmit} />);

      // Get the first tech row's buttons (PostgreSQL)
      const buttons = getTechRowButtons('PostgreSQL');

      // Click the global approve button
      await user.click(buttons.globalApprove);

      // Stats should update - wait for React to re-render
      await waitFor(() => {
        expect(screen.getByText('1 Approved')).toBeInTheDocument();
      });
      expect(screen.getByText('2 Skipped')).toBeInTheDocument();
    });

    it('should skip technology when clicking skip button', async () => {
      const user = userEvent.setup();
      render(<GovernanceWidget payload={samplePayload} onSubmit={mockOnSubmit} />);

      // First approve all globally
      const approveAllGlobalBtn = screen.getByRole('button', { name: /Approve All \(Global\)/i });
      await user.click(approveAllGlobalBtn);

      // Should show 3 approved
      await waitFor(() => {
        expect(screen.getByText('3 Approved')).toBeInTheDocument();
      });

      // Now click skip on PostgreSQL
      const buttons = getTechRowButtons('PostgreSQL');
      await user.click(buttons.skip);

      // Should show 2 approved now
      await waitFor(() => {
        expect(screen.getByText('2 Approved')).toBeInTheDocument();
      });
    });
  });

  describe('Interaction - Batch Actions', () => {
    it('should approve all technologies globally when clicking Approve All (Global)', async () => {
      const user = userEvent.setup();
      render(<GovernanceWidget payload={samplePayload} onSubmit={mockOnSubmit} />);

      const approveAllGlobalBtn = screen.getByRole('button', { name: /Approve All \(Global\)/i });
      await user.click(approveAllGlobalBtn);

      // Stats should show all approved
      expect(screen.getByText('3 Approved')).toBeInTheDocument();
      expect(screen.getByText('0 Skipped')).toBeInTheDocument();
      expect(screen.getByText('3 global, 0 local')).toBeInTheDocument();
    });

    it('should approve all technologies locally when clicking Approve All (Local)', async () => {
      const user = userEvent.setup();
      render(<GovernanceWidget payload={samplePayload} onSubmit={mockOnSubmit} />);

      const approveAllLocalBtn = screen.getByRole('button', { name: /Approve All \(Local\)/i });
      await user.click(approveAllLocalBtn);

      // Stats should show all approved locally
      expect(screen.getByText('3 Approved')).toBeInTheDocument();
      expect(screen.getByText('0 global, 3 local')).toBeInTheDocument();
    });

    it('should skip all technologies when clicking Skip All', async () => {
      const user = userEvent.setup();
      render(<GovernanceWidget payload={samplePayload} onSubmit={mockOnSubmit} />);

      // First approve all
      const approveAllBtn = screen.getByRole('button', { name: /Approve All \(Global\)/i });
      await user.click(approveAllBtn);

      expect(screen.getByText('3 Approved')).toBeInTheDocument();

      // Then skip all
      const skipAllBtn = screen.getByRole('button', { name: /Skip All/i });
      await user.click(skipAllBtn);

      // Stats should show all skipped
      expect(screen.getByText('0 Approved')).toBeInTheDocument();
      expect(screen.getByText('3 Skipped')).toBeInTheDocument();
    });
  });

  describe('Interaction - Expanded Row', () => {
    it('should expand row when clicking on it', async () => {
      const user = userEvent.setup();
      render(<GovernanceWidget payload={samplePayload} onSubmit={mockOnSubmit} />);

      // Click on the tech name area to expand (click on the row itself)
      const postgresText = screen.getByText('PostgreSQL');
      const clickableRow = postgresText.closest('div.cursor-pointer');
      expect(clickableRow).toBeInTheDocument();

      await user.click(clickableRow!);

      // Should show description in expanded view
      expect(screen.getByText('Relational database management system')).toBeInTheDocument();
    });

    it('should show alternative dropdown when row is expanded and has alternatives', async () => {
      const user = userEvent.setup();
      render(<GovernanceWidget payload={samplePayload} onSubmit={mockOnSubmit} />);

      // Expand PostgreSQL row
      const postgresText = screen.getByText('PostgreSQL');
      const clickableRow = postgresText.closest('div.cursor-pointer');
      await user.click(clickableRow!);

      // Should show "Use Alternative" label
      expect(screen.getByText('Use Alternative')).toBeInTheDocument();
    });
  });

  describe('Contract - Confirm Payload', () => {
    it('should call onSubmit with payload matching Zod schema exactly', async () => {
      const user = userEvent.setup();
      render(<GovernanceWidget payload={samplePayload} onSubmit={mockOnSubmit} />);

      // Approve all globally first
      const approveAllGlobalBtn = screen.getByRole('button', { name: /Approve All \(Global\)/i });
      await user.click(approveAllGlobalBtn);

      // Click confirm
      const confirmBtn = screen.getByRole('button', { name: /Confirm Selections/i });
      await user.click(confirmBtn);

      // Wait for onSubmit to be called
      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledTimes(1);
      });

      // Verify payload structure
      const submittedPayload: GovernanceResponse = mockOnSubmit.mock.calls[0][0];

      // Must match GovernanceResponseSchema
      expect(submittedPayload).toHaveProperty('scavenging_id', 'sc_abc123');
      expect(submittedPayload).toHaveProperty('project_id', 'test-project');
      expect(submittedPayload).toHaveProperty('decisions');
      expect(submittedPayload).toHaveProperty('submitted_at');
      expect(Array.isArray(submittedPayload.decisions)).toBe(true);

      // Verify decisions structure
      const decisions = submittedPayload.decisions;
      expect(decisions.length).toBe(3); // All technologies included

      // All should be approved globally
      decisions.forEach((decision: TechDecision) => {
        expect(decision.action).toBe('approve');
        expect(decision.scope).toBe('global');
      });

      // Verify ISO timestamp format
      expect(submittedPayload.submitted_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should include correct tech_ids in decisions', async () => {
      const user = userEvent.setup();
      render(<GovernanceWidget payload={samplePayload} onSubmit={mockOnSubmit} />);

      // Click confirm with default (all skipped)
      const confirmBtn = screen.getByRole('button', { name: /Confirm Selections/i });
      await user.click(confirmBtn);

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalled();
      });

      const submittedPayload: GovernanceResponse = mockOnSubmit.mock.calls[0][0];
      const techIds = submittedPayload.decisions.map((d: TechDecision) => d.tech_id);

      expect(techIds).toContain('tech_001'); // PostgreSQL
      expect(techIds).toContain('tech_002'); // React
      expect(techIds).toContain('tech_003'); // TypeScript
    });

    it('should set action to skip for all technologies by default', async () => {
      const user = userEvent.setup();
      render(<GovernanceWidget payload={samplePayload} onSubmit={mockOnSubmit} />);

      // Click confirm without any changes
      const confirmBtn = screen.getByRole('button', { name: /Confirm Selections/i });
      await user.click(confirmBtn);

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalled();
      });

      const submittedPayload: GovernanceResponse = mockOnSubmit.mock.calls[0][0];

      // All should be skipped by default
      submittedPayload.decisions.forEach((decision: TechDecision) => {
        expect(decision.action).toBe('skip');
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty detected_stack gracefully', () => {
      const emptyPayload: GovernancePayload = {
        ...samplePayload,
        detected_stack: [],
      };

      render(<GovernanceWidget payload={emptyPayload} onSubmit={mockOnSubmit} />);

      expect(screen.getByText(/No technologies detected/i)).toBeInTheDocument();
    });

    it('should not disable confirm button with default decisions', () => {
      render(<GovernanceWidget payload={samplePayload} onSubmit={mockOnSubmit} />);

      // All default to "skip" - button should still be enabled
      const confirmBtn = screen.getByRole('button', { name: /Confirm Selections/i });
      expect(confirmBtn).not.toBeDisabled();
    });

    it('should show loading state during submission', async () => {
      const user = userEvent.setup();

      // Make onSubmit return a delayed promise
      mockOnSubmit.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 500)));

      render(<GovernanceWidget payload={samplePayload} onSubmit={mockOnSubmit} />);

      const confirmBtn = screen.getByRole('button', { name: /Confirm Selections/i });
      await user.click(confirmBtn);

      // Should show loading state immediately
      await waitFor(() => {
        expect(screen.getByText(/Submitting/i)).toBeInTheDocument();
      });
    });

    it('should disable buttons when disabled prop is true', () => {
      render(<GovernanceWidget payload={samplePayload} onSubmit={mockOnSubmit} disabled={true} />);

      const approveAllGlobalBtn = screen.getByRole('button', { name: /Approve All \(Global\)/i });
      const approveAllLocalBtn = screen.getByRole('button', { name: /Approve All \(Local\)/i });
      const skipAllBtn = screen.getByRole('button', { name: /Skip All/i });
      const confirmBtn = screen.getByRole('button', { name: /Confirm Selections/i });

      expect(approveAllGlobalBtn).toBeDisabled();
      expect(approveAllLocalBtn).toBeDisabled();
      expect(skipAllBtn).toBeDisabled();
      expect(confirmBtn).toBeDisabled();
    });

    it('should render cancel button when onCancel prop is provided', () => {
      const mockOnCancel = vi.fn();
      render(
        <GovernanceWidget
          payload={samplePayload}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();
    });

    it('should not render cancel button when onCancel prop is not provided', () => {
      render(<GovernanceWidget payload={samplePayload} onSubmit={mockOnSubmit} />);

      expect(screen.queryByRole('button', { name: /Cancel/i })).not.toBeInTheDocument();
    });
  });

  describe('Mixed Decisions', () => {
    it('should handle mixed approve/skip decisions correctly', async () => {
      const user = userEvent.setup();
      render(<GovernanceWidget payload={samplePayload} onSubmit={mockOnSubmit} />);

      // Approve PostgreSQL globally
      const pgButtons = getTechRowButtons('PostgreSQL');
      await user.click(pgButtons.globalApprove);

      // Wait for state update
      await waitFor(() => {
        expect(screen.getByText('1 Approved')).toBeInTheDocument();
      });

      // Approve React locally
      const reactButtons = getTechRowButtons('React');
      await user.click(reactButtons.localApprove);

      // Wait for state update
      await waitFor(() => {
        expect(screen.getByText('2 Approved')).toBeInTheDocument();
      });

      // TypeScript remains skipped (default)

      // Confirm
      const confirmBtn = screen.getByRole('button', { name: /Confirm Selections/i });
      await user.click(confirmBtn);

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalled();
      });

      const submittedPayload: GovernanceResponse = mockOnSubmit.mock.calls[0][0];

      // Find PostgreSQL decision
      const pgDecision = submittedPayload.decisions.find((d: TechDecision) => d.tech_id === 'tech_001');
      expect(pgDecision).toMatchObject({
        tech_id: 'tech_001',
        action: 'approve',
        scope: 'global',
      });

      // Find React decision
      const reactDecision = submittedPayload.decisions.find((d: TechDecision) => d.tech_id === 'tech_002');
      expect(reactDecision).toMatchObject({
        tech_id: 'tech_002',
        action: 'approve',
        scope: 'local',
      });

      // Find TypeScript decision (skipped)
      const tsDecision = submittedPayload.decisions.find((d: TechDecision) => d.tech_id === 'tech_003');
      expect(tsDecision).toMatchObject({
        tech_id: 'tech_003',
        action: 'skip',
      });
    });
  });
});
