import type { Locale } from "@tworiver/shared";
import { type ChangeEvent, type FormEvent, useEffect, useMemo, useState } from "react";
import {
  deleteAdminResource,
  type AdminResource,
  type AdminResourceKind,
  fetchAdminResources,
  moveAdminResource,
  uploadAdminResource
} from "../api/admin";
import { resolveApiAssetUrl } from "../api/client";

interface AdminResourcesPageProps {
  locale: Locale;
}

type ResourceTypeFilter = "all" | "image" | "file";

const ALL_FOLDERS = "__all__";
const RESOURCE_TYPE_FILTERS: ResourceTypeFilter[] = ["all", "image", "file"];
const RESOURCE_ACCEPT = ".png,.jpg,.jpeg,.webp,.gif,.pdf,.txt,.md,.json,.woff,.woff2";

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) {
    return `${kilobytes.toFixed(kilobytes >= 10 ? 0 : 1)} KB`;
  }

  const megabytes = kilobytes / 1024;
  return `${megabytes.toFixed(megabytes >= 10 ? 1 : 2)} MB`;
}

function formatDate(value: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function isImageResource(resource: AdminResource): boolean {
  return resource.contentType.startsWith("image/");
}

function matchesType(resource: AdminResource, filter: ResourceTypeFilter): boolean {
  if (filter === "all") {
    return true;
  }

  return filter === "image" ? isImageResource(resource) : !isImageResource(resource);
}

function getTypeLabel(filter: ResourceTypeFilter, locale: Locale): string {
  const labels: Record<ResourceTypeFilter, { zh: string; en: string }> = {
    all: { zh: "全部资源", en: "All assets" },
    image: { zh: "图片", en: "Images" },
    file: { zh: "附件", en: "Files" }
  };

  return labels[filter][locale];
}

function getKindLabel(kind: AdminResourceKind, locale: Locale): string {
  const labels: Record<AdminResourceKind, { zh: string; en: string }> = {
    "post-image": { zh: "文章图片", en: "Post image" },
    "about-image": { zh: "关于页图片", en: "About image" },
    asset: { zh: "资源文件", en: "Resource file" }
  };

  return labels[kind][locale];
}

function getDirectoryLabel(resource: AdminResource, locale: Locale): string {
  if (resource.directory.startsWith("resources/")) {
    return resource.folder || (locale === "zh" ? "默认文件夹" : "General");
  }

  if (resource.kind === "post-image" && resource.postUid) {
    return locale === "zh" ? `文章 ${resource.postUid}` : `Post ${resource.postUid}`;
  }

  if (resource.kind === "about-image") {
    return locale === "zh" ? "关于页" : "About page";
  }

  return resource.directory || (locale === "zh" ? "根目录" : "Root");
}

function getEditableFolder(resource: AdminResource): string {
  return resource.directory.startsWith("resources/") ? resource.folder : resource.folder || resource.directory;
}

function getFileExtension(resource: AdminResource): string {
  return resource.filename.split(".").pop()?.toUpperCase() ?? "FILE";
}

export function AdminResourcesPage({ locale }: AdminResourcesPageProps) {
  const [resources, setResources] = useState<AdminResource[]>([]);
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<ResourceTypeFilter>("all");
  const [activeFolder, setActiveFolder] = useState(ALL_FOLDERS);
  const [search, setSearch] = useState("");
  const [uploadFolder, setUploadFolder] = useState("general");
  const [moveFolder, setMoveFolder] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setError(null);

    fetchAdminResources({ signal: controller.signal })
      .then(({ resources: nextResources }) => {
        setResources(nextResources);
        setSelectedUrl((current) => current ?? nextResources[0]?.url ?? null);
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) {
          setError(caught instanceof Error ? caught.message : "Failed to load resources");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, []);

  const folderOptions = useMemo(
    () => Array.from(new Set(resources.map((resource) => resource.directory).filter(Boolean))).sort(),
    [resources]
  );
  const imageCount = useMemo(() => resources.filter(isImageResource).length, [resources]);
  const fileCount = resources.length - imageCount;
  const filteredResources = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return resources.filter((resource) => {
      const matchesFolder = activeFolder === ALL_FOLDERS || resource.directory === activeFolder;
      const matchesSearch =
        keyword.length === 0 ||
        [resource.filename, resource.directory, resource.folder, resource.contentType, resource.url]
          .filter(Boolean)
          .some((value) => value.toLowerCase().includes(keyword));

      return matchesType(resource, typeFilter) && matchesFolder && matchesSearch;
    });
  }, [activeFolder, resources, search, typeFilter]);
  const selectedResource = filteredResources.find((resource) => resource.url === selectedUrl) ?? filteredResources[0] ?? null;
  const previewResource = previewUrl ? resources.find((resource) => resource.url === previewUrl) ?? null : null;
  const totalBytes = resources.reduce((sum, resource) => sum + resource.sizeBytes, 0);
  const visibleBytes = filteredResources.reduce((sum, resource) => sum + resource.sizeBytes, 0);

  useEffect(() => {
    setMoveFolder(selectedResource ? getEditableFolder(selectedResource) : "");
  }, [selectedResource?.directory, selectedResource?.folder, selectedResource?.url]);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setUploadFile(event.currentTarget.files?.[0] ?? null);
    setNotice(null);
    setError(null);
  }

  async function uploadResource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!uploadFile) {
      setError(locale === "zh" ? "请选择要上传的资源文件。" : "Choose a resource file to upload.");
      return;
    }

    setIsUploading(true);
    setError(null);
    setNotice(null);
    try {
      const { resource } = await uploadAdminResource({ file: uploadFile, folder: uploadFolder });
      setResources((currentResources) => [resource, ...currentResources.filter((item) => item.url !== resource.url)]);
      setSelectedUrl(resource.url);
      setActiveFolder(resource.directory);
      setTypeFilter(isImageResource(resource) ? "image" : "file");
      setUploadFile(null);
      setFileInputKey((current) => current + 1);
      setNotice(locale === "zh" ? "资源已上传。" : "Resource uploaded.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to upload resource");
    } finally {
      setIsUploading(false);
    }
  }

  async function moveResource(resource: AdminResource) {
    const nextFolder = moveFolder.trim();
    if (!nextFolder) {
      setError(locale === "zh" ? "请输入目标文件夹。" : "Enter a target folder.");
      return;
    }

    const confirmed = window.confirm(
      locale === "zh"
        ? `移动 ${resource.filename} 到 ${nextFolder}？移动后旧链接会失效。`
        : `Move ${resource.filename} to ${nextFolder}? The old URL will stop working.`
    );
    if (!confirmed) {
      return;
    }

    setIsMoving(true);
    setError(null);
    setNotice(null);
    try {
      const { resource: movedResource } = await moveAdminResource({ url: resource.url, folder: nextFolder });
      setCopiedUrl(null);
      setResources((currentResources) => [movedResource, ...currentResources.filter((item) => item.url !== resource.url)]);
      setSelectedUrl(movedResource.url);
      setActiveFolder(movedResource.directory);
      setTypeFilter(isImageResource(movedResource) ? "image" : "file");
      setNotice(locale === "zh" ? "资源已移动。" : "Resource moved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to move resource");
    } finally {
      setIsMoving(false);
    }
  }

  async function copyResourceUrl(url: string) {
    await navigator.clipboard?.writeText(url);
    setCopiedUrl(url);
    setNotice(locale === "zh" ? "链接已复制。" : "URL copied.");
  }

  async function deleteResource(resource: AdminResource) {
    const confirmed = window.confirm(
      locale === "zh"
        ? `确定删除 ${resource.filename}？删除后，已经插入文章的图片链接也会失效。`
        : `Delete ${resource.filename}? Links already inserted into posts will stop working.`
    );
    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    setError(null);
    setNotice(null);
    try {
      await deleteAdminResource(resource.url);
      setCopiedUrl(null);
      setPreviewUrl((current) => (current === resource.url ? null : current));
      setResources((currentResources) => {
        const nextResources = currentResources.filter((item) => item.url !== resource.url);
        setSelectedUrl((currentSelectedUrl) => {
          if (currentSelectedUrl && currentSelectedUrl !== resource.url) {
            return currentSelectedUrl;
          }
          return nextResources.find((item) => matchesType(item, typeFilter))?.url ?? nextResources[0]?.url ?? null;
        });
        return nextResources;
      });
      setNotice(locale === "zh" ? "资源已删除。" : "Resource deleted.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to delete resource");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <section className="admin-workspace admin-resources">
      <header className="admin-page-header">
        <div className="admin-page-title">
          <h1>{locale === "zh" ? "资源管理" : "Resource manager"}</h1>
          <p>
            {locale === "zh"
              ? "集中管理文章插图、关于页头像和附件资源，支持搜索、预览、移动、复制链接和删除。"
              : "Manage post images, about-page media, and file assets with search, preview, moving, URL copy, and deletion."}
          </p>
        </div>
      </header>

      <div className="resource-toolbar resource-toolbar--library" aria-label={locale === "zh" ? "资源筛选" : "Resource filters"}>
        <div className="resource-type-tabs" role="tablist" aria-label={locale === "zh" ? "资源类型" : "Resource type"}>
          {RESOURCE_TYPE_FILTERS.map((item) => (
            <button
              aria-selected={typeFilter === item}
              className={typeFilter === item ? "is-active" : undefined}
              role="tab"
              type="button"
              key={item}
              onClick={() => setTypeFilter(item)}
            >
              {getTypeLabel(item, locale)}
            </button>
          ))}
        </div>

        <label className="resource-search-field">
          <span aria-hidden="true">⌕</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            placeholder={locale === "zh" ? "搜索文件名、目录或类型" : "Search filename, folder, or type"}
          />
        </label>

        <label className="resource-folder-filter">
          <span>{locale === "zh" ? "文件夹" : "Folder"}</span>
          <select value={activeFolder} onChange={(event) => setActiveFolder(event.currentTarget.value)}>
            <option value={ALL_FOLDERS}>{locale === "zh" ? "全部文件夹" : "All folders"}</option>
            {folderOptions.map((directory) => (
              <option value={directory} key={directory}>
                {directory}
              </option>
            ))}
          </select>
        </label>

        <label className="resource-upload-shortcut" htmlFor="resource-upload-input">
          <span aria-hidden="true">↑</span>
          {locale === "zh" ? "上传资源" : "Upload"}
        </label>
      </div>

      <div className="resource-stats resource-stats--compact" aria-label={locale === "zh" ? "资源统计" : "Resource stats"}>
        <div>
          <span>{locale === "zh" ? "总数" : "Total"}</span>
          <strong>{resources.length}</strong>
        </div>
        <div>
          <span>{locale === "zh" ? "图片" : "Images"}</span>
          <strong>{imageCount}</strong>
        </div>
        <div>
          <span>{locale === "zh" ? "附件" : "Files"}</span>
          <strong>{fileCount}</strong>
        </div>
        <div>
          <span>{locale === "zh" ? "占用空间" : "Storage"}</span>
          <strong>{formatBytes(typeFilter === "all" && activeFolder === ALL_FOLDERS && !search ? totalBytes : visibleBytes)}</strong>
        </div>
      </div>

      <div className="admin-board admin-resources__board">
        <div className="admin-board__main">
          <form className="resource-upload-panel" onSubmit={uploadResource}>
            <div className="resource-upload-panel__heading">
              <h2>{locale === "zh" ? "上传到资源库" : "Upload to library"}</h2>
              <span>{uploadFile?.name ?? (locale === "zh" ? "未选择文件" : "No file selected")}</span>
            </div>
            <div className="resource-upload-grid">
              <input
                className="resource-file-input"
                id="resource-upload-input"
                key={fileInputKey}
                type="file"
                accept={RESOURCE_ACCEPT}
                onChange={handleFileChange}
              />
              <label className="resource-file-picker" htmlFor="resource-upload-input">
                <span>{locale === "zh" ? "选择文件" : "Choose file"}</span>
                <strong>{uploadFile?.name ?? (locale === "zh" ? "点击选择本地文件" : "Select a local file")}</strong>
              </label>
              <label>
                <span>{locale === "zh" ? "目标文件夹" : "Target folder"}</span>
                <input value={uploadFolder} onChange={(event) => setUploadFolder(event.currentTarget.value)} placeholder="general" />
              </label>
              <button className="primary-button" type="submit" disabled={isUploading}>
                {isUploading ? (locale === "zh" ? "上传中" : "Uploading") : locale === "zh" ? "上传" : "Upload"}
              </button>
            </div>
            {notice ? <p className="success-text">{notice}</p> : null}
          </form>

          <div className="admin-section-head">
            <h2>{getTypeLabel(typeFilter, locale)}</h2>
            <span>
              {filteredResources.length} {locale === "zh" ? "项" : "items"} · {formatBytes(visibleBytes)}
            </span>
          </div>

          <div className="resource-grid">
            {isLoading ? (
              <div className="admin-loading-list" role="status" aria-label={locale === "zh" ? "正在加载资源" : "Loading resources"}>
                <span />
                <span />
                <span />
              </div>
            ) : null}
            {!isLoading && !error && filteredResources.length === 0 ? (
              <div className="admin-table__message admin-table__empty">
                <strong>{locale === "zh" ? "没有找到资源" : "No resources found"}</strong>
                <span>{locale === "zh" ? "调整筛选条件，或上传新的资源文件。" : "Adjust filters or upload a new resource file."}</span>
              </div>
            ) : null}
            {error ? (
              <p className="error-text" role="alert">
                {error}
              </p>
            ) : null}
            {!isLoading && !error
              ? filteredResources.map((resource) => {
                  const isImage = isImageResource(resource);

                  return (
                    <article className={`resource-card${selectedResource?.url === resource.url ? " is-active" : ""}`} key={resource.url}>
                      <button className="resource-card__select" type="button" onClick={() => setSelectedUrl(resource.url)}>
                        <span className="resource-card__thumb">
                          {isImage ? (
                            <img src={resolveApiAssetUrl(resource.url)} alt="" loading="lazy" />
                          ) : (
                            <span>{getFileExtension(resource)}</span>
                          )}
                        </span>
                        <span className="resource-card__body">
                          <strong>{resource.filename}</strong>
                          <span>{getDirectoryLabel(resource, locale)}</span>
                          <small>
                            {getKindLabel(resource.kind, locale)} · {formatBytes(resource.sizeBytes)}
                          </small>
                        </span>
                      </button>
                      <div className="resource-card__overlay" aria-label={locale === "zh" ? "资源操作" : "Resource actions"}>
                        {isImage ? (
                          <button type="button" title={locale === "zh" ? "预览" : "Preview"} onClick={() => setPreviewUrl(resource.url)}>
                            ⛶
                          </button>
                        ) : null}
                        <button type="button" title={locale === "zh" ? "复制链接" : "Copy URL"} onClick={() => void copyResourceUrl(resource.url)}>
                          ⧉
                        </button>
                        <a href={resolveApiAssetUrl(resource.url)} title={locale === "zh" ? "打开" : "Open"} target="_blank" rel="noreferrer">
                          ↗
                        </a>
                        <button
                          type="button"
                          title={locale === "zh" ? "删除" : "Delete"}
                          disabled={isDeleting}
                          onClick={() => void deleteResource(resource)}
                        >
                          ×
                        </button>
                      </div>
                    </article>
                  );
                })
              : null}
          </div>
        </div>

        <aside className="admin-side-panel resource-detail">
          <div className="admin-side-panel__heading">
            <h2>{locale === "zh" ? "资源详情" : "Asset details"}</h2>
            <span>{selectedResource ? getKindLabel(selectedResource.kind, locale) : "--"}</span>
          </div>

          {selectedResource ? (
            <>
              {isImageResource(selectedResource) ? (
                <button className="resource-detail__preview" type="button" onClick={() => setPreviewUrl(selectedResource.url)}>
                  <img src={resolveApiAssetUrl(selectedResource.url)} alt={selectedResource.filename} />
                </button>
              ) : (
                <div className="resource-detail__preview">
                  <span>{selectedResource.filename}</span>
                </div>
              )}
              <dl className="resource-meta">
                <div>
                  <dt>{locale === "zh" ? "文件名" : "Filename"}</dt>
                  <dd>{selectedResource.filename}</dd>
                </div>
                <div>
                  <dt>{locale === "zh" ? "文件夹" : "Folder"}</dt>
                  <dd>{getDirectoryLabel(selectedResource, locale)}</dd>
                </div>
                <div>
                  <dt>{locale === "zh" ? "目录" : "Directory"}</dt>
                  <dd>{selectedResource.directory}</dd>
                </div>
                <div>
                  <dt>{locale === "zh" ? "大小" : "Size"}</dt>
                  <dd>{formatBytes(selectedResource.sizeBytes)}</dd>
                </div>
                <div>
                  <dt>{locale === "zh" ? "更新" : "Updated"}</dt>
                  <dd>{formatDate(selectedResource.updatedAt, locale)}</dd>
                </div>
                <div>
                  <dt>URL</dt>
                  <dd>{selectedResource.url}</dd>
                </div>
              </dl>
              <div className="resource-move-panel">
                <label>
                  <span>{locale === "zh" ? "移动到文件夹" : "Move to folder"}</span>
                  <input value={moveFolder} onChange={(event) => setMoveFolder(event.currentTarget.value)} />
                </label>
                <button className="secondary-button" type="button" disabled={isMoving} onClick={() => void moveResource(selectedResource)}>
                  {isMoving ? (locale === "zh" ? "移动中" : "Moving") : locale === "zh" ? "移动分类" : "Move"}
                </button>
              </div>
              <div className="resource-detail__actions">
                <button className="primary-button" type="button" onClick={() => void copyResourceUrl(selectedResource.url)}>
                  {copiedUrl === selectedResource.url ? (locale === "zh" ? "已复制" : "Copied") : locale === "zh" ? "复制链接" : "Copy URL"}
                </button>
                <a className="secondary-button" href={resolveApiAssetUrl(selectedResource.url)} target="_blank" rel="noreferrer">
                  {locale === "zh" ? "打开预览" : "Open preview"}
                </a>
                <button
                  className="secondary-button danger-button"
                  type="button"
                  disabled={isDeleting}
                  onClick={() => void deleteResource(selectedResource)}
                >
                  {isDeleting ? (locale === "zh" ? "正在删除" : "Deleting") : locale === "zh" ? "删除资源" : "Delete"}
                </button>
              </div>
            </>
          ) : (
            <p className="muted">{locale === "zh" ? "选择一个资源查看详情。" : "Select a resource to inspect it."}</p>
          )}
        </aside>
      </div>

      {previewResource && isImageResource(previewResource) ? (
        <div className="resource-preview-backdrop" role="dialog" aria-modal="true" aria-label={previewResource.filename}>
          <div className="resource-preview-dialog">
            <header>
              <div>
                <h2>{previewResource.filename}</h2>
                <span>{getDirectoryLabel(previewResource, locale)}</span>
              </div>
              <button type="button" aria-label={locale === "zh" ? "关闭预览" : "Close preview"} onClick={() => setPreviewUrl(null)}>
                ×
              </button>
            </header>
            <img src={resolveApiAssetUrl(previewResource.url)} alt={previewResource.filename} />
          </div>
        </div>
      ) : null}
    </section>
  );
}
