import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Edit3,
  Lightbulb,
  MessageSquare,
  Plus,
  RefreshCw,
  Reply,
  Save,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { createTranslator } from './i18n';
import { applyDisplaySettings, getDisplaySettingsUpdateFromMessage, getInitialDisplaySettings } from './displaySettings';
import { getBridgeState, hasAction } from './qdnRequest';
import {
  canOwnResource,
  createCommentPayload,
  createPostPayload,
  deleteFeedbackResource,
  loadAccountContext,
  loadFeedback,
  publishFeedbackPayload,
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
type FeedFilter = 'all' | 'idea' | 'issue' | 'orphan';

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
  canPublish,
  onSubmit,
  publishName,
  publishing,
  t,
}: {
  canPublish: boolean;
  onSubmit: (type: FeedbackKind, title: string, body: string) => Promise<boolean>;
  publishName: string;
  publishing: boolean;
  t: ReturnType<typeof createTranslator>;
}) {
  const [type, setType] = useState<FeedbackKind>('issue');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (!title.trim() || !body.trim()) {
      return;
    }

    const success = await onSubmit(type, title, body);

    if (success) {
      setTitle('');
      setBody('');
      setType('issue');
    }
  }

  return (
    <form className="composer" onSubmit={handleSubmit}>
      <div className="composer__header">
        <span className="section-title">{t('action.new')}</span>
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
      </div>
      <label>
        <span>{t('field.title')}</span>
        <input
          autoComplete="off"
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
          rows={5}
          value={body}
        />
      </label>
      <div className="composer__footer">
        <span className="publish-name">{publishName || t('status.noName')}</span>
        <CommandButton
          disabled={!canPublish || publishing || !title.trim() || !body.trim()}
          icon={<Send aria-hidden="true" />}
          type="submit"
          variant="primary"
        >
          {publishing ? t('label.loading') : t('action.post')}
        </CommandButton>
      </div>
    </form>
  );
}

