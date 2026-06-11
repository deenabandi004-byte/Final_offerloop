import { useParams, Navigate } from 'react-router-dom';
import { targetSchoolsData } from '@/data/target-schools-data';
import TargetSchoolsPage from './templates/TargetSchoolsPage';

const TargetSchoolsPageWrapper = () => {
  const { slug } = useParams<{ slug: string }>();

  const data = targetSchoolsData.find(d => d.slug === slug);

  if (!data) return <Navigate to="/" replace />;

  return <TargetSchoolsPage data={data} />;
};

export default TargetSchoolsPageWrapper;
