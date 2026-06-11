import { useParams, Navigate } from 'react-router-dom';
import { findEmailData } from '@/data/find-email-data';
import FindEmailPage from './templates/FindEmailPage';

const FindEmailPageWrapper = () => {
  const { slug } = useParams<{ slug: string }>();

  const data = findEmailData.find(d => d.slug === slug);

  if (!data) return <Navigate to="/" replace />;

  return <FindEmailPage data={data} />;
};

export default FindEmailPageWrapper;
