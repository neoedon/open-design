'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, FileClock, FolderTree, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@open-design/components';

import { VISION_DESIGN_FIGMA_DASHBOARD_URL } from './config';
import { computedTokenHex, mixHexColors, type FigmaDashboardViewMode } from './figma-dashboard';
import styles from './FigmaDashboardView.module.css';

export interface FigmaDashboardViewProps {
  active: boolean;
  dashboardUrl?: string;
}

function buildDashboardUrl(dashboardUrl: string, view: FigmaDashboardViewMode): string {
  const computed = getComputedStyle(document.documentElement);
  const surface = computedTokenHex(computed, '--bg-panel', '#FDFCFA');
  const accent = computedTokenHex(computed, '--accent', '#C96442');
  const params = new URLSearchParams({
    embed: 'platform',
    view,
    bg: computedTokenHex(computed, '--bg', '#FAF9F7'),
    surface,
    surfaceRaised: computedTokenHex(computed, '--bg-elevated', '#FFFEFC'),
    surfaceSoft: computedTokenHex(computed, '--bg-subtle', '#F4F5F7'),
    navActiveBg: mixHexColors(accent, surface, 0.12),
    border: computedTokenHex(computed, '--border', '#E1E5EB'),
    text: computedTokenHex(computed, '--text', '#1A1916'),
    textSecondary: computedTokenHex(computed, '--text-muted', '#74716B'),
    muted: computedTokenHex(computed, '--text-soft', '#989590'),
    accent,
    danger: computedTokenHex(computed, '--red', '#9C2A25'),
    uiFont: computed.getPropertyValue('--sans').trim(),
    codeFont: computed.getPropertyValue('--mono').trim(),
    uiSize: '13',
    codeSize: '12',
  });
  const url = new URL(dashboardUrl);
  for (const [key, value] of params) url.searchParams.set(key, value);
  return url.toString();
}

export function FigmaDashboardView({
  active,
  dashboardUrl = VISION_DESIGN_FIGMA_DASHBOARD_URL,
}: FigmaDashboardViewProps) {
  const [view, setView] = useState<FigmaDashboardViewMode>('map');
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!active || !dashboardUrl) {
      setSrc(null);
      setLoading(false);
      setError(active ? '未配置受信任的 Figma Dashboard 地址。' : null);
      return;
    }
    setLoading(true);
    setError(null);
    setSrc(buildDashboardUrl(dashboardUrl, view));
  }, [active, dashboardUrl, revision, view]);

  useEffect(() => {
    if (!active) return undefined;
    const observer = new MutationObserver(() => setRevision((value) => value + 1));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style'] });
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    const refreshForSystemTheme = () => setRevision((value) => value + 1);
    media?.addEventListener('change', refreshForSystemTheme);
    return () => {
      observer.disconnect();
      media?.removeEventListener('change', refreshForSystemTheme);
    };
  }, [active]);

  function chooseView(nextView: FigmaDashboardViewMode) {
    if (nextView === view) return;
    setView(nextView);
  }

  return (
    <section className={styles.root} aria-labelledby="figma-dashboard-title">
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Figma REST API · 嵌入工作台</span>
          <h1 id="figma-dashboard-title">Figma 项目 Dashboard</h1>
          <p>浏览项目、文件与 Page Map，或检查版本变更记录。仅配置并使用你信任的 Dashboard 地址。</p>
        </div>
        <div className={styles.actions}>
          <Button variant="ghost" disabled={!dashboardUrl} onClick={() => setRevision((value) => value + 1)}><RefreshCw aria-hidden="true" size={14} />重新加载</Button>
          <Button variant="ghost" disabled={!dashboardUrl} onClick={() => {
            if (dashboardUrl) window.open(buildDashboardUrl(dashboardUrl, view), '_blank', 'noopener,noreferrer');
          }}><ExternalLink aria-hidden="true" size={14} />在新窗口打开</Button>
        </div>
      </header>

      <nav className={styles.tabs} aria-label="Figma Dashboard 视图">
        <Button className={styles.tab} data-active={view === 'map'} variant="ghost" onClick={() => chooseView('map')}><FolderTree aria-hidden="true" size={15} />Page Map</Button>
        <Button className={styles.tab} data-active={view === 'changelog'} variant="ghost" onClick={() => chooseView('changelog')}><FileClock aria-hidden="true" size={15} />Changelog</Button>
      </nav>

      <div className={styles.frameShell}>
        {src ? (
          <iframe
            key={`${src}:${revision}`}
            className={styles.frame}
            src={src}
            title={`Figma 项目 ${view === 'map' ? 'Page Map' : 'Changelog'}`}
            referrerPolicy="no-referrer"
            sandbox="allow-downloads allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
            onError={() => { setLoading(false); setError('Figma Dashboard 加载失败，可尝试在新窗口打开。'); }}
            onLoad={() => setLoading(false)}
          />
        ) : null}
        {loading ? <div className={styles.overlay}><Loader2 aria-hidden="true" className={styles.spin} size={22} /><strong>正在加载 {view === 'map' ? 'Page Map' : 'Changelog'}…</strong></div> : null}
        {error ? <div className={styles.overlay} data-tone="error"><strong>{error}</strong>{dashboardUrl ? <Button variant="ghost" onClick={() => setRevision((value) => value + 1)}>重试</Button> : null}</div> : null}
        {!active ? <div className={styles.overlay}><FolderTree aria-hidden="true" size={22} /><strong>打开此导航后加载 Dashboard</strong></div> : null}
      </div>
    </section>
  );
}
