import { Link } from 'react-router-dom';
import { ISSUE_PRIORITY_LABELS, ISSUE_STATUS_LABELS, isOpenIssue, prettyDate, todayKey } from '@siteflow/shared';
import { Empty } from './States';

export const PriorityPill = ({ p }) => <span className={`pill prio-${p}`}>{ISSUE_PRIORITY_LABELS[p] || p}</span>;
export const IssueStatusPill = ({ s }) => <span className={`pill st-${s}`}>{ISSUE_STATUS_LABELS[s] || s}</span>;

export default function IssueList({ issues, showSite, empty = 'No issues.' }) {
  if (!issues.length) return <Empty title={empty} />;
  const today = todayKey();
  return (
    <ul className="list">
      {issues.map((i) => {
        const overdue = isOpenIssue(i.status) && i.dueDate && i.dueDate < today;
        return (
          <li key={`${i.siteId}/${i.id}`} className={i.priority === 'critical' && isOpenIssue(i.status) ? 'critical' : ''}>
            <Link className="it" to={`/issues/${i.siteId}/${i.id}`}>
              <span className="grow">
                <b>{i.title}</b>
                <small>
                  {showSite ? `${i.siteName}. ` : ''}{i.category}{i.location ? `, ${i.location}` : ''}. Reported {prettyDate(i.date)} by {i.createdByName}.
                  {' '}{i.assignedToName ? `With ${i.assignedToName}.` : isOpenIssue(i.status) ? 'Not assigned.' : ''}
                  {i.commentCount ? ` ${i.commentCount} comment${i.commentCount === 1 ? '' : 's'}.` : ''}
                </small>
              </span>
              <span className="tags">
                <PriorityPill p={i.priority} />
                <IssueStatusPill s={i.status} />
                {overdue && <span className="pill bad">Overdue</span>}
                {!!i.photos?.length && <span className="pill">{i.photos.length} photo{i.photos.length === 1 ? '' : 's'}</span>}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
