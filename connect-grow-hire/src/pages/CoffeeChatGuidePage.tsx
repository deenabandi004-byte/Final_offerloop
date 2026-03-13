import { useParams, Navigate } from 'react-router-dom';
import { companies } from '@/data/companies';
import CoffeeChatGuide from './templates/CoffeeChatGuide';

const CoffeeChatGuidePage = () => {
  const { slug } = useParams<{ slug: string }>();
  const company = companies.find((c) => c.slug === slug);

  if (!company) {
    return <Navigate to="/" replace />;
  }

  return <CoffeeChatGuide company={company} />;
};

export default CoffeeChatGuidePage;
