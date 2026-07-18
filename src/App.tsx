import { FormEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Bell,
  BellOff,
  BellRing,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Circle,
  Check,
  Edit3,
  ExternalLink,
  FileText,
  Inbox,
  Lightbulb,
  Link as LinkIcon,
  ListFilter,
  Loader2,
  MessageSquare,
  Paperclip,
  Plus,
  RefreshCw,
  Reply,
  RotateCcw,
  Save,
  Search,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import helpIconUrl from './assets/qortium-help-protoicon-black-transparent.png';
import { AttachmentList } from './attachments';
import {
  formatAttachmentSize,
  MAX_ATTACHMENT_COUNT,
  prepareFeedbackAttachment,
  prepareFeedbackBundle,
  publishPreparedFeedbackBundle,
  type PreparedFeedbackAttachment,
} from './attachmentUpload';
import { Avatar } from './Avatar';
import {
  APP_FILTER_ALL,
  buildAppFilterOptions,
  filterPostsByApp,
  type AppFilterOption,
  type AppFilterValue,
} from './appFilters';
import { createTranslator } from './i18n';
import { copyTextToClipboard } from './clipboard';
import {
  buildPostLink,
  getInitialAppFilter,
  getInitialComposerParams,
  getInitialDeveloperReferenceRequested,
  getInitialFeedFilter,
  getInitialNewPostRequested,
  getInitialPostId,
  type InitialFeedFilter,
} from './deepLink';
import { applyDisplaySettings, getDisplaySettingsUpdateFromMessage, getInitialDisplaySettings } from './displaySettings';
import { openAppLinkInHomeTab, renderFeedbackText } from './feedbackLinks';
import { getBridgeState, hasAction } from './qdnRequest';
import {
  buildCommentIdentifier,
  buildPostIdentifier,
  canOwnResource,
  createCommentPayload,
  createFeedbackId,
  createPostPayload,
  deleteFeedbackResource,
  FEEDBACK_COMMENT_PAGE_SIZE,
  FEEDBACK_POST_PAGE_SIZE,
  isFeedbackResourceEdited,
  loadAccountContext,
  loadFeedbackCommentCounts,
  loadFeedbackCommentsPage,
  loadFeedbackCommentsForPost,
  loadFeedbackPostById,
  loadFeedbackPostsPage,
  loadPublishedAppNames,
  publishFeedbackPayload,
  setPostStatusPayload,
  unlockSelectedAccount,
  updateCommentPayload,
  updatePostPayload,
  type AccountContext,
  type FeedbackCommentCounts,
  type FeedbackCommentPayload,
  type FeedbackDraftIdentity,
  type FeedbackKind,
  type FeedbackPostPayload,
  type FeedbackResource,
} from './qdnFeedback';
import { waitForFeedbackResourceReady, waitForPublishedResourcesReady } from './publishStatus';
import {
  canManageHelpNotifications,
  followHelpPost,
  getHelpNotificationState,
  hasHelpNotificationCapacity,
  HELP_NOTIFICATION_RULE_LIMIT,
  reconcileHelpNotifications,
  unfollowHelpPost,
  type HelpNotificationRule,
  type HelpNotificationState,
} from './notifications';
import Reference from './Reference';
import type { BridgeState, QdnAction } from './types';

type LoadState = 'error' | 'loading' | 'ready';
type FeedFilter = InitialFeedFilter;
type SortOrder = 'active' | 'newest';
const SORT_ORDERS: SortOrder[] = ['active', 'newest'];
type MainView = 'compose' | 'detail' | 'list' | 'reference';
type WritePhase =
  | 'confirming'
  | 'confirming-attachments'
  | 'idle'
  | 'pending'
  | 'preparing'
  | 'published'
  | 'submitting';

type FeedbackData = {
  comments: FeedbackResource<FeedbackCommentPayload>[];
  posts: FeedbackResource<FeedbackPostPayload>[];
};

const emptyData: FeedbackData = {
  comments: [],
  posts: [],
};

const emptyBridgeState: BridgeState = {
  actions: [],
  isHomeBridge: false,
  ui: 'BROWSER_DEV',
};

const FILTERS: FeedFilter[] = ['all', 'open', 'completed', 'issue', 'idea', 'orphan'];
const APP_VERSION = __APP_VERSION__;

function createDraftIdentity(): FeedbackDraftIdentity {
  return {
    createdAt: Date.now(),
    id: createFeedbackId(),
  };
}

// qortium-core and qortium-home aren't published QDN APP resources, so they never
// come back from the resource search — seed them into the app dropdown explicitly.
const EXTRA_APP_NAMES = ['qortium-core', 'qortium-home'];

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function getDisplayName(name: string) {
  return name || 'QDN';
}

function formatRelativeTime(timestamp: number, now = Date.now()) {
  const deltaSeconds = Math.max(0, Math.floor((now - timestamp) / 1000));

  if (deltaSeconds < 45) {
    return 'Now';
  }

  const minutes = Math.floor(deltaSeconds / 60);

  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 48) {
    return `${hours}h`;
  }

  const days = Math.floor(hours / 24);

  if (days < 14) {
    return `${days}d`;
  }

  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(timestamp));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isSelectedAccountChangedMessage(value: unknown) {
  return (
    isRecord(value) &&
    (value.type === 'qortium:selected-account-changed' || value.action === 'SELECTED_ACCOUNT_CHANGED')
  );
}

function IconForKind({ type }: { type: FeedbackKind }) {
  return type === 'issue' ? <AlertCircle aria-hidden="true" /> : <Lightbulb aria-hidden="true" />;
}

function StatusPill({ children, tone = 'neutral' }: { children: string; tone?: 'good' | 'neutral' | 'warn' }) {
  return <span className={`status-pill status-pill--${tone}`}>{children}</span>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>;
}

function LoadingState({ text }: { text: string }) {
  return (
    <div className="empty-state empty-state--loading" role="status" aria-live="polite">
      <Loader2 className="spinner" aria-hidden="true" />
      <span>{text}</span>
    </div>
  );
}

function createOptimisticFeedbackResource(
  ownerName: string,
  payload: FeedbackCommentPayload | FeedbackPostPayload,
): FeedbackResource {
  const identifier =
    payload.kind === 'post' ? buildPostIdentifier(payload.id) : buildCommentIdentifier(payload.id);

  return {
    created: payload.createdAt,
    identifier,
    ownerName,
    payload,
    resource: {
      created: payload.createdAt,
      identifier,
      latestSignature: null,
      name: ownerName,
      service: 'JSON',
      updated: payload.updatedAt,
    },
    updated: payload.updatedAt,
  };
}

function IconButton({
  children,
  disabled,
  expanded,
  hasPopup,
  label,
  onClick,
  type = 'button',
  variant = 'ghost',
}: {
  children: React.ReactNode;
  disabled?: boolean;
  expanded?: boolean;
  hasPopup?: 'dialog' | 'menu';
  label: string;
  onClick?: () => void;
  type?: 'button' | 'submit';
  variant?: 'danger' | 'ghost' | 'primary';
}) {
  return (
    <button
      aria-expanded={expanded}
      aria-haspopup={hasPopup}
      aria-label={label}
      className={`icon-button icon-button--${variant}`}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type={type}
    >
      {children}
    </button>
  );
}

function CommandButton({
  children,
  disabled,
  icon,
  onClick,
  pressed,
  type = 'button',
  variant = 'secondary',
}: {
  children: React.ReactNode;
  disabled?: boolean;
  icon?: React.ReactNode;
  onClick?: () => void;
  pressed?: boolean;
  type?: 'button' | 'submit';
  variant?: 'danger' | 'primary' | 'secondary';
}) {
  return (
    <button
      aria-pressed={pressed}
      className={`command-button command-button--${variant}`}
      disabled={disabled}
      onClick={onClick}
      type={type}
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}

function ConfirmDialog({
  busy,
  message,
  onCancel,
  onConfirm,
  t,
}: {
  busy: boolean;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
  t: ReturnType<typeof createTranslator>;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();

    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onCancel();
      }
    }

    window.addEventListener('keydown', handleKey);

    return () => window.removeEventListener('keydown', handleKey);
  }, [onCancel]);

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        aria-labelledby="confirm-dialog-message"
        aria-modal="true"
        className="modal"
        onClick={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <p className="modal__body" id="confirm-dialog-message">
          {message}
        </p>
        <div className="button-row button-row--end">
          <CommandButton disabled={busy} icon={<X aria-hidden="true" />} onClick={onCancel}>
            {t('action.cancel')}
          </CommandButton>
          <CommandButton disabled={busy} icon={<Trash2 aria-hidden="true" />} onClick={onConfirm} variant="danger">
            {t('action.delete')}
          </CommandButton>
        </div>
      </div>
    </div>
  );
}

