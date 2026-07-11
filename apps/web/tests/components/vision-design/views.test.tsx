// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import {
  BrandAssetsView,
  DesignProjectsView,
  DesignProjectSyncView,
  FigmaDashboardView,
  ImageSlicerView,
} from '../../../src/components/vision-design';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Vision Design views', () => {
  it('renders the brand catalogue without eagerly mounting the PDF preview', () => {
    render(<BrandAssetsView />);
    expect(screen.getByRole('heading', { name: '品牌资产库' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Logo 资产' })).toBeTruthy();
    expect(screen.queryByTitle(/PDF 预览/)).toBeNull();
  });

  it('does not derive an internal guideline URL from the public asset host', () => {
    render(<BrandAssetsView />);
    fireEvent.click(screen.getByRole('button', { name: '品牌规范' }));
    expect(screen.getByText('品牌规范未配置')).toBeTruthy();
    expect(screen.queryByTitle(/PDF 预览/)).toBeNull();
  });

  it('renders the local image slicer controls', () => {
    render(<ImageSlicerView />);
    expect(screen.getByRole('heading', { name: '图片切图工具' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '开始切图' })).toBeTruthy();
  });

  it('does not mount remote brand assets while the view is inactive', () => {
    const { container } = render(<BrandAssetsView active={false} />);
    expect(screen.getByRole('heading', { name: '品牌资产库' })).toBeTruthy();
    expect(container.querySelector('img[src^="https://"]')).toBeNull();
    expect(container.querySelector('iframe[src^="https://"]')).toBeNull();
  });

  it('does not fetch inactive project and Figma views', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(<DesignProjectsView active={false} />);
    expect(screen.getByRole('heading', { name: '设计项目看板' })).toBeTruthy();
    cleanup();
    render(<DesignProjectSyncView active={false} />);
    expect(screen.getByRole('heading', { name: '本地设计项目同步' })).toBeTruthy();
    cleanup();
    render(<FigmaDashboardView active={false} />);
    expect(screen.getByRole('heading', { name: 'Figma 项目 Dashboard' })).toBeTruthy();
    expect(screen.queryByTitle(/Figma 项目/)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('loads the active Figma iframe with the least-privilege embedding policy', async () => {
    render(<FigmaDashboardView active dashboardUrl="https://trusted.example/dashboard.html" />);
    const frame = await screen.findByTitle('Figma 项目 Page Map');
    expect(frame.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(frame.getAttribute('sandbox')).toBe(
      'allow-downloads allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts',
    );
    fireEvent.click(screen.getByRole('button', { name: '重新加载' }));
    await waitFor(() => {
      expect(screen.getByTitle('Figma 项目 Page Map')).not.toBe(frame);
    });
  });
});
