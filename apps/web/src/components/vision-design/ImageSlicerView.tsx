'use client';

import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { Download, FileArchive, ImagePlus, Loader2, Scissors, Trash2 } from 'lucide-react';
import { Button, Input } from '@open-design/components';

import { buildZip } from '../../runtime/zip';
import {
  calculateSlicePlan,
  DEFAULT_SLICE_SIZE,
  MAX_IMAGE_FILES,
  MAX_IMAGE_FILE_SIZE,
  type SlicePlan,
} from './image-slicer';
import styles from './ImageSlicerView.module.css';

interface GeneratedSlice {
  name: string;
  blob: Blob;
  previewUrl: string;
  width: number;
  height: number;
}

interface SliceResult {
  fileName: string;
  plan: SlicePlan;
  slices: GeneratedSlice[];
}

interface LoadedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  close?: () => void;
}

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || /\.(avif|bmp|gif|jpe?g|png|tiff?|webp)$/i.test(file.name);
}

function outputFormat(file: File): { extension: string; mime: string } {
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith('.png')) return { extension: 'png', mime: 'image/png' };
  if (lowerName.endsWith('.webp')) return { extension: 'webp', mime: 'image/webp' };
  return { extension: 'jpeg', mime: 'image/jpeg' };
}

async function loadImage(file: File, registerUrl: (url: string) => void): Promise<LoadedImage> {
  if ('createImageBitmap' in window) {
    const bitmap = await createImageBitmap(file);
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close(),
    };
  }

  const url = URL.createObjectURL(file);
  registerUrl(url);
  const image = new Image();
  image.decoding = 'async';
  image.src = url;
  await image.decode();
  return { source: image, width: image.naturalWidth, height: image.naturalHeight };
}

function canvasBlob(canvas: HTMLCanvasElement, mime: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('切片生成失败。'));
    }, mime);
  });
}

function triggerBlobDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function zipSlices(slices: GeneratedSlice[]): Promise<Blob> {
  const entries = await Promise.all(
    slices.map(async (slice) => ({
      path: slice.name,
      content: new Uint8Array(await slice.blob.arrayBuffer()),
    })),
  );
  return buildZip(entries);
}

function parseOptionalWidth(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error('目标宽度必须是大于 0 的整数。');
  return parsed;
}

