// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EntryNavRail } from '../../src/components/EntryNavRail';

const labels: Record<string, string> = {
  'app.brand': 'viaim Design',
  'entry.navCollapse': 'Collapse sidebar',
  'entry.navNewProject': 'New project',
  'entry.navHome': 'Home',
  'entry.navProjects': 'Projects',
  'entry.navTasks': 'Automations',
  'entry.navPlugins': 'Plugins',
  'entry.navDesignSystems': 'Design systems',
  'entry.navBrandAssets': 'Brand assets',
  'entry.navImageSlicer': 'Image slicer',
  'entry.navDesignProjects': 'Design projects',
  'entry.navDesignProjectSync': 'Project sync',
  'entry.navFigmaDashboard': 'Figma dashboard',
  'entry.navIntegrations': 'Integrations',
};

vi.mock('../../src/i18n', () => ({
  useT: () => (key: string) => labels[key] ?? key,
}));

afterEach(() => cleanup());

describe('EntryNavRail Vision Design destinations', () => {
  it('renders the five destinations in order and routes a selection', () => {
    const onViewChange = vi.fn();
    const { container } = render(
      <EntryNavRail
        view="design-projects"
        onViewChange={onViewChange}
        onNewProject={vi.fn()}
        open
        onClose={vi.fn()}
      />,
    );

    const group = container.querySelector('.entry-nav-rail__group');
    expect(group).not.toBeNull();
    const testIds = within(group as HTMLElement)
      .getAllByRole('button')
      .map((button) => button.getAttribute('data-testid'));

    expect(testIds).toEqual([
      'entry-nav-logo',
      'entry-nav-collapse',
      'entry-nav-new-project',
      'entry-nav-home',
      'entry-nav-projects',
      'entry-nav-design-systems',
      'entry-nav-brand-assets',
      'entry-nav-image-slicer',
      'entry-nav-design-projects',
      'entry-nav-design-project-sync',
      'entry-nav-figma-dashboard',
      'entry-nav-tasks',
      'entry-nav-plugins',
      'entry-nav-integrations',
    ]);

    expect(screen.getByTestId('entry-nav-design-projects')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('entry-nav-figma-dashboard')).toHaveAttribute('title', 'Figma dashboard');
    expect(screen.getByTestId('entry-nav-figma-dashboard')).toHaveAttribute('data-tooltip', 'Figma dashboard');
    expect(screen.queryByRole('button', { name: 'Help' })).toBeNull();

    fireEvent.click(screen.getByTestId('entry-nav-figma-dashboard'));
    expect(onViewChange).toHaveBeenCalledWith('figma-dashboard');
  });

  it('keeps the collapsed rail outside the interaction tree', () => {
    render(
      <EntryNavRail
        view="home"
        onViewChange={vi.fn()}
        onNewProject={vi.fn()}
        open={false}
        onClose={vi.fn()}
      />,
    );

    const rail = screen.getByRole('navigation', { hidden: true });
    expect(rail).toHaveAttribute('aria-hidden', 'true');
    expect(rail).toHaveAttribute('inert');
  });
});
