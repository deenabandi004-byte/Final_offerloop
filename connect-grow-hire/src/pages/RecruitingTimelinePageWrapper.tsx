import { useParams, Navigate } from 'react-router-dom';
import { recruitingTimelineData } from '@/data/recruiting-timeline-data';
import RecruitingTimelinePage from './templates/RecruitingTimelinePage';

const RecruitingTimelinePageWrapper = () => {
  const { slug } = useParams<{ slug: string }>();

  const data = recruitingTimelineData.find(d => d.slug === slug);

  if (!data) return <Navigate to="/" replace />;

  return <RecruitingTimelinePage data={data} />;
};

export default RecruitingTimelinePageWrapper;