function formatBytes(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MiB`;
}

export function ImageSlicerView() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const objectUrlsRef = useRef<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [targetWidth, setTargetWidth] = useState('');
  const [maxWidth, setMaxWidth] = useState(String(DEFAULT_SLICE_SIZE));
  const [maxHeight, setMaxHeight] = useState(String(DEFAULT_SLICE_SIZE));
  const [results, setResults] = useState<SliceResult[]>([]);
  const [status, setStatus] = useState('等待图片');
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [dragging, setDragging] = useState(false);

  const allSlices = useMemo(() => results.flatMap((result) => result.slices), [results]);

  function registerUrl(url: string) {
    objectUrlsRef.current.push(url);
  }

  function clearObjectUrls() {
    objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrlsRef.current = [];
  }

  useEffect(() => () => clearObjectUrls(), []);

  function replaceFiles(nextFiles: File[]) {
    if (processing) return;
    const images = nextFiles.filter(isImageFile);
    const withinSize = images.filter((file) => file.size <= MAX_IMAGE_FILE_SIZE);

    if (!images.length) {
      setError('请选择图片文件。');
      return;
    }
    if (!withinSize.length) {
      setError(`单张图片不能超过 ${formatBytes(MAX_IMAGE_FILE_SIZE)}。`);
      return;
    }

    clearObjectUrls();
    setResults([]);
    setError(null);
    setFiles(withinSize.slice(0, MAX_IMAGE_FILES));

    if (withinSize.length > MAX_IMAGE_FILES) setStatus(`已保留前 ${MAX_IMAGE_FILES} 张图片。`);
    else if (withinSize.length < images.length) setStatus('已忽略超过大小限制的图片。');
    else if (images.length < nextFiles.length) setStatus('已忽略非图片文件。');
    else setStatus(`已选择 ${withinSize.length} 张图片。`);
  }

  function clearAll() {
    clearObjectUrls();
    setFiles([]);
    setResults([]);
    setError(null);
    setStatus('已清空');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function processFile(
    file: File,
    target: number | null,
    sliceWidth: number,
    sliceHeight: number,
  ): Promise<SliceResult> {
    const loaded = await loadImage(file, registerUrl);
    const plan = calculateSlicePlan(loaded.width, loaded.height, {
      targetWidth: target,
      maxSliceWidth: sliceWidth,
      maxSliceHeight: sliceHeight,
    });
    const { extension, mime } = outputFormat(file);
    const baseName = file.name.replace(/\.[^.]+$/, '');
    const outputName = plan.resized ? `${baseName}_w${plan.outputWidth}` : baseName;
    const slices: GeneratedSlice[] = [];

    try {
      for (const item of plan.slices) {
        const canvas = document.createElement('canvas');
        canvas.width = item.width;
        canvas.height = item.height;
        const context = canvas.getContext('2d', { alpha: mime !== 'image/jpeg' });
        if (!context) throw new Error('Canvas 初始化失败。');
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        context.drawImage(
          loaded.source,
          (item.left * loaded.width) / plan.outputWidth,
          (item.top * loaded.height) / plan.outputHeight,
          (item.width * loaded.width) / plan.outputWidth,
          (item.height * loaded.height) / plan.outputHeight,
          0,
          0,
          item.width,
          item.height,
        );
        const blob = await canvasBlob(canvas, mime);
        const previewUrl = URL.createObjectURL(blob);
        registerUrl(previewUrl);
        const row = String(item.row + 1).padStart(2, '0');
        const column = String(item.column + 1).padStart(2, '0');
        slices.push({
          name: `${outputName}_r${row}-c${column}.${extension}`,
          blob,
          previewUrl,
          width: item.width,
          height: item.height,
        });
      }
      return { fileName: file.name, plan, slices };
    } finally {
      loaded.close?.();
    }
  }

  async function runSlice() {
    if (!files.length) {
      setError('请先选择图片。');
      return;
    }

    setProcessing(true);
    setError(null);
    clearObjectUrls();
    setResults([]);
    try {
      const target = parseOptionalWidth(targetWidth);
      const sliceWidth = Number(maxWidth);
      const sliceHeight = Number(maxHeight);
      const nextResults: SliceResult[] = [];
      for (let index = 0; index < files.length; index += 1) {
        setStatus(`处理中 ${index + 1}/${files.length}…`);
        const result = await processFile(files[index]!, target, sliceWidth, sliceHeight);
        nextResults.push(result);
        setResults([...nextResults]);
      }
      const total = nextResults.reduce((sum, result) => sum + result.slices.length, 0);
      setStatus(`完成，共生成 ${total} 张切片。`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '图片处理失败。');
      setStatus('处理失败');
    } finally {
      setProcessing(false);
    }
  }

  async function downloadSlices(slices: GeneratedSlice[], fileName: string) {
    try {
      setError(null);
      setStatus('正在生成 ZIP…');
      const blob = await zipSlices(slices);
      triggerBlobDownload(blob, fileName);
      setStatus(`${fileName} 已开始下载。`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'ZIP 生成失败。');
    }
  }

  function onDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragging(false);
    replaceFiles(Array.from(event.dataTransfer.files));
  }

  return (
    <section className={styles.root} aria-labelledby="image-slicer-title">
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>本地图片工具</span>
          <h1 id="image-slicer-title">图片切图工具</h1>
          <p>先按目标宽度等比缩放，再按最大宽高切片。图片只在当前浏览器中处理。</p>
        </div>
        <div className={styles.stats}>
          <span><strong>{files.length}</strong>图片</span>
          <span><strong>{allSlices.length}</strong>切片</span>
        </div>
      </header>

      <section
        className={styles.controlPanel}
        data-dragging={dragging}
        onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={(event) => {
          if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDragging(false);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={onDrop}
      >
        <div className={styles.fieldGrid}>
          <label>
            <span>目标宽度</span>
            <Input min="1" placeholder="保持原图" step="1" type="number" value={targetWidth} onChange={(event) => setTargetWidth(event.target.value)} />
          </label>
          <label>
            <span>切片最大宽度</span>
            <Input min="1" step="1" type="number" value={maxWidth} onChange={(event) => setMaxWidth(event.target.value)} />
          </label>
          <label>
            <span>切片最大高度</span>
            <Input min="1" step="1" type="number" value={maxHeight} onChange={(event) => setMaxHeight(event.target.value)} />
          </label>
        </div>

        <div className={styles.dropRow}>
          <div className={styles.dropCopy}>
            <ImagePlus aria-hidden="true" size={20} />
            <div>
              <strong>{files.length ? `${files.length} 张图片已选择` : '选择或拖入图片'}</strong>
              <span>最多 {MAX_IMAGE_FILES} 张，单张最大 {formatBytes(MAX_IMAGE_FILE_SIZE)}</span>
            </div>
          </div>
          <Button
            variant="ghost"
            disabled={processing}
            onClick={() => {
              if (!fileInputRef.current) return;
              fileInputRef.current.value = '';
              fileInputRef.current.click();
            }}
          >
            <ImagePlus aria-hidden="true" size={15} />
            选择图片
          </Button>
          <input
            ref={fileInputRef}
            className={styles.fileInput}
            accept="image/*"
            multiple
            type="file"
            onChange={(event) => replaceFiles(Array.from(event.currentTarget.files ?? []))}
          />
        </div>

        {files.length ? (
          <div className={styles.fileList}>
            {files.map((file) => <span key={`${file.name}:${file.size}`}>{file.name}<small>{formatBytes(file.size)}</small></span>)}
          </div>
        ) : null}

        <div className={styles.actions}>
          <Button variant="primary" disabled={processing} onClick={() => void runSlice()}>
            {processing ? <Loader2 aria-hidden="true" className={styles.spin} size={15} /> : <Scissors aria-hidden="true" size={15} />}
            {processing ? '处理中' : '开始切图'}
          </Button>
          <Button variant="ghost" disabled={!allSlices.length || processing} onClick={() => void downloadSlices(allSlices, 'image-slices.zip')}>
            <FileArchive aria-hidden="true" size={15} />
            下载全部 ZIP
          </Button>
          <Button variant="ghost" disabled={processing} onClick={clearAll}>
            <Trash2 aria-hidden="true" size={15} />
            清空
          </Button>
        </div>
      </section>

      <div className={styles.status} data-error={Boolean(error)} role="status">
        <span>{error ?? status}</span>
        <small>{maxWidth || '—'} × {maxHeight || '—'} px</small>
      </div>

      {results.length ? (
        <div className={styles.results}>
          {results.map((result) => (
            <article className={styles.resultCard} key={result.fileName}>
              <header>
                <div>
                  <h2>{result.fileName}</h2>
                  <p>
                    {result.plan.sourceWidth} × {result.plan.sourceHeight}
                    {result.plan.resized ? ` → ${result.plan.outputWidth} × ${result.plan.outputHeight}` : ''}
                    {' · '}{result.plan.columns} 列 × {result.plan.rows} 行 · {result.slices.length} 张
                  </p>
                </div>
                <Button variant="ghost" onClick={() => void downloadSlices(result.slices, `${result.fileName}-slices.zip`)}>
                  <Download aria-hidden="true" size={14} />
                  下载 ZIP
                </Button>
              </header>
              <div className={styles.previewGrid}>
                {result.slices.map((slice) => (
                  <figure key={slice.name}>
                    <img alt={`${slice.name} 预览`} loading="lazy" src={slice.previewUrl} />
                    <figcaption><span>{slice.name}</span><small>{slice.width} × {slice.height}</small></figcaption>
                  </figure>
                ))}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className={styles.empty}>
          <ImagePlus aria-hidden="true" size={24} />
          <strong>尚未生成切片</strong>
          <span>选择图片并设置参数后，预览会显示在这里。</span>
        </div>
      )}
    </section>
  );
}
