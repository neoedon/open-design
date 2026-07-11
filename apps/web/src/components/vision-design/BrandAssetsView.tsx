'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Download,
  ExternalLink,
  FileText,
  Grid2X2,
  Image as ImageIcon,
  Loader2,
  Type,
} from 'lucide-react';
import { Button, Select, Textarea } from '@open-design/components';

import { downloadRemoteAsset, openExternalUrl, RemoteDownloadError } from './download';
import { visionDesignAssetUrl } from './config';
import styles from './BrandAssetsView.module.css';

type BrandTab = 'guidelines' | 'logos' | 'fonts';
type LogoCategoryId = 'single' | 'combined' | 'app';
type DownloadFormat = 'SVG' | 'PNG' | 'PDF' | 'OTF';

interface AssetFormat {
  format: DownloadFormat;
  fileName: string;
  url: string;
}

export interface BrandLogoAsset {
  id: string;
  title: string;
  note: string;
  previewUrl: string;
  formats: AssetFormat[];
}

export interface BrandLogoCategory {
  id: LogoCategoryId;
  label: string;
  description: string;
  assets: BrandLogoAsset[];
}

export interface MiSansFontAsset {
  id: string;
  label: string;
  weight: number;
  fileName: string;
  url: string;
}

const GUIDELINE_FILE_NAME = 'viaim-visual-guidelines-260309-internal-draft.pdf';
const GUIDELINE_URL = visionDesignAssetUrl(`brand-assets/${GUIDELINE_FILE_NAME}`);

function formatAsset(folder: string, baseName: string, format: DownloadFormat): AssetFormat {
  const extension = format.toLowerCase();
  const fileName = `${baseName}.${extension}`;
  return {
    format,
    fileName,
    url: visionDesignAssetUrl(`${folder}/${fileName}`),
  };
}

function logoAsset(
  folder: string,
  baseName: string,
  note: string,
  formats: DownloadFormat[],
  previewFormat: DownloadFormat = formats[0]!,
): BrandLogoAsset {
  return {
    id: `${folder}/${baseName}`,
    title: baseName,
    note,
    previewUrl: formatAsset(folder, baseName, previewFormat).url,
    formats: formats.map((format) => formatAsset(folder, baseName, format)),
  };
}

const singleLogos = ['viaim logo BrandColor', 'viaim logo onLight', 'viaim logo onDark'].map(
  (baseName) =>
    logoAsset(
      'brand-assets/logos',
      baseName,
      baseName.endsWith('onDark') ? '深色背景变体' : '标准品牌 Logo',
      ['SVG', 'PNG', 'PDF'],
    ),
);

const combinedBaseNames = [
  ...Array.from({ length: 8 }, (_, index) => `组合 logo+slogan ${String(index + 1).padStart(2, '0')}`),
  ...['viaim+xunfei', ...Array.from({ length: 7 }, (_, index) => `viaim+xunfei-${index + 1}`)],
  ...['viaim+weilai', ...Array.from({ length: 7 }, (_, index) => `viaim+weilai-${index + 1}`)],
];

const combinedLogos = combinedBaseNames.map((baseName) =>
  logoAsset(
    'brand-assets/logos/combined',
    baseName,
    baseName.includes('slogan') ? 'Logo + slogan 组合' : '联合品牌组合',
    ['SVG', 'PNG'],
  ),
);

const appLogos = [
  logoAsset('brand-assets/logos/app', 'App Icon', 'viaim App 图标源文件', ['PNG'], 'PNG'),
  logoAsset('brand-assets/logos/app', 'icon', 'App icon 源文件', ['PNG'], 'PNG'),
];

export const BRAND_LOGO_CATEGORIES: BrandLogoCategory[] = [
  {
    id: 'single',
    label: '单 Logo',
    description: '品牌色、浅色与深色背景变体。',
    assets: singleLogos,
  },
  {
    id: 'combined',
    label: '组合 Logo',
    description: 'Logo + slogan，以及 viaim 与合作品牌的组合标识。',
    assets: combinedLogos,
  },
  {
    id: 'app',
    label: 'App Logo',
    description: '用于应用图标与产品入口的 PNG 源文件。',
    assets: appLogos,
  },
];

const fontWeights = [
  ['Thin', 100],
  ['ExtraLight', 200],
  ['Light', 300],
  ['Normal', 350],
  ['Regular', 400],
  ['Medium', 500],
  ['Demibold', 600],
  ['Semibold', 650],
  ['Bold', 700],
  ['Heavy', 900],
] as const;