function AttachmentPicker({
  disabled,
  files,
  onChange,
}: {
  disabled: boolean;
  files: PreparedFeedbackAttachment[];
  onChange: (files: PreparedFeedbackAttachment[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');

  async function addFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0 || disabled || processing) {
      return;
    }

    const available = Math.max(0, MAX_ATTACHMENT_COUNT - files.length);
    const selected = Array.from(fileList).slice(0, available);

    if (selected.length === 0) {
      setError(`A maximum of ${MAX_ATTACHMENT_COUNT} attachments is supported.`);
      return;
    }

    setProcessing(true);
    setError('');

    try {
      const prepared = await Promise.all(selected.map(prepareFeedbackAttachment));

      onChange([...files, ...prepared]);
    } catch (attachmentError) {
      setError(getErrorMessage(attachmentError, 'Unable to prepare the selected file.'));
    } finally {
      setProcessing(false);

      if (inputRef.current) {
        inputRef.current.value = '';
      }
    }
  }

  return (
    <div className="attachment-picker">
      <input
        accept="image/*,audio/*,video/*,.pdf,.txt,.md,.zip,.json"
        className="sr-only"
        disabled={disabled || processing || files.length >= MAX_ATTACHMENT_COUNT}
        multiple
        onChange={(event) => {
          void addFiles(event.target.files);
        }}
        ref={inputRef}
        type="file"
      />
      <div className="attachment-picker__head">
        <button
          className="command-button command-button--secondary"
          disabled={disabled || processing || files.length >= MAX_ATTACHMENT_COUNT}
          onClick={() => inputRef.current?.click()}
          type="button"
        >
          {processing ? <Loader2 aria-hidden="true" className="spinner" /> : <Paperclip aria-hidden="true" />}
          <span>{processing ? 'Preparing…' : 'Attach files'}</span>
        </button>
        <span className="attachment-picker__note">
          Public on QDN · up to {MAX_ATTACHMENT_COUNT} files
        </span>
      </div>
      {files.length > 0 ? (
        <ul className="attachment-picker__list">
          {files.map((file, index) => (
            <li key={`${file.filename}:${file.size}:${index}`}>
              <FileText aria-hidden="true" />
              <span>
                <strong>{file.filename}</strong>
                <small>{formatAttachmentSize(file.size)}</small>
              </span>
              <IconButton
                disabled={disabled}
                label={`Remove ${file.filename}`}
                onClick={() => onChange(files.filter((_, fileIndex) => fileIndex !== index))}
              >
                <X aria-hidden="true" />
              </IconButton>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <p className="attachment-picker__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function PostComposer({
  appNames,
  canAttach,
  canPublish,
  initialApp,
  initialType,
  onCancel,
  onPublishNameChange,
  onSubmit,
  publishName,
  publishNames,
  publishing,
  t,
}: {
  appNames: string[];
  canAttach: boolean;
  canPublish: boolean;
  initialApp?: string | null;
  initialType?: FeedbackKind;
  onCancel: () => void;
  onPublishNameChange: (name: string) => void;
  onSubmit: (
    type: FeedbackKind,
    title: string,
    body: string,
    app: string | null,
    attachments: PreparedFeedbackAttachment[],
    identity: FeedbackDraftIdentity,
  ) => Promise<boolean>;
  publishName: string;
  publishNames: string[];
  publishing: boolean;
  t: ReturnType<typeof createTranslator>;
}) {
  const [type, setType] = useState<FeedbackKind>(initialType ?? 'issue');
  const [app, setApp] = useState(initialApp ?? '');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [attachments, setAttachments] = useState<PreparedFeedbackAttachment[]>([]);
  const [draftIdentity, setDraftIdentity] = useState<FeedbackDraftIdentity | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (!title.trim() || !body.trim()) {
      return;
    }

    // `app` comes from a fixed dropdown (no stray whitespace); the payload factory
    // is the single place that trims/normalises it, so don't trim again here.
    const identity = draftIdentity ?? createDraftIdentity();

    if (!draftIdentity) {
      setDraftIdentity(identity);
    }

    const success = await onSubmit(type, title, body, app || null, attachments, identity);

    if (success) {
      setTitle('');
      setBody('');
      setType(initialType ?? 'issue');
      setApp(initialApp ?? '');
      setAttachments([]);
      setDraftIdentity(null);
    }
  }

  return (
    <form className="composer" onSubmit={handleSubmit}>
      <div className="panel-bar">
        <IconButton label={t('action.back')} onClick={onCancel}>
          <ArrowLeft aria-hidden="true" />
        </IconButton>
        <span className="section-title">{t('action.newPost')}</span>
      </div>
      <div className="segmented" role="group">
        <button
          aria-pressed={type === 'issue'}
          className={type === 'issue' ? 'is-selected' : ''}
          onClick={() => setType('issue')}
          type="button"
        >
          <AlertCircle aria-hidden="true" />
          <span>{t('kind.issue')}</span>
        </button>
        <button
          aria-pressed={type === 'idea'}
          className={type === 'idea' ? 'is-selected' : ''}
          onClick={() => setType('idea')}
          type="button"
        >
          <Lightbulb aria-hidden="true" />
          <span>{t('kind.idea')}</span>
        </button>
      </div>
      <label>
        <span>{t('field.app')}</span>
        <select
          disabled={!canPublish || publishing}
          onChange={(event) => setApp(event.target.value)}
          value={app}
        >
          <option value="">{t('field.appPlaceholder')}</option>
          {app && !appNames.some((name) => name.toLowerCase() === app.toLowerCase()) ? (
            <option value={app}>{app}</option>
          ) : null}
          {appNames.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>{t('field.name')}</span>
        <select
          disabled={publishing || publishNames.length === 0}
          onChange={(event) => onPublishNameChange(event.target.value)}
          value={publishName}
        >
          {publishNames.length === 0 ? (
            <option value="">{t('status.noName')}</option>
          ) : (
            publishNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))
          )}
        </select>
      </label>
      <label>
        <span>{t('field.title')}</span>
        <input
          autoComplete="off"
          autoFocus
          disabled={!canPublish || publishing}
          maxLength={120}
          onChange={(event) => setTitle(event.target.value)}
          value={title}
        />
      </label>
      <label>
        <span>{t('field.description')}</span>
        <textarea
          disabled={!canPublish || publishing}
          maxLength={12000}
          onChange={(event) => setBody(event.target.value)}
          rows={8}
          value={body}
        />
      </label>
      <AttachmentPicker
        disabled={!canAttach || publishing}
        files={attachments}
        onChange={setAttachments}
      />
      <div className="composer__footer">
        <span className="publish-name">{publishName || t('status.noName')}</span>
        <div className="button-row button-row--end">
          <CommandButton disabled={publishing} icon={<X aria-hidden="true" />} onClick={onCancel}>
            {t('action.cancel')}
          </CommandButton>
          <CommandButton
            disabled={!canPublish || publishing || !title.trim() || !body.trim()}
            icon={<Send aria-hidden="true" />}
            type="submit"
            variant="primary"
          >
            {publishing ? t('status.publishing') : t('action.post')}
          </CommandButton>
        </div>
      </div>
      {publishing ? (
        <p className="composer__hint" role="status">
          {t('label.publishingHint')}
        </p>
      ) : null}
    </form>
  );
}

function FeedItem({
  commentCount,
  onSelect,
  post,
  t,
}: {
  commentCount: number;
  onSelect: () => void;
  post: FeedbackResource<FeedbackPostPayload>;
  t: ReturnType<typeof createTranslator>;
}) {
  const edited = isFeedbackResourceEdited(post);
  const completed = post.payload.status === 'done';

  return (
    <button className={`feed-item ${completed ? 'is-completed' : ''}`} onClick={onSelect} type="button">
      <span className={`kind-mark kind-mark--${post.payload.type}`}>
        <IconForKind type={post.payload.type} />
        <span className="sr-only">{post.payload.type === 'issue' ? t('kind.issue') : t('kind.idea')}</span>
      </span>
      <span className="feed-item__body">
        <span className="feed-item__title">
          {completed ? <CheckCircle2 aria-hidden="true" className="feed-item__done" /> : null}
          <span className="feed-item__title-text">{post.payload.title}</span>
          {post.payload.app ? <span className="app-pill">{post.payload.app}</span> : null}
        </span>
        <span className="feed-item__meta">
          <Avatar name={post.ownerName} size={18} />
          {getDisplayName(post.ownerName)} · {formatRelativeTime(post.updated)}
          {edited ? ` · ${t('label.edited')}` : ''}
          {completed ? ` · ${t('status.completed')}` : ''}
        </span>
      </span>
      <span className="reply-count">
        <MessageSquare aria-hidden="true" />
        {commentCount}
      </span>
    </button>
  );
}

function CommentView({
  actions,
  canEdit,
  comment,
  editing,
  editValue,
  onCancelEdit,
  onDelete,
  onEditValueChange,
  onSaveEdit,
  onStartEdit,
  saving,
  t,
}: {
  actions: QdnAction[];
  canEdit: boolean;
  comment: FeedbackResource<FeedbackCommentPayload>;
  editing: boolean;
  editValue: string;
  onCancelEdit: () => void;
  onDelete: () => void;
  onEditValueChange: (value: string) => void;
  onSaveEdit: () => void;
  onStartEdit: () => void;
  saving: boolean;
  t: ReturnType<typeof createTranslator>;
}) {
  return (
    <article className="comment">
      <div className="comment__meta">
        <Avatar name={comment.ownerName} size={24} />
        <span>{getDisplayName(comment.ownerName)}</span>
        <span>{formatRelativeTime(comment.updated)}</span>
        {isFeedbackResourceEdited(comment) ? <span>{t('label.edited')}</span> : null}
      </div>
      {editing ? (
        <div className="edit-box">
          <textarea
            autoFocus
            disabled={saving}
            onChange={(event) => onEditValueChange(event.target.value)}
            rows={4}
            value={editValue}
          />
          <div className="button-row">
            <CommandButton disabled={saving || !canEdit || !editValue.trim()} icon={<Save aria-hidden="true" />} onClick={onSaveEdit} variant="primary">
              {t('action.save')}
            </CommandButton>
            <CommandButton disabled={saving} icon={<X aria-hidden="true" />} onClick={onCancelEdit}>
              {t('action.cancel')}
            </CommandButton>
          </div>
        </div>
      ) : (
        <>
          <p>{renderFeedbackText(comment.payload.body)}</p>
          <AttachmentList actions={actions} attachments={comment.payload.attachments} />
        </>
      )}
      {canEdit && !editing ? (
        <div className="item-actions">
          <IconButton label={t('action.edit')} onClick={onStartEdit}>
            <Edit3 aria-hidden="true" />
          </IconButton>
          <IconButton disabled={saving} label={t('action.delete')} onClick={onDelete} variant="danger">
            <Trash2 aria-hidden="true" />
          </IconButton>
        </div>
      ) : null}
    </article>
  );
}

function ReplyComposer({
  canAttach,
  canPublish,
  onSubmit,
  publishing,
  t,
}: {
  canAttach: boolean;
  canPublish: boolean;
  onSubmit: (
    body: string,
    attachments: PreparedFeedbackAttachment[],
    identity: FeedbackDraftIdentity,
  ) => Promise<boolean>;
  publishing: boolean;
  t: ReturnType<typeof createTranslator>;
}) {
  const [body, setBody] = useState('');
  const [attachments, setAttachments] = useState<PreparedFeedbackAttachment[]>([]);
  const [draftIdentity, setDraftIdentity] = useState<FeedbackDraftIdentity | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (!body.trim()) {
      return;
    }

    const identity = draftIdentity ?? createDraftIdentity();

    if (!draftIdentity) {
      setDraftIdentity(identity);
    }

    const success = await onSubmit(body, attachments, identity);

    if (success) {
      setBody('');
      setAttachments([]);
      setDraftIdentity(null);
    }
  }

  return (
    <form className="reply-composer" onSubmit={handleSubmit}>
      <label>
        <span>{t('field.reply')}</span>
        <textarea
          disabled={!canPublish || publishing}
          maxLength={12000}
          onChange={(event) => setBody(event.target.value)}
          rows={3}
          value={body}
        />
      </label>
      <AttachmentPicker
        disabled={!canAttach || publishing}
        files={attachments}
        onChange={setAttachments}
      />
      <div className="button-row">
        <CommandButton
          disabled={!canPublish || publishing || !body.trim()}
          icon={<Reply aria-hidden="true" />}
          type="submit"
          variant="primary"
        >
          {publishing ? t('status.publishing') : t('action.reply')}
        </CommandButton>
      </div>
    </form>
  );
}

export default function App() {
  const [displaySettings, setDisplaySettings] = useState(getInitialDisplaySettings);
  const [bridgeState, setBridgeState] = useState<BridgeState>(emptyBridgeState);
  const [accountContext, setAccountContext] = useState<AccountContext>({ account: null, writableNames: [] });
  const [accountLoaded, setAccountLoaded] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [data, setData] = useState<FeedbackData>(emptyData);
  const [commentCounts, setCommentCounts] = useState<FeedbackCommentCounts>({});
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FeedFilter>(() =>
    getInitialPostId() || getInitialNewPostRequested() ? 'all' : getInitialFeedFilter() ?? 'all',
  );
  const [selectedAppFilter, setSelectedAppFilter] = useState<AppFilterValue>(() =>
    getInitialPostId() || getInitialNewPostRequested() ? APP_FILTER_ALL : getInitialAppFilter() ?? APP_FILTER_ALL,
  );
  const [view, setView] = useState<MainView>(() =>
    getInitialDeveloperReferenceRequested()
      ? 'reference'
      : getInitialPostId()
        ? 'list'
        : getInitialNewPostRequested()
          ? 'compose'
          : 'list',
  );
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [publishName, setPublishName] = useState('');
  const [busy, setBusy] = useState(false);
  const [postEditId, setPostEditId] = useState<string | null>(null);
  const [postEditType, setPostEditType] = useState<FeedbackKind>('issue');
  const [postEditTitle, setPostEditTitle] = useState('');
  const [postEditBody, setPostEditBody] = useState('');
  const [postEditApp, setPostEditApp] = useState('');
  const [commentEditId, setCommentEditId] = useState<string | null>(null);
  const [commentEditBody, setCommentEditBody] = useState('');
  const [pendingPostId, setPendingPostId] = useState<string | null>(() => getInitialPostId());
  const [composer] = useState(getInitialComposerParams);
  const [appNames, setAppNames] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [copyFallback, setCopyFallback] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortOrder>('active');
  const [pendingDelete, setPendingDelete] = useState<FeedbackResource | null>(null);
  const [postsNextOffset, setPostsNextOffset] = useState<number | null>(null);
  const [loadingMorePosts, setLoadingMorePosts] = useState(false);
  const [commentsNextOffset, setCommentsNextOffset] = useState<number | null>(null);
  const [loadingComments, setLoadingComments] = useState(false);
  const [orphanDataLoaded, setOrphanDataLoaded] = useState(false);
  const [writePhase, setWritePhase] = useState<WritePhase>('idle');
  const [writeTarget, setWriteTarget] = useState<'comment' | 'post' | null>(null);
  const [notificationRules, setNotificationRules] = useState<HelpNotificationRule[]>([]);
  const [notificationGranted, setNotificationGranted] = useState(false);
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const [notificationMenuOpen, setNotificationMenuOpen] = useState(false);
  const refreshTokenRef = useRef(0);
  const commentsTokenRef = useRef(0);
  const orphanLoadRef = useRef(false);
  const writeInFlightRef = useRef(false);
  const writeResetTimerRef = useRef<number | null>(null);
  const searchRefreshInitializedRef = useRef(false);
  const notificationMenuRef = useRef<HTMLDivElement>(null);
  const notificationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const notificationOperationCountRef = useRef(0);
  const notificationGenerationRef = useRef(0);

  const t = useMemo(() => createTranslator(displaySettings.language), [displaySettings.language]);
  const accountLocked = accountContext.account?.isUnlocked === false;
  const canRequestUnlock = hasAction(bridgeState.actions, 'UNLOCK_SELECTED_ACCOUNT');
  const canUseSelectedAccount = !accountLocked || canRequestUnlock;
  const canPublishResource = canUseSelectedAccount && hasAction(bridgeState.actions, 'PUBLISH_QDN_RESOURCE');
  const canPublishBundle = canUseSelectedAccount && hasAction(bridgeState.actions, 'PUBLISH_MULTIPLE_QDN_RESOURCES');
  const canPublish =
    !!publishName &&
    canUseSelectedAccount &&
    canPublishResource &&
    accountContext.writableNames.some((name) => name === publishName);
  const canDelete = canUseSelectedAccount && hasAction(bridgeState.actions, 'DELETE_QDN_RESOURCE');
  const canManageNotifications = canManageHelpNotifications(bridgeState.actions);
  const isWriting = writePhase !== 'idle' && writePhase !== 'published' && writePhase !== 'pending';

  useLayoutEffect(() => {
    applyDisplaySettings(displaySettings);
  }, [displaySettings]);

  useEffect(() => {
    const url = new URL(window.location.href);

    if (view === 'reference') {
      url.searchParams.set('view', 'developers');
    } else {
      url.searchParams.delete('view');
    }

    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }, [view]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      // Only trust messages from the embedding Home window. Inside Home this app
      // runs in an iframe whose source is `window.parent`; in the standalone
      // browser fallback there is no embedder (`window.parent === window`) and no
      // legitimate poster, so messages from any other frame are ignored (sec-1).
      if (event.source !== window.parent) {
        return;
      }

      setDisplaySettings((current) => getDisplaySettingsUpdateFromMessage(event.data, current) ?? current);

      if (isSelectedAccountChangedMessage(event.data)) {
        // Invalidate an in-flight passive reconciliation immediately, before
        // the async account refresh makes the new address visible to React.
        notificationGenerationRef.current += 1;
        // Re-fetch the bridge action set too: Home applies a node-mode switch
        // instantly, which changes whether write actions (publish/delete) are
        // offered, so the gating controls must update in-session (showactions-1).
        void getBridgeState()
          .then(setBridgeState)
          .catch(() => {});
        void refreshAccount();
      }
    }

    window.addEventListener('message', handleMessage);

    return () => window.removeEventListener('message', handleMessage);
  }, []);

  useEffect(
    () => () => {
      if (writeResetTimerRef.current !== null) {
        window.clearTimeout(writeResetTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!notificationMenuOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!notificationMenuRef.current?.contains(event.target as Node)) {
        setNotificationMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setNotificationMenuOpen(false);
      }
    }

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [notificationMenuOpen]);

  async function refreshAccount() {
    setAccountLoaded(false);
    setAccountError(null);

    try {
      const context = await loadAccountContext();

      setAccountContext(context);
      setPublishName((current) => (current && context.writableNames.includes(current) ? current : context.writableNames[0] ?? ''));
    } catch (error) {
      setAccountContext({ account: null, writableNames: [] });
      setPublishName('');
      setAccountError(getErrorMessage(error, t('error.account')));
    } finally {
      setAccountLoaded(true);
    }
  }

  function getNotificationCopy(text = t('notification.rule.text')) {
    return {
      text,
      title: t('notification.rule.title'),
    };
  }

  function queueNotificationOperation(
    operation: () => Promise<HelpNotificationState>,
    generation = notificationGenerationRef.current,
  ) {
    notificationOperationCountRef.current += 1;
    setNotificationBusy(true);

    const next = notificationQueueRef.current
      .catch(() => {})
      .then(async () => {
        try {
          setNotificationError(null);
          const state = await operation();

          if (generation === notificationGenerationRef.current) {
            setNotificationGranted(state.granted);
            setNotificationRules(state.rules);
          }
        } catch (error) {
          setNotificationError(getErrorMessage(error, t('error.notifications')));
        } finally {
          notificationOperationCountRef.current -= 1;

          if (notificationOperationCountRef.current === 0) {
            setNotificationBusy(false);
          }
        }
      });

    notificationQueueRef.current = next;

    return next;
  }

  async function refreshFeedback(query = search, showLoading = false) {
    // Tag this refresh so a slower in-flight load cannot clobber the result of a
    // newer one (e.g. refresh fired again after a publish/delete) (core-1).
    const token = ++refreshTokenRef.current;

    if (showLoading) {
      setLoadState('loading');
    }
    setLoadError(null);

    try {
      const page = await loadFeedbackPostsPage({
        limit: FEEDBACK_POST_PAGE_SIZE,
        offset: 0,
        query: query.trim() || undefined,
      });
      const counts = await loadFeedbackCommentCounts(page.posts.map((post) => post.payload.id));

      if (token !== refreshTokenRef.current) {
        return;
      }

      setData((current) => {
        const selectedPost = writeInFlightRef.current && selectedPostId
          ? current.posts.find((post) => post.payload.id === selectedPostId)
          : null;
        const posts =
          selectedPost && !page.posts.some((post) => post.identifier === selectedPost.identifier)
            ? [selectedPost, ...page.posts]
            : page.posts;

        return {
          comments: current.comments,
          posts,
        };
      });
      setCommentCounts((current) => ({ ...current, ...counts }));
      setPostsNextOffset(page.nextOffset);
      setLoadState('ready');
    } catch (error) {
      if (token !== refreshTokenRef.current) {
        return;
      }

      if (showLoading) {
        setLoadState('error');
      }
      setLoadError(getErrorMessage(error, t('error.load')));
    }
  }

  async function loadMoreFeedbackPosts() {
    if (postsNextOffset === null || loadingMorePosts) {
      return;
    }

    setLoadingMorePosts(true);

    try {
      const page = await loadFeedbackPostsPage({
        limit: FEEDBACK_POST_PAGE_SIZE,
        offset: postsNextOffset,
        query: search.trim() || undefined,
      });
      const counts = await loadFeedbackCommentCounts(page.posts.map((post) => post.payload.id));

      setData((current) => {
        const postsByIdentifier = new Map(current.posts.map((post) => [post.identifier, post]));

        for (const post of page.posts) {
          postsByIdentifier.set(post.identifier, post);
        }

        return {
          ...current,
          posts: [...postsByIdentifier.values()],
        };
      });
      setCommentCounts((current) => ({ ...current, ...counts }));
      setPostsNextOffset(page.nextOffset);
    } catch (error) {
      setLoadError(getErrorMessage(error, t('error.load')));
    } finally {
      setLoadingMorePosts(false);
    }
  }

  async function loadCommentsForPost(postId: string, append = false) {
    const token = ++commentsTokenRef.current;
    const offset = append ? commentsNextOffset ?? 0 : 0;

    setLoadingComments(true);

    try {
      const [page, counts] = await Promise.all([
        loadFeedbackCommentsForPost(postId, {
          limit: FEEDBACK_COMMENT_PAGE_SIZE,
          offset,
        }),
        loadFeedbackCommentCounts([postId]),
      ]);

      if (token !== commentsTokenRef.current) {
        return;
      }

      setData((current) => {
        const comments = append
          ? [...current.comments.filter((comment) => comment.payload.postId === postId), ...page.comments]
          : page.comments;
        const commentsByIdentifier = new Map(comments.map((comment) => [comment.identifier, comment]));

        return {
          ...current,
          comments: [
            ...current.comments.filter((comment) => comment.payload.postId !== postId),
            ...commentsByIdentifier.values(),
          ],
        };
      });
      setCommentCounts((current) => ({ ...current, ...counts }));
      setCommentsNextOffset(page.nextOffset);
    } catch (error) {
      setLoadError(getErrorMessage(error, t('error.load')));
    } finally {
      if (token === commentsTokenRef.current) {
        setLoadingComments(false);
      }
    }
  }

  async function loadAllFeedbackForOrphans() {
    if (orphanLoadRef.current) {
      return;
    }

    orphanLoadRef.current = true;
    setLoadState('loading');
    setLoadError(null);

    try {
      const posts: FeedbackResource<FeedbackPostPayload>[] = [];
      const comments: FeedbackResource<FeedbackCommentPayload>[] = [];
      let postsOffset = 0;
      let commentsOffset = 0;

      for (let pageNumber = 0; pageNumber < 250; pageNumber += 1) {
        const page = await loadFeedbackPostsPage({
          limit: FEEDBACK_POST_PAGE_SIZE,
          offset: postsOffset,
        });

        posts.push(...page.posts);

        if (!page.hasMore || page.nextOffset === null) {
          break;
        }

        postsOffset = page.nextOffset;
      }

      for (let pageNumber = 0; pageNumber < 250; pageNumber += 1) {
        const page = await loadFeedbackCommentsPage({
          limit: FEEDBACK_COMMENT_PAGE_SIZE,
          offset: commentsOffset,
        });

        comments.push(...page.comments);

        if (!page.hasMore || page.nextOffset === null) {
          break;
        }

        commentsOffset = page.nextOffset;
      }

      setData({
        comments: [...new Map(comments.map((comment) => [comment.identifier, comment])).values()],
        posts: [...new Map(posts.map((post) => [post.identifier, post])).values()],
      });
      const counts = comments.reduce<FeedbackCommentCounts>((result, comment) => {
        result[comment.payload.postId] = (result[comment.payload.postId] ?? 0) + 1;
        return result;
      }, {});

      setCommentCounts(counts);
      setPostsNextOffset(null);
      setOrphanDataLoaded(true);
      setLoadState('ready');
    } catch (error) {
      setLoadState('error');
      setLoadError(getErrorMessage(error, t('error.load')));
    } finally {
      orphanLoadRef.current = false;
    }
  }

  async function refreshAll() {
    const state = await getBridgeState();

    setBridgeState(state);
    await Promise.all([
      refreshAccount(),
      filter === 'orphan' ? loadAllFeedbackForOrphans() : refreshFeedback(search, true),
      selectedPostId ? loadCommentsForPost(selectedPostId) : Promise.resolve(),
    ]);
  }

  useEffect(() => {
    void refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const generation = notificationGenerationRef.current + 1;
    notificationGenerationRef.current = generation;

    if (!canManageNotifications) {
      setNotificationGranted(false);
      setNotificationRules([]);
      setNotificationMenuOpen(false);
      return;
    }

    if (!accountContext.account?.address) {
      void queueNotificationOperation(() => getHelpNotificationState(), generation);
      return;
    }

    void queueNotificationOperation(
      () => reconcileHelpNotifications(
        getNotificationCopy(),
        undefined,
        () => generation === notificationGenerationRef.current,
      ),
      generation,
    );
    // Re-registering is intentionally tied to selected-account and language
    // changes. The operation first checks Home's grant and never prompts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManageNotifications, accountContext.account?.address, displaySettings.language]);

  useEffect(() => {
    if (!searchRefreshInitializedRef.current) {
      searchRefreshInitializedRef.current = true;
      return;
    }

    const timer = window.setTimeout(() => {
      if (filter !== 'orphan') {
        void refreshFeedback(search);
      }
    }, 350);

    return () => window.clearTimeout(timer);
    // The refresh function intentionally reads the current display translator.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    if (!selectedPostId) {
      setCommentsNextOffset(null);
      return;
    }

    void loadCommentsForPost(selectedPostId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPostId]);

  useEffect(() => {
    if (filter === 'orphan' && !orphanDataLoaded) {
      void loadAllFeedbackForOrphans();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, orphanDataLoaded]);

  // Resolve a `?post=<id>` deep link once the feed has loaded: open that item if
  // it exists, then drop the pending id so later refreshes don't hijack the view.
  useEffect(() => {
    if (!pendingPostId || loadState !== 'ready') {
      return;
    }

    const requestedPostId = pendingPostId;
    const loadedPost = data.posts.find((post) => post.payload.id === requestedPostId);

    setPendingPostId(null);

    if (loadedPost) {
      setSelectedPostId(requestedPostId);
      setView('detail');
      return;
    }

    void loadFeedbackPostById(requestedPostId)
      .then((post) => {
        if (!post) {
          return;
        }

        setData((current) => ({
          ...current,
          posts: [post, ...current.posts.filter((candidate) => candidate.identifier !== post.identifier)],
        }));
        setSelectedPostId(post.payload.id);
        setView('detail');
      })
      .catch((error) => setLoadError(getErrorMessage(error, t('error.load'))));
  }, [pendingPostId, loadState, data.posts]);

  useEffect(() => {
    void loadPublishedAppNames().then((names) => {
      setAppNames([...new Set([...names, ...EXTRA_APP_NAMES])].sort((a, b) => a.localeCompare(b)));
    });
  }, []);

  // The My Apps filter is only offered to accounts with writable names; if that
  // set empties (e.g. account switch / sign-out) drop back to the default filter
  // so the view doesn't get stranded on a now-hidden tab.
  useEffect(() => {
    if (accountLoaded && filter === 'myApps' && accountContext.writableNames.length === 0) {
      setFilter('all');
    }
  }, [accountLoaded, filter, accountContext.writableNames]);

  const commentsByPostId = useMemo(() => {
    const map = new Map<string, FeedbackResource<FeedbackCommentPayload>[]>();

    for (const comment of data.comments) {
      const comments = map.get(comment.payload.postId) ?? [];

      comments.push(comment);
      map.set(comment.payload.postId, comments);
    }

    for (const comments of map.values()) {
      comments.sort((a, b) => a.created - b.created);
    }

    return map;
  }, [data.comments]);

  const postIds = useMemo(() => new Set(data.posts.map((post) => post.payload.id)), [data.posts]);
  const orphanComments = useMemo(
    () => data.comments.filter((comment) => !postIds.has(comment.payload.postId)),
    [data.comments, postIds],
  );
  const appFilterOptions = useMemo(
    () => buildAppFilterOptions(data.posts, selectedAppFilter),
    [data.posts, selectedAppFilter],
  );
  const appFilteredPosts = useMemo(
    () => filterPostsByApp(data.posts, selectedAppFilter),
    [data.posts, selectedAppFilter],
  );

  const filterCounts = useMemo(() => {
    const writable = new Set(accountContext.writableNames.map((name) => name.toLowerCase()));
    const counts: Record<FeedFilter, number> = {
      all: appFilteredPosts.length,
      completed: 0,
      idea: 0,
      issue: 0,
      myApps: 0,
      open: 0,
      orphan: orphanComments.length,
    };

    for (const post of appFilteredPosts) {
      if (post.payload.status === 'done') {
        counts.completed += 1;
      } else {
        counts.open += 1;
      }

      if (post.payload.type === 'issue') {
        counts.issue += 1;
      } else {
        counts.idea += 1;
      }

      if (post.payload.app && writable.has(post.payload.app.toLowerCase())) {
        counts.myApps += 1;
      }
    }

    return counts;
  }, [appFilteredPosts, orphanComments.length, accountContext.writableNames]);

  const filteredPosts = useMemo(() => {
    switch (filter) {
      case 'completed':
        return appFilteredPosts.filter((post) => post.payload.status === 'done');
      case 'idea':
      case 'issue':
        return appFilteredPosts.filter((post) => post.payload.type === filter);
      case 'open':
        return appFilteredPosts.filter((post) => post.payload.status !== 'done');
      case 'myApps': {
        const writable = new Set(accountContext.writableNames.map((name) => name.toLowerCase()));

        return appFilteredPosts.filter((post) => post.payload.app && writable.has(post.payload.app.toLowerCase()));
      }
      default:
        return appFilteredPosts;
    }
  }, [appFilteredPosts, filter, accountContext.writableNames]);

  const normalizedSearch = search.trim().toLowerCase();

  const searchedPosts = useMemo(() => {
    if (!normalizedSearch) {
      return filteredPosts;
    }

    return filteredPosts.filter((post) => {
      const haystack = `${post.payload.title} ${post.payload.body} ${post.payload.app ?? ''}`.toLowerCase();

      return haystack.includes(normalizedSearch);
    });
  }, [filteredPosts, normalizedSearch]);

  const sortedPosts = useMemo(() => {
    const posts = [...searchedPosts];

    switch (sort) {
      case 'newest':
        return posts.sort((a, b) => b.payload.createdAt - a.payload.createdAt);
      default:
        return posts.sort((a, b) => b.updated - a.updated);
    }
  }, [searchedPosts, sort]);

  const visiblePosts = sortedPosts;
  const hasMorePosts = loadState === 'ready' && postsNextOffset !== null;

  const selectedPost = data.posts.find((post) => post.payload.id === selectedPostId) ?? null;
  const selectedComments = selectedPost ? commentsByPostId.get(selectedPost.payload.id) ?? [] : [];
  const followedPostIds = useMemo(
    () => new Set(notificationRules.map((rule) => rule.postId)),
    [notificationRules],
  );

  function getFilterLabel(value: FeedFilter) {
    switch (value) {
      case 'all':
        return t('filter.all');
      case 'completed':
        return t('filter.completed');
      case 'idea':
        return t('filter.idea');
      case 'issue':
        return t('filter.issue');
      case 'myApps':
        return t('filter.myApps');
      case 'open':
        return t('filter.open');
      default:
        return t('filter.orphan');
    }
  }

  function getAppFilterLabel(option: AppFilterOption) {
    const label = option.kind === 'all' ? t('filter.all') : option.label;

    return `${label} (${option.count})`;
  }

  // Store the app tag using the name owner's own capitalisation: if the entered
  // value matches a known app case-insensitively, snap it to that canonical name;
  // otherwise keep what was entered (the payload factory trims it).
  function canonicalAppName(app: string | null) {
    const trimmed = app?.trim() ?? '';

    if (!trimmed) {
      return null;
    }

    return appNames.find((name) => name.toLowerCase() === trimmed.toLowerCase()) ?? trimmed;
  }

  function openComposer() {
    setLoadError(null);
    setView('compose');
  }

  function openDetail(postId: string) {
    setSelectedPostId(postId);
    setView('detail');
  }

  function backToList() {
    cancelPostEdit();
    setCommentEditId(null);
    setCommentEditBody('');
    setView('list');
  }

  function selectFilter(value: FeedFilter) {
    const leavingOrphans = filter === 'orphan' && value !== 'orphan';

    setFilter(value);
    setView('list');

    if (leavingOrphans) {
      setOrphanDataLoaded(false);
      void refreshFeedback(search);
    }
  }

  function selectAppFilter(value: AppFilterValue) {
    setSelectedAppFilter(value);
    setView('list');
  }

  async function ensureSelectedAccountUnlocked() {
    if (!accountLocked) {
      return true;
    }

    if (!canRequestUnlock) {
      setLoadError(t('status.locked'));
      return false;
    }

    setLoadError(null);

    try {
      const account = await unlockSelectedAccount();

      setAccountContext((current) => ({
        ...current,
        account,
      }));

      return account.isUnlocked === true;
    } catch (error) {
      setLoadError(getErrorMessage(error, t('error.account')));
      return false;
    }
  }

  async function publishAndRefresh(
    payload: Parameters<typeof publishFeedbackPayload>[1],
    name = publishName,
    attachments: PreparedFeedbackAttachment[] = [],
  ) {
    let optimisticResource: FeedbackResource | null = null;
    let replacedResource: FeedbackResource | null = null;

    if (writeInFlightRef.current) {
      return false;
    }

    writeInFlightRef.current = true;

    try {
      if (writeResetTimerRef.current !== null) {
        window.clearTimeout(writeResetTimerRef.current);
        writeResetTimerRef.current = null;
      }

      setWritePhase('idle');
      setWriteTarget(null);

      if (!name) {
        setLoadError(t('status.noName'));
        return false;
      }

      const isUnlocked = await ensureSelectedAccountUnlocked();

      if (!isUnlocked) {
        return false;
      }

      let payloadToPublish = payload;
      let preparedBundle: ReturnType<typeof prepareFeedbackBundle> | null = null;

      setWriteTarget(payload.kind);

      if (attachments.length > 0) {
        if (!canPublishBundle) {
          throw new Error('This Qortium Home version cannot publish attachment bundles.');
        }

        setWritePhase('preparing');
        preparedBundle = prepareFeedbackBundle(name, payload, attachments);
        payloadToPublish = preparedBundle.payload;
      }

      optimisticResource = createOptimisticFeedbackResource(name, payloadToPublish);
      replacedResource =
        (payloadToPublish.kind === 'post' ? data.posts : data.comments).find(
          (resource) => resource.identifier === optimisticResource?.identifier,
        ) ?? null;
      setData((current) => {
        const collection = payloadToPublish.kind === 'post' ? current.posts : current.comments;

        const nextCollection = [
          optimisticResource!,
          ...collection.filter((resource) => resource.identifier !== optimisticResource?.identifier),
        ];

        return payloadToPublish.kind === 'post'
          ? { ...current, posts: nextCollection as FeedbackResource<FeedbackPostPayload>[] }
          : { ...current, comments: nextCollection as FeedbackResource<FeedbackCommentPayload>[] };
      });
      if (payloadToPublish.kind === 'comment' && !replacedResource) {
        setCommentCounts((current) => ({
          ...current,
          [payloadToPublish.postId]: (current[payloadToPublish.postId] ?? 0) + 1,
        }));
      }

      setWritePhase('submitting');

      if (preparedBundle) {
        const attachmentsResult = await publishPreparedFeedbackBundle(preparedBundle);
        setWritePhase('confirming-attachments');

        const attachmentsReady = await waitForPublishedResourcesReady(attachmentsResult.published ?? []);

        if (!attachmentsReady) {
          throw new Error(
            'Attachments were submitted but are still awaiting QDN confirmation. Their stable resource identifiers will be reused if you retry.',
          );
        }

        setWritePhase('submitting');
      }

      // Publish the referencing JSON only after every attachment is READY.
      // A retry reuses the same feedback and attachment identifiers, avoiding
      // duplicate public resources when the final JSON step fails.
      const publishResult = await publishFeedbackPayload(name, payloadToPublish);

      setWritePhase('confirming');

      if (payloadToPublish.kind === 'post' && !replacedResource) {
        setSelectedPostId(payloadToPublish.id);
        setView('detail');
      }

      const identifier =
        payloadToPublish.kind === 'post'
          ? buildPostIdentifier(payloadToPublish.id)
          : buildCommentIdentifier(payloadToPublish.id);

      const confirmed = await waitForFeedbackResourceReady({
        expectedSignature: publishResult.transactionSignature,
        identifier,
        minimumUpdatedAt: payloadToPublish.updatedAt,
        name,
        previousSignature:
          typeof replacedResource?.resource.latestSignature === 'string'
            ? replacedResource.resource.latestSignature
            : '',
      });

      if (confirmed && payloadToPublish.kind === 'comment') {
        await loadCommentsForPost(payloadToPublish.postId);
      }

      if (confirmed && payloadToPublish.kind === 'post') {
        const confirmedPost = await loadFeedbackPostById(payloadToPublish.id);

        if (confirmedPost) {
          setData((current) => ({
            ...current,
            posts: [
              confirmedPost,
              ...current.posts.filter((post) => post.identifier !== confirmedPost.identifier),
            ],
          }));
        }
      }

      setSelectedPostId(payloadToPublish.kind === 'post' ? payloadToPublish.id : payloadToPublish.postId);

      setWritePhase(confirmed ? 'published' : 'pending');
      writeResetTimerRef.current = window.setTimeout(() => {
        setWritePhase('idle');
        setWriteTarget(null);
        writeResetTimerRef.current = null;
      }, confirmed ? 2200 : 5000);
      return true;
    } catch (error) {
      if (optimisticResource) {
        setData((current) => {
          const collection =
            optimisticResource?.payload.kind === 'post' ? current.posts : current.comments;
          const restored = replacedResource
            ? [replacedResource, ...collection.filter((resource) => resource.identifier !== replacedResource?.identifier)]
            : collection.filter((resource) => resource.identifier !== optimisticResource?.identifier);

          return optimisticResource?.payload.kind === 'post'
            ? { ...current, posts: restored as FeedbackResource<FeedbackPostPayload>[] }
            : { ...current, comments: restored as FeedbackResource<FeedbackCommentPayload>[] };
        });
        if (optimisticResource.payload.kind === 'comment' && !replacedResource) {
          const postId = optimisticResource.payload.postId;

          setCommentCounts((current) => ({
            ...current,
            [postId]: Math.max(0, (current[postId] ?? 1) - 1),
          }));
        }
      }

      setLoadError(getErrorMessage(error, t('error.publish')));
      setWritePhase('idle');
      setWriteTarget(null);
      return false;
    } finally {
      writeInFlightRef.current = false;
    }
  }

  async function handleCreatePost(
    type: FeedbackKind,
    title: string,
    body: string,
    app: string | null,
    attachments: PreparedFeedbackAttachment[],
    identity: FeedbackDraftIdentity,
  ) {
    const success = await publishAndRefresh(
      createPostPayload(type, title, body, canonicalAppName(app), identity),
      publishName,
      attachments,
    );

    if (success) {
      setView('detail');
    }

    return success;
  }

  async function handleCreateComment(
    body: string,
    attachments: PreparedFeedbackAttachment[],
    identity: FeedbackDraftIdentity,
  ) {
    if (!selectedPost) {
      return false;
    }

    return publishAndRefresh(
      createCommentPayload(selectedPost.payload.id, body, identity),
      publishName,
      attachments,
    );
  }

  async function handleToggleStatus(post: FeedbackResource<FeedbackPostPayload>) {
    const nextStatus = post.payload.status === 'done' ? 'open' : 'done';

    await publishAndRefresh(setPostStatusPayload(post.payload, nextStatus), post.ownerName);
  }

  async function handleCopyLink(post: FeedbackResource<FeedbackPostPayload>) {
    const copiedOk = await copyTextToClipboard(buildPostLink(post.payload.id));

    if (copiedOk) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } else {
      // Clipboard blocked (e.g. insecure context): surface the link in its own
      // neutral, dismissible notice to copy by hand — not the red error banner.
      setCopyFallback(buildPostLink(post.payload.id));
    }
  }

  function handleToggleFollow(post: FeedbackResource<FeedbackPostPayload>) {
    const followed = followedPostIds.has(post.payload.id);

    if (!followed && !accountContext.account?.address) {
      setNotificationError(t('notification.accountRequired'));
      return;
    }

    if (!followed && !hasHelpNotificationCapacity(notificationRules)) {
      setNotificationError(t('error.notificationLimit', { limit: HELP_NOTIFICATION_RULE_LIMIT }));
      return;
    }

    void queueNotificationOperation(() => (
      followed
        ? unfollowHelpPost(post.payload.id)
        : followHelpPost(post.payload.id, getNotificationCopy(post.payload.title))
    ));
  }

  async function openFollowedThread(postId: string) {
    setNotificationMenuOpen(false);
    const loadedPost = data.posts.find((post) => post.payload.id === postId);

    if (loadedPost) {
      openDetail(postId);
      return;
    }

    try {
      const post = await loadFeedbackPostById(postId);

      if (!post) {
        setNotificationError(t('error.notificationThread'));
        return;
      }

      setData((current) => ({
        ...current,
        posts: [post, ...current.posts.filter((candidate) => candidate.identifier !== post.identifier)],
      }));
      openDetail(postId);
    } catch (error) {
      setNotificationError(getErrorMessage(error, t('error.notificationThread')));
    }
  }

  function startPostEdit(post: FeedbackResource<FeedbackPostPayload>) {
    setPostEditId(post.payload.id);
    setPostEditType(post.payload.type);
    setPostEditTitle(post.payload.title);
    setPostEditBody(post.payload.body);
    setPostEditApp(post.payload.app ?? '');
  }

  function cancelPostEdit() {
    setPostEditId(null);
    setPostEditTitle('');
    setPostEditBody('');
    setPostEditApp('');
  }

  async function savePostEdit(post: FeedbackResource<FeedbackPostPayload>) {
    if (!postEditTitle.trim() || !postEditBody.trim()) {
      return;
    }

    const success = await publishAndRefresh(
      updatePostPayload(post.payload, {
        app: canonicalAppName(postEditApp),
        body: postEditBody,
        title: postEditTitle,
        type: postEditType,
      }),
      post.ownerName,
    );

    if (success) {
      cancelPostEdit();
    }
  }

  function startCommentEdit(comment: FeedbackResource<FeedbackCommentPayload>) {
    setCommentEditId(comment.payload.id);
    setCommentEditBody(comment.payload.body);
  }

  async function saveCommentEdit(comment: FeedbackResource<FeedbackCommentPayload>) {
    if (!commentEditBody.trim()) {
      return;
    }

    const success = await publishAndRefresh(updateCommentPayload(comment.payload, commentEditBody), comment.ownerName);

    if (success) {
      setCommentEditId(null);
      setCommentEditBody('');
    }
  }

  async function handleDelete(resource: FeedbackResource) {
    setBusy(true);

    try {
      const isUnlocked = await ensureSelectedAccountUnlocked();

      if (!isUnlocked) {
        return;
      }

      await deleteFeedbackResource(resource);
      setPendingDelete(null);

      if (resource.payload.kind === 'post') {
        if (followedPostIds.has(resource.payload.id) && canManageNotifications) {
          // Notification cleanup is deliberately best effort. The confirmed QDN
          // deletion remains successful even if Home cannot remove the rule.
          void queueNotificationOperation(() => unfollowHelpPost(resource.payload.id));
        }
        setSelectedPostId(null);
        setView('list');
        setData((current) => ({
          ...current,
          posts: current.posts.filter((post) => post.identifier !== resource.identifier),
        }));
        await refreshFeedback();
      } else {
        setData((current) => ({
          ...current,
          comments: current.comments.filter((comment) => comment.identifier !== resource.identifier),
        }));
        await loadCommentsForPost(resource.payload.postId);
      }
    } catch (error) {
      setLoadError(getErrorMessage(error, t('error.delete')));
    } finally {
      setBusy(false);
    }
  }

  function getSortLabel(value: SortOrder) {
    switch (value) {
      case 'newest':
        return t('sort.newest');
      default:
        return t('sort.active');
    }
  }

  function getWriteStatusText() {
    switch (writePhase) {
      case 'preparing':
        return 'Preparing attachments…';
      case 'submitting':
        return 'Submitting to QDN…';
      case 'confirming-attachments':
        return 'Awaiting attachment confirmation…';
      case 'confirming':
        return 'Awaiting QDN confirmation…';
      case 'pending':
        return 'Submitted, but QDN confirmation is still pending.';
      case 'published':
        return 'Published to QDN.';
      default:
        return '';
    }
  }

  const activeTab =
    view === 'reference'
      ? 'reference'
      : view === 'compose'
        ? 'compose'
        : filter === 'myApps'
          ? 'myApps'
          : 'feedback';
  const showList = view === 'list' || (view === 'detail' && !selectedPost);
  const showSidebar = view !== 'compose' && view !== 'reference';

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand__mark">
            <img src={helpIconUrl} alt="" aria-hidden="true" />
          </span>
          <div>
            <div className="brand__title-row">
              <h1>Help {APP_VERSION}</h1>
            </div>
          </div>
        </div>
        <div className="topbar__actions">
          {canManageNotifications ? (
            <div className="notification-settings" ref={notificationMenuRef}>
              <IconButton
                expanded={notificationMenuOpen}
                hasPopup="dialog"
                label={t('action.notifications')}
                onClick={() => setNotificationMenuOpen((open) => !open)}
                variant={notificationRules.length > 0 ? 'primary' : 'ghost'}
              >
                {notificationRules.length > 0 ? <BellRing aria-hidden="true" /> : <Bell aria-hidden="true" />}
              </IconButton>
              {notificationMenuOpen ? (
                <div
                  aria-label={t('action.notifications')}
                  className="notification-settings__popover"
                  role="dialog"
                >
                  <div className="notification-settings__heading">
                    <strong>{t('notification.settings.title')}</strong>
                    <span>
                      {t('notification.settings.capacity', {
                        limit: HELP_NOTIFICATION_RULE_LIMIT,
                        used: notificationRules.length,
                      })}
                    </span>
                  </div>
                  <p className="notification-settings__scope">
                    {notificationGranted
                      ? t('notification.settings.scope')
                      : t('notification.settings.permission')}
                  </p>
                  {notificationRules.length > 0 ? (
                    <ul className="notification-settings__list">
                      {notificationRules.map((rule) => {
                        const post = data.posts.find((candidate) => candidate.payload.id === rule.postId);

                        return (
                          <li key={rule.notificationId}>
                            <button
                              className="notification-settings__thread"
                              onClick={() => void openFollowedThread(rule.postId)}
                              type="button"
                            >
                              {post?.payload.title || rule.text || t('notification.thread', { id: rule.postId })}
                            </button>
                            <IconButton
                              disabled={notificationBusy}
                              label={t('action.unfollow')}
                              onClick={() => {
                                void queueNotificationOperation(() => unfollowHelpPost(rule.postId));
                              }}
                            >
                              <BellOff aria-hidden="true" />
                            </IconButton>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="notification-settings__empty">{t('notification.settings.empty')}</p>
                  )}
                  {notificationError ? (
                    <p className="notification-settings__error" role="alert">{notificationError}</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
          <StatusPill tone={bridgeState.isHomeBridge ? 'good' : 'neutral'}>
            {bridgeState.isHomeBridge ? t('label.home') : t('label.local')}
          </StatusPill>
          <StatusPill tone={!accountLocked && canPublish ? 'good' : 'warn'}>
            {accountLocked ? t('status.locked') : canPublish ? t('status.ready') : publishName ? t('status.noWrite') : t('status.noName')}
          </StatusPill>
          <IconButton disabled={busy || loadState === 'loading'} label={t('action.refresh')} onClick={() => void refreshAll()}>
            <RefreshCw aria-hidden="true" />
          </IconButton>
        </div>
      </header>

      <nav aria-label="Help sections" className="app-tabs">
        <button
          aria-current={activeTab === 'feedback' ? 'page' : undefined}
          className={`app-tab ${activeTab === 'feedback' ? 'is-active' : ''}`}
          onClick={() => {
            selectFilter('all');
          }}
          type="button"
        >
          <Inbox aria-hidden="true" />
          <span>{t('label.feedback')}</span>
        </button>
        <button
          aria-current={activeTab === 'myApps' ? 'page' : undefined}
          className={`app-tab ${activeTab === 'myApps' ? 'is-active' : ''}`}
          onClick={() => {
            selectFilter('myApps');
          }}
          type="button"
        >
          <ListFilter aria-hidden="true" />
          <span>{t('filter.myApps')}</span>
        </button>
        <button
          aria-current={activeTab === 'compose' ? 'page' : undefined}
          className={`app-tab ${activeTab === 'compose' ? 'is-active' : ''}`}
          onClick={openComposer}
          type="button"
        >
          <Plus aria-hidden="true" />
          <span>{t('action.newPost')}</span>
        </button>
        <button
          aria-current={activeTab === 'reference' ? 'page' : undefined}
          className={`app-tab ${activeTab === 'reference' ? 'is-active' : ''}`}
          onClick={() => setView('reference')}
          type="button"
        >
          <BookOpen aria-hidden="true" />
          <span>Developers</span>
        </button>
      </nav>

      <section className={`workspace ${showSidebar ? '' : 'workspace--single'}`}>
        {showSidebar ? <aside className="sidebar">
          <div className="account-strip">
            <label>
              <span>{t('field.name')}</span>
              <select
                disabled={busy || isWriting || accountContext.writableNames.length === 0}
                onChange={(event) => setPublishName(event.target.value)}
                value={publishName}
              >
                {accountContext.writableNames.length === 0 ? (
                  <option value="">{accountError ? t('status.noWrite') : t('status.noName')}</option>
                ) : (
                  accountContext.writableNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))
                )}
              </select>
            </label>
          </div>

          <div className="account-strip">
            <label>
              <span>{t('field.app')}</span>
              <select
                aria-label={t('field.app')}
                onChange={(event) => selectAppFilter(event.target.value)}
                value={selectedAppFilter}
              >
                {appFilterOptions.map((option) => (
                  <option key={`${option.kind}:${option.value}`} value={option.value}>
                    {getAppFilterLabel(option)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <nav className="filter-nav" aria-label={t('label.filters')}>
            <div className="filter-nav__title">
              <ListFilter aria-hidden="true" />
              <span className="section-title">{t('label.filters')}</span>
            </div>
            {(accountContext.writableNames.length > 0 ? [...FILTERS, 'myApps' as const] : FILTERS).map((value) => (
              <button
                aria-pressed={filter === value}
                className={`filter-nav__item ${filter === value ? 'is-selected' : ''}`}
                key={value}
                onClick={() => selectFilter(value)}
                type="button"
              >
                <span>{getFilterLabel(value)}</span>
                <span className="count-pill">
                  {loadState === 'loading' || (value === 'orphan' && !orphanDataLoaded)
                    ? '—'
                    : filterCounts[value]}
                </span>
              </button>
            ))}
          </nav>

          {accountError ? (
            <div aria-live="polite" className="notice" role="status">
              {accountError}
            </div>
          ) : null}
        </aside> : null}

        <section className="main-panel">
          {writePhase !== 'idle' ? (
            <div
              className={`notice ${writePhase === 'published' ? 'notice--success' : 'notice--link'}`}
              role="status"
            >
              {getWriteStatusText()}
            </div>
          ) : null}
          {loadError ? (
            <div className="notice notice--error" role="alert">
              <span className="notice__text">{loadError}</span>
              <IconButton label={t('action.cancel')} onClick={() => setLoadError(null)} variant="ghost">
                <X aria-hidden="true" />
              </IconButton>
            </div>
          ) : null}

          {notificationError && !notificationMenuOpen ? (
            <div className="notice notice--error" role="alert">
              <span className="notice__text">{notificationError}</span>
              <IconButton label={t('action.cancel')} onClick={() => setNotificationError(null)} variant="ghost">
                <X aria-hidden="true" />
              </IconButton>
            </div>
          ) : null}

          {copyFallback ? (
            <div className="notice notice--link" role="status">
              <span className="notice__text">{copyFallback}</span>
              <IconButton label={t('action.cancel')} onClick={() => setCopyFallback(null)} variant="ghost">
                <X aria-hidden="true" />
              </IconButton>
            </div>
          ) : null}

          {view === 'reference' ? <Reference /> : null}

          {view === 'compose' ? (
            <PostComposer
              appNames={appNames}
              canAttach={canPublishBundle}
              canPublish={canPublish}
              initialApp={composer.app}
              initialType={composer.type ?? undefined}
              onCancel={backToList}
              onPublishNameChange={setPublishName}
              onSubmit={handleCreatePost}
              publishName={publishName}
              publishNames={accountContext.writableNames}
              publishing={isWriting && writeTarget === 'post'}
              t={t}
            />
          ) : null}

          {view === 'detail' && selectedPost ? (
            <div className="detail">
              <div className="panel-bar">
                <IconButton label={t('action.back')} onClick={backToList}>
                  <ArrowLeft aria-hidden="true" />
                </IconButton>
                <span className="section-title">{t('label.feedback')}</span>
                <div className="panel-bar__end">
                  {canManageNotifications ? (
                    <CommandButton
                      disabled={
                        notificationBusy ||
                        (!followedPostIds.has(selectedPost.payload.id) && !accountContext.account?.address)
                      }
                      icon={followedPostIds.has(selectedPost.payload.id)
                        ? <BellOff aria-hidden="true" />
                        : <Bell aria-hidden="true" />}
                      onClick={() => handleToggleFollow(selectedPost)}
                      pressed={followedPostIds.has(selectedPost.payload.id)}
                      variant={followedPostIds.has(selectedPost.payload.id) ? 'primary' : 'secondary'}
                    >
                      {followedPostIds.has(selectedPost.payload.id)
                        ? t('action.unfollow')
                        : accountContext.account?.address
                          ? t('action.follow')
                          : t('notification.accountRequired')}
                    </CommandButton>
                  ) : null}
                  <CommandButton
                    icon={copied ? <Check aria-hidden="true" /> : <LinkIcon aria-hidden="true" />}
                    onClick={() => void handleCopyLink(selectedPost)}
                  >
                    {copied ? t('status.copied') : t('action.copyLink')}
                  </CommandButton>
                  <span aria-live="polite" className="sr-only" role="status">
                    {copied ? t('status.copied') : ''}
                  </span>
                </div>
              </div>

              <article className="post-detail">
                <div className="post-detail__header">
                  <span className={`kind-mark kind-mark--${selectedPost.payload.type}`}>
                    <IconForKind type={selectedPost.payload.type} />
                  </span>
                  <div>
                    <div className="post-detail__tags">
                      <span className="post-detail__kind">
                        {selectedPost.payload.type === 'issue' ? t('kind.issue') : t('kind.idea')}
                      </span>
                      <StatusPill tone={selectedPost.payload.status === 'done' ? 'good' : 'neutral'}>
                        {selectedPost.payload.status === 'done' ? t('status.completed') : t('status.open')}
                      </StatusPill>
                    </div>
                    <h2>{selectedPost.payload.title}</h2>
                    <div className="post-detail__meta">
                      <Avatar name={selectedPost.ownerName} size={28} />
                      <span>{getDisplayName(selectedPost.ownerName)}</span>
                      <span>{formatRelativeTime(selectedPost.updated)}</span>
                      {isFeedbackResourceEdited(selectedPost) ? <span>{t('label.edited')}</span> : null}
                      {selectedPost.payload.app ? (
                        <>
                          <button
                            aria-label={`${t('field.app')}: ${selectedPost.payload.app}`}
                            className="app-pill app-pill--button"
                            onClick={() => selectAppFilter(selectedPost.payload.app ?? APP_FILTER_ALL)}
                            title={t('label.feedback')}
                            type="button"
                          >
                            {selectedPost.payload.app}
                          </button>
                          <IconButton
                            label={`${t('action.openApp')}: ${selectedPost.payload.app}`}
                            onClick={() => {
                              void openAppLinkInHomeTab(`qdn://APP/${selectedPost.payload.app}`).catch((error) => {
                                console.warn('Unable to open app.', error);
                              });
                            }}
                          >
                            <ExternalLink aria-hidden="true" />
                          </IconButton>
                        </>
                      ) : null}
                    </div>
                  </div>
                  {canPublishResource && canOwnResource(selectedPost, accountContext.writableNames) ? (
                    <div className="item-actions">
                      <IconButton
                        disabled={busy || isWriting}
                        label={selectedPost.payload.status === 'done' ? t('action.reopen') : t('action.complete')}
                        onClick={() => void handleToggleStatus(selectedPost)}
                        variant={selectedPost.payload.status === 'done' ? 'ghost' : 'primary'}
                      >
                        {selectedPost.payload.status === 'done' ? (
                          <RotateCcw aria-hidden="true" />
                        ) : (
                          <CheckCircle2 aria-hidden="true" />
                        )}
                      </IconButton>
                      <IconButton label={t('action.edit')} onClick={() => startPostEdit(selectedPost)}>
                        <Edit3 aria-hidden="true" />
                      </IconButton>
                      <IconButton
                        disabled={busy || isWriting || !canDelete}
                        label={t('action.delete')}
                        onClick={() => setPendingDelete(selectedPost)}
                        variant="danger"
                      >
                        <Trash2 aria-hidden="true" />
                      </IconButton>
                    </div>
                  ) : null}
                </div>

                {postEditId === selectedPost.payload.id ? (
                  <div className="edit-box">
                    <div className="segmented" role="group">
                      <button
                        aria-pressed={postEditType === 'issue'}
                        className={postEditType === 'issue' ? 'is-selected' : ''}
                        onClick={() => setPostEditType('issue')}
                        type="button"
                      >
                        <AlertCircle aria-hidden="true" />
                        <span>{t('kind.issue')}</span>
                      </button>
                      <button
                        aria-pressed={postEditType === 'idea'}
                        className={postEditType === 'idea' ? 'is-selected' : ''}
                        onClick={() => setPostEditType('idea')}
                        type="button"
                      >
                        <Lightbulb aria-hidden="true" />
                        <span>{t('kind.idea')}</span>
                      </button>
                    </div>
                    <select
                      className="edit-app-select"
                      disabled={busy || isWriting}
                      onChange={(event) => setPostEditApp(event.target.value)}
                      value={postEditApp}
                    >
                      <option value="">{t('field.appPlaceholder')}</option>
                      {postEditApp && !appNames.some((name) => name.toLowerCase() === postEditApp.toLowerCase()) ? (
                        <option value={postEditApp}>{postEditApp}</option>
                      ) : null}
                      {appNames.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                    <input
                      autoFocus
                      disabled={busy || isWriting}
                      maxLength={120}
                      onChange={(event) => setPostEditTitle(event.target.value)}
                      value={postEditTitle}
                    />
                    <textarea disabled={busy || isWriting} onChange={(event) => setPostEditBody(event.target.value)} rows={7} value={postEditBody} />
                    <div className="button-row">
                      <CommandButton
                        disabled={busy || isWriting || !canPublishResource || !postEditTitle.trim() || !postEditBody.trim()}
                        icon={<Save aria-hidden="true" />}
                        onClick={() => void savePostEdit(selectedPost)}
                        variant="primary"
                      >
                        {t('action.save')}
                      </CommandButton>
                      <CommandButton disabled={busy || isWriting} icon={<X aria-hidden="true" />} onClick={cancelPostEdit}>
                        {t('action.cancel')}
                      </CommandButton>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="post-body">{renderFeedbackText(selectedPost.payload.body)}</p>
                    <AttachmentList actions={bridgeState.actions} attachments={selectedPost.payload.attachments} />
                  </>
                )}
              </article>

              <section className="comments-panel">
                <div className="section-heading">
                  <span className="section-title">{t('label.replies')}</span>
                  <span className="count-pill">{selectedComments.length}</span>
                </div>
                <ReplyComposer
                  canAttach={canPublishBundle}
                  canPublish={canPublish}
                  onSubmit={handleCreateComment}
                  publishing={isWriting && writeTarget === 'comment'}
                  t={t}
                />
                {loadingComments ? <LoadingState text={t('label.loading')} /> : null}
                <div className="comments-list">
                  {selectedComments.length === 0 ? <EmptyState text={t('empty.comments')} /> : null}
                  {selectedComments.map((comment) => (
                    <CommentView
                      actions={bridgeState.actions}
                      canEdit={canPublishResource && canOwnResource(comment, accountContext.writableNames)}
                      comment={comment}
                      editValue={commentEditBody}
                      editing={commentEditId === comment.payload.id}
                      key={comment.identifier}
                      onCancelEdit={() => {
                        setCommentEditId(null);
                        setCommentEditBody('');
                      }}
                      onDelete={() => setPendingDelete(comment)}
                      onEditValueChange={setCommentEditBody}
                      onSaveEdit={() => void saveCommentEdit(comment)}
                      onStartEdit={() => startCommentEdit(comment)}
                      saving={busy}
                      t={t}
                    />
                  ))}
                </div>
                {commentsNextOffset !== null ? (
                  <div className="load-more">
                    <CommandButton
                      disabled={loadingComments}
                      icon={<ChevronDown aria-hidden="true" />}
                      onClick={() => {
                        if (selectedPost) {
                          void loadCommentsForPost(selectedPost.payload.id, true);
                        }
                      }}
                    >
                      {loadingComments ? t('label.loading') : t('action.loadMore')}
                    </CommandButton>
                  </div>
                ) : null}
              </section>
            </div>
          ) : null}

          {showList ? (
            <div className="list-view">
              <div className="list-view__head">
                <h2 className="list-view__title">{getFilterLabel(filter)}</h2>
              </div>
              {filter !== 'orphan' ? (
                <div className="list-view__search">
                  <Search aria-hidden="true" />
                  <input
                    aria-label={t('field.search')}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={t('field.search')}
                    type="search"
                    value={search}
                  />
                  <select
                    aria-label={t('label.sort')}
                    className="sort-select"
                    onChange={(event) => setSort(event.target.value as SortOrder)}
                    value={sort}
                  >
                    {SORT_ORDERS.map((value) => (
                      <option key={value} value={value}>
                        {getSortLabel(value)}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <div className="feed-list">
                {loadState === 'loading' ? <LoadingState text={t('label.loading')} /> : null}
                {loadState !== 'loading' && filter !== 'orphan' && filter !== 'myApps' && searchedPosts.length === 0 ? (
                  <EmptyState text={normalizedSearch ? t('empty.search') : t('empty.posts')} />
                ) : null}
                {loadState !== 'loading' && filter === 'myApps' && searchedPosts.length === 0 ? (
                  <EmptyState text={normalizedSearch ? t('empty.search') : t('empty.myApps')} />
                ) : null}
                {filter !== 'orphan' && filter !== 'myApps'
                  ? visiblePosts.map((post) => (
                      <FeedItem
                        commentCount={
                          commentCounts[post.payload.id] ??
                          commentsByPostId.get(post.payload.id)?.length ??
                          0
                        }
                        key={post.identifier}
                        onSelect={() => openDetail(post.payload.id)}
                        post={post}
                        t={t}
                      />
                    ))
                  : null}
                {filter !== 'orphan' && filter !== 'myApps' && hasMorePosts ? (
                  <div className="load-more">
                    <CommandButton
                      disabled={loadingMorePosts}
                      icon={<ChevronDown aria-hidden="true" />}
                      onClick={() => void loadMoreFeedbackPosts()}
                    >
                      {loadingMorePosts ? t('label.loading') : t('action.loadMore')}
                    </CommandButton>
                  </div>
                ) : null}
                {filter === 'myApps'
                  ? Array.from(
                      sortedPosts.reduce((map, post) => {
                        const appName = post.payload.app!;
                        const group = map.get(appName) ?? [];

                        group.push(post);
                        map.set(appName, group);

                        return map;
                      }, new Map<string, typeof filteredPosts>()),
                    ).map(([appName, posts]) => (
                      <div className="app-group" key={appName}>
                        <span className="app-group__label">{appName}</span>
                        {posts.map((post) => (
                          <FeedItem
                            commentCount={
                              commentCounts[post.payload.id] ??
                              commentsByPostId.get(post.payload.id)?.length ??
                              0
                            }
                            key={post.identifier}
                            onSelect={() => openDetail(post.payload.id)}
                            post={post}
                            t={t}
                          />
                        ))}
                      </div>
                    ))
                  : null}
                {filter === 'myApps' && hasMorePosts ? (
                  <div className="load-more">
                    <CommandButton
                      disabled={loadingMorePosts}
                      icon={<ChevronDown aria-hidden="true" />}
                      onClick={() => void loadMoreFeedbackPosts()}
                    >
                      {loadingMorePosts ? t('label.loading') : t('action.loadMore')}
                    </CommandButton>
                  </div>
                ) : null}
                {filter === 'orphan' && orphanComments.length === 0 ? <EmptyState text={t('empty.orphans')} /> : null}
                {filter === 'orphan'
                  ? orphanComments.map((comment) => (
                      <div className="feed-item feed-item--orphan" key={comment.identifier}>
                        <span className="kind-mark kind-mark--orphan">
                          <Circle aria-hidden="true" />
                        </span>
                        <span className="feed-item__body">
                          <span className="feed-item__title">{t('label.deletedPost')}</span>
                          <span className="feed-item__meta">
                            <Avatar name={comment.ownerName} size={18} />
                            {getDisplayName(comment.ownerName)} · {formatRelativeTime(comment.updated)}
                          </span>
                        </span>
                      </div>
                    ))
                  : null}
              </div>
            </div>
          ) : null}
        </section>
      </section>

      <div aria-hidden="true" className="app-watermark">
        <CheckCircle2 />
      </div>

      {pendingDelete ? (
        <ConfirmDialog
          busy={busy}
          message={t('confirm.delete')}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => void handleDelete(pendingDelete)}
          t={t}
        />
      ) : null}
    </main>
  );
}
