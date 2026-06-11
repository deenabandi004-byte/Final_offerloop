import { useParams, Navigate } from 'react-router-dom';
import { recruiterData } from '@/data/recruiter-data';
import RecruiterPage from './templates/RecruiterPage';

const RecruiterPageWrapper = () => {
  const { slug } = useParams<{ slug: string }>();

  const data = recruiterData.find(d => d.slug === slug);

  if (!data) return <Navigate to="/" replace />;

  return <RecruiterPage data={data} />;
};

export default RecruiterPageWrapper;