export const MISANS_FONTS: MiSansFontAsset[] = fontWeights.map(([label, weight]) => {
  const fileName = `MiSans-${label}.otf`;
  return {
    id: label.toLowerCase(),
    label: `MiSans ${label}`,
    weight,
    fileName,
    url: visionDesignAssetUrl(`brand-assets/fonts/misans/${fileName}`),
  };
});

const tabItems: Array<{ id: BrandTab; label: string; icon: typeof BookOpen }> = [
  { id: 'guidelines', label: '品牌规范', icon: BookOpen },
  { id: 'logos', label: 'Logo', icon: Grid2X2 },
  { id: 'fonts', label: 'MiSans', icon: Type },
];

interface DownloadNotice {
  message: string;
  sourceUrl?: string;
  tone: 'error' | 'success';
}

export function BrandAssetsView() {
  const [activeTab, setActiveTab] = useState<BrandTab>('logos');
  const [logoCategory, setLogoCategory] = useState<LogoCategoryId>('single');
  const [selectedFontId, setSelectedFontId] = useState('regular');
  const [previewText, setPreviewText] = useState(
    'viaim 品牌资产 / We Aim to Explore. / 让灵感、记录和知识更自然地流动。',
  );
  const [fontReady, setFontReady] = useState(false);
  const [busyDownload, setBusyDownload] = useState<string | null>(null);
  const [notice, setNotice] = useState<DownloadNotice | null>(null);

  const category =
    BRAND_LOGO_CATEGORIES.find((item) => item.id === logoCategory) ?? BRAND_LOGO_CATEGORIES[0]!;
  const selectedFont =
    MISANS_FONTS.find((font) => font.id === selectedFontId) ?? MISANS_FONTS[4]!;
  const previewFamily = useMemo(() => `VisionMiSans-${selectedFont.id}`, [selectedFont.id]);

  useEffect(() => {
    let cancelled = false;
    let activeFace: FontFace | null = null;
    setFontReady(false);
    if (activeTab !== 'fonts') return undefined;
    if (typeof window === 'undefined' || !('FontFace' in window)) return undefined;

    const face = new FontFace(previewFamily, `url("${selectedFont.url}")`, {
      style: 'normal',
      weight: String(selectedFont.weight),
    });
    void face
      .load()
      .then((resolvedFace) => {
        if (cancelled) {
          document.fonts.delete(resolvedFace);
          return;
        }
        document.fonts.add(resolvedFace);
        activeFace = resolvedFace;
        setFontReady(true);
      })
      .catch(() => {
        if (!cancelled) setFontReady(false);
      });

    return () => {
      cancelled = true;
      if (activeFace) document.fonts.delete(activeFace);
    };
  }, [activeTab, previewFamily, selectedFont.url, selectedFont.weight]);

  async function download(url: string, fileName: string) {
    const key = `${url}:${fileName}`;
    setBusyDownload(key);
    setNotice(null);
    try {
      await downloadRemoteAsset(url, fileName);
      setNotice({ message: `${fileName} 已开始下载。`, tone: 'success' });
    } catch (error) {
      const sourceUrl = error instanceof RemoteDownloadError ? error.sourceUrl : url;
      setNotice({
        message: error instanceof Error ? error.message : '资源下载失败。',
        sourceUrl,
        tone: 'error',
      });
    } finally {
      setBusyDownload(null);
    }
  }

  function downloadButton(format: AssetFormat) {
    const key = `${format.url}:${format.fileName}`;
    const pending = busyDownload === key;
    return (
      <Button
        className={styles.downloadButton}
        disabled={pending}
        key={format.fileName}
        variant="ghost"
        onClick={() => void download(format.url, format.fileName)}
      >
        {pending ? <Loader2 aria-hidden="true" className={styles.spin} size={14} /> : <Download aria-hidden="true" size={14} />}
        {format.format}
      </Button>
    );
  }

  return (
    <section className={styles.root} aria-labelledby="brand-assets-title">
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>资产中心</span>
          <h1 id="brand-assets-title">品牌资产库</h1>
          <p>集中预览品牌规范、Logo 与 MiSans 字体包，并下载原始文件。</p>
        </div>
        <span className={styles.remoteBadge}>远程资产 · 按需下载</span>
      </header>

      <nav className={styles.tabs} aria-label="品牌资产分类">
        {tabItems.map((item) => {
          const Icon = item.icon;
          return (
            <Button
              className={styles.tab}
              data-active={activeTab === item.id}
              key={item.id}
              variant="ghost"
              onClick={() => setActiveTab(item.id)}
            >
              <Icon aria-hidden="true" size={15} />
              {item.label}
            </Button>
          );
        })}
      </nav>

      {notice ? (
        <div className={styles.notice} data-tone={notice.tone} role="status">
          <span>{notice.message}</span>
          {notice.sourceUrl ? (
            <a href={notice.sourceUrl} rel="noreferrer" target="_blank">打开原始链接</a>
          ) : null}
        </div>
      ) : null}

      {activeTab === 'guidelines' ? (
        <div className={styles.guidelineGrid}>
          <article className={styles.infoCard}>
            <span className={styles.cardIcon}><FileText aria-hidden="true" size={19} /></span>
            <div>
              <span className={styles.eyebrow}>PDF · 260309 Internal Draft</span>
              <h2>viaim 品牌视觉规范</h2>
              <p>在线查阅当前品牌视觉规范，或下载 PDF 保留本地副本。</p>
            </div>
            <div className={styles.actions}>
              {downloadButton({ format: 'PDF', fileName: GUIDELINE_FILE_NAME, url: GUIDELINE_URL })}
              <Button variant="ghost" onClick={() => openExternalUrl(GUIDELINE_URL)}>
                <ExternalLink aria-hidden="true" size={14} />
                新窗口预览
              </Button>
            </div>
          </article>
          <div className={styles.pdfPanel}>
            <iframe src={GUIDELINE_URL} title="viaim 品牌视觉规范 PDF 预览" />
          </div>
        </div>
      ) : null}

      {activeTab === 'logos' ? (
        <div className={styles.logoSection}>
          <div className={styles.categoryBar}>
            <div>
              <h2>Logo 资产</h2>
              <p>{category.description}</p>
            </div>
            <div className={styles.categoryButtons}>
              {BRAND_LOGO_CATEGORIES.map((item) => (
                <Button
                  className={styles.categoryButton}
                  data-active={item.id === category.id}
                  key={item.id}
                  variant="ghost"
                  onClick={() => setLogoCategory(item.id)}
                >
                  {item.label}
                  <span>{item.assets.length}</span>
                </Button>
              ))}
            </div>
          </div>
          <div className={styles.logoGrid}>
            {category.assets.map((asset) => (
              <article className={styles.logoCard} key={asset.id}>
                <div className={styles.logoPreview}>
                  <img alt={asset.title} loading="lazy" src={asset.previewUrl} />
                </div>
                <div className={styles.logoCopy}>
                  <ImageIcon aria-hidden="true" size={15} />
                  <div>
                    <h3>{asset.title}</h3>
                    <p>{asset.note}</p>
                  </div>
                </div>
                <div className={styles.formatRow}>{asset.formats.map(downloadButton)}</div>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {activeTab === 'fonts' ? (
        <div className={styles.fontGrid}>
          <aside className={styles.fontControls}>
            <div>
              <span className={styles.eyebrow}>10 个字重</span>
              <h2>MiSans OTF</h2>
              <p>选择字重、输入文本并查看真实字体效果。</p>
            </div>
            <label>
              <span>字重</span>
              <Select value={selectedFont.id} onChange={(event) => setSelectedFontId(event.target.value)}>
                {MISANS_FONTS.map((font) => (
                  <option key={font.id} value={font.id}>{font.label} · {font.weight}</option>
                ))}
              </Select>
            </label>
            <label>
              <span>预览文本</span>
              <Textarea rows={5} value={previewText} onChange={(event) => setPreviewText(event.target.value)} />
            </label>
            {downloadButton({ format: 'OTF', fileName: selectedFont.fileName, url: selectedFont.url })}
          </aside>
          <article className={styles.fontPreview}>
            <header>
              <span>{selectedFont.label}</span>
              <small>{fontReady ? '字体已加载' : '正在加载或使用系统字体'}</small>
            </header>
            <p style={{ fontFamily: `"${previewFamily}", var(--sans)`, fontWeight: selectedFont.weight }}>
              {previewText.trim() || 'viaim'}
            </p>
            <div className={styles.fontMeta}>
              <span>{selectedFont.fileName}</span>
              <span>weight {selectedFont.weight}</span>
            </div>
          </article>
        </div>
      ) : null}
    </section>
  );
}
