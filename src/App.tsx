import { FormEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Circle,
  Check,
  Edit3,
  Lightbulb,
  Link as LinkIcon,
  ListFilter,
  Loader2,
  MessageSquare,
  Plus,
  RefreshCw,
  Reply,
  RotateCcw,
  Save,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import helpIconUrl from './assets/qortium-help-protoicon-black-transparent.png';
import { createTranslator } from './i18n';
import { copyTextToClipboard } from './clipboard';
import { buildPostLink, getInitialComposerParams, getInitialPostId } from './deepLink';
import { applyDisplaySettings, getDisplaySettingsUpdateFromMessage, getInitialDisplaySettings } from './displaySettings';
import { renderFeedbackText } from './feedbackLinks';
import { getBridgeState, hasAction } from './qdnRequest';
import {
  canOwnResource,
  createCommentPayload,
  createPostPayload,
  deleteFeedbackResource,
  loadAccountContext,
  loadFeedback,
  loadPublishedAppNames,
  publishFeedbackPayload,
  setPostStatusPayload,
  unlockSelectedAccount,
  updateCommentPayload,
  updatePostPayload,
  type AccountContext,
  type FeedbackCommentPayload,
  type FeedbackKind,
  type FeedbackPostPayload,
  type FeedbackResource,
} from './qdnFeedback';
import type { BridgeState } from './types';

type LoadState = 'error' | 'loading' | 'ready';
type FeedFilter = 'all' | 'completed' | 'idea' | 'issue' | 'myApps' | 'open' | 'orphan';
type MainView = 'compose' | 'detail' | 'list';

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

function IconButton({
  children,
  disabled,
  label,
  onClick,
  type = 'button',
  variant = 'ghost',
}: {
  children: React.ReactNode;
  disabled?: boolean;
  label: string;
  onClick?: () => void;
  type?: 'button' | 'submit';
  variant?: 'danger' | 'ghost' | 'primary';
}) {
  return (
    <button
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
  type = 'button',
  variant = 'secondary',
}: {
  children: React.ReactNode;
  disabled?: boolean;
  icon?: React.ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  variant?: 'danger' | 'primary' | 'secondary';
}) {
  return (
    <button className={`command-button command-button--${variant}`} disabled={disabled} onClick={onClick} type={type}>
      {icon}
      <span>{children}</span>
    </button>
  );
}

function PostComposer({
  appNames,
  canPublish,
  initialApp,
  initialType,
  onCancel,
  onSubmit,
  publishName,
  publishing,
  t,
}: {
  appNames: string[];
  canPublish: boolean;
  initialApp?: string | null;
  initialType?: FeedbackKind;
  onCancel: () => void;
  onSubmit: (type: FeedbackKind, title: string, body: string, app: string | null) => Promise<boolean>;
  publishName: string;
  publishing: boolean;
  t: ReturnType<typeof createTranslator>;
}) {
  const [type, setType] = useState<FeedbackKind>(initialType ?? 'issue');
  const [app, setApp] = useState(initialApp ?? '');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (!title.trim() || !body.trim()) {
      return;
    }

    // `app` comes from a fixed dropdown (no stray whitespace); the payload factory
    // is the single place that trims/normalises it, so don't trim again here.
    const success = await onSubmit(type, title, body, app || null);

    if (success) {
      setTitle('');
      setBody('');
      setType(initialType ?? 'issue');
      setApp(initialApp ?? '');
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
            {publishing ? t('label.loading') : t('action.post')}
          </CommandButton>
        </div>
      </div>
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
  const edited = post.payload.updatedAt > post.payload.createdAt;
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
        <span>{getDisplayName(comment.ownerName)}</span>
        <span>{formatRelativeTime(comment.updated)}</span>
        {comment.payload.updatedAt > comment.payload.createdAt ? <span>{t('label.edited')}</span> : null}
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
        <p>{renderFeedbackText(comment.payload.body)}</p>
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
  canPublish,
  onSubmit,
  publishing,
  t,
}: {
  canPublish: boolean;
  onSubmit: (body: string) => Promise<boolean>;
  publishing: boolean;
  t: ReturnType<typeof createTranslator>;
}) {
  const [body, setBody] = useState('');

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (!body.trim()) {
      return;
    }

    const success = await onSubmit(body);

    if (success) {
      setBody('');
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
      <div className="button-row">
        <CommandButton
          disabled={!canPublish || publishing || !body.trim()}
          icon={<Reply aria-hidden="true" />}
          type="submit"
          variant="primary"
        >
          {publishing ? t('label.loading') : t('action.reply')}
        </CommandButton>
      </div>
    </form>
  );
}

export default function App() {
  const [displaySettings, setDisplaySettings] = useState(getInitialDisplaySettings);
  const [bridgeState, setBridgeState] = useState<BridgeState>(emptyBridgeState);
  const [accountContext, setAccountContext] = useState<AccountContext>({ account: null, writableNames: [] });
  const [accountError, setAccountError] = useState<string | null>(null);
  const [data, setData] = useState<FeedbackData>(emptyData);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FeedFilter>('all');
  const [view, setView] = useState<MainView>('list');
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
  const refreshTokenRef = useRef(0);

  const t = useMemo(() => createTranslator(displaySettings.language), [displaySettings.language]);
  const accountLocked = accountContext.account?.isUnlocked === false;
  const canRequestUnlock = hasAction(bridgeState.actions, 'UNLOCK_SELECTED_ACCOUNT');
  const canUseSelectedAccount = !accountLocked || canRequestUnlock;
  const canPublishResource = canUseSelectedAccount && hasAction(bridgeState.actions, 'PUBLISH_QDN_RESOURCE');
  const canPublish =
    !!publishName &&
    canUseSelectedAccount &&
    canPublishResource &&
    accountContext.writableNames.some((name) => name === publishName);
  const canDelete = canUseSelectedAccount && hasAction(bridgeState.actions, 'DELETE_QDN_RESOURCE');

  useLayoutEffect(() => {
    applyDisplaySettings(displaySettings);
  }, [displaySettings]);

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
        void refreshAccount();
      }
    }

    window.addEventListener('message', handleMessage);

    return () => window.removeEventListener('message', handleMessage);
  }, []);

  async function refreshAccount() {
    setAccountError(null);

    try {
      const context = await loadAccountContext();

      setAccountContext(context);
      setPublishName((current) => (current && context.writableNames.includes(current) ? current : context.writableNames[0] ?? ''));
    } catch (error) {
      setAccountContext({ account: null, writableNames: [] });
      setPublishName('');
      setAccountError(getErrorMessage(error, t('error.account')));
    }
  }

  async function refreshFeedback() {
    // Tag this refresh so a slower in-flight load cannot clobber the result of a
    // newer one (e.g. refresh fired again after a publish/delete) (core-1).
    const token = ++refreshTokenRef.current;

    setLoadState('loading');
    setLoadError(null);

    try {
      const nextData = await loadFeedback();

      if (token !== refreshTokenRef.current) {
        return;
      }

      setData(nextData);
      setLoadState('ready');
      setSelectedPostId((current) => {
        if (current && nextData.posts.some((post) => post.payload.id === current)) {
          return current;
        }

        return null;
      });
    } catch (error) {
      if (token !== refreshTokenRef.current) {
        return;
      }

      setLoadState('error');
      setLoadError(getErrorMessage(error, t('error.load')));
    }
  }

  async function refreshAll() {
    const state = await getBridgeState();

    setBridgeState(state);
    await Promise.all([refreshAccount(), refreshFeedback()]);
  }

  useEffect(() => {
    void refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resolve a `?post=<id>` deep link once the feed has loaded: open that item if
  // it exists, then drop the pending id so later refreshes don't hijack the view.
  useEffect(() => {
    if (!pendingPostId || loadState !== 'ready') {
      return;
    }

    if (data.posts.some((post) => post.payload.id === pendingPostId)) {
      setSelectedPostId(pendingPostId);
      setView('detail');
    }

    setPendingPostId(null);
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
    if (filter === 'myApps' && accountContext.writableNames.length === 0) {
      setFilter('all');
    }
  }, [filter, accountContext.writableNames]);

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

  const filterCounts = useMemo(() => {
    const writable = new Set(accountContext.writableNames.map((name) => name.toLowerCase()));
    const counts: Record<FeedFilter, number> = {
      all: data.posts.length,
      completed: 0,
      idea: 0,
      issue: 0,
      myApps: 0,
      open: 0,
      orphan: orphanComments.length,
    };

    for (const post of data.posts) {
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
  }, [data.posts, orphanComments.length, accountContext.writableNames]);

  const filteredPosts = useMemo(() => {
    switch (filter) {
      case 'completed':
        return data.posts.filter((post) => post.payload.status === 'done');
      case 'idea':
      case 'issue':
        return data.posts.filter((post) => post.payload.type === filter);
      case 'open':
        return data.posts.filter((post) => post.payload.status !== 'done');
      case 'myApps': {
        const writable = new Set(accountContext.writableNames.map((name) => name.toLowerCase()));

        return data.posts.filter((post) => post.payload.app && writable.has(post.payload.app.toLowerCase()));
      }
      default:
        return data.posts;
    }
  }, [data.posts, filter, accountContext.writableNames]);

  const selectedPost = data.posts.find((post) => post.payload.id === selectedPostId) ?? null;
  const selectedComments = selectedPost ? commentsByPostId.get(selectedPost.payload.id) ?? [] : [];

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
    setFilter(value);
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

  async function publishAndRefresh(payload: Parameters<typeof publishFeedbackPayload>[1], name = publishName) {
    setBusy(true);

    try {
      if (!name) {
        setLoadError(t('status.noName'));
        return false;
      }

      const isUnlocked = await ensureSelectedAccountUnlocked();

      if (!isUnlocked) {
        return false;
      }

      await publishFeedbackPayload(name, payload);
      await refreshFeedback();
      setSelectedPostId(payload.kind === 'post' ? payload.id : payload.postId);
      return true;
    } catch (error) {
      setLoadError(getErrorMessage(error, t('error.publish')));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleCreatePost(type: FeedbackKind, title: string, body: string, app: string | null) {
    const success = await publishAndRefresh(createPostPayload(type, title, body, canonicalAppName(app)));

    if (success) {
      setView('detail');
    }

    return success;
  }

  async function handleCreateComment(body: string) {
    if (!selectedPost) {
      return false;
    }

    return publishAndRefresh(createCommentPayload(selectedPost.payload.id, body));
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
      setLoadError(buildPostLink(post.payload.id));
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
      await refreshFeedback();
      if (resource.payload.kind === 'post') {
        setSelectedPostId(null);
        setView('list');
      }
    } catch (error) {
      setLoadError(getErrorMessage(error, t('error.delete')));
    } finally {
      setBusy(false);
    }
  }

  const showList = view === 'list' || (view === 'detail' && !selectedPost);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">
            <img alt="" src={helpIconUrl} />
          </span>
          <div>
            <h1>{t('app.title')}</h1>
            <span>{t('label.feedback')}</span>
          </div>
        </div>
        <div className="topbar__actions">
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

      <section className="workspace">
        <aside className="sidebar">
          <CommandButton disabled={busy} icon={<Plus aria-hidden="true" />} onClick={openComposer} variant="primary">
            {t('action.newPost')}
          </CommandButton>

          <div className="account-strip">
            <label>
              <span>{t('field.name')}</span>
              <select
                disabled={busy || accountContext.writableNames.length === 0}
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
                <span className="count-pill">{loadState === 'loading' ? '—' : filterCounts[value]}</span>
              </button>
            ))}
          </nav>

          {accountError ? (
            <div aria-live="polite" className="notice" role="status">
              {accountError}
            </div>
          ) : null}
        </aside>

        <section className="main-panel">
          {loadError ? (
            <div className="notice notice--error" role="alert">
              {loadError}
            </div>
          ) : null}

          {view === 'compose' ? (
            <PostComposer
              appNames={appNames}
              canPublish={canPublish}
              initialApp={composer.app}
              initialType={composer.type ?? undefined}
              onCancel={backToList}
              onSubmit={handleCreatePost}
              publishName={publishName}
              publishing={busy}
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
                      <span>{getDisplayName(selectedPost.ownerName)}</span>
                      <span>{formatRelativeTime(selectedPost.updated)}</span>
                      {selectedPost.payload.updatedAt > selectedPost.payload.createdAt ? <span>{t('label.edited')}</span> : null}
                      {selectedPost.payload.app ? <span className="app-pill">{selectedPost.payload.app}</span> : null}
                    </div>
                  </div>
                  {canPublishResource && canOwnResource(selectedPost, accountContext.writableNames) ? (
                    <div className="item-actions">
                      <IconButton
                        disabled={busy}
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
                        disabled={busy || !canDelete}
                        label={t('action.delete')}
                        onClick={() => void handleDelete(selectedPost)}
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
                      disabled={busy}
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
                      disabled={busy}
                      maxLength={120}
                      onChange={(event) => setPostEditTitle(event.target.value)}
                      value={postEditTitle}
                    />
                    <textarea disabled={busy} onChange={(event) => setPostEditBody(event.target.value)} rows={7} value={postEditBody} />
                    <div className="button-row">
                      <CommandButton
                        disabled={busy || !canPublishResource || !postEditTitle.trim() || !postEditBody.trim()}
                        icon={<Save aria-hidden="true" />}
                        onClick={() => void savePostEdit(selectedPost)}
                        variant="primary"
                      >
                        {t('action.save')}
                      </CommandButton>
                      <CommandButton disabled={busy} icon={<X aria-hidden="true" />} onClick={cancelPostEdit}>
                        {t('action.cancel')}
                      </CommandButton>
                    </div>
                  </div>
                ) : (
                  <p className="post-body">{renderFeedbackText(selectedPost.payload.body)}</p>
                )}
              </article>

              <section className="comments-panel">
                <div className="section-heading">
                  <span className="section-title">{t('label.replies')}</span>
                  <span className="count-pill">{selectedComments.length}</span>
                </div>
                <ReplyComposer canPublish={canPublish} onSubmit={handleCreateComment} publishing={busy} t={t} />
                <div className="comments-list">
                  {selectedComments.length === 0 ? <EmptyState text={t('empty.comments')} /> : null}
                  {selectedComments.map((comment) => (
                    <CommentView
                      canEdit={canPublishResource && canOwnResource(comment, accountContext.writableNames)}
                      comment={comment}
                      editValue={commentEditBody}
                      editing={commentEditId === comment.payload.id}
                      key={comment.identifier}
                      onCancelEdit={() => {
                        setCommentEditId(null);
                        setCommentEditBody('');
                      }}
                      onDelete={() => void handleDelete(comment)}
                      onEditValueChange={setCommentEditBody}
                      onSaveEdit={() => void saveCommentEdit(comment)}
                      onStartEdit={() => startCommentEdit(comment)}
                      saving={busy}
                      t={t}
                    />
                  ))}
                </div>
              </section>
            </div>
          ) : null}

          {showList ? (
            <div className="list-view">
              <div className="list-view__head">
                <h2 className="list-view__title">{getFilterLabel(filter)}</h2>
                <CommandButton disabled={busy} icon={<Plus aria-hidden="true" />} onClick={openComposer} variant="primary">
                  {t('action.newPost')}
                </CommandButton>
              </div>
              <div className="feed-list">
                {loadState === 'loading' ? <LoadingState text={t('label.loading')} /> : null}
                {loadState !== 'loading' && filter !== 'orphan' && filter !== 'myApps' && filteredPosts.length === 0 ? (
                  <EmptyState text={t('empty.posts')} />
                ) : null}
                {loadState !== 'loading' && filter === 'myApps' && filteredPosts.length === 0 ? (
                  <EmptyState text={t('empty.myApps')} />
                ) : null}
                {filter !== 'orphan' && filter !== 'myApps'
                  ? filteredPosts.map((post) => (
                      <FeedItem
                        commentCount={commentsByPostId.get(post.payload.id)?.length ?? 0}
                        key={post.identifier}
                        onSelect={() => openDetail(post.payload.id)}
                        post={post}
                        t={t}
                      />
                    ))
                  : null}
                {filter === 'myApps'
                  ? Array.from(
                      filteredPosts.reduce((map, post) => {
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
                            commentCount={commentsByPostId.get(post.payload.id)?.length ?? 0}
                            key={post.identifier}
                            onSelect={() => openDetail(post.payload.id)}
                            post={post}
                            t={t}
                          />
                        ))}
                      </div>
                    ))
                  : null}
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
    </main>
  );
}
