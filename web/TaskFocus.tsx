'use client';
import {useEffect, useId, useRef} from 'react';
import type {Task} from './model';
import './task-focus.css';

export type TaskFocusProps = {
  task: Task;
  projectName?: string;
  disabled?: boolean;
  status?: string;
  onBack: () => void;
  onEdit: () => void;
  onComplete: () => void;
};

/** A read-only focus surface; mutations stay in Daybook's existing save workflow. */
export default function TaskFocus({task, projectName, disabled = false, status = '', onBack, onEdit, onComplete}: TaskFocusProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const titleId = useId();

  useEffect(() => {
    const surface = dialog.current;
    const origin = document.activeElement;
    if (!surface) return;
    surface.showModal();
    heading.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      surface.close();
      document.body.style.overflow = previousOverflow;
      if (origin instanceof HTMLElement && origin.isConnected) {
        origin.focus();
      } else {
        // A completed task can disappear from the originating list.
        const fallback = document.querySelector<HTMLElement>('main h1, main');
        if (fallback) {
          const oldTabIndex = fallback.getAttribute('tabindex');
          fallback.setAttribute('tabindex', '-1');
          fallback.focus();
          if (oldTabIndex === null) fallback.removeAttribute('tabindex');
          else fallback.setAttribute('tabindex', oldTabIndex);
        }
      }
    };
  }, []);

  return <dialog ref={dialog} className="task-focus" aria-labelledby={titleId} onCancel={event => {event.preventDefault(); onBack();}}>
    <div className="task-focus-inner">
      <header className="task-focus-toolbar">
        <button type="button" onClick={onBack}>← Back</button>
        <span className="meta">Single-task focus</span>
      </header>
      <article className="task-focus-content">
        <p className="meta">{projectName || 'Inbox'}{task.priority ? ' · Priority' : ''}</p>
        <h1 ref={heading} tabIndex={-1} id={titleId}>{task.title}</h1>
        <dl className="task-focus-details">
          <div><dt>Duration</dt><dd>{task.minutes} min</dd></div>
          <div><dt>Planned</dt><dd>{task.day || 'Unscheduled'}{task.time ? ` · ${task.time}` : ''}</dd></div>
          {task.deadline && <div><dt>Due</dt><dd>{task.deadline}</dd></div>}
          {task.repeat !== 'none' && <div><dt>Repeats</dt><dd>{task.repeat}</dd></div>}
        </dl>
        <p className="task-focus-state">{task.done ? 'Completed. A little more room in your day.' : 'Just this task, for now.'}</p>
        <div className="task-focus-actions">
          <button type="button" className="primary" disabled={disabled} onClick={onComplete}>{task.done ? 'Mark incomplete' : 'Mark complete'}</button>
          <button type="button" disabled={disabled} onClick={onEdit}>Edit task</button>
        </div>
        <p className="task-focus-status meta" role="status" aria-live="polite">{status}</p>
      </article>
      <footer className="meta task-focus-footer">Back or Escape returns to your plan.</footer>
    </div>
  </dialog>;
}
