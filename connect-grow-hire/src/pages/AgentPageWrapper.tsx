import { useParams, Navigate } from 'react-router-dom';
import { automateData } from '@/data/automate-data';
import AgentPage from './templates/AgentPage';

const AgentPageWrapper = () => {
  const { slug } = useParams<{ slug: string }>();

  const data = automateData.find(d => d.slug === slug);

  if (!data) return <Navigate to="/" replace />;

  return <AgentPage data={data} />;
};

export default AgentPageWrapper;