function FeedItem({
  active,
  commentCount,
  onSelect,
  post,
  t,
}: {
  active: boolean;
  commentCount: number;
  onSelect: () => void;
  post: FeedbackResource<FeedbackPostPayload>;
  t: ReturnType<typeof createTranslator>;
}) {
  const edited = post.payload.updatedAt > post.payload.createdAt;

  return (
    <button className={`feed-item ${active ? 'is-active' : ''}`} onClick={onSelect} type="button">
      <span className={`kind-mark kind-mark--${post.payload.type}`}>
        <IconForKind type={post.payload.type} />
      </span>
      <span className="feed-item__body">
        <span className="feed-item__title">{post.payload.title}</span>
        <span className="feed-item__meta">
          {getDisplayName(post.ownerName)} · {formatRelativeTime(post.updated)}
          {edited ? ` · ${t('label.edited')}` : ''}
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
        <p>{comment.payload.body}</p>
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
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [publishName, setPublishName] = useState('');
  const [busy, setBusy] = useState(false);
  const [postEditId, setPostEditId] = useState<string | null>(null);
  const [postEditType, setPostEditType] = useState<FeedbackKind>('issue');
  const [postEditTitle, setPostEditTitle] = useState('');
  const [postEditBody, setPostEditBody] = useState('');
  const [commentEditId, setCommentEditId] = useState<string | null>(null);
  const [commentEditBody, setCommentEditBody] = useState('');

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

  useEffect(() => {
    applyDisplaySettings(displaySettings);
  }, [displaySettings]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
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
    setLoadState('loading');
    setLoadError(null);

    try {
      const nextData = await loadFeedback();

      setData(nextData);
      setLoadState('ready');
      setSelectedPostId((current) => {
        if (current && nextData.posts.some((post) => post.payload.id === current)) {
          return current;
        }

        return nextData.posts[0]?.payload.id ?? null;
      });
    } catch (error) {
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
  const filteredPosts = useMemo(() => {
    if (filter === 'idea' || filter === 'issue') {
      return data.posts.filter((post) => post.payload.type === filter);
    }

    return data.posts;
  }, [data.posts, filter]);
  const selectedPost = data.posts.find((post) => post.payload.id === selectedPostId) ?? null;
  const selectedComments = selectedPost ? commentsByPostId.get(selectedPost.payload.id) ?? [] : [];

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

  async function handleCreatePost(type: FeedbackKind, title: string, body: string) {
    return publishAndRefresh(createPostPayload(type, title, body));
  }

  async function handleCreateComment(body: string) {
    if (!selectedPost) {
      return false;
    }

    return publishAndRefresh(createCommentPayload(selectedPost.payload.id, body));
  }

  function startPostEdit(post: FeedbackResource<FeedbackPostPayload>) {
    setPostEditId(post.payload.id);
    setPostEditType(post.payload.type);
    setPostEditTitle(post.payload.title);
    setPostEditBody(post.payload.body);
  }

  function cancelPostEdit() {
    setPostEditId(null);
    setPostEditTitle('');
    setPostEditBody('');
  }

  async function savePostEdit(post: FeedbackResource<FeedbackPostPayload>) {
    if (!postEditTitle.trim() || !postEditBody.trim()) {
      return;
    }

    const success = await publishAndRefresh(
      updatePostPayload(post.payload, {
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
      }
    } catch (error) {
      setLoadError(getErrorMessage(error, t('error.delete')));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand__mark">
            <MessageSquare aria-hidden="true" />
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

          <PostComposer canPublish={canPublish} onSubmit={handleCreatePost} publishName={publishName} publishing={busy} t={t} />

          <div className="feed-toolbar">
            <span className="section-title">{t('label.feedback')}</span>
            <div className="segmented segmented--compact" role="group">
              {(['all', 'issue', 'idea', 'orphan'] as const).map((value) => (
                <button
                  aria-pressed={filter === value}
                  className={filter === value ? 'is-selected' : ''}
                  key={value}
                  onClick={() => setFilter(value)}
                  type="button"
                >
                  {value === 'all'
                    ? t('filter.all')
                    : value === 'issue'
                      ? t('filter.issue')
                      : value === 'idea'
                        ? t('filter.idea')
                        : t('filter.orphan')}
                </button>
              ))}
            </div>
          </div>

          {loadError ? <div className="notice notice--error">{loadError}</div> : null}
          {accountError ? <div className="notice">{accountError}</div> : null}

          <div className="feed-list">
            {loadState === 'loading' ? <EmptyState text={t('label.loading')} /> : null}
            {loadState !== 'loading' && filter !== 'orphan' && filteredPosts.length === 0 ? (
              <EmptyState text={t('empty.posts')} />
            ) : null}
            {filter !== 'orphan'
              ? filteredPosts.map((post) => (
                  <FeedItem
                    active={post.payload.id === selectedPostId}
                    commentCount={commentsByPostId.get(post.payload.id)?.length ?? 0}
                    key={post.identifier}
                    onSelect={() => setSelectedPostId(post.payload.id)}
                    post={post}
                    t={t}
                  />
                ))
              : null}
            {filter === 'orphan' && orphanComments.length === 0 ? <EmptyState text={t('empty.orphans')} /> : null}
            {filter === 'orphan'
              ? orphanComments.map((comment) => (
                  <button className="feed-item feed-item--orphan" key={comment.identifier} type="button">
                    <span className="kind-mark kind-mark--orphan">
                      <MessageSquare aria-hidden="true" />
                    </span>
                    <span className="feed-item__body">
                      <span className="feed-item__title">{t('label.deletedPost')}</span>
                      <span className="feed-item__meta">
                        {getDisplayName(comment.ownerName)} · {formatRelativeTime(comment.updated)}
                      </span>
                    </span>
                  </button>
                ))
              : null}
          </div>
        </aside>

        <section className="detail">
          {!selectedPost ? (
            <EmptyState text={filter === 'orphan' ? t('empty.orphans') : t('label.select')} />
          ) : (
            <>
              <article className="post-detail">
                <div className="post-detail__header">
                  <span className={`kind-mark kind-mark--${selectedPost.payload.type}`}>
                    <IconForKind type={selectedPost.payload.type} />
                  </span>
                  <div>
                    <span className="post-detail__kind">
                      {selectedPost.payload.type === 'issue' ? t('kind.issue') : t('kind.idea')}
                    </span>
                    <h2>{selectedPost.payload.title}</h2>
                    <div className="post-detail__meta">
                      <span>{getDisplayName(selectedPost.ownerName)}</span>
                      <span>{formatRelativeTime(selectedPost.updated)}</span>
                      {selectedPost.payload.updatedAt > selectedPost.payload.createdAt ? <span>{t('label.edited')}</span> : null}
                    </div>
                  </div>
                  {canPublishResource && canOwnResource(selectedPost, accountContext.writableNames) ? (
                    <div className="item-actions">
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
                  <p className="post-body">{selectedPost.payload.body}</p>
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
            </>
          )}
        </section>
      </section>

      <div aria-hidden="true" className="app-watermark">
        <CheckCircle2 />
      </div>
    </main>
  );
}
